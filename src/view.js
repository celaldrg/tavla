/**
 * SVG drawing of the board: frame, points, bar, trays, checkers, dice, the
 * highlights for legal moves and the short move animations. UI module: it uses
 * the DOM but knows no rules; all geometry comes from layout.js.
 */
import { BAR, BLACK, OFF, POINT_COUNT, WHITE, checkersAt } from './board.js';
import { BAR_LIMIT, CHECKER_RADIUS, DIE_SIZE, STACK_LIMIT, pointTone } from './layout.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SLIDE_MS = 240;
const ROLL_MS = 250;
const EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const PIP_OFFSET = 11.5;
const PIP_RADIUS = 4.6;
/** Pip positions on a die face, in steps of PIP_OFFSET from the centre. */
const PIPS = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};
const LAYERS = ['base', 'hints', 'checkers', 'marks', 'dice', 'float'];

/**
 * What the board shows; built by main.js from the game state.
 * @typedef {Object} BoardModel
 * @property {import('./board.js').Board} board
 * @property {number} mover - player whose movable checkers and targets are shown
 * @property {{player: number, faces: {value: number, used: boolean}[]}|null} dice
 * @property {(number|string)[]} sources - locations with a checker that may move
 * @property {number|string|null} selected - the chosen source
 * @property {{to: number|string, hit: boolean}[]} targets - where the chosen checker may go
 * @property {number|string|null} cursor - keyboard cursor
 * @property {ReturnType<import('./presenter.js').turnTrail>} trail - the previous turn
 */

/**
 * A checker to animate after drawing: the top checker of `player` at `location`
 * slides in from `from` (board units); for OFF a checker flies into the tray.
 * @typedef {{player: number, location: number|string, from: number[]}} Slide
 */

/**
 * Sets up the board inside an <svg> element.
 * @param {SVGSVGElement} root
 * @returns {{
 *   setLayout: (layout: import('./layout.js').BoardLayout) => void,
 *   render: (model: BoardModel, effects?: {slides?: Slide[], rolled?: boolean}) => void,
 *   locate: (clientX: number, clientY: number) => {point: number[], location: number|string|null}|null,
 *   stackTop: (board: import('./board.js').Board, player: number, location: number|string) => number[],
 *   startDrag: (player: number, location: number|string, point: number[]) => void,
 *   moveDrag: (point: number[], hover: number|string|null) => void,
 *   endDrag: () => void,
 * }}
 */
export function createBoardView(root) {
  createDefs(root);
  const layers = {};
  for (const name of LAYERS) layers[name] = svg('g', { class: `layer layer-${name}` }, root);
  const topCheckers = new Map();
  const targetShapes = new Map();
  let layout = null;
  let ghost = null;

  function render(model, effects = {}) {
    drawHints(layers.hints, layout, model, targetShapes);
    drawCheckers(layers.checkers, layout, model.board, topCheckers);
    drawMarks(layers.marks, layout, model);
    drawDice(layers.dice, layout, model.dice, effects.rolled);
    if (!reducedMotion()) {
      for (const slide of effects.slides ?? []) playSlide(slide, model.board);
    }
  }

  function playSlide({ player, location, from }, board) {
    const to = layout.stackTop(board, player, location);
    if (location === OFF) {
      const flyer = drawChecker(layers.float, player, to, '');
      const animation = flyer.animate(
        [{ transform: translate(from), opacity: 1 }, { transform: translate(to), opacity: 0 }],
        { duration: SLIDE_MS, easing: EASING },
      );
      animation.onfinish = () => flyer.remove();
      return;
    }
    const checker = topCheckers.get(stackKey(player, location));
    if (checker) checker.animate([{ transform: translate(from) }, { transform: translate(to) }], { duration: SLIDE_MS, easing: EASING });
  }

  return {
    setLayout(next) {
      layout = next;
      root.setAttribute('viewBox', `0 0 ${next.width} ${next.height}`);
      drawBase(layers.base, next);
    },
    render,
    locate(clientX, clientY) {
      const matrix = root.getScreenCTM();
      if (!matrix || !layout) return null;
      const { x, y } = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
      return { point: [x, y], location: layout.locate(x, y) };
    },
    stackTop: (board, player, location) => layout.stackTop(board, player, location),
    startDrag(player, location, point) {
      topCheckers.get(stackKey(player, location))?.classList.add('is-lifted');
      ghost = drawChecker(layers.float, player, point, '');
      ghost.classList.add('is-dragging');
    },
    moveDrag(point, hover) {
      ghost?.setAttribute('transform', `translate(${point[0]} ${point[1]})`);
      for (const [location, shape] of targetShapes) shape.classList.toggle('is-hover', location === hover);
    },
    endDrag() {
      ghost?.remove();
      ghost = null;
    },
  };
}

