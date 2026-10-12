/* Shared expression overlays (ripples, thinking dots, sparkles, Zs, battery...)
 * and ambient particles used by skin packs.
 *
 * Overlays are positioned with anchors that each character provides:
 *   anchors(pose) -> { x, y, top, side, sideY, badge: [x, y] }
 * All drawing happens in stage units and is a pure function of time, so it can be
 * exported as sprite frames later.
 */
(function (K) {
  'use strict';
  const U = K.util;
  const F = K.Face;
  const { TAU, fract, clamp, smoothstep } = U;

  const Z_COLOR = [214, 222, 255];
  const SWEAT = [140, 212, 255];
  const INK = [28, 18, 30];

  const DEFAULT_ANCHORS = { x: 0, y: 4, top: -30, side: 26, sideY: 2, badge: [22, -32] };

  function waves(ctx, p, env, a, A) {
    const col = U.lighten(p.tint, 0.1);
    ctx.lineCap = 'round';
    for (let side = -1; side <= 1; side += 2) {
      const ox = A.x + side * (A.side + 2);
      const oy = A.sideY;
      for (let i = 0; i < 3; i++) {
        const u = fract(p.tt / 0.8 + i / 3);
        const r = 4 + u * 11;
        const al = a * (1 - u) * smoothstep(0, 0.18, u);
        if (al < 0.01) continue;
        ctx.strokeStyle = env.c(col, al);
        ctx.lineWidth = 2.4 * (1 - u * 0.35);
        ctx.beginPath();
        const a0 = side > 0 ? -0.72 : Math.PI - 0.72;
        ctx.arc(ox, oy, r, a0, a0 + 1.44);
        ctx.stroke();
      }
    }
  }

  function dots(ctx, p, env, a, A) {
    const col = U.lighten(p.tint, 0.15);
    const bx = A.badge[0] - 6;
    const by = A.badge[1] + 2;
    for (let i = 0; i < 3; i++) {
      const ph = (p.tt / 0.8) * TAU - i * 0.95;
      const b = Math.max(0, Math.sin(ph));
      ctx.fillStyle = env.c(col, a * (0.4 + 0.6 * b));
      ctx.beginPath();
      ctx.arc(bx + i * 6.2, by - b * 3.4, 2.5, 0, TAU);
      ctx.fill();
    }
  }

  function sparkles(ctx, p, env, a, A) {
    const x = p.loopT;
    const col = U.lighten(p.tint, 0.35);
    const cy = A.y - 4;
    if (x < 1.0) {
      const u = x / 1.0;
      const e = U.easeOut(u);
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * TAU + 0.35 + (U.hash(i + 1) - 0.5) * 0.3;
        const d = 18 + e * 20 * (0.75 + 0.5 * U.hash(i + 9));
        const r = (4 - 2.8 * u) * (0.7 + 0.5 * U.hash(i + 3));
        const al = a * (1 - u * u);
        ctx.fillStyle = env.c(i % 3 === 0 ? U.WHITE : col, al);
        ctx.beginPath();
        U.star4(ctx, A.x + Math.cos(ang) * d, cy + Math.sin(ang) * d * 0.9, r);
        ctx.fill();
      }
    }
    for (let i = 0; i < 3; i++) {
      const start = 1.0 + i * 0.38;
      const k = clamp((x - start) / 0.7);
      if (k <= 0 || k >= 1) continue;
      const s = Math.sin(k * Math.PI);
      const ang = -2.2 + i * 1.6;
      const d = 30 + U.hash(i + 20) * 6;
      ctx.fillStyle = env.c(col, a * s);
      ctx.beginPath();
      U.star4(ctx, A.x + Math.cos(ang) * d, cy + Math.sin(ang) * d * 0.85, 2.8 * s + 0.4);
      ctx.fill();
    }
  }

  function burst(ctx, p, env, a, A) {
    const x = p.loopT;
    if (x > 0.6) return;
    const u = x / 0.6;
    ctx.strokeStyle = env.c(U.lighten(p.tint, 0.25), a * (1 - u) * 0.9);
    ctx.lineWidth = 3.4 * (1 - u) + 0.3;
    ctx.beginPath();
    ctx.arc(A.x, A.y - 4, 12 + 34 * U.easeOut(u), 0, TAU);
    ctx.stroke();
  }

  function recDot(ctx, p, env, a, A) {
    const pulse = 0.5 + 0.5 * U.osc(p.tt, K.state('recording').loop, 2);
    const x = A.rec ? A.rec[0] : -A.badge[0];
    const y = A.rec ? A.rec[1] : A.badge[1];
    F.glow(ctx, x, y, 8, p.tint, a * 0.5 * pulse, env);
    ctx.fillStyle = env.c(p.tint, a * (0.55 + 0.45 * pulse));
    ctx.beginPath();
    ctx.arc(x, y, 3.6, 0, TAU);
    ctx.fill();
  }

  function zzz(ctx, p, env, a, A) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < 3; i++) {
      const u = fract(p.tt / 2 + i / 3);
      const al = a * Math.sin(u * Math.PI);
      if (al < 0.02) continue;
      const sz = 2.2 + u * 2.6;
      const zx = A.badge[0] - 8 + u * 10 + Math.sin(u * TAU) * 1.4;
      const zy = A.badge[1] + 10 - u * 15;
      ctx.strokeStyle = env.c(Z_COLOR, al);
      ctx.lineWidth = Math.max(1, sz * 0.45);
      ctx.beginPath();
      ctx.moveTo(zx - sz, zy - sz);
      ctx.lineTo(zx + sz, zy - sz);
      ctx.lineTo(zx - sz, zy + sz);
      ctx.lineTo(zx + sz, zy + sz);
      ctx.stroke();
    }
  }

  function battery(ctx, p, env, a, A) {
    const [bx, by] = A.badge;
    const w = 12;
    const h = 6.6;
    const on = U.osc(p.tt, K.state('lowbattery').loop, 3) > -0.2 ? 1 : 0.25;
    ctx.save();
    ctx.translate(bx, by);
    ctx.strokeStyle = env.c([236, 236, 242], a);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    U.rr(ctx, -w / 2, -h / 2, w, h, 1.6);
    ctx.stroke();
    ctx.fillStyle = env.c([236, 236, 242], a);
    ctx.fillRect(w / 2 + 0.2, -1.4, 1.5, 2.8);
    ctx.fillStyle = env.c(K.tint(env.theme, 'recording'), a * on);
    ctx.beginPath();
    U.rr(ctx, -w / 2 + 1.7, -h / 2 + 1.7, 2.6, h - 3.4, 0.6);
    ctx.fill();
    ctx.restore();
  }

  function sweat(ctx, p, env, a, A) {
    const u = fract(p.tt / K.state('lowbattery').loop);
    const al = a * U.win(u, 0, 1, 0.2);
    if (al < 0.02) return;
    const x = A.x + A.side * 0.82 + 1;
    const y = (A.sweatY == null ? A.sideY - 10 : A.sweatY) + u * 5;
    ctx.fillStyle = env.c(SWEAT, al);
    ctx.beginPath();
    F.drop(ctx, x, y, 2.3);
    ctx.fill();
    ctx.fillStyle = env.c(U.WHITE, al * 0.8);
    ctx.beginPath();
    ctx.arc(x - 0.8, y - 0.4, 0.7, 0, TAU);
    ctx.fill();
  }

  function bang(ctx, p, env, a, A) {
    const [bx, by] = A.badge;
    const pop = 1 + 0.16 * Math.max(0, Math.sin((p.tt / 0.8) * TAU));
    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(pop, pop);
    ctx.fillStyle = env.c(p.tint, a);
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, TAU);
    ctx.moveTo(-4.6, 4.2);
    ctx.lineTo(-8.4, 8.6);
    ctx.lineTo(-1.6, 6.4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = env.c(INK, a);
    ctx.beginPath();
    U.rr(ctx, -1.25, -4.6, 2.5, 6, 1.25);
    ctx.arc(0, 3.4, 1.4, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function question(ctx, p, env, a, A) {
    const [bx, by] = A.badge;
    const bob = 1.2 * Math.sin((p.tt / K.state('confused').loop) * TAU * 2);
    ctx.save();
    ctx.translate(bx, by + bob);
    ctx.fillStyle = env.c(p.tint, a);
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, TAU);
    ctx.moveTo(-4.6, 4.2);
    ctx.lineTo(-8.4, 8.6);
    ctx.lineTo(-1.6, 6.4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = env.c(INK, a);
    ctx.lineWidth = 1.9;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-2.2, -2.2);
    ctx.quadraticCurveTo(-2.2, -4.7, 0, -4.7);
    ctx.quadraticCurveTo(2.3, -4.7, 2.3, -2.6);
    ctx.quadraticCurveTo(2.3, -1.1, 0.3, -0.5);
    ctx.lineTo(0.2, 0.9);
    ctx.stroke();
    ctx.fillStyle = env.c(INK, a);
    ctx.beginPath();
    ctx.arc(0.2, 3.5, 1.25, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function bolt(ctx, x, y, s) {
    ctx.moveTo(x + 0.35 * s, y - s);
    ctx.lineTo(x - 0.6 * s, y + 0.15 * s);
    ctx.lineTo(x - 0.02 * s, y + 0.15 * s);
    ctx.lineTo(x - 0.3 * s, y + s);
    ctx.lineTo(x + 0.62 * s, y - 0.2 * s);
    ctx.lineTo(x + 0.04 * s, y - 0.2 * s);
    ctx.closePath();
  }

  function charging(ctx, p, env, a, A) {
    const [bx, by] = A.badge;
    const L = K.state('charging').loop;
    const fill = 0.25 + 0.75 * U.easeInOut(U.fract(p.tt / L));
    const w = 13;
    const h = 7.4;
    ctx.save();
    ctx.translate(bx - 1, by);
    ctx.strokeStyle = env.c([236, 236, 242], a);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    U.rr(ctx, -w / 2, -h / 2, w, h, 1.8);
    ctx.stroke();
    ctx.fillStyle = env.c([236, 236, 242], a);
    ctx.fillRect(w / 2 + 0.2, -1.5, 1.5, 3);
    ctx.fillStyle = env.c(p.tint, a);
    ctx.beginPath();
    U.rr(ctx, -w / 2 + 1.6, -h / 2 + 1.6, (w - 3.2) * fill, h - 3.2, 0.7);
    ctx.fill();
    ctx.fillStyle = env.c(U.WHITE, a);
    ctx.beginPath();
    bolt(ctx, 0, 0, 3.3);
    ctx.fill();
    ctx.restore();
  }

  function micoff(ctx, p, env, a, A) {
    const [bx, by] = A.badge;
    ctx.save();
    ctx.translate(bx, by);
    ctx.strokeStyle = env.c([226, 230, 238], a);
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    U.rr(ctx, -2.3, -5.6, 4.6, 7.6, 2.3);
    ctx.moveTo(-4.4, -0.4);
    ctx.quadraticCurveTo(-4.4, 4.2, 0, 4.2);
    ctx.quadraticCurveTo(4.4, 4.2, 4.4, -0.4);
    ctx.moveTo(0, 4.2);
    ctx.lineTo(0, 6.4);
    ctx.stroke();
    ctx.strokeStyle = env.c(U.lighten(p.tint, 0.3), a);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-5.6, -6.2);
    ctx.lineTo(5.6, 6.6);
    ctx.stroke();
    ctx.restore();
  }

  // hello: sparkles pop beside the winking eye. No words, so it reads the same in every language.
  const POP_COL = U.rgb('#FFF4CC');
  function pop(ctx, p, env, a, A) {
    const x = p.loopT;
    const [bx, by] = A.badge;
    const stars = [
      [0.68, -7, 7, 3.4],
      [0.8, 2, -2, 4.6],
      [0.92, 8, 8, 2.8],
    ];
    for (let i = 0; i < stars.length; i++) {
      const [t0, dx, dy, r] = stars[i];
      const s = U.easeOutBack(U.clamp((x - t0) / 0.2)) * (1 - U.smoothstep(t0 + 0.42, t0 + 0.7, x));
      if (s < 0.02) continue;
      ctx.save();
      ctx.translate(bx + dx, by + dy + 5);
      ctx.rotate(0.35 * (1 - s) + i * 0.4);
      F.glow(ctx, 0, 0, r * 2.6 * s, POP_COL, 0.4 * a, env);
      ctx.fillStyle = env.c(POP_COL, a);
      ctx.beginPath();
      U.star4(ctx, 0, 0, r * s);
      ctx.fill();
      ctx.restore();
    }
  }

  function hearts(ctx, p, env, a, A) {
    const L = K.state('love').loop;
    const col = U.lighten(p.tint, 0.15);
    for (let i = 0; i < 4; i++) {
      const u = fract(p.tt / L + i / 4);
      const al = a * Math.sin(u * Math.PI);
      if (al < 0.02) continue;
      const side = i % 2 ? 1 : -1;
      const x = A.x + side * (A.side + 2 + 3 * U.hash(i + 4)) + 2 * Math.sin(u * TAU + i);
      const y = A.y + 6 - u * 30;
      ctx.fillStyle = env.c(col, al);
      ctx.beginPath();
      F.heart(ctx, x, y, 2.6 + 1.6 * U.hash(i + 1));
      ctx.fill();
    }
  }

  const DRAWERS = { waves, dots, sparkles, burst, rec: recDot, zzz, battery, sweat, bang, question, bolt: charging, micoff, pop, hearts };
  const ORDER = ['burst', 'waves', 'dots', 'sparkles', 'rec', 'zzz', 'battery', 'sweat', 'bang', 'question', 'bolt', 'micoff', 'pop', 'hearts'];

  /** Draw a pose's overlays at overall alpha `alpha` (used to cross-fade during state changes). */
  function draw(ctx, pose, env, alpha, anchors) {
    if (alpha <= 0.01) return;
    const A = Object.assign({}, DEFAULT_ANCHORS, anchors || {});
    for (let i = 0; i < ORDER.length; i++) {
      const key = ORDER[i];
      const v = pose.fx[key];
      if (v && v > 0.01) {
        ctx.save();
        DRAWERS[key](ctx, pose, env, v * alpha, A);
        ctx.restore();
      }
    }
  }

  /* ------------------------------------------------------- ambient particles */

  // env.rate(hz) snaps a rate to whole cycles per loop when exporting sprites, so ambient
  // motion loops seamlessly too; live it returns hz unchanged.
  function ambient(ctx, kind, t, env, layer) {
    const B = env.bounds;
    const W = B.x1 - B.x0;
    const H = B.y1 - B.y0;
    const rate = env.rate || ((hz) => hz);
    const wave = (hz, ph) => Math.sin(TAU * (rate(hz) * t + (ph || 0)));
    ctx.save();
    switch (kind) {
      case 'snow': {
        if (layer !== 'front') break;
        for (let i = 0; i < 22; i++) {
          const sp = 5 + 7 * U.hash(i * 1.3);
          const x = B.x0 + U.hash(i * 3.1) * W + 2.6 * wave(0.143, i / TAU);
          const y = B.y0 - 3 + fract(U.hash(i * 7.3) + t * rate(sp / (H + 6))) * (H + 6);
          const r = 0.7 + 1.1 * U.hash(i * 1.7);
          ctx.fillStyle = env.c(U.WHITE, 0.55 + 0.4 * U.hash(i * 5.1));
          ctx.beginPath();
          ctx.arc(x, y, r, 0, TAU);
          ctx.fill();
        }
        break;
      }
      case 'petals': {
        if (layer !== 'front') break;
        for (let i = 0; i < 11; i++) {
          const sp = 5 + 5 * U.hash(i * 2.1);
          const u = fract(U.hash(i * 4.7) + t * rate(sp / (H + 10)));
          const x = B.x0 + fract(U.hash(i * 3.3) + u * 0.35) * W + 3 * wave(0.207, (i * 2) / TAU);
          const y = B.y0 - 5 + u * (H + 10);
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(TAU * rate((1 + U.hash(i)) / TAU) * t + i);
          ctx.scale(1, 0.55 + 0.45 * wave(0.35, i / TAU));
          ctx.fillStyle = env.c([255, 183, 210], 0.9);
          ctx.beginPath();
          U.ellipse(ctx, 0, 0, 2.3, 1.4);
          ctx.fill();
          ctx.restore();
        }
        break;
      }
      case 'fireflies': {
        if (layer !== 'back') break;
        for (let i = 0; i < 7; i++) {
          const x = B.x0 + W * (0.5 + 0.42 * wave((0.21 + 0.1 * U.hash(i)) / TAU, (i * 2.3) / TAU));
          const y = B.y0 + H * (0.5 + 0.4 * wave((0.17 + 0.08 * U.hash(i + 4)) / TAU, (i * 1.7) / TAU));
          const tw = 0.5 + 0.5 * wave((2 + U.hash(i + 2) * 2) / TAU, i / TAU);
          F.glow(ctx, x, y, 6, [232, 255, 120], 0.45 * tw, env);
          ctx.fillStyle = env.c([245, 255, 190], 0.6 + 0.4 * tw);
          ctx.beginPath();
          ctx.arc(x, y, 1, 0, TAU);
          ctx.fill();
        }
        break;
      }
      case 'sparkles': {
        if (layer !== 'back') break;
        for (let i = 0; i < 7; i++) {
          const x = B.x0 + W * (0.08 + 0.84 * U.hash(i * 9.1));
          const y = B.y0 + H * (0.06 + 0.5 * U.hash(i * 2.9));
          const s = Math.max(0, wave(0.255, (i * 2.1) / TAU));
          if (s < 0.02) continue;
          ctx.fillStyle = env.c([255, 214, 102], 0.9 * s);
          ctx.beginPath();
          U.star4(ctx, x, y, 0.6 + 2.4 * s);
          ctx.fill();
        }
        break;
      }
      case 'bats': {
        if (layer !== 'back') break;
        for (let i = 0; i < 3; i++) {
          const sp = 0.07 + 0.03 * U.hash(i);
          const u = fract(U.hash(i * 5.5) + t * rate(sp));
          const x = B.x0 - 8 + u * (W + 16);
          const y = B.y0 + H * (0.12 + 0.22 * U.hash(i * 3.7)) + 3 * wave(0.318, i / TAU);
          const f = wave(1.91, (i * 2) / TAU);
          ctx.save();
          ctx.translate(x, y);
          ctx.fillStyle = env.c([150, 120, 210], 0.9);
          ctx.beginPath();
          ctx.ellipse(0, 0, 1.5, 1.9, 0, 0, TAU);
          ctx.moveTo(-1.2, -0.4);
          ctx.quadraticCurveTo(-4, -3.2 * f - 1, -6.4, -0.6 * f);
          ctx.quadraticCurveTo(-4.4, 0.2, -3.2, 1.1);
          ctx.quadraticCurveTo(-2.2, 0.4, -1.2, 0.8);
          ctx.moveTo(1.2, -0.4);
          ctx.quadraticCurveTo(4, -3.2 * f - 1, 6.4, -0.6 * f);
          ctx.quadraticCurveTo(4.4, 0.2, 3.2, 1.1);
          ctx.quadraticCurveTo(2.2, 0.4, 1.2, 0.8);
          ctx.fill();
          ctx.restore();
        }
        break;
      }
      case 'confetti': {
        if (layer !== 'front') break;
        const cols = [[255, 92, 138], [255, 216, 77], [74, 168, 255], [74, 222, 128], [169, 139, 255]];
        for (let i = 0; i < 16; i++) {
          const sp = 8 + 6 * U.hash(i * 2.7);
          const u = fract(U.hash(i * 6.1) + t * rate(sp / (H + 10)));
          const x = B.x0 + U.hash(i * 3.9) * W + 2.5 * wave(0.25, i / TAU);
          const y = B.y0 - 5 + u * (H + 10);
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(TAU * rate(0.3 + 0.4 * U.hash(i)) * t + i);
          ctx.scale(wave(0.8 + 0.6 * U.hash(i * 1.9), i / TAU), 1);
          ctx.fillStyle = env.c(cols[i % cols.length], 0.95);
          ctx.fillRect(-1.4, -0.85, 2.8, 1.7);
          ctx.restore();
        }
        break;
      }
      case 'rain': {
        if (layer !== 'back') break;
        ctx.lineCap = 'round';
        for (let i = 0; i < 20; i++) {
          const sp = 42 + 20 * U.hash(i * 1.7);
          const u = fract(U.hash(i * 5.3) + t * rate(sp / (H + 12)));
          const x = B.x0 + U.hash(i * 2.3) * (W + 6) - u * 4;
          const y = B.y0 - 6 + u * (H + 12);
          ctx.strokeStyle = env.c([150, 200, 255], 0.3 + 0.3 * U.hash(i * 9.1));
          ctx.lineWidth = 0.7 + 0.4 * U.hash(i * 4.4);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - 1.1, y + 4.6);
          ctx.stroke();
        }
        break;
      }
      case 'notes': {
        if (layer !== 'back') break;
        const cols = [[169, 139, 255], [74, 168, 255], [255, 120, 170]];
        const mid = (B.x0 + B.x1) / 2;
        for (let i = 0; i < 6; i++) {
          const u = fract(U.hash(i * 3.3) + t * rate(0.2 + 0.08 * U.hash(i)));
          const side = i % 2 ? 1 : -1;
          const x = mid + side * (W * 0.33 + 4 * U.hash(i * 7.7)) + 3 * wave(0.5, i / TAU);
          const y = B.y1 - 10 - u * H * 0.7;
          const a = Math.sin(Math.PI * u);
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(0.25 * wave(0.4, i / TAU));
          ctx.fillStyle = env.c(cols[i % 3], 0.9 * a);
          ctx.beginPath();
          U.ellipse(ctx, 0, 0, 2, 1.45, -0.4);
          ctx.fill();
          ctx.fillRect(1.25, -6.4, 0.75, 6.2);
          if (i % 3 === 0) {
            ctx.beginPath();
            U.ellipse(ctx, 4.6, -1, 2, 1.45, -0.4);
            ctx.fill();
            ctx.fillRect(5.85, -7.4, 0.75, 6.2);
            ctx.beginPath();
            ctx.moveTo(1.25, -6.4);
            ctx.lineTo(6.6, -7.4);
            ctx.lineTo(6.6, -5.8);
            ctx.lineTo(1.25, -4.8);
            ctx.closePath();
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.moveTo(2, -6.4);
            ctx.quadraticCurveTo(4.6, -5, 3.8, -2.6);
            ctx.quadraticCurveTo(3.7, -4.2, 2, -4.6);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
        }
        break;
      }
      case 'stars': {
        if (layer !== 'back') break;
        const mx = B.x0 + W * 0.25;
        const my = B.y0 + H * 0.25;
        F.glow(ctx, mx, my, 15, [255, 232, 160], 0.35, env);
        ctx.fillStyle = env.c([255, 241, 196]);
        ctx.beginPath();
        ctx.arc(mx, my, 5.2, 0, TAU);
        ctx.fill();
        ctx.fillStyle = env.c([226, 206, 150], 0.7);
        ctx.beginPath();
        ctx.arc(mx - 1.6, my - 1.2, 1.2, 0, TAU);
        ctx.arc(mx + 1.8, my + 1.4, 0.9, 0, TAU);
        ctx.arc(mx + 0.6, my - 2.4, 0.6, 0, TAU);
        ctx.fill();
        for (let i = 0; i < 10; i++) {
          const x = B.x0 + W * (0.1 + 0.8 * U.hash(i * 4.3));
          const y = B.y0 + H * (0.08 + 0.6 * U.hash(i * 8.1));
          if (Math.hypot(x - mx, y - my) < 13) continue;
          const tw = 0.5 + 0.5 * wave(0.3 + 0.3 * U.hash(i), i / TAU);
          ctx.fillStyle = env.c([255, 250, 225], 0.3 + 0.65 * tw);
          ctx.beginPath();
          U.star4(ctx, x, y, 0.7 + 1.5 * tw);
          ctx.fill();
        }
        break;
      }
      default:
        break;
    }
    ctx.restore();
  }

  /* ---------------------------------------------------- transition overlays */

  // Stage-space extras for the designed moves in states.js (the screen-edge ring for
  // "save" lives in screen.js because it follows the screen shape).
  const TRANSITION_FX = {
    flare(ctx, fr, env, A) {
      const u = fr.u;
      const col = U.lighten(fr.poseA ? fr.poseA.tint : fr.pose.tint, 0.15);
      const tx = A.x;
      const ty = A.top + 6;
      const ember = fr.poseA && 'orbitR' in fr.poseA.ex;
      if (!ember && u < 0.45) {
        const g = U.easeIn(u / 0.45);
        for (let i = 0; i < 3; i++) {
          const sx = A.badge[0] - 6 + i * 6.2;
          const sy = A.badge[1] + 2;
          ctx.fillStyle = env.c(col, 1 - 0.3 * g);
          ctx.beginPath();
          ctx.arc(U.lerp(sx, tx, g), U.lerp(sy, ty, g), 2.5 * (1 - 0.5 * g), 0, TAU);
          ctx.fill();
        }
      }
      const fl = U.hop(u, 0.38, 0.72);
      if (fl > 0.01) F.glow(ctx, A.x, A.y - 4, 18 + 30 * fl, U.WHITE, 0.55 * fl, env);
      if (u > 0.42 && u < 0.9) {
        const v = (u - 0.42) / 0.48;
        ctx.strokeStyle = env.c(U.lighten(fr.pose.tint, 0.3), 0.9 * (1 - v));
        ctx.lineWidth = 3 * (1 - v) + 0.4;
        ctx.beginPath();
        ctx.arc(A.x, A.y - 4, 14 + 32 * U.easeOut(v), 0, TAU);
        ctx.stroke();
      }
    },
    gather(ctx, fr, env, A) {
      const u = fr.u;
      if (u > 0.75) return;
      const col = U.lighten(fr.poseA ? fr.poseA.tint : fr.pose.tint, 0.1);
      ctx.lineCap = 'round';
      for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i < 3; i++) {
          const v = U.clamp(u / 0.75 + i * 0.12);
          const r = 16 - 13 * U.easeIn(v);
          const al = (1 - v) * U.smoothstep(0, 0.1, u);
          if (al < 0.02 || r < 1) continue;
          ctx.strokeStyle = env.c(col, al);
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          const a0 = side > 0 ? -0.72 : Math.PI - 0.72;
          ctx.arc(A.x + side * (A.side + 2), A.sideY, r, a0, a0 + 1.44);
          ctx.stroke();
        }
      }
    },
    mute(ctx, fr, env, A) {
      const u = fr.u;
      const g = U.smoothstep(0.15, 0.6, u);
      const al = 1 - U.smoothstep(0.75, 1, u);
      if (g < 0.01 || al < 0.01) return;
      ctx.strokeStyle = env.c(U.lighten(K.tint(env.theme, 'privacy'), 0.35), al);
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(A.x - 22, A.y - 24);
      ctx.lineTo(A.x - 22 + 44 * g, A.y - 24 + 46 * g);
      ctx.stroke();
    },
    plug(ctx, fr, env, A) {
      const a = U.hop(fr.u, 0.05, 0.5);
      if (a < 0.02) return;
      F.glow(ctx, A.x, A.y - 4, 30, K.tint(env.theme, 'charging'), 0.5 * a, env);
      ctx.fillStyle = env.c(U.lighten(K.tint(env.theme, 'charging'), 0.4), a);
      ctx.beginPath();
      bolt(ctx, A.x, A.y - 4, 10 + 6 * a);
      ctx.fill();
    },
    swoon(ctx, fr, env, A) {
      const v = U.clamp((fr.u - 0.2) / 0.7);
      if (v <= 0 || v >= 1) return;
      const col = U.lighten(K.tint(env.theme, 'love'), 0.15);
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * TAU + 0.5;
        const d = 12 + 26 * U.easeOut(v);
        ctx.fillStyle = env.c(col, 1 - v);
        ctx.beginPath();
        F.heart(ctx, A.x + Math.cos(ang) * d, A.y - 4 + Math.sin(ang) * d * 0.85, 2.6 * (1 - 0.4 * v));
        ctx.fill();
      }
    },
    greet(ctx, fr, env, A) {
      const v = U.clamp((fr.u - 0.08) / 0.7);
      if (v <= 0 || v >= 1) return;
      for (let i = 0; i < 5; i++) {
        const ang = -Math.PI / 2 + (i - 2) * 0.55;
        const d = 22 + 14 * U.easeOut(v);
        ctx.fillStyle = env.c(i % 2 ? U.WHITE : [255, 226, 140], 1 - v);
        ctx.beginPath();
        U.star4(ctx, A.x + Math.cos(ang) * d, A.y - 4 + Math.sin(ang) * d, 3.2 * (1 - v) + 0.6);
        ctx.fill();
      }
    },
    wake(ctx, fr, env, A) {
      const a = U.hop(fr.u, 0.12, 0.62);
      if (a < 0.02) return;
      ctx.strokeStyle = env.c([236, 236, 242], a);
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      [-0.55, 0, 0.55].forEach((ang) => {
        const x = A.x + Math.sin(ang) * 4;
        const y = A.top + 2;
        ctx.beginPath();
        ctx.moveTo(x + Math.sin(ang) * 3, y - Math.cos(ang) * 3);
        ctx.lineTo(x + Math.sin(ang) * (6 + 3 * a), y - Math.cos(ang) * (6 + 3 * a));
        ctx.stroke();
      });
    },
  };

  /** Draw the stage-space overlay of a running transition (fr = { tr, u, pose, poseA, poseB }). */
  function transition(ctx, fr, env, anchors) {
    if (!fr || !fr.tr) return;
    const fn = TRANSITION_FX[fr.tr.id];
    if (!fn) return;
    ctx.save();
    fn(ctx, fr, env, Object.assign({}, DEFAULT_ANCHORS, anchors || {}));
    ctx.restore();
  }

  K.FX = { draw, ambient, transition, DEFAULT_ANCHORS, ORDER };
})(window.Bud);
