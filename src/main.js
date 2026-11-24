import * as THREE from 'three';
import './style.css';

import { GRID, STEP, generateLevel, makeRoute, snakePoints, findMovingBlocker, distanceToSegment } from './puzzle.js';
import { createGameAudio } from './audio.js';

const LIMIT = 180;
const PALETTE = [0x7be3c0, 0x7dbfed, 0xffd477, 0xf38fa2, 0xb9a0ec, 0x92d975, 0x75d7d4, 0xf1aa78];
const canvas = document.querySelector('#gameCanvas');
const wrap = document.querySelector('#canvasWrap');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x1d2941, 1);
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-4.45, 4.45, 4.45, -4.45, 0.1, 100);
camera.position.set(0, 0, 20);
camera.lookAt(0, 0, 0);
const pointer = new THREE.Vector2();
const arrows = [];
const arrowLayer = new THREE.Group();
scene.add(arrowLayer);
let lives = 3;
let hints = 3;
let seconds = LIMIT;
let started = false;
let ended = false;
const active = new Map();
const audio = createGameAudio();
let lastFrame = performance.now();
let toastTimeout;
let overlayAction = null;
let lastLayout = '';

const el = (selector) => document.querySelector(selector);

function addLine(group, start, end, material, radius = .012) {
  const delta = new THREE.Vector3(...end).sub(new THREE.Vector3(...start));
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(delta.length(), radius * 2), material);
  mesh.position.set((start[0] + end[0]) / 2, (start[1] + end[1]) / 2, -.2);
  mesh.rotation.z = Math.atan2(delta.y, delta.x);
  group.add(mesh);
}

function paintSnake(arrow) {
  const points = arrow.points;
  const positions = arrow.positions;
  let cursor = 0;
  const triangle = (a, b, c) => {
    for (const p of [a, b, c]) { positions[cursor++] = p[0]; positions[cursor++] = p[1]; positions[cursor++] = 0; }
  };
  const radius = .019;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-7) continue;
    const nx = -(b[1] - a[1]) / length * radius, ny = (b[0] - a[0]) / length * radius;
    const p = [a[0] + nx, a[1] + ny], q = [a[0] - nx, a[1] - ny];
    const r = [b[0] + nx, b[1] + ny], t = [b[0] - nx, b[1] - ny];
    triangle(p, q, r); triangle(q, t, r);
  }
  for (const point of points) for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2, b = (i + 1) / 8 * Math.PI * 2;
    triangle(point, [point[0] + Math.cos(a) * radius, point[1] + Math.sin(a) * radius], [point[0] + Math.cos(b) * radius, point[1] + Math.sin(b) * radius]);
  }
  const head = points[points.length - 1];
  const [dx, dy] = arrow.direction;
  triangle([head[0] + dx * .065, head[1] + dy * .065],
    [head[0] - dx * .065 - dy * .060, head[1] - dy * .065 + dx * .060],
    [head[0] - dx * .065 + dy * .060, head[1] - dy * .065 - dx * .060]);
  arrow.geometry.setDrawRange(0, cursor / 3);
  arrow.geometry.attributes.position.needsUpdate = true;
}

function makeArrow(definition) {
  const color = PALETTE[(definition.id * 3 + Math.floor(definition.id / 8)) % PALETTE.length];
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .96, side: THREE.DoubleSide, depthTest: false });
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array((definition.cells.length + 2) * 100);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  const group = new THREE.Mesh(geometry, material);
  group.frustumCulled = false;
  const arrow = { ...definition, group, geometry, positions, material, color, route: makeRoute(definition.cells), alive: true, hintUntil: 0, flashUntil: 0 };
  moveSnake(arrow, 0);
  paintSnake(arrow);
  arrowLayer.add(group);
  return arrow;
}

