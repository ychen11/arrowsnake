import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRID, STEP, generateLevel, validateLevel, makeRoute, snakePoints, findBlocker, findMovingBlocker } from '../src/puzzle.js';

test('dense square has disjoint orthogonal snakes with varied lengths and turns', () => {
  const snakes = generateLevel(23);
  const occupied = new Set();
  const lengths = new Set(), bends = new Set();
  for (const snake of snakes) {
    lengths.add(snake.cells.length);
    let turns = 0;
    for (let i = 0; i < snake.cells.length; i++) {
      const [x, y] = snake.cells[i];
      assert.ok(x >= 0 && x < GRID && y >= 0 && y < GRID);
      const key = `${x},${y}`;
      assert.ok(!occupied.has(key), `overlapping paths at ${key}`);
      occupied.add(key);
      if (i > 0) {
        const prev = snake.cells[i - 1];
        assert.equal(Math.abs(x - prev[0]) + Math.abs(y - prev[1]), 1);
        if (i > 1) {
          const before = snake.cells[i - 2];
          if (x - prev[0] !== prev[0] - before[0] || y - prev[1] !== prev[1] - before[1]) turns++;
        }
      }
    }
    bends.add(turns);
    const head = snake.cells.at(-1), neck = snake.cells.at(-2);
    assert.deepEqual([head[0] - neck[0], head[1] - neck[1]], snake.direction);
  }
  // Unit orthogonal edges with disjoint integer vertices cannot cross.
  assert.equal(occupied.size, GRID ** 2);
  assert.ok(lengths.size > 10);
  assert.ok(bends.size > 5);
});

test('every snake can leave in a valid sequence without collisions or self collisions', () => {
  const snakes = generateLevel(23);
  assert.ok(snakes.some(snake => findBlocker(snake, snakes)));
  for (const snake of [...snakes].reverse()) {
    assert.equal(findBlocker(snake, snakes), null);
    const head = snake.cells.at(-1), [dx, dy] = snake.direction;
    assert.ok(snake.cells.slice(0, -1).every(([x, y]) => (x - head[0]) * dy !== (y - head[1]) * dx || (x - head[0]) * dx + (y - head[1]) * dy < 0));
    snake.alive = false;
  }
});

test('250 random seeds fully cover the board and have verified full solutions', () => {
  const layouts = new Set();
  for (let seed = 0; seed < 250; seed++) {
    const snakes = generateLevel(seed);
    assert.ok(validateLevel(snakes), `invalid puzzle for seed ${seed}`);
    const layout = JSON.stringify(snakes);
    assert.ok(!layouts.has(layout), `duplicate layout for seed ${seed}`);
    layouts.add(layout);
  }
  assert.notDeepEqual(generateLevel(), generateLevel());
});

test('validation rejects holes, overlaps, and reversed head directions', () => {
  const snakes = generateLevel(9);
  assert.equal(validateLevel(snakes.slice(1)), false);
  assert.equal(validateLevel([...snakes, snakes[0]]), false);
  const broken = structuredClone(snakes);
  broken[0].direction = broken[0].direction.map(value => -value);
  assert.equal(validateLevel(broken), false);
});

test('snake tail follows old bends while head moves straight and body length stays fixed', () => {
  const cells = [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]];
  const route = makeRoute(cells);
  for (const travel of [STEP / 2, STEP * 1.5, STEP * 3.5, STEP * 7]) {
    const points = snakePoints(route, [0, 1], travel);
    let length = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      assert.ok(Math.abs(a[0] - b[0]) < 1e-9 || Math.abs(a[1] - b[1]) < 1e-9);
      length += Math.hypot(a[0] - b[0], a[1] - b[1]);
    }
    assert.ok(Math.abs(length - route.length) < 1e-9);
    assert.ok(Math.abs(points.at(-1)[0] - route.points.at(-1)[0]) < 1e-9);
    assert.ok(Math.abs(points.at(-1)[1] - route.points.at(-1)[1] - travel) < 1e-9);
  }
  const halfway = snakePoints(route, [0, 1], STEP / 2);
  assert.ok(Math.abs(halfway[0][1] - route.points[0][1]) < 1e-9);
  assert.ok(Math.abs(halfway[0][0] - route.points[0][0] - STEP / 2) < 1e-9);
});

test('concurrent collisions follow current bodies and release vacated paths', () => {
  const snake = { alive: true, direction: [1, 0], points: [[-1, 0], [0, 0]] };
  const other = { alive: true, points: [[1, -1], [1, 1]] };
  assert.ok(Math.abs(findMovingBlocker(snake, [snake, other]).distance - .91) < 1e-9);
  other.points = [[1, .2], [1, 2]];
  assert.equal(findMovingBlocker(snake, [snake, other]), null);
  other.points = [[.1, 0], [1, 0]];
  assert.ok(findMovingBlocker(snake, [snake, other]).distance < .02);
  other.alive = false;
  assert.equal(findMovingBlocker(snake, [snake, other]), null);
});
