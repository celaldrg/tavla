import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAR, BLACK, OFF, WHITE } from '../src/board.js';
import { createDemoGame, createGame } from '../src/game.js';
import {
  diceFaces,
  formatDice,
  isComputerTurn,
  playerKey,
  primaryAction,
  resultMessage,
  sourcesOf,
  statusMessage,
  targetsOf,
  turnTrail,
} from '../src/presenter.js';

/** A game in which the computer (black) has the first turn. */
function computerFirstGame() {
  for (let seed = 1; ; seed++) {
    const game = createGame({ seed });
    if (game.getState().current === BLACK) return game;
  }
}

test('the demo asks white to enter from the bar, where the 4 hits', () => {
  const game = createDemoGame();
  const state = game.getState();
  assert.equal(isComputerTurn(state), false);
  assert.deepEqual(statusMessage(state), { key: 'enterPrompt', params: { dice: '4-2' } });
  assert.deepEqual(primaryAction(state), { action: 'confirm', enabled: false });
  const steps = game.legalSteps();
  assert.deepEqual(sourcesOf(steps, WHITE), [BAR]);
  assert.deepEqual(targetsOf(steps, BAR, WHITE), [
    { to: 22, hit: false },
    { to: 20, hit: true },
  ]);
  assert.deepEqual(diceFaces(state), [
    { value: 4, used: false },
    { value: 2, used: false },
  ]);

  game.move(BAR, 20);
  const after = game.getState();
  assert.deepEqual(statusMessage(after), { key: 'hitPrefix', params: { text: { key: 'movePrompt', params: { dice: '4-2' } } } });
  assert.deepEqual(diceFaces(after), [
    { value: 4, used: true },
    { value: 2, used: false },
  ]);
});

test('a finished turn waits for confirmation', () => {
  const game = createDemoGame();
  assert.notEqual(game.move(BAR, 22), null);
  assert.notEqual(game.move(12, 8), null);
  const state = game.getState();
  assert.equal(state.complete, true);
  assert.deepEqual(statusMessage(state), { key: 'confirmPrompt' });
  assert.deepEqual(primaryAction(state), { action: 'confirm', enabled: true });
});

test('names, opening messages and the main button follow the mode', () => {
  const game = computerFirstGame();
  const state = game.getState();
  assert.equal(isComputerTurn(state), true);
  assert.deepEqual(statusMessage(state), { key: 'openingComputer', params: { dice: formatDice(state.opening) } });
  assert.deepEqual(primaryAction(state), { action: 'confirm', enabled: false });
  assert.equal(playerKey(state, WHITE), 'you');
  assert.equal(playerKey(state, BLACK), 'computer');

  const pvp = createGame({ mode: 'pvp', seed: 3 }).getState();
  assert.equal(isComputerTurn(pvp), false);
  assert.equal(playerKey(pvp, WHITE), 'white');
  assert.equal(playerKey(pvp, BLACK), 'black');
  assert.deepEqual(statusMessage(pvp), {
    key: 'openingPlayer',
    params: { name: { key: playerKey(pvp, pvp.current) }, dice: formatDice(pvp.opening) },
  });
});

test('after the computer moves, the roll prompt says what it played', () => {
  const game = computerFirstGame();
  for (const step of game.aiSteps()) game.move(step.from, step.to, step.die);
  game.confirm();
  const state = game.getState();
  assert.equal(state.phase, 'roll');
  assert.equal(isComputerTurn(state), false);
  assert.deepEqual(primaryAction(state), { action: 'roll', enabled: true });
  const message = statusMessage(state);
  assert.ok(['aiPlayed', 'aiHit'].includes(message.key));
  assert.deepEqual(message.params.text, { key: 'rollPrompt' });
  if (message.key === 'aiPlayed') assert.equal(message.params.dice, formatDice(state.lastTurn.dice));
});

