/**
 * Entry point. Wires the game controller (game.js) to the SVG board, the panel
 * and the input handlers, keeps the selection for tap and keyboard play, and lets
 * the computer play its turns step by step with short pauses.
 */
import { BAR, opponent } from './board.js';
import { createDemoGame, createGame } from './game.js';
import { isLanguage } from './i18n.js';
import { bindKeyboard, bindPointer } from './input.js';
import { createLayout } from './layout.js';
import { createPanel } from './panel.js';
import { diceFaces, isComputerTurn, primaryAction, sourcesOf, targetsOf, turnTrail } from './presenter.js';
import { load, save } from './storage.js';
import { createBoardView } from './view.js';

/** Narrow, tall screens get the board turned on its side. */
const PORTRAIT_QUERY = '(max-width: 700px) and (max-aspect-ratio: 3/4)';
/** Pauses (ms) in the computer's turn so a person can follow it. */
const PAUSE = { roll: 650, step: 520, confirm: 650 };

const ui = { root: null, view: null, panel: null };
const app = {
  lang: 'en',
  settings: { mode: 'ai', level: 'normal' },
  game: null,
  selected: null,
  cursor: null,
  keyboard: false,
  toggleOnRelease: false,
  token: 0,
};

function main() {
  ui.root = document.getElementById('board');
  ui.view = createBoardView(ui.root);
  ui.panel = createPanel(document, {
    newGame: () => ui.panel.openDialog(app.settings),
    toggleLanguage,
    undo,
    primary: runPrimary,
    start: startNewGame,
  });
  app.lang = readLanguage();
  app.settings = readSettings();
  ui.panel.setLanguage(app.lang);
  watchOrientation();
  bindPointer(ui.root, ui.view, pointerHandlers);
  bindKeyboard(document, runCommand);
  const demo = new URLSearchParams(window.location.search).has('demo');
  startGame(demo ? createDemoGame() : createGame(app.settings));
}

function readLanguage() {
  const saved = load('lang');
  return isLanguage(saved) ? saved : 'en';
}

function readSettings() {
  return { mode: load('mode') === 'pvp' ? 'pvp' : 'ai', level: load('level') === 'easy' ? 'easy' : 'normal' };
}

function watchOrientation() {
  const query = window.matchMedia(PORTRAIT_QUERY);
  const apply = () => {
    const layout = createLayout(query.matches);
    ui.view.setLayout(layout);
    ui.root.parentElement.style.setProperty('--board-w', String(layout.width));
    ui.root.parentElement.style.setProperty('--board-h', String(layout.height));
    if (app.game) refresh();
  };
  query.addEventListener('change', apply);
  apply();
}

function startNewGame(settings) {
  app.settings = { mode: settings.mode === 'pvp' ? 'pvp' : 'ai', level: settings.level === 'easy' ? 'easy' : 'normal' };
  save('mode', app.settings.mode);
  save('level', app.settings.level);
  startGame(createGame(app.settings));
}

function startGame(game) {
  app.token += 1;
  app.game = game;
  app.selected = null;
  app.cursor = null;
  autoSelect();
  refresh({ rolled: true });
  continueGame();
}

function toggleLanguage() {
  app.lang = app.lang === 'en' ? 'tr' : 'en';
  save('lang', app.lang);
  ui.panel.setLanguage(app.lang);
  refresh();
}

/** Draws the board and the panel for the current state. */
function refresh(effects = {}) {
  const state = app.game.getState();
  const steps = humanSteps(state);
  const sources = sourcesOf(steps, state.current);
  if (!sources.includes(app.selected)) app.selected = null;
  const targets = app.selected === null ? [] : targetsOf(steps, app.selected, state.current);
  const options = app.selected === null ? sources : targets.map((target) => target.to);
  if (!options.includes(app.cursor)) app.cursor = app.keyboard ? (options[0] ?? null) : null;
  const showTrail = state.phase !== 'move' || state.played.length === 0;
  ui.view.render(
    {
      board: state.board,
      mover: state.current,
      dice: state.phase === 'move' ? { player: state.current, faces: diceFaces(state) } : null,
      sources,
      selected: app.selected,
      targets,
      cursor: app.cursor,
      trail: showTrail ? turnTrail(state.lastTurn) : null,
    },
    effects,
  );
  ui.panel.update(state, { canUndo: state.canUndo && !isComputerTurn(state) });
}

