/**
 * Computer opponent: a one-ply search over every legal turn, scored by a hand-made
 * evaluation (pip count, blots under fire, deep blots, made points, primes, builders,
 * split back checkers, home board, bar).
 * Pure module; the Easy level adds noise from an injected seeded generator.
 */
import { POINT_COUNT, WHITE, opponent, pipDistance } from './board.js';
import { legalTurns } from './rules.js';

/** Largest random amount (in pips) added to or taken from a score at the Easy level. */
const EASY_NOISE = 18;
/** Bonus for each checker borne off. */
const OFF_BONUS = 4;
/** Value of holding a point (2+ checkers), indexed by its pip distance 1..24 from the owner's side. */
const POINT_VALUE = [0, 1, 2, 3, 4.5, 6, 6, 5, 3, 2, 1.5, 1, 1, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1.5, 2.5, 2.5, 2, 1.5, 1];
/** Bonus for the longest run of consecutive held points, indexed by run length (capped at 6). */
const PRIME_VALUE = [0, 0, 1, 3, 6, 10, 15];
/** Pips lost on top of the distance already travelled when a blot is hit. */
const HIT_COST = 6;
/** The same for a back checker in the opponent's home board, which loses little by being hit. */
const BACK_HIT_COST = 2;
/** Pip distance where the opponent's home board starts. */
const THEIR_HOME = 19;
/** Pip distance from which checkers count as back checkers for the split bonus. */
const BACK_ZONE = 16;
/** Penalty for each checker beyond the third on a point. */
const STACK_PENALTY = 0.5;
/** Extra penalty for a blot deep in the home board (indexed by pip distance 1..4), which is hard to cover. */
const DEEP_BLOT = [0, 5, 4.5, 3, 1];
/** Bonus for each extra point the back checkers occupy in the opponent's home board (a split). */
const SPLIT_BONUS = 3.5;
/** Bonus for each outfield point (pip distance 7..11) with a checker on it, ready to make a new point. */
const BUILDER_BONUS = 2.5;
/** Every distinct roll with its weight out of 36 and a bit mask of the distances it can travel. */
const ROLLS = buildRolls();

function buildRolls() {
  const rolls = [];
  for (let a = 1; a <= 6; a++) {
    for (let b = a; b <= 6; b++) {
      const reach = a === b ? [a, 2 * a, 3 * a, 4 * a] : [a, b, a + b];
      rolls.push({ weight: a === b ? 1 : 2, mask: reach.reduce((mask, distance) => mask | (1 << distance), 0) });
    }
  }
  return rolls;
}

/**
 * Scores a position for `player`; higher is better. The scale is roughly pips.
 * @param {import('./board.js').Board} board
 * @param {number} player
 * @returns {number}
 */
export function evaluate(board, player) {
  const { mine, theirs } = perspective(board, player);
  const theirRearmost = rearmost(theirs);
  return (
    opponentPips(theirs) -
    ownPips(mine) +
    OFF_BONUS * mine[0] +
    pointsScore(mine, theirRearmost) +
    PRIME_VALUE[Math.min(longestPrime(mine, theirRearmost), 6)] +
    barPressure(mine, theirs) -
    blotRisk(mine, theirs) -
    deepBlots(mine, theirRearmost) +
    backSplit(mine, theirs) +
    builders(mine) -
    stackPenalty(mine)
  );
}

/**
 * Chooses a turn with a one-ply search: every legal turn is scored and the best kept.
 * @param {import('./board.js').Board} board - position before the turn
 * @param {number} player
 * @param {number[]} dice - the two rolled values
 * @param {{level?: string, rng?: () => number}} [options] - level 'easy' or 'normal'
 *   (default); rng supplies the Easy noise (defaults to Math.random)
 * @returns {import('./rules.js').TurnOption|null} null when no checker can move
 */
