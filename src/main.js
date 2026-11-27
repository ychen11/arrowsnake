import * as THREE from 'three';
import './style.css';

import { GRID, STEP, makeRoute, snakePoints, findMovingBlocker, distanceToSegment, generateConfiguredLevel } from './puzzle.js';
import { createGameAudio } from './audio.js';

const DEFAULT_LEVEL = { gridSize: 19, timeSeconds: 60, arrowRadius: .043, arrowTipLength: .12, arrowTipWidth: .11, hitRadius: 5, collisionTolerance: .09 };
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
let level = 1;
let gridSize = GRID;
let levelConfig = { ...DEFAULT_LEVEL };
let lives = 3;
let hints = 3;
let seconds = DEFAULT_LEVEL.timeSeconds;
let started = false;
let ended = false;
const active = new Map();
const audio = createGameAudio();
let lastFrame = performance.now();
let toastTimeout;
let overlayAction = null;
let lastLayout = '';
let language = 'zh';
let fireworks = null;
let levelRequestId = 0;
let latestLoadedLevel = 1;
try { language = localStorage.getItem('arrowSnakeLanguage') === 'en' ? 'en' : 'zh'; } catch { /* Storage can be disabled for local files. */ }

const TEXT = {
  zh: {
    gameName: '箭头突围', languageLabel: '切换语言', themeLabel: '切换昼夜模式', helpLabel: '玩法说明',
    tagline: '找出出口，让每支箭头安全离场。', gameState: '游戏状态', remaining: '剩余箭头', time: '剩余时间', lives: '生命值', nextLevelTitle: '关卡完成！', nextLevelBody: n => `准备好进入第 ${n} 关了吗？`, nextLevelButton: '下一关',
    board: '箭头游戏棋盘', boardName: n => `第${n}关 · 方形阵列`, boardStart: '点击任意箭头开始', boardMoving: '箭头正在突围', boardCleared: '全部箭头已清除', boardEnded: '挑战结束', boardLoading: '正在载入关卡…', boardLoadFailed: '关卡载入失败，请重试', levelButton: n => `关卡 ${n} ↗`, levelTitle: n => `切换到第${n}关`,
    boardHint: '每条彩色折线都是一支箭头', instruction: '点击箭头，让蛇身沿路径游出', collisionHint: '撞到其他箭头会失去一颗心', hint: '提示', restart: '重新开始', clear: 'CLEAR',
    hearts: n => `${n} 颗心`, hitToast: '撞到了！失去一颗心', safeToast: '闪烁的箭头可以安全离场',
    completeKicker: 'LEVEL COMPLETE', completeTitle: '漂亮，全部突围！', completeBody: (time, count) => `你在 ${time} 内清除了全部 ${count} 支箭头。`, playAgain: '再玩一次', helpKicker: '玩法说明',
    retryKicker: 'TRY AGAIN', outOfLives: '生命值耗尽', timeUp: '时间到了', retryBody: '先从外圈找出口，逐步为内侧箭头打开通路。', retry: '重新挑战',
    helpTitle: '玩法说明', helpBody: '点击折线箭头的任意一段，头部会朝箭头所指方向前进，身体与尾部像贪吃蛇一样沿折线路径依次跟随。前方没有箭头就能离场；撞到其他箭头会返回原位，并失去一颗心。在当前关卡的限时内清空棋盘即可过关。', continue: '继续游戏',
  },
  en: {
    gameName: 'ArrowSnake', languageLabel: 'Switch language', themeLabel: 'Toggle light/dark mode', helpLabel: 'How to play',
    tagline: 'Find the exits and guide every arrow to safety.', gameState: 'Game status', remaining: 'Arrows left', time: 'Time left', lives: 'Lives', nextLevelTitle: 'Level complete!', nextLevelBody: n => `Ready to start level ${n}?`, nextLevelButton: 'Next level',
    board: 'Arrow game board', boardName: n => `Level ${n} · Square formation`, boardStart: 'Tap any arrow to begin', boardMoving: 'Arrows are escaping', boardCleared: 'All arrows cleared', boardEnded: 'Game over', boardLoading: 'Loading level…', boardLoadFailed: 'Could not load level. Please retry.', levelButton: n => `LEVEL ${n} ↗`, levelTitle: n => `Switch to level ${n}`,
    boardHint: 'Each colored path is an arrow', instruction: 'Tap an arrow to send it along its path', collisionHint: 'Hitting another arrow costs one heart', hint: 'Hint', restart: 'Restart', clear: 'CLEAR',
    hearts: n => `${n} ${n === 1 ? 'heart' : 'hearts'}`, hitToast: 'Collision! One heart lost', safeToast: 'Glowing arrows can exit safely',
    completeKicker: 'LEVEL COMPLETE', completeTitle: 'Amazing! All clear!', completeBody: (time, count) => `You cleared all ${count} arrows in ${time}.`, playAgain: 'Play again', helpKicker: 'HOW TO PLAY',
    retryKicker: 'TRY AGAIN', outOfLives: 'Out of lives', timeUp: "Time's up", retryBody: 'Look for exits around the edge to open paths for the inner arrows.', retry: 'Try again',
    helpTitle: 'How to play', helpBody: 'Tap any segment of an arrow. Its head moves in the arrow’s direction while its body follows the bends like a snake. If the path is clear, it leaves the board. If it hits another arrow, it returns and you lose a heart. Clear the board before the current level’s timer runs out.', continue: 'Continue',
  },
};
const t = key => TEXT[language][key];

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
  const radius = levelConfig.arrowRadius;
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
  const tipLength = levelConfig.arrowTipLength;
  const tipWidth = levelConfig.arrowTipWidth;
  triangle([head[0] + dx * tipLength, head[1] + dy * tipLength],
    [head[0] - dx * tipLength - dy * tipWidth, head[1] - dy * tipLength + dx * tipWidth],
    [head[0] - dx * tipLength + dy * tipWidth, head[1] - dy * tipLength - dx * tipWidth]);
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
  const arrow = { ...definition, group, geometry, positions, material, color, route: makeRoute(definition.cells, gridSize), alive: true, hintUntil: 0, flashUntil: 0 };
  moveSnake(arrow, 0);
  paintSnake(arrow);
  arrowLayer.add(group);
  return arrow;
}