function addBoardDecoration() {
  const faint = new THREE.MeshBasicMaterial({ color: 0x7d98bc, transparent: true, opacity: 0.08, depthWrite: false });
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const dot = new THREE.Mesh(new THREE.CircleGeometry(.009, 12), faint);
      dot.position.set((col - (GRID - 1) / 2) * STEP, (row - (GRID - 1) / 2) * STEP, -.2);
      scene.add(dot);
    }
  }
  const edge = new THREE.MeshBasicMaterial({ color: 0x9cb5cf, transparent: true, opacity: .15, depthWrite: false });
  const span = 3.65;
  const corner = .19;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const x = sx * span, y = sy * span;
    addLine(scene, [x, y - sy * corner, -.3], [x, y, -.3], edge, .012);
    addLine(scene, [x, y, -.3], [x - sx * corner, y, -.3], edge, .012);
  }
}

function resize() {
  const width = wrap.clientWidth;
  const height = wrap.clientHeight;
  renderer.setSize(width, height, false);
  const aspect = width / height;
  const halfHeight = aspect < 1.1 ? 4.18 : 4.05;
  camera.left = -halfHeight * aspect;
  camera.right = halfHeight * aspect;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
}

function updateHud() {
  const remaining = arrows.filter((arrow) => arrow.alive).length;
  const TOTAL = arrows.length;
  el('#remaining').textContent = remaining;
  el('#total').textContent = ` / ${TOTAL}`;
  el('#timer').textContent = `${String(Math.floor(Math.ceil(seconds) / 60)).padStart(2, '0')}:${String(Math.ceil(seconds) % 60).padStart(2, '0')}`;
  el('#timer').style.color = seconds <= 20 ? '#ff7892' : '';
  el('#hearts').innerHTML = Array.from({ length: 3 }, (_, index) => `<span class="${index >= lives ? 'lost' : ''}">♥</span>`).join(' ');
  el('#hearts').setAttribute('aria-label', `${lives} 颗心`);
  const clear = Math.round((TOTAL - remaining) / TOTAL * 100);
  el('#progressText').textContent = `${clear}% CLEAR`;
  el('#progressFill').style.width = `${clear}%`;
  el('#hintCount').textContent = hints;
  el('#hintBtn').disabled = hints === 0 || ended;
}

function blockerFor(arrow) { return findMovingBlocker(arrow, arrows); }

function moveSnake(arrow, travel) {
  arrow.points = snakePoints(arrow.route, arrow.direction, travel);
}

