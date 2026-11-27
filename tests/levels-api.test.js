import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/api/levels/[[level]].js';

function mockDb(config) {
  const bound = [];
  return {
    bound,
    prepare() {
      return {
        bind(value) {
          bound.push(value);
          return { first: async () => config };
        },
      };
    },
  };
}

test('levels API rejects unsupported level ids', async () => {
  const response = await onRequestGet({ params: { level: '9' }, env: {} });
  assert.equal(response.status, 404);
});

test('levels API reports missing D1 binding clearly', async () => {
  const response = await onRequestGet({ params: { level: '1' }, env: {} });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /database/i);
});

test('levels API reads config from D1 and returns configuration only', async () => {
  const db = mockDb({ id: 2, grid_size: 27, min_arrow_length: 9, max_arrow_length: 33,
    min_arrows: null, max_arrows: null, time_seconds: 180, arrow_radius: .019,
    arrow_tip_length: .065, arrow_tip_width: .06, hit_radius: 0, collision_tolerance: .045 });
  const response = await onRequestGet({ params: { level: '2' }, env: { LEVELS_DB: db } });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.level, 2);
  assert.equal(payload.gridSize, 27);
  assert.equal(payload.timeSeconds, 180);
  assert.equal(payload.minArrowLength, 9);
  assert.equal(payload.maxArrowLength, 33);
  assert.equal('arrows' in payload, false);
  assert.deepEqual(db.bound, [2]);
});
