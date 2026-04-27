let bonusSchemaReadyPromise = null;

async function ensureBonusFeaturesSchema(pool) {
  if (!bonusSchemaReadyPromise) {
    bonusSchemaReadyPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS bonus_tips (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          champion_team VARCHAR(100) NOT NULL,
          runner_up_team VARCHAR(100) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CHECK (champion_team <> runner_up_team)
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS tournament_bonus_result (
          id INTEGER PRIMARY KEY DEFAULT 1,
          champion_team VARCHAR(100) NOT NULL,
          runner_up_team VARCHAR(100) NOT NULL,
          champion_points INTEGER NOT NULL DEFAULT 5,
          runner_up_points INTEGER NOT NULL DEFAULT 3,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CHECK (id = 1),
          CHECK (champion_team <> runner_up_team)
        )
      `);
    })().catch((error) => {
      bonusSchemaReadyPromise = null;
      throw error;
    });
  }

  await bonusSchemaReadyPromise;
}

async function areBonusFeaturesAvailable(pool) {
  try {
    await ensureBonusFeaturesSchema(pool);
  } catch (error) {
    return false;
  }

  const result = await pool.query(`
    SELECT
      to_regclass('public.bonus_tips') AS bonus_tips_table,
      to_regclass('public.tournament_bonus_result') AS tournament_bonus_result_table
  `);

  const row = result.rows[0] || {};

  return Boolean(row.bonus_tips_table && row.tournament_bonus_result_table);
}

function isMissingRelationError(error) {
  return error?.code === '42P01';
}

module.exports = {
  ensureBonusFeaturesSchema,
  areBonusFeaturesAvailable,
  isMissingRelationError,
};