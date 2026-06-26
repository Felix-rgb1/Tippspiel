-- Migration: Add penalty shootout support to matches table

-- Add columns for penalty shootout handling
ALTER TABLE matches ADD COLUMN IF NOT EXISTS penalty_decided BOOLEAN DEFAULT false;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS penalty_winner VARCHAR(10) DEFAULT NULL CHECK (penalty_winner IS NULL OR penalty_winner IN ('home', 'away'));
ALTER TABLE matches ADD COLUMN IF NOT EXISTS home_goals_90 INTEGER DEFAULT NULL;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS away_goals_90 INTEGER DEFAULT NULL;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS home_elfmeter_scored INTEGER DEFAULT NULL;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS away_elfmeter_scored INTEGER DEFAULT NULL;

-- Create index for penalty queries
CREATE INDEX IF NOT EXISTS idx_matches_penalty_decided ON matches(penalty_decided);

-- Comment: 
-- home_goals and away_goals now contain the FINAL result (with penalty adjustment if applicable)
-- home_goals_90 and away_goals_90 store the 90-minute result for reference
-- home_elfmeter_scored and away_elfmeter_scored store the number of penalties scored by each team
-- Final calculation: home_goals = home_goals_90 + home_elfmeter_scored (when penalty_decided = true)
-- Final calculation: away_goals = away_goals_90 + away_elfmeter_scored (when penalty_decided = true)
-- Example: 1:1 after 120 min, penalties 5:4 → final result 6:5 (1+5 : 1+4)
