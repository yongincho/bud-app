/* Phone backs used for scale. All dimensions in millimeters, origin at the
 * phone's top-left corner as seen from the back.
 *
 * These are approximate 6.1-inch class outlines for visual scale only, not
 * measured specs. Adjust the numbers here if you want a specific model.
 */
(function (K) {
  'use strict';
  const U = K.util;

  K.registerPhone({
    id: 'iphone',
    label: 'iPhone-style',
    short: 'iPhone-style',
    w: 71.6,
    h: 147.6,
    t: 7.8,
    r: 10.6,
    note: 'Approximate 6.1-inch class outline, camera island top-left. For scale only.',
    camera: {
      island: { x: 3.6, y: 3.6, w: 35, h: 35, r: 8.6 },
      lenses: [{ x: 13, y: 13, r: 7 }, { x: 25.8, y: 25.8, r: 7 }],
      flash: { x: 28.4, y: 11, r: 2.4 },
      mic: { x: 11.2, y: 28.6, r: 0.8 },
    },
    // camera island plus a 2 mm margin
    keepOut: [{ x: 1.6, y: 1.6, w: 39, h: 39, r: 10.6 }],
    // as seen from the back: power on the left edge, volume on the right
    buttons: [
      { side: 'left', y: 37, h: 16 },
      { side: 'right', y: 24, h: 7 },
      { side: 'right', y: 36, h: 10 },
      { side: 'right', y: 49, h: 10 },
    ],
  });

  K.registerPhone({
    id: 'galaxy',
    label: 'Galaxy-style',
    short: 'Galaxy-style',
    w: 70.6,
    h: 147,
    t: 7.6,
    r: 9.2,
    note: 'Approximate 6.1-inch class outline, vertical camera strip. For scale only.',
    camera: {
      lenses: [{ x: 12.8, y: 12.8, r: 5.4 }, { x: 12.8, y: 25.6, r: 5.4 }, { x: 12.8, y: 38.4, r: 5.4 }],
      flash: { x: 23.6, y: 12.8, r: 1.8 },
    },
    // lens strip and flash, each plus a 2 mm margin
    keepOut: [
      { x: 5.4, y: 5.4, w: 14.8, h: 40.4, r: 7.4 },
      { x: 19.8, y: 9, w: 7.6, h: 7.6, r: 3.8 },
    ],
    buttons: [
      { side: 'left', y: 30, h: 22 },
      { side: 'left', y: 56, h: 11 },
    ],
  });

  K.PHONE_COLORS = [
    { id: 'black', label: 'Black', body: '#26272B', frame: '#3B3C41', island: '#2D2E33' },
    { id: 'white', label: 'White', body: '#EFEDE9', frame: '#D7D5D0', island: '#E6E4DF' },
    { id: 'blue', label: 'Pastel blue', body: '#C4D6EB', frame: '#ADC2DA', island: '#B9CDE4' },
    { id: 'pink', label: 'Pastel pink', body: '#F1D4D8', frame: '#DFBDC2', island: '#EACACF' },
  ];
  K.phoneColor = (id) => K.PHONE_COLORS.find((c) => c.id === id) || K.PHONE_COLORS[0];

  function lens(l, u, ring) {
    const r = l.r;
    return (
      `<circle cx="${l.x}" cy="${l.y}" r="${r}" fill="url(#${u}ring)"/>` +
      `<circle cx="${l.x}" cy="${l.y}" r="${r * (ring ? 0.8 : 0.84)}" fill="#0E0F14"/>` +
      `<circle cx="${l.x}" cy="${l.y}" r="${r * 0.56}" fill="url(#${u}glass)"/>` +
      `<circle cx="${l.x}" cy="${l.y}" r="${r * 0.22}" fill="#151a2c"/>` +
      `<ellipse cx="${l.x - r * 0.22}" cy="${l.y - r * 0.24}" rx="${r * 0.16}" ry="${r * 0.11}" fill="#fff" opacity=".45"/>`
    );
  }

  /** SVG markup for a phone back. viewBox is in mm with a small margin for the buttons. */
  K.phoneSvg = function (phone, colorId) {
    const col = K.phoneColor(colorId);
    const u = K.uid('ph');
    const body = U.rgb(col.body);
    const dark = U.luma(body) < 0.4;
    const pad = 1.6;
    const { w, h, r } = phone;
    let s = `<svg class="kx-phone-svg" viewBox="${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`;
    s += `<defs>
      <linearGradient id="${u}b" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${U.hex(U.lighten(body, dark ? 0.06 : 0.25))}"/>
        <stop offset=".5" stop-color="${col.body}"/>
        <stop offset="1" stop-color="${U.hex(U.darken(body, dark ? 0.2 : 0.05))}"/>
      </linearGradient>
      <linearGradient id="${u}ring" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${dark ? '#6b6c72' : '#f6f6f7'}"/>
        <stop offset=".5" stop-color="${dark ? '#2c2d31' : '#b4b5bb'}"/>
        <stop offset="1" stop-color="${dark ? '#55565c' : '#e3e3e6'}"/>
      </linearGradient>
      <radialGradient id="${u}glass" cx=".35" cy=".3" r=".8">
        <stop offset="0" stop-color="#3a4a72"/>
        <stop offset=".6" stop-color="#151a2c"/>
        <stop offset="1" stop-color="#07080d"/>
      </radialGradient>
      <filter id="${u}is" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0.3" dy="0.6" stdDeviation="0.6" flood-opacity="${dark ? 0.6 : 0.22}"/></filter>
    </defs>`;
    (phone.buttons || []).forEach((b) => {
      const x = b.side === 'left' ? -0.9 : w - 0.4;
      s += `<rect x="${x}" y="${b.y}" width="1.3" height="${b.h}" rx="0.6" fill="${col.frame}"/>`;
    });
    s += `<rect x="0" y="0" width="${w}" height="${h}" rx="${r}" fill="${col.frame}"/>`;
    s += `<rect x="0.75" y="0.75" width="${w - 1.5}" height="${h - 1.5}" rx="${r - 0.75}" fill="url(#${u}b)"/>`;
    s += `<rect x="0.75" y="0.75" width="${w - 1.5}" height="${h - 1.5}" rx="${r - 0.75}" fill="none" stroke="#fff" stroke-opacity="${dark ? 0.06 : 0.35}" stroke-width="0.35"/>`;
    const cam = phone.camera || {};
    if (cam.island) {
      const i = cam.island;
      s += `<rect x="${i.x}" y="${i.y}" width="${i.w}" height="${i.h}" rx="${i.r}" fill="${col.island}" filter="url(#${u}is)"/>`;
      s += `<rect x="${i.x}" y="${i.y}" width="${i.w}" height="${i.h}" rx="${i.r}" fill="none" stroke="#fff" stroke-opacity="${dark ? 0.08 : 0.5}" stroke-width="0.3"/>`;
    }
    (cam.lenses || []).forEach((l) => (s += lens(l, u, !cam.island)));
    if (cam.flash) s += `<circle cx="${cam.flash.x}" cy="${cam.flash.y}" r="${cam.flash.r}" fill="#f4efe0" stroke="${dark ? '#55565c' : '#c9c9cc'}" stroke-width="0.35"/>`;
    if (cam.mic) s += `<circle cx="${cam.mic.x}" cy="${cam.mic.y}" r="${cam.mic.r}" fill="#0E0F14" opacity=".7"/>`;
    s += '</svg>';
    return s;
  };

  /** Distance (mm) from a device outline to the nearest keep-out zone. Negative means overlap. */
  K.phoneClearance = function (phone, dev) {
    let best = Infinity;
    (phone.keepOut || []).forEach((k) => {
      let d;
      if (dev.type === 'circle') {
        const r = dev.w / 2;
        const nx = U.clamp(dev.cx, k.x, k.x + k.w);
        const ny = U.clamp(dev.cy, k.y, k.y + k.h);
        d = Math.hypot(dev.cx - nx, dev.cy - ny) - r;
        if (dev.cx > k.x && dev.cx < k.x + k.w && dev.cy > k.y && dev.cy < k.y + k.h) d = -r;
      } else {
        const dx = Math.max(k.x - (dev.cx + dev.w / 2), dev.cx - dev.w / 2 - (k.x + k.w), 0);
        const dy = Math.max(k.y - (dev.cy + dev.h / 2), dev.cy - dev.h / 2 - (k.y + k.h), 0);
        d = dx > 0 || dy > 0 ? Math.hypot(dx, dy) : -Math.min(dev.w, dev.h) / 2;
      }
      best = Math.min(best, d);
    });
    return best;
  };
})(window.Bud);
