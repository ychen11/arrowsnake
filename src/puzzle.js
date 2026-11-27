export const STEP = 0.255;
export const GRID = 27;

export function worldPoint([x, y], grid = GRID) {
  return [(x - (grid - 1) / 2) * STEP, (y - (grid - 1) / 2) * STEP];
}

export function makeRoute(cells, grid = GRID) {
  const points = cells.map(cell => worldPoint(cell, grid));
  const distances = points.map((_, i) => i * STEP);
  return { points, distances, length: (points.length - 1) * STEP };
}

export function pointAt(route, direction, distance) {
  if (distance >= route.length) {
    const head = route.points[route.points.length - 1];
    return [head[0] + direction[0] * (distance - route.length), head[1] + direction[1] * (distance - route.length)];
  }
  const segment = Math.min(route.points.length - 2, Math.floor(Math.max(0, distance) / STEP));
  const fraction = (distance - segment * STEP) / STEP;
  const a = route.points[segment], b = route.points[segment + 1];
  return [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
}

// A constant-length window slides along the original route, then the straight
// extension of the head. The tail follows every old bend before straightening.
export function snakePoints(route, direction, travel) {
  const points = [pointAt(route, direction, travel)];
  for (let i = 1; i < route.points.length; i++) {
    if (route.distances[i] > travel + 1e-7 && route.distances[i] < travel + route.length - 1e-7) points.push(route.points[i]);
  }
  points.push(pointAt(route, direction, travel + route.length));
  return points;
}

export function findBlocker(snake, snakes) {
  const head = snake.cells[snake.cells.length - 1];
  const [dx, dy] = snake.direction;
  let closest = null;
  for (const other of snakes) {
    if (other === snake || other.alive === false) continue;
    for (const [x, y] of other.cells) {
      const along = (x - head[0]) * dx + (y - head[1]) * dy;
      const across = (x - head[0]) * dy - (y - head[1]) * dx;
      if (across === 0 && along > 0 && (!closest || along * STEP < closest.distance)) closest = { snake: other, distance: along * STEP };
    }
  }
  return closest;
}

export function distanceToSegment(point, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
}

// Distance along a head's forward ray to another snake's current body.
// Expanded segment bounds include the visible arrowhead and line thickness.
export function findMovingBlocker(snake, snakes, acrossTolerance = .045) {
  const head = snake.points.at(-1);
  const [dx, dy] = snake.direction;
  let closest = null;
  for (const other of snakes) {
    if (other === snake || !other.alive) continue;
    const points = other.points;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const alongA = (a[0] - head[0]) * dx + (a[1] - head[1]) * dy;
      const alongB = (b[0] - head[0]) * dx + (b[1] - head[1]) * dy;
      const acrossA = (a[0] - head[0]) * dy - (a[1] - head[1]) * dx;
      const acrossB = (b[0] - head[0]) * dy - (b[1] - head[1]) * dx;
      if (Math.min(acrossA, acrossB) > acrossTolerance || Math.max(acrossA, acrossB) < -acrossTolerance || Math.max(alongA, alongB) < -.09) continue;
      const distance = Math.max(0, Math.min(alongA, alongB) - .09);
      if (!closest || distance < closest.distance) closest = { snake: other, distance };
    }
  }
  return closest;
}

const cellKey = ([x, y]) => `${x},${y}`;
const isInsideGrid = ([x, y], grid) => x >= 0 && y >= 0 && x < grid && y < grid;

function seededRandom(seed) {
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function createCoveringPath(random, grid, shuffle = true, shuffleAttempts = 6500) {
  const path = [];
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) path.push([y % 2 ? grid - 1 - x : x, y]);
  }

  if (shuffle) {
    for (let attempt = 0; attempt < shuffleAttempts; attempt++) {
      if (random() < .5) path.reverse();
      const head = path.at(-1);
      const neighbors = [];
      for (let i = 0; i < path.length - 2; i++) {
        if (Math.abs(path[i][0] - head[0]) + Math.abs(path[i][1] - head[1]) === 1) neighbors.push(i);
      }
      if (!neighbors.length) continue;
      let left = neighbors[Math.floor(random() * neighbors.length)] + 1;
      let right = path.length - 1;
      while (left < right) {
        [path[left], path[right]] = [path[right], path[left]];
        left++;
        right--;
      }
    }
  }
  return path;
}

