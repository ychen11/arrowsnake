export const GRID = 27;
export const STEP = 0.255;
export const DIRECTIONS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

function randomGenerator(seed) {
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

const key = ([x, y]) => `${x},${y}`;
const inside = ([x, y]) => x >= 0 && y >= 0 && x < GRID && y < GRID;

function coveringPath(random, shuffle = true) {
  const path = [];
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) path.push([y % 2 ? GRID - 1 - x : x, y]);
  // Reconnect an endpoint to an adjacent interior vertex and reverse the suffix.
  // This preserves one continuous orthogonal path visiting EVERY cell once.
  if (shuffle) for (let attempt = 0; attempt < 6500; attempt++) {
    if (random() < .5) path.reverse();
    const head = path.at(-1);
    const neighbors = [];
    for (let i = 0; i < path.length - 2; i++) {
      if (Math.abs(path[i][0] - head[0]) + Math.abs(path[i][1] - head[1]) === 1) neighbors.push(i);
    }
    if (!neighbors.length) continue;
    const index = neighbors[Math.floor(random() * neighbors.length)];
    let left = index + 1, right = path.length - 1;
    while (left < right) { [path[left], path[right]] = [path[right], path[left]]; left++; right--; }
  }
  return path;
}

function partitionAndSolve(path, random) {
  const pieces = [];
  for (let start = 0; start < path.length;) {
    let length = Math.min(path.length - start, 9 + Math.floor(random() * 25));
    if (path.length - start - length === 1) length++;
    pieces.push(path.slice(start, start + length));
    start += length;
  }
  const occupied = new Set(path.map(key));
  const solution = [];
  while (pieces.length) {
    let best = null;
    for (let index = 0; index < pieces.length; index++) for (const reverse of [false, true]) {
      const cells = reverse ? [...pieces[index]].reverse() : pieces[index];
      for (let end = cells.length - 1; end >= 1; end--) {
        // Do not leave a one-cell piece: every arrow needs a body and direction.
        if (cells.length - end - 1 === 1) continue;
        const head = cells[end], neck = cells[end - 1];
        const direction = [head[0] - neck[0], head[1] - neck[1]];
        let clear = true;
        for (let point = [head[0] + direction[0], head[1] + direction[1]]; inside(point); point = [point[0] + direction[0], point[1] + direction[1]]) {
          if (occupied.has(key(point))) { clear = false; break; }
        }
        if (clear && (!best || end > best.end)) best = { index, cells, end, direction };
      }
    }
    if (!best) return null;
    const { index, cells, end, direction } = best;
    const removed = cells.slice(0, end + 1);
    solution.push({ cells: removed, direction });
    for (const cell of removed) occupied.delete(key(cell));
    pieces.splice(index, 1);
    if (end + 1 < cells.length) pieces.push(cells.slice(end + 1));
  }
  // Keep the existing reverse-id removal invariant for tools and tests.
  return solution.reverse().map((snake, id) => ({ ...snake, id }));
}

export function validateLevel(snakes) {
  const occupied = new Set();
  for (const snake of snakes) {
    if (snake.cells.length < 2) return false;
    for (let i = 0; i < snake.cells.length; i++) {
      const cell = snake.cells[i];
      if (!inside(cell) || occupied.has(key(cell))) return false;
      occupied.add(key(cell));
      if (i && Math.abs(cell[0] - snake.cells[i - 1][0]) + Math.abs(cell[1] - snake.cells[i - 1][1]) !== 1) return false;
    }
    const head = snake.cells.at(-1), neck = snake.cells.at(-2);
    if (head[0] - neck[0] !== snake.direction[0] || head[1] - neck[1] !== snake.direction[1]) return false;
  }
  if (occupied.size !== GRID * GRID) return false;
  // Validate actual forward rays against ALL remaining bodies, including itself.
  for (const snake of [...snakes].reverse()) {
    const head = snake.cells.at(-1), [dx, dy] = snake.direction;
    for (let point = [head[0] + dx, head[1] + dy]; inside(point); point = [point[0] + dx, point[1] + dy]) {
      if (occupied.has(key(point))) return false;
    }
    for (const cell of snake.cells) occupied.delete(key(cell));
  }
  return true;
}

export function generateLevel(seed = crypto.getRandomValues(new Uint32Array(1))[0]) {
  const random = randomGenerator(seed);
  for (let attempt = 0; attempt < 24; attempt++) {
    const snakes = partitionAndSolve(coveringPath(random), random);
    if (snakes && validateLevel(snakes)) return snakes;
  }
  // A continuous row weave is a constructive fallback with the same full cover.
  const fallback = partitionAndSolve(coveringPath(random, false), random);
  if (!fallback || !validateLevel(fallback)) throw new Error('无法生成可解棋盘');
  return fallback;
}

export function worldPoint([x, y]) {
  return [(x - (GRID - 1) / 2) * STEP, (y - (GRID - 1) / 2) * STEP];
}

export function makeRoute(cells) {
  const points = cells.map(worldPoint);
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
export function findMovingBlocker(snake, snakes) {
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
      if (Math.min(acrossA, acrossB) > .045 || Math.max(acrossA, acrossB) < -.045 || Math.max(alongA, alongB) < -.09) continue;
      const distance = Math.max(0, Math.min(alongA, alongB) - .09);
      if (!closest || distance < closest.distance) closest = { snake: other, distance };
    }
  }
  return closest;
}
