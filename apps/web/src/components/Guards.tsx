import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { ScreenId } from '@stodia/shared';
import { canAccess, homeFor, useAccessVersion } from '../lib/access';
import { useSession } from '../lib/session';
import CambiarClave from './CambiarClave';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const loc = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (user.mustChange) return <CambiarClave />;
  return <>{children}</>;
}

/** RBAC por pantalla según ACCESS (lib/access.ts). */
export function RequireScreen({ id, children }: { id: ScreenId; children: ReactNode }) {
  const { user } = useSession();
  useAccessVersion();
  if (!user) return null;
  if (!canAccess(user.rol, id)) return <Navigate to={homeFor(user.rol)} replace />;
  return <>{children}</>;
}
