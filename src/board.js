/**
 * Tavla board model. Pure data helpers, no DOM access.
 *
 * Points are indexed 0..23. White (player 0) moves from index 23 down to index 0,
 * has its home board on indices 0..5 and bears off below index 0. Black (player 1)
 * moves from index 0 up to index 23, has its home board on indices 18..23 and bears
 * off above index 23. A positive count on a point means white checkers, a negative
 * count black checkers.
 */

/** White moves from index 23 towards index 0. */
export const WHITE = 0;
/** Black moves from index 0 towards index 23. */
export const BLACK = 1;
/** Step source for a checker entering from the bar. */
export const BAR = 'bar';
/** Step target for a checker borne off. */
export const OFF = 'off';
/** Checkers per side. */
export const CHECKERS = 15;
/** Number of points on the board. */
export const POINT_COUNT = 24;

/**
 * @typedef {Object} Board
 * @property {number[]} points - 24 counts; positive = white checkers, negative = black
 * @property {number[]} bar - checkers on the bar, indexed by player
 * @property {number[]} off - checkers borne off, indexed by player
 */

/**
 * Builds a board from a sparse description with absolute point indices.
 * @param {{white?: Object<string, number>, black?: Object<string, number>, bar?: number[], off?: number[]}} spec
 *   checker counts per point index for each side, plus bar and borne-off counts
 * @returns {Board}
 * @throws {Error} when an index is invalid, a point is listed twice or a side does not have 15 checkers
 */
export function createBoard(spec) {
  const points = new Array(POINT_COUNT).fill(0);
  placeCheckers(points, spec.white ?? {}, 1);
  placeCheckers(points, spec.black ?? {}, -1);
  const board = { points, bar: [...(spec.bar ?? [0, 0])], off: [...(spec.off ?? [0, 0])] };
  for (const player of [WHITE, BLACK]) {
    if (totalCheckers(board, player) !== CHECKERS) {
      throw new Error(`Player ${player} must have exactly ${CHECKERS} checkers`);
    }
  }
  return board;
}

function placeCheckers(points, layout, sign) {
  for (const [key, count] of Object.entries(layout)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= POINT_COUNT) {
      throw new Error(`Invalid point index ${key}`);
    }
    if (points[index] !== 0) throw new Error(`Point ${index} is listed twice`);
    points[index] = sign * count;
  }
}

/**
 * The standard starting position: each side has 2 checkers on its 24-point,
 * 5 on its 13-point, 3 on its 8-point and 5 on its 6-point.
 * @returns {Board}
 */
export function startingBoard() {
  return createBoard({
    white: { 23: 2, 12: 5, 7: 3, 5: 5 },
    black: { 0: 2, 11: 5, 16: 3, 18: 5 },
  });
}

/**
 * Deep copy of a board.
 * @param {Board} board
 * @returns {Board}
 */
export function cloneBoard(board) {
  return { points: board.points.slice(), bar: board.bar.slice(), off: board.off.slice() };
}

/**
 * The other player.
 * @param {number} player - WHITE or BLACK
 * @returns {number}
 */
export function opponent(player) {
  return 1 - player;
}

/**
 * Number of the player's checkers on a point (0 when it is empty or held by the opponent).
 * @param {Board} board
 * @param {number} player
 * @param {number} index - point index 0..23
 * @returns {number}
 */
export function checkersAt(board, player, index) {
  const value = board.points[index];
  if (player === WHITE) return value > 0 ? value : 0;
  return value < 0 ? -value : 0;
}

/**
 * Pips a checker on `index` still has to travel to be borne off (1..24).
 * @param {number} player
 * @param {number} index - point index 0..23
 * @returns {number}
 */
export function pipDistance(player, index) {
  return player === WHITE ? index + 1 : POINT_COUNT - index;
}

/**
 * Index reached after moving `pips` from `index`; outside 0..23 means bearing off.
 * @param {number} player
 * @param {number} index - point index 0..23
 * @param {number} pips - distance to move
 * @returns {number}
 */
export function targetIndex(player, index, pips) {
  return player === WHITE ? index - pips : index + pips;
}

/**
 * Point index where a checker from the bar enters with `die`.
 * @param {number} player
 * @param {number} die - 1..6
 * @returns {number}
 */
export function entryIndex(player, die) {
  return player === WHITE ? POINT_COUNT - die : die - 1;
}

/**
 * Pips the player needs to bear off every checker (a checker on the bar counts 25).
 * @param {Board} board
 * @param {number} player
 * @returns {number}
 */
export function pipCount(board, player) {
  let pips = board.bar[player] * 25;
  for (let index = 0; index < POINT_COUNT; index++) {
    pips += checkersAt(board, player, index) * pipDistance(player, index);
  }
  return pips;
}

/**
 * Checkers of the player on the points, on the bar and borne off together.
 * @param {Board} board
 * @param {number} player
 * @returns {number}
 */
export function totalCheckers(board, player) {
  let total = board.bar[player] + board.off[player];
  for (let index = 0; index < POINT_COUNT; index++) total += checkersAt(board, player, index);
  return total;
}

/**
 * Compact string that identifies a position; equal positions give equal keys.
 * @param {Board} board
 * @returns {string}
 */
export function boardKey(board) {
  let key = '';
  for (let index = 0; index < POINT_COUNT; index++) key += String.fromCharCode(board.points[index] + 64);
  return key + String.fromCharCode(board.bar[0] + 64, board.bar[1] + 64, board.off[0] + 64, board.off[1] + 64);
}
