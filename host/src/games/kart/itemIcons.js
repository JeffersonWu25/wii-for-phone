// Item icons as inline SVG strings, viewBox 0 0 64 64. STUB from the core part: colored circles with a
// letter. The duel part replaces the art and keeps the export. The phone copy is identical:
// phone/src/games/kart/itemIcons.js.

const disc = (fill, letter, text = '#fff') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="${fill}" stroke="#fff" stroke-width="3"/>` +
  `<text x="32" y="43" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="32" fill="${text}">${letter}</text></svg>`;

export const ITEM_ICONS = {
  mushroom: disc('#d8001a', 'M'),
  banana: disc('#f7e21b', 'B', '#6b3b1a'),
  green: disc('#2fd14a', 'G'),
  red: disc('#e8401e', 'R'),
};
