// Seat the lobby before the first serve. Sides are A, B, or out.

export function seatPlayers(players) {
  const assignments = {};
  const count = players.length;
  for (let index = 0; index < count; index += 1) {
    assignments[players[index].playerId] = seatFor(count, index);
  }
  return { assignments, bestOf: 3 };
}

function seatFor(count, index) {
  if (count < 2) return 'out';
  if (count === 2) return index === 0 ? 'A' : 'B';
  if (count <= 4) return index < 2 ? 'A' : 'B';
  if (index < 2) return 'A';
  if (index < 4) return 'B';
  return 'out';
}

export function lineupFromAssignments(players, assignments) {
  const sideA = [];
  const sideB = [];
  for (const player of players) {
    const seat = assignments[player.playerId];
    if (seat === 'A') sideA.push(player.playerId);
    else if (seat === 'B') sideB.push(player.playerId);
  }
  const format = formatOf(sideA.length, sideB.length);
  return { sideA, sideB, format, legal: format !== null };
}

function formatOf(sideACount, sideBCount) {
  if (sideACount === 1 && sideBCount === 1) return '1v1';
  if ((sideACount === 1 && sideBCount === 2) || (sideACount === 2 && sideBCount === 1)) return '1v2';
  if (sideACount === 2 && sideBCount === 2) return '2v2';
  return null;
}

// The first CPU is cpu / CPU. Later ones are cpu-2, cpu-3, and CPU 2, CPU 3.
export function cpuPlayer(index) {
  const n = index + 1;
  if (n === 1) return { playerId: 'cpu', name: 'CPU' };
  return { playerId: `cpu-${n}`, name: `CPU ${n}` };
}

export function isCpuId(id) {
  return id === 'cpu' || (typeof id === 'string' && /^cpu-[1-9]\d*$/.test(id));
}

function humanOnSide(players, side) {
  return players.some((player) => player.side === side && !isCpuId(player.controlledBy || player.id));
}

// 'split' when a phone is on both sides. A CPU side keeps the camera behind the phone.
// 'A' or 'B' is the single camera. An empty list looks from side A.
export function courtFraming(players) {
  const list = Array.isArray(players) ? players : [];
  const humanA = humanOnSide(list, 'A');
  const humanB = humanOnSide(list, 'B');
  if (humanA && humanB) return 'split';
  if (humanB && !humanA) return 'B';
  if (humanA) return 'A';
  const hasA = list.some((player) => player.side === 'A');
  const hasB = list.some((player) => player.side === 'B');
  return hasB && !hasA ? 'B' : 'A';
}

// The new CPU joins the smaller side, or side B when the counts match.
// A side of three is not a seat, so this returns null instead of making one.
export function seatForCpu(players, assignments) {
  const { sideA, sideB } = lineupFromAssignments(players, assignments);
  const seat = sideA.length < sideB.length ? 'A' : 'B';
  const count = seat === 'A' ? sideA.length : sideB.length;
  if (count >= 2) return null;
  return seat;
}
