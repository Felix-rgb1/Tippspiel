ALTER TABLE matches ADD COLUMN IF NOT EXISTS round VARCHAR(100);
ALTER TABLE matches ADD COLUMN IF NOT EXISTS external_source VARCHAR(50);
ALTER TABLE matches ADD COLUMN IF NOT EXISTS external_id BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_external_source_id
ON matches (external_source, external_id);