/** Steps the person at the board may play now (none during the computer's turn). */
function humanSteps(state) {
  return state.phase === 'move' && !isComputerTurn(state) ? app.game.legalSteps() : [];
}

function cursorOptions() {
  const state = app.game.getState();
  const steps = humanSteps(state);
  if (app.selected === null) return sourcesOf(steps, state.current);
  return targetsOf(steps, app.selected, state.current).map((target) => target.to);
}

function isTarget(location) {
  if (app.selected === null || location === null) return false;
  const state = app.game.getState();
  return targetsOf(humanSteps(state), app.selected, state.current).some((target) => target.to === location);
}

/** Selects the only checker that can move, so its targets show at once. */
function autoSelect() {
  const state = app.game.getState();
  const sources = sourcesOf(humanSteps(state), state.current);
  if (sources.length === 1) app.selected = sources[0];
}

/**
 * Plays one step and animates it (from the drop point after a drag).
 * @returns {boolean} true when the step was legal
 */
function playMove(from, to, { die, dropPoint } = {}) {
  const before = app.game.getState();
  const player = before.current;
  const start = dropPoint ?? ui.view.stackTop(before.board, player, from);
  const step = app.game.move(from, to, die);
  if (step === null) return false;
  const slides = [{ player, location: to, from: start }];
  if (step.hit) {
    slides.push({ player: opponent(player), location: BAR, from: ui.view.stackTop(before.board, opponent(player), to) });
  }
  app.selected = null;
  autoSelect();
  refresh({ slides });
  return true;
}

function undo() {
  const before = app.game.getState();
  if (!before.canUndo || isComputerTurn(before)) return false;
  const step = before.played[before.played.length - 1];
  const player = before.current;
  const slides = [{ player, location: step.from, from: ui.view.stackTop(before.board, player, step.to) }];
  if (step.hit) {
    slides.push({ player: opponent(player), location: step.to, from: ui.view.stackTop(before.board, opponent(player), BAR) });
  }
  app.game.undo();
  app.selected = null;
  autoSelect();
  refresh({ slides });
  return true;
}

function roll() {
  const state = app.game.getState();
  if (state.phase !== 'roll' || isComputerTurn(state)) return false;
  app.game.roll();
  autoSelect();
  refresh({ rolled: true });
  return true;
}

function confirmTurn() {
  if (isComputerTurn(app.game.getState()) || !app.game.confirm()) return false;
  app.selected = null;
  app.cursor = null;
  refresh();
  continueGame();
  return true;
}

function runPrimary(action) {
  if (action === 'roll') return roll();
  if (action === 'confirm' || action === 'pass') return confirmTurn();
  if (action === 'playAgain') {
    startGame(createGame(app.settings));
    return true;
  }
  return false;
}

function continueGame() {
  if (isComputerTurn(app.game.getState())) playComputerTurn(app.token);
}

/** Rolls, plays the computer's chosen steps one by one and confirms; stops if a new game starts. */
async function playComputerTurn(token) {
  const game = app.game;
  const alive = () => token === app.token;
  if (game.getState().phase === 'roll') {
    if (!(await pause(PAUSE.roll, alive))) return;
    game.roll();
    refresh({ rolled: true });
  }
  for (const step of game.aiSteps()) {
    if (!(await pause(PAUSE.step, alive))) return;
    const before = game.getState();
    game.move(step.from, step.to, step.die);
    const slides = [{ player: before.current, location: step.to, from: ui.view.stackTop(before.board, before.current, step.from) }];
    if (step.hit) {
      const other = opponent(before.current);
      slides.push({ player: other, location: BAR, from: ui.view.stackTop(before.board, other, step.to) });
    }
    refresh({ slides });
  }
  if (!(await pause(PAUSE.confirm, alive))) return;
  game.confirm();
  refresh();
  continueGame();
}

