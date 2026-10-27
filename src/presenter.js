/**
 * Turns a game state into what the screen shows: the status line, the result,
 * the main button, the dice faces, the movable checkers in a stable order and
 * the trail of the previous turn. Pure module: messages are i18n keys plus
 * parameters, translated by the UI.
 */
import { BAR, OFF, WHITE, pipDistance } from './board.js';

/**
 * True when the computer plays the current turn.
 * @param {import('./game.js').GameState} state
 * @returns {boolean}
 */
export function isComputerTurn(state) {
  return state.mode === 'ai' && state.phase !== 'over' && state.current !== state.human;
}

/**
 * i18n key of a player's name: 'you'/'computer' against the computer, 'white'/'black' otherwise.
 * @param {import('./game.js').GameState} state
 * @param {number} player
 * @returns {string}
 */
export function playerKey(state, player) {
  if (state.mode === 'ai') return player === state.human ? 'you' : 'computer';
  return player === WHITE ? 'white' : 'black';
}

/**
 * A roll written the usual way, higher die first: "6-4".
 * @param {number[]} dice - the two rolled values
 * @returns {string}
 */
export function formatDice(dice) {
  return `${Math.max(dice[0], dice[1])}-${Math.min(dice[0], dice[1])}`;
}

/**
 * The status line for a state.
 * @param {import('./game.js').GameState} state
 * @returns {import('./i18n.js').Message}
 */
export function statusMessage(state) {
  if (state.phase === 'over') return { key: 'gameOver', params: resultMessage(state) };
  const dice = state.dice ? formatDice(state.dice) : '';
  return isComputerTurn(state) ? computerStatus(state, dice) : humanStatus(state, dice);
}

/**
 * Title and detail of a finished game; mars (gammon) counts double.
 * @param {import('./game.js').GameState} state - a state in the 'over' phase
 * @returns {{title: import('./i18n.js').Message, detail: import('./i18n.js').Message}}
 */
export function resultMessage(state) {
  const { winner, mars } = state.result;
  let title = { key: 'winPlayer', params: { name: { key: playerKey(state, winner) } } };
  if (state.mode === 'ai') title = { key: winner === state.human ? 'winYou' : 'winComputer' };
  return { title, detail: { key: mars ? 'resultMars' : 'resultSingle' } };
}

/**
 * The main button: what it does now and whether it can be pressed.
 * @param {import('./game.js').GameState} state
 * @returns {{action: string, enabled: boolean}} action is 'roll', 'confirm', 'pass' or 'playAgain'
 */
export function primaryAction(state) {
  if (state.phase === 'over') return { action: 'playAgain', enabled: true };
  const human = !isComputerTurn(state);
  if (state.phase === 'roll') return { action: 'roll', enabled: human };
  return { action: state.noMoves ? 'pass' : 'confirm', enabled: human && state.complete };
}

/**
 * The dice to draw for the turn being played, marking the ones already used.
 * @param {import('./game.js').GameState} state
 * @returns {{value: number, used: boolean}[]} two faces, four for a double, none outside a turn
 */
export function diceFaces(state) {
  if (state.phase !== 'move' || !state.dice) return [];
  const [first, second] = state.dice;
  const faces = first === second ? [first, first, first, first] : [first, second];
  const unused = [...state.remaining];
  return faces.map((value) => {
    const index = unused.indexOf(value);
    if (index >= 0) unused.splice(index, 1);
    return { value, used: index < 0 };
  });
}

/**
 * Locations that have a checker which may move, furthest from home first (the bar leads).
 * @param {import('./rules.js').Step[]} steps - the steps allowed now
 * @param {number} player - the mover
 * @returns {(number|string)[]}
 */
export function sourcesOf(steps, player) {
  return orderLocations([...new Set(steps.map((step) => step.from))], player);
}

/**
 * Where a checker from `from` may go, furthest from home first (bearing off last).
 * @param {import('./rules.js').Step[]} steps - the steps allowed now
 * @param {number|string} from - a point index or BAR
 * @param {number} player - the mover
 * @returns {{to: number|string, hit: boolean}[]}
 */
export function targetsOf(steps, from, player) {
  const hits = new Map();
  for (const step of steps) if (step.from === from) hits.set(step.to, step.hit);
  return orderLocations([...hits.keys()], player).map((to) => ({ to, hit: hits.get(to) }));
}

/**
 * Net effect of a turn on the board for drawing hints: points that lost checkers
 * and points that gained them (the bar and the trays are left out).
 * @param {{player: number, steps: import('./rules.js').Step[]}|null} turn - a played turn
 * @returns {{player: number, departures: Map<number, number>, arrivals: Map<number, number>}|null}
 */
export function turnTrail(turn) {
  if (!turn || turn.steps.length === 0) return null;
  const net = new Map();
  const add = (location, amount) => {
    if (typeof location === 'number') net.set(location, (net.get(location) ?? 0) + amount);
  };
  for (const step of turn.steps) {
    add(step.from, -1);
    add(step.to, 1);
  }
  const departures = new Map();
  const arrivals = new Map();
  for (const [index, amount] of net) {
    if (amount < 0) departures.set(index, -amount);
    if (amount > 0) arrivals.set(index, amount);
  }
  return { player: turn.player, departures, arrivals };
}

function orderLocations(locations, player) {
  const rank = (location) => {
    if (location === BAR) return 25;
    if (location === OFF) return 0;
    return pipDistance(player, location);
  };
  return locations.sort((a, b) => rank(b) - rank(a));
}

function computerStatus(state, dice) {
  if (state.phase === 'roll') return { key: 'aiRolling' };
  if (state.noMoves) return { key: 'aiNoMoves', params: { dice } };
  if (isOpening(state)) return { key: 'openingComputer', params: { dice } };
  return { key: 'aiPlaying', params: { dice } };
}

function humanStatus(state, dice) {
  const name = { key: playerKey(state, state.current) };
  if (isOpening(state)) {
    return state.mode === 'ai'
      ? { key: 'openingYou', params: { dice } }
      : { key: 'openingPlayer', params: { name, dice } };
  }
  let message = humanPrompt(state, dice);
  if (state.played.length > 0 && state.played[state.played.length - 1].hit) {
    message = { key: 'hitPrefix', params: { text: message } };
  }
  if (state.mode === 'pvp') return { key: 'named', params: { name, text: message } };
  return withComputerNote(state, message);
}

function humanPrompt(state, dice) {
  if (state.phase === 'roll') return { key: 'rollPrompt' };
  if (state.noMoves) return { key: 'noMoves', params: { dice } };
  if (state.complete) return { key: 'confirmPrompt' };
  if (state.board.bar[state.current] > 0) return { key: 'enterPrompt', params: { dice } };
  return { key: 'movePrompt', params: { dice } };
}

/** Before the human rolls, say what the computer just did. */
function withComputerNote(state, message) {
  const last = state.lastTurn;
  if (state.phase !== 'roll' || !last || last.player === state.human) return message;
  if (last.steps.some((step) => step.hit)) return { key: 'aiHit', params: { text: message } };
  const key = last.steps.length === 0 ? 'aiPassed' : 'aiPlayed';
  return { key, params: { dice: formatDice(last.dice), text: message } };
}

function isOpening(state) {
  return state.phase === 'move' && state.opening !== null && state.lastTurn === null && state.played.length === 0;
}
