-- Add bonus questions and tournament bonus result support

CREATE TABLE IF NOT EXISTS bonus_tips (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  champion_team VARCHAR(100) NOT NULL,
  runner_up_team VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (champion_team <> runner_up_team)
);

CREATE TABLE IF NOT EXISTS tournament_bonus_result (
  id INTEGER PRIMARY KEY DEFAULT 1,
  champion_team VARCHAR(100) NOT NULL,
  runner_up_team VARCHAR(100) NOT NULL,
  champion_points INTEGER NOT NULL DEFAULT 5,
  runner_up_points INTEGER NOT NULL DEFAULT 3,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (id = 1),
  CHECK (champion_team <> runner_up_team)
);

CREATE INDEX IF NOT EXISTS idx_matches_round_finished ON matches(round, finished);