function drawBase(layer, layout) {
  clear(layer);
  svg('rect', { ...rectAttributes(layout.outline), rx: 12, class: 'board-frame' }, layer);
  for (const field of layout.fields) svg('rect', { ...rectAttributes(field), class: 'board-field' }, layer);
  svg('rect', { ...rectAttributes(layout.bar), class: 'board-bar' }, layer);
  for (const player of [WHITE, BLACK]) svg('rect', { ...rectAttributes(layout.tray(player)), rx: 8, class: 'board-tray' }, layer);
  for (let index = 0; index < POINT_COUNT; index++) {
    svg('polygon', { points: polygonPoints(layout.triangle(index)), class: `point tone-${pointTone(index)}` }, layer);
  }
  for (const field of layout.fields) svg('rect', { ...rectAttributes(field), class: 'board-edge' }, layer);
}

function drawHints(layer, layout, { board, mover, targets, cursor, trail }, targetShapes) {
  clear(layer);
  targetShapes.clear();
  for (const { to, hit } of targets) {
    const shape = to === OFF
      ? svg('rect', { ...rectAttributes(layout.area(OFF, mover)), rx: 8 }, layer)
      : svg('polygon', { points: polygonPoints(layout.triangle(to)) }, layer);
    shape.setAttribute('class', hit ? 'target is-hit' : 'target');
    targetShapes.set(to, shape);
  }
  if (trail) {
    for (const [index, count] of trail.departures) {
      const start = checkersAt(board, trail.player, index);
      for (let slot = start; slot < Math.min(start + count, STACK_LIMIT); slot++) {
        circle(layer, layout.checker(index, slot), CHECKER_RADIUS - 3, 'trail-ghost');
      }
    }
  }
  if (cursor !== null) {
    const area = layout.area(cursor, mover);
    svg('rect', { x: area.x + 3, y: area.y + 3, width: area.width - 6, height: area.height - 6, rx: 10, class: 'cursor' }, layer);
  }
}

function drawCheckers(layer, layout, board, topCheckers) {
  clear(layer);
  topCheckers.clear();
  for (const player of [WHITE, BLACK]) {
    for (let index = 0; index < POINT_COUNT; index++) {
      const count = checkersAt(board, player, index);
      if (count > 0) {
        const top = drawStack(layer, player, count, STACK_LIMIT, (slot) => layout.checker(index, slot));
        topCheckers.set(stackKey(player, index), top);
      }
    }
    if (board.bar[player] > 0) {
      const top = drawStack(layer, player, board.bar[player], BAR_LIMIT, (slot) => layout.barChecker(player, slot));
      topCheckers.set(stackKey(player, BAR), top);
    }
    for (let slot = 0; slot < board.off[player]; slot++) {
      svg('rect', { ...rectAttributes(layout.sliver(player, slot)), rx: 4, class: `sliver ${sideClass(player)}` }, layer);
    }
  }
}

/** Draws up to `limit` checkers; a taller stack shows its size on the top one. Returns the top one. */
function drawStack(layer, player, count, limit, spotOf) {
  const shown = Math.min(count, limit);
  let top = null;
  for (let slot = 0; slot < shown; slot++) {
    const label = slot === shown - 1 && count > limit ? String(count) : '';
    top = drawChecker(layer, player, spotOf(slot), label);
  }
  return top;
}

function drawMarks(layer, layout, { board, mover, sources, selected, targets, trail }) {
  clear(layer);
  if (trail) {
    for (const [index, count] of trail.arrivals) {
      const shown = Math.min(checkersAt(board, trail.player, index), STACK_LIMIT);
      for (let slot = Math.max(0, shown - count); slot < shown; slot++) {
        circle(layer, layout.checker(index, slot), CHECKER_RADIUS + 1, 'ring-arrival');
      }
    }
  }
  for (const location of sources) {
    const kind = location === selected ? 'ring-selected' : 'ring-movable';
    circle(layer, layout.stackTop(board, mover, location), CHECKER_RADIUS + 2, kind);
  }
  for (const { to, hit } of targets) {
    if (to !== OFF) circle(layer, layout.stackTop(board, mover, to, true), CHECKER_RADIUS - 1, hit ? 'ring-landing is-hit' : 'ring-landing');
  }
}