function pause(ms, alive) {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(alive()), ms);
  });
}

const pointerHandlers = {
  press(location) {
    app.keyboard = false;
    app.cursor = null;
    const state = app.game.getState();
    if (location === null || humanSteps(state).length === 0) return false;
    if (isTarget(location)) {
      playMove(app.selected, location);
      return false;
    }
    if (sourcesOf(humanSteps(state), state.current).includes(location)) {
      app.toggleOnRelease = app.selected === location;
      app.selected = location;
      refresh();
      return true;
    }
    if (app.selected !== null) {
      app.selected = null;
      refresh();
    }
    return false;
  },
  release(location) {
    if (app.toggleOnRelease && app.selected === location) {
      app.selected = null;
      refresh();
    }
    app.toggleOnRelease = false;
  },
  dragStart(location, point) {
    app.toggleOnRelease = false;
    ui.root.classList.add('is-dragging');
    ui.view.startDrag(app.game.getState().current, location, point);
  },
  dragMove(point, location) {
    ui.view.moveDrag(point, isTarget(location) ? location : null);
  },
  drop(from, location, point) {
    endDrag();
    if (!isTarget(location) || !playMove(from, location, { dropPoint: point })) refresh();
  },
  cancel() {
    endDrag();
    refresh();
  },
  hover(location) {
    const state = app.game.getState();
    const movable = sourcesOf(humanSteps(state), state.current).includes(location);
    ui.root.classList.toggle('is-pointing', movable || isTarget(location));
  },
};

function endDrag() {
  ui.root.classList.remove('is-dragging');
  ui.view.endDrag();
}

/** Keyboard commands from input.js; returns true when something happened. */
function runCommand(command) {
  app.keyboard = true;
  switch (command.name) {
    case 'newGame':
      ui.panel.openDialog(app.settings);
      return true;
    case 'roll':
      return roll();
    case 'undo':
      return undo();
    case 'next':
      return moveCursor(1);
    case 'prev':
      return moveCursor(-1);
    case 'activate':
      return activate();
    case 'cancel':
      return cancelSelection();
    case 'die':
      return playDie(command.value);
    default:
      return false;
  }
}

function moveCursor(direction) {
  const options = cursorOptions();
  if (options.length === 0) return false;
  const index = options.indexOf(app.cursor);
  if (index < 0) app.cursor = direction > 0 ? options[0] : options[options.length - 1];
  else app.cursor = options[(index + direction + options.length) % options.length];
  refresh();
  return true;
}

/** Enter/Space: play or pick what the cursor is on, otherwise press the main button. */
function activate() {
  if (app.cursor !== null && app.selected !== null) return playMove(app.selected, app.cursor);
  if (app.cursor !== null) {
    app.selected = app.cursor;
    app.cursor = null;
    refresh();
    return true;
  }
  const { action, enabled } = primaryAction(app.game.getState());
  if (enabled) return runPrimary(action);
  refresh();
  return app.cursor !== null;
}

/** Esc: put the chosen checker back; the cursor stays on it. */
function cancelSelection() {
  if (app.selected === null) return false;
  app.cursor = app.selected;
  app.selected = null;
  refresh();
  return true;
}

/** Number keys move the chosen checker by that die. */
function playDie(value) {
  const from = app.selected ?? app.cursor;
  if (from === null) return false;
  const step = humanSteps(app.game.getState()).find((option) => option.from === from && option.die === value);
  return step ? playMove(step.from, step.to, { die: value }) : false;
}

main();
