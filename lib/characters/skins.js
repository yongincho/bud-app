/* Base + skins (direction 5).
 *
 * Not a new face: a wrapper that takes any base creature and applies a skin pack
 * (color theme + hat/neck/item + ambience) from accessories.js. The explorer shows
 * a base picker and pack picker when this is selected.
 */
(function (K) {
  'use strict';

  K.registerCharacter({
    id: 'skins',
    label: 'Base + skins',
    kr: '옷장',
    tagline: 'Any base creature, swappable looks',
    blurb: 'Direction 5 is a system rather than a new face: pick any base creature (Bud by default), then dress it with a skin pack (outfit, hat, glasses, held item, color theme and ambience). A possible revenue line.',
    wrapper: true,
    resolve(cfg) {
      const pack = K.pack(cfg.pack);
      const b = K.characters.get(cfg.base);
      const base = b && !b.wrapper ? b.id : 'eyes';
      return { character: base, theme: pack.theme, acc: pack.acc, ambient: pack.ambient };
    },
  });
})(window.Bud);
