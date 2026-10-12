/* Bud's brain: one agent loop, any model.
 *
 * Bud is model-agnostic: the same tools, rules and approval step run on whichever
 * provider is picked. Providers here: Claude inside a claude.ai preview (no key),
 * the Claude, OpenAI and Gemini APIs (your own key, kept in this browser), and an
 * offline demo that needs nothing. External agents (OpenAI Dots, Meta Muse, any MCP
 * client) connect the other way round, by driving Bud through the same "show" and
 * "ask" calls; see docs/software.md.
 *
 * Everything the tools touch is demo data stored in this browser.
 */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------ demo world */

  const STORE_KEY = 'bud.app.world.v1';
  const DAY = 24 * 3600 * 1000;
  const fmtTime = (h, m) => `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  const dayName = (d) => (d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`);

  function freshWorld() {
    return {
      events: [
        { id: 'e1', title: 'Standup', day: 0, h: 9, m: 30, mins: 15, with: ['Team'] },
        { id: 'e2', title: 'Catch-up with Sam', day: 0, h: 15, m: 0, mins: 30, with: ['Sam'] },
        { id: 'e3', title: 'Gym', day: 0, h: 18, m: 30, mins: 60, with: [] },
        { id: 'e4', title: 'Design review', day: 1, h: 9, m: 0, mins: 60, with: ['Henry'] },
        { id: 'e5', title: 'Lunch with Alex', day: 1, h: 13, m: 0, mins: 60, with: ['Alex'] },
        { id: 'e6', title: 'Dentist', day: 1, h: 16, m: 0, mins: 45, with: [] },
      ],
      busy: { Sam: { 1: [[9, 11], [12, 14], [15, 18]] }, Alex: { 0: [[17, 20]], 1: [[13, 14]] } },
      reminders: [],
      lists: { groceries: ['eggs'] },
      sent: [],
      bookings: [],
    };
  }
  const World = {
    data: null,
    load() {
      try {
        this.data = JSON.parse(localStorage.getItem(STORE_KEY)) || freshWorld();
      } catch (e) {
        this.data = freshWorld();
      }
      return this.data;
    },
    save() {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(this.data));
      } catch (e) {
        /* private mode: keep it in memory */
      }
    },
    reset() {
      this.data = freshWorld();
      this.save();
    },
  };
  World.load();

  const dayOf = (v) => {
    const s = String(v == null ? 'today' : v).toLowerCase();
    if (s.includes('tomorrow')) return 1;
    if (s.includes('today') || s === '0') return 0;
    const n = parseInt(s, 10);
    return isFinite(n) ? Math.max(0, Math.min(6, n)) : 0;
  };
  const timeOf = (v) => {
    const s = String(v || '').toLowerCase().trim();
    const m = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (!m) return null;
    let h = +m[1];
    const mm = +(m[2] || 0);
    if (m[3] === 'pm' && h < 12) h += 12;
    if (m[3] === 'am' && h === 12) h = 0;
    if (!m[3] && h >= 1 && h <= 7) h += 12; // "at 2" means 2 PM in a work day
    return { h, m: mm };
  };
  const evText = (e) => `${e.title}, ${dayName(e.day)} at ${fmtTime(e.h, e.m)}`;

  /* ------------------------------------------------------------------ tools */

  // write: true means the user approves first (anything that changes the world).
  const TOOLS = [
    {
      name: 'get_calendar',
      label: 'Checking your calendar',
      description: 'List the user\'s calendar events for a day. Returns events with id, title, time and attendees.',
      schema: { type: 'object', properties: { day: { type: 'string', description: '"today", "tomorrow" or a number of days from today' } }, required: ['day'] },
      run({ day }) {
        const d = dayOf(day);
        const list = World.data.events.filter((e) => e.day === d).sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m));
        return { day: dayName(d), events: list.map((e) => ({ id: e.id, title: e.title, time: fmtTime(e.h, e.m), minutes: e.mins, with: e.with })) };
      },
    },
    {
      name: 'find_free_times',
      label: 'Checking both calendars',
      description: 'Find one-hour times on a day when both the user and another person are free (9 AM to 6 PM). Returns a list of times.',
      schema: { type: 'object', properties: { person: { type: 'string' }, day: { type: 'string' } }, required: ['person', 'day'] },
      run({ person, day }) {
        const d = dayOf(day);
        const who = String(person || '').split(' ')[0].replace(/^\w/, (c) => c.toUpperCase());
        const theirs = ((World.data.busy[who] || {})[d] || []).map(([a, b]) => [a, b]);
        const mine = World.data.events.filter((e) => e.day === d).map((e) => [e.h + e.m / 60, e.h + e.m / 60 + e.mins / 60]);
        const free = [];
        for (let h = 9; h < 18; h++) {
          const clash = [...theirs, ...mine].some(([a, b]) => h < b && h + 1 > a);
          if (!clash) free.push(fmtTime(h, 0));
        }
        return { person: who, day: dayName(d), free: free.slice(0, 4) };
      },
    },
    {
      name: 'move_event',
      label: 'Moving the event',
      write: true,
      description: 'Move a calendar event to a new day and time and send the update to attendees. Needs the event id from get_calendar.',
      schema: { type: 'object', properties: { event_id: { type: 'string' }, day: { type: 'string' }, time: { type: 'string', description: 'like "11:00 AM"' } }, required: ['event_id', 'day', 'time'] },
      ask({ event_id, day, time }) {
        const e = World.data.events.find((x) => x.id === event_id);
        const t = timeOf(time);
        if (!e || !t) return null;
        return { title: 'Move this event?', detail: `${e.title}: ${dayName(e.day)} ${fmtTime(e.h, e.m)} → ${dayName(dayOf(day))} ${fmtTime(t.h, t.m)}`, verb: 'Move it' };
      },
      run({ event_id, day, time }) {
        const e = World.data.events.find((x) => x.id === event_id);
        if (!e) throw new Error('No event with that id. Call get_calendar first.');
        const t = timeOf(time);
        if (!t) throw new Error('Time not understood. Use a time like "11:00 AM".');
        e.day = dayOf(day);
        e.h = t.h;
        e.m = t.m;
        World.save();
        return { moved: evText(e), invites_sent: e.with.length > 0 };
      },
    },
    {
      name: 'create_reminder',
      label: 'Setting a reminder',
      description: 'Create a reminder for the user at a time. Returns the reminder.',
      schema: { type: 'object', properties: { text: { type: 'string' }, time: { type: 'string' } }, required: ['text', 'time'] },
      run({ text, time }) {
        const r = { text: String(text), time: String(time) };
        World.data.reminders.push(r);
        World.save();
        return { created: `${r.text} at ${r.time}` };
      },
    },
    {
      name: 'send_message',
      label: 'Writing the message',
      write: true,
      description: 'Send a text message to one of the user\'s contacts (Sam, Alex, Mom, Henry).',
      schema: { type: 'object', properties: { to: { type: 'string' }, text: { type: 'string' } }, required: ['to', 'text'] },
      ask({ to, text }) {
        return { title: `Send to ${to}?`, detail: `“${text}”`, verb: 'Send' };
      },
      run({ to, text }) {
        World.data.sent.push({ to: String(to), text: String(text) });
        World.save();
        return { sent: true, to: String(to) };
      },
    },
    {
      name: 'add_to_list',
      label: 'Updating your list',
      description: 'Add items to one of the user\'s lists, like groceries. Returns the whole list.',
      schema: { type: 'object', properties: { list: { type: 'string' }, items: { type: 'array', items: { type: 'string' } } }, required: ['list', 'items'] },
      run({ list, items }) {
        const key = String(list || 'groceries').toLowerCase();
        const arr = (World.data.lists[key] = World.data.lists[key] || []);
        (Array.isArray(items) ? items : [items]).forEach((i) => arr.push(String(i)));
        World.save();
        return { list: key, items: arr };
      },
    },
    {
      name: 'find_restaurants',
      label: 'Looking for tables',
      description: 'Find restaurant tables for a party size around a time tonight. Returns options with id, name, time and vibe.',
      schema: { type: 'object', properties: { party_size: { type: 'number' }, time: { type: 'string' }, vibe: { type: 'string' } }, required: ['party_size'] },
      run({ party_size, vibe }) {
        const quiet = /quiet|calm|cozy/i.test(String(vibe || ''));
        const opts = [
          { id: 'r1', name: 'Lumen', time: '7:00 PM', vibe: 'quiet, candlelit' },
          { id: 'r2', name: 'Lumen', time: '8:30 PM', vibe: 'quiet, candlelit' },
          { id: 'r3', name: 'Juniper', time: '7:30 PM', vibe: 'lively' },
        ];
        return { party_size: Number(party_size) || 2, options: quiet ? opts.slice(0, 2) : opts };
      },
    },
    {
      name: 'book_table',
      label: 'Booking the table',
      write: true,
      description: 'Book one of the options from find_restaurants for the party size.',
      schema: { type: 'object', properties: { option_id: { type: 'string' }, party_size: { type: 'number' } }, required: ['option_id', 'party_size'] },
      ask({ option_id, party_size }) {
        const o = { r1: 'Lumen at 7:00 PM', r2: 'Lumen at 8:30 PM', r3: 'Juniper at 7:30 PM' }[option_id] || 'that table';
        return { title: 'Book this table?', detail: `${o}, ${party_size || 2} people, tonight`, verb: 'Book it' };
      },
      run({ option_id, party_size }) {
        World.data.bookings.push({ option_id: String(option_id), party_size: Number(party_size) || 2 });
        World.save();
        return { booked: true, confirmation: 'BUD' + Math.floor(1000 + Math.random() * 9000) };
      },
    },
  ];
  const toolByName = (n) => TOOLS.find((t) => t.name === n);

  const today = () => new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const RULES = () =>
    [
      'You are Bud, a small, friendly AI agent that lives on the back of the user\'s phone. People talk to you by tapping you.',
      `Today is ${today()}. The calendar and contacts are the user's (demo data in this prototype).`,
      'Use the tools to look things up and get things done. For anything that changes something (moving an event, sending a message, booking), call the tool directly: the app asks the user to approve it, so do not ask "should I?" in text first.',
      'When the user has to choose (for example between two times), ask one short question and stop.',
      'Replies are spoken aloud and shown on a tiny screen: one or two short sentences, plain words, no lists, no emoji, no markdown.',
      'Sound warm and upbeat, like a helpful little buddy: casual words and contractions, never stiff or formal.',
    ].join('\n');

  /* ----------------------------------------------------- shared tool runner */

  // ctx: { onStatus(state, caption, progress), approve(request) -> Promise<boolean>, signal }
  async function runTool(name, input, ctx) {
    const tool = toolByName(name);
    if (!tool) throw new Error(`Unknown tool ${name}`);
    input = input && typeof input === 'object' ? input : {};
    if (tool.write) {
      const req = (tool.ask && tool.ask(input)) || { title: 'Go ahead?', detail: name, verb: 'Approve' };
      ctx.onStatus('needsyou', req.title);
      const ok = await ctx.approve(Object.assign({ tool: name }, req));
      if (!ok) return { declined: true, note: 'The user said not now. Do not retry; ask what they would like instead.' };
    }
    ctx.onStatus('working', tool.label + '…');
    await new Promise((r) => setTimeout(r, 650)); // let the working ring show
    const out = tool.run(input);
    if (tool.write) ctx.wrote = true;
    return out;
  }

  /* -------------------------------------------------------------- providers */

  const PROVIDERS = {};

  // Claude inside a claude.ai preview: the viewer's own Claude, no key; tools are page functions.
  PROVIDERS.preview = {
    label: 'Claude (in this preview)',
    note: 'Runs on your own Claude account when the page is open on claude.ai. No key needed.',
    async available() {
      if (!(root.claude && root.claude.use)) return false;
      this.fn = this.fn || (await root.claude.use('sample').catch(() => null));
      return !!this.fn;
    },
    async turn(history, ctx) {
      if (!(await this.available())) throw Object.assign(new Error('Claude is not available in this view.'), { code: 'unavailable' });
      const tools = TOOLS.map((t) => ({
        name: t.name,
        description: t.description + (t.write ? ' The user approves this first.' : ''),
        inputSchema: t.schema,
        execute: (input) => runTool(t.name, input, ctx),
      }));
      const turns = [{ role: 'user', content: RULES() + '\n\nConversation follows.' }].concat(history.slice(-12));
      try {
        const { text } = await this.fn(turns, { tools, modelTier: 'quick', signal: ctx.signal });
        // with tools the text holds every round, separated by blank lines; the last part is the answer
        const parts = String(text).split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
        return parts[parts.length - 1] || String(text).trim();
      } catch (e) {
        throw Object.assign(new Error(e && e.message ? e.message : 'Claude could not answer.'), { code: e && e.code });
      }
    },
  };

  async function postJSON(url, body, headers, signal) {
    const r = await fetch(url, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, headers), body: JSON.stringify(body), signal });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((data.error && (data.error.message || data.error)) || `HTTP ${r.status}`);
    return data;
  }

  PROVIDERS.anthropic = {
    label: 'Claude API',
    keyName: 'Anthropic API key',
    defaultModel: 'claude-sonnet-5-5',
    async turn(history, ctx, cfg) {
      const msgs = history.map((m) => ({ role: m.role, content: m.content }));
      const tools = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema }));
      for (let round = 0; round < 6; round++) {
        const data = await postJSON(
          'https://api.anthropic.com/v1/messages',
          { model: cfg.model || this.defaultModel, max_tokens: 400, system: RULES(), messages: msgs, tools },
          { 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          ctx.signal
        );
        const uses = (data.content || []).filter((b) => b.type === 'tool_use');
        if (!uses.length) return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
        msgs.push({ role: 'assistant', content: data.content });
        const results = [];
        for (const u of uses) {
          let out;
          try {
            out = await runTool(u.name, u.input, ctx);
          } catch (e) {
            out = { error: e.message };
          }
          results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out) });
        }
        msgs.push({ role: 'user', content: results });
        ctx.onStatus('thinking');
      }
      return 'That took more steps than I can handle at once. Can you try a simpler ask?';
    },
  };

  PROVIDERS.openai = {
    label: 'OpenAI API',
    keyName: 'OpenAI API key',
    defaultModel: 'gpt-5',
    async turn(history, ctx, cfg) {
      const msgs = [{ role: 'system', content: RULES() }].concat(history.map((m) => ({ role: m.role, content: m.content })));
      const tools = TOOLS.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.schema } }));
      for (let round = 0; round < 6; round++) {
        const data = await postJSON('https://api.openai.com/v1/chat/completions', { model: cfg.model || this.defaultModel, messages: msgs, tools }, { authorization: `Bearer ${cfg.key}` }, ctx.signal);
        const msg = (data.choices && data.choices[0] && data.choices[0].message) || {};
        const calls = msg.tool_calls || [];
        if (!calls.length) return String(msg.content || '').trim();
        msgs.push(msg);
        for (const c of calls) {
          let out;
          try {
            out = await runTool(c.function.name, JSON.parse(c.function.arguments || '{}'), ctx);
          } catch (e) {
            out = { error: e.message };
          }
          msgs.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(out) });
        }
        ctx.onStatus('thinking');
      }
      return 'That took more steps than I can handle at once. Can you try a simpler ask?';
    },
  };

  PROVIDERS.gemini = {
    label: 'Gemini API',
    keyName: 'Gemini API key',
    defaultModel: 'gemini-2.5-flash',
    async turn(history, ctx, cfg) {
      const contents = history.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
      const tools = [{ functionDeclarations: TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: t.schema })) }];
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model || this.defaultModel)}:generateContent?key=${encodeURIComponent(cfg.key)}`;
      for (let round = 0; round < 6; round++) {
        const data = await postJSON(url, { systemInstruction: { parts: [{ text: RULES() }] }, contents, tools }, {}, ctx.signal);
        const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
        const calls = parts.filter((p) => p.functionCall);
        if (!calls.length) return parts.map((p) => p.text || '').join(' ').trim();
        contents.push({ role: 'model', parts });
        const responses = [];
        for (const p of calls) {
          let out;
          try {
            out = await runTool(p.functionCall.name, p.functionCall.args, ctx);
          } catch (e) {
            out = { error: e.message };
          }
          responses.push({ functionResponse: { name: p.functionCall.name, response: out } });
        }
        contents.push({ role: 'user', parts: responses });
        ctx.onStatus('thinking');
      }
      return 'That took more steps than I can handle at once. Can you try a simpler ask?';
    },
  };

  // Offline demo: understands the example requests, with the same tools and approvals.
  PROVIDERS.demo = {
    label: 'Demo (offline)',
    note: 'Scripted for the example requests, so you can try Bud with no account or key.',
    pending: null,
    async turn(history, ctx) {
      const said = String(history[history.length - 1].content || '');
      const s = said.toLowerCase();
      await new Promise((r) => setTimeout(r, 700));
      const p = this.pending;
      this.pending = null;
      if (p && p.kind === 'pick-time') {
        const t = timeOf(s) || (/(first|earlier|morning)/.test(s) ? timeOf(p.options[0]) : /(second|later|afternoon)/.test(s) ? timeOf(p.options[1]) : null);
        if (!t) {
          this.pending = p;
          return `Sorry, which time? ${p.options.join(' or ')}.`;
        }
        const out = await runTool('move_event', { event_id: p.event, day: 'tomorrow', time: fmtTime(t.h, t.m) }, ctx);
        return out.declined ? 'Okay, I left it where it was.' : `Done. Moved to ${fmtTime(t.h, t.m)} tomorrow, and Sam has the invite.`;
      }
      if (p && p.kind === 'pick-table') {
        const id = /8|later|second/.test(s) ? 'r2' : 'r1';
        const out = await runTool('book_table', { option_id: id, party_size: p.party }, ctx);
        return out.declined ? 'No problem, nothing booked.' : `Booked Lumen at ${id === 'r2' ? '8:30' : '7:00'} for ${p.party}. Enjoy.`;
      }
      if (/(move|push|reschedule).*(sam|3)/.test(s)) {
        await runTool('get_calendar', { day: 'today' }, ctx);
        const free = await runTool('find_free_times', { person: 'Sam', day: 'tomorrow' }, ctx);
        const opts = free.free.slice(0, 2);
        this.pending = { kind: 'pick-time', event: 'e2', options: opts };
        return `Sam is free at ${opts[0].replace(':00', '')} or ${opts[1].replace(':00', '')} tomorrow. Which works?`;
      }
      if (/table|dinner|restaurant|book/.test(s)) {
        const party = +(s.match(/\b(\d+)\b/) || [])[1] || (/four/.test(s) ? 4 : /two/.test(s) ? 2 : 2);
        await runTool('find_restaurants', { party_size: party, vibe: s }, ctx);
        this.pending = { kind: 'pick-table', party };
        return 'Lumen has a quiet table at 7:00 or 8:30. Which one?';
      }
      if (/remind/.test(s)) {
        const when = (said.match(/\bat\s+([\w: ]+?)(?:[.!?]|$)/i) || [])[1] || 'later';
        const what = said.replace(/^.*?remind me to\s*/i, '').replace(/\s+at\s+.*$/i, '').replace(/[.!?]$/, '') || 'that';
        await runTool('create_reminder', { text: what, time: when }, ctx);
        return `Got it! I'll remind you to ${what} at ${when}.`;
      }
      if (/(text|message|tell)\s+(\w+)/.test(s)) {
        const to = said.match(/(?:text|message|tell)\s+(\w+)/i)[1];
        const body = said.replace(/^.*?(?:text|message|tell)\s+\w+\s*(?:that\s+)?/i, '').replace(/[.!?]$/, '') || 'Running late';
        const out = await runTool('send_message', { to: to.replace(/^\w/, (c) => c.toUpperCase()), text: body.replace(/^\w/, (c) => c.toUpperCase()) }, ctx);
        return out.declined ? 'Okay, not sent.' : `Sent to ${to.replace(/^\w/, (c) => c.toUpperCase())}.`;
      }
      if (/(add|put).*(list|groceries)|grocery/.test(s)) {
        const items = said.replace(/^.*?add\s+/i, '').replace(/\s+to\s+.*$/i, '').split(/,|\band\b/).map((x) => x.trim()).filter(Boolean);
        const out = await runTool('add_to_list', { list: 'groceries', items }, ctx);
        return `Added! Your grocery list has ${out.items.length} things now.`;
      }
      if (/calendar|schedule|tomorrow|today/.test(s)) {
        const d = /tomorrow/.test(s) ? 'tomorrow' : 'today';
        const cal = await runTool('get_calendar', { day: d }, ctx);
        if (!cal.events.length) return `Nothing on your calendar ${d}.`;
        const first = cal.events[0];
        return `${cal.events.length} things ${d}, starting with ${first.title} at ${first.time}.`;
      }
      if (/^(hi|hey|hello)\b/.test(s)) return 'Hey! What can I do for you?';
      if (/thank/.test(s)) return 'Anytime!';
      return 'In this demo I can move meetings, book tables, set reminders, send texts and check your calendar. Try one of those.';
    },
  };

  /* -------------------------------------------------------------- the agent */

  const Agent = {
    TOOLS,
    PROVIDERS,
    World,
    history: [],
    /**
     * Run one user turn. ctx: { provider, cfg: {key, model}, onStatus(state, caption, progress),
     * approve(request) -> Promise<boolean>, signal }. Resolves { reply, wrote }.
     */
    async ask(text, ctx) {
      const prov = PROVIDERS[ctx.provider] || PROVIDERS.demo;
      this.history.push({ role: 'user', content: String(text) });
      ctx.wrote = false;
      ctx.onStatus('thinking');
      let reply;
      try {
        reply = await prov.turn(this.history, ctx, ctx.cfg || {});
      } catch (e) {
        this.history.pop();
        throw e;
      }
      reply = String(reply || '').replace(/[*_#`]/g, '').trim() || 'Done.';
      this.history.push({ role: 'assistant', content: reply });
      if (this.history.length > 24) this.history.splice(0, this.history.length - 24);
      return { reply, wrote: ctx.wrote };
    },
    reset() {
      this.history = [];
      PROVIDERS.demo.pending = null;
    },
  };

  root.BudAgent = Agent;
})(window);
