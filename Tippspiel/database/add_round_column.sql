-- Add round column to matches table
ALTER TABLE matches ADD COLUMN IF NOT EXISTS round VARCHAR(100);
