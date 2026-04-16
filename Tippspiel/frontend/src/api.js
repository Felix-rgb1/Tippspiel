import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
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
  register: (username, email, password) =>
    api.post('/auth/register', { username, email, password }),
  login: (email, password) =>
    api.post('/auth/login', { email, password }),
};

// Matches
export const matchAPI = {
  getAll: () => api.get('/matches'),
  getById: (id) => api.get(`/matches/${id}`),
};

// Tips
export const tipAPI = {
  submit: (matchId, homeGoals, awayGoals) =>
    api.post('/tips', { match_id: matchId, home_goals: homeGoals, away_goals: awayGoals }),
  getUserTips: (userId) => api.get(`/tips/user/${userId}`),
};

// Leaderboard
export const leaderboardAPI = {
  getAll: () => api.get('/leaderboard'),
  getUserStats: (userId) => api.get(`/leaderboard/user/${userId}`),
};

// User
export const userAPI = {
  getProfile: () => api.get('/user/profile'),
  updateProfile: (username, email) =>
    api.put('/user/profile', { username, email }),
  changePassword: (oldPassword, newPassword) =>
    api.post('/user/change-password', { oldPassword, newPassword }),
};

// Admin
export const adminAPI = {
  createMatch: (homeTeam, awayTeam, matchDate) =>
    api.post('/admin/matches', { home_team: homeTeam, away_team: awayTeam, match_date: matchDate }),
  updateMatchResult: (matchId, homeGoals, awayGoals) =>
    api.put(`/admin/matches/${matchId}/result`, { home_goals: homeGoals, away_goals: awayGoals }),
  getUsers: () => api.get('/admin/users'),
  deleteUser: (userId) => api.delete(`/admin/users/${userId}`),
};

export default api;
