const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export async function onRequestGet({ params, env }) {
  const levelId = Number(params.level);
  if (!Number.isInteger(levelId) || levelId < 1 || levelId > 4) {
    return json({ error: 'Level not found' }, 404);
  }

  if (!env.LEVELS_DB) return json({ error: 'Level database is not configured' }, 503);

  const config = await env.LEVELS_DB.prepare(`
    SELECT id, grid_size, min_arrow_length, max_arrow_length, min_arrows,
           max_arrows, time_seconds, arrow_radius, arrow_tip_length,
           arrow_tip_width, hit_radius, collision_tolerance
    FROM levels WHERE id = ?
  `).bind(levelId).first();

  if (!config) return json({ error: 'Level configuration not found' }, 404);

  return json({
    level: config.id,
    gridSize: config.grid_size,
    minArrowLength: config.min_arrow_length,
    maxArrowLength: config.max_arrow_length,
    minArrows: config.min_arrows,
    maxArrows: config.max_arrows,
    timeSeconds: config.time_seconds,
    arrowRadius: config.arrow_radius,
    arrowTipLength: config.arrow_tip_length,
    arrowTipWidth: config.arrow_tip_width,
    hitRadius: config.hit_radius,
    collisionTolerance: config.collision_tolerance,
  });
}
