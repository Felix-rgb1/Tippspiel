const TEAM_COLORS = {
  Deutschland: '#000000',
  Spanien: '#c1121f',
  Frankreich: '#1d4ed8',
  Italien: '#2563eb',
  England: '#ef4444',
  Portugal: '#15803d',
  Niederlande: '#ea580c',
  Argentinien: '#38bdf8',
  Brasilien: '#16a34a',
  Belgien: '#facc15',
  Kroatien: '#dc2626',
  Schweiz: '#b91c1c',
  USA: '#1e3a8a',
  Mexiko: '#166534',
  Japan: '#be123c',
  Suedkorea: '#dc2626',
  Australien: '#facc15',
  Marokko: '#be123c',
};

function hexToRgba(hex, alpha) {
  const normalized = hex.replace('#', '');
  const full = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized;

  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getTeamColor(teamName) {
  return TEAM_COLORS[teamName] || '#334155';
}

export function getMatchThemeStyle(homeTeam, awayTeam) {
  const homeColor = getTeamColor(homeTeam);
  const awayColor = getTeamColor(awayTeam);

  return {
    background: `linear-gradient(155deg, ${hexToRgba(homeColor, 0.12)} 0%, ${hexToRgba(awayColor, 0.12)} 100%)`,
    borderColor: hexToRgba(homeColor, 0.28),
  };
}
