import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, save } from '../src/storage.js';

/** Runs `body` with globalThis.localStorage replaced by `getter`, then puts the original back. */
function withStorage(getter, body) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { get: getter, configurable: true });
  try {
    body();
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
}

function memoryStorage() {
  const items = new Map();
  return {
    items,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
  };
}

test('values round-trip under the tavla. prefix', () => {
  const storage = memoryStorage();
  withStorage(() => storage, () => {
    assert.equal(load('lang'), null);
    assert.equal(save('lang', 'tr'), true);
    assert.equal(load('lang'), 'tr');
    assert.deepEqual([...storage.items], [['tavla.lang', 'tr']]);
  });
});

test('missing or blocked storage never throws', () => {
  withStorage(() => undefined, () => {
    assert.equal(load('lang'), null);
    assert.equal(save('lang', 'en'), false);
  });
  withStorage(() => {
    throw new Error('SecurityError: storage is disabled');
  }, () => {
    assert.equal(load('mode'), null);
    assert.equal(save('mode', 'pvp'), false);
  });
  const full = {
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };
  withStorage(() => full, () => {
    assert.equal(load('level'), null);
    assert.equal(save('level', 'easy'), false);
  });
});
