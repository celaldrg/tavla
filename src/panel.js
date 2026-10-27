/**
 * The page around the board: header buttons, player chips, status line, action
 * buttons, result banner and the new-game dialog. UI module; every text comes
 * from i18n.js.
 */
import { BLACK, WHITE } from './board.js';
import { translate } from './i18n.js';
import { playerKey, primaryAction, resultMessage, statusMessage } from './presenter.js';

/**
 * @typedef {Object} PanelHandlers
 * @property {() => void} newGame - the New game button was pressed
 * @property {() => void} toggleLanguage
 * @property {() => void} undo
 * @property {(action: string) => void} primary - 'roll', 'confirm', 'pass' or 'playAgain'
 * @property {(settings: {mode: string, level: string}) => void} start - the dialog was confirmed
 */

/**
 * Connects the panel elements of the page.
 * @param {Document} doc
 * @param {PanelHandlers} handlers
 * @returns {{
 *   setLanguage: (lang: string) => void,
 *   update: (state: import('./game.js').GameState, options: {canUndo: boolean}) => void,
 *   openDialog: (settings: {mode: string, level: string}) => void,
 * }}
 */
export function createPanel(doc, handlers) {
  const byId = (id) => doc.getElementById(id);
  const dom = {
    undo: byId('undo'),
    primary: byId('primary'),
    status: byId('status'),
    result: byId('result'),
    resultTitle: byId('result-title'),
    resultDetail: byId('result-detail'),
    dialog: byId('new-game-dialog'),
    form: byId('new-game-form'),
    levelField: byId('level-field'),
  };
  const chips = [WHITE, BLACK].map((player) => chipParts(byId(`player-${player}`)));
  let lang = 'en';
  let primary = null;

  byId('new-game').addEventListener('click', () => handlers.newGame());
  byId('lang-toggle').addEventListener('click', () => handlers.toggleLanguage());
  byId('play-again').addEventListener('click', () => handlers.primary('playAgain'));
  dom.undo.addEventListener('click', () => handlers.undo());
  dom.primary.addEventListener('click', () => {
    if (primary) handlers.primary(primary);
  });
  dom.form.addEventListener('change', () => syncLevelField(dom));
  byId('dialog-cancel').addEventListener('click', () => dom.dialog.close());
  dom.form.addEventListener('submit', () => handlers.start(readSettings(dom.form)));

  return {
    setLanguage(next) {
      lang = next;
      applyStaticTexts(doc, lang);
    },
    update(state, { canUndo }) {
      chips.forEach((parts, player) => updateChip(parts, player, state, lang));
      dom.status.textContent = translate(lang, statusMessage(state));
      const { action, enabled } = primaryAction(state);
      primary = enabled ? action : null;
      dom.primary.textContent = translate(lang, { key: action });
      dom.primary.disabled = !enabled;
      dom.undo.disabled = !canUndo;
      updateResult(dom, state, lang);
    },
    openDialog(settings) {
      dom.form.elements.mode.value = settings.mode;
      dom.form.elements.level.value = settings.level;
      syncLevelField(dom);
      dom.dialog.showModal();
    },
  };
}

function chipParts(chip) {
  return {
    chip,
    name: chip.querySelector('.player-name'),
    level: chip.querySelector('.player-level'),
    pips: chip.querySelector('.player-pips'),
  };
}

/** Fills every element marked with data-i18n (text) or data-i18n-aria (aria-label). */
function applyStaticTexts(doc, lang) {
  doc.documentElement.lang = lang;
  for (const element of doc.querySelectorAll('[data-i18n]')) {
    element.textContent = translate(lang, { key: element.dataset.i18n });
  }
  for (const element of doc.querySelectorAll('[data-i18n-aria]')) {
    element.setAttribute('aria-label', translate(lang, { key: element.dataset.i18nAria }));
  }
}

function updateChip({ chip, name, level, pips }, player, state, lang) {
  const playerName = translate(lang, { key: playerKey(state, player) });
  const computer = state.mode === 'ai' && player !== state.human;
  name.textContent = playerName;
  level.hidden = !computer;
  level.textContent = computer ? translate(lang, { key: state.level }) : '';
  pips.textContent = translate(lang, { key: 'pipCount', params: { pips: state.pips[player] } });
  chip.title = translate(lang, { key: 'playerLabel', params: { name: playerName, pips: state.pips[player] } });
  chip.classList.toggle('is-active', state.phase !== 'over' && state.current === player);
  chip.classList.toggle('is-winner', state.phase === 'over' && state.result.winner === player);
}

function updateResult(dom, state, lang) {
  dom.result.hidden = state.phase !== 'over';
  if (state.phase !== 'over') return;
  const { title, detail } = resultMessage(state);
  dom.resultTitle.textContent = translate(lang, title);
  dom.resultDetail.textContent = translate(lang, detail);
}

function syncLevelField(dom) {
  dom.levelField.disabled = dom.form.elements.mode.value === 'pvp';
}

function readSettings(form) {
  return { mode: form.elements.mode.value, level: form.elements.level.value };
}
