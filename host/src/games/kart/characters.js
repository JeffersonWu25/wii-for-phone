// Original kart bodies in the colors of the Mario Kart roster.
// Names are the roster. Meshes are built in the scene, not copied models.

export const CHARACTERS = [
  { id: 'mario', name: 'Mario', body: 0x2247c7, hat: 0xe52521, skin: 0xf1c27d, css: '#e52521' },
  { id: 'luigi', name: 'Luigi', body: 0x2247c7, hat: 0x3caa2a, skin: 0xf1c27d, css: '#3caa2a' },
  { id: 'peach', name: 'Peach', body: 0xf28cb6, hat: 0xf7d34a, skin: 0xf6d2b5, css: '#f28cb6' },
  { id: 'daisy', name: 'Daisy', body: 0xf5a423, hat: 0xf7d34a, skin: 0xf6d2b5, css: '#f5a423' },
  { id: 'yoshi', name: 'Yoshi', body: 0x3caa2a, hat: 0xe52521, skin: 0xf4f4f4, css: '#3caa2a' },
  { id: 'toad', name: 'Toad', body: 0x2247c7, hat: 0xf4f4f4, skin: 0xf6d2b5, css: '#e52521' },
  { id: 'bowser', name: 'Bowser', body: 0xf0c419, hat: 0x2f7a32, skin: 0xf0c419, css: '#f0c419' },
  { id: 'wario', name: 'Wario', body: 0x6b3fa0, hat: 0xf0c419, skin: 0xf6d2b5, css: '#f0c419' },
  { id: 'waluigi', name: 'Waluigi', body: 0x2a2a6a, hat: 0x6b3fa0, skin: 0xf6d2b5, css: '#6b3fa0' },
  { id: 'rosalina', name: 'Rosalina', body: 0x5ec8e6, hat: 0xf7d34a, skin: 0xf6d2b5, css: '#5ec8e6' },
  { id: 'dk', name: 'Donkey Kong', body: 0x8a4b22, hat: 0xe52521, skin: 0xc68642, css: '#8a4b22' },
  { id: 'koopa', name: 'Koopa Troopa', body: 0xf0c419, hat: 0x2f7a32, skin: 0xf0c419, css: '#2f7a32' },
];

export function characterFor(index) {
  return CHARACTERS[index % CHARACTERS.length];
}
