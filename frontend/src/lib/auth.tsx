import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from './api';
import { connectSocket, disconnectSocket } from './socket';

type Auth = { userId: string; role: string } | null;
const C = createContext<{ auth: Auth; loading: boolean; login: (email: string, password: string) => Promise<void>; logout: () => Promise<void> }>({ auth: null, loading: true, login: async () => {}, logout: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<Auth>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const bootstrap = async () => {
      if (!localStorage.getItem('tg_user')) { setLoading(false); return; }
      try { const me = await api.get('/users/me'); const a = { userId: me.data.data.id, role: me.data.data.role }; localStorage.setItem('tg_user', JSON.stringify(a)); setAuth(a); connectSocket(); }
      catch { localStorage.removeItem('tg_access'); localStorage.removeItem('tg_user'); setAuth(null); }
      finally { setLoading(false); }
    };
    void bootstrap();
  }, []);

  const value = useMemo(() => ({
    auth, loading,
    login: async (email: string, password: string) => { const r = await api.post('/auth/login', { email, password }); localStorage.setItem('tg_access', r.data.data.accessToken); const me = await api.get('/users/me'); const a = { userId: me.data.data.id, role: me.data.data.role }; localStorage.setItem('tg_user', JSON.stringify(a)); setAuth(a); connectSocket(); },
    logout: async () => { try { await api.post('/auth/logout', {}); } finally { disconnectSocket(); localStorage.removeItem('tg_access'); localStorage.removeItem('tg_user'); setAuth(null); } }
  }), [auth, loading]);
  return <C.Provider value={value}>{children}</C.Provider>;
}
export const useAuth = () => useContext(C);
