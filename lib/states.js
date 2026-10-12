/* The expression states and the shared pose engine.
 *
 * Every state is a seamless loop of `loop` seconds. A pose is a plain object of
 * numbers (eye openness, squash, look direction, effect intensities...). Shared
 * baseline motion lives here; each character then adds its own flavor in
 * character.pose(). Because poses are pure functions of state time, the same
 * code can later export firmware sprite loops frame by frame (Task 3).
 */
(function (K) {
  'use strict';
  const U = K.util;
  const { osc, win, hop, blink, smoothstep } = U;

  // group: how the explorer arranges the buttons. key: keyboard shortcut.
  K.STATES = [
    { id: 'idle', label: 'Idle', group: 'Conversation', key: '1', loop: 6.0, hint: 'Breathing, blinking, quick glances.' },
    { id: 'listening', label: 'Listening', group: 'Conversation', key: '2', loop: 1.6, hint: 'Leans in, eyes wide, turns blue, sound ripples.' },
    { id: 'thinking', label: 'Thinking', group: 'Conversation', key: '3', loop: 2.4, hint: 'Looks up and away, turns orange, ticks over.' },
    { id: 'speaking', label: 'Speaking', group: 'Conversation', key: '4', loop: 2.0, hint: 'Answers out loud: bounces with its voice, turns violet.' },
    { id: 'done', label: 'Done', group: 'Conversation', key: '5', loop: 2.4, hint: 'Happy hop, a burst and a check.' },
    { id: 'working', label: 'Working', group: 'Agent', key: '6', loop: 3.0, hint: 'Reading line by line while a task runs; progress around the edge.' },
    { id: 'needsyou', label: 'Needs you', group: 'Agent', key: '7', loop: 1.6, hint: 'Bounces and pulses the edge for attention.' },
    { id: 'confused', label: 'Confused', group: 'Agent', key: '8', loop: 2.4, hint: 'Did not catch that: head tilt, mismatched eyes, a question mark.' },
    { id: 'recording', label: 'Recording', group: 'Device', key: '9', loop: 2.0, hint: 'Focused, red ring running around the edge.' },
    { id: 'hello', label: 'Hello', group: 'Moments', key: '0', loop: 2.2, hint: 'Pops up with a wink and a burst of sparkles. No words, so it works in any language.' },
    { id: 'love', label: 'Love', group: 'Moments', loop: 2.0, hint: 'Heart eyes and floating hearts, for a thank-you.' },
    { id: 'charging', label: 'Charging', group: 'Device', loop: 3.0, hint: 'Content and relaxed, green bolt.' },
    { id: 'lowbattery', label: 'Low battery', group: 'Device', loop: 3.0, hint: 'Droopy, flickering, battery icon.' },
    { id: 'sleeping', label: 'Sleeping', group: 'Device', loop: 4.0, hint: 'Dimmed, slow breathing, floating Zs.' },
    { id: 'privacy', label: 'Mic off', group: 'Device', loop: 3.0, hint: 'Not listening: eyes lowered, dimmed, mic-off icon.' },
  ];
  K.STATE_GROUPS = ['Conversation', 'Agent', 'Moments', 'Device'];
  const byId = Object.create(null);
  K.STATES.forEach((s) => (byId[s.id] = s));
  K.state = (id) => byId[id] || K.STATES[0];

  // Story: a scripted scenario with captions (also the landing page's storyboard).
  K.STORY = [
    { state: 'hello', dur: 2.4, caption: 'Tap. "Hi, I\'m {name}."' },
    { state: 'listening', dur: 2.8, caption: '"Move my 3pm with Sam to tomorrow."' },
    { state: 'thinking', dur: 1.8, caption: 'Thinking it through.' },
    { state: 'working', dur: 2.8, caption: 'Checking both calendars.' },
    { state: 'needsyou', dur: 2.6, caption: '"Sam is free at 11 or 2. Which one?"' },
    { state: 'listening', dur: 1.8, caption: '"11 is perfect."' },
    { state: 'speaking', dur: 2.4, caption: '"Done. Moved to 11 tomorrow."' },
    { state: 'done', dur: 2.2, caption: 'Invite sent.' },
    { state: 'love', dur: 2.2, caption: '"Thanks, {name}."' },
    { state: 'idle', dur: 2.4, caption: '' },
  ];

  K.DEMOS = {
    core: { label: 'Core loop', steps: [['idle', 2.6], ['listening', 3.0], ['thinking', 2.6], ['speaking', 3.0], ['done', 2.8]] },
    story: { label: 'Story', steps: K.STORY.map((s) => [s.state, s.dur, s.caption]) },
    all: { label: 'All states', steps: K.STATES.map((s) => [s.id, 2.6]) },
    moves: {
      label: 'Transitions',
      steps: [['idle', 2.2], ['hello', 2.2], ['listening', 2.4], ['thinking', 2.6], ['speaking', 2.6], ['done', 2.6], ['working', 2.6], ['done', 2.6], ['recording', 2.4], ['done', 2.6], ['love', 2.2], ['charging', 2.4], ['privacy', 2.4], ['idle', 2.0], ['sleeping', 3.0], ['idle', 2.0], ['needsyou', 2.4], ['lowbattery', 2.6]],
    },
  };

  /* ------------------------------------------------------------------ poses */

  const DEFAULTS = {
    x: 0, y: 0, sx: 1, sy: 1, rot: 0,
    eyeOpen: 1, closed: 0, happy: 0, sleepy: 0, squint: 0, wide: 0, asym: 0,
    eyeL: 1, eyeR: 1, heart: 0, winkL: 0, winkR: 0,
    lookX: 0, lookY: 0, sparkle: 1,
    mouthOpen: 0, mouthCurve: 0.4, mouthX: 0, wobble: 0,
    blush: 0.55, brow: 0, browTilt: 0,
    tintAmt: 0, glow: 0.5, bright: 1, desat: 0,
  };
  const KEYS = Object.keys(DEFAULTS);

  function create(state, tt) {
    const p = Object.assign({}, DEFAULTS);
    p.state = state;
    p.tt = tt;
    p.loopT = 0;
    p.tintKey = null;
    p.tint = null;
    p.ex = {};
    p.fx = {};
    return p;
  }

  /** Quick eye darts with holds in between, like real eyes. pts: [[time, lookX, lookY], ...] */
  function saccade(x, pts) {
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < pts.length; i++) {
      const [t0, tx, ty] = pts[i];
      if (x < t0) break;
      const k = smoothstep(t0, t0 + 0.09, x);
      cx += (tx - cx) * k;
      cy += (ty - cy) * k;
    }
    return [cx, cy];
  }

  /** Shared baseline for a state at state-time tt (seconds since the state started). */
  function base(state, tt) {
    const L = K.state(state).loop;
    const x = ((tt % L) + L) % L;
    const p = create(state, tt);
    p.loopT = x;

    switch (state) {
      case 'idle': {
        const b = osc(tt, L, 2);
        p.sy = 1 + 0.028 * b;
        p.sx = 1 - 0.018 * b;
        p.y = -1.4 * osc(tt, L, 2, 0.15);
        p.eyeOpen = blink(x, [1.3, 4.4, 4.68]);
        const [lx, ly] = saccade(x, [[1.9, -0.55, 0.1], [2.55, -0.62, 0.04], [3.3, 0, 0], [4.95, 0.5, -0.12], [5.6, 0, 0]]);
        p.lookX = lx + 0.025 * osc(tt, L, 11);
        p.lookY = ly + 0.02 * osc(tt, L, 7, 0.3);
        p.mouthCurve = 0.45;
        break;
      }
      case 'speaking': {
        const syll = Math.abs(osc(tt, L, 5));
        const phrase = 0.62 + 0.38 * osc(tt, L, 1, 0.1);
        const v = syll * phrase;
        p.ex.voice = v;
        p.mouthOpen = 0.12 + 0.55 * v;
        p.mouthCurve = 0.3;
        p.sy = 1 + 0.025 * v;
        p.y = -0.9 * v;
        p.wide = 0.12;
        p.lookX = 0.12 * osc(tt, L, 1);
        p.eyeOpen = blink(x, [1.5]);
        p.blush = 0.65;
        p.tintKey = 'speaking';
        p.tintAmt = 1;
        p.glow = 0.85;
        break;
      }
      case 'working': {
        const ph = U.fract(tt / 1);
        const line = Math.floor(U.fract(tt / L) * 3);
        p.lookX = -0.6 + 1.2 * smoothstep(0, 0.78, ph) - 1.2 * smoothstep(0.84, 0.97, ph);
        p.lookY = -0.18 + 0.2 * line;
        p.squint = 0.2;
        p.browTilt = 0.18;
        p.sy = 1 + 0.01 * osc(tt, L, 3);
        p.mouthCurve = 0.05;
        p.tintKey = 'working';
        p.tintAmt = 1;
        p.glow = 0.75;
        p.fx.progress = 1;
        break;
      }
      case 'confused': {
        p.rot = 0.13 + 0.03 * osc(tt, L, 1);
        p.eyeL = 0.8;
        p.eyeR = 1.14;
        p.lookX = 0.42 * osc(tt, L, 1, 0.25);
        p.lookY = -0.15;
        p.mouthCurve = -0.15;
        p.wobble = 0.5;
        p.brow = 0.3;
        p.browTilt = -0.2;
        p.eyeOpen = blink(x, [0.9, 1.15]);
        p.tintKey = 'confused';
        p.tintAmt = 0.9;
        p.glow = 0.6;
        p.fx.question = 1;
        break;
      }
      case 'charging': {
        const b = osc(tt, L, 1);
        p.sleepy = 0.35;
        p.happy = 0.25;
        p.sy = 1 + 0.02 * b;
        p.y = 1 + 0.6 * b;
        p.mouthCurve = 0.6;
        p.blush = 0.5;
        p.bright = 0.92;
        p.tintKey = 'charging';
        p.tintAmt = 0.8;
        p.glow = 0.6;
        p.fx.bolt = 1;
        break;
      }
      case 'privacy': {
        p.sleepy = 0.72;
        p.browTilt = 0.67; // cancels the sleepy droop: flat, calm lids
        p.lookY = 0.55;
        p.lookX = -0.1;
        p.y = 2;
        p.sy = 0.98;
        p.mouthCurve = 0;
        p.bright = 0.62;
        p.desat = 0.5;
        p.glow = 0.2;
        p.tintKey = 'privacy';
        p.tintAmt = 0.7;
        p.fx.micoff = 1;
        break;
      }
      case 'hello': {
        const h = hop(x, 0.0, 0.45);
        const land = hop(x, 0.45, 0.62);
        p.y = -5 * h;
        p.sy = 1 + 0.06 * h - 0.07 * land;
        p.sx = 1 - 0.03 * h + 0.06 * land;
        p.wide = 0.45;
        p.sparkle = 1.5;
        p.blush = 0.9;
        p.mouthOpen = 0.45;
        p.mouthCurve = 1;
        p.winkR = win(x, 0.75, 1.45, 0.12);
        p.rot = 0.06 * win(x, 0.75, 1.45, 0.15);
        p.glow = 0.9;
        p.fx.pop = 1;
        break;
      }
      case 'love': {
        const beat = hop(x, 0.0, 0.18) + 0.7 * hop(x, 0.22, 0.4);
        p.heart = 1;
        p.sy = 1 + 0.05 * beat;
        p.sx = 1 + 0.03 * beat;
        p.y = -0.6 * beat;
        p.blush = 1;
        p.mouthCurve = 0.85;
        p.tintKey = 'love';
        p.tintAmt = 0.9;
        p.glow = 0.9;
        p.fx.hearts = 1;
        break;
      }
      case 'listening': {
        const v = 0.5 + 0.5 * osc(tt, L, 3) * osc(tt, L, 2, 0.25);
        p.ex.voice = v;
        p.wide = 0.3 + 0.12 * v;
        p.sy = 1.03 + 0.03 * v;
        p.sx = 1 - 0.015 * v;
        p.rot = 0.06;
        p.lookX = 0.1;
        p.lookY = -0.12;
        p.mouthOpen = 0.14;
        p.mouthCurve = 0.15;
        p.brow = 0.6;
        p.tintKey = 'listening';
        p.tintAmt = 1;
        p.glow = 0.95;
        p.fx.waves = 1;
        break;
      }
      case 'thinking': {
        p.lookX = 0.62 + 0.08 * osc(tt, L, 1);
        p.lookY = -0.72;
        p.asym = 0.6;
        p.rot = -0.05 + 0.025 * osc(tt, L, 1);
        p.x = 1.2 * osc(tt, L, 1, 0.25);
        p.mouthCurve = -0.05;
        p.mouthX = 2.5;
        p.eyeOpen = blink(x, [1.7]);
        p.brow = 0.35;
        p.browTilt = 0.15;
        p.tintKey = 'thinking';
        p.tintAmt = 1;
        p.glow = 0.8;
        p.fx.dots = 1;
        break;
      }
      case 'done': {
        const h = hop(x, 0.05, 0.6);
        const land = hop(x, 0.6, 0.85);
        p.y = -7 * h;
        p.sy = 1 + 0.07 * h - 0.09 * land;
        p.sx = 1 - 0.04 * h + 0.08 * land;
        p.rot = 0.05 * osc(tt, L, 2) * smoothstep(0.85, 1.2, x);
        p.happy = 1;
        p.mouthOpen = 0.65;
        p.mouthCurve = 1;
        p.blush = 1;
        p.brow = 0.7;
        p.tintKey = 'done';
        p.tintAmt = 1 - 0.15 * smoothstep(0.8, 2.0, x);
        p.glow = 1;
        p.fx.sparkles = 1;
        p.fx.burst = 1;
        p.fx.check = 1;
        break;
      }
      case 'recording': {
        p.squint = 0.22;
        p.browTilt = 0.3;
        p.sy = 1 + 0.012 * osc(tt, L, 1);
        p.mouthCurve = 0.1;
        p.eyeOpen = blink(x, [1.45]);
        p.tintKey = 'recording';
        p.tintAmt = 1;
        p.glow = 0.85;
        p.fx.rec = 1;
        p.fx.ring = 1;
        break;
      }
      case 'sleeping': {
        const b = osc(tt, L, 1);
        p.closed = 1;
        p.sy = 1 + 0.045 * b;
        p.sx = 1 - 0.028 * b;
        p.y = 3 + 1.2 * b;
        p.rot = -0.04;
        p.mouthOpen = 0.18 + 0.1 * (0.5 + 0.5 * b);
        p.mouthCurve = 0;
        p.blush = 0.35;
        p.glow = 0.25;
        p.bright = 0.5;
        p.desat = 0.25;
        p.fx.zzz = 1;
        break;
      }
      case 'lowbattery': {
        const flick = 1 - 0.55 * (win(x, 0.8, 0.95, 0.03) + win(x, 1.05, 1.18, 0.03) + 0.6 * win(x, 2.3, 2.42, 0.03));
        p.sleepy = 0.55;
        p.lookX = -0.15;
        p.lookY = 0.45;
        p.sy = 0.93 + 0.012 * osc(tt, L, 1);
        p.sx = 1.045;
        p.y = 4;
        p.mouthCurve = -0.35;
        p.wobble = 1;
        p.browTilt = -0.8;
        p.eyeOpen = blink(x, [1.9], 0.38);
        p.bright = 0.82 * flick;
        p.desat = 0.45;
        p.glow = 0.3;
        p.tintKey = 'lowbattery';
        p.tintAmt = 0.3;
        p.fx.battery = 1;
        p.fx.sweat = 1;
        break;
      }
      case 'needsyou': {
        const h = hop(x, 0.0, 0.32) + hop(x, 0.36, 0.68);
        const land = hop(x, 0.32, 0.4) + hop(x, 0.68, 0.8);
        p.y = -5 * h;
        p.sy = 1 + 0.06 * h - 0.07 * land;
        p.sx = 1 - 0.03 * h + 0.06 * land;
        p.rot = 0.07 * osc(tt, L, 2);
        p.wide = 0.55;
        p.sparkle = 1.6;
        p.lookY = -0.12;
        p.mouthOpen = 0.32;
        p.mouthCurve = 0.35;
        p.brow = 0.8;
        p.browTilt = -0.6;
        p.blush = 0.85;
        p.tintKey = 'needsyou';
        p.tintAmt = 1;
        p.glow = 1;
        p.fx.bang = 1;
        p.fx.attn = 1;
        break;
      }
      default:
        break;
    }
    return p;
  }

  function mixObj(a, b, k) {
    const o = {};
    for (const key in a) o[key] = key in b ? a[key] + (b[key] - a[key]) * k : a[key] * (1 - k);
    for (const key in b) if (!(key in a)) o[key] = b[key] * k;
    return o;
  }

  /** Blend two poses (k = 0 gives a, 1 gives b). Used for smooth state changes. */
  function blend(a, b, k) {
    if (k >= 1) return b;
    if (k <= 0) return a;
    const o = create(k < 0.5 ? a.state : b.state, k < 0.5 ? a.tt : b.tt);
    o.loopT = k < 0.5 ? a.loopT : b.loopT;
    for (let i = 0; i < KEYS.length; i++) {
      const key = KEYS[i];
      o[key] = a[key] + (b[key] - a[key]) * k;
    }
    o.tintKey = k < 0.5 ? a.tintKey : b.tintKey;
    o.tint = U.mix(a.tint, b.tint, k);
    o.ex = mixObj(a.ex, b.ex, k);
    o.fx = mixObj(a.fx, b.fx, k);
    return o;
  }

  function clone(p) {
    const o = Object.assign({}, p);
    o.ex = Object.assign({}, p.ex);
    o.fx = Object.assign({}, p.fx);
    o.tint = p.tint ? p.tint.slice() : p.tint;
    return o;
  }

  /* ---------------------------------------------------------------- fidgets */

  // Idle variety: short one-shot moves layered on every other idle loop. Each `apply`
  // edits the idle pose at local time u (0..1). For firmware they export as one-shot clips.
  const ease = (u) => U.smoothstep(0, 1, u);
  K.FIDGETS = [
    {
      id: 'blinks',
      label: 'Double blink',
      dur: 1.0,
      apply(p, u) {
        p.eyeOpen = Math.min(p.eyeOpen, blink(u, [0.18, 0.42], 0.16));
      },
    },
    {
      id: 'look',
      label: 'Look around',
      dur: 2.2,
      apply(p, u) {
        const e = win(u, 0.02, 0.98, 0.12);
        const l = Math.sin(u * Math.PI * 2);
        p.lookX = 0.85 * l * e;
        p.lookY = -0.18 * e;
        p.rot += -0.06 * l * e;
      },
    },
    {
      id: 'hop',
      label: 'Little hop',
      dur: 1.2,
      apply(p, u) {
        const ant = hop(u, 0, 0.18);
        const h = hop(u, 0.18, 0.62);
        const land = hop(u, 0.62, 0.82);
        p.y -= 6 * h;
        p.sy *= 1 + 0.07 * h - 0.08 * land - 0.06 * ant;
        p.sx *= 1 - 0.03 * h + 0.07 * land + 0.05 * ant;
        p.happy = Math.max(p.happy, 0.85 * win(u, 0.12, 0.86, 0.1));
        p.blush = Math.max(p.blush, 0.8 * win(u, 0.12, 0.86, 0.1));
      },
    },
    {
      id: 'wiggle',
      label: 'Wiggle',
      dur: 1.4,
      apply(p, u) {
        const e = win(u, 0, 1, 0.2);
        const w = Math.sin(u * Math.PI * 6);
        p.rot += 0.09 * w * e;
        p.x += 1.6 * w * e;
      },
    },
    {
      id: 'yawn',
      label: 'Yawn',
      dur: 2.4,
      apply(p, u) {
        const a = win(u, 0.1, 0.78, 0.18);
        p.eyeOpen = Math.min(p.eyeOpen, 1 - 0.9 * a);
        p.mouthOpen = Math.max(p.mouthOpen, 0.85 * a);
        p.mouthCurve = U.lerp(p.mouthCurve, 0, a);
        p.sy *= 1 + 0.07 * a;
        p.sx *= 1 - 0.035 * a;
        p.y -= 1.5 * a;
        p.rot += 0.04 * a * Math.sin(u * Math.PI);
      },
    },
    {
      id: 'doze',
      label: 'Doze off',
      dur: 2.6,
      apply(p, u) {
        const d = ease(u / 0.72) * (1 - U.smoothstep(0.76, 0.8, u));
        p.sleepy = Math.max(p.sleepy, 0.85 * d);
        p.y += 2.2 * d;
        p.rot += 0.05 * d;
        const startle = hop(u, 0.78, 0.96);
        p.wide = Math.max(p.wide, 0.55 * startle);
        p.y -= 3 * startle;
      },
    },
  ];
  K.fidget = (id) => K.FIDGETS.find((f) => f.id === id) || null;
  const FIDGET_START = 0.6; // seconds into an idle loop

  /** The fidget playing at idle time tt for a screen with this seed, or null. */
  function fidgetAt(tt, seed) {
    const L = K.state('idle').loop;
    const n = Math.floor(tt / L);
    if (n < 1 || (n + Math.floor(seed)) % 2 === 0) return null;
    const f = K.FIDGETS[Math.floor(U.hash(n * 7.13 + seed * 3.7) * K.FIDGETS.length)];
    const x = tt - n * L - FIDGET_START;
    if (x < 0 || x > f.dur) return null;
    return { f, u: x / f.dur };
  }

  /**
   * Full pose for a character: shared baseline, character flavor, resolved tint color.
   * opts.variety plays idle fidgets (opts.seed desyncs screens); opts.fidget + opts.fidgetU
   * force one fidget (used by the sprite exporter).
   */
  function compute(ch, state, tt, pal, themeId, opts) {
    let p = base(state, tt);
    p = ch.pose(p, state, tt) || p;
    if (state === 'idle' && opts) {
      let fg = null;
      if (opts.fidget) fg = { f: K.fidget(opts.fidget), u: opts.fidgetU || 0 };
      else if (opts.variety) fg = fidgetAt(tt, opts.seed || 0);
      if (fg && fg.f) {
        fg.f.apply(p, fg.u);
        if (ch.fidget) ch.fidget(p, fg.f.id, fg.u);
        p.fidget = fg.f.id;
      }
    }
    p.tint = p.tintKey ? K.tint(themeId, p.tintKey) : pal.tint || pal.base || U.WHITE;
    return p;
  }

  /* ------------------------------------------------------------ transitions */

  // Designed moves between specific states. `flash` is when the new state's own loop
  // starts (as a fraction of `dur`), `k` is the blend curve and `shape` adds the move.
  // Overlays for the same ids live in fx.js. Anything unlisted uses `blend`.
  const sstep = smoothstep;
  K.TRANSITIONS = [
    {
      id: 'flare',
      from: 'thinking',
      to: 'done',
      label: 'Thinking flares into done',
      dur: 0.95,
      flash: 0.45,
      k: (u) => sstep(0.38, 0.55, u),
      shape(p, u, a) {
        // the thinking dots fly up into the flare (fx.js), so the old ones stop drawing
        if (a && a.fx) a.fx.dots = 0;
        const gather = sstep(0, 0.42, u) * (1 - sstep(0.42, 0.5, u));
        const flash = hop(u, 0.38, 0.66);
        p.sy *= 1 - 0.07 * gather + 0.1 * flash;
        p.sx *= 1 + 0.05 * gather - 0.04 * flash;
        p.y += 2.5 * gather - 3 * flash;
        p.glow = Math.max(p.glow, 0.6 + 0.6 * flash);
        p.tint = U.mix(p.tint, U.WHITE, 0.55 * flash);
        p.tintAmt = Math.max(p.tintAmt, flash);
        p.eyeOpen = Math.min(p.eyeOpen, 1 - 0.8 * hop(u, 0.28, 0.48));
        if ('orbitR' in p.ex) p.ex.orbitR = 1 - sstep(0, 0.42, u);
        if ('size' in p.ex) p.ex.size *= 1 + 0.25 * flash;
      },
    },
    {
      id: 'save',
      from: 'recording',
      to: 'done',
      label: 'Recording saves into done',
      dur: 1.05,
      flash: 0.55,
      k: (u) => sstep(0.45, 0.65, u),
      shape(p, u) {
        const press = sstep(0, 0.5, u) * (1 - sstep(0.5, 0.58, u));
        const flash = hop(u, 0.5, 0.75);
        p.squint = Math.max(p.squint, 0.4 * press);
        p.sy *= 1 - 0.05 * press + 0.08 * flash;
        p.glow = Math.max(p.glow, 0.5 + 0.6 * flash);
        if ('clubGlow' in p.ex) p.ex.clubGlow = Math.max(p.ex.clubGlow, press);
      },
    },
    {
      id: 'gather',
      from: 'listening',
      to: 'thinking',
      label: 'Listening gathers into thinking',
      dur: 0.65,
      flash: 0.35,
      k: (u) => sstep(0.1, 0.6, u),
      shape(p, u) {
        const pull = hop(u, 0, 0.7);
        p.sx *= 1 - 0.04 * pull;
        p.sy *= 1 + 0.04 * pull;
        p.lookY = U.lerp(p.lookY, -0.8, 0.5 * pull);
      },
    },
    {
      id: 'perk',
      from: 'idle',
      to: 'listening',
      label: 'Perks up to listen',
      dur: 0.55,
      flash: 0.25,
      k: (u) => sstep(0, 0.5, u),
      shape(p, u) {
        const ant = hop(u, 0, 0.25);
        const up = hop(u, 0.2, 0.7);
        p.sy *= 1 - 0.05 * ant + 0.07 * up;
        p.sx *= 1 + 0.04 * ant - 0.03 * up;
        p.y -= 3 * up;
        p.wide = Math.max(p.wide, 0.5 * up);
      },
    },
    {
      id: 'wake',
      from: 'sleeping',
      to: '*',
      label: 'Wakes up',
      dur: 0.75,
      flash: 0.3,
      k: (u) => sstep(0.12, 0.5, u),
      shape(p, u) {
        const squash = hop(u, 0, 0.22);
        const pop = hop(u, 0.18, 0.55);
        p.sy *= 1 - 0.1 * squash + 0.09 * pop;
        p.sx *= 1 + 0.07 * squash - 0.05 * pop;
        p.y -= 3.5 * pop;
        p.wide = Math.max(p.wide, 0.7 * hop(u, 0.15, 0.6));
        p.bright = Math.max(p.bright, U.lerp(0.5, 1, sstep(0, 0.3, u)));
      },
    },
    {
      id: 'settle',
      from: '*',
      to: 'sleeping',
      label: 'Settles into sleep',
      dur: 1.4,
      flash: 0,
      k: (u) => U.easeInOut(u),
      shape(p, u) {
        const sigh = hop(u, 0.05, 0.45);
        p.sy *= 1 + 0.05 * sigh;
        p.y -= 1.5 * sigh;
      },
    },
    {
      id: 'jump',
      from: '*',
      to: 'needsyou',
      label: 'Jumps for attention',
      dur: 0.65,
      flash: 0.3,
      k: (u) => sstep(0.2, 0.5, u),
      shape(p, u) {
        const squat = hop(u, 0, 0.28);
        const air = hop(u, 0.22, 0.78);
        const land = hop(u, 0.78, 0.95);
        p.sy *= 1 - 0.12 * squat + 0.08 * air - 0.08 * land;
        p.sx *= 1 + 0.08 * squat - 0.04 * air + 0.06 * land;
        p.y -= 8 * air;
      },
    },
    {
      id: 'sag',
      from: '*',
      to: 'lowbattery',
      label: 'Sags on low battery',
      dur: 1.0,
      flash: 0,
      k: (u) => U.easeInOut(u),
      shape(p, u) {
        p.sy *= 1 - 0.06 * hop(u, 0.15, 0.85);
        p.x += 0.8 * Math.sin(u * 40) * hop(u, 0.3, 0.75);
        p.bright *= 1 - 0.45 * win(u, 0.42, 0.52, 0.03);
      },
    },
    {
      id: 'answer',
      from: 'thinking',
      to: 'speaking',
      label: 'Thinking turns into an answer',
      dur: 0.6,
      flash: 0.35,
      k: (u) => sstep(0.15, 0.55, u),
      shape(p, u) {
        const pop = hop(u, 0.2, 0.7);
        p.sy *= 1 + 0.05 * pop;
        p.lookY = U.lerp(p.lookY, 0, sstep(0, 0.4, u));
      },
    },
    {
      id: 'complete',
      from: 'working',
      to: 'done',
      label: 'Work completes into done',
      dur: 1.0,
      flash: 0.55,
      k: (u) => sstep(0.45, 0.65, u),
      shape(p, u) {
        const press = sstep(0, 0.5, u) * (1 - sstep(0.5, 0.58, u));
        const flash = hop(u, 0.5, 0.75);
        p.squint = Math.max(p.squint, 0.3 * press);
        p.sy *= 1 - 0.05 * press + 0.08 * flash;
        p.glow = Math.max(p.glow, 0.5 + 0.6 * flash);
      },
    },
    {
      id: 'greet',
      from: '*',
      to: 'hello',
      label: 'Pops up to say hi',
      dur: 0.55,
      flash: 0.15,
      k: (u) => sstep(0, 0.4, u),
      shape(p, u) {
        const squat = hop(u, 0, 0.3);
        const pop = hop(u, 0.25, 0.8);
        p.sy *= 1 - 0.08 * squat + 0.08 * pop;
        p.sx *= 1 + 0.06 * squat - 0.04 * pop;
      },
    },
    {
      id: 'unmute',
      from: 'privacy',
      to: '*',
      label: 'Mic back on',
      dur: 0.55,
      flash: 0.25,
      k: (u) => sstep(0.1, 0.5, u),
      shape(p, u) {
        const pop = hop(u, 0.1, 0.6);
        p.wide = Math.max(p.wide, 0.5 * pop);
        p.y -= 2 * pop;
      },
    },
    {
      id: 'mute',
      from: '*',
      to: 'privacy',
      label: 'Mic off',
      dur: 0.8,
      flash: 0,
      k: (u) => U.easeInOut(u),
      shape(p, u) {
        p.y += 1.5 * hop(u, 0.1, 0.9);
      },
    },
    {
      id: 'plug',
      from: '*',
      to: 'charging',
      label: 'Starts charging',
      dur: 0.7,
      flash: 0.3,
      k: (u) => sstep(0.2, 0.5, u),
      shape(p, u) {
        const zap = hop(u, 0.05, 0.4);
        p.x += 1.2 * Math.sin(u * 60) * zap;
        p.wide = Math.max(p.wide, 0.6 * zap);
        p.glow = Math.max(p.glow, 0.5 + 0.5 * zap);
      },
    },
    {
      id: 'swoon',
      from: '*',
      to: 'love',
      label: 'Melts into love',
      dur: 0.7,
      flash: 0.3,
      k: (u) => sstep(0.1, 0.5, u),
      shape(p, u) {
        const squash = hop(u, 0.05, 0.35);
        const pop = hop(u, 0.3, 0.75);
        p.sy *= 1 - 0.07 * squash + 0.07 * pop;
        p.sx *= 1 + 0.05 * squash - 0.03 * pop;
      },
    },
  ];
  const BLEND = {
    id: 'blend',
    label: 'Quick blend',
    dur: 0.45,
    flash: 0,
    k: (u) => U.easeInOut(Math.min(1, u / 0.7)),
    shape(p, u) {
      const pop = 1 + 0.07 * Math.sin(u * Math.PI * 2) * (1 - u);
      p.sx *= pop;
      p.sy *= 2 - pop;
    },
  };

  /** The move to play between two states: exact pair, then from -> any, then any -> to. */
  K.transitionFor = function (from, to) {
    const T = K.TRANSITIONS;
    return T.find((t) => t.from === from && t.to === to) || T.find((t) => t.from === from && t.to === '*') || T.find((t) => t.from === '*' && t.to === to) || BLEND;
  };
  K.transitionById = (id) => K.TRANSITIONS.find((t) => t.id === id) || (id === 'blend' ? BLEND : null);

  /** Pose for one moment of a transition at local time u (0..1). */
  function transitionPose(tr, a, b, u) {
    const k = U.clamp(tr.k(U.clamp(u)));
    const p = k <= 0 ? clone(a) : k >= 1 ? clone(b) : blend(a, b, k);
    if (tr.shape) tr.shape(p, U.clamp(u), a, b);
    return { pose: p, k };
  }

  K.Pose = { DEFAULTS, create, base, blend, clone, compute, transitionPose, fidgetAt, FIDGET_START };
})(window.Bud);
