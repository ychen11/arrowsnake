const key = ([x, y]) => `${x},${y}`;
const inside = ([x, y], grid) => x >= 0 && y >= 0 && x < grid && y < grid;

function randomGenerator(seed) {
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function coveringPath(random, grid, shuffle = true) {
  const path = [];
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) path.push([y % 2 ? grid - 1 - x : x, y]);
  }

  if (shuffle) {
    for (let attempt = 0; attempt < 6500; attempt++) {
      if (random() < 0.5) path.reverse();
      const head = path.at(-1);
      const neighbors = [];
      for (let i = 0; i < path.length - 2; i++) {
        if (Math.abs(path[i][0] - head[0]) + Math.abs(path[i][1] - head[1]) === 1) neighbors.push(i);
      }
      if (!neighbors.length) continue;
      const index = neighbors[Math.floor(random() * neighbors.length)];
      let left = index + 1;
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

function partitionAndSolve(path, random, config) {
  const pieces = [];
  for (let start = 0; start < path.length;) {
    let length = Math.min(path.length - start,
      config.minLength + Math.floor(random() * (config.maxLength - config.minLength + 1)));
    if (path.length - start - length === 1) length++;
    pieces.push(path.slice(start, start + length));
    start += length;
  }

  const occupied = new Set(path.map(key));
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
            inside(point, config.grid);
            point = [point[0] + direction[0], point[1] + direction[1]]) {
            if (occupied.has(key(point))) {
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
    for (const cell of removed) occupied.delete(key(cell));
    pieces.splice(index, 1);
    if (end + 1 < cells.length) pieces.push(cells.slice(end + 1));
  }
  return solution.reverse().map((snake, id) => ({ ...snake, id }));
}

export function validateLevel(snakes, grid) {
  const config = { grid };
  const occupied = new Set();
  for (const snake of snakes) {
    if (snake.cells.length < 2) return false;
    for (let i = 0; i < snake.cells.length; i++) {
      const cell = snake.cells[i];
      if (!inside(cell, config.grid) || occupied.has(key(cell))) return false;
      occupied.add(key(cell));
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
    for (let point = [head[0] + dx, head[1] + dy]; inside(point, grid); point = [point[0] + dx, point[1] + dy]) {
      if (occupied.has(key(point))) return false;
    }
    for (const cell of snake.cells) occupied.delete(key(cell));
  }
  return true;
}

export function generateConfiguredLevel(seed, config) {
  const random = randomGenerator(seed);
  const attempts = config.maxArrows ? 160 : 24;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const snakes = partitionAndSolve(coveringPath(random, config.grid), random, config);
    const countInRange = snakes &&
      (config.minArrows == null || snakes.length >= config.minArrows) &&
      (config.maxArrows == null || snakes.length <= config.maxArrows);
    if (countInRange && validateLevel(snakes, config.grid)) return snakes;
  }

  const fallback = partitionAndSolve(coveringPath(random, config.grid, false), random, config);
  const countInRange = fallback &&
    (config.minArrows == null || fallback.length >= config.minArrows) &&
    (config.maxArrows == null || fallback.length <= config.maxArrows);
  if (!countInRange || !validateLevel(fallback, config.grid)) throw new Error('Unable to generate playable level');
  return fallback;
}
