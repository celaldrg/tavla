/**
 * Game controller for the UI: opening roll, rolling, step-by-step moves with undo,
 * turn confirmation, the computer's plan and the result. Pure module (no DOM); all
 * dice and AI randomness come from generators seeded by `options.seed`.
 */
import { BLACK, WHITE, cloneBoard, createBoard, opponent, pipCount, startingBoard } from './board.js';
import { createRng, rollDice, rollDie } from './dice.js';
import { gameResult } from './rules.js';
import { allowedSteps, isTurnComplete, playStep, startTurn, undoStep } from './turn.js';
import { chooseTurn } from './ai.js';

/** Seed used by the demo position, so the screenshot game always continues the same way. */
const DEMO_SEED = 2026;
/** Dice shown in the demo position. */
const DEMO_DICE = [4, 2];
/** Mixed into the seed so AI noise and dice use separate random streams. */
const AI_SEED_SALT = 0x5bd1e995;

/**
 * @typedef {Object} GameOptions
 * @property {string} [mode] - 'ai' (default: a human against the computer) or 'pvp' (two players)
 * @property {string} [level] - computer strength: 'normal' (default) or 'easy'
 * @property {number} [human] - side the human plays in 'ai' mode: WHITE (default) or BLACK
 * @property {number} [seed] - integer seed for dice and AI noise (random when omitted)
 */

/**
 * Snapshot of a game for rendering; changing it does not affect the game.
 * @typedef {Object} GameState
 * @property {string} mode - 'ai' or 'pvp'
 * @property {string} level - 'easy' or 'normal'
 * @property {number} human - side of the human in 'ai' mode
 * @property {string} phase - 'roll' (waiting for dice), 'move' (playing steps) or 'over'
 * @property {number} current - player whose turn it is (the last mover once the game is over)
 * @property {import('./board.js').Board} board - position including the steps played so far
 * @property {number[]} pips - pip counts [white, black]
 * @property {number[]|null} dice - the two rolled values during the 'move' phase
 * @property {number[]} remaining - dice not used yet this turn (four entries for a double)
 * @property {import('./rules.js').Step[]} played - steps played this turn
 * @property {boolean} complete - the turn may be confirmed
 * @property {boolean} noMoves - the roll cannot be played at all (confirming passes the turn)
 * @property {boolean} canUndo - a step of this turn can be taken back
 * @property {number[]|null} opening - opening roll [white die, black die], null for the demo
 * @property {{player: number, dice: number[], steps: import('./rules.js').Step[]}|null} lastTurn - the previous confirmed turn
 * @property {{winner: number, mars: boolean, points: number}|null} result - set when the game is over
 */

/**
 * @typedef {Object} Game
 * @property {() => GameState} getState - current snapshot
 * @property {() => boolean} isAiTurn - true when the computer should play now
 * @property {() => number[]|null} roll - rolls the dice in the 'roll' phase (null otherwise)
 * @property {() => import('./rules.js').Step[]} legalSteps - steps that may be played next
 * @property {(from: number|string, to: number|string, die?: number) => import('./rules.js').Step|null} move
 *   plays one step (from a point index or BAR to a point index or OFF); null when not allowed
 * @property {() => boolean} undo - takes back the last step of this turn
 * @property {() => boolean} confirm - ends a complete turn (and possibly the game)
 * @property {() => import('./rules.js').Step[]} aiSteps - the computer's steps for the current
 *   dice, planned from the start of the turn (steps already played are taken back first);
 *   play them with move(step.from, step.to, step.die), then confirm()
 */

/**
 * Starts a new game from the standard position. The opening roll (one die each,
 * re-rolled on a tie) decides who starts, and that player plays those two dice.
 * @param {GameOptions} [options]
 * @returns {Game}
 */
export function createGame(options = {}) {
  const settings = normalizeOptions(options);
  const diceRng = createRng(settings.seed);
  const opening = rollOpening(diceRng);
  const current = opening[WHITE] > opening[BLACK] ? WHITE : BLACK;
  const board = startingBoard();
  return createController(settings, diceRng, {
    board,
    current,
    phase: 'move',
    turn: startTurn(board, current, opening),
    opening,
    lastTurn: null,
    result: null,
  });
}

