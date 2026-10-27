// Original kart bodies in the colors of the Mario Kart roster.
// Names are the roster. Meshes are built in the scene, not copied models.
// stats multiply the race-wide host knobs (Mario Kart weight-class feel).

const BALANCED = Object.freeze({ speed: 1, turn: 1, drift: 1, boost: 1 });

export const CHARACTERS = [
  { id: 'mario', name: 'Mario', body: 0x2247c7, hat: 0xe52521, skin: 0xf1c27d, css: '#e52521', stats: { ...BALANCED } },
  { id: 'luigi', name: 'Luigi', body: 0x2247c7, hat: 0x3caa2a, skin: 0xf1c27d, css: '#3caa2a', stats: { speed: 1.05, turn: 0.95, drift: 1, boost: 1 } },
  { id: 'peach', name: 'Peach', body: 0xf28cb6, hat: 0xf7d34a, skin: 0xf6d2b5, css: '#f28cb6', stats: { speed: 0.92, turn: 1.12, drift: 1.08, boost: 1 } },
  { id: 'daisy', name: 'Daisy', body: 0xf5a423, hat: 0xf7d34a, skin: 0xf6d2b5, css: '#f5a423', stats: { speed: 0.96, turn: 1.08, drift: 1.05, boost: 1.05 } },
  { id: 'yoshi', name: 'Yoshi', body: 0x3caa2a, hat: 0xe52521, skin: 0xf4f4f4, css: '#3caa2a', stats: { speed: 1.02, turn: 1.05, drift: 1.1, boost: 0.95 } },
  { id: 'toad', name: 'Toad', body: 0x2247c7, hat: 0xf4f4f4, skin: 0xf6d2b5, css: '#e52521', stats: { speed: 0.88, turn: 1.2, drift: 1.15, boost: 1.1 } },
  { id: 'bowser', name: 'Bowser', body: 0xf0c419, hat: 0x2f7a32, skin: 0xf0c419, css: '#f0c419', stats: { speed: 1.18, turn: 0.78, drift: 0.85, boost: 0.9 } },
  { id: 'wario', name: 'Wario', body: 0x6b3fa0, hat: 0xf0c419, skin: 0xf6d2b5, css: '#f0c419', stats: { speed: 1.12, turn: 0.82, drift: 0.9, boost: 0.95 } },
  { id: 'waluigi', name: 'Waluigi', body: 0x2a2a6a, hat: 0x6b3fa0, skin: 0xf6d2b5, css: '#6b3fa0', stats: { speed: 1.08, turn: 0.88, drift: 1.05, boost: 1 } },
  { id: 'rosalina', name: 'Rosalina', body: 0x5ec8e6, hat: 0xf7d34a, skin: 0xf6d2b5, css: '#5ec8e6', stats: { speed: 1.04, turn: 0.98, drift: 1.02, boost: 1.08 } },
  { id: 'dk', name: 'Donkey Kong', body: 0x8a4b22, hat: 0xe52521, skin: 0xc68642, css: '#8a4b22', stats: { speed: 1.14, turn: 0.8, drift: 0.88, boost: 0.92 } },
  { id: 'koopa', name: 'Koopa Troopa', body: 0xf0c419, hat: 0x2f7a32, skin: 0xf0c419, css: '#2f7a32', stats: { speed: 0.9, turn: 1.15, drift: 1.12, boost: 1.05 } },
];

export const PLAYABLE_IDS = ['mario', 'luigi', 'peach', 'daisy'];

export function characterById(id) {
  return CHARACTERS.find((character) => character.id === id) || null;
}

export function playableCharacters() {
  return PLAYABLE_IDS.map((id) => {
    const character = characterById(id);
    if (!character) throw new Error(`missing playable character ${id}`);
    return character;
  });
}

function assertStats(character) {
  const stats = character.stats;
  if (!stats) throw new Error(`${character.id} missing stats`);
  for (const key of ['speed', 'turn', 'drift', 'boost']) {
    if (!(Number(stats[key]) > 0)) throw new Error(`${character.id}.stats.${key}`);
  }
}

for (const character of CHARACTERS) assertStats(character);
playableCharacters();
