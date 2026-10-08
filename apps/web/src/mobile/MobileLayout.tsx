import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { getConfig } from '../lib/api';
import { useSession } from '../lib/session';

/** Layout móvil (portal tutor 390x800 / lista en tableta). Ancho fluido con tope para tableta. */
export default function MobileLayout() {
  const { user, logout } = useSession();
  useEffect(() => { if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {}); }, []);
  return (
    <div className="mx-auto flex h-[100vh] h-[100dvh] w-full max-w-[1080px] flex-col overflow-hidden bg-canvas">
      <header className="z-10 flex flex-none items-center justify-between bg-accent px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <span className="font-semibold">{getConfig().institutionName || 'STODIA'}</span>
        <button className="flex items-center gap-2 text-sm" onClick={logout} aria-label="Salir">
          {user?.nombre}
          <i className="ph ph-sign-out text-lg" />
        </button>
      </header>
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        <Outlet />
      </main>
    </div>
  );
}
