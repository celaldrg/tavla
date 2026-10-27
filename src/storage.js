/**
 * localStorage access that never throws. Private mode, blocked site data or a
 * missing window only make reads return null and writes return false.
 * Nothing touches storage at import time.
 */

/** Prefix that keeps this game's keys apart from other pages on the same origin. */
const PREFIX = 'tavla.';

/**
 * Reads a saved string.
 * @param {string} key - name without the prefix
 * @returns {string|null} the saved value, or null when it is missing or storage is unavailable
 */
export function load(key) {
  try {
    const value = globalThis.localStorage.getItem(PREFIX + key);
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

/**
 * Saves a string.
 * @param {string} key - name without the prefix
 * @param {string} value
 * @returns {boolean} true when the value was stored
 */
export function save(key, value) {
  try {
    globalThis.localStorage.setItem(PREFIX + key, String(value));
    return true;
  } catch {
    return false;
  }
}
