/* Accessories (hats, neckwear, held items) and skin packs.
 *
 * Characters decide where things go by calling env.acc(ctx, slot, anchor) while
 * they draw, with anchor = { x, y, w, rot } in their own local coordinates:
 *   head: bottom-center of where a hat sits, w = head width (optional ear: [dx, dy] from
 *         the anchor to where headphone cups go)
 *   face: center between the eyes, dx = half the eye spacing, rx/ry = one eye's half size
 *   neck: center of where a scarf wraps, w = width to wrap
 *   item: where a held item hangs, w = scale (1 = about 13 stage units tall)
 * Add a new accessory by adding a drawer below and listing it in ACCESSORIES or a pack.
 */
(function (K) {
  'use strict';
  const U = K.util;
  const F = K.Face;
  const { TAU } = U;

  const C = {
    pumpkin: U.rgb('#FF8A1F'),
    pumpkinDark: U.rgb('#D96400'),
    stem: U.rgb('#4E8F2E'),
    carve: U.rgb('#FFE066'),
    gat: U.rgb('#23232B'),
    gatEdge: U.rgb('#A9A9BC'),
    bead: U.rgb('#E8C07A'),
    petal: U.rgb('#FFB7CF'),
    petalDeep: U.rgb('#FF5C8A'),
    witch: U.rgb('#6B4BD8'),
    witchBand: U.rgb('#FF9A2E'),
    lanternBlue: U.rgb('#2F5DA8'),
    lanternRed: U.rgb('#D9452B'),
    gold: U.rgb('#F2C14E'),
    light: U.rgb('#FFE7A0'),
    pouch: U.rgb('#E8402E'),
    pouchDark: U.rgb('#B52A1E'),
    saekdong: ['#E8402E', '#F2C14E', '#2E8B6E', '#2F5DA8', '#F28AB2'].map(U.rgb),
    earPink: U.rgb('#FF9EBB'),
    gemRed: U.rgb('#E5484D'),
    gemBlue: U.rgb('#4AA8FF'),
    phones: U.rgb('#ECECF2'),
    lens: U.rgb('#14161C'),
    cup: U.rgb('#F7F3EC'),
    sleeve: U.rgb('#B07A4F'),
    canopyRib: U.rgb('#FFFFFF'),
  };

  /** Gentle sway; loop-safe when exporting sprites (env.wave), plain sine otherwise. */
  function sway(env, k, ph) {
    return env.wave ? env.wave(k / TAU, (ph || 0) / TAU) : Math.sin(env.t * k + (ph || 0));
  }

  function begin(ctx, a) {
    ctx.save();
    ctx.translate(a.x, a.y);
    if (a.rot) ctx.rotate(a.rot);
  }

  /* ------------------------------------------------------------------ hats */

  function beanie(ctx, a, env) {
    const col = env.accColors;
    const w = a.w;
    const hw = w * 0.5;
    const cuffH = w * 0.2;
    const domeH = w * 0.5;
    begin(ctx, a);
    ctx.beginPath();
    ctx.moveTo(-hw * 0.94, -cuffH * 0.5);
    ctx.bezierCurveTo(-hw * 0.98, -cuffH - domeH * 1.1, hw * 0.98, -cuffH - domeH * 1.1, hw * 0.94, -cuffH * 0.5);
    ctx.closePath();
    ctx.fillStyle = env.c(col.hat);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = env.c(U.darken(col.hat, 0.2), 0.55);
    ctx.lineWidth = Math.max(0.6, w * 0.03);
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(i * hw * 0.26, -cuffH);
      ctx.quadraticCurveTo(i * hw * 0.2, -cuffH - domeH * 0.6, i * hw * 0.08, -cuffH - domeH);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = env.c(U.darken(col.hat, 0.1));
    ctx.beginPath();
    U.rr(ctx, -hw, -cuffH, hw * 2, cuffH, cuffH * 0.45);
    ctx.fill();
    ctx.strokeStyle = env.c(U.darken(col.hat, 0.3), 0.5);
    ctx.lineWidth = Math.max(0.5, w * 0.025);
    for (let i = -5; i <= 5; i++) {
      ctx.beginPath();
      ctx.moveTo(i * hw * 0.17, -cuffH * 0.8);
      ctx.lineTo(i * hw * 0.17, -cuffH * 0.2);
      ctx.stroke();
    }
    const py = -cuffH - domeH * 0.84 - w * 0.07;
    ctx.fillStyle = env.c(col.hat2);
    ctx.beginPath();
    ctx.arc(0, py, w * 0.15, 0, TAU);
    ctx.fill();
    ctx.fillStyle = env.c(U.darken(col.hat2, 0.12));
    ctx.beginPath();
    ctx.arc(w * 0.04, py + w * 0.05, w * 0.07, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function gat(ctx, a, env) {
    const w = a.w;
    begin(ctx, a);
    ctx.lineWidth = Math.max(0.6, w * 0.035);
    ctx.fillStyle = env.c(C.gat, 0.9);
    ctx.strokeStyle = env.c(C.gatEdge, 0.85);
    ctx.beginPath();
    U.ellipse(ctx, 0, -w * 0.02, w * 0.78, w * 0.12);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-w * 0.25, -w * 0.06);
    ctx.lineTo(-w * 0.23, -w * 0.42);
    ctx.quadraticCurveTo(0, -w * 0.5, w * 0.23, -w * 0.42);
    ctx.lineTo(w * 0.25, -w * 0.06);
    ctx.quadraticCurveTo(0, w * 0.02, -w * 0.25, -w * 0.06);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = env.c(C.gatEdge, 0.5);
    ctx.beginPath();
    ctx.moveTo(-w * 0.24, -w * 0.13);
    ctx.quadraticCurveTo(0, -w * 0.08, w * 0.24, -w * 0.13);
    ctx.stroke();
    // beaded chin string (갓끈) hanging off the far side of the brim
    ctx.fillStyle = env.c(C.bead);
    for (let i = 0; i < 6; i++) {
      const u = i / 5;
      ctx.beginPath();
      ctx.arc(-w * (0.6 + 0.08 * u), w * (0.06 + 0.42 * u) + sway(env, 2, i) * 0.15, w * 0.035, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function flower(ctx, x, y, r, env, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = env.c(C.petal);
    for (let i = 0; i < 5; i++) {
      ctx.rotate(TAU / 5);
      ctx.beginPath();
      U.ellipse(ctx, 0, -r * 0.62, r * 0.42, r * 0.6);
      ctx.fill();
    }
    ctx.fillStyle = env.c(C.petalDeep);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.28, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function blossom(ctx, a, env) {
    const w = a.w;
    begin(ctx, a);
    flower(ctx, w * 0.3, -w * 0.06, w * 0.2, env, 0.3 + sway(env, 1.2) * 0.08);
    flower(ctx, w * 0.12, -w * 0.18, w * 0.13, env, 1.1);
    ctx.restore();
  }

  function witch(ctx, a, env) {
    const w = a.w;
    begin(ctx, a);
    const sw = sway(env, 1.6) * w * 0.04;
    ctx.fillStyle = env.c(C.witch);
    ctx.beginPath();
    U.ellipse(ctx, 0, -w * 0.02, w * 0.72, w * 0.12);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-w * 0.32, -w * 0.06);
    ctx.quadraticCurveTo(-w * 0.12, -w * 0.5, w * 0.05 + sw, -w * 0.8);
    ctx.quadraticCurveTo(w * 0.32 + sw, -w * 0.86, w * 0.42 + sw, -w * 0.7);
    ctx.quadraticCurveTo(w * 0.22, -w * 0.62, w * 0.18, -w * 0.4);
    ctx.lineTo(w * 0.32, -w * 0.06);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = env.c(C.witchBand);
    ctx.beginPath();
    ctx.moveTo(-w * 0.3, -w * 0.1);
    ctx.lineTo(w * 0.3, -w * 0.1);
    ctx.lineTo(w * 0.27, -w * 0.2);
    ctx.lineTo(-w * 0.26, -w * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function partyHat(ctx, a, env) {
    const col = env.accColors;
    const w = a.w;
    const bw = w * 0.21;
    const hh = w * 0.58;
    begin(ctx, a);
    ctx.translate(w * 0.17, 0);
    ctx.rotate(0.24 + sway(env, 1.8) * 0.03);
    ctx.beginPath();
    ctx.moveTo(-bw, 0);
    ctx.lineTo(0, -hh);
    ctx.lineTo(bw, 0);
    ctx.quadraticCurveTo(0, bw * 0.35, -bw, 0);
    ctx.closePath();
    ctx.fillStyle = env.c(col.hat);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = env.c(col.hat2, 0.95);
    ctx.lineWidth = w * 0.055;
    for (let i = 0; i < 5; i++) {
      const y = -hh * (0.08 + 0.21 * i);
      ctx.beginPath();
      ctx.moveTo(-bw, y + bw * 0.45);
      ctx.lineTo(bw, y - bw * 0.35);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = env.c(C.gold);
    ctx.beginPath();
    ctx.arc(0, -hh, w * 0.075, 0, TAU);
    ctx.fill();
    ctx.fillStyle = env.c(U.WHITE, 0.6);
    ctx.beginPath();
    ctx.arc(-w * 0.02, -hh - w * 0.025, w * 0.025, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function crown(ctx, a, env) {
    const w = a.w;
    const cw = w * 0.25;
    const ch = w * 0.27;
    begin(ctx, a);
    ctx.translate(0, -w * 0.02);
    ctx.beginPath();
    ctx.moveTo(-cw, 0);
    ctx.lineTo(-cw, -ch * 0.78);
    ctx.lineTo(-cw * 0.48, -ch * 0.36);
    ctx.lineTo(0, -ch);
    ctx.lineTo(cw * 0.48, -ch * 0.36);
    ctx.lineTo(cw, -ch * 0.78);
    ctx.lineTo(cw, 0);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -ch, 0, 0);
    g.addColorStop(0, env.c(U.lighten(C.gold, 0.4)));
    g.addColorStop(1, env.c(U.darken(C.gold, 0.1)));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.fillStyle = env.c(U.darken(C.gold, 0.22));
    ctx.fillRect(-cw, -ch * 0.24, cw * 2, ch * 0.24);
    ctx.fillStyle = env.c(C.gemRed);
    ctx.beginPath();
    ctx.arc(0, -ch * 0.12, w * 0.032, 0, TAU);
    ctx.fill();
    ctx.fillStyle = env.c(C.gemBlue);
    ctx.beginPath();
    ctx.arc(-cw * 0.62, -ch * 0.12, w * 0.024, 0, TAU);
    ctx.arc(cw * 0.62, -ch * 0.12, w * 0.024, 0, TAU);
    ctx.fill();
    ctx.fillStyle = env.c(U.lighten(C.gold, 0.55));
    [[-cw, -ch * 0.78], [0, -ch], [cw, -ch * 0.78]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, w * 0.028, 0, TAU);
      ctx.fill();
    });
    const tw = Math.max(0, sway(env, 2.2));
    if (tw > 0.05) {
      ctx.fillStyle = env.c(U.WHITE, 0.9 * tw);
      ctx.beginPath();
      U.star4(ctx, cw * 0.5, -ch * 0.66, w * 0.06 * tw);
      ctx.fill();
    }
    ctx.restore();
  }

  function catEars(ctx, a, env) {
    const col = env.accColors;
    const w = a.w;
    const ew = w * 0.17;
    const eh = w * 0.3;
    begin(ctx, a);
    const twitch = Math.max(0, sway(env, 1.3)) ** 6; // a quick flick now and then
    ctx.strokeStyle = env.c(col.hat2, 0.9);
    ctx.lineWidth = w * 0.035;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-w * 0.44, w * 0.08);
    ctx.quadraticCurveTo(0, -w * 0.13, w * 0.44, w * 0.08);
    ctx.stroke();
    for (let s = -1; s <= 1; s += 2) {
      ctx.save();
      ctx.translate(s * w * 0.32, 0);
      ctx.rotate(s * (0.3 + (s > 0 ? 0.16 * twitch : 0)));
      ctx.beginPath();
      ctx.moveTo(-ew, 0);
      ctx.quadraticCurveTo(-ew * 0.55, -eh * 0.75, 0, -eh);
      ctx.quadraticCurveTo(ew * 0.55, -eh * 0.75, ew, 0);
      ctx.closePath();
      ctx.fillStyle = env.c(col.hat2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-ew * 0.55, -eh * 0.08);
      ctx.quadraticCurveTo(-ew * 0.3, -eh * 0.58, 0, -eh * 0.76);
      ctx.quadraticCurveTo(ew * 0.3, -eh * 0.58, ew * 0.55, -eh * 0.08);
      ctx.closePath();
      ctx.fillStyle = env.c(C.earPink);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function bunnyEars(ctx, a, env) {
    const col = env.accColors;
    const w = a.w;
    const ew = w * 0.1;
    const eh = w * 0.5;
    begin(ctx, a);
    const sw = sway(env, 1.1);
    ctx.strokeStyle = env.c(col.hat2, 0.9);
    ctx.lineWidth = w * 0.035;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-w * 0.44, w * 0.08);
    ctx.quadraticCurveTo(0, -w * 0.13, w * 0.44, w * 0.08);
    ctx.stroke();
    for (let s = -1; s <= 1; s += 2) {
      ctx.save();
      ctx.translate(s * w * 0.18, -w * 0.02);
      ctx.rotate(s * 0.14 + (s > 0 ? 0.32 + 0.06 * sw : 0.02 * sw));
      ctx.beginPath();
      ctx.moveTo(-ew, 0);
      ctx.bezierCurveTo(-ew * 1.35, -eh * 0.6, -ew * 0.8, -eh, 0, -eh);
      ctx.bezierCurveTo(ew * 0.8, -eh, ew * 1.35, -eh * 0.6, ew, 0);
      ctx.closePath();
      ctx.fillStyle = env.c(col.hat2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-ew * 0.42, -eh * 0.12);
      ctx.bezierCurveTo(-ew * 0.72, -eh * 0.6, -ew * 0.4, -eh * 0.86, 0, -eh * 0.86);
      ctx.bezierCurveTo(ew * 0.4, -eh * 0.86, ew * 0.72, -eh * 0.6, ew * 0.42, -eh * 0.12);
      ctx.closePath();
      ctx.fillStyle = env.c(C.earPink);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function headphones(ctx, a, env) {
    const col = env.accColors;
    const w = a.w;
    const ear = a.ear || [w * 0.56, w * 0.42];
    begin(ctx, a);
    if (ear[2]) ctx.translate(ear[2], 0); // cups centered on the body even when the hat anchor is off-center
    ctx.translate(0, Math.max(0, sway(env, 4.4)) * w * 0.012); // nodding to the beat
    ctx.lineCap = 'round';
    ctx.strokeStyle = env.c(C.phones);
    ctx.lineWidth = w * 0.06;
    ctx.beginPath();
    ctx.moveTo(-ear[0], ear[1] - w * 0.1);
    ctx.bezierCurveTo(-ear[0] * 1.02, -w * 0.4, ear[0] * 1.02, -w * 0.4, ear[0], ear[1] - w * 0.1);
    ctx.stroke();
    ctx.strokeStyle = env.c(col.hat);
    ctx.lineWidth = w * 0.028;
    ctx.beginPath();
    ctx.moveTo(-ear[0] * 0.62, -w * 0.17);
    ctx.bezierCurveTo(-ear[0] * 0.3, -w * 0.29, ear[0] * 0.3, -w * 0.29, ear[0] * 0.62, -w * 0.17);
    ctx.stroke();
    for (let s = -1; s <= 1; s += 2) {
      ctx.save();
      ctx.translate(s * ear[0], ear[1]);
      ctx.fillStyle = env.c(C.phones);
      ctx.beginPath();
      U.rr(ctx, -w * 0.085, -w * 0.16, w * 0.17, w * 0.32, w * 0.075);
      ctx.fill();
      ctx.fillStyle = env.c(col.hat);
      ctx.beginPath();
      U.rr(ctx, -s * w * 0.035 - w * 0.04, -w * 0.12, w * 0.08, w * 0.24, w * 0.04);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function umbrella(ctx, a, env) {
    const col = env.accColors;
    const w = a.w;
    const R = w * 0.62;
    const edge = -w * 0.34;
    begin(ctx, a);
    ctx.rotate(0.12 + 0.03 * sway(env, 1.4));
    // shaft and a J handle off to one side
    ctx.strokeStyle = env.c(U.darken(col.hat, 0.35));
    ctx.lineWidth = w * 0.035;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(R * 0.92, edge);
    ctx.lineTo(R * 0.92, edge + w * 0.16);
    ctx.quadraticCurveTo(R * 0.92, edge + w * 0.24, R * 0.8, edge + w * 0.22);
    ctx.stroke();
    // canopy: a dome with a scalloped edge
    const n = 4;
    ctx.beginPath();
    ctx.moveTo(-R, edge);
    ctx.bezierCurveTo(-R, edge - R * 0.78, R, edge - R * 0.78, R, edge);
    for (let i = n - 1; i >= 0; i--) {
      const x0 = -R + (2 * R * (i + 1)) / n;
      const x1 = -R + (2 * R * i) / n;
      ctx.quadraticCurveTo((x0 + x1) / 2, edge - R * 0.16, x1, edge);
    }
    ctx.closePath();
    ctx.fillStyle = env.c(col.hat);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = env.c(col.hat2, 0.9);
    for (let i = 0; i < n; i += 2) {
      const x0 = -R + (2 * R * i) / n;
      ctx.beginPath();
      ctx.moveTo(0, edge - R * 0.62);
      ctx.lineTo(x0, edge + 2);
      ctx.lineTo(x0 + (2 * R) / n, edge + 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = env.c(U.darken(col.hat, 0.35));
    ctx.beginPath();
    ctx.arc(0, edge - R * 0.6, w * 0.025, 0, TAU);
    ctx.fill();
    ctx.fillRect(-w * 0.012, edge - R * 0.72, w * 0.024, R * 0.1);
    ctx.restore();
  }

  /* ----------------------------------------------------------------- face */

  function lensSize(a) {
    const lw = Math.min(a.rx * 1.25 + 1, a.dx - 1.5);
    return [lw, a.ry + 1];
  }

  function sunglasses(ctx, a, env) {
    const col = env.accColors;
    const [lw, lh] = lensSize(a);
    begin(ctx, a);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const fw = Math.max(0.8, Math.min(lw, lh) * 0.16);
    for (let s = -1; s <= 1; s += 2) {
      const cx = s * a.dx;
      ctx.beginPath();
      ctx.moveTo(cx - lw, -lh * 0.85);
      ctx.lineTo(cx + lw, -lh * 0.85);
      ctx.quadraticCurveTo(cx + lw * 1.04, lh * 0.55, cx + lw * 0.45, lh);
      ctx.lineTo(cx - lw * 0.45, lh);
      ctx.quadraticCurveTo(cx - lw * 1.04, lh * 0.55, cx - lw, -lh * 0.85);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, -lh, 0, lh);
      g.addColorStop(0, env.c(C.lens, 0.94));
      g.addColorStop(1, env.c(U.mix(C.lens, col.hat, 0.35), 0.82));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = env.c(col.hat);
      ctx.lineWidth = fw;
      ctx.stroke();
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = env.c(U.WHITE, 0.32);
      ctx.lineWidth = fw * 1.4;
      ctx.beginPath();
      ctx.moveTo(cx - lw * 0.62, lh * 0.55);
      ctx.lineTo(cx - lw * 0.02, -lh * 0.75);
      ctx.stroke();
      ctx.lineWidth = fw * 0.6;
      ctx.beginPath();
      ctx.moveTo(cx - lw * 0.22, lh * 0.7);
      ctx.lineTo(cx + lw * 0.3, -lh * 0.5);
      ctx.stroke();
      ctx.restore();
    }
    ctx.strokeStyle = env.c(col.hat);
    ctx.lineWidth = fw;
    ctx.beginPath();
    ctx.moveTo(-a.dx + lw * 0.95, -lh * 0.62);
    ctx.quadraticCurveTo(0, -lh * 0.95, a.dx - lw * 0.95, -lh * 0.62);
    ctx.stroke();
    ctx.restore();
  }

  function roundGlasses(ctx, a, env) {
    const r = Math.min(Math.max(a.rx, a.ry) * 1.05 + 1.5, a.dx - 1);
    begin(ctx, a);
    const fw = Math.max(0.7, r * 0.1);
    ctx.lineCap = 'round';
    for (let s = -1; s <= 1; s += 2) {
      const cx = s * a.dx;
      ctx.fillStyle = env.c(U.WHITE, 0.05);
      ctx.beginPath();
      ctx.arc(cx, 0, r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = env.c(U.WHITE, 0.28);
      ctx.lineWidth = fw * 0.9;
      ctx.beginPath();
      ctx.arc(cx, 0, r * 0.72, -2.5, -1.75);
      ctx.stroke();
      ctx.strokeStyle = env.c(C.gold);
      ctx.lineWidth = fw;
      ctx.beginPath();
      ctx.arc(cx, 0, r, 0, TAU);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-a.dx + r, -r * 0.18);
    ctx.quadraticCurveTo(0, -r * 0.42, a.dx - r, -r * 0.18);
    ctx.stroke();
    ctx.restore();
  }

  /* ----------------------------------------------------------------- neck */

  function scarf(ctx, a, env) {
    const col = env.accColors;
    const w = a.w;
    const hw = w / 2;
    const bh = Math.max(4, w * 0.2);
    begin(ctx, a);
    const sw = sway(env, 2.1) * 0.12;
    ctx.save();
    ctx.translate(hw * 0.45, bh * 0.4);
    ctx.rotate(0.18 + sw);
    ctx.fillStyle = env.c(U.darken(col.scarf, 0.08));
    ctx.beginPath();
    U.rr(ctx, -bh * 0.42, 0, bh * 0.84, bh * 2.1, bh * 0.25);
    ctx.fill();
    ctx.fillStyle = env.c(col.scarf2);
    ctx.fillRect(-bh * 0.42, bh * 0.9, bh * 0.84, bh * 0.28);
    ctx.strokeStyle = env.c(U.darken(col.scarf, 0.08));
    ctx.lineWidth = Math.max(0.5, bh * 0.1);
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * bh * 0.26, bh * 2.05);
      ctx.lineTo(i * bh * 0.26, bh * 2.45);
      ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(-hw, -bh / 2);
    ctx.quadraticCurveTo(0, bh * 0.35, hw, -bh / 2);
    ctx.lineTo(hw, bh / 2);
    ctx.quadraticCurveTo(0, bh * 1.35, -hw, bh / 2);
    ctx.closePath();
    ctx.fillStyle = env.c(col.scarf);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = env.c(col.scarf2);
    for (let i = -2; i <= 2; i++) {
      ctx.fillRect(i * hw * 0.42 - bh * 0.14, -bh, bh * 0.28, bh * 3);
    }
    ctx.restore();
    ctx.fillStyle = env.c(U.darken(col.scarf, 0.12));
    ctx.beginPath();
    U.ellipse(ctx, hw * 0.45, bh * 0.45, bh * 0.42, bh * 0.38);
    ctx.fill();
    ctx.restore();
  }

  function saekdong(ctx, a, env) {
    const w = a.w;
    const hw = w / 2;
    const bh = Math.max(4, w * 0.2);
    begin(ctx, a);
    ctx.beginPath();
    ctx.moveTo(-hw, -bh / 2);
    ctx.quadraticCurveTo(0, bh * 0.35, hw, -bh / 2);
    ctx.lineTo(hw, bh / 2);
    ctx.quadraticCurveTo(0, bh * 1.35, -hw, bh / 2);
    ctx.closePath();
    ctx.save();
    ctx.clip();
    const n = 10;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = env.c(C.saekdong[i % C.saekdong.length]);
      ctx.fillRect(-hw + (w * i) / n, -bh, w / n + 0.3, bh * 3);
    }
    ctx.restore();
    const sw = sway(env, 2) * 0.1;
    ctx.fillStyle = env.c(C.saekdong[0]);
    ctx.save();
    ctx.translate(-hw * 0.3, bh * 0.6);
    ctx.rotate(-0.2 + sw);
    ctx.beginPath();
    U.ellipse(ctx, -bh * 0.5, 0, bh * 0.55, bh * 0.32, -0.3);
    U.ellipse(ctx, bh * 0.5, 0, bh * 0.55, bh * 0.32, 0.3);
    ctx.fill();
    ctx.fillRect(-bh * 0.2, 0, bh * 0.4, bh * 1.8);
    ctx.restore();
    ctx.restore();
  }

  function bowtie(ctx, a, env) {
    const col = env.accColors;
    const k = Math.min(a.w * 0.16, 8);
    begin(ctx, a);
    ctx.rotate(0.07 * sway(env, 2.4));
    ctx.fillStyle = env.c(col.hat);
    ctx.beginPath();
    for (let s = -1; s <= 1; s += 2) {
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(s * k * 0.9, -k * 0.95, s * k * 1.45, -k * 0.62);
      ctx.quadraticCurveTo(s * k * 1.65, 0, s * k * 1.45, k * 0.62);
      ctx.quadraticCurveTo(s * k * 0.9, k * 0.95, 0, 0);
    }
    ctx.fill();
    ctx.fillStyle = env.c(col.hat2, 0.9);
    ctx.beginPath();
    [[-0.98, -0.22], [-0.68, 0.32], [0.98, -0.22], [0.68, 0.32]].forEach(([x, y]) => {
      ctx.moveTo(x * k + k * 0.13, y * k);
      ctx.arc(x * k, y * k, k * 0.13, 0, TAU);
    });
    ctx.fill();
    ctx.fillStyle = env.c(U.darken(col.hat, 0.22));
    ctx.beginPath();
    U.rr(ctx, -k * 0.32, -k * 0.4, k * 0.64, k * 0.8, k * 0.22);
    ctx.fill();
    ctx.restore();
  }

  /* ---------------------------------------------------------------- items */

  function pumpkin(ctx, a, env) {
    const s = a.w || 1;
    begin(ctx, a);
    ctx.translate(0, sway(env, 2.4) * 0.8);
    ctx.scale(s, s);
    F.glow(ctx, 0, 0, 12, C.carve, 0.22, env);
    ctx.fillStyle = env.c(C.pumpkinDark);
    ctx.beginPath();
    U.ellipse(ctx, -3.4, 0.4, 4.3, 5.2);
    U.ellipse(ctx, 3.4, 0.4, 4.3, 5.2);
    ctx.fill();
    ctx.fillStyle = env.c(C.pumpkin);
    ctx.beginPath();
    U.ellipse(ctx, 0, 0, 5, 5.8);
    ctx.fill();
    ctx.fillStyle = env.c(C.stem);
    ctx.beginPath();
    U.rr(ctx, -0.9, -8, 1.8, 3.2, 0.8);
    ctx.fill();
    ctx.fillStyle = env.c(C.carve);
    ctx.beginPath();
    ctx.moveTo(-3.6, -1.6);
    ctx.lineTo(-1.2, -1.6);
    ctx.lineTo(-2.4, -3.6);
    ctx.closePath();
    ctx.moveTo(3.6, -1.6);
    ctx.lineTo(1.2, -1.6);
    ctx.lineTo(2.4, -3.6);
    ctx.closePath();
    ctx.moveTo(-3.6, 1);
    ctx.lineTo(-1.8, 2);
    ctx.lineTo(0, 1);
    ctx.lineTo(1.8, 2);
    ctx.lineTo(3.6, 1);
    ctx.lineTo(2.6, 3.4);
    ctx.lineTo(-2.6, 3.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function lantern(ctx, a, env) {
    const s = a.w || 1;
    begin(ctx, a);
    ctx.scale(s, s);
    const sw = sway(env, 1.6) * 0.12;
    ctx.strokeStyle = env.c([150, 110, 70]);
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(5, -9);
    ctx.stroke();
    ctx.translate(5, -9);
    ctx.rotate(sw);
    ctx.strokeStyle = env.c(C.gold);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 3);
    ctx.stroke();
    F.glow(ctx, 0, 10, 16, C.light, 0.38, env);
    ctx.fillStyle = env.c(C.lanternRed);
    ctx.beginPath();
    U.rr(ctx, -5, 3.5, 10, 13, 3.2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    U.rr(ctx, -5, 3.5, 10, 13, 3.2);
    ctx.clip();
    ctx.fillStyle = env.c(C.lanternBlue);
    ctx.fillRect(-5, 3.5, 10, 6);
    const g = ctx.createRadialGradient(0, 10, 0, 0, 10, 6);
    g.addColorStop(0, env.c(C.light, 0.85));
    g.addColorStop(1, env.c(C.light, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-5, 3.5, 10, 13);
    ctx.restore();
    ctx.fillStyle = env.c(C.gold);
    ctx.fillRect(-3.4, 2.6, 6.8, 1.6);
    ctx.fillRect(-3.4, 15.8, 6.8, 1.6);
    ctx.strokeStyle = env.c(C.lanternRed);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 17.4);
    ctx.lineTo(0, 21);
    ctx.stroke();
    ctx.restore();
  }

  function pouch(ctx, a, env) {
    const s = a.w || 1;
    begin(ctx, a);
    ctx.translate(0, sway(env, 2) * 0.6);
    ctx.scale(s, s);
    ctx.fillStyle = env.c(C.pouch);
    ctx.beginPath();
    ctx.moveTo(-2.6, -3.2);
    ctx.bezierCurveTo(-7.5, -1, -6.8, 6.4, 0, 6.4);
    ctx.bezierCurveTo(6.8, 6.4, 7.5, -1, 2.6, -3.2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-2.6, -3.2);
    ctx.lineTo(-4.2, -6);
    ctx.lineTo(4.2, -6);
    ctx.lineTo(2.6, -3.2);
    ctx.closePath();
    ctx.fillStyle = env.c(C.pouchDark);
    ctx.fill();
    ctx.fillStyle = env.c(C.gold);
    ctx.fillRect(-3, -3.8, 6, 1.2);
    ctx.beginPath();
    ctx.arc(0, 1.8, 1.9, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = env.c(C.gold);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    U.ellipse(ctx, -1.8, -4.6, 1.6, 1, -0.4);
    U.ellipse(ctx, 1.8, -4.6, 1.6, 1, 0.4);
    ctx.stroke();
    ctx.restore();
  }

  function coffee(ctx, a, env) {
    const col = env.accColors;
    const s = a.w || 1;
    begin(ctx, a);
    ctx.translate(0, sway(env, 2) * 0.4);
    ctx.scale(s, s);
    ctx.strokeStyle = env.c(U.WHITE, 0.45);
    ctx.lineWidth = 0.9;
    ctx.lineCap = 'round';
    for (let i = 0; i < 2; i++) {
      const x0 = -1.3 + i * 2.6;
      const k = sway(env, 2.6, i * 2.2);
      ctx.beginPath();
      ctx.moveTo(x0, -9.6);
      ctx.bezierCurveTo(x0 + 1.6 * k, -11.4, x0 - 1.6 * k, -12.8, x0 + 0.6 * k, -14.6);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-4, -6.5);
    ctx.lineTo(4, -6.5);
    ctx.lineTo(3, 6);
    ctx.lineTo(-3, 6);
    ctx.closePath();
    ctx.fillStyle = env.c(C.cup);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-3.7, -2.6);
    ctx.lineTo(3.7, -2.6);
    ctx.lineTo(3.3, 2.4);
    ctx.lineTo(-3.3, 2.4);
    ctx.closePath();
    ctx.fillStyle = env.c(C.sleeve);
    ctx.fill();
    ctx.fillStyle = env.c(C.cup, 0.95);
    ctx.beginPath();
    F.heart(ctx, 0, -0.1, 1.3);
    ctx.fill();
    ctx.fillStyle = env.c(col.hat);
    ctx.beginPath();
    U.rr(ctx, -4.7, -8.4, 9.4, 2.4, 1.1);
    ctx.fill();
    ctx.beginPath();
    U.rr(ctx, -3.4, -9.6, 6.8, 1.6, 0.8);
    ctx.fill();
    ctx.restore();
  }

  function balloon(ctx, a, env) {
    const col = env.accColors;
    const s = a.w || 1;
    begin(ctx, a);
    ctx.scale(s, s);
    const bx = -4 + 1.5 * sway(env, 1.2);
    const by = -22 + 1.2 * sway(env, 1.7, 1);
    ctx.strokeStyle = env.c(U.WHITE, 0.55);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(bx + 3, by * 0.45, bx, by + 7.4);
    ctx.stroke();
    const g = ctx.createRadialGradient(bx - 2, by - 2.6, 0.5, bx, by, 7.5);
    g.addColorStop(0, env.c(U.lighten(col.hat, 0.5)));
    g.addColorStop(1, env.c(col.hat));
    ctx.fillStyle = g;
    ctx.beginPath();
    U.ellipse(ctx, bx, by, 5.4, 6.5);
    ctx.fill();
    ctx.fillStyle = env.c(col.hat);
    ctx.beginPath();
    ctx.moveTo(bx, by + 6.2);
    ctx.lineTo(bx - 1.2, by + 7.7);
    ctx.lineTo(bx + 1.2, by + 7.7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = env.c(U.WHITE, 0.7);
    ctx.beginPath();
    U.ellipse(ctx, bx - 2.1, by - 2.8, 1.2, 1.9, 0.5);
    ctx.fill();
    ctx.restore();
  }

  const DRAW = {
    head: { beanie, partyHat, crown, catEars, bunnyEars, headphones, umbrella, gat, blossom, witch },
    face: { sunglasses, roundGlasses },
    neck: { scarf, bowtie, saekdong },
    item: { coffee, balloon, pumpkin, lantern, pouch },
  };

  /** Draw whatever the current outfit puts in `slot`. Called by characters via env.acc. */
  function drawSlot(ctx, slot, anchor, env, acc) {
    const id = acc && acc[slot];
    const fn = id && DRAW[slot] && DRAW[slot][id];
    if (!fn) return false;
    ctx.save();
    fn(ctx, anchor, env);
    ctx.restore();
    return true;
  }

  /** The wardrobe: every piece, by slot. One piece per slot; packs below are curated outfits. */
  K.SLOTS = [
    { id: 'head', label: 'Head' },
    { id: 'face', label: 'Face' },
    { id: 'neck', label: 'Neck' },
    { id: 'item', label: 'Holding' },
  ];
  K.ACCESSORIES = [
    { id: 'beanie', label: 'Beanie', slot: 'head', kind: 'Hat' },
    { id: 'partyHat', label: 'Party hat', slot: 'head', kind: 'Hat' },
    { id: 'crown', label: 'Crown', slot: 'head', kind: 'Hat' },
    { id: 'catEars', label: 'Cat ears', slot: 'head', kind: 'Ears' },
    { id: 'bunnyEars', label: 'Bunny ears', slot: 'head', kind: 'Ears' },
    { id: 'headphones', label: 'Headphones', slot: 'head', kind: 'Audio' },
    { id: 'umbrella', label: 'Umbrella', slot: 'head', kind: 'Weather' },
    { id: 'gat', label: 'Gat', kr: '갓', slot: 'head', kind: 'Hat (Korean traditional)' },
    { id: 'blossom', label: 'Blossom', kr: '벚꽃', slot: 'head', kind: 'Flower (spring)' },
    { id: 'witch', label: 'Witch hat', slot: 'head', kind: 'Hat (Halloween)', seasonal: true },
    { id: 'sunglasses', label: 'Sunglasses', slot: 'face', kind: 'Glasses' },
    { id: 'roundGlasses', label: 'Round glasses', slot: 'face', kind: 'Glasses' },
    { id: 'scarf', label: 'Scarf', slot: 'neck', kind: 'Scarf' },
    { id: 'bowtie', label: 'Bow tie', slot: 'neck', kind: 'Bow tie' },
    { id: 'saekdong', label: 'Saekdong', kr: '색동', slot: 'neck', kind: 'Rainbow collar (Seollal)' },
    { id: 'coffee', label: 'Coffee', slot: 'item', kind: 'Held item' },
    { id: 'balloon', label: 'Balloon', slot: 'item', kind: 'Held item' },
    { id: 'pumpkin', label: 'Pumpkin', slot: 'item', kind: 'Seasonal (Halloween)', seasonal: true },
    { id: 'lantern', label: 'Silk lantern', kr: '청사초롱', slot: 'item', kind: 'Held item (Korean traditional)' },
    { id: 'pouch', label: 'Lucky pouch', kr: '복주머니', slot: 'item', kind: 'Held item (Seollal)', seasonal: true },
  ];

  /** Ambient particles a look can add (drawn by K.FX.ambient). */
  K.AMBIENTS = [
    { id: 'fireflies', label: 'Fireflies' },
    { id: 'sparkles', label: 'Sparkles' },
    { id: 'snow', label: 'Snow' },
    { id: 'petals', label: 'Petals' },
    { id: 'rain', label: 'Rain' },
    { id: 'confetti', label: 'Confetti' },
    { id: 'notes', label: 'Music' },
    { id: 'stars', label: 'Moon and stars' },
    { id: 'bats', label: 'Bats' },
  ];

  /** Skin packs for direction 5: a full look (theme + outfit + item + ambience) sold as one bundle. */
  K.PACKS = [
    { id: 'lantern', label: 'Night walk', kr: '청사초롱', note: 'Gat hat and a silk lantern, fireflies.', theme: 'night', acc: { head: 'gat', item: 'lantern' }, ambient: 'fireflies' },
    { id: 'party', label: 'Party', kr: '파티', note: 'Party hat, a balloon and confetti.', theme: 'classic', acc: { head: 'partyHat', item: 'balloon' }, ambient: 'confetti' },
    { id: 'shades', label: 'Cool', kr: '선글라스', note: 'Sunglasses and a bow tie.', theme: 'night', acc: { face: 'sunglasses', neck: 'bowtie' }, ambient: 'sparkles' },
    { id: 'study', label: 'Study buddy', kr: '공부', note: 'Round glasses and a coffee, for focus time.', theme: 'mint', acc: { face: 'roundGlasses', item: 'coffee' }, ambient: null },
    { id: 'kitty', label: 'Kitty', kr: '야옹', note: 'Cat ears and a bow tie.', theme: 'sakura', acc: { head: 'catEars', neck: 'bowtie' }, ambient: 'sparkles' },
    { id: 'moonrabbit', label: 'Moon rabbit', kr: '달토끼', note: 'Bunny ears under a full moon, for Chuseok.', theme: 'night', acc: { head: 'bunnyEars' }, ambient: 'stars' },
    { id: 'dj', label: 'DJ', kr: '디제이', note: 'Headphones and floating music notes.', theme: 'classic', acc: { head: 'headphones' }, ambient: 'notes' },
    { id: 'rainy', label: 'Rainy day', kr: '비 오는 날', note: 'An umbrella and soft rain.', theme: 'mint', acc: { head: 'umbrella' }, ambient: 'rain' },
    { id: 'king', label: 'Little king', kr: '임금님', note: 'A gold crown and a bow tie.', theme: 'dancheong', acc: { head: 'crown', neck: 'bowtie' }, ambient: 'sparkles' },
    { id: 'seollal', label: 'Seollal', kr: '설날', note: 'New Year: saekdong rainbow collar and a lucky pouch.', theme: 'dancheong', acc: { neck: 'saekdong', item: 'pouch' }, ambient: 'sparkles' },
    { id: 'winter', label: 'Cozy winter', kr: '겨울', note: 'Beanie, scarf and snowfall.', theme: 'mint', acc: { head: 'beanie', neck: 'scarf' }, ambient: 'snow' },
    { id: 'blossom', label: 'Blossom', kr: '벚꽃', note: 'Cherry blossoms and falling petals.', theme: 'sakura', acc: { head: 'blossom' }, ambient: 'petals' },
    { id: 'halloween', label: 'Halloween', kr: '핼러윈', note: 'Witch hat, pumpkin and bats.', theme: 'classic', acc: { head: 'witch', item: 'pumpkin' }, ambient: 'bats' },
  ];
  K.pack = (id) => K.PACKS.find((p) => p.id === id) || K.PACKS[0];

  K.accessory = (id) => K.ACCESSORIES.find((a) => a.id === id) || null;

  /** Turn the explorer's accessory list (['beanie', 'scarf']) into slot form; the last piece per slot wins. */
  K.accFromToggles = function (ids) {
    const out = {};
    (ids || []).forEach((id) => {
      const a = K.ACCESSORIES.find((x) => x.id === id);
      if (a) out[a.slot] = a.id;
    });
    return out;
  };

  K.Acc = { DRAW, drawSlot };
})(window.Bud);
