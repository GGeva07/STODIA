import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { LicenciaInfo, ScreenId } from '@stodia/shared';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';

interface LicCtx {
  info: LicenciaInfo | null;
  reload: () => Promise<void>;
  /** ¿La licencia habilita esta pantalla? (true mientras no haya cargado). */
  screenOn: (id: ScreenId) => boolean;
}
const Ctx = createContext<LicCtx | null>(null);

export function LicenseProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const [info, setInfo] = useState<LicenciaInfo | null>(null);
  const reload = useCallback(async () => {
    try { setInfo(await api.get<LicenciaInfo>('/licencia')); } catch { /* 401/403: la sesión o el guard lo gestiona */ }
  }, []);
  useEffect(() => { if (user) void reload(); else setInfo(null); }, [user, reload]);
  const value = useMemo<LicCtx>(() => ({
    info, reload,
    screenOn: id => !info || id === 'licencia' || info.screens.includes(id),
  }), [info, reload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLicense() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useLicense requiere <LicenseProvider>');
  return c;
}
