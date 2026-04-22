const TEAM_COLORS = {
  Aegypten: '#ef4444',
  Argentinien: '#38bdf8',
  Australien: '#e3fa15',
  Belgien: '#facc15',
  Bolivien: '#16a34a',
  Brasilien: '#16a34a',
  Chile: '#dc2626',
  China: '#dc2626',
  'Costa Rica': '#dc2626',
  Daenemark: '#b91c1c',
  Deutschland: '#000000',
  Ecuador: '#facc15',
  Elfenbeinkueste: '#f59e0b',
  England: '#ef4444',
  Frankreich: '#1d4ed8',
  Ghana: '#b91c1c',
  Griechenland: '#2563eb',
  Iran: '#16a34a',
  Irak: '#dc2626',
  Island: '#2563eb',
  Israel: '#1d4ed8',
  Italien: '#2563eb',
  Jamaika: '#16a34a',
  Japan: '#be123c',
  Kamerun: '#16a34a',
  Kanada: '#dc2626',
  Katar: '#7f1d1d',
  Kolumbien: '#facc15',
  Kroatien: '#dc2626',
  Marokko: '#be123c',
  Mexiko: '#166534',
  Neuseeland: '#0f172a',
  Niederlande: '#ea580c',
  Nigeria: '#16a34a',
  Norwegen: '#dc2626',
  Oesterreich: '#dc2626',
  Panama: '#ef4444',
  Paraguay: '#dc2626',
  Peru: '#dc2626',
  Polen: '#dc2626',
  Portugal: '#15803d',
  Rumaenien: '#facc15',
  'Saudi-Arabien': '#166534',
  Schottland: '#1d4ed8',
  Schweden: '#facc15',
  Schweiz: '#b91c1c',
  Senegal: '#15803d',
  Serbien: '#dc2626',
  Slowakei: '#2563eb',
  Slowenien: '#2563eb',
  Spanien: '#c1121f',
  Suedafrika: '#15803d',
  Suedkorea: '#dc2626',
  Tschechien: '#dc2626',
  Tunesien: '#dc2626',
  Tuerkei: '#dc2626',
  USA: '#1e3a8a',
  Ukraine: '#facc15',
  Ungarn: '#dc2626',
  Uruguay: '#38bdf8',
  Venezuela: '#facc15',
  Wales: '#dc2626',
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
