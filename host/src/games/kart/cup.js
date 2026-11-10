// Cup scoring — pure. A race result is the list kart_results carries: { playerId, name, color, place }.

// 12-racer Mario Kart points by place.
export const CUP_POINTS = [15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

export function placePoints(place) {
  return CUP_POINTS[place - 1] ?? 0;
}

// Standings after the races so far, best first. Ties break on the better place in the latest race.
export function cupStandings(races) {
  const byId = new Map();
  for (const race of races) {
    for (const r of race) {
      const row = byId.get(r.playerId) ?? { playerId: r.playerId, name: r.name, color: r.color, points: 0, lastPlace: Infinity };
      row.points += placePoints(r.place);
      row.lastPlace = r.place;
      byId.set(r.playerId, row);
    }
  }
  // A racer who missed the latest race has no place in it and ranks behind everyone who ran it on a tie.
  const latest = races.at(-1) ?? [];
  for (const row of byId.values()) {
    if (!latest.some((r) => r.playerId === row.playerId)) row.lastPlace = Infinity;
  }
  return [...byId.values()]
    .sort((a, b) => b.points - a.points || a.lastPlace - b.lastPlace)
    .map(({ lastPlace, ...row }, i) => ({ ...row, rank: i + 1 }));
}

export function cupPodium(races) {
  return cupStandings(races).slice(0, 3);
}