function partitionAndSolve(path, random, config, orderedPath = false) {
  const pieces = [];
  const exactCount = config.minArrows != null && config.minArrows === config.maxArrows;
  const plannedLengths = [];
  if (exactCount) {
    const count = config.minArrows;
    const shortest = Math.floor(path.length / count);
    const longerPieces = path.length % count;
    if (shortest < config.minLength || shortest + (longerPieces ? 1 : 0) > config.maxLength) return null;
    for (let i = 0; i < count; i++) plannedLengths.push(shortest + (i < longerPieces ? 1 : 0));
    for (let i = plannedLengths.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [plannedLengths[i], plannedLengths[j]] = [plannedLengths[j], plannedLengths[i]];
    }
  }
  for (let start = 0; start < path.length;) {
    let length = exactCount
      ? plannedLengths[pieces.length]
      : Math.min(path.length - start, config.minLength + Math.floor(random() * (config.maxLength - config.minLength + 1)));
    if (path.length - start - length === 1) length++;
    pieces.push(path.slice(start, start + length));
    start += length;
  }

  if (orderedPath && exactCount) {
    // Each prefix of the row-by-row path can exit toward the cells already cleared.
    return pieces.reverse().map((piece, id) => {
      const [head, neck] = piece;
      const direction = [head[0] - neck[0], head[1] - neck[1]];
      return { cells: piece.reverse(), direction, id };
    });
  }

  const occupied = new Set(path.map(cellKey));
  const solution = [];
  while (pieces.length) {
    let best = null;
    for (let index = 0; index < pieces.length; index++) {
      for (const reverse of [false, true]) {
        const cells = reverse ? [...pieces[index]].reverse() : pieces[index];
        for (let end = cells.length - 1; end >= 1; end--) {
          if (cells.length - end - 1 === 1) continue;
          const head = cells[end];
          const neck = cells[end - 1];
          const direction = [head[0] - neck[0], head[1] - neck[1]];
          let clear = true;
          for (let point = [head[0] + direction[0], head[1] + direction[1]];
            isInsideGrid(point, config.grid);
            point = [point[0] + direction[0], point[1] + direction[1]]) {
            if (occupied.has(cellKey(point))) {
              clear = false;
              break;
            }
          }
          if (clear && (!best || end > best.end)) best = { index, cells, end, direction };
        }
      }
    }

    if (!best) return null;
    const { index, cells, end, direction } = best;
    const removed = cells.slice(0, end + 1);
    solution.push({ cells: removed, direction });
    for (const cell of removed) occupied.delete(cellKey(cell));
    pieces.splice(index, 1);
    if (end + 1 < cells.length) pieces.push(cells.slice(end + 1));
  }
  return solution.reverse().map((snake, id) => ({ ...snake, id }));
}

export function validateLevel(snakes, grid) {
  const occupied = new Set();
  for (const snake of snakes) {
    if (snake.cells.length < 2) return false;
    for (let i = 0; i < snake.cells.length; i++) {
      const cell = snake.cells[i];
      if (!isInsideGrid(cell, grid) || occupied.has(cellKey(cell))) return false;
      occupied.add(cellKey(cell));
      if (i && Math.abs(cell[0] - snake.cells[i - 1][0]) + Math.abs(cell[1] - snake.cells[i - 1][1]) !== 1) return false;
    }
    const head = snake.cells.at(-1);
    const neck = snake.cells.at(-2);
    if (head[0] - neck[0] !== snake.direction[0] || head[1] - neck[1] !== snake.direction[1]) return false;
  }
  if (occupied.size !== grid * grid) return false;
  for (const snake of [...snakes].reverse()) {
    const head = snake.cells.at(-1);
    const [dx, dy] = snake.direction;
    for (let point = [head[0] + dx, head[1] + dy]; isInsideGrid(point, grid); point = [point[0] + dx, point[1] + dy]) {
      if (occupied.has(cellKey(point))) return false;
    }
    for (const cell of snake.cells) occupied.delete(cellKey(cell));
  }
  return true;
}

export function generateConfiguredLevel(seed, config) {
  const random = seededRandom(seed);
  const exactArrowCount = config.minArrows != null && config.minArrows === config.maxArrows;
  const attempts = exactArrowCount ? 16 : config.maxArrows ? 160 : 24;
  const shuffleAttempts = exactArrowCount ? 120 : 6500;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const snakes = partitionAndSolve(createCoveringPath(random, config.grid, true, shuffleAttempts), random, config);
    const countInRange = snakes &&
      (config.minArrows == null || snakes.length >= config.minArrows) &&
      (config.maxArrows == null || snakes.length <= config.maxArrows);
    if (countInRange && validateLevel(snakes, config.grid)) return snakes;
  }

  const fallback = partitionAndSolve(createCoveringPath(random, config.grid, false), random, config, true);
  const countInRange = fallback &&
    (config.minArrows == null || fallback.length >= config.minArrows) &&
    (config.maxArrows == null || fallback.length <= config.maxArrows);
  if (!countInRange || !validateLevel(fallback, config.grid)) throw new Error('Unable to generate playable level');
  return fallback;
}
