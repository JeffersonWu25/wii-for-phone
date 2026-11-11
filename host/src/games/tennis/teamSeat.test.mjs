import test from 'node:test';
import assert from 'node:assert/strict';
import { lineupFromAssignments, seatPlayers } from './teamSeat.js';

function players(count) {
  return Array.from({ length: count }, (_, index) => ({
    playerId: `p${index + 1}`,
    name: `Player ${index + 1}`,
  }));
}

function seatsOf(roster, assignments) {
  return roster.map((player) => assignments[player.playerId]);
}

const EXPECTED = {
  0: { seats: [], format: null, legal: false, sideA: [], sideB: [] },
  1: { seats: ['out'], format: null, legal: false, sideA: [], sideB: [] },
  2: { seats: ['A', 'B'], format: '1v1', legal: true, sideA: ['p1'], sideB: ['p2'] },
  3: { seats: ['A', 'A', 'B'], format: '1v2', legal: true, sideA: ['p1', 'p2'], sideB: ['p3'] },
  4: { seats: ['A', 'A', 'B', 'B'], format: '2v2', legal: true, sideA: ['p1', 'p2'], sideB: ['p3', 'p4'] },
  5: { seats: ['A', 'A', 'B', 'B', 'out'], format: '2v2', legal: true, sideA: ['p1', 'p2'], sideB: ['p3', 'p4'] },
  6: { seats: ['A', 'A', 'B', 'B', 'out', 'out'], format: '2v2', legal: true, sideA: ['p1', 'p2'], sideB: ['p3', 'p4'] },
};

for (const count of [0, 1, 2, 3, 4, 5, 6]) {
  test(`seats a lobby of ${count}`, () => {
    const roster = players(count);
    const seated = seatPlayers(roster);
    const lineup = lineupFromAssignments(roster, seated.assignments);
    const expected = EXPECTED[count];

    assert.equal(seated.bestOf, 3);
    assert.deepEqual(seatsOf(roster, seated.assignments), expected.seats);
    assert.deepEqual(lineup, {
      sideA: expected.sideA,
      sideB: expected.sideB,
      format: expected.format,
      legal: expected.legal,
    });
  });
}

test('a host move turns 2v2 into an illegal 3-and-1', () => {
  const roster = players(4);
  const { assignments } = seatPlayers(roster);
  assert.equal(lineupFromAssignments(roster, assignments).format, '2v2');

  const moved = { ...assignments, p4: 'A' };
  assert.deepEqual(lineupFromAssignments(roster, moved), {
    sideA: ['p1', 'p2', 'p4'],
    sideB: ['p3'],
    format: null,
    legal: false,
  });
});

test('a host move that sits one player out of five so the remaining four can be 1v1', () => {
  const roster = players(5);
  const { assignments } = seatPlayers(roster);
  const sittingOut = roster.filter((player) => assignments[player.playerId] === 'out');
  const remaining = roster.filter((player) => assignments[player.playerId] !== 'out');
  assert.deepEqual(seatsOf(roster, assignments), ['A', 'A', 'B', 'B', 'out']);
  assert.equal(sittingOut.length, 1);
  assert.equal(remaining.length, 4);
  assert.equal(lineupFromAssignments(roster, assignments).format, '2v2');

  // The four who are still in can be sat down to a singles match.
  const oneVone = {
    ...assignments,
    [remaining[1].playerId]: 'out',
    [remaining[3].playerId]: 'out',
  };
  assert.deepEqual(lineupFromAssignments(roster, oneVone), {
    sideA: [remaining[0].playerId],
    sideB: [remaining[2].playerId],
    format: '1v1',
    legal: true,
  });
});

test('an empty side is not a match, and 1v2 is legal with the pair on either side', () => {
  const roster = players(4);
  assert.deepEqual(lineupFromAssignments(roster, { p1: 'A', p2: 'A', p3: 'out', p4: 'out' }), {
    sideA: ['p1', 'p2'],
    sideB: [],
    format: null,
    legal: false,
  });
  assert.equal(lineupFromAssignments(roster, { p1: 'B', p2: 'A', p3: 'B', p4: 'out' }).format, '1v2');
  assert.deepEqual(lineupFromAssignments(roster, { p1: 'B', p2: 'out', p3: 'A', p4: 'B' }), {
    sideA: ['p3'],
    sideB: ['p1', 'p4'],
    format: '1v2',
    legal: true,
  });
});
