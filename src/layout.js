/**
 * Board geometry for the SVG view. Pure module (no DOM): where the points,
 * checkers, bar, trays and dice go, and which part of the board a position hits.
 *
 * The board is laid out in landscape as white sees it: white's home board is at
 * the bottom right, black's at the top right and the bear-off trays are on the
 * right. The portrait board used on narrow phone screens is the same picture
 * mirrored across its diagonal (x and y swapped), so both share one set of rules.
 * All lengths are board units; the SVG viewBox scales them to the screen.
 */
import { BAR, CHECKERS, OFF, WHITE, checkersAt } from './board.js';

/** Checkers drawn on a point before the rest is shown as a number on the top one. */
export const STACK_LIMIT = 5;
/** Checkers drawn on the bar before the rest is shown as a number. */
export const BAR_LIMIT = 4;
/** Radius of a checker. */
export const CHECKER_RADIUS = 25;
/** Edge length of a die. */
export const DIE_SIZE = 46;

const FRAME = 14;
const POINT = 56;
const BAR_WIDTH = 56;
const TRAY_GAP = 10;
const TRAY = 56;
const HALF = 280;
const TRIANGLE = 226;
const DIAMETER = 2 * CHECKER_RADIUS;
const BAR_OFFSET = CHECKER_RADIUS + 10;
const SLIVER_INSET = 6;
const SLIVER_THICKNESS = 13;
const SLIVER_PITCH = 17;
const DIE_PITCH = DIE_SIZE + 10;

const LEFT = FRAME;
const BAR_LEFT = LEFT + 6 * POINT;
const RIGHT = BAR_LEFT + BAR_WIDTH;
const RIGHT_END = RIGHT + 6 * POINT;
const TRAY_LEFT = RIGHT_END + TRAY_GAP;
const WIDTH = TRAY_LEFT + TRAY + FRAME;
const TOP = FRAME;
const MIDDLE = TOP + HALF;
const BOTTOM = MIDDLE + HALF;
const HEIGHT = BOTTOM + FRAME;

/**
 * @typedef {Object} Rect
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {Object} BoardLayout
 * @property {number} width - viewBox width
 * @property {number} height - viewBox height
 * @property {Rect} outline - the whole board including the frame
 * @property {Rect[]} fields - the two halves of the playing field (outer table, home table)
 * @property {Rect} bar - the bar between the two halves
 * @property {(player: number) => Rect} tray - bear-off tray of a player
 * @property {(index: number) => number[][]} triangle - the three corners of a point
 * @property {(index: number, slot: number) => number[]} checker - centre of a checker on a point (slot 0 at the base)
 * @property {(player: number, slot: number) => number[]} barChecker - centre of a checker on the bar
 * @property {(player: number, slot: number) => Rect} sliver - a borne-off checker lying in the tray
 * @property {(player: number, count: number) => number[][]} dice - centres of a player's dice
 * @property {(location: number|string, player: number) => Rect} area - region of a point, a bar half or a tray
 * @property {(board: Object, player: number, location: number|string, next?: boolean) => number[]} stackTop
 *   centre of the player's topmost drawn checker at a location, or with `next` of the spot the next one takes
 * @property {(x: number, y: number) => number|string|null} locate - point index, BAR, OFF or null at a position
 */

/**
 * Colour group (0 or 1) of a point. Neighbouring points differ, and so do facing
 * points, because indexes i and 23 - i always have different parity.
 * @param {number} index - point index 0..23
 * @returns {number}
 */
export function pointTone(index) {
  return index % 2;
}

/**
 * Geometry of the board in one orientation.
 * @param {boolean} portrait - true for the tall board used on narrow screens
 * @returns {BoardLayout}
 */
export function createLayout(portrait) {
  const spot = portrait ? ([x, y]) => [y, x] : ([x, y]) => [x, y];
  const box = portrait
    ? (rect) => ({ x: rect.y, y: rect.x, width: rect.height, height: rect.width })
    : (rect) => ({ ...rect });
  return {
    width: portrait ? HEIGHT : WIDTH,
    height: portrait ? WIDTH : HEIGHT,
    outline: box({ x: 0, y: 0, width: WIDTH, height: HEIGHT }),
    fields: [
      box({ x: LEFT, y: TOP, width: 6 * POINT, height: 2 * HALF }),
      box({ x: RIGHT, y: TOP, width: 6 * POINT, height: 2 * HALF }),
    ],
    bar: box({ x: BAR_LEFT, y: TOP, width: BAR_WIDTH, height: 2 * HALF }),
    tray: (player) => box(trayRect(player)),
    triangle: (index) => triangleCorners(index).map(spot),
    checker: (index, slot) => spot(checkerSpot(index, slot)),
    barChecker: (player, slot) => spot(barSpot(player, slot)),
    sliver: (player, slot) => box(sliverRect(player, slot)),
    dice: (player, count) => diceSpots(player, count).map(spot),
    area: (location, player) => box(areaRect(location, player)),
    stackTop: (board, player, location, next = false) => spot(stackSpot(board, player, location, next)),
    locate: (x, y) => {
      const [landscapeX, landscapeY] = spot([x, y]);
      return locate(landscapeX, landscapeY);
    },
  };
}

