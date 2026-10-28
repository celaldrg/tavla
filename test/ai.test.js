import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLACK, WHITE, boardKey, createBoard, startingBoard, totalCheckers } from '../src/board.js';
import { legalTurns } from '../src/rules.js';
import { createRng } from '../src/dice.js';
import { chooseTurn, evaluate } from '../src/ai.js';
import { createGame } from '../src/game.js';

const mirrorIndex = (index) => 23 - index;

/** Plays one turn of the controller's game with the given chooser. */
function playTurn(game, choose) {
  if (game.getState().phase === 'roll') game.roll();
  const { board, current, dice } = game.getState();
  const choice = choose(board, current, dice);
  for (const step of choice ? choice.steps : []) {
    assert.notEqual(game.move(step.from, step.to, step.die), null, 'the AI only plays legal steps');
  }
  assert.ok(game.confirm(), 'the AI always completes its turn');
}

test('the chosen turn is always one of the legal turns', () => {
  const rng = createRng(5);
  for (let a = 1; a <= 6; a++) {
    for (let b = 1; b <= 6; b++) {
      const legal = new Set(legalTurns(startingBoard(), BLACK, [a, b]).map((turn) => boardKey(turn.board)));
      for (const level of ['easy', 'normal']) {
        const choice = chooseTurn(startingBoard(), BLACK, [a, b], { level, rng });
        assert.ok(legal.has(boardKey(choice.board)));
      }
    }
  }
  const blocked = createBoard({
    white: { 23: 2, 12: 4, 7: 3, 5: 5 },
    black: { 18: 2, 19: 2, 0: 2, 11: 5, 16: 4 },
    bar: [1, 0],
  });
  assert.equal(chooseTurn(blocked, WHITE, [6, 5]), null);
});

test('normal level makes the classic opening points for both colours', () => {
  const expectations = [
    { dice: [3, 1], point: 4 },
    { dice: [4, 2], point: 3 },
    { dice: [6, 1], point: 6 },
  ];
  for (const { dice, point } of expectations) {
    const white = chooseTurn(startingBoard(), WHITE, dice);
    assert.equal(white.board.points[point], 2, `white ${dice}`);
    const black = chooseTurn(startingBoard(), BLACK, dice);
    assert.equal(black.board.points[mirrorIndex(point)], -2, `black ${dice}`);
  }
});

test('normal level opens without deep blots and splits the back checkers with small rolls', () => {
  const opening = (dice) => chooseTurn(startingBoard(), WHITE, dice).steps.map((step) => `${step.from}>${step.to}`).sort();
  // White's 24-point is index 23, the mid-point 12, the 8-point 7 (index = pips - 1).
  assert.deepEqual(opening([6, 2]), ['12>10', '23>17'], '6-2: 24/18 13/11');
  assert.deepEqual(opening([6, 3]), ['12>9', '23>17'], '6-3: 24/18 13/10');
  assert.deepEqual(opening([2, 1]), ['12>10', '23>22'], '2-1: 13/11 24/23');
  assert.deepEqual(opening([3, 2]), ['12>10', '12>9'], '3-2: 13/11 13/10');
});

test('the AI hits a blot when it can make a point on it', () => {
  const board = createBoard({
    white: { 23: 2, 12: 4, 9: 1, 7: 3, 5: 5 },
    black: { 4: 1, 0: 2, 11: 5, 16: 3, 18: 4 },
  });
  const choice = chooseTurn(board, WHITE, [3, 1]);
  assert.equal(choice.board.points[4], 2);
  assert.equal(choice.board.bar[BLACK], 1);
});

test('in a race the AI bears off rather than moving inside', () => {
  const board = createBoard({ white: { 5: 2, 3: 2, 1: 2, 0: 2 }, black: { 23: 15 }, off: [7, 0] });
  const choice = chooseTurn(board, WHITE, [6, 4]);
  assert.equal(choice.board.off[WHITE], 9);
});

test('evaluation prefers being ahead and having the opponent on the bar', () => {
  const start = startingBoard();
  const hit = createBoard({
    white: { 23: 2, 12: 5, 7: 3, 5: 5 },
    black: { 0: 1, 11: 5, 16: 3, 18: 5 },
    bar: [0, 1],
  });
  assert.ok(evaluate(hit, WHITE) > evaluate(start, WHITE));
  assert.ok(evaluate(hit, BLACK) < evaluate(start, BLACK));
});

test('easy level is deterministic for a seed and sometimes differs from normal', () => {
  let differences = 0;
  for (let a = 1; a <= 6; a++) {
    for (let b = 1; b < a; b++) {
      const first = chooseTurn(startingBoard(), WHITE, [a, b], { level: 'easy', rng: createRng(a * 10 + b) });
      const again = chooseTurn(startingBoard(), WHITE, [a, b], { level: 'easy', rng: createRng(a * 10 + b) });
      assert.equal(boardKey(first.board), boardKey(again.board));
      const normal = chooseTurn(startingBoard(), WHITE, [a, b], { level: 'normal' });
      if (boardKey(first.board) !== boardKey(normal.board)) differences += 1;
    }
  }
  assert.ok(differences > 0);
});

test('100 seeded Easy AI-vs-AI games all finish with 15 checkers off for the winner', () => {
  let marses = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const game = createGame({ mode: 'pvp', level: 'easy', seed });
    let turns = 0;
    while (game.getState().phase !== 'over') {
      if (game.getState().phase === 'roll') game.roll();
      for (const step of game.aiSteps()) {
        assert.notEqual(game.move(step.from, step.to, step.die), null, `seed ${seed}: illegal AI step`);
      }
      assert.ok(game.confirm(), `seed ${seed}: turn could not be confirmed`);
      const { board } = game.getState();
      assert.equal(totalCheckers(board, WHITE), 15);
      assert.equal(totalCheckers(board, BLACK), 15);
      turns += 1;
      assert.ok(turns < 1000, `seed ${seed}: game did not terminate`);
    }
    const { board, result } = game.getState();
    const loser = 1 - result.winner;
    assert.equal(board.off[result.winner], 15, `seed ${seed}: winner has 15 checkers off`);
    assert.ok(board.off[loser] < 15);
    assert.equal(result.mars, board.off[loser] === 0);
    assert.equal(result.points, result.mars ? 2 : 1);
    if (result.mars) marses += 1;
  }
  assert.ok(marses > 0 && marses < 100);
});

test('normal level beats easy level in most seeded games', () => {
  const games = 60;
  let normalWins = 0;
  for (let seed = 1; seed <= games; seed++) {
    const normalSide = seed % 2;
    const game = createGame({ mode: 'pvp', seed });
    const easyRng = createRng(seed * 31);
    const choose = (board, player, dice) =>
      chooseTurn(board, player, dice, { level: player === normalSide ? 'normal' : 'easy', rng: easyRng });
    for (let turns = 0; game.getState().phase !== 'over'; turns++) {
      assert.ok(turns < 1000, `seed ${seed}: game did not terminate`);
      playTurn(game, choose);
    }
    if (game.getState().result.winner === normalSide) normalWins += 1;
  }
  assert.ok(normalWins >= games * 0.6, `normal won only ${normalWins} of ${games}`);
});
