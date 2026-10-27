import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAR, BLACK, OFF, WHITE, createBoard, startingBoard } from '../src/board.js';
import {
  applyStep,
  canBearOff,
  gameResult,
  isBlocked,
  legalTurns,
  maxDiceUsable,
  singleSteps,
} from '../src/rules.js';
import { allowedSteps, playStep, startTurn } from '../src/turn.js';

/** White checkers per point index, e.g. {12: 2, 0: 13}. */
function whiteLayout(board) {
  const layout = {};
  board.points.forEach((count, index) => {
    if (count > 0) layout[index] = count;
  });
  return layout;
}

const fromTo = (steps) => steps.map((step) => [step.from, step.to]);

test('both dice must be used when possible, even if the larger die alone would fit', () => {
  // The 6 played with the checker on index 12 would leave no legal 2 (index 4 and 18 are blocked),
  // but playing the 6 from index 20 lets both dice be used, so 12 -> 6 is not a legal turn start.
  const board = createBoard({
    white: { 20: 1, 12: 1, 0: 13 },
    black: { 4: 2, 18: 2, 23: 11 },
  });
  assert.ok(singleSteps(board, WHITE, 6).some((step) => step.from === 12 && step.to === 6));

  const turns = legalTurns(board, WHITE, [6, 2]);
  assert.equal(turns.length, 2);
  assert.ok(turns.every((turn) => turn.steps.length === 2));
  assert.ok(turns.every((turn) => !turn.steps.some((step) => step.from === 12 && step.die === 6)));
  const layouts = turns.map((turn) => JSON.stringify(whiteLayout(turn.board))).sort();
  assert.deepEqual(layouts, [JSON.stringify({ 0: 13, 10: 1, 14: 1 }), JSON.stringify({ 0: 13, 12: 2 })].sort());

  const turn = startTurn(board, WHITE, [6, 2]);
  assert.equal(turn.total, 2);
  assert.deepEqual(fromTo(allowedSteps(turn)).sort(), [[12, 10], [20, 14]]);
  assert.equal(playStep(turn, { from: 12, to: 6 }), null);
});

test('when only one die can be used, the larger one must be played', () => {
  const board = createBoard({ white: { 12: 1, 0: 14 }, black: { 4: 2, 23: 13 } });
  assert.equal(singleSteps(board, WHITE, 2).length, 1, 'the 2 alone would be playable');

  const turns = legalTurns(board, WHITE, [2, 6]);
  assert.deepEqual(
    turns.map((turn) => turn.steps),
    [[{ from: 12, to: 6, die: 6, hit: false }]],
  );

  const turn = startTurn(board, WHITE, [2, 6]);
  assert.equal(turn.total, 1);
  assert.equal(turn.forcedDie, 6);
  assert.deepEqual(fromTo(allowedSteps(turn)), [[12, 6]]);
  assert.equal(playStep(turn, { from: 12, to: 10 }), null);
});

test('the smaller die is played when the larger one cannot be', () => {
  const board = createBoard({ white: { 12: 1, 0: 14 }, black: { 6: 2, 4: 2, 23: 11 } });
  const turns = legalTurns(board, WHITE, [6, 2]);
  assert.deepEqual(
    turns.map((turn) => turn.steps),
    [[{ from: 12, to: 10, die: 2, hit: false }]],
  );
  assert.equal(startTurn(board, WHITE, [6, 2]).forcedDie, 2);
});

test('doubles are played four times, or as often as possible', () => {
  assert.ok(legalTurns(startingBoard(), WHITE, [6, 6]).every((turn) => turn.steps.length === 4));

  const board = createBoard({ white: { 12: 1, 0: 14 }, black: { 3: 2, 23: 13 } });
  const turns = legalTurns(board, WHITE, [3, 3]);
  assert.deepEqual(fromTo(turns[0].steps), [[12, 9], [9, 6]]);
  assert.equal(turns.length, 1);
  assert.equal(maxDiceUsable(board, WHITE, [3, 3, 3, 3]), 2);
});

test('a checker on the bar must enter before any other checker moves', () => {
  const board = createBoard({
    white: { 23: 2, 12: 4, 7: 3, 5: 5 },
    black: { 18: 2, 0: 2, 11: 5, 16: 4, 21: 2 },
    bar: [1, 0],
  });
  assert.deepEqual(singleSteps(board, WHITE, 6), [], 'index 18 is blocked');
  assert.deepEqual(singleSteps(board, WHITE, 5), [{ from: BAR, to: 19, die: 5, hit: false }]);

  const turns = legalTurns(board, WHITE, [6, 5]);
  assert.ok(turns.length > 1);
  for (const turn of turns) {
    assert.deepEqual(turn.steps[0], { from: BAR, to: 19, die: 5, hit: false });
    assert.equal(turn.steps[1].die, 6);
  }
  assert.ok(turns.some((turn) => turn.steps[1].from === 19), 'the entered checker may continue');
});

