import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/game.js';
import { LANGUAGES, STRINGS, isLanguage, translate } from '../src/i18n.js';
import { primaryAction, resultMessage, statusMessage } from '../src/presenter.js';

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

/** Every key used by a message, including the messages nested in its parameters. */
function messageKeys(message) {
  const nested = Object.values(message.params ?? {}).filter((value) => typeof value === 'object');
  return [message.key, ...nested.flatMap(messageKeys)];
}

/** Checks that a message can be shown in every language without gaps. */
function assertShowable(message) {
  for (const key of messageKeys(message)) assert.ok(key in STRINGS.en, `unknown key ${key}`);
  for (const lang of LANGUAGES) {
    const text = translate(lang, message);
    assert.ok(text.length > 0);
    assert.doesNotMatch(text, /[{}]/, `${lang}: ${text}`);
  }
}

test('both languages have the same keys, placeholders and no empty texts', () => {
  assert.deepEqual(LANGUAGES, ['en', 'tr']);
  const keys = Object.keys(STRINGS.en).sort();
  assert.deepEqual(Object.keys(STRINGS.tr).sort(), keys);
  for (const key of keys) {
    assert.ok(STRINGS.en[key].trim() && STRINGS.tr[key].trim(), key);
    assert.deepEqual(placeholders(STRINGS.tr[key]), placeholders(STRINGS.en[key]), key);
  }
  assert.equal(STRINGS.en.langButton, 'TR', 'the toggle names the language it switches to');
  assert.equal(STRINGS.tr.langButton, 'EN');
});

test('the Turkish texts use the usual tavla words', () => {
  const turkish = Object.values(STRINGS.tr).join(' ').toLowerCase();
  for (const word of ['pul', 'zar', 'kırma', 'mars']) assert.ok(turkish.includes(word), word);
});

test('translate fills nested messages and falls back safely', () => {
  const message = { key: 'named', params: { name: { key: 'white' }, text: { key: 'movePrompt', params: { dice: '6-1' } } } };
  assert.equal(translate('en', message), 'White: Play 6-1');
  assert.equal(translate('tr', message), 'Beyaz: 6-1 oyna');
  assert.equal(translate('de', { key: 'undo' }), 'Undo');
  assert.equal(translate('tr', { key: 'noSuchKey' }), 'noSuchKey');
  assert.equal(translate('en', { key: 'pipCount' }), '{pips} pips', 'a missing value stays visible');
  assert.equal(isLanguage('tr'), true);
  assert.equal(isLanguage('de'), false);
  assert.equal(isLanguage(null), false);
});

test('every data-i18n key in index.html has a text', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const keys = [...html.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(keys.length >= 15);
  for (const key of keys) assert.ok(key in STRINGS.en, key);
});

test('a control with a visible text and an aria-label starts the label with that text (label in name)', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const attribute = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
  const tags = [...html.matchAll(/<[a-z]+\s[^>]*>/g)].map((match) => match[0]);
  const labelled = tags.filter((tag) => attribute(tag, 'data-i18n') && attribute(tag, 'data-i18n-aria'));
  assert.ok(labelled.length >= 1);
  for (const tag of labelled) {
    for (const lang of LANGUAGES) {
      const text = STRINGS[lang][attribute(tag, 'data-i18n')];
      const label = STRINGS[lang][attribute(tag, 'data-i18n-aria')];
      assert.ok(label.startsWith(text), `${lang}: "${label}" must start with "${text}"`);
    }
  }
  const toggle = html.match(/<button[^>]*id="lang-toggle"[^>]*>([^<]*)<\/button>/);
  assert.equal(attribute(toggle[0], 'aria-label'), STRINGS.en.langButtonLabel, 'the page loads with the English label');
  assert.equal(toggle[1], STRINGS.en.langButton);
});

test('every status of whole games reads well in both languages', () => {
  for (const options of [{ mode: 'ai', level: 'easy', seed: 5 }, { mode: 'pvp', seed: 8 }]) {
    const game = createGame(options);
    for (let turns = 0; game.getState().phase !== 'over'; turns++) {
      assert.ok(turns < 1000, 'the game must end');
      if (game.getState().phase === 'roll') {
        assertShowable(statusMessage(game.getState()));
        game.roll();
      }
      assertShowable(statusMessage(game.getState()));
      for (const step of game.aiSteps()) {
        game.move(step.from, step.to, step.die);
        assertShowable(statusMessage(game.getState()));
      }
      assertShowable({ key: primaryAction(game.getState()).action });
      game.confirm();
    }
    const state = game.getState();
    assertShowable(statusMessage(state));
    const { title, detail } = resultMessage(state);
    assertShowable(title);
    assertShowable(detail);
  }
});
