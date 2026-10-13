import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { LoginRequest, LoginResponse, SessionUser } from '@stodia/shared';
import { limpiarBorradores } from './draftStore';
import { api, setCicloHeader, tokenStore, UNAUTHORIZED_EVENT } from './api';

const USER_KEY = 'stodia.user';

interface SessionCtx {
  user: SessionUser | null;
  login: (c: LoginRequest) => Promise<SessionUser>;
  logout: () => void;
  /** Adopta una sesión nueva (p. ej. tras cambiar la contraseña temporal). */
  setSession: (res: LoginResponse) => void;
}

const Ctx = createContext<SessionCtx | null>(null);

function readUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw && tokenStore.get() ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(readUser);

  const logout = useCallback(() => {
    tokenStore.clear();
    setCicloHeader(''); // el ciclo consultado (Fase 2D) no sobrevive a la sesión: la API vuelve a no recibir X-Ciclo
    localStorage.removeItem(USER_KEY);
    limpiarBorradores(); // los borradores de formularios (sessionStorage) no sobreviven a la sesión
    setUser(null);
  }, []);

  const setSession = useCallback((res: LoginResponse) => {
    tokenStore.set(res.token);
    limpiarBorradores(res.user.usuario); // otro usuario: descarta los borradores ajenos
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    setUser(res.user);
  }, []);

  const login = useCallback(async (c: LoginRequest) => {
    const res = await api.post<LoginResponse>('/auth/login', c);
    setSession(res);
    return res.user;
  }, [setSession]);

  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, logout);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, logout);
  }, [logout]);

  const value = useMemo(() => ({ user, login, logout, setSession }), [user, login, logout, setSession]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession fuera de SessionProvider');
  return v;
}
