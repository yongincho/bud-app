/* Bud's voice: hearing, speaking, and Bud's little sounds.
 *
 * Hearing uses the browser's speech recognition. It needs a page that may use the
 * microphone, which a claude.ai preview is not, so there Bud takes typing instead. In Chrome
 * the recognition runs on Google's servers; Safari uses Apple's. "Hey Bud" keeps a
 * recognizer running between requests and wakes on the phrase.
 *
 * Speaking uses the system's voices, ranked so Bud gets the most natural one it can find and
 * tuned per style (higher and quicker reads younger and friendlier), or OpenAI's natural
 * voices when the app runs on your computer with your OpenAI key.
 */
(function (root) {
  'use strict';
  const SR = root.SpeechRecognition || root.webkitSpeechRecognition;

  /* -------------------------------------------------------------- the ear */

  // "Hey Bud", and the ways speech recognizers tend to spell it. "Hey, but…" is everyday
  // speech, so "hey but" only counts when nothing follows it.
  const WAKE = /\b(?:hey|hi|hay|okay|ok)\b[\s,.!]*(?:(?:buddy|bud's|buds|budd|bud|bod|bug|bot)\b[\s,.!?]*|but[\s,.!?]*$)/i;

  class Ear {
    /** h: { onState(mode), onWake(), onInterim(text), onHeard(text, how), onWakeTimeout(), onError(code) } */
    constructor(h) {
      this.h = h;
      this.rec = null;
      this.mode = 'off'; // 'off', 'wake' (waiting for "Hey Bud") or 'turn' (hearing one request)
      this.wakeOn = false; // the "Hey Bud" switch
      this.paused = false; // Bud is busy or talking, or the mic is off
      this.armed = false; // heard "Hey Bud", waiting for the request
      this.blocked = ''; // why the mic is not allowed, once we know
      this.fails = 0;
    }
    get available() {
      return !!SR;
    }
    /** Hear one request now (a tap on Bud). */
    listen() {
      this.paused = false;
      this._switch('turn');
    }
    /** End a request early and use what was heard. */
    finish() {
      if (this.rec && this.mode === 'turn') this.rec.stop();
    }
    setWake(on) {
      this.wakeOn = !!on;
      if (this.wakeOn) {
        this.blocked = '';
        if (!this.paused && this.mode === 'off') this._switch('wake');
      } else if (this.mode === 'wake') this._switch('off');
    }
    /** Stop hearing while Bud works and talks, so it never hears itself. */
    pause() {
      this.paused = true;
      clearTimeout(this.reT);
      if (this.mode === 'wake') this._switch('off');
    }
    resume() {
      this.paused = false;
      if (this.wakeOn && !this.blocked && this.mode === 'off') this._switch('wake');
    }
    _emit(name, ...args) {
      if (this.h[name]) this.h[name](...args);
    }
    _switch(mode) {
      // one recognizer at a time: end the current one, then start the next once the mic is free
      clearTimeout(this.swT);
      clearTimeout(this.reT);
      clearTimeout(this.armT);
      this.armed = false;
      if (this.rec) {
        const old = this.rec;
        this.rec = null;
        old.dead = true;
        try {
          old.abort();
        } catch (e) {
          /* already ended */
        }
        this.mode = 'off';
        this.swT = setTimeout(() => this._start(mode), 250);
      } else this._start(mode);
    }
    _start(mode) {
      this.mode = mode;
      this._emit('onState', mode);
      if (mode === 'off' || !SR) return;
      const rec = new SR();
      this.rec = rec;
      rec.lang = navigator.language || 'en-US';
      rec.interimResults = true;
      rec.continuous = mode === 'wake';
      rec.maxAlternatives = 1;
      let text = '';
      rec.onresult = (e) => {
        if (rec.dead) return;
        this.fails = 0;
        if (mode === 'turn') {
          text = Array.prototype.map.call(e.results, (r) => r[0].transcript).join('');
          this._emit('onInterim', text);
          return;
        }
        // waiting for "Hey Bud"; what follows it, in the same breath or the next, is the request
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          const said = r[0].transcript;
          const m = WAKE.exec(said);
          if (!this.armed) {
            if (!m) continue;
            this.armed = true;
            this.armedAt = i;
            this._emit('onWake');
          }
          if (i < this.armedAt) continue;
          const req = (i === this.armedAt && m ? said.slice(m.index + m[0].length) : said).trim();
          this._armTimer();
          if (req) this._emit('onInterim', req);
          if (r.isFinal && req) {
            clearTimeout(this.armT);
            this.armed = false;
            this._emit('onHeard', req, 'wake');
            return;
          }
        }
      };
      rec.onerror = (e) => {
        if (rec.dead) return;
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') {
          this.blocked = e.error;
          this._emit('onError', e.error);
        }
      };
      rec.onend = () => {
        if (rec.dead || this.rec !== rec) return;
        this.rec = null;
        this.mode = 'off';
        if (mode === 'turn') {
          this._emit('onState', 'off');
          this._emit('onHeard', text.trim(), 'tap');
          return;
        }
        // listening for "Hey Bud" stops by itself now and then (silence, network): start it again
        if (this.wakeOn && !this.paused && !this.blocked) {
          this.fails = Math.min(this.fails + 1, 8);
          this.reT = setTimeout(() => {
            if (this.wakeOn && !this.paused && this.mode === 'off') this._start('wake');
          }, this.fails > 3 ? 2500 : 250);
        } else this._emit('onState', 'off');
      };
      try {
        rec.start();
      } catch (e) {
        this.rec = null;
        this.mode = 'off';
        this._emit('onError', 'start');
      }
    }
    _armTimer() {
      clearTimeout(this.armT);
      this.armT = setTimeout(() => {
        if (!this.armed) return;
        this.armed = false;
        this._emit('onWakeTimeout');
      }, 7000);
    }
  }

  /* ------------------------------------------------------------ the voice */

  // Styles: how Bud sounds. System voices get pitch and pace; OpenAI voices get a direction.
  const STYLES = {
    bright: { label: 'Bright', want: 'f', pitch: 1.15, rate: 1.05, openai: 'coral', how: 'Bright, warm and upbeat, like a cheerful friend who is happy to help. Natural and quick, never stiff or formal.' },
    buddy: { label: 'Buddy', want: 'm', pitch: 1.06, rate: 1.04, openai: 'ash', how: 'Warm, easygoing and friendly, like a helpful buddy. Relaxed and kind, at a natural pace.' },
    tiny: { label: 'Tiny', want: 'x', pitch: 1.45, rate: 1.08, openai: 'nova', how: 'Small, playful and sweet, like a cheerful little robot friend. Light, quick and a little excited.' },
  };
  // Voices that are jokes or sound like 1990s computers
  const NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Pipe Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Fred|Junior|Kathy|Ralph|Princess|Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley|Deranged|Hysterical)\b/i;
  const FEMALE = /\b(Ava|Zoe|Allison|Susan|Samantha|Karen|Moira|Tessa|Fiona|Veena|Joelle|Noelle|Nicky|Serena|Kate|Victoria|Aria|Jenny|Michelle|Emma|Ana|Sonia|Libby|Natasha|Clara|Catherine|Zira|Hazel|Joanna|Salli|Kendra|Kimberly|Ivy|Amy|Female)\b/i;
  const MALE = /\b(Evan|Nathan|Tom|Aaron|Alex|Daniel|Oliver|Arthur|Rishi|Gordon|Guy|Andrew|Brian|Christopher|Eric|Roger|Steffan|Ryan|Thomas|William|David|Mark|George|James|Matthew|Justin|Joey|Kevin|Stephen|Male)\b/i;
  const gender = (v) => (/^Google US English$/i.test(v.name) || FEMALE.test(v.name) ? 'f' : MALE.test(v.name) ? 'm' : 'x');

  function rank(v, want) {
    const n = v.name;
    let q = 0;
    if (/premium/i.test(n)) q += 50;
    else if (/enhanced/i.test(n)) q += 40;
    if (/natural|neural/i.test(n)) q += 48; // Edge's natural voices
    if (/^Google\b/i.test(n)) q += 30;
    if (/^(Samantha|Ava|Zoe|Evan|Nathan|Allison|Susan|Tom|Aaron|Nicky|Joelle|Noelle)\b/i.test(n)) q += 8;
    if (/^en[-_]US/i.test(v.lang)) q += 6;
    else if (/^en/i.test(v.lang)) q += 3;
    if (NOVELTY.test(n)) q -= 200;
    const g = gender(v);
    if (want === 'f' || want === 'm') q += g === want ? 25 : g === 'x' ? 0 : -25;
    if (want === 'x' && /\bAna\b/.test(n)) q += 30; // Edge's young voice suits Tiny
    return q;
  }
  const english = () => (root.speechSynthesis ? root.speechSynthesis.getVoices() : []).filter((v) => /^en/i.test(v.lang));
  function pick(style, uri) {
    const all = english();
    const chosen = uri && all.find((v) => v.voiceURI === uri);
    if (chosen) return chosen;
    const want = (STYLES[style] || STYLES.bright).want;
    return all.slice().sort((a, b) => rank(b, want) - rank(a, want))[0] || null;
  }

  /** Words as they should be said: no emoji or markup, times read as times. */
  function sayable(text) {
    return String(text || '')
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
      .replace(/[*_`#>~]/g, '')
      .replace(/\b(\d{1,2})(:\d{2})?\s?(am|pm)\b/gi, (m, h, mm, ap) => `${h}${mm || ''} ${ap.toUpperCase()}`)
      .replace(/\s&\s/g, ' and ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const Voice = {
    STYLES,
    /** The English voices this browser has, best first for the style, without the joke voices. */
    list(style) {
      const want = (STYLES[style] || STYLES.bright).want;
      return english()
        .filter((v) => !NOVELTY.test(v.name))
        .sort((a, b) => rank(b, want) - rank(a, want));
    },
    pick,
    /** Speak, then resolve. opts: { style, voice, engine ('system' or 'openai'), key, onFallback(error) } */
    say(text, opts) {
      opts = opts || {};
      text = sayable(text);
      if (!text) return Promise.resolve();
      // each reading replaces the one before; one still downloading must never play late
      const gen = (this.gen = (this.gen || 0) + 1);
      if (this.audio) this.audio.pause();
      if (opts.engine === 'openai' && opts.key)
        return this._openai(text, opts, gen).catch((e) => {
          if (gen !== this.gen) return;
          if (opts.onFallback) opts.onFallback(e);
          return this._system(text, opts);
        });
      return this._system(text, opts);
    },
    stop() {
      this.gen = (this.gen || 0) + 1;
      try {
        if (root.speechSynthesis) root.speechSynthesis.cancel();
      } catch (e) {
        /* nothing playing */
      }
      if (this.audio) this.audio.pause();
    },
    _system(text, opts) {
      return new Promise((res) => {
        const synth = root.speechSynthesis;
        if (!synth || !root.SpeechSynthesisUtterance) return setTimeout(res, Math.min(2200, 900 + text.length * 50));
        let done = false;
        let guard = 0;
        const fin = () => {
          if (done) return;
          done = true;
          clearTimeout(guard);
          res();
        };
        const st = STYLES[opts.style] || STYLES.bright;
        const u = new SpeechSynthesisUtterance(text);
        const v = pick(opts.style, opts.voice);
        if (v) {
          u.voice = v;
          u.lang = v.lang;
        }
        u.pitch = st.pitch;
        u.rate = st.rate;
        u.onend = fin;
        u.onerror = fin;
        try {
          synth.cancel();
          synth.speak(u);
        } catch (e) {
          fin();
        }
        guard = setTimeout(fin, 2500 + text.length * 90);
      });
    },
    async _openai(text, opts, gen) {
      const st = STYLES[opts.style] || STYLES.bright;
      const r = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.key}` },
        body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: st.openai, input: text, instructions: st.how, response_format: 'mp3' }),
      });
      if (!r.ok) throw new Error(`OpenAI voice answered ${r.status}`);
      const blob = await r.blob();
      if (gen !== this.gen) return; // stopped, or another reading started, while this downloaded
      const url = URL.createObjectURL(blob);
      return new Promise((res, rej) => {
        const a = new Audio(url);
        this.audio = a;
        const fin = () => {
          URL.revokeObjectURL(url);
          res();
        };
        a.onended = fin;
        a.onerror = fin;
        a.play().catch((e) => {
          URL.revokeObjectURL(url);
          rej(e);
        });
      });
    },
  };

  /* ---------------------------------------------------------- Bud's sounds */

  // Short synthesized blips, in the spirit of the film's sound design. No audio files.
  const Sfx = {
    on: true,
    ctx() {
      const C = root.AudioContext || root.webkitAudioContext;
      if (!C) return null;
      if (!this.ac) this.ac = new C();
      if (this.ac.state === 'suspended') this.ac.resume().catch(() => {});
      return this.ac;
    },
    /** Call from a click or tap, so later sounds may play. */
    unlock() {
      this.ctx();
    },
    blip(notes, len, gap, vol) {
      if (!this.on) return;
      const a = this.ctx();
      if (!a) return;
      const asked = performance.now();
      const play = () => {
        if (performance.now() - asked > 400) return; // too late to mean anything
        let t = a.currentTime + 0.02;
        notes.forEach((f) => {
          const o = a.createOscillator();
          const g = a.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(f, t);
          o.frequency.exponentialRampToValueAtTime(f * 1.06, t + len);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
          g.gain.exponentialRampToValueAtTime(0.0001, t + len);
          o.connect(g).connect(a.destination);
          o.start(t);
          o.stop(t + len + 0.03);
          t += len + gap;
        });
      };
      if (a.state === 'running') play();
      else a.resume().then(play, () => {});
    },
    listen() {
      this.blip([660, 990], 0.08, 0.02, 0.1); // up: I'm listening
    },
    heard() {
      this.blip([880, 660], 0.06, 0.015, 0.07); // down: got it
    },
    needs() {
      this.blip([988, 988], 0.07, 0.08, 0.09); // two taps: your turn
    },
    done() {
      this.blip([784, 1047, 1319], 0.07, 0.012, 0.08); // a little chime
    },
  };

  root.BudVoice = { Ear, Voice, Sfx, WAKE, sayable };
})(window);
