CREATE TABLE IF NOT EXISTS levels (
  id INTEGER PRIMARY KEY,
  grid_size INTEGER NOT NULL,
  min_arrow_length INTEGER NOT NULL,
  max_arrow_length INTEGER NOT NULL,
  min_arrows INTEGER,
  max_arrows INTEGER,
  time_seconds INTEGER NOT NULL,
  arrow_radius REAL NOT NULL,
  arrow_tip_length REAL NOT NULL,
  arrow_tip_width REAL NOT NULL,
  hit_radius INTEGER NOT NULL,
  collision_tolerance REAL NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR REPLACE INTO levels (
  id, grid_size, min_arrow_length, max_arrow_length, min_arrows, max_arrows,
  time_seconds, arrow_radius, arrow_tip_length, arrow_tip_width, hit_radius,
  collision_tolerance
) VALUES
  (1, 19, 32, 55, NULL, NULL, 60, 0.043, 0.12, 0.11, 5, 0.09),
  (2, 27, 9, 33, NULL, NULL, 180, 0.019, 0.065, 0.060, 0, 0.045),
  (3, 33, 12, 42, 70, 80, 240, 0.019, 0.065, 0.060, 2, 0.065);
