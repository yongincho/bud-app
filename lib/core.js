/* Bud concept library: namespace, registries and shared helpers.
 *
 * Plain browser scripts (no modules, no build step) so the explorer runs straight
 * from file://. Every other file in lib/ attaches itself to window.Bud.
 * The same files are meant to be reused by the landing page (Task 2), the sprite
 * exporter (Task 3) and the companion app prototype (Task 4).
 */
(function (root) {
  'use strict';

  const Bud = (root.Bud = root.Bud || {});
  Bud.version = '0.1.0';

  /* ---------------------------------------------------------------- registries */

  function makeRegistry(kind, validate) {
    const list = [];
    const map = Object.create(null);
    return {
      kind,
      list,
      add(def) {
        if (!def || typeof def.id !== 'string') throw new Error(`Bud: a ${kind} needs a string id`);
        if (validate) validate(def);
        const prev = map[def.id];
        if (prev) list[list.indexOf(prev)] = def;
        else list.push(def);
        map[def.id] = def;
        return def;
      },
      get(id) { return map[id] || null; },
      has(id) { return !!map[id]; },
      ids() { return list.map((d) => d.id); },
    };
  }

  function validateCharacter(def) {
    if (def.wrapper) {
      if (typeof def.resolve !== 'function') throw new Error(`Bud: wrapper character "${def.id}" needs resolve()`);
      return;
    }
    ['draw', 'pose'].forEach((fn) => {
      if (typeof def[fn] !== 'function') throw new Error(`Bud: character "${def.id}" needs ${fn}()`);
    });
    if (!def.palettes || !def.palettes.classic) throw new Error(`Bud: character "${def.id}" needs palettes.classic`);
  }

  function validateForm(def) {
    ['body', 'screen'].forEach((fn) => {
      if (typeof def[fn] !== 'function') throw new Error(`Bud: form "${def.id}" needs ${fn}(size)`);
    });
  }

  Bud.characters = makeRegistry('character', validateCharacter);
  Bud.forms = makeRegistry('form', validateForm);
  Bud.phones = makeRegistry('phone');
  Bud.themes = makeRegistry('theme');

  Bud.registerCharacter = (def) => Bud.characters.add(def);
  Bud.registerForm = (def) => Bud.forms.add(def);
  Bud.registerPhone = (def) => Bud.phones.add(def);
  Bud.registerTheme = (def) => Bud.themes.add(def);

  /* ------------------------------------------------------------------- math */

  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const fract = (x) => x - Math.floor(x);
  const smoothstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  const WHITE = [255, 255, 255];
  const BLACK = [0, 0, 0];

  const U = (Bud.util = {
    TAU,
    clamp,
    lerp,
    fract,
    smoothstep,
    easeOut: (t) => 1 - Math.pow(1 - clamp(t), 3),
    easeIn: (t) => Math.pow(clamp(t), 3),
    easeInOut(t) {
      t = clamp(t);
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    },
    easeOutBack(t, s = 1.70158) {
      t = clamp(t) - 1;
      return 1 + t * t * ((s + 1) * t + s);
    },

    /** Deterministic 0..1 noise from a number. */
    hash(n) {
      const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
      return s - Math.floor(s);
    },

    /** Sine that completes a whole number of cycles per loop, so sprite loops stay seamless. */
    osc(tt, loop, cycles = 1, phase = 0) {
      return Math.sin(TAU * ((cycles * tt) / loop + phase));
    },

    /** Like osc, but asks for a frequency (Hz) and rounds it to the nearest loop-safe value. */
    hz(tt, loop, freq, phase = 0) {
      const c = Math.max(1, Math.round(freq * loop));
      return Math.sin(TAU * ((c * tt) / loop + phase));
    },

    /** 0 outside [a, b], 1 inside, with soft shoulders of width f. */
    win(x, a, b, f = 0.15) {
      return smoothstep(a, a + f, x) * (1 - smoothstep(b - f, b, x));
    },

    /** Parabolic hop: 0 at a, 1 halfway, 0 at b. */
    hop(x, a, b) {
      if (x <= a || x >= b) return 0;
      const u = (x - a) / (b - a);
      return 4 * u * (1 - u);
    },

    /** Eye openness for blinks at the given times (seconds within a loop). */
    blink(x, times, dur = 0.2) {
      let open = 1;
      const close = 0.06;
      const hold = 0.04;
      for (let i = 0; i < times.length; i++) {
        const d = x - times[i];
        if (d > -close && d < dur) {
          const v = d < 0 ? -d / close : d < hold ? 0 : (d - hold) / (dur - hold);
          open = Math.min(open, clamp(v));
        }
      }
      return open;
    },

    /* ----------------------------------------------------------------- color */

    rgb(hex) {
      if (Array.isArray(hex)) return hex;
      let h = String(hex).trim().replace('#', '');
      if (h.length === 3) h = h.split('').map((c) => c + c).join('');
      const n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    },
    hex(c) {
      return '#' + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
    },
    mix(a, b, t) {
      if (t <= 0) return a;
      if (t >= 1) return b;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    },
    css(c, a = 1) {
      const r = Math.round(c[0]);
      const g = Math.round(c[1]);
      const b = Math.round(c[2]);
      return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a < 0 ? 0 : a.toFixed(3)})`;
    },
    lighten: (c, t) => U.mix(c, WHITE, t),
    darken: (c, t) => U.mix(c, BLACK, t),
    gray(c) {
      const l = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
      return [l, l, l];
    },
    desat: (c, t) => (t > 0 ? U.mix(c, U.gray(c), t) : c),
    /** Relative luminance 0..1 (sRGB weights, good enough for UI decisions). */
    luma: (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255,
    WHITE,
    BLACK,

    /* ---------------------------------------------------------------- canvas */

    /** Adds a rounded rectangle sub-path. */
    rr(ctx, x, y, w, h, r) {
      r = Math.max(0, Math.min(r, w / 2, h / 2));
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    },
    ellipse(ctx, x, y, rx, ry, rot = 0) {
      ctx.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot));
      ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
    },
    /** Four-point sparkle star. */
    star4(ctx, x, y, r, thin = 0.28) {
      const t = r * thin;
      ctx.moveTo(x, y - r);
      ctx.quadraticCurveTo(x + t * 0.35, y - t * 0.35, x + r, y);
      ctx.quadraticCurveTo(x + t * 0.35, y + t * 0.35, x, y + r);
      ctx.quadraticCurveTo(x - t * 0.35, y + t * 0.35, x - r, y);
      ctx.quadraticCurveTo(x - t * 0.35, y - t * 0.35, x, y - r);
      ctx.closePath();
    },
  });

  /* --------------------------------------------------------------- palettes */

  const palCache = new Map();

  /** Parsed palette (hex strings become [r,g,b]) for a character and theme. */
  Bud.palette = function (charId, themeId) {
    const key = charId + '|' + themeId;
    let pal = palCache.get(key);
    if (pal) return pal;
    const ch = Bud.characters.get(charId);
    const raw = (ch && ch.palettes && (ch.palettes[themeId] || ch.palettes.classic)) || {};
    pal = {};
    for (const k in raw) {
      const v = raw[k];
      pal[k] = typeof v === 'string' && v[0] === '#' ? U.rgb(v) : v;
    }
    palCache.set(key, pal);
    return pal;
  };

  /* ---------------------------------------------------------------- storage */

  /** localStorage wrapped in try/catch: private windows and blocked storage just fall back. */
  Bud.store = {
    get(key, fallback) {
      try {
        const v = root.localStorage.getItem(key);
        return v == null ? fallback : JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        root.localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        return false;
      }
    },
    remove(key) {
      try {
        root.localStorage.removeItem(key);
      } catch (e) {
        /* ignore */
      }
    },
  };

  let uidCounter = 0;
  Bud.uid = (prefix = 'k') => `${prefix}${(++uidCounter).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
})(window);
