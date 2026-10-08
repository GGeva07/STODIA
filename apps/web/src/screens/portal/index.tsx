import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { TutoresResp, TutorRow } from '@stodia/shared';
import { api } from '../../lib/api';
import { errMsg, norm } from '../../components/finanzas/fin';

const TutorApp = lazy(() => import('../../mobile/TutorApp'));

/**
 * Portal Tutor en escritorio (prototipo L1649-1742 + L1735): marco de teléfono 390x800 con la app real del tutor.
 * El personal elige a QUÉ tutor consulta (misma regla y mismo endpoint que el portal real: GET /movil/tutor?cedula=, solo lectura).
 */
export default function Screen() {
  const [sel, setSel] = useState<TutorRow | null>(null);
  const [vacio, setVacio] = useState(false);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<TutorRow[]>([]);
  const [err, setErr] = useState('');
  const box = useRef<HTMLDivElement>(null);

  // Por defecto: el primer tutor (orden alfabético) que tiene estudiantes a su cargo.
  useEffect(() => {
    api.get<TutoresResp>('/tutores?conHijos=1&size=1').then(r => { if (r.rows[0]) setSel(r.rows[0]); else setVacio(true); }).catch(e => setErr(errMsg(e)));
  }, []);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => api.get<TutoresResp>('/tutores?conHijos=1&size=8&q=' + encodeURIComponent(q.trim())).then(r => setList(r.rows)).catch(e => setErr(errMsg(e))), 150);
    return () => clearTimeout(t);
  }, [q, open]);
  useEffect(() => {
    const off = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, []);

  return (
    <div className="flex flex-wrap items-start gap-8">
      <div className="flex h-[800px] w-[390px] max-w-full flex-none flex-col">
        <Suspense fallback={<div className="p-6 text-sm text-slate-500">Cargando…</div>}>
          <TutorApp consulta={sel?.cedula ?? ''} />
        </Suspense>
      </div>
      <div className="flex max-w-[340px] flex-col gap-2.5 pt-5">
        <h1 className="m-0 text-xl font-semibold tracking-[-0.01em]">Portal del Tutor</h1>
        <p className="m-0 text-[13px] leading-[1.55] text-slate-600">Consulta móvil para tutores. Comparte datos con la caja: un pago aquí aparece en «Recibos del turno» del POS y salda las cuotas del estado de cuenta.</p>
        <div ref={box} className="relative mt-2 flex flex-col gap-1.5">
          <span className="text-xs font-medium text-slate-600">Tutor que se consulta</span>
          <div className="relative">
            <i className="ph ph-magnifying-glass absolute left-2.5 top-2.5 text-slate-400" />
            <input
              value={open ? q : sel ? sel.nombre : ''} placeholder={vacio ? 'Sin tutores con estudiantes' : 'Buscar por nombre, cédula o hijo…'} aria-label="Tutor que se consulta"
              onFocus={() => { setOpen(true); setQ(''); }} onChange={e => { setOpen(true); setQ(e.target.value); }}
              className="h-[34px] w-full rounded-md border border-slate-300 bg-white pl-[30px] pr-2.5 text-[13px] outline-none focus:border-accent focus:shadow-[0_0_0_3px_#DBEAFE]"
            />
          </div>
          {open && (
            <div className="absolute left-0 right-0 top-[62px] z-20 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white p-1.5 shadow-[0_12px_32px_rgba(15,23,42,0.18)]">
              {list.map(t => (
                <button key={t.id} onClick={() => { setSel(t); setOpen(false); }} className={`flex w-full flex-col rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-slate-100 ${sel?.id === t.id ? 'bg-blue-50' : ''}`}>
                  <span className="font-medium">{t.nombre}</span>
                  <span className="text-[11px] text-slate-500"><span className="font-mono">{t.cedula}</span> · {t.alumnos.map(a => a.nombre.split(' ')[0]).join(', ')}</span>
                </button>
              ))}
              {list.length === 0 && <div className="px-2.5 py-3 text-[13px] text-slate-500">{norm(q) ? 'Ningún tutor coincide con la búsqueda.' : 'Aún no hay tutores con estudiantes. Se crean al inscribir un alumno.'}</div>}
            </div>
          )}
          {sel && <span className="text-[11px] leading-snug text-slate-500">Vista de consulta, solo lectura: ves lo mismo que el tutor, con su misma información real. Los pagos los registra el tutor o la caja.</span>}
          {err && <span className="text-xs font-medium text-red-600">{err}</span>}
        </div>
      </div>
    </div>
  );
}
