/* Eyes ("Bud"): two expressive eyes and a little horn that doubles as a status light.
 *
 * The chosen direction. Everything reads from the eyes: lids for mood, shape for
 * emotion (happy arcs, hearts, a wink), size and position for attention. The horn tip
 * glows in the state color and perks up or droops with the mood. When Bud speaks, a
 * small voice bar appears under the eyes; otherwise there is no mouth.
 */
(function (K) {
  'use strict';
  const U = K.util;
  const F = K.Face;
  const { TAU, mix, clamp, lerp } = U;

  const W0 = 22;
  const H0 = 30;
  const R0 = 10;
  const GAP = 18.5;
  const CY = 2; // eye line on the stage

  const exDefaults = () => ({ voice: 0, h: 1, round: 0, horn: 0, perk: 0, droop: 0, bar: 0 });

  function rectEye(ctx, p, env, side, col, e, pal) {
    const L = F.lids(p, side);
    const es = side < 0 ? p.eyeL : p.eyeR;
    const hp = Math.max(p.happy, side < 0 ? p.winkL : p.winkR);
    const wide = 1 + 0.14 * p.wide;
    const persp = p.lookX * side;
    const blinkBulge = 1 + 0.1 * (1 - p.eyeOpen);
    let w = W0 * wide * es * blinkBulge * (1 + 0.07 * persp);
    let h = H0 * wide * es * e.h * (1 + 0.05 * persp) * (1 - 0.3 * hp);
    if (L.asym < 0) h *= 1 - L.asym * 0.15;
    const r = lerp(R0, Math.min(w, h) / 2, e.round);
    const cx = side * GAP * (1 + 0.1 * p.wide) + p.lookX * 6;
    const cy = p.lookY * 5 - hp * 2;
    const open = Math.max(0.09, p.eyeOpen);
    const shut = Math.max(p.closed, p.heart);

    if (shut < 0.99) {
      ctx.save();
      ctx.globalAlpha *= clamp(1 - shut * 1.5);
      const hh = h * open;
      F.lidClip(ctx, cx, cy, w / 2, hh / 2, L.top, L.slope, L.bot);
      if (hp > 0.01) {
        const rr = w * 0.62;
        const d = hh * 0.62 * hp;
        ctx.beginPath();
        ctx.rect(cx - w, cy - hh, w * 2, hh * 2 + rr * 2);
        ctx.arc(cx, cy + hh / 2 + rr - d, rr, 0, TAU);
        ctx.clip('evenodd');
      }
      const g = ctx.createLinearGradient(0, cy - hh / 2, 0, cy + hh / 2);
      g.addColorStop(0, env.c(U.lighten(col, 0.22)));
      g.addColorStop(1, env.c(col));
      ctx.beginPath();
      U.rr(ctx, cx - w / 2, cy - hh / 2, w, hh, Math.min(r, hh / 2));
      ctx.fillStyle = g;
      ctx.fill();
      if (open > 0.5 && hp < 0.5) {
        const hs = w * 0.21 * (0.9 + 0.12 * p.sparkle);
        ctx.fillStyle = env.c(U.WHITE, 0.88);
        ctx.beginPath();
        U.rr(ctx, cx - w * 0.31 + p.lookX * 1.5, cy - hh * 0.33, hs, hs, hs * 0.38);
        ctx.fill();
        ctx.fillStyle = env.c(U.WHITE, 0.55);
        ctx.beginPath();
        ctx.arc(cx + w * 0.2 + p.lookX * 1.2, cy + hh * 0.26, w * 0.065, 0, TAU);
        ctx.fill();
        if (p.sparkle > 1.15) {
          ctx.globalAlpha *= clamp((p.sparkle - 1.15) / 0.4);
          ctx.fillStyle = env.c(U.WHITE, 0.9);
          ctx.beginPath();
          ctx.arc(cx + w * 0.12, cy - hh * 0.05, hs * 0.3, 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
    }
    if (p.closed > 0.01) {
      ctx.save();
      ctx.globalAlpha *= clamp(p.closed * 1.4);
      ctx.strokeStyle = env.c(col);
      ctx.lineWidth = 3.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.42, cy + 2);
      ctx.quadraticCurveTo(cx, cy + 8, cx + w * 0.42, cy + 2);
      ctx.stroke();
      ctx.restore();
    }
    if (p.heart > 0.01) {
      const beat = 1 + 0.06 * (p.sy - 1) * 10;
      const s = W0 * 0.62 * es * beat;
      const hc = mix(K.tint(env.theme, 'love'), pal.eye, 0.12);
      ctx.save();
      ctx.globalAlpha *= clamp(p.heart * 1.4);
      F.glow(ctx, cx, cy, s * 1.8, hc, 0.22, env);
      const hg = ctx.createLinearGradient(0, cy - s, 0, cy + s);
      hg.addColorStop(0, env.c(U.lighten(hc, 0.25)));
      hg.addColorStop(1, env.c(hc));
      ctx.fillStyle = hg;
      ctx.beginPath();
      F.heart(ctx, cx, cy, s);
      ctx.fill();
      ctx.fillStyle = env.c(U.WHITE, 0.8);
      ctx.beginPath();
      U.ellipse(ctx, cx - s * 0.42, cy - s * 0.35, s * 0.2, s * 0.14, -0.6);
      ctx.fill();
      ctx.restore();
    }
  }

  /** The horn: a rounded nub whose tip is Bud's status light. */
  function horn(ctx, p, env, pal, e) {
    const L = K.state(p.state).loop;
    const tilt = 0.22 + 0.05 * e.horn - 0.35 * e.perk * 0.4 + 0.55 * e.droop;
    ctx.save();
    ctx.translate(-1 + p.lookX * 3, -19.5 + p.lookY * 2 - p.wide * 2 - 1.5 * e.perk + 2.5 * e.droop);
    ctx.rotate(tilt);
    ctx.scale(1, 1 + 0.12 * e.perk - 0.15 * e.droop);
    ctx.beginPath();
    ctx.moveTo(-4.2, 2);
    ctx.quadraticCurveTo(-3.9, -4.6, 0.3, -9.2);
    ctx.quadraticCurveTo(2.1, -10.4, 3, -8.4);
    ctx.quadraticCurveTo(4.4, -3.2, 4.2, 2);
    ctx.closePath();
    ctx.fillStyle = env.c(mix(pal.horn, p.tint, p.tintAmt * 0.35));
    ctx.fill();
    // status light: always softly on, pulses at rest, takes the state color otherwise
    const idlePulse = 0.45 + 0.35 * Math.max(0, U.osc(p.tt, L, Math.max(1, Math.round(L / 3))));
    const led = p.tintAmt > 0.05 ? mix(pal.eye, p.tint, p.tintAmt) : pal.eye;
    const ledA = (p.tintAmt > 0.05 ? 0.6 + 0.4 * p.tintAmt : idlePulse) * (1 - 0.6 * e.droop);
    F.glow(ctx, 1.2, -8.1, 7, led, 0.55 * ledA, env);
    ctx.fillStyle = env.c(U.lighten(led, 0.25), ledA);
    ctx.beginPath();
    ctx.arc(1.25, -8.1, 1.7, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /** Speaking: five rounded bars under the eyes, driven by the voice envelope. */
  function voiceBar(ctx, p, env, col, amt) {
    if (amt < 0.02) return;
    const L = K.state('speaking').loop;
    ctx.save();
    ctx.globalAlpha *= amt;
    ctx.translate(p.lookX * 4, H0 / 2 + 9 + p.lookY * 3);
    ctx.strokeStyle = env.c(col);
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.6;
    for (let i = 0; i < 5; i++) {
      const lvl = 0.35 + 0.65 * Math.abs(U.osc(p.tt, L, 5 + (i % 3), i * 0.13)) * (0.55 + 0.45 * (p.ex.voice || 0));
      const hh = 1.5 + 6.5 * lvl * (i === 0 || i === 4 ? 0.6 : 1);
      const x = (i - 2) * 4.4;
      ctx.beginPath();
      ctx.moveTo(x, -hh / 2);
      ctx.lineTo(x, hh / 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  K.registerCharacter({
    id: 'eyes',
    label: 'Eyes',
    kr: '눈',
    tagline: 'Two eyes and a little horn',
    blurb: 'The chosen direction: two expressive eyes and a little horn whose tip is the status light. Everything reads from the eyes, so it stays clear at tiny sizes, and the black around it keeps the screen cheap to run.',
    swatch: ['eye', 'horn', 'cheek'],
    palettes: {
      classic: { eye: '#79F7E6', horn: '#46B9AA', cheek: '#FF8FB1', tint: '#79F7E6', bg: '#0E2230' },
      night: { eye: '#B6A6FF', horn: '#7A6BDE', cheek: '#FF8FC8', tint: '#B6A6FF', bg: '#0D0B22' },
      sakura: { eye: '#FF9EC8', horn: '#D36F9A', cheek: '#FFD3E4', tint: '#FF9EC8', bg: '#2B0F1E' },
      mint: { eye: '#86FFC3', horn: '#46AE7E', cheek: '#FFA3B5', tint: '#86FFC3', bg: '#0B2219' },
      dancheong: { eye: '#FFD34E', horn: '#E8402E', cheek: '#FF8A70', tint: '#FFD34E', bg: '#13305E' },
      mono: { eye: '#FFFFFF', horn: '#A6A6A6', cheek: '#8A8A8A', tint: '#FFFFFF', bg: '#111111' },
    },

    pose(p, state, tt) {
      p.ex = Object.assign(exDefaults(), p.ex);
      const e = p.ex;
      const L = K.state(state).loop;
      e.horn = U.osc(tt, L, 1, 0.2);
      switch (state) {
        case 'listening':
          e.h = 1.04 + 0.12 * e.voice;
          e.perk = 0.7;
          break;
        case 'thinking':
          e.horn = 1.5 * U.osc(tt, L, 2);
          break;
        case 'speaking':
          e.h = 1 + 0.06 * e.voice;
          e.bar = 1;
          e.perk = 0.4;
          p.y += 0.6 * e.voice;
          break;
        case 'done':
          e.round = 0.3;
          break;
        case 'needsyou':
          e.round = 1;
          e.perk = 1;
          break;
        case 'hello':
          e.round = 0.5;
          e.perk = 1;
          break;
        case 'confused':
          e.horn = 0.8 * U.osc(tt, L, 1, 0.5);
          break;
        case 'charging':
          // blissed out while it charges: soft smiling eyes, flat relaxed lids, slow breath
          p.happy = 0.55 + 0.08 * U.osc(tt, L, 1);
          p.sleepy = 0.36;
          p.browTilt = 0.34;
          p.lookY = 0.1;
          e.perk = 0.3;
          break;
        case 'sleeping':
          e.droop = 1;
          break;
        case 'lowbattery':
          e.droop = 0.7;
          break;
        case 'privacy':
          e.droop = 0.5;
          break;
        default:
          break;
      }
      return p;
    },

    fidget(p, id, u) {
      const e = p.ex;
      if (id === 'hop') e.perk = Math.max(e.perk, U.hop(u, 0.1, 0.8));
      if (id === 'yawn') e.droop = Math.max(e.droop, 0.6 * U.win(u, 0.1, 0.78, 0.18));
      if (id === 'look') e.horn += 1.2 * Math.sin(u * Math.PI * 2);
    },

    anchors(p) {
      return { x: p.x, y: p.y + CY, top: p.y - 18, side: GAP + W0 / 2 + 1, sideY: p.y + CY, sweatY: p.y - 10, badge: [25, -28], rec: [-26, -28] };
    },

    draw(ctx, p, pal, env) {
      const e = p.ex;
      const col = mix(pal.eye, p.tint, p.tintAmt * 0.85);
      ctx.save();
      ctx.translate(p.x, p.y + CY);
      ctx.rotate(p.rot);
      ctx.scale(p.sx, p.sy);

      F.glow(ctx, -GAP, 0, 26, col, 0.22 * p.glow, env);
      F.glow(ctx, GAP, 0, 26, col, 0.22 * p.glow, env);

      env.acc(ctx, 'head', { x: p.lookX * 3, y: -21 + p.lookY * 2 - p.wide * 2, w: 46, ear: [34, 21] });
      horn(ctx, p, env, pal, e);

      // cheeks only show when Bud is properly happy (done, a wink, love); faint ones read as smudges
      const joy = Math.max(p.happy, p.winkL, p.winkR, p.heart);
      const cheekA = U.smoothstep(0.3, 0.6, joy) * Math.min(1, p.blush * 1.2) * 0.85;
      if (cheekA > 0.02) {
        ctx.fillStyle = env.c(pal.cheek, cheekA);
        for (let s = -1; s <= 1; s += 2) {
          ctx.beginPath();
          U.ellipse(ctx, s * (GAP + W0 * 0.42) + p.lookX * 6, H0 * 0.5 + 1 + p.lookY * 4, 4.6, 2.5);
          ctx.fill();
        }
      }

      rectEye(ctx, p, env, -1, col, e, pal);
      rectEye(ctx, p, env, 1, col, e, pal);
      voiceBar(ctx, p, env, col, e.bar);

      const wide = 1 + 0.14 * p.wide;
      env.acc(ctx, 'face', { x: p.lookX * 6, y: p.lookY * 5, dx: GAP * (1 + 0.1 * p.wide), rx: (W0 / 2) * wide, ry: (H0 / 2) * wide });
      env.acc(ctx, 'neck', { x: 0, y: 25, w: 44 });
      ctx.restore();
      env.acc(ctx, 'item', { x: p.x - 33, y: p.y + 30, w: 1 });
    },
  });
})(window.Bud);
