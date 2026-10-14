import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { InformeCierreFila, InformeGrupo, InformeMeta } from '@stodia/shared';
import { btn, card, td, th } from '../../components/system/styles';
import { fmt } from '../../components/finanzas/fin';
import { api } from '../../lib/api';
import { canAccess, screenTitle, useAccessVersion } from '../../lib/access';
import { useSession } from '../../lib/session';
import CierreInformeView from './CierreInformeView';
import Visor from './Visor';

/**
 * Sección «Informes». Una pantalla sirve a las 5 entradas del menú (inf-cierre, inf-facturacion, inf-estudiantes, inf-inventario, inf-cxc): según la ruta
 * (/inf-xxx[/<informe>]) lista los informes del grupo y abre cada uno en el visor genérico. Catálogo y permisos: GET /informes (apps/api/src/lib/informes/registro.ts).
 */
const GRUPOS: Record<InformeGrupo, { icono: string; texto: string }> = {
  'inf-cierre': { icono: 'ph-calendar-check', texto: 'Resúmenes guardados al cerrar cada año escolar y los informes de cierre de año.' },
  'inf-facturacion': { icono: 'ph-receipt', texto: 'Recaudación, devoluciones y notas fiscales. Información sensible: solo los roles autorizados.' },
  'inf-estudiantes': { icono: 'ph-graduation-cap', texto: 'Informes sobre el alumnado y las actividades extracurriculares.' },
  'inf-inventario': { icono: 'ph-package', texto: 'Informes de inventario y tienda escolar.' },
  'inf-cxc': { icono: 'ph-chart-line-up', texto: 'Cuentas por cobrar y planes de pago: quién debe, cuánto y desde cuándo.' },
};

function CierresCerrados({ onAbrir }: { onAbrir: (ciclo: string) => void }) {
  const [filas, setFilas] = useState<InformeCierreFila[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.get<InformeCierreFila[]>('/informes/cierres').then(setFilas).catch(e => setErr((e as Error).message)); }, []);
  return (
    <section className={`${card} overflow-hidden`}>
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="m-0 text-sm font-semibold">Años escolares cerrados</h2>
        <p className="m-0 mt-0.5 text-xs text-slate-500">Abre el resumen guardado de cada cierre: totales contables y deuda por alumno al cerrar. Para cerrar un año nuevo ve a Configuración › Ciclos lectivos.</p>
      </div>
      {err ? <div role="alert" className="m-3 rounded-md bg-bad-bg px-3 py-2 text-xs text-[#B91C1C]">{err}</div>
        : !filas ? <div className="px-4 py-6 text-center text-sm text-slate-500" role="status">Cargando años cerrados…</div>
        : !filas.length ? <div className="px-4 py-6 text-center text-sm text-slate-500">Aún no se ha cerrado ningún año escolar.</div>
        : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead><tr><th className={th}>Ciclo</th><th className={th}>Fecha de cierre</th><th className={th}>Cerrado por</th><th className={`${th} !text-right`}>Facturado</th><th className={`${th} !text-right`}>Cobrado</th><th className={`${th} !text-right`}>Pendiente</th><th className={th} /></tr></thead>
              <tbody>
                {filas.map(c => (
                  <tr key={c.ciclo} className="h-11 hover:bg-slate-50">
                    <td className={`${td} font-mono font-semibold`}>{c.ciclo}</td>
                    <td className={td}>{c.fecha ?? <span className="text-slate-400">Anterior al registro de cierres</span>}</td>
                    <td className={td}>{c.usuario ?? '—'}</td>
                    <td className={`${td} text-right font-mono`}>{c.facturado === null ? '—' : fmt(c.facturado)}</td>
                    <td className={`${td} text-right font-mono`}>{c.cobrado === null ? '—' : fmt(c.cobrado)}</td>
                    <td className={`${td} text-right font-mono`}>{c.pendiente === null ? '—' : fmt(c.pendiente)}</td>
                    <td className={`${td} text-right`}><button type="button" className={btn} onClick={() => onAbrir(c.ciclo)}><i className="ph ph-receipt" />Ver resumen</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </section>
  );
}

export default function Informes() {
  const loc = useLocation();
  const navigate = useNavigate();
  const { user } = useSession();
  useAccessVersion();
  const seg = loc.pathname.split('/').filter(Boolean);
  const grupo = seg[0] as InformeGrupo, id = seg[1];
  const [lista, setLista] = useState<InformeMeta[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let vivo = true;
    api.get<InformeMeta[]>('/informes').then(l => { if (vivo) setLista(l); }).catch(e => { if (vivo) setErr((e as Error).message); });
    return () => { vivo = false; };
  }, []);

  const info = GRUPOS[grupo];
  const mios = (lista ?? []).filter(i => i.grupo === grupo);
  const abierto = id ? mios.find(i => i.id === id && i.estado === 'listo') : undefined;
  const permitido = !user || canAccess(user.rol, grupo);

  if (!info || !permitido) return <div className="p-6 text-sm text-slate-500">No tienes acceso a esta sección.</div>;
  if (abierto?.id === 'cierre') return <CierreInformeView key={abierto.id + loc.search} meta={abierto} grupo={grupo} />;
  if (abierto) return <Visor key={abierto.id + loc.search} meta={abierto} grupo={grupo} />;

  const tarjetas = mios.filter(i => !(grupo === 'inf-cierre' && i.id === 'cierre'));
  return (
    <div className="flex flex-col gap-3.5 pb-8">
      <div>
        <h1 className="m-0 flex items-center gap-2 text-xl font-semibold"><i className={`ph ${info.icono} text-accent`} />{screenTitle(grupo)}</h1>
        <p className="m-0 mt-0.5 text-[13px] text-slate-600">{info.texto}</p>
      </div>
      {err && <div role="alert" className="rounded-md bg-bad-bg px-3 py-2 text-xs text-[#B91C1C]">{err}</div>}
      {!lista && !err && <div className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500" role="status">Cargando informes…</div>}
      {grupo === 'inf-cierre' && lista && <CierresCerrados onAbrir={c => navigate(`/inf-cierre/cierre?ciclo=${encodeURIComponent(c)}`)} />}
      {lista && (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(320px,100%),1fr))]">
          {tarjetas.map(i => {
            const listo = i.estado === 'listo';
            return (
              <div key={i.id} className={`${card} flex flex-col gap-2 p-4 ${listo ? '' : 'bg-slate-50'}`} aria-disabled={!listo}>
                <div className="flex items-start justify-between gap-2">
                  <h2 className={`m-0 text-sm font-semibold ${listo ? '' : 'text-slate-500'}`}>{i.titulo}</h2>
                  {!listo && <span className="inline-flex h-[19px] flex-none items-center rounded-full bg-mute-bg px-2 text-[10px] font-semibold text-mute-fg">En preparación</span>}
                </div>
                <p className={`m-0 flex-1 text-xs leading-relaxed ${listo ? 'text-slate-600' : 'text-slate-400'}`}>{i.descripcion}</p>
                <div>
                  <button type="button" className={btn} disabled={!listo} onClick={() => navigate(`/${grupo}/${i.id}`)}><i className={`ph ${listo ? 'ph-chart-bar' : 'ph-hourglass-medium'}`} />{listo ? 'Abrir informe' : 'Disponible pronto'}</button>
                </div>
              </div>
            );
          })}
          {!tarjetas.length && grupo !== 'inf-cierre' && <div className="text-sm text-slate-500">No hay informes disponibles para tu rol en esta sección.</div>}
        </div>
      )}
    </div>
  );
}
