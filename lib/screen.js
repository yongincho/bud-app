/* Screen: renders one animated character into a canvas that looks like a small display.
 *
 * Pipeline per frame:
 *   1. paint(): background, character, overlays and transition moves into a buffer at the
 *      simulated resolution (for example 128 px across), in stage units (100 x 100)
 *   2. simulate the panel: color depth (RGB565 or dithered 1-bit) and brightness
 *   3. scale up to the real canvas (nearest neighbor when low-res)
 *   4. OLED bloom, optional pixel grid, then mask to the screen shape
 * paint() is also what the sprite exporter uses, so exported frames match the preview.
 * All Screens share one requestAnimationFrame loop and pause when off screen.
 */
(function (K) {
  'use strict';
  const U = K.util;
  const { TAU, clamp } = U;
  const DPR_CAP = 2;

  /* --------------------------------------------------------------- frame loop */

  const screens = new Set();
  let raf = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    screens.forEach((s) => s._tick(now));
  }
  function ensureLoop() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------------- shapes */

  /** Path for a screen shape filling a w x h box (pixels), optionally inset. */
  function shapePath(ctx, shape, w, h, inset) {
    inset = inset || 0;
    const x = inset;
    const y = inset;
    const W = Math.max(1, w - 2 * inset);
    const H = Math.max(1, h - 2 * inset);
    const type = shape && shape.type;
    ctx.beginPath();
    if (type === 'circle') {
      ctx.ellipse(w / 2, h / 2, W / 2, H / 2, 0, 0, TAU);
    } else if (type === 'arch') {
      const r = Math.min(W / 2, H);
      const br = Math.max(0, Math.min((shape.br || 0) * Math.min(w, h), (H - r) * 0.9, W / 4));
      ctx.moveTo(x, y + r);
      ctx.arc(x + r, y + r, r, Math.PI, 0);
      ctx.lineTo(x + W, y + H - br);
      if (br > 0.5) ctx.arcTo(x + W, y + H, x + W - br, y + H, br);
      else ctx.lineTo(x + W, y + H);
      ctx.lineTo(x + br, y + H);
      if (br > 0.5) ctx.arcTo(x, y + H, x, y + H - br, br);
      else ctx.lineTo(x, y + H);
      ctx.closePath();
    } else {
      const r = Math.max(0, ((shape && shape.r) || 0) * Math.min(w, h) - inset);
      U.rr(ctx, x, y, W, H, r);
    }
  }

  function perimeter(shape, w, h) {
    const type = shape && shape.type;
    if (type === 'circle') return Math.PI * (w + h) * 0.5;
    if (type === 'arch') return w + 2 * Math.max(0, h - w / 2) + (Math.PI * w) / 2;
    return 2 * (w + h);
  }

  function inside(shape, px, py, w, h) {
    const type = shape && shape.type;
    if (type === 'circle') {
      const u = (px - w / 2) / (w / 2);
      const v = (py - h / 2) / (h / 2);
      return u * u + v * v <= 1;
    }
    if (type === 'arch') {
      const r = Math.min(w / 2, h);
      if (py >= r) return true;
      const dx = px - w / 2;
      const dy = py - r;
      return dx * dx + dy * dy <= r * r;
    }
    return true;
  }

  /** Where the 100-unit stage sits inside the screen buffer. */
  function layout(iw, ih, cfg) {
    const st = cfg.stage || {};
    if (cfg.chrome && ih / iw > 1.25) {
      const S = iw * (st.scale || 0.94);
      return { cx: iw / 2, cy: ih * 0.47, s: S / 100, chrome: true };
    }
    const S = Math.min(iw, ih) * (st.scale || 1);
    let cy = ih / 2;
    if (st.align === 'bottom') cy = ih - S / 2;
    cy += ((st.dy || 0) * S) / 100;
    return { cx: iw / 2, cy, s: S / 100, chrome: false };
  }

  /** Slow burn-in-safe drift, in stage units. */
  function drift(t) {
    return [3.2 * Math.sin((t * TAU) / 23), 2.6 * Math.sin((t * TAU) / 31 + 1.3)];
  }

  const STATE_LINE = {
    idle: 'Ready',
    listening: 'Listening',
    thinking: 'Thinking',
    done: 'Done',
    recording: 'Recording',
    sleeping: 'Sleeping',
    lowbattery: 'Battery low',
    needsyou: 'Needs you',
  };

  /** Stroke the screen-edge path starting at 12 o'clock on round screens, so progress reads like a clock. */
  function edgePath(b, cfg, iw, ih, inset) {
    if (cfg.shape && cfg.shape.type === 'circle') {
      b.beginPath();
      b.ellipse(iw / 2, ih / 2, Math.max(1, iw / 2 - inset), Math.max(1, ih / 2 - inset), -Math.PI / 2, 0, TAU);
    } else shapePath(b, cfg.shape, iw, ih, inset);
  }

  function progressRing(b, pose, cfg, iw, ih, theme, t) {
    const pr = pose.fx.progress || 0;
    if (pr < 0.01) return;
    const lw = Math.max(1.2, Math.min(iw, ih) * 0.028);
    const per = perimeter(cfg.shape, iw - lw * 1.5, ih - lw * 1.5);
    const L = K.state('working').loop;
    const v = U.fract(t / L);
    const fill = U.easeInOut(U.clamp(v / 0.92));
    const fade = 1 - U.smoothstep(0.93, 1, v);
    const col = K.tint(theme, 'working');
    b.save();
    b.lineCap = 'round';
    b.lineWidth = lw;
    edgePath(b, cfg, iw, ih, lw * 0.75);
    b.strokeStyle = U.css(col, 0.22 * pr);
    b.stroke();
    b.setLineDash([per * fill, per]);
    b.strokeStyle = U.css(col, pr * fade);
    b.stroke();
    b.restore();
  }

  function statusRing(b, pose, cfg, iw, ih, theme, t) {
    progressRing(b, pose, cfg, iw, ih, theme, t);
    const ring = pose.fx.ring || 0;
    const attn = pose.fx.attn || 0;
    if (ring < 0.01 && attn < 0.01) return;
    const lw = Math.max(1.2, Math.min(iw, ih) * 0.026);
    b.save();
    shapePath(b, cfg.shape, iw, ih, lw * 0.75);
    b.lineCap = 'round';
    if (ring > 0.01) {
      const col = K.tint(theme, 'recording');
      b.lineWidth = lw;
      b.strokeStyle = U.css(col, 0.3 * ring);
      b.stroke();
      const per = perimeter(cfg.shape, iw - lw * 1.5, ih - lw * 1.5);
      b.setLineDash([per * 0.2, per * 0.8]);
      b.lineDashOffset = -per * U.fract(t / K.state('recording').loop);
      b.strokeStyle = U.css(col, ring);
      b.stroke();
      b.setLineDash([]);
    }
    if (attn > 0.01) {
      const col = K.tint(theme, 'needsyou');
      const pulse = 0.5 + 0.5 * Math.sin((t * TAU) / 0.8);
      b.lineWidth = lw * (0.9 + 0.6 * pulse);
      b.strokeStyle = U.css(col, attn * (0.25 + 0.65 * pulse));
      b.stroke();
    }
    b.restore();
  }

  /** "save" and "complete" moves: the edge ring closes into a full circle, then turns to the done color. */
  function transitionRing(b, fr, cfg, iw, ih, theme) {
    if (!fr.tr || (fr.tr.id !== 'save' && fr.tr.id !== 'complete')) return;
    const u = fr.u;
    const lw = Math.max(1.2, Math.min(iw, ih) * 0.03);
    const per = perimeter(cfg.shape, iw - lw * 1.5, ih - lw * 1.5);
    b.save();
    edgePath(b, cfg, iw, ih, lw * 0.75);
    b.lineCap = 'round';
    if (u < 0.55) {
      const prog = 0.2 + 0.8 * U.easeInOut(u / 0.5);
      b.setLineDash([per * prog, per]);
      b.lineWidth = lw;
      b.strokeStyle = U.css(K.tint(theme, fr.tr.id === 'save' ? 'recording' : 'working'), 1);
      b.stroke();
    } else {
      const v = (u - 0.55) / 0.45;
      b.lineWidth = lw * (1 + 1.5 * v);
      b.strokeStyle = U.css(K.tint(theme, 'done'), 1 - v);
      b.stroke();
    }
    b.restore();
  }

  function chrome(b, iw, ih, cfg, pose, pal, theme, stateAge, still) {
    const fs = Math.max(5, Math.round(iw * 0.075));
    const pad = Math.round(iw * 0.09);
    const bgL = cfg.oled ? 0 : U.luma(pal.bg);
    const fg = bgL > 0.55 ? [24, 22, 30] : [236, 236, 242];
    const ty = Math.round(ih * 0.075);
    b.save();
    b.textBaseline = 'middle';
    b.font = `700 ${fs}px "Nunito", ui-rounded, system-ui, sans-serif`;
    b.fillStyle = U.css(fg, 0.72);
    b.textAlign = 'left';
    b.fillText(cfg.name || '', pad, ty);
    const bw = fs * 1.7;
    const bh = fs * 0.82;
    const bx = iw - pad - bw;
    const by = ty - bh / 2;
    const low = pose.state === 'lowbattery';
    b.strokeStyle = U.css(fg, 0.72);
    b.lineWidth = Math.max(1, fs * 0.12);
    b.beginPath();
    U.rr(b, bx, by, bw, bh, bh * 0.25);
    b.stroke();
    b.fillStyle = low ? U.css(K.tint(theme, 'recording')) : U.css(fg, 0.72);
    b.fillRect(bx + bw * 0.12, by + bh * 0.22, bw * 0.76 * (low ? 0.18 : 0.72), bh * 0.56);
    let label = STATE_LINE[pose.state] || '';
    if (pose.state === 'recording') {
      // a sprite cannot know the elapsed time, so exported frames just say REC
      const s = Math.floor(stateAge);
      label = still ? 'REC' : `REC ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    } else if (pose.state === 'listening' || pose.state === 'thinking') {
      const n = still ? 1 + Math.floor(U.fract(pose.loopT / K.state(pose.state).loop) * 3) : 1 + (Math.floor(stateAge * 2.5) % 3);
      label += '.'.repeat(n);
    }
    b.font = `700 ${Math.round(fs * 1.1)}px "Nunito", ui-rounded, system-ui, sans-serif`;
    b.textAlign = 'center';
    b.fillStyle = U.css(fg, 0.88);
    b.fillText(label, iw / 2, Math.round(ih * 0.9));
    if (pose.tintAmt > 0.05) {
      b.fillStyle = U.css(pose.tint, pose.tintAmt);
      b.beginPath();
      b.arc(iw / 2, Math.round(ih * 0.82), Math.max(1.2, fs * 0.22), 0, TAU);
      b.fill();
    }
    b.restore();
  }

  /* -------------------------------------------------------- panel simulation */

  const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const INKS = { white: [236, 246, 255], blue: [96, 200, 255], amber: [255, 186, 84] };
  const Q5 = new Uint8Array(256);
  const Q6 = new Uint8Array(256);
  for (let v = 0; v < 256; v++) {
    Q5[v] = Math.round((Math.round((v * 31) / 255) * 255) / 31);
    Q6[v] = Math.round((Math.round((v * 63) / 255) * 255) / 63);
  }
  K.DEPTHS = [
    { id: 'full', label: 'Full color', bits: 24 },
    { id: 'rgb565', label: '16-bit', bits: 16, note: 'RGB565, what most small color panels take' },
    { id: 'mono1', label: '1-bit', bits: 1, note: 'On or off pixels, like a cheap monochrome OLED' },
  ];
  K.MONO_INKS = INKS;

  /** Quantize a buffer in place: RGB565 banding, or ordered-dither 1-bit in an ink color. */
  function applyDepth(b, iw, ih, depth, ink) {
    if (depth !== 'rgb565' && depth !== 'mono1') return;
    let img;
    try {
      img = b.getImageData(0, 0, iw, ih);
    } catch (e) {
      return;
    }
    const d = img.data;
    if (depth === 'rgb565') {
      for (let i = 0; i < d.length; i += 4) {
        d[i] = Q5[d[i]];
        d[i + 1] = Q6[d[i + 1]];
        d[i + 2] = Q5[d[i + 2]];
      }
    } else {
      const c = INKS[ink] || INKS.white;
      for (let y = 0; y < ih; y++) {
        const row = (y & 3) * 4;
        for (let x = 0; x < iw; x++) {
          const i = (y * iw + x) * 4;
          const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          const on = l > (BAYER4[row + (x & 3)] + 0.5) * 16;
          d[i] = on ? c[0] : 0;
          d[i + 1] = on ? c[1] : 0;
          d[i + 2] = on ? c[2] : 0;
        }
      }
    }
    b.putImageData(img, 0, 0);
  }

  /** Display brightness: scales every lit pixel down (OLED power drops with it). */
  function applyBrightness(b, iw, ih, level) {
    if (!(level < 0.995)) return;
    b.save();
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.globalCompositeOperation = 'source-over';
    b.fillStyle = `rgba(0,0,0,${(1 - clamp(level, 0, 1)).toFixed(3)})`;
    b.fillRect(0, 0, iw, ih);
    b.restore();
  }

  /* ---------------------------------------------------------------- painting */

  /** Resolve the Base + skins wrapper into what to draw: character, theme, accessories, ambience. */
  function resolve(cfg) {
    let charId = cfg.character;
    let theme = cfg.theme;
    let acc = cfg.acc || {};
    let ambient = cfg.ambient || null;
    const wrap = K.characters.get(charId);
    if (wrap && wrap.wrapper) {
      const r = wrap.resolve(cfg);
      charId = r.character;
      theme = r.theme;
      acc = r.acc || {};
      ambient = r.ambient || null;
    }
    const ch = K.characters.get(charId) || K.characters.list.find((c) => !c.wrapper);
    if (!K.themes.has(theme)) theme = 'classic';
    return { ch, theme, acc, ambient, pal: ch ? K.palette(ch.id, theme) : null };
  }

  /**
   * Draw one frame of screen content into `b` (iw x ih pixels): no bloom, no scaling.
   * fr = { pose, poseA, poseB, k, tr, u }; o = { loop (seconds, for loop-safe ambient),
   * still (sprite export: no drift, static REC label), stateAge }.
   */
  function paint(b, iw, ih, cfg, R, fr, t, o) {
    o = o || {};
    const { ch, theme, acc, ambient, pal } = R;
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.globalAlpha = 1;
    b.globalCompositeOperation = 'source-over';
    b.fillStyle = cfg.oled ? '#000' : U.css(pal.bg);
    b.fillRect(0, 0, iw, ih);

    const lay = layout(iw, ih, cfg);
    const pose = fr.pose;
    // gaze: { x, y, amt } lets a page steer where the character looks (cursor follow)
    if (cfg.gaze && cfg.gaze.amt > 0.001 && pose.closed < 0.5) {
      const g = cfg.gaze;
      const a = clamp(g.amt, 0, 1) * (1 - pose.closed * 2);
      pose.lookX = U.lerp(pose.lookX, clamp(g.x, -1, 1), a);
      pose.lookY = U.lerp(pose.lookY, clamp(g.y, -1, 1), a);
    }
    const desat = pose.desat;
    const loop = o.loop || 0;
    const rate = (hz) => (loop ? Math.max(1, Math.round(hz * loop)) / loop : hz);
    const env = {
      t,
      theme,
      pal,
      accColors: K.accColors(theme),
      oled: cfg.oled,
      mono: theme === 'mono',
      lowRes: cfg.lowRes | 0,
      shape: cfg.shape,
      bounds: { x0: -lay.cx / lay.s, y0: -lay.cy / lay.s, x1: (iw - lay.cx) / lay.s, y1: (ih - lay.cy) / lay.s },
      rate,
      wave: (hz, ph) => Math.sin(TAU * (rate(hz) * t + (ph || 0))),
      // mono is a single-color panel: everything (accessories and effects too) goes gray
      c: (rgb, a) => U.css(theme === 'mono' ? U.gray(rgb) : desat > 0.01 ? U.desat(rgb, desat) : rgb, a == null ? 1 : a),
      acc: (ctx, slot, anchor) => K.Acc.drawSlot(ctx, slot, anchor, env, acc),
    };

    b.save();
    b.translate(lay.cx, lay.cy);
    b.scale(lay.s, lay.s);
    if (cfg.drift && !o.still) {
      const d = drift(t);
      let dx = d[0];
      let dy = d[1];
      if (cfg.lowRes) {
        dx = Math.round(dx * lay.s) / lay.s;
        dy = Math.round(dy * lay.s) / lay.s;
      }
      b.translate(dx, dy);
    }
    if (ambient) K.FX.ambient(b, ambient, t, env, 'back');
    b.save();
    ch.draw(b, pose, pal, env);
    b.restore();
    const anchors = ch.anchors ? ch.anchors(pose) : null;
    if (fr.poseA) K.FX.draw(b, fr.poseA, env, 1 - fr.k, anchors);
    K.FX.draw(b, fr.poseB || pose, env, fr.poseA ? fr.k : 1, anchors);
    if (fr.tr) K.FX.transition(b, fr, env, anchors);
    if (ambient) K.FX.ambient(b, ambient, t, env, 'front');
    b.restore();

    statusRing(b, pose, cfg, iw, ih, theme, t);
    if (fr.tr) transitionRing(b, fr, cfg, iw, ih, theme);
    if (lay.chrome) chrome(b, iw, ih, cfg, pose, pal, theme, o.stateAge || 0, o.still);
    if (pose.bright < 0.995) {
      b.fillStyle = `rgba(0,0,0,${(1 - pose.bright).toFixed(3)})`;
      b.fillRect(0, 0, iw, ih);
    }
  }

  /* ------------------------------------------------------------------- Screen */

  class Screen {
    constructor(host, opts) {
      this.host = host;
      this.opts = Object.assign({ fps: 60, bloom: true, metrics: false, onMetrics: null, quality: 1, manual: false }, opts || {});
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'kx-canvas';
      this.canvas.style.cssText = 'display:block;width:100%;height:100%';
      host.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');
      this.buf = document.createElement('canvas');
      this.bctx = this.buf.getContext('2d');
      this.cfg = {
        character: 'ember', base: 'bun', pack: 'lantern', theme: 'classic', acc: {}, state: 'idle',
        oled: true, lowRes: 0, drift: false, glow: true, grid: true, depth: 'full', ink: 'white', brightness: 1,
        variety: true, shape: { type: 'circle' }, stage: {}, chrome: false, name: '',
      };
      this.seed = Math.random() * 20;
      const now = performance.now() / 1000;
      this.cur = { state: 'idle', since: now - Math.random() * 12 };
      this.prev = null;
      this.trans = null;
      this.visible = true;
      this.last = 0;
      this.W = 0;
      this.H = 0;
      this.metrics = null;
      this._mT = 0;
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(host);
      this._io = new IntersectionObserver((entries) => {
        this.visible = entries[entries.length - 1].isIntersecting;
      });
      this._io.observe(host);
      this._resize();
      screens.add(this);
      ensureLoop();
    }

    set(patch) {
      if (!patch) return this;
      const st = patch.state;
      Object.assign(this.cfg, patch);
      if (st && st !== this.cur.state) {
        const now = performance.now() / 1000;
        if (!this.rendered) {
          // first state before anything was drawn: start mid-loop, no transition
          this.cur = { state: st, since: now - Math.random() * K.state(st).loop };
        } else {
          const tr = K.transitionFor(this.cur.state, st);
          this.prev = { state: this.cur.state, since: this.cur.since };
          this.trans = { tr, at: now };
          this.cur = { state: st, since: now + tr.dur * (tr.flash || 0) };
        }
      }
      this.last = 0;
      return this;
    }

    destroy() {
      screens.delete(this);
      this._ro.disconnect();
      this._io.disconnect();
      this.canvas.remove();
    }

    _resize() {
      const r = this.host.getBoundingClientRect();
      const dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1) * (this.opts.quality || 1);
      const W = Math.max(1, Math.round(r.width * dpr));
      const H = Math.max(1, Math.round(r.height * dpr));
      if (W !== this.W || H !== this.H) {
        this.W = this.canvas.width = W;
        this.H = this.canvas.height = H;
        this.last = 0;
      }
    }

    _tick(now) {
      if (this.opts.manual || !this.visible || this.W < 2 || this.H < 2) return;
      if (now - this.last < 1000 / this.opts.fps - 2) return;
      this.last = now;
      this.render(now / 1000);
    }

    /** Poses for time t, including a running designed transition. */
    _poses(R, t) {
      const opts = { variety: this.cfg.variety !== false, seed: this.seed };
      const poseB = K.Pose.compute(R.ch, this.cur.state, Math.max(0, t - this.cur.since), R.pal, R.theme, opts);
      if (this.prev && this.trans) {
        const u = (t - this.trans.at) / this.trans.tr.dur;
        if (u < 1) {
          const poseA = K.Pose.compute(R.ch, this.prev.state, t - this.prev.since, R.pal, R.theme, opts);
          const tp = K.Pose.transitionPose(this.trans.tr, poseA, poseB, u);
          return { pose: tp.pose, poseA, poseB, k: tp.k, tr: this.trans.tr, u };
        }
        this.prev = null;
        this.trans = null;
      }
      return { pose: poseB, poseA: null, poseB, k: 1, tr: null, u: 1 };
    }

    render(t) {
      this.rendered = true;
      const cfg = this.cfg;
      const R = resolve(cfg);
      if (!R.ch) return;
      const W = this.W;
      const H = this.H;
      const lowRes = cfg.lowRes | 0;
      let iw = W;
      let ih = H;
      if (lowRes > 0) {
        iw = lowRes;
        ih = Math.max(1, Math.round((lowRes * H) / W));
      }
      // panel simulation reads pixels back, so it gets its own CPU-friendly buffer
      const sim = lowRes > 0 && (cfg.depth === 'rgb565' || cfg.depth === 'mono1');
      let buf = this.buf;
      let b = this.bctx;
      if (sim) {
        if (!this.simBuf) {
          this.simBuf = document.createElement('canvas');
          this.simCtx = this.simBuf.getContext('2d', { willReadFrequently: true });
        }
        buf = this.simBuf;
        b = this.simCtx;
      }
      if (buf.width !== iw || buf.height !== ih) {
        buf.width = iw;
        buf.height = ih;
      }

      const fr = this._poses(R, t);
      paint(b, iw, ih, cfg, R, fr, t, { stateAge: t - this.cur.since });
      if (sim) applyDepth(b, iw, ih, cfg.depth, cfg.ink);
      applyBrightness(b, iw, ih, cfg.brightness == null ? 1 : cfg.brightness);

      const c = this.ctx;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
      c.clearRect(0, 0, W, H);
      c.imageSmoothingEnabled = !lowRes || iw > W;
      c.imageSmoothingQuality = 'high';
      c.drawImage(buf, 0, 0, W, H);
      if (cfg.oled && cfg.glow && this.opts.bloom) this._bloom(c, W, H, 0.35 + 0.4 * fr.pose.glow);
      if (lowRes && cfg.grid && W / iw >= 3.2) this._grid(c, W, H, iw, ih);
      c.globalCompositeOperation = 'destination-in';
      shapePath(c, cfg.shape, W, H);
      c.fillStyle = '#000';
      c.fill();
      c.globalCompositeOperation = 'source-over';

      if (this.opts.metrics && t - this._mT > 0.4) {
        this._mT = t;
        this.metrics = this._measure(buf, lowRes);
        if (this.opts.onMetrics) this.opts.onMetrics(this.metrics);
      }
    }

    _bloom(c, W, H, amount) {
      if (!this._bl) this._bl = [0, 1, 2, 3].map(() => document.createElement('canvas'));
      let src = this.canvas;
      let w = W;
      let h = H;
      for (let i = 0; i < 4; i++) {
        w = Math.max(2, w >> 1);
        h = Math.max(2, h >> 1);
        const cv = this._bl[i];
        if (cv.width !== w || cv.height !== h) {
          cv.width = w;
          cv.height = h;
        }
        const x = cv.getContext('2d');
        x.imageSmoothingEnabled = true;
        x.clearRect(0, 0, w, h);
        x.drawImage(src, 0, 0, w, h);
        src = cv;
      }
      c.save();
      c.globalCompositeOperation = 'screen';
      c.imageSmoothingEnabled = true;
      c.globalAlpha = clamp(amount * 0.3);
      c.drawImage(this._bl[1], 0, 0, W, H);
      c.globalAlpha = clamp(amount * 0.5);
      c.drawImage(this._bl[3], 0, 0, W, H);
      c.restore();
    }

    _grid(c, W, H, iw, ih) {
      const cw = W / iw;
      const ch = H / ih;
      const gw = Math.max(1, Math.round(cw * 0.14));
      c.fillStyle = 'rgba(0,0,0,0.32)';
      for (let i = 1; i < iw; i++) c.fillRect(Math.round(i * cw) - (gw >> 1), 0, gw, H);
      for (let j = 1; j < ih; j++) c.fillRect(0, Math.round(j * ch) - (gw >> 1), W, gw);
    }

    _measure(src, lowRes) {
      const iw = src.width;
      const ih = src.height;
      const mw = Math.min(iw, 120);
      const mh = Math.max(1, Math.round((ih * mw) / iw));
      if (!this._mc) {
        this._mc = document.createElement('canvas');
        this._mx = this._mc.getContext('2d', { willReadFrequently: true });
      }
      if (this._mc.width !== mw || this._mc.height !== mh) {
        this._mc.width = mw;
        this._mc.height = mh;
      }
      this._mx.imageSmoothingEnabled = true;
      this._mx.drawImage(src, 0, 0, mw, mh);
      let data;
      try {
        data = this._mx.getImageData(0, 0, mw, mh).data;
      } catch (e) {
        return null;
      }
      let n = 0;
      let lit = 0;
      let sum = 0;
      for (let y = 0; y < mh; y++) {
        for (let x = 0; x < mw; x++) {
          if (!inside(this.cfg.shape, x + 0.5, y + 0.5, mw, mh)) continue;
          const i = (y * mw + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const bl = data[i + 2];
          n++;
          if (r > 16 || g > 16 || bl > 16) lit++;
          sum += 0.2126 * r + 0.7152 * g + 0.0722 * bl;
        }
      }
      return { lit: n ? lit / n : 0, level: n ? sum / (n * 255) : 0, res: lowRes ? [iw, ih] : null };
    }
  }

  K.Screen = Screen;
  K.ScreenUtil = { shapePath, layout, inside, perimeter, resolve, paint, applyDepth, applyBrightness };
})(window.Bud);
