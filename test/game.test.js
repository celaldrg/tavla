import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAR, BLACK, WHITE, startingBoard, totalCheckers } from '../src/board.js';
import { createDemoGame, createGame } from '../src/game.js';

/** Lets the computer play the current turn of any game (rolling first if needed). */
function autoTurn(game) {
  if (game.getState().phase === 'roll') game.roll();
  for (const step of game.aiSteps()) assert.notEqual(game.move(step.from, step.to, step.die), null);
  assert.ok(game.confirm());
}

/** Lets the computer play both sides to the end (fails instead of looping forever). */
function playToEnd(game) {
  for (let turns = 0; game.getState().phase !== 'over'; turns++) {
    assert.ok(turns < 1000, 'the game must end');
    autoTurn(game);
  }
}

test('a new game starts with the opening roll and the higher die plays first', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const state = createGame({ seed }).getState();
    const [white, black] = state.opening;
    assert.notEqual(white, black);
    assert.equal(state.current, white > black ? WHITE : BLACK);
    assert.equal(state.phase, 'move');
    assert.deepEqual(state.dice, state.opening);
    assert.deepEqual(state.board, startingBoard());
    assert.deepEqual(state.pips, [167, 167]);
    assert.deepEqual(state.played, []);
    assert.equal(state.complete, false);
    assert.equal(state.canUndo, false);
    assert.equal(state.result, null);
    assert.equal(state.lastTurn, null);
  }
});

test('options are normalised and the same seed replays the same game', () => {
  const defaults = createGame({ mode: 'online', level: 'hard', seed: 4 }).getState();
  assert.deepEqual([defaults.mode, defaults.level, defaults.human], ['ai', 'normal', WHITE]);
  const custom = createGame({ mode: 'pvp', level: 'easy', human: BLACK, seed: 4 }).getState();
  assert.deepEqual([custom.mode, custom.level, custom.human], ['pvp', 'easy', BLACK]);

  const first = createGame({ seed: 99, level: 'easy' });
  const second = createGame({ seed: 99, level: 'easy' });
  for (let turn = 0; turn < 12; turn++) {
    autoTurn(first);
    autoTurn(second);
    assert.deepEqual(first.getState(), second.getState());
  }
});

test('move, undo and confirm drive a turn', () => {
  const game = createGame({ mode: 'pvp', seed: 11 });
  const mover = game.getState().current;
  assert.equal(game.confirm(), false, 'an unfinished turn cannot be confirmed');
  assert.equal(game.undo(), false, 'nothing to undo yet');
  assert.equal(game.roll(), null, 'dice are already rolled');

  const [first] = game.legalSteps();
  const played = game.move(first.from, first.to, first.die);
  assert.deepEqual(played, first);
  assert.equal(game.getState().canUndo, true);
  assert.ok(game.undo());
  assert.deepEqual(game.getState().board, startingBoard());

  while (!game.getState().complete) {
    const [step] = game.legalSteps();
    assert.notEqual(game.move(step.from, step.to), null);
  }
  const before = game.getState();
  assert.deepEqual(game.legalSteps(), []);
  assert.ok(game.confirm());

  const after = game.getState();
  assert.equal(after.phase, 'roll');
  assert.equal(after.current, 1 - mover);
  assert.equal(after.dice, null);
  assert.deepEqual(after.board, before.board);
  assert.deepEqual(after.lastTurn, { player: mover, dice: before.dice, steps: before.played });

  const dice = game.roll();
  assert.equal(dice.length, 2);
  assert.ok(dice.every((die) => die >= 1 && die <= 6));
  assert.equal(game.getState().phase, 'move');
  assert.deepEqual(game.getState().dice, dice);
});

test('illegal moves are refused without changing the game', () => {
  const game = createGame({ seed: 8 });
  const before = game.getState();
  assert.equal(game.move(23, 0), null);
  assert.equal(game.move(BAR, 20), null);
  assert.deepEqual(game.getState(), before);
});