/**
 * Starts the fixed mid-game demo position used for screenshots: white to play
 * 4-2 with one checker on the bar, and entering with the 4 hits a black blot.
 * @param {GameOptions} [options] - mode, level and human side (the seed is fixed)
 * @returns {Game}
 */
export function createDemoGame(options = {}) {
  const settings = normalizeOptions({ ...options, seed: DEMO_SEED });
  const board = createBoard({
    white: { 23: 1, 12: 3, 7: 2, 6: 2, 5: 3, 4: 2, 2: 1 },
    black: { 0: 2, 11: 4, 16: 3, 18: 3, 19: 2, 20: 1 },
    bar: [1, 0],
  });
  return createController(settings, createRng(settings.seed), {
    board,
    current: WHITE,
    phase: 'move',
    turn: startTurn(board, WHITE, DEMO_DICE),
    opening: null,
    lastTurn: null,
    result: null,
  });
}

function normalizeOptions(options) {
  return {
    mode: options.mode === 'pvp' ? 'pvp' : 'ai',
    level: options.level === 'easy' ? 'easy' : 'normal',
    human: options.human === BLACK ? BLACK : WHITE,
    seed: Number.isInteger(options.seed) ? options.seed >>> 0 : Math.floor(Math.random() * 2 ** 32),
  };
}

function rollOpening(rng) {
  for (;;) {
    const white = rollDie(rng);
    const black = rollDie(rng);
    if (white !== black) return [white, black];
  }
}

function createController(settings, diceRng, initialState) {
  const aiRng = createRng(settings.seed ^ AI_SEED_SALT);
  let state = initialState;
  const moving = () => state.phase === 'move';

  return {
    getState: () => snapshot(state, settings),
    isAiTurn: () => settings.mode === 'ai' && state.phase !== 'over' && state.current !== settings.human,
    roll() {
      if (state.phase !== 'roll') return null;
      const dice = rollDice(diceRng);
      state = { ...state, phase: 'move', turn: startTurn(state.board, state.current, dice) };
      return [...dice];
    },
    legalSteps: () => (moving() ? allowedSteps(state.turn) : []),
    move(from, to, die) {
      if (!moving()) return null;
      const turn = playStep(state.turn, { from, to, die });
      if (turn === null) return null;
      state = { ...state, turn };
      return { ...turn.played[turn.played.length - 1] };
    },
    undo() {
      if (!moving() || state.turn.played.length === 0) return false;
      state = { ...state, turn: undoStep(state.turn) };
      return true;
    },
    confirm() {
      if (!moving() || !isTurnComplete(state.turn)) return false;
      state = finishTurn(state);
      return true;
    },
    aiSteps() {
      if (!moving()) return [];
      state = { ...state, turn: startTurn(state.turn.start, state.current, state.turn.dice) };
      const choice = chooseTurn(state.turn.start, state.current, state.turn.dice, {
        level: settings.level,
        rng: aiRng,
      });
      return choice === null ? [] : choice.steps.map((step) => ({ ...step }));
    },
  };
}

function finishTurn(state) {
  const { turn } = state;
  const lastTurn = { player: turn.player, dice: [...turn.dice], steps: turn.played };
  const result = gameResult(turn.board);
  if (result !== null) return { ...state, board: turn.board, turn: null, phase: 'over', lastTurn, result };
  return { ...state, board: turn.board, turn: null, phase: 'roll', current: opponent(state.current), lastTurn };
}

function snapshot(state, settings) {
  const { turn } = state;
  const board = turn ? turn.board : state.board;
  return {
    mode: settings.mode,
    level: settings.level,
    human: settings.human,
    phase: state.phase,
    current: state.current,
    board: cloneBoard(board),
    pips: [pipCount(board, WHITE), pipCount(board, BLACK)],
    dice: turn ? [...turn.dice] : null,
    remaining: turn ? [...turn.remaining] : [],
    played: turn ? turn.played.map((step) => ({ ...step })) : [],
    complete: turn ? isTurnComplete(turn) : false,
    noMoves: turn ? turn.total === 0 : false,
    canUndo: Boolean(turn && turn.played.length > 0),
    opening: state.opening ? [...state.opening] : null,
    lastTurn: state.lastTurn
      ? { ...state.lastTurn, dice: [...state.lastTurn.dice], steps: state.lastTurn.steps.map((step) => ({ ...step })) }
      : null,
    result: state.result ? { ...state.result } : null,
  };
}
