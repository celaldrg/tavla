import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLACK, WHITE, startingBoard } from '../src/board.js';
import { legalTurns } from '../src/rules.js';
import { createRng } from '../src/dice.js';

// ---------------------------------------------------------------------------
// Independent brute-force reference (shares no code with src/rules.js).
// A position is seen from the player to move: me[r] = own checkers r pips away
// from bearing off (25 = bar, 0 = borne off); op[r] = opposing checkers on that
// same point (0 = their bar, 25 = their borne-off checkers). Every ordering of the
// dice is tried with every checker, without pruning or memoisation.
// ---------------------------------------------------------------------------

function referenceStart() {
  const me = new Array(26).fill(0);
  const op = new Array(26).fill(0);
  Object.assign(me, { 24: 2, 13: 5, 8: 3, 6: 5 });
  Object.assign(op, { 1: 2, 12: 5, 17: 3, 19: 5 });
  return { me, op };
}

const keyOf = (state) => `${state.me.join(',')}|${state.op.join(',')}`;

function allHome(state) {
  if (state.me[25] > 0) return false;
  for (let r = 7; r <= 24; r++) if (state.me[r] > 0) return false;
  return true;
}

function highestChecker(state) {
  for (let r = 24; r >= 1; r--) if (state.me[r] > 0) return r;
  return 0;
}

function moveChecker(state, from, to) {
  const me = state.me.slice();
  const op = state.op.slice();
  me[from] -= 1;
  if (to === 0) {
    me[0] += 1;
  } else {
    if (op[to] === 1) {
      op[to] = 0;
      op[0] += 1;
    }
    me[to] += 1;
  }
  return { me, op };
}

/** Every legal move of one checker with one die: [{from, to, state}]. */
function referenceMoves(state, die) {
  const sources = [];
  if (state.me[25] > 0) sources.push(25);
  else for (let r = 24; r >= 1; r--) if (state.me[r] > 0) sources.push(r);
  const moves = [];
  for (const from of sources) {
    const to = from - die;
    if (to >= 1) {
      if (state.op[to] < 2) moves.push({ from, to, state: moveChecker(state, from, to) });
    } else if (allHome(state) && (to === 0 || highestChecker(state) === from)) {
      moves.push({ from, to: 0, state: moveChecker(state, from, 0) });
    }
  }
  return moves;
}

/** Legal final positions for a roll: {most, finals: Map(key -> state)}. */
function referenceTurns(state, dice) {
  const [a, b] = dice;
  const orders = a === b ? [[a, a, a, a]] : [[a, b], [b, a]];
  const ends = [];
  const walk = (current, order, used, firstDie) => {
    const moves = used < order.length ? referenceMoves(current, order[used]) : [];
    if (moves.length === 0) ends.push({ state: current, used, firstDie });
    for (const move of moves) walk(move.state, order, used + 1, used === 0 ? order[0] : firstDie);
  };
  for (const order of orders) walk(state, order, 0, 0);
  const most = Math.max(...ends.map((end) => end.used));
  let kept = most === 0 ? [] : ends.filter((end) => end.used === most);
  const high = Math.max(a, b);
  if (a !== b && most === 1 && kept.some((end) => end.firstDie === high)) {
    kept = kept.filter((end) => end.firstDie === high);
  }
  return { most, finals: new Map(kept.map((end) => [keyOf(end.state), end.state])) };
}

/** The same position seen by the other player. */
function flip(state) {
  const me = new Array(26);
  const op = new Array(26);
  for (let r = 0; r <= 25; r++) {
    me[r] = state.op[25 - r];
    op[r] = state.me[25 - r];
  }
  return { me, op };
}

// Conversions between the reference view and src boards (absolute indices).
const indexOf = (mover, r) => (mover === WHITE ? r - 1 : 24 - r);

function toReference(board, mover) {
  const me = new Array(26).fill(0);
  const op = new Array(26).fill(0);
  const sign = mover === WHITE ? 1 : -1;
  for (let r = 1; r <= 24; r++) {
    const value = board.points[indexOf(mover, r)] * sign;
    if (value > 0) me[r] = value;
    if (value < 0) op[r] = -value;
  }
  me[25] = board.bar[mover];
  me[0] = board.off[mover];
  op[0] = board.bar[1 - mover];
  op[25] = board.off[1 - mover];
  return { me, op };
}

function toBoard(state, mover) {
  const points = new Array(24).fill(0);
  const sign = mover === WHITE ? 1 : -1;
  for (let r = 1; r <= 24; r++) points[indexOf(mover, r)] = sign * state.me[r] - sign * state.op[r];
  const bar = [0, 0];
  const off = [0, 0];
  bar[mover] = state.me[25];
  off[mover] = state.me[0];
  bar[1 - mover] = state.op[0];
  off[1 - mover] = state.op[25];
  return { points, bar, off };
}

