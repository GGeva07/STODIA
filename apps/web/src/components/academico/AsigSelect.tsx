import { useMemo, useState } from 'react';
import type { AcadAsigOpt, AcadPeriodo } from '@stodia/shared';

const sel = 'h-8 max-w-[260px] rounded-md border border-slate-300 bg-white px-2 text-[13px] text-ink';
/** Con más asignaciones que esto (Super Admin / Director con el catálogo completo) el selector se divide en Docente -> Materia · Sección · Tanda. */
const MUCHAS = 30;

/**
 * Selector discreto de asignación (materia · sección) y período. Solo aparece si hay más de una asignación
 * (el docente con una sola ve la cabecera tal cual el prototipo); Super Admin / Director ven todas: con cientos de asignaciones
 * se filtran primero por docente y la lista de cada docente indica la tanda (las secciones homónimas de otra tanda no se confunden).
 */
export default function AsigSelect({ options, value, onChange, periodos, periodo, onPeriodo }: {
  options: AcadAsigOpt[]; value: string; onChange: (id: string) => void;
  periodos?: AcadPeriodo[]; periodo?: string; onPeriodo?: (k: string) => void;
}) {
  const [doc, setDoc] = useState('');
  const docentes = useMemo(() => (options.length > MUCHAS ? [...new Set(options.map(o => o.docente ?? ''))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'es')) : []), [options]);
  if (options.length < 2) return null;
  const muchas = docentes.length > 1;
  const actual = options.find(o => o.id === value);
  const docSel = muchas ? (doc || actual?.docente || docentes[0]) : '';
  const lista = muchas ? options.filter(o => o.docente === docSel) : options;
  const txt = (o: AcadAsigOpt) => (muchas && o.tanda ? `${o.label} · ${o.tanda}` : o.label);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {muchas && (
        <select aria-label="Docente" value={docSel} onChange={e => { setDoc(e.target.value); const f = options.find(o => o.docente === e.target.value); if (f) onChange(f.id); }} className={sel}>
          {docentes.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      )}
      <select aria-label="Sección y materia" value={value} onChange={e => onChange(e.target.value)} className={`${sel} ${muchas ? 'max-w-[340px]' : ''}`}>
        {lista.map(o => <option key={o.id} value={o.id}>{txt(o)}</option>)}
      </select>
      {periodos && onPeriodo && (
        <select aria-label="Período" value={periodo} onChange={e => onPeriodo(e.target.value)} className={sel}>
          {periodos.map(p => <option key={p.k} value={p.k}>{p.label}</option>)}
        </select>
      )}
    </div>
  );
}
