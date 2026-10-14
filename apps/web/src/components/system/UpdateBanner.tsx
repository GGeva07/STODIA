import { useCallback, useEffect, useState } from 'react';
import type { ActResumen } from '@stodia/shared';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { Modal, useToast } from './UiProvider';

const fecha = (iso?: string) => (iso ? new Date(iso).toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' }) : '');

/**
 * Aviso de actualización (solo Super Admin). Nada se instala solo: el administrador la prueba/aprueba
 * y el actualizador del servidor la aplica (respaldo previo y vuelta atrás si falla). Ver apps/api/src/lib/actualizacion.ts.
 */
export function UpdateBanner() {
  const { user } = useSession();
  const toast = useToast();
  const [r, setR] = useState<ActResumen | null>(null);
  const [ver, setVer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [oculto, setOculto] = useState(() => sessionStorage.getItem('stodia.actOculta') ?? '');
  const esSA = user?.rol === 'Super Admin';

  const cargar = useCallback(() => { if (esSA) api.get<ActResumen>('/actualizacion').then(setR).catch(() => undefined); }, [esSA]);
  useEffect(() => { cargar(); const t = setInterval(cargar, 30 * 60_000); return () => clearInterval(t); }, [cargar]);
  // Mientras se aplica, se consulta seguido para avisar cuando termine (la página se recarga sola al cambiar la versión).
  useEffect(() => {
    if (!r?.solicitud) return;
    const t = setInterval(cargar, 20_000);
    return () => clearInterval(t);
  }, [r?.solicitud, cargar]);

  if (!esSA || !r) return null;

  // El último intento falló y esa versión sigue siendo la disponible: se avisa (se puede volver a aprobar desde «Ver novedades»).
  const ultimo = r.ultimo && (r.ultimo.estado === 'error' || r.ultimo.estado === 'revertida') && r.disponible?.version === r.ultimo.version && oculto !== 'fallo:' + r.ultimo.version ? r.ultimo : null;
  if (r.solicitud) {
    return (
      <div role="status" className="sticky top-0 z-10 -mx-6 -mt-3.5 mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-[#BFDBFE] bg-[#EFF6FF] px-6 py-2 text-[13px] text-[#1E3A8A]">
        <i className="ph ph-clock-countdown text-base" />
        <span>Actualización a la versión <b>{r.solicitud.version}</b> aprobada por {r.solicitud.aprobadaPor}. El servidor la aplicará en los próximos minutos; guarda tu trabajo.</span>
        <button disabled={busy} onClick={async () => { setBusy(true); try { await api.post('/actualizacion/cancelar'); toast('Actualización cancelada', 'info'); cargar(); } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cancelar', 'bad'); } finally { setBusy(false); } }}
          className="ml-auto rounded-md border border-[#93C5FD] bg-white px-2.5 py-1 text-[12.5px] font-medium">Cancelar</button>
      </div>
    );
  }
  if (ultimo) {
    return (
      <div role="alert" className="sticky top-0 z-10 -mx-6 -mt-3.5 mb-3 flex items-center gap-3 border-b border-[#FCA5A5] bg-[#FEF2F2] px-6 py-2 text-[13px] text-[#991B1B]">
        <i className="ph ph-warning-circle text-base" />
        <span>La actualización a {ultimo.version} no se completó y el sistema volvió a la versión anterior. Tus datos están intactos. {ultimo.mensaje}</span>
        <button onClick={() => { sessionStorage.setItem('stodia.actOculta', 'fallo:' + ultimo.version); setOculto('fallo:' + ultimo.version); }} className="ml-auto text-[12.5px] underline">Entendido</button>
      </div>
    );
  }
  if (!r.disponible || oculto === r.disponible.version) return null;
  const d = r.disponible;
  return (
    <>
      <div role="status" className="sticky top-0 z-10 -mx-6 -mt-3.5 mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-[#BBF7D0] bg-[#F0FDF4] px-6 py-2 text-[13px] text-[#14532D]">
        <i className="ph ph-arrow-circle-up text-base" />
        <span>Hay una versión nueva de STODIA: <b>{d.version}</b> (tienes la {r.actual}).</span>
        <button onClick={() => setVer(true)} className="ml-auto rounded-md bg-[#16A34A] px-3 py-1 text-[12.5px] font-medium text-white">Ver novedades</button>
        <button onClick={() => { sessionStorage.setItem('stodia.actOculta', d.version); setOculto(d.version); }} className="text-[12.5px] underline">Más tarde</button>
      </div>
      {ver && (
        <Modal onClose={() => setVer(false)} width={520}>
          <div className="p-5">
            <h2 className="text-[17px] font-semibold text-ink">Versión {d.version}</h2>
            {d.fecha && <p className="mt-0.5 text-xs text-slate-500">Publicada el {fecha(d.fecha)}</p>}
            {!!d.notas?.length && <ul className="mt-3 list-disc space-y-1 pl-5 text-[13.5px] text-slate-700">{d.notas.map((n, i) => <li key={i}>{n}</li>)}</ul>}
            <p className="mt-4 rounded-lg bg-slate-50 p-3 text-[12.5px] text-slate-600">
              Al aprobarla, el servidor hace un respaldo, instala la versión nueva y comprueba que todo responde. Si algo falla vuelve solo a la versión actual.
              El sistema puede quedar sin servicio uno o dos minutos: hazlo fuera del horario de caja.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setVer(false)} className="rounded-md border border-slate-300 px-3.5 py-2 text-[13px]">Ahora no</button>
              <button disabled={busy} onClick={async () => {
                setBusy(true);
                try { await api.post('/actualizacion/aprobar', { version: d.version }); toast('Actualización aprobada', 'ok'); setVer(false); cargar(); }
                catch (e) { toast(e instanceof Error ? e.message : 'No se pudo aprobar', 'bad'); }
                finally { setBusy(false); }
              }} className="rounded-md bg-accent px-3.5 py-2 text-[13px] font-medium text-white disabled:opacity-50">{busy ? 'Aprobando…' : 'Aprobar e instalar'}</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
