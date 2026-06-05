-- Add group_name column to matches table for WM 2026 group stage
ALTER TABLE matches ADD COLUMN IF NOT EXISTS group_name VARCHAR(20);

-- Index for fast group-based queries
CREATE INDEX IF NOT EXISTS idx_matches_group_name ON matches(group_name);