test('the computer only plays in ai mode on its own side', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const vsAi = createGame({ seed });
    assert.equal(vsAi.isAiTurn(), vsAi.getState().current === BLACK);
    const asBlack = createGame({ seed, human: BLACK });
    assert.equal(asBlack.isAiTurn(), asBlack.getState().current === WHITE);
    assert.equal(createGame({ seed, mode: 'pvp' }).isAiTurn(), false);
  }
});

test('aiSteps plans a full legal turn from the start of the turn', () => {
  const game = createGame({ seed: 21 });
  const [step] = game.legalSteps();
  game.move(step.from, step.to, step.die);
  const plan = game.aiSteps();
  assert.deepEqual(game.getState().played, [], 'steps already played are taken back');
  for (const planned of plan) assert.notEqual(game.move(planned.from, planned.to, planned.die), null);
  assert.equal(game.getState().complete, true);
});

test('a roll without any legal move can be passed', () => {
  let found = false;
  for (let seed = 1; seed <= 40 && !found; seed++) {
    const game = createGame({ mode: 'pvp', level: 'easy', seed });
    for (let turns = 0; game.getState().phase !== 'over' && !found; turns++) {
      assert.ok(turns < 1000, 'the game must end');
      if (game.getState().phase === 'roll') game.roll();
      const state = game.getState();
      if (state.noMoves) {
        found = true;
        assert.equal(state.complete, true);
        assert.deepEqual(game.legalSteps(), []);
        assert.deepEqual(game.aiSteps(), []);
        assert.ok(game.confirm());
        assert.equal(game.getState().current, 1 - state.current);
        assert.deepEqual(game.getState().board, state.board);
      } else {
        autoTurn(game);
      }
    }
  }
  assert.ok(found, 'no blocked roll found in the seeded games');
});

test('getState returns a copy', () => {
  const game = createGame({ seed: 2 });
  const state = game.getState();
  state.board.points[0] = 99;
  state.dice[0] = 7;
  assert.deepEqual(game.getState().board, startingBoard());
  assert.notEqual(game.getState().dice[0], 7);
});

test('a finished game reports the result and refuses further actions', () => {
  const game = createGame({ mode: 'pvp', level: 'easy', seed: 5 });
  playToEnd(game);
  const state = game.getState();
  const loser = 1 - state.result.winner;
  assert.equal(state.board.off[state.result.winner], 15);
  assert.equal(state.result.mars, state.board.off[loser] === 0);
  assert.equal(state.lastTurn.player, state.result.winner);
  assert.equal(game.roll(), null);
  assert.equal(game.move(0, 1), null);
  assert.equal(game.undo(), false);
  assert.equal(game.confirm(), false);
  assert.deepEqual(game.legalSteps(), []);
  assert.deepEqual(game.aiSteps(), []);
  assert.equal(game.isAiTurn(), false);
});

test('the demo starts mid-game with a white checker on the bar and dice shown', () => {
  const game = createDemoGame();
  const state = game.getState();
  assert.equal(state.phase, 'move');
  assert.equal(state.current, WHITE);
  assert.deepEqual(state.dice, [4, 2]);
  assert.deepEqual(state.board.bar, [1, 0]);
  assert.deepEqual(state.board.off, [0, 0]);
  assert.equal(totalCheckers(state.board, WHITE), 15);
  assert.equal(totalCheckers(state.board, BLACK), 15);
  assert.deepEqual(state.pips, [149, 156]);
  assert.deepEqual(
    game.legalSteps().map((step) => [step.from, step.to, step.hit]),
    [[BAR, 20, true], [BAR, 22, false]],
  );
  assert.equal(game.isAiTurn(), false);

  const replay = createDemoGame();
  for (let turn = 0; turn < 6; turn++) {
    autoTurn(game);
    autoTurn(replay);
  }
  assert.deepEqual(game.getState(), replay.getState(), 'the demo continues deterministically');
});
