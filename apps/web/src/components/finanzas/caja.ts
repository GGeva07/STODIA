import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';

/** Caja y turno de la sesión: caja asignada al usuario en Catálogos (staff.caja → cajas) o la primera activa; turno según la hora. */
export interface CajaInfo { caja: string; turno: string; sucursal: string; cajaLabel: string }
interface Row { id: string; estado?: string; codigo?: string; usuario?: string; nombre?: string; caja?: string }

export const turnoAhora = (d = new Date()) => (d.getHours() < 12 ? 'Matutino' : d.getHours() < 18 ? 'Vespertino' : 'Nocturno');
const SUCURSAL = 'Principal'; // instalación de una sola sede: no hay catálogo de sucursales
let cache: CajaInfo | null = null;
export const cajaSync = (): CajaInfo => cache ?? { caja: '', turno: turnoAhora(), sucursal: SUCURSAL, cajaLabel: '' };

export function useCaja(): CajaInfo {
  const { user } = useSession();
  const [c, setC] = useState<CajaInfo>(cajaSync());
  useEffect(() => {
    if (!user) return;
    let vivo = true;
    Promise.all([api.get<Row[]>('/catalogos/staff'), api.get<Row[]>('/catalogos/cajas')]).then(([staff, cajas]) => {
      const mi = staff.find(s => s.usuario === user.usuario) ?? staff.find(s => s.nombre === user.nombre);
      const caja = cajas.find(x => x.id === mi?.caja && x.estado !== 'Inactiva') ?? cajas.find(x => x.estado === 'Activa');
      const nombre = caja?.codigo ?? '';
      cache = { caja: nombre, turno: turnoAhora(), sucursal: SUCURSAL, cajaLabel: nombre ? `${nombre} · Turno ${turnoAhora()}` : `Turno ${turnoAhora()}` };
      if (vivo) setC(cache);
    }).catch(() => { /* sin catálogo: se muestra solo el turno */ });
    return () => { vivo = false; };
  }, [user]);
  return c.cajaLabel ? c : { ...c, cajaLabel: `Turno ${c.turno}` };
}
