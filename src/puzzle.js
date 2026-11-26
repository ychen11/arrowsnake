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