function showToast(message) {
  const toast = el('#hintToast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 2400);
}

function openOverlay({ symbol, kicker, title, body, button, action }) {
  el('#overlaySymbol').textContent = symbol;
  el('#overlayKicker').textContent = kicker;
  el('#overlayTitle').textContent = title;
  el('#overlayBody').textContent = body;
  el('#overlayButton').textContent = button;
  overlayAction = action;
  el('#overlay').classList.remove('hidden');
}

function closeOverlay() { el('#overlay').classList.add('hidden'); }

function finish(won) {
  ended = true;
  audio.stop();
  if (won) audio.victory();
  el('#boardStatus').textContent = won ? '全部箭头已清除' : '挑战结束';
  updateHud();
  openOverlay(won ? {
    symbol: '✦', kicker: 'LEVEL COMPLETE', title: '漂亮，全部突围！',
    body: `你在 ${String(Math.floor((LIMIT - seconds) / 60)).padStart(2, '0')}:${String(Math.floor((LIMIT - seconds) % 60)).padStart(2, '0')} 内清除了全部 ${arrows.length} 支箭头。`,
    button: '再玩一次', action: reset,
  } : {
    symbol: '↻', kicker: 'TRY AGAIN', title: lives === 0 ? '生命值耗尽' : '时间到了',
    body: '先从外圈找出口，逐步为内侧箭头打开通路。',
    button: '重新挑战', action: reset,
  });
}

function launch(arrow) {
  if (active.has(arrow.id) || ended || !arrow.alive || !el('#overlay').classList.contains('hidden')) return;
  if (!started) {
    started = true;
    el('#boardStatus').textContent = '箭头正在突围';
  }
  active.set(arrow.id, { arrow, traveled: 0, phase: 'forward', hold: 0 });
}

function reset() {
  audio.stop();
  closeOverlay();
  for (const arrow of arrows) { arrowLayer.remove(arrow.group); arrow.geometry.dispose(); arrow.material.dispose(); }
  arrows.length = 0;
  let definitions, layout;
  do {
    definitions = generateLevel();
    layout = JSON.stringify(definitions);
  } while (layout === lastLayout);
  lastLayout = layout;
  for (const definition of definitions) arrows.push(makeArrow(definition));
  seconds = LIMIT;
  lives = 3;
  hints = 3;
  started = false;
  ended = false;
  active.clear();
  el('#boardStatus').textContent = '点击任意箭头开始';
  updateHud();
}

function onPointer(event, clientX = event.clientX, clientY = event.clientY) {
  if (event.button !== 0) return;
  event.preventDefault();
  audio.unlock();
  if (ended) return;
  const rect = canvas.getBoundingClientRect();
  pointer.x = (clientX - rect.left) / rect.width * 2 - 1;
  pointer.y = -(clientY - rect.top) / rect.height * 2 + 1;
  const world = new THREE.Vector3(pointer.x, pointer.y, 0).unproject(camera);
  const scale = rect.width / (camera.right - camera.left);
  const point = [world.x * scale, world.y * scale];
  let closest = null, nearest = Infinity, second = Infinity;
  for (const arrow of arrows) {
    if (!arrow.alive) continue;
    const points = arrow.points;
    let distance = Infinity;
    for (let i = 1; i < points.length; i++) {
      distance = Math.min(distance, distanceToSegment(point,
        points[i - 1].map(v => v * scale), points[i].map(v => v * scale)));
    }
    // Include the arrowhead's visible tip in the clickable area.
    const head = points.at(-1);
    distance = Math.min(distance, distanceToSegment(point, head.map(v => v * scale),
      head.map((v, i) => (v + arrow.direction[i] * .065) * scale)));
    if (distance < nearest) { second = nearest; nearest = distance; closest = arrow; }
    else second = Math.min(second, distance);
  }
  // Moving snakes still participate in picking: tapping one must not pass
  // through to a stationary neighbor. Ambiguous taps between snakes do nothing.
  const touch = event.pointerType === 'touch';
  if (closest && nearest <= (touch ? 7 : 8) && second - nearest > (touch ? 2 : 1)) launch(closest);
}

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - lastFrame) / 1000, .05);
  lastFrame = now;
  if (started && !ended && el('#overlay').classList.contains('hidden')) {
    seconds = Math.max(0, seconds - dt);
    if (seconds <= 0) finish(false);
    else updateHud();
  }
  if (active.size && !ended && el('#overlay').classList.contains('hidden')) {
    audio.setFlight([...active.values()].some(motion => motion.phase === 'forward'));
    const moving = [...active.values()];
    // Small shared time steps keep fast heads from tunnelling through moving bodies.
    const steps = Math.ceil(dt / .008);
    for (let step = 0; step < steps && !ended; step++) {
      const tick = dt / steps;
      const motions = [...active.values()];
      const collisions = new Map(motions.filter(m => m.phase === 'forward').map(m => [m.arrow.id, blockerFor(m.arrow)]));
      for (const motion of motions) {
        const { arrow } = motion;
        if (motion.phase === 'forward') {
          const blocker = collisions.get(arrow.id);
          const advance = 5.2 * tick;
          motion.traveled += blocker ? Math.min(advance, blocker.distance) : advance;
          moveSnake(arrow, motion.traveled);
          if (blocker && blocker.distance <= advance) {
            motion.phase = 'hit';
            motion.hold = .12;
            arrow.flashUntil = now + 180;
            showToast('撞到了！失去一颗心');
            audio.hit();
            lives = Math.max(0, lives - 1);
            updateHud();
            if (lives === 0) { finish(false); break; }
          } else if (hasExited(arrow)) {
            arrow.alive = false;
            arrowLayer.remove(arrow.group);
            active.delete(arrow.id);
            updateHud();
          }
        } else if (motion.phase === 'hit') {
          motion.hold -= tick;
          if (motion.hold <= 0) motion.phase = 'return';
        } else {
          motion.traveled = Math.max(0, motion.traveled - 4 * tick);
          moveSnake(arrow, motion.traveled);
          if (motion.traveled === 0) active.delete(arrow.id);
        }
      }
    }
    for (const { arrow } of moving) if (arrow.alive) paintSnake(arrow);
    if (!ended && arrows.every(arrow => !arrow.alive)) finish(true);
  } else if (!active.size) audio.setFlight(false);
  for (const arrow of arrows) {
    if (!arrow.alive) continue;
    arrow.material.color.setHex(arrow.flashUntil > now ? 0xffffff : arrow.color);
    arrow.material.opacity = arrow.hintUntil > now ? .65 + .35 * Math.sin(now * .014) ** 2 : .96;
  }
  renderer.render(scene, camera);
}

