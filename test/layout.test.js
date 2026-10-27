import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAR, BLACK, OFF, POINT_COUNT, WHITE, createBoard, startingBoard } from '../src/board.js';
import { BAR_LIMIT, CHECKER_RADIUS, STACK_LIMIT, createLayout, pointTone } from '../src/layout.js';

const LAYOUTS = [createLayout(false), createLayout(true)];

function inside([x, y], rect) {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function overlaps(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function centre(rect) {
  return [rect.x + rect.width / 2, rect.y + rect.height / 2];
}

test('the portrait board is the landscape board turned on its side', () => {
  const [landscape, portrait] = LAYOUTS;
  assert.deepEqual([landscape.width, landscape.height], [822, 588]);
  assert.deepEqual([portrait.width, portrait.height], [588, 822]);
  for (let index = 0; index < POINT_COUNT; index++) {
    const [x, y] = landscape.checker(index, 2);
    assert.deepEqual(portrait.checker(index, 2), [y, x]);
  }
});

test('neighbouring and facing points have different colours', () => {
  for (let index = 0; index < POINT_COUNT; index++) {
    assert.ok([0, 1].includes(pointTone(index)));
    if (index % 12 !== 11) assert.notEqual(pointTone(index), pointTone(index + 1));
    assert.notEqual(pointTone(index), pointTone(23 - index));
  }
});

test('every checker spot hits its own point and stays on the board', () => {
  for (const layout of LAYOUTS) {
    for (let index = 0; index < POINT_COUNT; index++) {
      const area = layout.area(index, WHITE);
      for (let slot = 0; slot < STACK_LIMIT; slot++) {
        const spot = layout.checker(index, slot);
        assert.equal(layout.locate(...spot), index, `point ${index} slot ${slot}`);
        assert.ok(inside(spot, area));
      }
      for (const corner of layout.triangle(index)) assert.ok(inside(corner, area));
    }
  }
});

test('the bar, the trays and the outside are found by position', () => {
  for (const layout of LAYOUTS) {
    for (const player of [WHITE, BLACK]) {
      for (let slot = 0; slot < BAR_LIMIT; slot++) {
        const spot = layout.barChecker(player, slot);
        assert.equal(layout.locate(...spot), BAR);
        assert.ok(inside(spot, layout.area(BAR, player)));
      }
      assert.equal(layout.locate(...centre(layout.tray(player))), OFF);
      assert.ok(inside(centre(layout.sliver(player, 14)), layout.tray(player)), 'all 15 checkers fit in the tray');
    }
    assert.ok(!overlaps(layout.tray(WHITE), layout.tray(BLACK)));
    assert.ok(!overlaps(layout.area(BAR, WHITE), layout.area(BAR, BLACK)));
    assert.equal(layout.locate(-1, 10), null);
    assert.equal(layout.locate(10, layout.height + 1), null);
  }
});

test('stackTop gives the top checker, or the next free spot, capped at the drawn stack', () => {
  const board = startingBoard();
  for (const layout of LAYOUTS) {
    assert.deepEqual(layout.stackTop(board, WHITE, 23), layout.checker(23, 1));
    assert.deepEqual(layout.stackTop(board, WHITE, 23, true), layout.checker(23, 2));
    assert.deepEqual(layout.stackTop(board, WHITE, 5), layout.checker(5, STACK_LIMIT - 1));
    assert.deepEqual(layout.stackTop(board, WHITE, 5, true), layout.checker(5, STACK_LIMIT - 1));
    assert.deepEqual(layout.stackTop(board, BLACK, 10, true), layout.checker(10, 0));
    assert.deepEqual(layout.stackTop(board, WHITE, OFF, true), centre(layout.sliver(WHITE, 0)));
  }
  const busy = createBoard({ white: { 0: 5 }, black: { 23: 5 }, bar: [6, 0], off: [4, 10] });
  for (const layout of LAYOUTS) {
    assert.deepEqual(layout.stackTop(busy, WHITE, BAR), layout.barChecker(WHITE, BAR_LIMIT - 1));
    assert.deepEqual(layout.stackTop(busy, BLACK, OFF), centre(layout.sliver(BLACK, 9)));
  }
});

test('dice sit on the board, side by side without touching the checkers on the bar', () => {
  for (const layout of LAYOUTS) {
    for (const player of [WHITE, BLACK]) {
      for (const count of [2, 4]) {
        const spots = layout.dice(player, count);
        assert.equal(spots.length, count);
        for (const spot of spots) {
          const location = layout.locate(...spot);
          assert.equal(typeof location, 'number', 'dice lie on the playing field');
          assert.ok(!inside(spot, layout.bar));
        }
        for (let die = 1; die < count; die++) {
          const [x0, y0] = spots[die - 1];
          const [x1, y1] = spots[die];
          assert.ok(Math.hypot(x1 - x0, y1 - y0) > 2 * CHECKER_RADIUS);
        }
      }
    }
  }
});
