async function areBonusFeaturesAvailable(pool) {
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
  areBonusFeaturesAvailable,
  isMissingRelationError,
};