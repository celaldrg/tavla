/**
 * Tavla move rules: single steps, complete-turn generation and the game result.
 * Pure module, no DOM access.
 */
import {
  BAR,
  OFF,
  WHITE,
  BLACK,
  CHECKERS,
  POINT_COUNT,
  boardKey,
  checkersAt,
  cloneBoard,
  entryIndex,
  opponent,
  pipDistance,
  targetIndex,
} from './board.js';
import { diceToPlay, distinctDice, removeDie } from './dice.js';

/** Points in a home board. */
const HOME_SIZE = 6;

/**
 * One checker moved by one die.
 * @typedef {Object} Step
 * @property {number|string} from - point index 0..23, or BAR
 * @property {number|string} to - point index 0..23, or OFF
 * @property {number} die - the die value used
 * @property {boolean} hit - true when the step sends an opposing blot to the bar
 */

/**
 * A complete legal turn.
 * @typedef {Object} TurnOption
 * @property {Step[]} steps - the steps in playing order
 * @property {import('./board.js').Board} board - the position after the turn
 */

/**
 * True when the opponent holds the point with two or more checkers.
 * @param {import('./board.js').Board} board
 * @param {number} player - the moving player
 * @param {number} index - point index 0..23
 * @returns {boolean}
 */
export function isBlocked(board, player, index) {
  return checkersAt(board, opponent(player), index) >= 2;
}

/**
 * True when none of the player's checkers is on the bar or outside the home board.
 * @param {import('./board.js').Board} board
 * @param {number} player
 * @returns {boolean}
 */
export function canBearOff(board, player) {
  if (board.bar[player] > 0) return false;
  for (let index = 0; index < POINT_COUNT; index++) {
    if (checkersAt(board, player, index) > 0 && pipDistance(player, index) > HOME_SIZE) return false;
  }
  return true;
}

/**
 * Legal moves of a single checker with one die, ignoring the rest of the turn.
 * A player with checkers on the bar may only enter.
 * @param {import('./board.js').Board} board
 * @param {number} player
 * @param {number} die - 1..6
 * @returns {Step[]}
 */
export function singleSteps(board, player, die) {
  if (board.bar[player] > 0) {
    const to = entryIndex(player, die);
    return isBlocked(board, player, to) ? [] : [createStep(board, player, BAR, to, die)];
  }
  const bearing = canBearOff(board, player);
  const furthest = bearing ? furthestDistance(board, player) : 0;
  const steps = [];
  for (let from = 0; from < POINT_COUNT; from++) {
    if (checkersAt(board, player, from) === 0) continue;
    const to = targetIndex(player, from, die);
    if (to >= 0 && to < POINT_COUNT) {
      if (!isBlocked(board, player, to)) steps.push(createStep(board, player, from, to, die));
    } else if (bearing && mayBearOff(pipDistance(player, from), die, furthest)) {
      steps.push({ from, to: OFF, die, hit: false });
    }
  }
  return steps;
}

function createStep(board, player, from, to, die) {
  return { from, to, die, hit: checkersAt(board, opponent(player), to) === 1 };
}

/** Exact die, or a higher die when the checker is the furthest one from home. */
function mayBearOff(distance, die, furthest) {
  return distance === die || (distance < die && distance === furthest);
}

function furthestDistance(board, player) {
  let furthest = 0;
  for (let index = 0; index < POINT_COUNT; index++) {
    if (checkersAt(board, player, index) > 0) furthest = Math.max(furthest, pipDistance(player, index));
  }
  return furthest;
}

/**
 * Position after one step. The input board is not modified and the step is
 * assumed to be legal (take it from singleSteps or the turn helpers).
 * @param {import('./board.js').Board} board
 * @param {number} player
 * @param {Step} step
 * @returns {import('./board.js').Board}
 */
export function applyStep(board, player, step) {
  const next = cloneBoard(board);
  const sign = player === WHITE ? 1 : -1;
  if (step.from === BAR) next.bar[player] -= 1;
  else next.points[step.from] -= sign;
  if (step.to === OFF) {
    next.off[player] += 1;
    return next;
  }
  if (checkersAt(next, opponent(player), step.to) === 1) {
    next.points[step.to] = 0;
    next.bar[opponent(player)] += 1;
  }
  next.points[step.to] += sign;
  return next;
}

/**
 * Every legal complete turn for a roll, deduplicated by the resulting position.
 * A double is played four times, as many dice as possible must be used and, when
 * only one die of a non-double can be used, the larger one must be used if it can be.
 * @param {import('./board.js').Board} board
 * @param {number} player
 * @param {number[]} dice - the two rolled values
 * @returns {TurnOption[]} an empty list when no checker can move
 */
export function legalTurns(board, player, dice) {
  const leaves = [];
  collectLeaves(board, player, diceToPlay(dice), [], new Set(), leaves);
  const most = leaves.reduce((max, leaf) => Math.max(max, leaf.steps.length), 0);
  if (most === 0) return [];
  let turns = leaves.filter((leaf) => leaf.steps.length === most);
  if (most === 1 && dice[0] !== dice[1]) turns = preferDie(turns, Math.max(dice[0], dice[1]));
  return uniqueByPosition(turns);
}

/** Depth-first search over step sequences; identical (position, dice left) states are visited once. */
function collectLeaves(board, player, remaining, steps, seen, leaves) {
  const key = boardKey(board) + remaining.join('');
  if (seen.has(key)) return;
  seen.add(key);
  let moved = false;
  for (const die of distinctDice(remaining)) {
    const rest = removeDie(remaining, die);
    for (const step of singleSteps(board, player, die)) {
      moved = true;
      collectLeaves(applyStep(board, player, step), player, rest, [...steps, step], seen, leaves);
    }
  }
  if (!moved) leaves.push({ steps, board });
}

function preferDie(turns, die) {
  const withDie = turns.filter((turn) => turn.steps[0].die === die);
  return withDie.length > 0 ? withDie : turns;
}

function uniqueByPosition(turns) {
  const byKey = new Map();
  for (const turn of turns) {
    const key = boardKey(turn.board);
    if (!byKey.has(key)) byKey.set(key, turn);
  }
  return [...byKey.values()];
}

/**
 * Largest number of the given dice the player can use one after another.
 * @param {import('./board.js').Board} board
 * @param {number} player
 * @param {number[]} dice - dice still available (four entries for a double)
 * @returns {number}
 */
export function maxDiceUsable(board, player, dice) {
  let best = 0;
  for (const die of distinctDice(dice)) {
    const rest = removeDie(dice, die);
    for (const step of singleSteps(board, player, die)) {
      const used = 1 + maxDiceUsable(applyStep(board, player, step), player, rest);
      if (used === dice.length) return used;
      best = Math.max(best, used);
    }
  }
  return best;
}

/**
 * The finished game's result, or null while both sides still have checkers in play.
 * Mars (gammon): the loser has not borne off a single checker and the win counts double.
 * @param {import('./board.js').Board} board
 * @returns {{winner: number, mars: boolean, points: number}|null}
 */
export function gameResult(board) {
  for (const player of [WHITE, BLACK]) {
    if (board.off[player] === CHECKERS) {
      const mars = board.off[opponent(player)] === 0;
      return { winner: player, mars, points: mars ? 2 : 1 };
    }
  }
  return null;
}
