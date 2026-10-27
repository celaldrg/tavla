/**
 * Computer opponent: a one-ply search over every legal turn, scored by a hand-made
 * evaluation (pip count, blots under fire, made points, primes, home board, bar).
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
/** Penalty for each checker beyond the third on a point. */
const STACK_PENALTY = 0.5;
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
    if (mask !== 0) blots.push({ mask, cost: 25 - r + HIT_COST });
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