test('no move is possible when every entry point is blocked', () => {
  const board = createBoard({
    white: { 23: 2, 12: 4, 7: 3, 5: 5 },
    black: { 18: 2, 19: 2, 0: 2, 11: 5, 16: 4 },
    bar: [1, 0],
  });
  assert.deepEqual(legalTurns(board, WHITE, [6, 5]), []);
  assert.equal(startTurn(board, WHITE, [6, 5]).total, 0);
});

test('two checkers on the bar use both dice to enter', () => {
  const white = { 23: 2, 12: 3, 7: 3, 5: 5 };
  const open = createBoard({ white, black: { 0: 2, 11: 5, 16: 3, 21: 5 }, bar: [2, 0] });
  const turns = legalTurns(open, WHITE, [6, 5]);
  assert.equal(turns.length, 1);
  assert.ok(turns[0].steps.every((step) => step.from === BAR));
  assert.equal(turns[0].board.points[18], 1);
  assert.equal(turns[0].board.points[19], 1);

  const halfBlocked = createBoard({ white, black: { 0: 2, 11: 5, 16: 3, 18: 5 }, bar: [2, 0] });
  assert.deepEqual(
    legalTurns(halfBlocked, WHITE, [6, 5]).map((turn) => turn.steps),
    [[{ from: BAR, to: 19, die: 5, hit: false }]],
    'the 6 is lost while a checker is still on the bar',
  );
});

test('with a double, one checker enters and the other three moves are free', () => {
  const board = createBoard({
    white: { 23: 1, 12: 5, 7: 3, 5: 5 },
    black: { 0: 2, 11: 5, 16: 3, 18: 5 },
    bar: [1, 0],
  });
  const turns = legalTurns(board, WHITE, [4, 4]);
  assert.ok(turns.length > 1);
  for (const turn of turns) {
    assert.equal(turn.steps.length, 4);
    assert.deepEqual(turn.steps[0], { from: BAR, to: 20, die: 4, hit: false });
  }
});

test('black enters on white\'s home board', () => {
  const board = createBoard({
    white: { 23: 2, 12: 5, 7: 3, 5: 5 },
    black: { 0: 1, 11: 5, 16: 3, 18: 5 },
    bar: [0, 1],
  });
  assert.deepEqual(singleSteps(board, BLACK, 3), [{ from: BAR, to: 2, die: 3, hit: false }]);
  assert.deepEqual(singleSteps(board, BLACK, 6), [], 'index 5 is held by white');
  assert.ok(legalTurns(board, BLACK, [3, 1]).every((turn) => turn.steps[0].from === BAR));
});

test('a point with two or more opposing checkers is blocked, a single checker is not', () => {
  const board = createBoard({ white: { 10: 1, 0: 14 }, black: { 7: 2, 9: 1, 23: 12 } });
  assert.equal(isBlocked(board, WHITE, 7), true);
  assert.equal(isBlocked(board, WHITE, 9), false);
  assert.deepEqual(singleSteps(board, WHITE, 3), []);
  assert.deepEqual(singleSteps(board, WHITE, 1), [{ from: 10, to: 9, die: 1, hit: true }]);
  assert.deepEqual(
    legalTurns(board, WHITE, [3, 1]).map((turn) => fromTo(turn.steps)),
    [[[10, 9], [9, 6]]],
    'only the 1 first lets both dice be played',
  );
});

test('hitting a blot sends it to the bar and its owner must enter first', () => {
  const board = createBoard({ white: { 10: 1, 0: 14 }, black: { 7: 1, 12: 3, 23: 11 } });
  const [step] = singleSteps(board, WHITE, 3);
  assert.deepEqual(step, { from: 10, to: 7, die: 3, hit: true });
  const next = applyStep(board, WHITE, step);
  assert.equal(next.points[7], 1);
  assert.equal(next.points[10], 0);
  assert.equal(next.bar[BLACK], 1);
  assert.deepEqual(board.bar, [0, 0], 'applyStep does not modify its input');

  assert.ok(singleSteps(board, BLACK, 2).some((move) => move.from === 12), 'black could move before the hit');
  assert.deepEqual(singleSteps(next, BLACK, 2), [{ from: BAR, to: 1, die: 2, hit: false }]);
});