function drawDice(layer, layout, dice, rolled) {
  clear(layer);
  if (!dice || dice.faces.length === 0) return;
  const spots = layout.dice(dice.player, dice.faces.length);
  dice.faces.forEach((face, index) => {
    const die = drawDie(layer, face.value, spots[index], face.used);
    if (rolled && !reducedMotion()) {
      die.animate(
        [
          { transform: `${translate(spots[index])} rotate(-200deg) scale(0.4)`, opacity: 0 },
          { transform: `${translate(spots[index])} rotate(0deg) scale(1)`, opacity: face.used ? 0.35 : 1 },
        ],
        { duration: ROLL_MS, easing: EASING },
      );
    }
  });
}

function drawDie(layer, value, [x, y], used) {
  const die = svg('g', { class: used ? 'die is-used' : 'die', transform: `translate(${x} ${y})` }, layer);
  svg('rect', { x: -DIE_SIZE / 2, y: -DIE_SIZE / 2, width: DIE_SIZE, height: DIE_SIZE, rx: 9, class: 'die-face' }, die);
  for (const [dx, dy] of PIPS[value]) {
    svg('circle', { cx: dx * PIP_OFFSET, cy: dy * PIP_OFFSET, r: PIP_RADIUS, class: 'die-pip' }, die);
  }
  return die;
}

function drawChecker(layer, player, [x, y], label) {
  const checker = svg('g', { class: `checker ${sideClass(player)}`, transform: `translate(${x} ${y})` }, layer);
  svg('circle', { r: CHECKER_RADIUS, class: 'checker-body' }, checker);
  svg('circle', { r: CHECKER_RADIUS * 0.62, class: 'checker-ring' }, checker);
  if (label) {
    const text = svg('text', { class: 'checker-count', 'text-anchor': 'middle', dy: '0.35em' }, checker);
    text.textContent = label;
  }
  return checker;
}

function createDefs(root) {
  const defs = svg('defs', {}, root);
  gradient(defs, 'linearGradient', 'tv-wood', { x1: 0, y1: 0, x2: 1, y2: 1 }, [[0, '#5d3a21'], [0.55, '#4a2c18'], [1, '#382111']]);
  gradient(defs, 'linearGradient', 'tv-field', { x1: 0, y1: 0, x2: 1, y2: 1 }, [[0, '#7b4f2c'], [1, '#66401f']]);
  gradient(defs, 'radialGradient', 'tv-white', { cx: 0.38, cy: 0.34, r: 0.78 }, [[0, '#fffdf8'], [0.6, '#f1e5cd'], [1, '#d6c19c']]);
  gradient(defs, 'radialGradient', 'tv-black', { cx: 0.38, cy: 0.34, r: 0.78 }, [[0, '#6a4b37'], [0.6, '#36241a'], [1, '#1a110b']]);
  gradient(defs, 'linearGradient', 'tv-die', { x1: 0, y1: 0, x2: 1, y2: 1 }, [[0, '#fffdf8'], [1, '#e9dbc0']]);
  const filter = svg('filter', { id: 'tv-shadow', x: '-40%', y: '-40%', width: '180%', height: '180%' }, defs);
  svg('feDropShadow', { dx: 0, dy: 2.5, stdDeviation: 2.4, 'flood-color': '#000000', 'flood-opacity': 0.45 }, filter);
}

function gradient(defs, kind, id, attributes, stops) {
  const element = svg(kind, { id, ...attributes }, defs);
  for (const [offset, color] of stops) svg('stop', { offset, 'stop-color': color }, element);
}

function circle(layer, [cx, cy], r, className) {
  return svg('circle', { cx, cy, r, class: className }, layer);
}

function svg(name, attributes, parent) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [attribute, value] of Object.entries(attributes)) element.setAttribute(attribute, String(value));
  parent.appendChild(element);
  return element;
}

function clear(layer) {
  layer.replaceChildren();
}

function rectAttributes({ x, y, width, height }) {
  return { x, y, width, height };
}

function polygonPoints(corners) {
  return corners.map(([x, y]) => `${x},${y}`).join(' ');
}

function translate([x, y]) {
  return `translate(${x}px, ${y}px)`;
}

function sideClass(player) {
  return player === WHITE ? 'is-white' : 'is-black';
}

function stackKey(player, location) {
  return `${player}:${location}`;
}

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