test('status and result messages for hand-made states', () => {
  const base = {
    mode: 'ai',
    level: 'normal',
    human: WHITE,
    phase: 'roll',
    current: WHITE,
    board: { points: new Array(24).fill(0), bar: [0, 0], off: [0, 0] },
    dice: null,
    remaining: [],
    played: [],
    complete: false,
    noMoves: false,
    opening: [5, 3],
    result: null,
  };
  const passed = { ...base, lastTurn: { player: BLACK, dice: [6, 6], steps: [] } };
  assert.deepEqual(statusMessage(passed), { key: 'aiPassed', params: { dice: '6-6', text: { key: 'rollPrompt' } } });
  const hit = { ...base, lastTurn: { player: BLACK, dice: [3, 1], steps: [{ from: 5, to: 2, die: 3, hit: true }] } };
  assert.equal(statusMessage(hit).key, 'aiHit');

  const stuck = { ...base, phase: 'move', dice: [6, 5], remaining: [6, 5], noMoves: true, complete: true, lastTurn: hit.lastTurn };
  assert.deepEqual(statusMessage(stuck), { key: 'noMoves', params: { dice: '6-5' } });
  assert.deepEqual(primaryAction(stuck), { action: 'pass', enabled: true });
  const computerStuck = { ...stuck, current: BLACK };
  assert.deepEqual(statusMessage(computerStuck), { key: 'aiNoMoves', params: { dice: '6-5' } });
  assert.deepEqual(primaryAction(computerStuck), { action: 'pass', enabled: false });
  assert.deepEqual(statusMessage({ ...base, current: BLACK, lastTurn: null }), { key: 'aiRolling' });

  const won = { ...base, phase: 'over', result: { winner: WHITE, mars: true, points: 2 } };
  assert.equal(isComputerTurn({ ...won, current: BLACK }), false);
  assert.deepEqual(resultMessage(won), { title: { key: 'winYou' }, detail: { key: 'resultMars' } });
  assert.deepEqual(primaryAction(won), { action: 'playAgain', enabled: true });
  assert.deepEqual(statusMessage(won), { key: 'gameOver', params: resultMessage(won) });
  const lost = { ...won, result: { winner: BLACK, mars: false, points: 1 } };
  assert.deepEqual(resultMessage(lost), { title: { key: 'winComputer' }, detail: { key: 'resultSingle' } });
  const friends = { ...lost, mode: 'pvp' };
  assert.deepEqual(resultMessage(friends).title, { key: 'winPlayer', params: { name: { key: 'black' } } });
});

test('doubles show four dice and the used ones are marked', () => {
  const state = { phase: 'move', dice: [3, 3], remaining: [3, 3] };
  assert.deepEqual(diceFaces(state).map((face) => face.used), [false, false, true, true]);
  assert.deepEqual(diceFaces({ phase: 'roll', dice: null, remaining: [] }), []);
  assert.equal(formatDice([2, 5]), '5-2');
});

test('sources and targets are ordered from the far side towards home', () => {
  const steps = [
    { from: 3, to: OFF, die: 4, hit: false },
    { from: 9, to: 5, die: 4, hit: false },
    { from: 9, to: 3, die: 6, hit: true },
    { from: 3, to: 0, die: 3, hit: false },
  ];
  assert.deepEqual(sourcesOf(steps, WHITE), [9, 3]);
  assert.deepEqual(targetsOf(steps, 9, WHITE), [
    { to: 5, hit: false },
    { to: 3, hit: true },
  ]);
  assert.deepEqual(targetsOf(steps, 3, WHITE).map((target) => target.to), [0, OFF]);
  assert.deepEqual(sourcesOf([{ from: 14, to: 18 }, { from: 20, to: 22 }, { from: BAR, to: 2 }], BLACK), [BAR, 14, 20]);
});

test('the trail of a turn keeps only net departures and arrivals on points', () => {
  assert.equal(turnTrail(null), null);
  assert.equal(turnTrail({ player: WHITE, dice: [6, 5], steps: [] }), null);
  const trail = turnTrail({
    player: WHITE,
    dice: [5, 2],
    steps: [
      { from: 12, to: 7, die: 5, hit: false },
      { from: 7, to: 5, die: 2, hit: false },
      { from: BAR, to: 20, die: 4, hit: true },
      { from: 1, to: OFF, die: 2, hit: false },
    ],
  });
  assert.equal(trail.player, WHITE);
  assert.deepEqual([...trail.departures], [[12, 1], [1, 1]]);
  assert.deepEqual([...trail.arrivals], [[5, 1], [20, 1]]);
});