/** Replays generator steps with reference moves; fails on any illegal step. */
function replayInReference(state, mover, steps) {
  let current = state;
  for (const step of steps) {
    const from = step.from === 'bar' ? 25 : mover === WHITE ? step.from + 1 : 24 - step.from;
    const to = step.to === 'off' ? 0 : mover === WHITE ? step.to + 1 : 24 - step.to;
    const move = referenceMoves(current, step.die).find((m) => m.from === from && m.to === to);
    assert.ok(move, `step ${JSON.stringify(step)} is not a legal single move`);
    assert.equal(step.hit, current.op[to] === 1 && to !== 0, 'hit flag');
    current = move.state;
  }
  return current;
}

/** Asserts that legalTurns gives exactly the reference positions for this roll. */
function assertSameTurns(state, mover, dice) {
  const expected = referenceTurns(state, dice);
  const turns = legalTurns(toBoard(state, mover), mover, dice);
  const keys = turns.map((turn) => keyOf(toReference(turn.board, mover)));
  assert.equal(new Set(keys).size, keys.length, 'positions must be deduplicated');
  assert.deepEqual(new Set(keys), new Set(expected.finals.keys()), `positions for ${dice} differ`);
  for (const turn of turns) {
    assert.equal(turn.steps.length, expected.most, 'every turn uses the maximum number of dice');
    assert.equal(keyOf(replayInReference(state, mover, turn.steps)), keyOf(toReference(turn.board, mover)));
  }
  return expected;
}

// Distinct positions after each of the 21 rolls from the starting position,
// produced by the reference above (for example 2-1: 15, 5-5: 4, 6-6: 11).
const OPENING_COUNTS = {
  '1-1': 42, '2-1': 15, '3-1': 16, '4-1': 14, '5-1': 8, '6-1': 10,
  '2-2': 75, '3-2': 17, '4-2': 18, '5-2': 8, '6-2': 14,
  '3-3': 73, '4-3': 17, '5-3': 9, '6-3': 14,
  '4-4': 52, '5-4': 9, '6-4': 14,
  '5-5': 4, '6-5': 7,
  '6-6': 11,
};

test('the reference reproduces the opening table for all 21 rolls', () => {
  let rolls = 0;
  for (const [roll, count] of Object.entries(OPENING_COUNTS)) {
    const dice = roll.split('-').map(Number);
    assert.equal(referenceTurns(referenceStart(), dice).finals.size, count, roll);
    rolls += 1;
  }
  assert.equal(rolls, 21);
});

test('the starting board matches the reference start for both players', () => {
  for (const mover of [WHITE, BLACK]) {
    assert.equal(keyOf(toReference(startingBoard(), mover)), keyOf(referenceStart()));
  }
});

test('legal-move generation from the start matches the known counts for all 21 rolls', () => {
  for (const [roll, count] of Object.entries(OPENING_COUNTS)) {
    const [high, low] = roll.split('-').map(Number);
    for (const mover of [WHITE, BLACK]) {
      for (const dice of [[high, low], [low, high]]) {
        assert.equal(legalTurns(startingBoard(), mover, dice).length, count, `${roll} for player ${mover}`);
        assertSameTurns(referenceStart(), mover, dice);
      }
    }
  }
});

test('legal-move generation matches the reference on positions from random games', () => {
  const rng = createRng(20261027);
  const roll = () => 1 + Math.floor(rng() * 6);
  const seen = { positions: 0, bar: 0, bearOff: 0, hits: 0, noMove: 0, oneDie: 0, partialDouble: 0 };
  for (let game = 0; game < 24; game++) {
    let state = referenceStart();
    let mover = game % 2;
    for (let ply = 0; ply < 800; ply++) {
      const dice = [roll(), roll()];
      const expected = assertSameTurns(state, mover, dice);
      seen.positions += 1;
      if (state.me[25] > 0) seen.bar += 1;
      if (allHome(state)) seen.bearOff += 1;
      if (expected.most === 0) seen.noMove += 1;
      if (dice[0] !== dice[1] && expected.most === 1) seen.oneDie += 1;
      if (dice[0] === dice[1] && expected.most > 0 && expected.most < 4) seen.partialDouble += 1;
      const finals = [...expected.finals.values()];
      if (finals.some((final) => final.op[0] > state.op[0])) seen.hits += 1;
      const next = finals.length > 0 ? finals[Math.floor(rng() * finals.length)] : state;
      if (next.me[0] === 15) break;
      state = flip(next);
      mover = 1 - mover;
    }
  }
  for (const [situation, count] of Object.entries(seen)) {
    assert.ok(count > 0, `random games never produced: ${situation}`);
  }
});
