/* Shared face parts: oval eyes with lids, mouths, blush, glows.
 *
 * Characters call these with their own proportions and colors. All sizes are in
 * stage units (the stage is 100 x 100, centered on 0,0).
 */
(function (K) {
  'use strict';
  const U = K.util;
  const { TAU, clamp } = U;

  /** Clip to the area between a (sloped) top lid and a flat bottom lid. */
  function lidClip(ctx, cx, cy, rx, ry, topCut, slope, botCut) {
    const R = rx * 2.4;
    const Y = ry * 3 + 4;
    if (topCut > 0.001) {
      const ty = cy - ry + 2 * ry * topCut;
      ctx.beginPath();
      ctx.moveTo(cx - R, ty - slope * R);
      ctx.lineTo(cx + R, ty + slope * R);
      ctx.lineTo(cx + R, cy + Y);
      ctx.lineTo(cx - R, cy + Y);
      ctx.closePath();
      ctx.clip();
    }
    if (botCut > 0.001) {
      const by = cy + ry - 2 * ry * botCut;
      ctx.beginPath();
      ctx.moveTo(cx - R, cy - Y);
      ctx.lineTo(cx + R, cy - Y);
      ctx.lineTo(cx + R, by);
      ctx.lineTo(cx - R, by);
      ctx.closePath();
      ctx.clip();
    }
  }

  /** Lid amounts shared by every eye style, so expressions stay consistent across characters. */
  function lids(p, side) {
    const asym = p.asym * (side > 0 ? 1 : -0.25);
    return {
      asym,
      top: clamp(Math.max(p.sleepy * 0.5, p.squint * 0.34, asym * 0.32, Math.max(0, p.browTilt) * 0.12), 0, 0.85),
      bot: p.squint * 0.26,
      slope: side * (0.28 * p.sleepy - 0.3 * p.browTilt),
    };
  }

  /**
   * Two oval eyes.
   * spec: { x: half spacing, y, rx, ry, color, hi: highlight color (null for none),
   *         look: [x, y] travel, line: stroke width for closed/happy arcs }
   * Honors per-eye scale (p.eyeL, p.eyeR), winks (p.winkL, p.winkR: that eye becomes a
   * happy arc) and heart eyes (p.heart).
   */
  function ovalEyes(ctx, p, s, env) {
    const c = env.c;
    const wide = 1 + 0.2 * p.wide;
    const look = s.look || [s.rx * wide * 0.6, s.ry * wide * 0.4];
    const ox = p.lookX * look[0];
    const oy = p.lookY * look[1];
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1;
      const es = side < 0 ? p.eyeL : p.eyeR;
      const rx = s.rx * wide * es;
      const ry = s.ry * wide * es;
      const lw = (s.line || Math.max(1.2, s.rx * wide * 0.55)) * Math.sqrt(es);
      const hp = Math.max(p.happy, side < 0 ? p.winkL : p.winkR);
      const shut = Math.max(hp, p.closed, p.heart);
      const openA = clamp(1 - shut * 1.6);
      const cx = side * s.x + ox;
      const cy = s.y + oy;
      const L = lids(p, side);
      const open = p.eyeOpen;

      if (openA > 0.01) {
        const h = ry * Math.max(0.06, open) * (L.asym < 0 ? 1 - L.asym * 0.12 : 1);
        ctx.save();
        ctx.globalAlpha *= openA;
        lidClip(ctx, cx, cy, rx, h, L.top, L.slope, L.bot);
        ctx.beginPath();
        U.ellipse(ctx, cx, cy, rx, h);
        ctx.fillStyle = c(s.color);
        ctx.fill();
        if (open > 0.35 && s.hi !== null) {
          const hs = (s.hiSize || s.rx * wide * 0.42) * es * (0.85 + 0.15 * p.sparkle);
          ctx.fillStyle = c(s.hi || U.WHITE);
          ctx.beginPath();
          U.ellipse(ctx, cx - rx * 0.3 + p.lookX * rx * 0.1, cy - h * 0.36, hs, hs * 1.08);
          ctx.fill();
          ctx.beginPath();
          U.ellipse(ctx, cx + rx * 0.34, cy + h * 0.36, hs * 0.42, hs * 0.42);
          ctx.fill();
          if (p.sparkle > 1.15) {
            ctx.globalAlpha *= clamp((p.sparkle - 1.15) / 0.4);
            ctx.beginPath();
            U.ellipse(ctx, cx + rx * 0.3, cy - h * 0.18, hs * 0.32, hs * 0.32);
            ctx.fill();
          }
        }
        ctx.restore();

        if (L.top > 0.14 && open > 0.3) {
          ctx.save();
          ctx.globalAlpha *= openA * clamp((L.top - 0.14) * 5);
          const ty = cy - h + 2 * h * L.top;
          const e = rx * 1.08;
          ctx.beginPath();
          ctx.moveTo(cx - e, ty - L.slope * e);
          ctx.lineTo(cx + e, ty + L.slope * e);
          ctx.strokeStyle = c(s.color);
          ctx.lineWidth = lw * 0.55;
          ctx.stroke();
          ctx.restore();
        }
        if (open < 0.25) {
          ctx.save();
          ctx.globalAlpha *= openA * (1 - open / 0.25);
          ctx.beginPath();
          ctx.moveTo(cx - rx, cy);
          ctx.quadraticCurveTo(cx, cy + ry * 0.35, cx + rx, cy);
          ctx.strokeStyle = c(s.color);
          ctx.lineWidth = lw * 0.8;
          ctx.stroke();
          ctx.restore();
        }
      }

      if (hp > 0.01 && p.heart < 0.99) {
        ctx.save();
        ctx.globalAlpha *= clamp(hp * 1.4) * clamp(1 - p.heart * 1.5);
        ctx.beginPath();
        ctx.moveTo(cx - rx, cy + ry * 0.32);
        ctx.quadraticCurveTo(cx, cy - ry * 1.15, cx + rx, cy + ry * 0.32);
        ctx.strokeStyle = c(s.color);
        ctx.lineWidth = lw;
        ctx.stroke();
        ctx.restore();
      }
      if (p.closed > 0.01) {
        ctx.save();
        ctx.globalAlpha *= clamp(p.closed * 1.4);
        ctx.beginPath();
        ctx.moveTo(cx - rx, cy - ry * 0.02);
        ctx.quadraticCurveTo(cx, cy + ry * 0.85, cx + rx, cy - ry * 0.02);
        ctx.strokeStyle = c(s.color);
        ctx.lineWidth = lw * 0.85;
        ctx.stroke();
        ctx.restore();
      }
      if (p.heart > 0.01) {
        const hs = Math.max(rx, ry * 0.8) * 1.15 * (1 + 0.5 * (p.sy - 1));
        ctx.save();
        ctx.globalAlpha *= clamp(p.heart * 1.4);
        ctx.fillStyle = c(s.heart || s.color);
        ctx.beginPath();
        heart(ctx, cx, cy + hs * 0.1, hs);
        ctx.fill();
        if (s.hi !== null) {
          ctx.fillStyle = c(s.hi || U.WHITE, 0.85);
          ctx.beginPath();
          U.ellipse(ctx, cx - hs * 0.42, cy - hs * 0.25, hs * 0.2, hs * 0.14, -0.6);
          ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  /**
   * Small mouth: a curve when closed, an "o" when slightly open, a D-shaped grin when happy.
   * spec: { x, y, w, color, inner, tongue, line, look }
   */
  function mouth(ctx, p, s, env) {
    const c = env.c;
    const x = s.x + p.mouthX * (s.shift == null ? 1 : s.shift) + p.lookX * (s.look == null ? 1.2 : s.look);
    const y = s.y + p.lookY * (s.lookY == null ? 0.8 : s.lookY);
    const open = p.mouthOpen;
    const curve = p.mouthCurve;
    const w = s.w * (1 + 0.3 * open);
    const lw = s.line || Math.max(1, s.w * 0.28);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (open < 0.12) {
      ctx.beginPath();
      if (p.wobble > 0.05) {
        const n = 4;
        const amp = w * 0.13 * p.wobble;
        ctx.moveTo(x - w / 2, y);
        for (let i = 1; i <= n; i++) {
          const xx = x - w / 2 + (w * i) / n;
          ctx.quadraticCurveTo(xx - w / n / 2, y + (i % 2 ? -amp : amp) - curve * w * 0.12, xx, y);
        }
      } else {
        ctx.moveTo(x - w / 2, y - curve * w * 0.1);
        ctx.quadraticCurveTo(x, y + curve * w * 0.55, x + w / 2, y - curve * w * 0.1);
      }
      ctx.strokeStyle = c(s.color);
      ctx.lineWidth = lw;
      ctx.stroke();
    } else if (Math.abs(curve) < 0.45) {
      const r = s.w * (0.24 + 0.26 * open);
      ctx.beginPath();
      U.ellipse(ctx, x, y + r * 0.25, r * 0.85, r * (0.8 + 0.45 * open));
      ctx.fillStyle = c(s.inner || s.color);
      ctx.fill();
    } else {
      const h = w * (0.3 + 0.55 * open);
      ctx.beginPath();
      ctx.moveTo(x - w / 2, y);
      ctx.quadraticCurveTo(x, y + w * 0.12, x + w / 2, y);
      ctx.quadraticCurveTo(x + w * 0.44, y + h, x, y + h);
      ctx.quadraticCurveTo(x - w * 0.44, y + h, x - w / 2, y);
      ctx.closePath();
      ctx.fillStyle = c(s.inner || s.color);
      ctx.fill();
      if (s.tongue) {
        ctx.clip();
        ctx.beginPath();
        U.ellipse(ctx, x, y + h * 0.98, w * 0.3, h * 0.45);
        ctx.fillStyle = c(s.tongue);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /** Two blush ovals. spec: { x: half spacing, y, rx, ry, color, alpha } */
  function blush(ctx, p, s, env) {
    const a = p.blush * (s.alpha == null ? 0.5 : s.alpha);
    if (a < 0.02) return;
    ctx.fillStyle = env.c(s.color, a);
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1;
      ctx.beginPath();
      U.ellipse(ctx, side * s.x + p.lookX * (s.look == null ? 1 : s.look), s.y + p.lookY * 0.6, s.rx, s.ry);
      ctx.fill();
    }
  }

  /** Soft radial glow disc. */
  function glow(ctx, x, y, r, color, alpha, env) {
    if (alpha < 0.01 || r <= 0) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, env.c(color, alpha));
    g.addColorStop(0.45, env.c(color, alpha * 0.45));
    g.addColorStop(1, env.c(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  /** Teardrop path (point up), used for sweat drops and petals. */
  function drop(ctx, x, y, r) {
    ctx.moveTo(x, y - r * 1.9);
    ctx.bezierCurveTo(x + r * 0.35, y - r * 1.2, x + r, y - r * 0.55, x + r, y);
    ctx.arc(x, y, r, 0, Math.PI);
    ctx.bezierCurveTo(x - r, y - r * 0.55, x - r * 0.35, y - r * 1.2, x, y - r * 1.9);
    ctx.closePath();
  }

  /** Heart path centered on x,y; s is about half its width. */
  function heart(ctx, x, y, s) {
    ctx.moveTo(x, y + s * 0.9);
    ctx.bezierCurveTo(x - s * 1.35, y + s * 0.05, x - s * 0.95, y - s * 1.15, x, y - s * 0.42);
    ctx.bezierCurveTo(x + s * 0.95, y - s * 1.15, x + s * 1.35, y + s * 0.05, x, y + s * 0.9);
    ctx.closePath();
  }

  K.Face = { lidClip, lids, ovalEyes, mouth, blush, glow, drop, heart };
})(window.Bud);