/** Centre line, base and direction (towards the tip) of a point in landscape. */
function column(index) {
  if (index < 6) return { x: RIGHT + (5.5 - index) * POINT, base: BOTTOM, dir: -1 };
  if (index < 12) return { x: LEFT + (11.5 - index) * POINT, base: BOTTOM, dir: -1 };
  if (index < 18) return { x: LEFT + (index - 11.5) * POINT, base: TOP, dir: 1 };
  return { x: RIGHT + (index - 17.5) * POINT, base: TOP, dir: 1 };
}

function triangleCorners(index) {
  const { x, base, dir } = column(index);
  return [
    [x - POINT / 2, base],
    [x + POINT / 2, base],
    [x, base + dir * TRIANGLE],
  ];
}

function checkerSpot(index, slot) {
  const { x, base, dir } = column(index);
  return [x, base + dir * (CHECKER_RADIUS + slot * DIAMETER)];
}

/** White waits in the bar half next to black's home board, where it enters; black the other half. */
function barSpot(player, slot) {
  const offset = BAR_OFFSET + slot * DIAMETER;
  return [BAR_LEFT + BAR_WIDTH / 2, player === WHITE ? MIDDLE - offset : MIDDLE + offset];
}

function trayRect(player) {
  return { x: TRAY_LEFT, y: player === WHITE ? MIDDLE : TOP, width: TRAY, height: HALF };
}

function sliverRect(player, slot) {
  const fromEdge = SLIVER_INSET + slot * SLIVER_PITCH;
  const y = player === WHITE ? BOTTOM - fromEdge - SLIVER_THICKNESS : TOP + fromEdge;
  return { x: TRAY_LEFT + SLIVER_INSET, y, width: TRAY - 2 * SLIVER_INSET, height: SLIVER_THICKNESS };
}

/** Dice lie in the middle of the mover's half: white's on the home side, black's on the other. */
function diceSpots(player, count) {
  const centre = player === WHITE ? RIGHT + 3 * POINT : LEFT + 3 * POINT;
  const spots = [];
  for (let die = 0; die < count; die++) spots.push([centre + (die - (count - 1) / 2) * DIE_PITCH, MIDDLE]);
  return spots;
}

function areaRect(location, player) {
  if (location === BAR) return { x: BAR_LEFT, y: player === WHITE ? TOP : MIDDLE, width: BAR_WIDTH, height: HALF };
  if (location === OFF) return trayRect(player);
  const { x, base } = column(location);
  return { x: x - POINT / 2, y: base === TOP ? TOP : MIDDLE, width: POINT, height: HALF };
}

function stackSpot(board, player, location, next) {
  const extra = next ? 0 : -1;
  if (location === OFF) {
    const rect = sliverRect(player, clamp(board.off[player] + extra, 0, CHECKERS - 1));
    return [rect.x + rect.width / 2, rect.y + rect.height / 2];
  }
  if (location === BAR) return barSpot(player, clamp(board.bar[player] + extra, 0, BAR_LIMIT - 1));
  return checkerSpot(location, clamp(checkersAt(board, player, location) + extra, 0, STACK_LIMIT - 1));
}

/** Hit test in landscape. The frame counts as part of the nearest area, which helps on touch screens. */
function locate(x, y) {
  if (x < 0 || x > WIDTH || y < 0 || y > HEIGHT) return null;
  if (x >= BAR_LEFT && x < RIGHT) return BAR;
  if (x >= RIGHT_END) return OFF;
  const top = y < MIDDLE;
  if (x < BAR_LEFT) {
    const offset = clamp(Math.floor((x - LEFT) / POINT), 0, 5);
    return top ? 12 + offset : 11 - offset;
  }
  const offset = clamp(Math.floor((x - RIGHT) / POINT), 0, 5);
  return top ? 18 + offset : 5 - offset;
}

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}
