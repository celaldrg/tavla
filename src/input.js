/**
 * Pointer and keyboard input. Pointer events cover mouse, pen and touch: a press
 * on the board is reported at once, a press that travels further than DRAG_SLOP
 * becomes a drag, and the release reports where it was dropped. UI module apart
 * from keyCommand, which is pure.
 */

/** Pixels a pointer may move before a press counts as a drag. */
const DRAG_SLOP = 6;

/** Keys without modifiers and the command each one sends. */
const KEYS = {
  ArrowLeft: 'prev',
  ArrowUp: 'prev',
  ArrowRight: 'next',
  ArrowDown: 'next',
  Enter: 'activate',
  ' ': 'activate',
  Escape: 'cancel',
  r: 'roll',
  u: 'undo',
  Backspace: 'undo',
  n: 'newGame',
};

/**
 * @typedef {Object} Command
 * @property {string} name - 'prev', 'next', 'activate', 'cancel', 'roll', 'undo', 'newGame' or 'die'
 * @property {number} [value] - the die value for 'die'
 */

/**
 * Maps a key press to a game command.
 * @param {string} key - KeyboardEvent.key
 * @param {{ctrl?: boolean, alt?: boolean, onControl?: boolean}} [context] - ctrl is Ctrl or Cmd;
 *   onControl is true when a button, link or form field has the focus
 * @returns {Command|null}
 */
export function keyCommand(key, context = {}) {
  if (context.alt) return null;
  if (context.ctrl) return key.toLowerCase() === 'z' ? { name: 'undo' } : null;
  if (context.onControl && (key === 'Enter' || key === ' ')) return null;
  if (/^[1-6]$/.test(key)) return { name: 'die', value: Number(key) };
  const name = KEYS[key] ?? KEYS[key.toLowerCase()];
  return name ? { name } : null;
}

/**
 * Reports presses, taps and drags on the board.
 * @param {SVGSVGElement} root - the board element
 * @param {{locate: (clientX: number, clientY: number) => {point: number[], location: number|string|null}|null}} view
 * @param {Object} handlers
 * @param {(location: number|string|null) => boolean} handlers.press - a press began; return true to allow a drag
 * @param {(location: number|string) => void} handlers.release - the press ended without a drag
 * @param {(location: number|string, point: number[]) => void} handlers.dragStart
 * @param {(point: number[], location: number|string|null) => void} handlers.dragMove
 * @param {(from: number|string, location: number|string|null, point: number[]|null) => void} handlers.drop
 * @param {() => void} handlers.cancel - the drag was interrupted
 * @param {(location: number|string|null) => void} handlers.hover - a pointer moved without pressing
 */
export function bindPointer(root, view, handlers) {
  let drag = null;
  root.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0 || drag) return;
    const hit = view.locate(event.clientX, event.clientY);
    if (!hit) return;
    event.preventDefault();
    if (!handlers.press(hit.location)) return;
    drag = { id: event.pointerId, location: hit.location, x: event.clientX, y: event.clientY, active: false };
    root.setPointerCapture(event.pointerId);
  });
  root.addEventListener('pointermove', (event) => {
    const hit = view.locate(event.clientX, event.clientY);
    if (!hit) return;
    if (!drag || event.pointerId !== drag.id) {
      handlers.hover(hit.location);
      return;
    }
    if (!drag.active) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < DRAG_SLOP) return;
      drag.active = true;
      handlers.dragStart(drag.location, hit.point);
    }
    handlers.dragMove(hit.point, hit.location);
  });
  root.addEventListener('pointerup', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const { active, location } = drag;
    drag = null;
    const hit = view.locate(event.clientX, event.clientY);
    if (active) handlers.drop(location, hit?.location ?? null, hit?.point ?? null);
    else handlers.release(location);
  });
  root.addEventListener('pointercancel', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const { active } = drag;
    drag = null;
    if (active) handlers.cancel();
  });
  root.addEventListener('contextmenu', (event) => event.preventDefault());
}

/**
 * Sends keyboard commands. Keys are ignored while a dialog is open, and Enter or
 * Space on a focused button keep their usual meaning.
 * @param {Document} doc
 * @param {(command: Command) => boolean} run - returns true when the command did something
 */
export function bindKeyboard(doc, run) {
  doc.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || doc.querySelector('dialog[open]')) return;
    const target = event.target;
    const onControl = target instanceof Element && target.closest('button, a, input, select, textarea') !== null;
    const command = keyCommand(event.key, { ctrl: event.ctrlKey || event.metaKey, alt: event.altKey, onControl });
    if (command && run(command)) event.preventDefault();
  });
}