function hasExited(arrow) {
  const [x, y] = arrow.points[0];
  const [dx, dy] = arrow.direction;
  const margin = .09;
  return dx > 0 && x > camera.right + margin || dx < 0 && x < camera.left - margin ||
    dy > 0 && y > camera.top + margin || dy < 0 && y < camera.bottom - margin;
}

let press = null;
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0 || press) return;
  event.preventDefault();
  audio.unlock();
  press = { id: event.pointerId, x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointerup', event => {
  if (!press || press.id !== event.pointerId) return;
  const start = press;
  const tap = Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 8;
  press = null;
  // Pick from the initial contact point so a slight finger drift cannot select
  // a neighboring arrow when the pointer is released.
  if (tap) onPointer(event, start.x, start.y);
});
canvas.addEventListener('pointercancel', () => { press = null; });
canvas.addEventListener('lostpointercapture', () => { press = null; });
el('#restartBtn').addEventListener('click', reset);
el('#hintBtn').addEventListener('click', () => {
  if (hints <= 0 || ended) return;
  const safe = arrows.filter((arrow) => arrow.alive && !active.has(arrow.id) && !blockerFor(arrow));
  if (!safe.length) return;
  const arrow = safe[Math.floor(Math.random() * safe.length)];
  arrow.hintUntil = performance.now() + 2700;
  hints--;
  updateHud();
  showToast('闪烁的箭头可以安全离场');
});
el('#themeBtn').addEventListener('click', () => {
  document.body.classList.toggle('light');
  renderer.setClearColor(document.body.classList.contains('light') ? 0xdfeaf1 : 0x1d2941, 1);
  el('#themeBtn').textContent = document.body.classList.contains('light') ? '☀' : '☾';
});
el('#helpBtn').addEventListener('click', () => openOverlay({
  symbol: '↗', kicker: 'HOW TO PLAY', title: '箭头突围',
  body: '点击折线箭头的任意一段，头部会朝箭头所指方向前进，身体与尾部像贪吃蛇一样沿折线路径依次跟随。前方没有箭头就能离场；撞到其他箭头会返回原位，并失去一颗心。在三分钟内清空方阵即可过关。',
  button: '继续游戏', action: closeOverlay,
}));
el('#overlayButton').addEventListener('click', () => overlayAction?.());
window.addEventListener('resize', resize);
addBoardDecoration();
reset();
resize();
requestAnimationFrame(animate);

// Read-only snapshots allow geometry and browser interaction checks on the real scene.
window.arrowGame = { snapshot: () => ({
  lives, seconds, started, ended,
  active: [...active.values()].map(m => ({ id: m.arrow.id, phase: m.phase, traveled: m.traveled })),
  arrows: arrows.map(a => ({ id: a.id, alive: a.alive, cells: a.cells, direction: a.direction,
    length: a.route.length, points: a.points,
    blocker: blockerFor(a)?.snake.id ?? null })),
  view: { left: camera.left, right: camera.right, top: camera.top, bottom: camera.bottom },
}) };
