/* Bud companion app prototype, plus a Bud emulator.
 *
 * The app talks to Bud through BudLink (link.js) with the same messages a real Bud will
 * get over Bluetooth, and thinks with BudAgent (agent.js) on whichever model is picked.
 * Modes: on a computer the app sits in a phone frame beside the emulator; on a phone the
 * app fills the screen; with #device the page is only the emulator, so another screen
 * (or another phone) can play Bud while this one runs the app.
 */
(function () {
  'use strict';
  const K = window.Bud;
  const U = K.util;
  const A = window.BudAgent;
  const { Link } = window.BudLink;
  const { Ear, Voice, Sfx } = window.BudVoice;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const IN_PREVIEW = !!(window.claude && typeof window.claude.use === 'function');
  const DEVICE_MODE = location.hash === '#device';
  const WIDE = window.matchMedia && window.matchMedia('(min-width: 980px)').matches;

  /* -------------------------------------------------------------- settings */

  const SKEY = 'bud.app.settings.v1';
  const DEFAULTS = {
    provider: IN_PREVIEW ? 'preview' : 'demo', keys: {}, models: {}, speak: true, voice: '', style: 'bright', engine: 'system', sounds: true,
    mic: true, wake: false, flip: true, timeout: 8, look: '', shell: '#F4F1EC',
  };
  const S = (() => {
    let s = null;
    try {
      s = JSON.parse(localStorage.getItem(SKEY));
    } catch (e) {
      s = null;
    }
    s = Object.assign({}, DEFAULTS, s && typeof s === 'object' ? s : {});
    if (!A.PROVIDERS[s.provider] || (s.provider === 'preview' && !IN_PREVIEW)) s.provider = DEFAULTS.provider;
    if (IN_PREVIEW && ['anthropic', 'openai', 'gemini'].includes(s.provider)) s.provider = 'preview';
    return s;
  })();
  const save = () => {
    try {
      localStorage.setItem(SKEY, JSON.stringify(S));
    } catch (e) {
      /* private mode */
    }
  };

  const LABEL = { idle: 'Ready', hello: 'Hello', listening: 'Listening', thinking: 'Thinking', working: 'Working', needsyou: 'Needs you', speaking: 'Speaking', done: 'Done', confused: 'Hmm', privacy: 'Mic off', sleeping: 'Resting', love: 'Love' };
  const TEAL = '#79F7E6';
  const tintOf = (st) => (st === 'idle' || st === 'hello' || st === 'sleeping' ? TEAL : K.TINTS[st] || TEAL);
  const CALM = new Set(['idle', 'done', 'love', 'hello', 'privacy', 'confused']);
  const LOOKS = [{ id: '', label: 'Classic', theme: 'classic' }].concat(K.PACKS.map((p) => ({ id: p.id, label: p.label, theme: p.theme })));
  const SHELLS = [['Cloud', '#F4F1EC'], ['Charcoal', '#2D2D31'], ['Sand', '#E5D4BC'], ['Sage', '#B7C8B1'], ['Blush', '#F0C8C3'], ['Sky', '#BBD2EA'], ['Butter', '#F2DF9C'], ['Clay', '#C7886A']];
  const lookCfg = (pack) => (pack ? { character: 'skins', base: 'eyes', pack } : { character: 'eyes', theme: 'classic', acc: {}, ambient: null });
  const BASE_CFG = { oled: true, glow: true, grid: false, drift: false, shape: { type: 'circle' }, stage: {}, variety: true };

  function toast(text) {
    const t = $('#toast');
    t.textContent = text;
    t.classList.add('on');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove('on'), 2800);
  }

  /* ------------------------------------------------------- the Bud device */

  // What the hardware will do: show states, rest its screen when calm, wake on a tap or a flip.
  class Device {
    constructor(el, link, name) {
      this.el = el;
      this.link = link;
      this.name = name;
      this.scr = new K.Screen(el.querySelector('.bud-screen'), { fps: 60, bloom: true });
      this.scr.set(Object.assign({}, BASE_CFG, lookCfg(''), { state: 'idle' }));
      this.target = 'idle';
      this.timeout = 8;
      this.asleep = false;
      link.on((m) => {
        if (m.type === 'show') this.apply(m);
      });
      // a click is a tap; press and hold (half a second) is a hold
      let holdT = 0;
      let held = false;
      el.addEventListener('pointerdown', () => {
        held = false;
        holdT = setTimeout(() => {
          held = true;
          this.input('hold');
        }, 550);
      });
      const up = () => clearTimeout(holdT);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointerleave', up);
      el.addEventListener('click', () => {
        if (!held) this.input('tap');
      });
      this.arm();
      setTimeout(() => link.emit({ type: 'hello', device: { name, kind: 'emulator' } }), 300);
    }
    apply(m) {
      if (m.look) {
        this.scr.set(lookCfg(m.look.pack));
        this.el.style.setProperty('--shell', m.look.shell || '#F4F1EC');
      }
      if (m.timeout) this.timeout = m.timeout;
      const next = m.state || 'idle';
      const changed = next !== this.target;
      this.target = next;
      if (this.asleep && (changed || !CALM.has(next))) this.wake(next);
      else if (!this.asleep) this.scr.set({ state: next });
      this.arm();
    }
    arm() {
      clearTimeout(this.sleepT);
      if (CALM.has(this.target) && !this.asleep) this.sleepT = setTimeout(() => this.sleep(), this.timeout * 1000);
    }
    sleep() {
      this.asleep = true;
      this.scr.set({ state: 'sleeping' });
      this.offT = setTimeout(() => this.scr.set({ brightness: 0 }), 1600);
    }
    wake(next) {
      clearTimeout(this.offT);
      this.asleep = false;
      this.scr.set({ brightness: 1 });
      this.scr.set({ state: next || this.target });
      this.arm();
    }
    input(kind) {
      if (this.asleep && (kind === 'flip' || kind === 'tap')) {
        // a flip shows hello, then whatever Bud was last doing
        this.wake('hello');
        clearTimeout(this.backT);
        this.backT = setTimeout(() => this.scr.set({ state: this.target }), 1500);
      }
      if (kind === 'flip') {
        const rig = this.el.closest('.rig');
        if (rig) {
          rig.classList.remove('flipping');
          void rig.offsetWidth;
          rig.classList.add('flipping');
        }
      }
      this.link.emit({ type: 'input', input: kind });
      this.arm();
    }
  }

  /* --------------------------------------------------------------- wiring */

  // A screen is either the app (with the emulator beside it on a computer) or Bud itself.
  // Switching is instant, so nobody has to edit a link: Settings has "Make this screen the Bud".
  const app = $('.app');
  const link = new Link('app');
  const devLink = new Link('device');
  let device = null;
  let mode = '';
  function ensureDevice(name) {
    if (!device) {
      device = new Device($('#rigBud'), devLink, name);
      bindRig(device);
    }
    device.name = name;
    return device;
  }
  const hello = () => devLink.emit({ type: 'hello', device: { name: device.name, kind: 'emulator' } });
  function setMode(next) {
    if (next === mode) return;
    mode = next;
    link.close();
    devLink.close();
    const studio = $('#studio');
    if (mode === 'device') {
      keepAwake(true);
      studio.classList.add('device-mode');
      $('#rig').hidden = false;
      $('#backToApp').hidden = false;
      document.title = 'Bud emulator';
      ensureDevice('Bud on another screen');
      $('#rigSub').textContent = 'This screen is Bud now. Use the app on your other screen.';
      devLink.channel();
      $('#rigLink').textContent = IN_PREVIEW ? 'Connecting to your other screens…' : 'Ready for the app in another tab of this browser.';
      devLink.room().then((t) => {
        if (t) $('#rigLink').textContent = 'Ready. Open this same link on your other device, signed in to the same Claude account.';
        hello();
      });
      hello();
      return;
    }
    keepAwake(false);
    studio.classList.remove('device-mode');
    $('#backToApp').hidden = true;
    document.title = 'Bud';
    if (WIDE) {
      ensureDevice('Virtual Bud');
      link.local(devLink);
      devLink.local(link);
      $('#rig').hidden = false;
      $('#rigSub').textContent = 'What the device on the back of your phone shows';
      drawRig();
    } else {
      $('#rig').hidden = true;
    }
    link.channel();
    link.room();
    $('#rigLink').textContent = 'Want Bud on a second screen? Open this page there and choose Settings, then “Make this screen the Bud”.';
    if (T) show(T.state, T.caption);
  }
  // The emulator is the same phone as the app, seen from the back and drawn in millimeters:
  // Bud is 44 mm across, centered below the camera (where the landing page puts it).
  const BUD_MM = 44;
  const BUD_AT = { x: 35.8, y: 74 };
  function drawRig() {
    const box = $('#rigPhone');
    if (mode !== 'app' || !WIDE || !box.clientWidth) return;
    const base = K.phones.get('iphone');
    if (!base) return;
    const ppm = box.clientWidth / base.w;
    const phone = Object.assign({}, base, { h: box.clientHeight / ppm });
    const pad = 1.6; // phoneSvg's margin for the side buttons, in mm
    const art = $('#rigArt');
    art.innerHTML = K.phoneSvg(phone, 'black');
    Object.assign(art.firstElementChild.style, {
      left: `${-pad * ppm}px`,
      top: `${-pad * ppm}px`,
      width: `${(phone.w + pad * 2) * ppm}px`,
      height: `${(phone.h + pad * 2) * ppm}px`,
    });
    const bud = $('#rigBud');
    bud.style.setProperty('--bx', `${BUD_AT.x * ppm}px`);
    bud.style.setProperty('--by', `${Math.min(BUD_AT.y, phone.h - BUD_MM / 2 - 6) * ppm}px`);
    bud.style.setProperty('--bd', `${BUD_MM * ppm}px`);
  }
  window.addEventListener('resize', drawRig);

  // While a phone plays Bud, keep its screen from turning off (a flip or a tap wakes Bud, not the phone).
  let wakeLock = null;
  async function keepAwake(on) {
    try {
      if (on && !wakeLock && navigator.wakeLock && !document.hidden) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => (wakeLock = null));
      } else if (!on && wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch (e) {
      /* not allowed here: the phone may sleep */
    }
  }
  document.addEventListener('visibilitychange', () => mode === 'device' && !document.hidden && keepAwake(true));

  $('#useAsBud').addEventListener('click', () => setMode('device'));
  $('#backToApp').addEventListener('click', () => setMode('app'));
  if (IN_PREVIEW) $('#emuLink').hidden = true;
  let T = null;

  const mirror = new K.Screen($('#appBud .bud-screen'), { fps: 60, bloom: true });
  mirror.set(Object.assign({}, BASE_CFG, lookCfg(S.look), { state: S.mic ? 'idle' : 'privacy' }));
  $('#appBud').style.setProperty('--shell', S.shell);

  T = { state: 'idle', caption: '', busy: false, listening: false, pending: null, rec: null, typing: false, ctrl: null };

  function show(state, caption, progress) {
    T.state = state;
    T.caption = caption || '';
    mirror.set({ state });
    const led = $('#status .led');
    led.style.setProperty('--c', tintOf(state));
    $('#statusText').textContent = LABEL[state] || state;
    $('#statusSub').textContent = caption || (state === 'idle' ? idleHint() : state === 'privacy' ? 'Not listening' : '');
    link.emit({ type: 'show', state, caption: caption || '', progress: progress || 0, look: { pack: S.look, shell: S.shell }, mic: S.mic, timeout: S.timeout });
  }
  const calm = () => show(S.mic ? 'idle' : 'privacy');
  const idleHint = () => (ear.mode === 'wake' ? 'Say “Hey Bud”, or tap Bud' : 'Tap Bud to talk');

  link.on((m) => {
    if (m.type === 'input') input(m.input);
    if (m.type === 'hello') {
      if (m.device && m.device.kind === 'emulator' && m.device.name !== 'Virtual Bud') {
        $('#deviceText').textContent = 'Bud connected';
        $('#setDevice').textContent = m.device.name;
        toast(`${m.device.name} connected`);
      }
      show(T.state, T.caption);
    }
  });

  function input(kind) {
    if (kind === 'tap') {
      if (T.pending) return T.pending(true);
      if (T.listening) return stopListening();
      if (T.busy) return;
      return startTurn();
    }
    if (kind === 'hold') {
      if (T.pending) return T.pending(false);
      return setMic(!S.mic);
    }
    if (kind === 'flip' && S.flip) toast('Flipped. Bud is awake.');
  }

  /* -------------------------------------------------------------- talking */

  // Voice in needs a page that may use the mic. A claude.ai preview may not, so Bud takes typing there.
  const canHear = () => ear.available && !IN_PREVIEW && !ear.blocked;
  let touched = false; // has the visitor tapped or typed yet (some browsers open the mic only after that)
  const ear = new Ear({
    onState(mode) {
      T.listening = mode === 'turn';
      $('#micBtn').classList.toggle('on', mode === 'turn');
      if (T.state === 'idle') show('idle');
    },
    onWake() {
      // "Hey Bud": wake up and listen for the request
      Sfx.listen();
      $('#say').value = '';
      go('home');
      show('listening', 'Listening');
    },
    onInterim(text) {
      $('#say').value = text;
    },
    onHeard(text, how) {
      if (text) {
        Sfx.heard();
        submit(text);
      } else if (how === 'tap') {
        if (ear.blocked) listenTyping();
        else {
          calm();
          ear.resume();
        }
      }
    },
    onWakeTimeout() {
      $('#say').value = '';
      if (T.state === 'listening' && !T.busy) calm();
    },
    onError(code) {
      if (!touched && code === 'not-allowed') return; // some browsers open the mic only after a tap: try again then
      if (code === 'not-allowed' || code === 'service-not-allowed') toast('Bud is not allowed to use the mic here. Allow it in the browser, or type instead.');
      else if (code === 'audio-capture') toast('No microphone found. Type instead.');
      if (S.wake) {
        S.wake = false;
        save();
        paintListening();
      }
    },
  });

  function startTurn() {
    if (!S.mic) {
      show('privacy', 'Mic is off');
      toast('The mic is off. Hold Bud, or turn it on in Settings.');
      return;
    }
    go('home');
    Sfx.unlock();
    Sfx.listen();
    if (canHear()) {
      $('#say').value = '';
      show('listening', 'Listening');
      ear.listen();
    } else listenTyping();
  }

  function listenTyping() {
    T.typing = true;
    show('listening', 'Type what you want');
    const box = $('#say');
    box.focus();
    if (!T.typeNote) {
      T.typeNote = true;
      if (IN_PREVIEW) toast('Voice works when the app runs from your computer. Type here for now.');
      else if (!ear.available) toast('This browser has no speech input. Try Chrome or Safari, or type.');
    }
  }
  function stopListening() {
    ear.finish();
  }

  const voiceOpts = () => ({
    style: S.style,
    voice: S.voice,
    engine: S.engine === 'openai' && !IN_PREVIEW ? 'openai' : 'system',
    key: S.keys.openai,
    onFallback: () => {
      if (T.voiceNote) return;
      T.voiceNote = true;
      toast('The OpenAI voice did not answer, so Bud used the system voice.');
    },
  });
  function speak(text) {
    show('speaking', '');
    if (!S.speak) return new Promise((res) => setTimeout(res, Math.min(2200, 900 + text.length * 50)));
    return Voice.say(text, voiceOpts());
  }

  function approve(req) {
    return new Promise((resolve) => {
      const card = addAsk(req, (ok) => finish(ok));
      function finish(ok) {
        if (!T.pending) return;
        T.pending = null;
        card.finish(ok);
        show('working', ok ? 'On it' : 'Okay, not doing that');
        resolve(ok);
      }
      T.pending = finish;
      show('needsyou', req.title);
      Sfx.needs();
      if (S.speak) Voice.say(req.title, voiceOpts());
    });
  }

  function friendly(e) {
    const prov = A.PROVIDERS[S.provider];
    if (e && e.code === 'unavailable') return 'Claude only runs here when this page is open on claude.ai. I switched to the demo brain.';
    if (e && (e.code === 'not_granted' || e.code === 'sampling_disabled')) return 'This page is not allowed to use Claude. Allow it, or pick the demo brain in Agents.';
    if (e && e.code === 'rate_limited') return 'Claude is busy for a moment. Try again shortly.';
    if (prov && prov.keyName && !S.keys[S.provider]) return `Add your ${prov.keyName} in Agents, or pick the demo brain.`;
    return `That did not work: ${(e && e.message) || 'unknown error'}.`;
  }

  async function submit(text) {
    text = String(text || '').trim();
    if (!text || T.busy) return;
    T.busy = true;
    T.typing = false;
    $('#say').value = '';
    addMsg('from-you', text);
    const prov = A.PROVIDERS[S.provider];
    if (prov.keyName && !S.keys[S.provider]) {
      addMsg('from-bud', friendly({}), true);
      show('confused', 'Needs a key');
      setTimeout(calm, 2400);
      T.busy = false;
      return;
    }
    T.ctrl = new AbortController();
    ear.pause();
    try {
      const { reply, wrote } = await A.ask(text, {
        provider: S.provider,
        cfg: { key: S.keys[S.provider], model: S.models[S.provider] },
        signal: T.ctrl.signal,
        onStatus: (st, cap) => {
          show(st, cap || '');
          if (st === 'working' && cap && cap !== 'On it') addAct(cap, st);
        },
        approve,
      });
      addMsg('from-bud', reply);
      await speak(reply);
      if (/\?\s*$/.test(reply)) show('needsyou', 'Your turn');
      else if (wrote) {
        show('done', 'Done');
        Sfx.done();
        setTimeout(() => T.state === 'done' && calm(), 2800);
      } else calm();
    } catch (e) {
      if (e && e.code === 'unavailable') {
        S.provider = 'demo';
        save();
        renderProviders();
      }
      addMsg('from-bud', friendly(e), true);
      show('confused', 'Something went wrong');
      setTimeout(() => T.state === 'confused' && calm(), 2600);
    } finally {
      T.busy = false;
      if (S.mic) ear.resume();
    }
  }

  function setMic(on) {
    S.mic = on;
    save();
    $('#setMic').checked = on;
    if (on) ear.resume();
    else ear.pause();
    show(on ? 'idle' : 'privacy', on ? 'Mic back on' : 'Mic off');
    toast(on ? 'Mic on. Tap Bud to talk.' : 'Mic off. Bud is not listening.');
  }

  /* ------------------------------------------------------------------ feed */

  const feed = $('#feed');
  function scrollFeed() {
    const page = $('#page-home');
    page.scrollTop = page.scrollHeight;
  }
  function addMsg(who, text, err) {
    $('#tryCard').hidden = true;
    const el = document.createElement('div');
    el.className = `msg ${who}${err ? ' err' : ''}`;
    el.textContent = text;
    feed.append(el);
    scrollFeed();
  }
  function addAct(text, st) {
    const el = document.createElement('div');
    el.className = 'act';
    el.innerHTML = '<span class="led"></span>';
    el.querySelector('.led').style.setProperty('--c', tintOf(st));
    el.append(text.replace(/…$/, ''));
    feed.append(el);
    scrollFeed();
  }
  function addAsk(req, decide) {
    const el = document.createElement('div');
    el.className = 'ask';
    el.innerHTML = '<p class="ask-t"><span class="led"></span><span></span></p><p class="ask-d"></p><div class="ask-b"><button type="button" class="no">Not now</button><button type="button" class="yes"></button></div><p class="ask-r" hidden></p>';
    el.querySelector('.led').style.setProperty('--c', tintOf('needsyou'));
    el.querySelector('.ask-t span:last-child').textContent = req.title;
    el.querySelector('.ask-d').textContent = req.detail || '';
    el.querySelector('.yes').textContent = req.verb || 'Approve';
    el.querySelector('.yes').onclick = () => decide(true);
    el.querySelector('.no').onclick = () => decide(false);
    feed.append(el);
    scrollFeed();
    return {
      finish(ok) {
        el.classList.add('done');
        const r = el.querySelector('.ask-r');
        r.hidden = false;
        r.textContent = ok ? 'Approved' : 'Not now';
      },
    };
  }

  /* ------------------------------------------------------------- composer */

  $('#composer').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('#say').value;
    if (T.listening) return stopListening();
    if (T.pending && /^(yes|yep|ok|okay|sure|do it|go ahead)\b/i.test(text.trim())) {
      $('#say').value = '';
      return T.pending(true);
    }
    if (T.pending && /^(no|nope|not now|cancel|stop)\b/i.test(text.trim())) {
      $('#say').value = '';
      return T.pending(false);
    }
    submit(text);
  });
  $('#say').addEventListener('blur', () => {
    if (T.typing && !$('#say').value.trim() && !T.busy) {
      T.typing = false;
      if (T.state === 'listening') calm();
    }
  });
  $('#micBtn').addEventListener('click', () => {
    if (T.listening) return stopListening();
    if (!canHear()) {
      toast(IN_PREVIEW ? 'Voice works when the app runs from your computer. Type here for now.' : 'No speech input in this browser. Type instead.');
      T.typeNote = true;
      return listenTyping();
    }
    startTurn();
  });
  $('#appBud').addEventListener('click', () => {
    Sfx.unlock();
    input('tap');
  });
  const IDEAS = ['Move my 3pm with Sam to tomorrow', 'Book a table for 4 tonight, somewhere quiet', 'Remind me to call Mom at 6', 'Text Alex I’m 10 minutes late', 'What’s on my calendar tomorrow?', 'Add oat milk and eggs to groceries'];
  IDEAS.forEach((t) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t;
    b.onclick = () => submit(t);
    $('#suggest').append(b);
  });

  /* ----------------------------------------------------------------- tabs */

  function go(page) {
    $$('.page').forEach((p) => (p.hidden = p.id !== `page-${page}`));
    $$('.tabbar button').forEach((b) => (b.getAttribute('data-go') === page ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
    app.classList.toggle('not-home', page !== 'home');
  }
  $$('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.getAttribute('data-go'))));

  /* ---------------------------------------------------------------- agents */

  function renderProviders() {
    const list = $('#provList');
    list.innerHTML = '';
    const order = ['preview', 'anthropic', 'openai', 'gemini', 'demo'];
    order.forEach((id) => {
      const p = A.PROVIDERS[id];
      const off = (id === 'preview' && !IN_PREVIEW) || (IN_PREVIEW && p.keyName);
      const el = document.createElement('label');
      el.className = `prov${S.provider === id ? ' on' : ''}${off ? ' off' : ''}`;
      el.innerHTML = `<input type="radio" name="prov" value="${id}"><b></b><small></small>`;
      el.querySelector('b').textContent = p.label;
      el.querySelector('small').textContent = off
        ? id === 'preview'
          ? 'Available when this page is open on claude.ai.'
          : 'Run the app from your computer to use your own key.'
        : p.note || `Your key. Model: ${S.models[id] || p.defaultModel}`;
      const r = el.querySelector('input');
      r.checked = S.provider === id;
      r.disabled = !!off;
      r.onchange = () => {
        S.provider = id;
        save();
        A.reset();
        renderProviders();
      };
      list.append(el);
    });
    const p = A.PROVIDERS[S.provider];
    $('#provConfig').hidden = !p.keyName;
    if (p.keyName) {
      $('#provKeyLabel').textContent = p.keyName;
      $('#provKey').value = S.keys[S.provider] || '';
      $('#provModel').value = S.models[S.provider] || p.defaultModel;
    }
  }
  $('#provKey').addEventListener('change', (e) => {
    S.keys[S.provider] = e.target.value.trim();
    save();
  });
  $('#provModel').addEventListener('change', (e) => {
    S.models[S.provider] = e.target.value.trim();
    save();
    renderProviders();
  });
  renderProviders();

  /* ----------------------------------------------------------------- looks */

  LOOKS.forEach((lk) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'look';
    b.setAttribute('aria-pressed', String(S.look === lk.id));
    b.innerHTML = '<span class="bud"><span class="bud-glass"><span class="bud-screen"></span></span></span><span></span>';
    b.lastChild.textContent = lk.label;
    $('#lookGrid').append(b);
    const scr = new K.Screen(b.querySelector('.bud-screen'), { fps: 24, bloom: false });
    scr.set(Object.assign({}, BASE_CFG, lookCfg(lk.id), { state: 'idle' }));
    b.addEventListener('click', () => {
      S.look = lk.id;
      save();
      $$('.look').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      mirror.set(lookCfg(lk.id));
      show('hello', `${lk.label} look`);
      setTimeout(() => T.state === 'hello' && calm(), 2000);
    });
  });
  SHELLS.forEach(([name, hex]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.title = name;
    b.setAttribute('aria-label', `${name} shell`);
    b.style.setProperty('--s', hex);
    b.setAttribute('aria-pressed', String(S.shell === hex));
    b.addEventListener('click', () => {
      S.shell = hex;
      save();
      $$('.swatch').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      $('#appBud').style.setProperty('--shell', hex);
      show(T.state, T.caption);
    });
    $('#shellList').append(b);
  });

  /* -------------------------------------------------------------- settings */

  const setSpeak = $('#setSpeak');
  setSpeak.checked = S.speak;
  setSpeak.onchange = () => {
    S.speak = setSpeak.checked;
    save();
  };
  $('#setMic').checked = S.mic;
  $('#setMic').onchange = (e) => setMic(e.target.checked);
  $('#setFlip').checked = S.flip;
  $('#setFlip').onchange = (e) => {
    S.flip = e.target.checked;
    save();
  };
  $('#setTimeout').value = String(S.timeout);
  $('#setTimeout').onchange = (e) => {
    S.timeout = +e.target.value;
    save();
    show(T.state, T.caption);
  };
  // Bud's voice: a style (how it sounds), the voice itself (Auto picks the best one here),
  // and OpenAI's natural voices when the app runs on your computer with an OpenAI key.
  Sfx.on = S.sounds;
  Object.keys(Voice.STYLES).forEach((id) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.style = id;
    b.textContent = Voice.STYLES[id].label;
    b.onclick = () => {
      S.style = id;
      S.voice = ''; // let Auto choose the best voice for this style
      save();
      paintVoice();
      sample();
    };
    $('#setStyle').append(b);
  });
  function paintVoice() {
    $$('#setStyle button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.style === S.style)));
    const sel = $('#setVoice');
    const list = Voice.list(S.style);
    const auto = Voice.pick(S.style, '');
    sel.innerHTML = '';
    sel.add(new Option(auto ? `Auto (${auto.name})` : 'Auto', ''));
    list.forEach((v) => sel.add(new Option(v.name, v.voiceURI)));
    sel.value = list.some((v) => v.voiceURI === S.voice) ? S.voice : '';
    const neural = S.engine === 'openai' && !IN_PREVIEW;
    sel.disabled = !list.length || neural;
    $('#setEngine').checked = neural;
    $('#engineRow').hidden = IN_PREVIEW;
    $('#voiceOutNote').textContent = neural
      ? S.keys.openai
        ? 'Bud speaks with OpenAI’s natural voice (AI-generated), using your OpenAI key from Agents.'
        : 'Add your OpenAI key in Agents to use the natural voice. Until then Bud uses the system voice.'
      : 'Bright, Buddy and Tiny tune the best voice your device has. On a Mac, Premium voices sound most natural: System Settings › Accessibility › Spoken Content › System Voice › Manage Voices.';
  }
  function sample() {
    if (!S.speak) return;
    Sfx.unlock();
    Voice.say('Hey, I’m Bud. Tap me anytime and I’ll take care of it.', voiceOpts());
  }
  paintVoice();
  if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', paintVoice);
  $('#setVoice').onchange = (e) => {
    S.voice = e.target.value;
    save();
    sample();
  };
  $('#setEngine').onchange = (e) => {
    S.engine = e.target.checked ? 'openai' : 'system';
    save();
    paintVoice();
    if (e.target.checked && S.keys.openai) sample();
  };
  $('#voiceTest').onclick = () => (S.speak ? sample() : toast('Turn on “Speak replies out loud” first.'));
  const setSounds = $('#setSounds');
  setSounds.checked = S.sounds;
  setSounds.onchange = () => {
    S.sounds = Sfx.on = setSounds.checked;
    save();
    Sfx.unlock();
    Sfx.done();
  };

  // "Hey Bud": the ear keeps listening between requests, only while this page is open
  function paintListening() {
    const row = $('#wakeRow');
    const ok = canHear();
    $('#setWake').checked = S.wake && ok;
    $('#setWake').disabled = !ok;
    row.classList.toggle('off', !ok);
    $('#voiceInNote').textContent = IN_PREVIEW
      ? 'Talking to Bud needs the app running from your computer: claude.ai pages may not use the microphone. Here, tap Bud and type. Bud still talks back.'
      : !ear.available
        ? 'This browser has no speech input. Chrome and Safari have it.'
        : 'With “Hey Bud” on, Bud listens for its name while this page is open, then takes your request. Your browser’s speech service does the hearing (Google’s, in Chrome). Hold Bud to turn the mic off.';
    if (T.state === 'idle') show('idle');
  }
  $('#setWake').onchange = (e) => {
    S.wake = e.target.checked;
    save();
    Sfx.unlock();
    ear.setWake(S.wake);
    if (S.wake) toast(S.mic ? 'Say “Hey Bud”, then what you need.' : 'Turn the mic on to use “Hey Bud”.');
    paintListening();
  };
  paintListening();
  if (!S.mic) ear.pause();
  if (S.wake && canHear()) ear.setWake(true);
  ['pointerdown', 'keydown'].forEach((type) =>
    window.addEventListener(
      type,
      () => {
        if (touched) return;
        touched = true;
        if (S.wake && ear.blocked === 'not-allowed') {
          ear.blocked = '';
          ear.setWake(true);
          paintListening();
        }
      },
      { capture: true }
    )
  );
  // a hidden page stops listening; it picks up again when it comes back
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) ear.pause();
    else if (S.mic && !T.busy) ear.resume();
  });
  $('#resetBtn').addEventListener('click', () => {
    A.World.reset();
    A.reset();
    feed.innerHTML = '';
    calm();
    toast('Demo data reset.');
  });
  $('#pairBtn').addEventListener('click', async () => {
    try {
      const d = await link.bluetooth();
      $('#deviceText').textContent = d.name;
      $('#setDevice').textContent = d.name;
      toast(`${d.name} paired`);
      show(T.state, T.caption);
    } catch (e) {
      toast(e && e.name === 'NotFoundError' ? 'No Bud found nearby. There is no Bud hardware yet.' : (e && e.message) || 'Bluetooth is not available here.');
    }
  });

  if (!WIDE) $('#deviceText').textContent = 'No Bud nearby';
  setMode(DEVICE_MODE ? 'device' : 'app');
  calm();
  go('home');

  /* ------------------------------------------------------------ emulator */

  function bindRig(dev) {
    $('#rigFlip').onclick = () => dev.input('flip');
    $('#rigTap').onclick = () => dev.input('tap');
    $('#rigHold').onclick = () => dev.input('hold');
    document.addEventListener('keydown', (e) => {
      if (e.target && e.target.closest && e.target.closest('input, textarea, select')) return;
      if (e.key === ' ') {
        e.preventDefault();
        dev.input('tap');
      } else if (e.key === 'f' || e.key === 'F') dev.input('flip');
      else if (e.key === 'h' || e.key === 'H') dev.input('hold');
    });
  }

  window.BudApp = { show, submit, input, settings: S, device: () => device };
})();
