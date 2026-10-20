/* Bud Connect, the app side.
 *
 * Your other AI agents (ChatGPT and its Dots, Claude, any MCP client) reach Bud through a
 * Bud Connect server (connect/ in this repo): they show what they're doing on Bud's face
 * and ask before they act. While Connect is on, this keeps one WebSocket open to the server
 * (with a "ping" now and then, so a link that died quietly gets noticed), hands show and ask
 * messages to the app, and posts your answers back.
 *
 * The app keeps a secret app key. The connector link you give your agents carries a one-way
 * hash of it, so an agent can ask questions but can never answer them itself.
 */
(function (root) {
  'use strict';

  const PING_MS = 25000; // the server's host answers "ping" with "pong" without waking the room
  const QUIET_MS = 60000; // nothing heard for this long: the link is dead, open a new one
  const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;

  const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const newAppKey = () => 'bk_' + b64url(crypto.getRandomValues(new Uint8Array(24)));
  const validAppKey = (k) => typeof k === 'string' && /^bk_[A-Za-z0-9_-]{32}$/.test(k);
  async function connectorKeyFor(appKey) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('bud-connect-v1:' + appKey));
    return 'bc_' + b64url(new Uint8Array(digest)).slice(0, 32);
  }
  // A usable server address (origin plus path, no trailing slash), '' for none, or null when
  // it can't be one. A bare host gets https://, or http:// when it is this computer.
  function cleanServer(url) {
    let s = String(url || '').trim().replace(/\/+$/, '');
    if (!s) return '';
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = (LOCAL.test(s.split(/[/:]/)[0]) ? 'http://' : 'https://') + s;
    try {
      const u = new URL(s);
      if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password || u.search || u.hash) return null;
      return (u.origin + u.pathname).replace(/\/+$/, '');
    } catch (e) {
      return null;
    }
  }
  const parse = (text) => {
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  };

  class Connect {
    // handlers: onState(state), onHello({ face, asks }), onShow(face), onAsk(ask), onSettled({ id, answer })
    constructor(handlers) {
      this.h = handlers || {};
      this.server = '';
      this.key = '';
      this.ws = null;
      this.state = 'off';
      this.wanted = false;
      this.tries = 0;
      this.seen = 0;
      this.retry = 0;
      this.probe = 0;
      this.beat = 0;
    }

    configure({ server, key }) {
      this.server = cleanServer(server);
      this.key = key || '';
      this.tries = 0;
    }

    // Why the current settings can't connect, or '' when they can.
    get problem() {
      if (this.server === null) return 'bad-server';
      if (!this.server || !this.key) return 'needs-server';
      const page = root.location && root.location.protocol;
      if (page === 'https:' && /^http:/.test(this.server) && !LOCAL.test(new URL(this.server).hostname)) return 'needs-https';
      return '';
    }

    async link() {
      if (!this.server || !this.key || !(root.crypto && crypto.subtle)) return '';
      return `${this.server}/mcp/${await connectorKeyFor(this.key)}`;
    }

    start() {
      this.stop(true);
      this.wanted = true;
      const problem = this.problem;
      if (problem) return this.#set(problem);
      if (typeof root.WebSocket !== 'function') return this.#set('unsupported');
      let ws;
      try {
        ws = new WebSocket(`${this.server.replace(/^http/, 'ws')}/bud/${this.key}/socket`);
      } catch (e) {
        return this.#set('bad-server');
      }
      this.ws = ws;
      this.seen = Date.now();
      this.#set(this.tries ? 'retrying' : 'connecting');
      ws.onmessage = (e) => {
        if (this.ws !== ws) return;
        this.seen = Date.now();
        if (e.data === 'pong') return;
        const m = parse(e.data);
        if (!m) return;
        if (m.type === 'hello') {
          this.tries = 0;
          this.#set('live');
          if (this.h.onHello) this.h.onHello(m);
        } else if (m.type === 'show') this.h.onShow && this.h.onShow(m.face);
        else if (m.type === 'ask') this.h.onAsk && this.h.onAsk(m.ask);
        else if (m.type === 'settled') this.h.onSettled && this.h.onSettled(m);
      };
      ws.onclose = () => this.ws === ws && this.#again(); // an error always ends in close
      this.beat = setInterval(() => this.#check(), PING_MS);
    }

    // The page came back (unlocked, switched back to, back online): make sure the link still works.
    // A phone that slept can leave a socket that looks open but is dead, so ask for a pong.
    revive() {
      if (!this.wanted) return;
      const ws = this.ws;
      if (!ws || ws.readyState > 1 || Date.now() - this.seen > PING_MS + 5000) return this.start();
      if (ws.readyState !== 1) return;
      const at = this.seen;
      try {
        ws.send('ping');
      } catch (e) {
        return this.start();
      }
      clearTimeout(this.probe);
      this.probe = setTimeout(() => this.ws === ws && this.seen === at && this.start(), 5000);
    }

    stop(quiet) {
      this.wanted = false;
      clearTimeout(this.retry);
      clearTimeout(this.probe);
      clearInterval(this.beat);
      const ws = this.ws;
      this.ws = null;
      if (ws) {
        ws.onclose = ws.onmessage = null;
        try {
          ws.close();
        } catch (e) {
          /* never opened */
        }
      }
      if (!quiet) this.#set('off');
    }

    // 'ok' when the answer reached the question, 'closed' when the question had already closed
    // (answered elsewhere, expired or withdrawn), 'offline' when the server could not be reached.
    async answer(id, approved) {
      if (!this.server || !this.key) return 'offline';
      try {
        const res = await fetch(`${this.server}/bud/${this.key}/answer`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id, answer: approved ? 'approved' : 'declined' }),
        });
        if (!res.ok) return 'offline';
        const d = await res.json().catch(() => null);
        return d && d.settled ? 'ok' : 'closed';
      } catch (e) {
        return 'offline';
      }
    }

    #check() {
      const ws = this.ws;
      if (!ws) return;
      if (Date.now() - this.seen < QUIET_MS) {
        if (ws.readyState === 1) {
          try {
            ws.send('ping');
          } catch (e) {
            /* close follows */
          }
        }
        return;
      }
      this.#again();
    }

    // Drop the current socket and try again, waiting a little longer each time (up to 30 s).
    #again() {
      const old = this.ws;
      this.ws = null;
      clearInterval(this.beat);
      clearTimeout(this.probe);
      if (old) {
        old.onclose = old.onmessage = null;
        try {
          old.close();
        } catch (e) {
          /* already closed */
        }
      }
      if (!this.wanted) return;
      this.#set('retrying');
      clearTimeout(this.retry);
      const wait = Math.min(30000, 1000 * 2 ** Math.min(this.tries++, 5));
      this.retry = setTimeout(() => this.wanted && !this.ws && this.start(), wait);
    }

    #set(state) {
      if (this.state === state) return;
      this.state = state;
      if (this.h.onState) this.h.onState(state);
    }
  }

  root.BudConnect = { Connect, newAppKey, validAppKey, connectorKeyFor, cleanServer };
})(window);