test('entering from the bar can hit, and one turn can hit twice', () => {
  const entering = createBoard({
    white: { 12: 5, 7: 4, 5: 5 },
    black: { 20: 1, 0: 2, 11: 5, 16: 3, 18: 4 },
    bar: [1, 0],
  });
  const [entry] = singleSteps(entering, WHITE, 4);
  assert.deepEqual(entry, { from: BAR, to: 20, die: 4, hit: true });
  const after = applyStep(entering, WHITE, entry);
  assert.deepEqual([after.bar, after.points[20]], [[0, 1], 1]);

  const twoBlots = createBoard({ white: { 10: 1, 12: 1, 0: 13 }, black: { 7: 1, 9: 1, 23: 13 } });
  assert.ok(legalTurns(twoBlots, WHITE, [3, 3]).some((turn) => turn.board.bar[BLACK] === 2));
});

test('bearing off is only allowed once every checker is in the home board', () => {
  const board = createBoard({ white: { 6: 1, 5: 4, 4: 4, 0: 6 }, black: { 23: 15 } });
  assert.equal(canBearOff(board, WHITE), false);
  assert.deepEqual(fromTo(singleSteps(board, WHITE, 6)), [[6, 0]]);

  const turns = legalTurns(board, WHITE, [6, 6]);
  assert.equal(turns.length, 1, 'bearing off becomes legal in the middle of the turn');
  assert.deepEqual(fromTo(turns[0].steps), [[6, 0], [5, OFF], [5, OFF], [5, OFF]]);
  assert.equal(turns[0].board.off[WHITE], 3);

  const onBar = createBoard({ white: { 5: 4, 4: 4, 3: 3, 0: 3 }, black: { 11: 15 }, bar: [1, 0] });
  assert.equal(canBearOff(onBar, WHITE), false);
  assert.ok(legalTurns(onBar, WHITE, [6, 5]).every((turn) => turn.steps.every((step) => step.to !== OFF)));
});

test('exact dice bear checkers off', () => {
  const board = createBoard({ white: { 5: 1, 3: 2, 0: 9 }, black: { 23: 15 }, off: [3, 0] });
  assert.equal(canBearOff(board, WHITE), true);
  const best = legalTurns(board, WHITE, [6, 4]).find((turn) => turn.board.off[WHITE] === 5);
  assert.ok(best, 'both checkers can be borne off');
  assert.deepEqual(
    best.steps.map((step) => [step.from, step.to, step.die]).sort(),
    [[3, OFF, 4], [5, OFF, 6]],
  );
});

test('a higher die bears off from the furthest point only', () => {
  const board = createBoard({ white: { 3: 2, 1: 3, 0: 5 }, black: { 23: 15 }, off: [5, 0] });
  const turns = legalTurns(board, WHITE, [6, 5]);
  assert.equal(turns.length, 1);
  assert.deepEqual(fromTo(turns[0].steps), [[3, OFF], [3, OFF]]);
  assert.equal(turns[0].board.off[WHITE], 7);

  const higher = createBoard({ white: { 5: 1, 1: 2, 0: 2 }, black: { 23: 15 }, off: [10, 0] });
  assert.deepEqual(singleSteps(higher, WHITE, 3), [{ from: 5, to: 2, die: 3, hit: false }]);
});

test('black bears off past index 23', () => {
  const board = createBoard({ white: { 0: 15 }, black: { 20: 2, 22: 3, 23: 5 }, off: [0, 5] });
  const turns = legalTurns(board, BLACK, [6, 5]);
  assert.equal(turns.length, 1);
  assert.deepEqual(fromTo(turns[0].steps), [[20, OFF], [20, OFF]]);
  assert.equal(turns[0].board.off[BLACK], 7);
});

test('mars (gammon) is detected and counts double', () => {
  assert.equal(gameResult(startingBoard()), null);
  assert.deepEqual(gameResult(createBoard({ black: { 0: 15 }, off: [15, 0] })), {
    winner: WHITE,
    mars: true,
    points: 2,
  });
  assert.deepEqual(gameResult(createBoard({ black: { 20: 12 }, off: [15, 3] })), {
    winner: WHITE,
    mars: false,
    points: 1,
  });
  assert.deepEqual(gameResult(createBoard({ white: { 12: 15 }, off: [0, 15] })), {
    winner: BLACK,
    mars: true,
    points: 2,
  });
});
