import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLACK,
  WHITE,
  boardKey,
  checkersAt,
  cloneBoard,
  createBoard,
  entryIndex,
  opponent,
  pipCount,
  pipDistance,
  startingBoard,
  targetIndex,
  totalCheckers,
} from '../src/board.js';
import { createRng, diceToPlay, distinctDice, removeDie, rollDice, rollDie } from '../src/dice.js';

test('the starting position has 15 checkers and 167 pips per side, mirrored', () => {
  const board = startingBoard();
  for (const player of [WHITE, BLACK]) {
    assert.equal(totalCheckers(board, player), 15);
    assert.equal(pipCount(board, player), 167);
  }
  board.points.forEach((count, index) => assert.equal(count + board.points[23 - index], 0));
  assert.deepEqual([checkersAt(board, WHITE, 23), checkersAt(board, BLACK, 23)], [2, 0]);
  assert.deepEqual([checkersAt(board, WHITE, 0), checkersAt(board, BLACK, 0)], [0, 2]);
});

test('createBoard validates its input', () => {
  assert.throws(() => createBoard({ white: { 0: 14 }, black: { 23: 15 } }), /exactly 15/);
  assert.throws(() => createBoard({ white: { 24: 15 }, black: { 23: 15 } }), /Invalid point/);
  assert.throws(() => createBoard({ white: { 5: 15 }, black: { 5: 15 } }), /listed twice/);
  const board = createBoard({ white: { 5: 10 }, black: { 18: 13 }, bar: [1, 2], off: [4, 0] });
  assert.deepEqual([board.points[5], board.points[18], board.bar, board.off], [10, -13, [1, 2], [4, 0]]);
});

test('directions, distances and entry points are mirrored for the two players', () => {
  assert.deepEqual([pipDistance(WHITE, 0), pipDistance(WHITE, 23)], [1, 24]);
  assert.deepEqual([pipDistance(BLACK, 23), pipDistance(BLACK, 0)], [1, 24]);
  assert.deepEqual([targetIndex(WHITE, 12, 5), targetIndex(BLACK, 11, 5)], [7, 16]);
  assert.deepEqual([entryIndex(WHITE, 1), entryIndex(WHITE, 6)], [23, 18]);
  assert.deepEqual([entryIndex(BLACK, 1), entryIndex(BLACK, 6)], [0, 5]);
  assert.deepEqual([opponent(WHITE), opponent(BLACK)], [BLACK, WHITE]);
  const onBar = createBoard({ white: { 0: 14 }, black: { 23: 15 }, bar: [1, 0] });
  assert.equal(pipCount(onBar, WHITE), 14 + 25);
});

test('clones are independent and keys identify positions', () => {
  const board = startingBoard();
  const copy = cloneBoard(board);
  assert.equal(boardKey(copy), boardKey(board));
  copy.points[0] = 0;
  copy.bar[BLACK] = 2;
  assert.equal(board.points[0], -2);
  assert.equal(board.bar[BLACK], 0);
  assert.notEqual(boardKey(copy), boardKey(board));
  const rebuilt = createBoard({ white: { 23: 2, 12: 5, 7: 3, 5: 5 }, black: { 0: 2, 11: 5, 16: 3, 18: 5 }, bar: [0, 0] });
  assert.equal(boardKey(rebuilt), boardKey(board));
});

test('the seeded generator is deterministic and stays in range', () => {
  const a = createRng(42);
  const b = createRng(42);
  const c = createRng(43);
  const first = Array.from({ length: 50 }, () => a());
  assert.deepEqual(first, Array.from({ length: 50 }, () => b()));
  assert.notDeepEqual(first, Array.from({ length: 50 }, () => c()));
  assert.ok(first.every((value) => value >= 0 && value < 1));
});

test('dice are fair enough and doubles are played four times', () => {
  const rng = createRng(7);
  const faces = new Array(7).fill(0);
  for (let i = 0; i < 6000; i++) faces[rollDie(rng)] += 1;
  assert.equal(faces[0], 0);
  for (let face = 1; face <= 6; face++) assert.ok(faces[face] > 850 && faces[face] < 1150, `face ${face}`);
  const pair = rollDice(rng);
  assert.equal(pair.length, 2);
  assert.deepEqual(diceToPlay([3, 5]), [3, 5]);
  assert.deepEqual(diceToPlay([4, 4]), [4, 4, 4, 4]);
  assert.deepEqual(removeDie([4, 4, 4], 4), [4, 4]);
  assert.deepEqual(removeDie([6, 2], 2), [6]);
  assert.deepEqual(removeDie([6, 2], 3), [6, 2]);
  assert.deepEqual(distinctDice([5, 5, 5, 5]), [5]);
  assert.deepEqual(distinctDice([6, 1]), [6, 1]);
});
