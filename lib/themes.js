/* Color themes and state colors.
 *
 * A theme id picks a palette inside each character (character.palettes[themeId]).
 * State colors are shared across characters so "blue means listening" stays true
 * everywhere. Mono drops all hue so expressions must read from shape and motion.
 */
(function (K) {
  'use strict';
  const U = K.util;

  [
    { id: 'classic', label: 'Classic', note: 'Goblin-fire teal, warm mochi, clay tile.' },
    { id: 'night', label: 'Night', note: 'Violet and slate. Usually the fewest lit pixels.' },
    { id: 'sakura', label: 'Sakura', note: 'Cherry blossom pinks.' },
    { id: 'mint', label: 'Mint', note: 'Mint and celadon greens.' },
    { id: 'dancheong', label: 'Dancheong', note: 'Palace paint colors: green, vermilion, gold and blue.' },
    { id: 'mono', label: 'Mono', note: 'Grayscale, like a single-color OLED. State has to read from motion alone.' },
  ].forEach(K.registerTheme);

  /** Semantic state colors. Ember's flame, Bun's horn tip, Giwa's mane all pull from these. */
  const TINTS = {
    listening: '#4AA8FF',
    thinking: '#FF9A2E',
    speaking: '#A98BFF',
    working: '#FFB547',
    done: '#FFD84D',
    recording: '#FF3D4F',
    lowbattery: '#FF6A3A',
    needsyou: '#FF5FB0',
    confused: '#FF8A5B',
    charging: '#4ADE80',
    privacy: '#9AA3B5',
    love: '#FF5C8A',
  };
  const TINTS_BY_THEME = {
    mono: Object.fromEntries(Object.keys(TINTS).map((k) => [k, '#FFFFFF'])),
  };
  K.TINTS = TINTS;

  const tintCache = new Map();
  K.tint = function (themeId, key) {
    const ck = themeId + '|' + key;
    let v = tintCache.get(ck);
    if (!v) {
      const hex = (TINTS_BY_THEME[themeId] && TINTS_BY_THEME[themeId][key]) || TINTS[key] || '#FFFFFF';
      v = U.rgb(hex);
      tintCache.set(ck, v);
    }
    return v;
  };

  /** Accessory colors per theme (beanie, scarf and friends). */
  const ACC = {
    classic: { hat: '#E5484D', hat2: '#FFF4E6', scarf: '#F2A33A', scarf2: '#FFF4E6' },
    night: { hat: '#6B5CE7', hat2: '#E6E1FF', scarf: '#F2C14E', scarf2: '#4A4290' },
    sakura: { hat: '#FF7EA8', hat2: '#FFFFFF', scarf: '#FFFFFF', scarf2: '#FF8FB6' },
    mint: { hat: '#21A866', hat2: '#E9FFF3', scarf: '#FF8A65', scarf2: '#FFF3E8' },
    dancheong: { hat: '#2F5DA8', hat2: '#F2C14E', scarf: '#E8402E', scarf2: '#2E8B6E' },
    mono: { hat: '#9A9A9A', hat2: '#FFFFFF', scarf: '#D0D0D0', scarf2: '#6B6B6B' },
  };
  const accCache = new Map();
  K.accColors = function (themeId) {
    let v = accCache.get(themeId);
    if (!v) {
      const raw = ACC[themeId] || ACC.classic;
      v = {};
      for (const k in raw) v[k] = U.rgb(raw[k]);
      accCache.set(themeId, v);
    }
    return v;
  };
})(window.Bud);
