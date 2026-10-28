/**
 * A turn in progress: lets a player make one step at a time while keeping every
 * step consistent with a complete legal turn (both dice used when possible, the
 * larger die when only one can be used). A step that bears off the player's last
 * checker is always allowed and ends the turn, since the game is over. Pure module;
 * turn objects are immutable.
 */
import { CHECKERS, OFF } from './board.js';
import { applyStep, maxDiceUsable, singleSteps } from './rules.js';
import { diceToPlay, distinctDice, removeDie } from './dice.js';

/**
 * @typedef {Object} Turn
 * @property {number} player - the moving player
 * @property {number[]} dice - the two rolled values
 * @property {import('./board.js').Board} start - position before the turn
 * @property {import('./board.js').Board} board - position after the steps played so far
 * @property {number[]} remaining - dice not used yet
 * @property {import('./rules.js').Step[]} played - steps played so far, in order
 * @property {number} total - steps in a complete turn (0 when no checker can move)
 * @property {number|null} forcedDie - the die that must be used when only one can be
 */

/**
 * Starts a turn for a roll.
 * @param {import('./board.js').Board} board - position before the turn
 * @param {number} player
 * @param {number[]} dice - the two rolled values
 * @returns {Turn}
 */
export function startTurn(board, player, dice) {
  const total = maxDiceUsable(board, player, diceToPlay(dice));
  return {
    player,
    dice: [dice[0], dice[1]],
    start: board,
    board,
    remaining: diceToPlay(dice),
    played: [],
    total,
    forcedDie: forcedDie(board, player, dice, total),
  };
}

/** When only one die of a non-double can be used, the larger one is required if playable. */
function forcedDie(board, player, dice, total) {
  if (total !== 1 || dice[0] === dice[1]) return null;
  const high = Math.max(dice[0], dice[1]);
  return singleSteps(board, player, high).length > 0 ? high : Math.min(dice[0], dice[1]);
}

/**
 * True when the turn has all the steps it needs (immediately when no checker can move).
 * @param {Turn} turn
 * @returns {boolean}
 */
export function isTurnComplete(turn) {
  return turn.played.length >= turn.total || hasWon(turn);
}

/**
 * Steps that can be played next without making a complete legal turn impossible.
 * @param {Turn} turn
 * @returns {import('./rules.js').Step[]}
 */
export function allowedSteps(turn) {
  const left = turn.total - turn.played.length;
  if (left <= 0 || hasWon(turn)) return [];
  const dice = turn.forcedDie === null ? distinctDice(turn.remaining) : [turn.forcedDie];
  const allowed = [];
  for (const die of dice) {
    const rest = removeDie(turn.remaining, die);
    for (const step of singleSteps(turn.board, turn.player, die)) {
      if (left === 1 || maxDiceUsable(applyStep(turn.board, turn.player, step), turn.player, rest) >= left - 1) {
        allowed.push(step);
      }
    }
  }
  return [...allowed, ...winningSteps(turn, allowed)];
}

function hasWon(turn) {
  return turn.board.off[turn.player] === CHECKERS;
}

/**
 * Bear-off steps that finish the game but are not already allowed, such as bearing
 * the last checker off with the larger die instead of moving it with the smaller one first.
 */
function winningSteps(turn, allowed) {
  if (turn.board.off[turn.player] !== CHECKERS - 1) return [];
  const known = (step) => allowed.some((other) => other.from === step.from && other.die === step.die && other.to === OFF);
  const steps = [];
  for (const die of distinctDice(turn.remaining)) {
    for (const step of singleSteps(turn.board, turn.player, die)) {
      if (step.to === OFF && !known(step)) steps.push(step);
    }
  }
  return steps;
}

/**
 * Finds the allowed step from `from` to `to`. Without `die`, the smallest die that
 * works is chosen (only bearing off can be done with more than one die value).
 * @param {Turn} turn
 * @param {number|string} from - point index or BAR
 * @param {number|string} to - point index or OFF
 * @param {number} [die] - a specific die value
 * @returns {import('./rules.js').Step|null}
 */
export function findStep(turn, from, to, die) {
  let found = null;
  for (const step of allowedSteps(turn)) {
    if (step.from !== from || step.to !== to || (die !== undefined && step.die !== die)) continue;
    if (found === null || step.die < found.die) found = step;
  }
  return found;
}

/**
 * Plays one step.
 * @param {Turn} turn
 * @param {{from: number|string, to: number|string, die?: number}} move - the step to play
 * @returns {Turn|null} the updated turn, or null when the step is not allowed
 */
export function playStep(turn, move) {
  const step = findStep(turn, move.from, move.to, move.die);
  if (step === null) return null;
  return {
    ...turn,
    board: applyStep(turn.board, turn.player, step),
    remaining: removeDie(turn.remaining, step.die),
    played: [...turn.played, step],
  };
}

/**
 * Takes back the last step of the turn.
 * @param {Turn} turn
 * @returns {Turn} the turn without its last step (unchanged when nothing was played)
 */
export function undoStep(turn) {
  if (turn.played.length === 0) return turn;
  const played = turn.played.slice(0, -1);
  let board = turn.start;
  let remaining = diceToPlay(turn.dice);
  for (const step of played) {
    board = applyStep(board, turn.player, step);
    remaining = removeDie(remaining, step.die);
  }
  return { ...turn, board, remaining, played };
}
