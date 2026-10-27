import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyCommand } from '../src/input.js';

test('arrows move the cursor, Enter and Space play, Escape cancels', () => {
  assert.deepEqual(keyCommand('ArrowLeft'), { name: 'prev' });
  assert.deepEqual(keyCommand('ArrowUp'), { name: 'prev' });
  assert.deepEqual(keyCommand('ArrowRight'), { name: 'next' });
  assert.deepEqual(keyCommand('ArrowDown'), { name: 'next' });
  assert.deepEqual(keyCommand('Enter'), { name: 'activate' });
  assert.deepEqual(keyCommand(' '), { name: 'activate' });
  assert.deepEqual(keyCommand('Escape'), { name: 'cancel' });
});

test('letters work in either case and digits pick a die', () => {
  for (const key of ['r', 'R']) assert.deepEqual(keyCommand(key), { name: 'roll' });
  for (const key of ['u', 'U', 'Backspace']) assert.deepEqual(keyCommand(key), { name: 'undo' });
  for (const key of ['n', 'N']) assert.deepEqual(keyCommand(key), { name: 'newGame' });
  for (let value = 1; value <= 6; value++) assert.deepEqual(keyCommand(String(value)), { name: 'die', value });
  for (const key of ['0', '7', 'x', 'Tab', 'Shift', 'F5']) assert.equal(keyCommand(key), null, key);
});

test('modifiers and focused buttons keep the browser shortcuts', () => {
  assert.deepEqual(keyCommand('z', { ctrl: true }), { name: 'undo' });
  assert.deepEqual(keyCommand('Z', { ctrl: true }), { name: 'undo' });
  assert.equal(keyCommand('r', { ctrl: true }), null, 'Ctrl+R still reloads');
  assert.equal(keyCommand('n', { alt: true }), null);
  assert.equal(keyCommand('Enter', { onControl: true }), null, 'Enter presses the focused button');
  assert.equal(keyCommand(' ', { onControl: true }), null);
  assert.deepEqual(keyCommand('r', { onControl: true }), { name: 'roll' });
});
