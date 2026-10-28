import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAR, OFF, WHITE, boardKey, createBoard, startingBoard } from '../src/board.js';
import { legalTurns } from '../src/rules.js';
import { createRng, diceToPlay } from '../src/dice.js';
import { allowedSteps, findStep, isTurnComplete, playStep, startTurn, undoStep } from '../src/turn.js';
import { createGame } from '../src/game.js';

/** Final positions reachable by playing allowed steps one at a time (memoised search). */
function reachableByAllowedSteps(turn) {
  const finals = new Set();
  const seen = new Set();
  const visit = (current) => {
    const key = boardKey(current.board) + current.remaining.join('');
    if (seen.has(key)) return;
    seen.add(key);
    const steps = allowedSteps(current);
    if (steps.length === 0) {
      assert.ok(isTurnComplete(current), 'allowed steps never lead into a dead end');
      finals.add(boardKey(current.board));
    }
    for (const step of steps) visit(playStep(current, step));
  };
  visit(turn);
  return finals;
}

/**
 * Positions met in a seeded game where each side plays the Easy computer's turn or,
 * with `randomPlay`, a random legal turn (more hits and blocked checkers).
 */
function positionsFromGame(seed, randomPlay) {
  const game = createGame({ mode: 'pvp', level: 'easy', seed });
  const rng = createRng(seed);
  const samples = [];
  for (let turns = 0; game.getState().phase !== 'over'; turns++) {
    assert.ok(turns < 1000, 'the game must end');
    if (game.getState().phase === 'roll') game.roll();
    const { board, current, dice } = game.getState();
    samples.push({ board, player: current });
    const options = randomPlay ? legalTurns(board, current, dice) : [];
    const steps = options.length > 0 ? options[Math.floor(rng() * options.length)].steps : game.aiSteps();
    for (const step of steps) game.move(step.from, step.to, step.die);
    game.confirm();
  }
  return samples;
}

/** Asserts that one-step-at-a-time play and legalTurns agree for one roll. */
function assertStepsMatchTurns(board, player, dice) {
  const turns = legalTurns(board, player, dice);
  const start = startTurn(board, player, dice);
  const expected = new Set(turns.map((turn) => boardKey(turn.board)));
  if (turns.length === 0) expected.add(boardKey(board));
  assert.deepEqual(reachableByAllowedSteps(start), expected);
  for (const option of turns) {
    let turn = start;
    for (const step of option.steps) {
      turn = playStep(turn, step);
      assert.notEqual(turn, null, 'each step of a legal turn is allowed');
    }
    assert.ok(isTurnComplete(turn));
    assert.equal(boardKey(turn.board), boardKey(option.board));
  }
}

test('step-by-step play reaches exactly the legal turns, and every legal turn can be played', () => {
  const samples = [...positionsFromGame(3, false), ...positionsFromGame(8, true)];
  for (const { board, player } of samples) {
    for (let a = 1; a <= 6; a++) {
      for (let b = a; b <= 6; b++) assertStepsMatchTurns(board, player, [b, a]);
    }
  }
  assert.ok(samples.length > 100);
});

test('undo takes steps back to the start of the turn', () => {
  const start = startTurn(startingBoard(), WHITE, [3, 1]);
  const first = playStep(start, { from: 7, to: 4 });
  const second = playStep(first, { from: 5, to: 4 });
  assert.ok(isTurnComplete(second));
  assert.deepEqual(second.remaining, []);
  assert.equal(second.board.points[4], 2);

  const back = undoStep(second);
  assert.deepEqual(back.played, first.played);
  assert.deepEqual(back.board, first.board);
  assert.deepEqual(back.remaining, [1]);
  const empty = undoStep(back);
  assert.deepEqual(empty.board, startingBoard());
  assert.deepEqual(empty.remaining, diceToPlay([3, 1]));
  assert.equal(undoStep(empty), empty);
});

test('illegal steps are refused', () => {
  const start = startTurn(startingBoard(), WHITE, [6, 5]);
  assert.equal(playStep(start, { from: 23, to: 18 }), null, 'index 18 is blocked by black');
  assert.equal(playStep(start, { from: 12, to: 9 }), null, 'no die shows 3');
  assert.equal(playStep(start, { from: 0, to: OFF }), null, 'black checker / no bearing off');
  assert.equal(playStep(start, { from: BAR, to: 18 }), null, 'nothing on the bar');
  assert.equal(playStep(start, { from: 12, to: 7, die: 6 }), null, 'die does not match the distance');
  assert.notEqual(playStep(start, { from: 12, to: 7, die: 5 }), null);
});

test('a bear-off that either die can make uses the smaller die unless one is named', () => {
  const board = createBoard({ white: { 3: 1, 0: 1 }, black: { 23: 15 }, off: [13, 0] });
  const turn = startTurn(board, WHITE, [6, 5]);
  assert.equal(findStep(turn, 3, OFF).die, 5);
  assert.equal(findStep(turn, 3, OFF, 6).die, 6);
  const played = playStep(turn, { from: 3, to: OFF });
  assert.deepEqual(played.remaining, [6]);
  const done = playStep(played, { from: 0, to: OFF });
  assert.ok(isTurnComplete(done));
  assert.equal(done.board.off[WHITE], 15);
});

test('a turn with no legal move is complete at once', () => {
  const board = createBoard({
    white: { 23: 2, 12: 4, 7: 3, 5: 5 },
    black: { 18: 2, 19: 2, 0: 2, 11: 5, 16: 4 },
    bar: [1, 0],
  });
  const turn = startTurn(board, WHITE, [6, 5]);
  assert.equal(turn.total, 0);
  assert.ok(isTurnComplete(turn));
  assert.deepEqual(allowedSteps(turn), []);
});

test('the last checker may be borne off with the larger die, which ends the turn', () => {
  const board = createBoard({ white: { 2: 1 }, black: { 23: 15 }, off: [14, 0] });
  const turn = startTurn(board, WHITE, [6, 1]);
  const direct = findStep(turn, 2, OFF);
  assert.ok(direct, 'bearing off from the 3-point with the 6 is allowed');
  assert.equal(direct.die, 6);
  assert.ok(findStep(turn, 2, 1, 1), 'moving down with the 1 first still works');
  const after = playStep(turn, direct);
  assert.equal(after.board.off[WHITE], 15);
  assert.ok(isTurnComplete(after));
  assert.deepEqual(allowedSteps(after), []);
});
