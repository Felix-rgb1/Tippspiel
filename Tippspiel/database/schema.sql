-- Create tables for Tippspiel

-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Matches table
CREATE TABLE matches (
  id SERIAL PRIMARY KEY,
  home_team VARCHAR(100) NOT NULL,
  away_team VARCHAR(100) NOT NULL,
  match_date TIMESTAMP NOT NULL,
  round VARCHAR(100),
  home_goals INTEGER,
  away_goals INTEGER,
  finished BOOLEAN DEFAULT false,
  external_source VARCHAR(50),
  external_id BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tips table
CREATE TABLE tips (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  home_goals INTEGER NOT NULL,
  away_goals INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, match_id)
);

-- Bonus questions (Weltmeister + Vizemeister)
CREATE TABLE bonus_tips (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  champion_team VARCHAR(100) NOT NULL,
  runner_up_team VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (champion_team <> runner_up_team)
);

-- Actual tournament result for bonus scoring (single-row config)
CREATE TABLE tournament_bonus_result (
  id INTEGER PRIMARY KEY DEFAULT 1,
  champion_team VARCHAR(100) NOT NULL,
  runner_up_team VARCHAR(100) NOT NULL,
  champion_points INTEGER NOT NULL DEFAULT 5,
  runner_up_points INTEGER NOT NULL DEFAULT 3,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (id = 1),
  CHECK (champion_team <> runner_up_team)
);

-- Indices for better performance
CREATE INDEX idx_matches_date ON matches(match_date);
CREATE UNIQUE INDEX idx_matches_external_source_id ON matches(external_source, external_id);
CREATE INDEX idx_tips_user_id ON tips(user_id);
CREATE INDEX idx_tips_match_id ON tips(match_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_matches_round_finished ON matches(round, finished);

-- Insert sample data (optional)
-- INSERT INTO matches (home_team, away_team, match_date) VALUES
-- ('Deutschland', 'Spanien', '2026-06-15 20:00:00'),
-- ('Brasilien', 'Frankreich', '2026-06-15 17:00:00'),
-- ('Argentinien', 'Niederlande', '2026-06-16 20:00:00');