function addBoardDecoration() {
  const faint = new THREE.MeshBasicMaterial({ color: 0x7d98bc, transparent: true, opacity: 0.08, depthWrite: false });
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const dot = new THREE.Mesh(new THREE.CircleGeometry(.009, 12), faint);
      dot.position.set((col - (gridSize - 1) / 2) * STEP, (row - (gridSize - 1) / 2) * STEP, -.2);
      scene.add(dot);
    }
  }
  const edge = new THREE.MeshBasicMaterial({ color: 0x9cb5cf, transparent: true, opacity: .15, depthWrite: false });
  const span = (gridSize - 1) * STEP / 2 + .13;
  const corner = .19;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const x = sx * span, y = sy * span;
    addLine(scene, [x, y - sy * corner, -.3], [x, y, -.3], edge, .012);
    addLine(scene, [x, y, -.3], [x - sx * corner, y, -.3], edge, .012);
  }
}

function clearBoardDecoration() {
  const decorations = scene.children.filter(object => object !== arrowLayer);
  for (const object of decorations) {
    scene.remove(object);
    object.geometry?.dispose();
    if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
    else object.material?.dispose();
  }
}

function startFireworks() {
  if (fireworks) {
    scene.remove(fireworks.points);
    fireworks.geometry.dispose();
    fireworks.material.dispose();
  }
  const count = 420;
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const palette = [0xffd166, 0xff6b8a, 0x7be3c0, 0x7dbfed, 0xc9a2ff, 0xffffff];
  for (let i = 0; i < count; i++) {
    const burst = Math.floor(i / 70);
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.2 + Math.random() * 2.5;
    const base = burst * 70;
    const originX = ((burst % 3) - 1) * 1.9;
    const originY = -1.4 + Math.floor(burst / 3) * .5;
    positions[i * 3] = originX;
    positions[i * 3 + 1] = originY;
    positions[i * 3 + 2] = 1 + Math.random() * .5;
    velocities[i * 3] = Math.cos(angle) * speed;
    velocities[i * 3 + 1] = Math.sin(angle) * speed + 1.2;
    velocities[i * 3 + 2] = 0;
    const color = new THREE.Color(palette[base % palette.length]);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({ size: 8, vertexColors: true, transparent: true, opacity: 1, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false, toneMapped: false });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 1000;
  scene.add(points);
  fireworks = { points, geometry, material, velocities, positions, age: 0 };
}

function updateFireworks(dt) {
  if (!fireworks) return;
  fireworks.age += dt;
  const { positions, velocities, geometry, material, age } = fireworks;
  for (let i = 0; i < velocities.length / 3; i++) {
    positions[i * 3] += velocities[i * 3] * dt;
    positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
    velocities[i * 3 + 1] -= 2.7 * dt;
  }
  geometry.attributes.position.needsUpdate = true;
  material.opacity = Math.max(0, 1 - age / 1.7);
  if (age >= 1.7) {
    scene.remove(fireworks.points);
    geometry.dispose();
    material.dispose();
    fireworks = null;
  }
}

function resize() {
  const width = wrap.clientWidth;
  const height = wrap.clientHeight;
  renderer.setSize(width, height, false);
  const aspect = width / height;
  const halfHeight = Math.max(gridSize * STEP * .56, aspect < 1.1 ? 4.18 : 4.05);
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
  el('#hearts').setAttribute('aria-label', t('hearts')(lives));
  const clear = Math.round((TOTAL - remaining) / TOTAL * 100);
  el('#progressText').textContent = `${clear}% ${t('clear')}`;
  el('#progressFill').style.width = `${clear}%`;
  el('#hintCount').textContent = hints;
  el('#hintBtn').disabled = hints === 0 || ended;
}

function applyLanguage() {
  document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
  document.title = `${t('gameName')} · ${language === 'en' ? 'Level 1' : '第一关'}`;
  const staticText = {
    '#brandName': 'gameName', '#tagline': 'tagline', '#remainingLabel': 'remaining',
  '#timeLabel': 'time', '#livesLabel': 'lives',
    '#boardHint': 'boardHint', '#instructionTitle': 'instruction', '#instructionDetail': 'collisionHint',
    '#hintLabel': 'hint', '#restartLabel': 'restart',
  };
  for (const [selector, key] of Object.entries(staticText)) el(selector).textContent = t(key);
  el('#boardName').textContent = t('boardName')(level);
  el('#stats').setAttribute('aria-label', t('gameState'));
  el('#boardFrame').setAttribute('aria-label', t('board'));
  el('#themeBtn').setAttribute('aria-label', t('themeLabel'));
  el('#themeBtn').title = t('themeLabel');
  el('#helpBtn').setAttribute('aria-label', t('helpLabel'));
  el('#helpBtn').title = t('helpLabel');
  el('#languageBtn').setAttribute('aria-label', t('languageLabel'));
  el('#languageBtn').title = t('languageLabel');
  el('#languageBtn').textContent = language === 'en' ? '中' : 'EN';
  const nextLevel = level === 4 ? 1 : level + 1;
  el('#levelBtn').textContent = t('levelButton')(nextLevel);
  el('#levelBtn').setAttribute('aria-label', t('levelTitle')(nextLevel));
  el('#levelBtn').title = t('levelTitle')(nextLevel);
  el('#levelNumber').textContent = `LEVEL ${String(level).padStart(2, '0')}`;
  if (!started && !ended) el('#boardStatus').textContent = t('boardStart');
  else if (started && !ended) el('#boardStatus').textContent = t('boardMoving');
  if (el('#overlayTitle').textContent) refreshOverlayText();
  updateHud();
}

function refreshOverlayText() {
  const title = el('#overlayTitle');
  if (title.dataset.kind === 'help') {
    el('#overlayKicker').textContent = t('helpKicker');
    title.textContent = t('helpTitle');
    el('#overlayBody').textContent = t('helpBody');
    el('#overlayButton').textContent = t('continue');
  } else if (title.dataset.kind === 'win') {
    el('#overlayKicker').textContent = t('completeKicker');
    title.textContent = t('completeTitle');
    const elapsed = levelConfig.timeSeconds - seconds;
    const time = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(Math.floor(elapsed % 60)).padStart(2, '0')}`;
    el('#overlayBody').textContent = t('completeBody')(time, arrows.length);
    el('#overlayButton').textContent = t('playAgain');
    el('#overlayButton').className = 'control-button primary';
  } else if (title.dataset.kind === 'next') {
    const nextLevel = level + 1;
    el('#overlayKicker').textContent = t('completeKicker');
    title.textContent = t('nextLevelTitle');
    el('#overlayBody').textContent = t('nextLevelBody')(nextLevel);
    el('#overlayButton').textContent = t('nextLevelButton');
    el('#overlayButton').className = 'control-button next-level-button';
  } else if (title.dataset.kind === 'loss') {
    el('#overlayKicker').textContent = t('retryKicker');
    title.textContent = lives === 0 ? t('outOfLives') : t('timeUp');
    el('#overlayBody').textContent = t('retryBody');
    el('#overlayButton').textContent = t('retry');
  }
}

function blockerFor(arrow) { return findMovingBlocker(arrow, arrows, levelConfig.collisionTolerance); }

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

function openOverlay({ symbol, kicker, title, body, button, action, kind = 'help', buttonClass = 'control-button primary' }) {
  el('#overlaySymbol').textContent = symbol;
  el('#overlayKicker').textContent = kicker;
  el('#overlayTitle').textContent = title;
  el('#overlayTitle').dataset.kind = kind;
  el('#overlayBody').textContent = body;
  el('#overlayButton').textContent = button;
  el('#overlayButton').className = buttonClass;
  overlayAction = action;
  el('#overlay').classList.toggle('celebrating', kind === 'next' || kind === 'win');
  el('#overlay').classList.remove('hidden');
}

function closeOverlay() {
  el('#overlay').classList.add('hidden');
  el('#overlay').classList.remove('celebrating');
}

function finish(won) {
  ended = true;
  audio.stop();
  if (won) {
    audio.victory();
    startFireworks();
  }
  else audio.failure();
  el('#boardStatus').textContent = won ? t('boardCleared') : t('boardEnded');
  updateHud();
  if (won && level < 4) {
    openOverlay({
      symbol: '✦', kicker: t('completeKicker'), title: t('nextLevelTitle'),
      body: t('nextLevelBody')(level + 1), button: t('nextLevelButton'), kind: 'next',
      buttonClass: 'control-button next-level-button',
      action: () => {
        level++;
        lastLayout = '';
        reset();
        applyLanguage();
      },
    });
    return;
  }
  openOverlay(won ? {
    symbol: '✦', kicker: t('completeKicker'), title: t('completeTitle'),
    body: t('completeBody')(`${String(Math.floor((levelConfig.timeSeconds - seconds) / 60)).padStart(2, '0')}:${String(Math.floor((levelConfig.timeSeconds - seconds) % 60)).padStart(2, '0')}`, arrows.length),
    button: t('playAgain'), action: reset, kind: 'win',
  } : {
    symbol: '↻', kicker: t('retryKicker'), title: lives === 0 ? t('outOfLives') : t('timeUp'),
    body: t('retryBody'),
    button: t('retry'), action: reset, kind: 'loss',
  });
}

function launch(arrow) {
  if (active.has(arrow.id) || ended || !arrow.alive || !el('#overlay').classList.contains('hidden')) return;
  audio.clear();
  if (!started) {
    started = true;
    el('#boardStatus').textContent = t('boardMoving');
    audio.startMusic();
  }
  active.set(arrow.id, { arrow, traveled: 0, phase: 'forward', hold: 0 });
}

async function reset() {
  const requestId = ++levelRequestId;
  audio.stop();
  closeOverlay();
  for (const arrow of arrows) { arrowLayer.remove(arrow.group); arrow.geometry.dispose(); arrow.material.dispose(); }
  arrows.length = 0;
  clearBoardDecoration();
  started = false;
  ended = true;
  active.clear();
  el('#boardStatus').textContent = t('boardLoading');
  updateHud();
  try {
    const response = await fetch(`/api/levels/${level}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Level API returned ${response.status}`);
    const data = await response.json();
    if (requestId !== levelRequestId) return;
    if (data.level !== level || !Number.isInteger(data.gridSize) || data.gridSize < 2 ||
        !Number.isFinite(data.timeSeconds) || !Number.isInteger(data.minArrowLength) ||
        data.minArrowLength < 2 || !Number.isInteger(data.maxArrowLength) ||
        data.maxArrowLength < data.minArrowLength) throw new Error('Invalid level response');
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const levelArrows = generateConfiguredLevel(seed, {
      grid: data.gridSize,
      minLength: data.minArrowLength,
      maxLength: data.maxArrowLength,
      minArrows: data.minArrows,
      maxArrows: data.maxArrows,
    });
    levelConfig = data;
    gridSize = data.gridSize;
    addBoardDecoration();
    resize();
    for (const definition of levelArrows) arrows.push(makeArrow(definition));
    seconds = data.timeSeconds;
    latestLoadedLevel = data.level;
    ended = false;
    el('#boardStatus').textContent = t('boardStart');
  } catch (error) {
    if (requestId !== levelRequestId) return;
    console.error('Could not load level', error);
    el('#boardStatus').textContent = t('boardLoadFailed');
  }
  lives = 3;
  hints = 3;
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
  const hitRadius = (touch ? 7 : 8) + levelConfig.hitRadius;
  if (closest && nearest <= hitRadius && second - nearest > (touch ? 2 : 1)) launch(closest);
}

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - lastFrame) / 1000, .05);
  lastFrame = now;
  updateFireworks(dt);
  if (started && !ended && el('#overlay').classList.contains('hidden')) {
    seconds = Math.max(0, seconds - dt);
    if (seconds <= 0) finish(false);
    else updateHud();
  }
  if (active.size && !ended && el('#overlay').classList.contains('hidden')) {
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
            showToast(t('hitToast'));
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
  }
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
  const edge = (gridSize - 1) * STEP / 2;
  return dx > 0 && x > edge + margin || dx < 0 && x < -edge - margin ||
    dy > 0 && y > edge + margin || dy < 0 && y < -edge - margin;
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
  showToast(t('safeToast'));
});
el('#themeBtn').addEventListener('click', () => {
  document.body.classList.toggle('light');
  renderer.setClearColor(document.body.classList.contains('light') ? 0xdfeaf1 : 0x1d2941, 1);
  el('#themeBtn').textContent = document.body.classList.contains('light') ? '☀' : '☾';
});
el('#helpBtn').addEventListener('click', () => openOverlay({
  symbol: '↗', kicker: t('helpKicker'), title: t('helpTitle'),
  body: t('helpBody'), button: t('continue'), action: closeOverlay,
}));
el('#languageBtn').addEventListener('click', () => {
  language = language === 'zh' ? 'en' : 'zh';
  try { localStorage.setItem('arrowSnakeLanguage', language); } catch { /* Keep the selected language for this session. */ }
  applyLanguage();
});
el('#levelBtn').addEventListener('click', () => {
  level = level === 4 ? 1 : level + 1;
  lastLayout = '';
  reset();
  applyLanguage();
});
el('#overlayButton').addEventListener('click', () => overlayAction?.());
window.addEventListener('resize', resize);
reset();
applyLanguage();
resize();
requestAnimationFrame(animate);

// Read-only snapshots allow geometry and browser interaction checks on the real scene.
window.arrowGame = { snapshot: () => ({
  lives, seconds, started, ended, level: latestLoadedLevel,
  active: [...active.values()].map(m => ({ id: m.arrow.id, phase: m.phase, traveled: m.traveled })),
  arrows: arrows.map(a => ({ id: a.id, alive: a.alive, cells: a.cells, direction: a.direction,
    length: a.route.length, points: a.points,
    blocker: blockerFor(a)?.snake.id ?? null })),
  view: { left: camera.left, right: camera.right, top: camera.top, bottom: camera.bottom },
}) };
