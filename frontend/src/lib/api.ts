import axios from 'axios';

export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1', withCredentials: true });

api.interceptors.request.use(config => {
  const token = localStorage.getItem('tg_access');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string> | null = null;
api.interceptors.response.use(response => response, async error => {
  const original = error.config as (typeof error.config & { _retry?: boolean });
  const url = String(original?.url || '');
  if (error.response?.status !== 401 || original?._retry || url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/refresh')) throw error;
  original._retry = true;
  refreshing ??= api.post('/auth/refresh', {}).then(response => {
    const token = response.data.data.accessToken as string;
    localStorage.setItem('tg_access', token);
    return token;
  }).finally(() => { refreshing = null; });
  const token = await refreshing;
  original.headers.Authorization = `Bearer ${token}`;
  return api(original);
});
