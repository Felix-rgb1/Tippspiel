import axios from 'axios';

const runtimeHostname = typeof window !== 'undefined' ? window.location.hostname : '';
const isLocalDevelopmentHost = runtimeHostname === 'localhost' || runtimeHostname === '127.0.0.1';
const configuredApiUrl = import.meta.env.VITE_API_URL;
const API_URL = configuredApiUrl || (isLocalDevelopmentHost ? 'http://localhost:5000/api' : '');

function ensureApiConfigured() {
  if (!API_URL) {
    const error = new Error('API_NOT_CONFIGURED');
    error.code = 'API_NOT_CONFIGURED';
    throw error;
  }
}

function apiGet(url, config) {
  ensureApiConfigured();
  return api.get(url, config);
}

function apiPost(url, data, config) {
  ensureApiConfigured();
  return api.post(url, data, config);
}

function apiPut(url, data, config) {
  ensureApiConfigured();
  return api.put(url, data, config);
}

function apiDelete(url, config) {
  ensureApiConfigured();
  return api.delete(url, config);
}

const api = axios.create({
  baseURL: API_URL || undefined,
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth
export const authAPI = {
  register: (username, password) =>
    apiPost('/auth/register', { username, password }),
  login: (identifier, password) =>
    apiPost('/auth/login', { identifier, password }),
};

// Matches
export const matchAPI = {
  getAll: () => apiGet('/matches'),
  getById: (id) => apiGet(`/matches/${id}`),
  getInsights: (id) => apiGet(`/matches/${id}/insights`),
};

// Tips
export const tipAPI = {
  submit: (matchId, homeGoals, awayGoals) =>
    apiPost('/tips', { match_id: matchId, home_goals: homeGoals, away_goals: awayGoals }),
  getUserTips: (userId) => apiGet(`/tips/user/${userId}`),
  getVisibleTips: () => apiGet('/tips/visible'),
  getBonusTip: () => apiGet('/tips/bonus/me'),
  submitBonusTip: (championTeam, runnerUpTeam) =>
    apiPost('/tips/bonus', { champion_team: championTeam, runner_up_team: runnerUpTeam }),
};

// Leaderboard
export const leaderboardAPI = {
  getAll: () => apiGet('/leaderboard'),
  getUserStats: (userId) => apiGet(`/leaderboard/user/${userId}`),
  getMatchday: (round) => apiGet('/leaderboard/matchday', { params: { round } }),
  compare: (otherId) => apiGet(`/leaderboard/compare/${otherId}`),
};

// User
export const userAPI = {
  getProfile: () => apiGet('/user/profile'),
  updateProfile: (username, email) =>
    apiPut('/user/profile', { username, email }),
  changePassword: (oldPassword, newPassword) =>
    apiPost('/user/change-password', { oldPassword, newPassword }),
};

// Admin
export const adminAPI = {
  createMatch: (homeTeam, awayTeam, matchDate, round) =>
    apiPost('/admin/matches', { home_team: homeTeam, away_team: awayTeam, match_date: matchDate, round }),
  updateMatch: (matchId, homeTeam, awayTeam, matchDate, round, resetResult) =>
    apiPut(`/admin/matches/${matchId}`, {
      home_team: homeTeam,
      away_team: awayTeam,
      match_date: matchDate,
      round,
      reset_result: resetResult
    }),
  syncMatches: () => apiPost('/admin/matches/sync', {}),
  importBundesliga: () => apiPost('/admin/matches/import/bundesliga', {}),
  updateMatchResult: (matchId, homeGoals, awayGoals) =>
    apiPut(`/admin/matches/${matchId}/result`, { home_goals: homeGoals, away_goals: awayGoals }),
  getUsers: () => apiGet('/admin/users'),
  updateUser: (userId, username, email, role) =>
    apiPut(`/admin/users/${userId}`, { username, email, role }),
  resetUserPassword: (userId, newPassword) =>
    apiPost(`/admin/users/${userId}/reset-password`, { newPassword }),
  deleteUser: (userId) => apiDelete(`/admin/users/${userId}`),
  exportTipsExcel: () => apiGet('/admin/tips/export', { responseType: 'blob' }),
  getBonusResult: () => apiGet('/admin/bonus-result'),
  updateBonusResult: (championTeam, runnerUpTeam, championPoints, runnerUpPoints) =>
    apiPut('/admin/bonus-result', {
      champion_team: championTeam,
      runner_up_team: runnerUpTeam,
      champion_points: championPoints,
      runner_up_points: runnerUpPoints,
    }),
};

export default api;
