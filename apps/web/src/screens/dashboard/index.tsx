import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DashboardData, ScreenId } from '@stodia/shared';
import { api } from '../../lib/api';

const fmt = (n: number) => 'RD$ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Kpi { l: string; v: string; sub: string; icon: string; c: string; go: ScreenId }
interface Alert { icon: string; c: string; t: string; d: string; btn: string; go: string }

export default function Screen() {
  const nav = useNavigate();
  const [d, setD] = useState<DashboardData | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.get<DashboardData>('/dashboard').then(setD).catch(e => setErr(e instanceof Error ? e.message : 'Error')); }, []);
  if (err) return <p className="text-sm text-red-600">{err}</p>;
  if (!d) return <p className="text-sm text-slate-500">Cargando…</p>;

  const mesTot = d.recaudoEfectivo + d.recaudoBanco;
  const pct = (v: number) => (mesTot > 0 ? Math.round((v / mesTot) * 100) : 0);
  const kpis: Kpi[] = [
    { l: 'Recaudado este mes', v: fmt(mesTot), sub: mesTot > 0 ? `Efectivo ${pct(d.recaudoEfectivo)}% · Banco ${pct(d.recaudoBanco)}%` : 'Sin cobros registrados este mes', icon: 'ph ph-coins', c: '#0F172A', go: 'pos' },
    { l: 'Índice de morosidad', v: fmt(d.morosidad), sub: d.morosidad > 0 ? 'Monto vencido en CxC' : 'Sin cartera vencida', icon: 'ph ph-warning', c: '#DC2626', go: 'directorio' },
    { l: 'Proyección del ciclo', v: fmt(d.proyeccionCiclo), sub: d.matricula > 0 ? `${d.matricula} alumnos × plan promedio` : 'Sin alumnos activos', icon: 'ph ph-trend-up', c: '#0F172A', go: 'planes' },
    { l: 'Matrícula activa', v: String(d.matricula), sub: `+${d.inscripcionesMes} ${d.inscripcionesMes === 1 ? 'inscripción' : 'inscripciones'} este mes`, icon: 'ph ph-users-three', c: '#0F172A', go: 'directorio' },
    { l: 'Tardanzas / ausencias hoy', v: String(d.asistenciaIncidencias), sub: `${d.asistenciaPresentes} presentes · ${d.asistenciaSinMarcar} sin marcar${d.asistenciaSeccion ? ` (${d.asistenciaSeccion})` : ''}`, icon: 'ph ph-user-check', c: d.asistenciaIncidencias ? '#B45309' : '#0F172A', go: 'asistencia' },
    { l: 'Becas por aprobar', v: String(d.becasPendientes), sub: d.becasPendientes ? 'Esperando Director Financiero' : 'Todo al día', icon: 'ph ph-hand-coins', c: d.becasPendientes ? '#B45309' : '#15803D', go: 'becas' },
  ];

  const alerts: Alert[] = [];
  for (const n of d.ncf) if (n.estado !== 'Vigente') alerts.push({ icon: 'ph-fill ph-warning-octagon', c: n.estado === 'Agotada' ? '#DC2626' : '#D97706', t: `Secuencia NCF ${n.pref} ${n.estado.toLowerCase()}`, d: `Quedan ${n.restantes} comprobantes de ${n.total}. Solicita una nueva resolución a la DGII.`, btn: 'Configurar', go: 'config?tab=fiscal' });
  if (d.becasPendientes) alerts.push({ icon: 'ph-fill ph-clock', c: '#D97706', t: d.becasPendientes + (d.becasPendientes === 1 ? ' beca pendiente' : ' becas pendientes') + ' de aprobación', d: 'Requieren la firma del Director Financiero antes de impactar la cartera.', btn: 'Revisar', go: 'becas' });
  if (d.alumnosEnMora) alerts.push({ icon: 'ph-fill ph-user-minus', c: '#DC2626', t: d.alumnosEnMora + (d.alumnosEnMora === 1 ? ' alumno con tutor en mora' : ' alumnos con tutor en mora'), d: 'Envía un aviso masivo o imprime las notificaciones de cobro.', btn: 'Avisar', go: 'comunica' });
  if (!d.ecfCargado) alerts.push({ icon: 'ph-fill ph-certificate', c: '#D97706', t: 'Certificado e-CF no cargado', d: 'La facturación electrónica no podrá firmarse.', btn: 'Cargar', go: 'config?tab=fiscal' });
  if (d.stockBajo) alerts.push({ icon: 'ph-fill ph-package', c: '#D97706', t: d.stockBajo + ' artículos con stock bajo en inventario', d: 'Registra una entrada de mercancía para reponerlos.', btn: 'Inventario', go: 'inventario' });

  const maxBar = Math.max(1, ...d.barras.map(b => b.v));
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.01em]">Centro de Control</h1>
        <p className="mt-1 text-[13px] text-slate-600">{d.fecha}{d.ciclo ? ` · Ciclo ${d.ciclo}` : ' · Sin ciclo lectivo activo'}</p>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))' }}>
        {kpis.map(k => (
          <button key={k.l} onClick={() => nav('/' + k.go)} className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-3.5 text-left hover:border-blue-300">
            <span className="flex items-center justify-between text-xs font-medium text-slate-500">{k.l}<i className={k.icon} style={{ fontSize: 16, color: '#94A3B8' }} /></span>
            <span className="font-mono text-[22px] font-bold tracking-[-0.02em]" style={{ color: k.c }}>{k.v}</span>
            <span className="text-xs text-slate-500">{k.sub}</span>
          </button>
        ))}
      </div>
      <div className="grid items-start gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))' }}>
        <section className="flex flex-col gap-3.5 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-baseline justify-between gap-2.5"><span className="text-sm font-semibold">Recaudo mensual</span><span className="text-xs text-slate-500">Últimos 6 meses · RD$ millones</span></div>
          <div className="flex h-[150px] items-end gap-3 pt-2.5">
            {d.barras.map((b, i) => (
              <div key={b.m} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <span className="font-mono text-[11px] font-semibold text-slate-600">{b.v.toFixed(1)}</span>
                <div className="w-full max-w-[44px] rounded-t" style={{ height: Math.max(6, Math.round((b.v / maxBar) * 100)) + 'px', background: i === d.barras.length - 1 ? '#2563EB' : '#CBD5E1' }} />
                <span className="text-[11px] text-slate-500">{b.m}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-2.5">
            <div className="flex justify-between text-xs text-slate-600">
              <span>Efectivo <b className="font-mono text-ink">{fmt(d.recaudoEfectivo)}</b></span>
              <span>Banco / tarjeta <b className="font-mono text-ink">{fmt(d.recaudoBanco)}</b></span>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full bg-slate-200"><div style={{ width: pct(d.recaudoEfectivo) + '%', background: '#F59E0B' }} /><div className="flex-1 bg-accent" /></div>
          </div>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3.5 text-sm font-semibold">Alertas del sistema</div>
          {alerts.length === 0 && <div className="px-4 py-6 text-center text-xs text-slate-500">Sin alertas: todo en orden.</div>}
          {alerts.map(a => (
            <div key={a.t} className="flex items-start gap-3 border-b border-slate-100 px-4 py-3">
              <i className={a.icon} style={{ fontSize: 20, color: a.c, marginTop: 1 }} />
              <div className="min-w-0 flex-1"><div className="text-[13px] font-medium">{a.t}</div><div className="text-xs leading-snug text-slate-500">{a.d}</div></div>
              <button onClick={() => nav('/' + a.go)} className="h-7 whitespace-nowrap rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-accent hover:bg-blue-50">{a.btn}</button>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