export function chooseTurn(board, player, dice, options = {}) {
  const noise = options.level === 'easy' ? EASY_NOISE : 0;
  const rng = options.rng ?? Math.random;
  let best = null;
  let bestScore = -Infinity;
  for (const turn of legalTurns(board, player, dice)) {
    const score = evaluate(turn.board, player) + (noise > 0 ? noise * (2 * rng() - 1) : 0);
    if (score > bestScore) {
      best = turn;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Both sides seen from `player`: index r of `mine` holds own checkers r pips from
 * bearing off (25 = bar, 0 = borne off); `theirs[r]` holds opposing checkers on that
 * same point (0 = their bar, 25 = their borne-off checkers).
 */
function perspective(board, player) {
  const mine = new Array(26).fill(0);
  const theirs = new Array(26).fill(0);
  const sign = player === WHITE ? 1 : -1;
  for (let index = 0; index < POINT_COUNT; index++) {
    const value = board.points[index] * sign;
    if (value > 0) mine[pipDistance(player, index)] = value;
    else if (value < 0) theirs[pipDistance(player, index)] = -value;
  }
  mine[0] = board.off[player];
  mine[25] = board.bar[player];
  theirs[0] = board.bar[opponent(player)];
  theirs[25] = board.off[opponent(player)];
  return { mine, theirs };
}

function ownPips(mine) {
  let pips = 0;
  for (let r = 1; r <= 25; r++) pips += r * mine[r];
  return pips;
}

function opponentPips(theirs) {
  let pips = 0;
  for (let r = 0; r <= 24; r++) pips += (25 - r) * theirs[r];
  return pips;
}

/** Lowest index holding an opposing checker still in play (25 when none). */
function rearmost(theirs) {
  for (let r = 0; r <= 24; r++) if (theirs[r] > 0) return r;
  return 25;
}

/** Held points only count while some opposing checker still has to get past them. */
function pointsScore(mine, theirRearmost) {
  let score = 0;
  for (let r = theirRearmost + 1; r <= 24; r++) if (mine[r] >= 2) score += POINT_VALUE[r];
  return score;
}

function longestPrime(mine, theirRearmost) {
  let longest = 0;
  let run = 0;
  for (let r = theirRearmost + 1; r <= 24; r++) {
    run = mine[r] >= 2 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return longest;
}

function homePoints(counts, from, to) {
  let held = 0;
  for (let r = from; r <= to; r++) if (counts[r] >= 2) held += 1;
  return held;
}

/** Checkers on the bar are worth more the stronger the home board they must enter. */
function barPressure(mine, theirs) {
  const theirsOnBar = theirs[0] * (3 + 2.5 * homePoints(mine, 1, 6));
  const mineOnBar = mine[25] * (3 + 2.5 * homePoints(theirs, 19, 24));
  return theirsOnBar - mineOnBar;
}

/** Expected pips lost to the opponent's next roll hitting the most valuable reachable blot. */
function blotRisk(mine, theirs) {
  const blots = [];
  for (let r = 1; r <= 24; r++) {
    if (mine[r] !== 1) continue;
    let mask = 0;
    for (let s = 0; s < r; s++) if (theirs[s] > 0) mask |= 1 << (r - s);
    if (mask !== 0) blots.push({ mask, cost: 25 - r + (r >= THEIR_HOME ? BACK_HIT_COST : HIT_COST) });
  }
  if (blots.length === 0) return 0;
  let risk = 0;
  for (const roll of ROLLS) {
    let worst = 0;
    for (const blot of blots) if ((blot.mask & roll.mask) !== 0) worst = Math.max(worst, blot.cost);
    risk += roll.weight * worst;
  }
  return risk / 36;
}

function stackPenalty(mine) {
  let penalty = 0;
  for (let r = 1; r <= 24; r++) penalty += Math.max(0, mine[r] - 3) * STACK_PENALTY;
  return penalty;
}

function builders(mine) {
  let occupied = 0;
  for (let r = 7; r <= 11; r++) if (mine[r] > 0) occupied += 1;
  return occupied * BUILDER_BONUS;
}

/** Blots on the lowest points while an opposing checker can still hit them. */
function deepBlots(mine, theirRearmost) {
  let penalty = 0;
  for (let r = theirRearmost + 1; r < DEEP_BLOT.length; r++) if (mine[r] === 1) penalty += DEEP_BLOT[r];
  return penalty;
}

/** Back checkers spread over more points find a way out (and an anchor) more easily, while the opponent's board is open. */
function backSplit(mine, theirs) {
  if (homePoints(theirs, THEIR_HOME, 24) >= 3) return 0;
  let occupied = 0;
  for (let r = BACK_ZONE; r <= 24; r++) if (mine[r] > 0) occupied += 1;
  return Math.max(0, occupied - 1) * SPLIT_BONUS;
}
