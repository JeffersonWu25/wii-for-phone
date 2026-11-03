// Item icons as inline SVG strings, viewBox 0 0 64 64, drawn from the same shapes and colours as the 3D
// models (scene/itemModels.js). No faces. The phone copy is identical: phone/src/games/kart/itemIcons.js.

const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">';

const mushroom =
  OPEN +
  '<path d="M23 36 C21 50 22 57 28 59 H36 C42 57 43 50 41 36 Z" fill="#f3d98c" stroke="#a87f35" stroke-width="2" stroke-linejoin="round"/>' +
  '<path d="M27 44 Q32 47 37 44" fill="none" stroke="#d9b867" stroke-width="2" stroke-linecap="round"/>' +
  '<path d="M5 40 C4 16 20 5 32 5 C44 5 60 16 59 40 Q32 48 5 40 Z" fill="#d8001a" stroke="#7a0010" stroke-width="2.5" stroke-linejoin="round"/>' +
  '<circle cx="32" cy="16" r="7" fill="#f5f5f5"/><circle cx="16" cy="31" r="6" fill="#f5f5f5"/>' +
  '<circle cx="48" cy="31" r="6" fill="#f5f5f5"/><circle cx="32" cy="34" r="3.5" fill="#f5f5f5"/>' +
  '<path d="M13 22 Q17 14 24 11" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/></svg>';

const FLAP = '<path d="M26 34 C19 38 11 37 4 43 C1 46 5 53 9 52 C18 50 26 51 32 44 Z"/>';
const banana =
  OPEN +
  '<defs><linearGradient id="kbp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a6d43a"/><stop offset=".5" stop-color="#f7e21b"/></linearGradient></defs>' +
  `<g stroke="#9a7c00" stroke-width="2" stroke-linejoin="round" fill="#f7e21b">${FLAP}</g>` +
  `<g stroke="#9a7c00" stroke-width="2" stroke-linejoin="round" fill="#f7e21b" transform="translate(64 0) scale(-1 1)">${FLAP}</g>` +
  '<path d="M25 38 C24 48 28 56 29.5 61 H34.5 C36 56 40 48 39 38 Z" fill="#f7e21b" stroke="#9a7c00" stroke-width="2" stroke-linejoin="round"/>' +
  '<path d="M27 10 C23 22 21 32 24 41 H40 C43 32 41 22 37 10 Z" fill="url(#kbp)" stroke="#9a7c00" stroke-width="2" stroke-linejoin="round"/>' +
  '<path d="M29 4 H35 L36 11 H28 Z" fill="#6b3b1a" stroke="#4a2810" stroke-width="1.5" stroke-linejoin="round"/>' +
  '<g fill="#6b3b1a"><ellipse cx="5" cy="49.5" rx="3" ry="2.2" transform="rotate(-35 5 49.5)"/>' +
  '<ellipse cx="59" cy="49.5" rx="3" ry="2.2" transform="rotate(35 59 49.5)"/><rect x="29.5" y="57" width="5" height="4.5" rx="1.5"/></g>' +
  '<path d="M30 18 Q29 28 30 36" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="2.5" stroke-linecap="round"/></svg>';

const shell = (id, plate, groove) =>
  OPEN +
  `<defs><clipPath id="${id}"><path d="M8 38 C8 14 22 7 32 7 C42 7 56 14 56 38 Z"/></clipPath></defs>` +
  '<path d="M10 44 C12 58 22 61 32 61 C42 61 52 58 54 44 Z" fill="#f0dfa0" stroke="#a88a40" stroke-width="2" stroke-linejoin="round"/>' +
  '<path d="M16 50 Q32 55 48 50 M21 56 Q32 59 43 56" fill="none" stroke="#b89f55" stroke-width="1.8" stroke-linecap="round"/>' +
  `<path d="M8 38 C8 14 22 7 32 7 C42 7 56 14 56 38 Z" fill="${plate}"/>` +
  `<g clip-path="url(#${id})" fill="none" stroke="${groove}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">` +
  '<path d="M22 8 Q27 18 21 40 M42 8 Q37 18 43 40 M10 26 Q32 33 54 26 M27 18 Q32 16 37 18 M32 33 L32 40"/></g>' +
  `<path d="M8 38 C8 14 22 7 32 7 C42 7 56 14 56 38" fill="none" stroke="${groove}" stroke-width="2.2"/>` +
  '<path d="M13 24 Q16 15 24 11" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="3" stroke-linecap="round"/>' +
  '<rect x="3" y="34" width="58" height="13" rx="6.5" fill="#f2f2ee" stroke="#a9a9a0" stroke-width="2"/>' +
  '<path d="M9 38 H55" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>';

export const ITEM_ICONS = {
  mushroom,
  banana,
  green: shell('kgc', '#2fd14a', '#1d6b1f'),
  red: shell('krc', '#e8401e', '#7a1a10'),
};
