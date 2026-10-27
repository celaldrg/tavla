/**
 * Seeded randomness and dice helpers for tavla.
 * Pure module: nothing runs at import time and nothing touches the DOM.
 */

/**
 * Creates a deterministic pseudo-random generator (mulberry32).
 * @param {number} seed - integer seed; equal seeds give equal sequences
 * @returns {() => number} a function returning floats in [0, 1)
 */
export function createRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Rolls one six-sided die.
 * @param {() => number} rng - generator from createRng
 * @returns {number} a value from 1 to 6
 */
export function rollDie(rng) {
  return 1 + Math.floor(rng() * 6);
}

/**
 * Rolls the two dice of a turn.
 * @param {() => number} rng - generator from createRng
 * @returns {number[]} two values from 1 to 6
 */
export function rollDice(rng) {
  return [rollDie(rng), rollDie(rng)];
}

/**
 * The dice a roll lets the player use: a double is played four times.
 * @param {number[]} dice - the two rolled values
 * @returns {number[]} two values, or four equal values for a double
 */
export function diceToPlay(dice) {
  const [first, second] = dice;
  return first === second ? [first, first, first, first] : [first, second];
}

/**
 * Returns a copy of `dice` with one occurrence of `die` removed.
 * @param {number[]} dice - dice still available
 * @param {number} die - the value that was used
 * @returns {number[]}
 */
export function removeDie(dice, die) {
  const index = dice.indexOf(die);
  if (index < 0) return dice.slice();
  return [...dice.slice(0, index), ...dice.slice(index + 1)];
}

/**
 * Distinct values among the available dice, in their original order.
 * @param {number[]} dice - dice still available
 * @returns {number[]}
 */
export function distinctDice(dice) {
  return [...new Set(dice)];
}
