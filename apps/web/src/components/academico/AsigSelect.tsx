import type { AcadAsigOpt, AcadPeriodo } from '@stodia/shared';

const sel = 'h-8 max-w-[260px] rounded-md border border-slate-300 bg-white px-2 text-[13px] text-ink';

/**
 * Selector discreto de asignación (materia · sección) y período. Solo aparece si hay más de una asignación
 * (el docente con una sola ve la cabecera tal cual el prototipo); Super Admin / Director ven todas.
 */
export default function AsigSelect({ options, value, onChange, periodos, periodo, onPeriodo }: {
  options: AcadAsigOpt[]; value: string; onChange: (id: string) => void;
  periodos?: AcadPeriodo[]; periodo?: string; onPeriodo?: (k: string) => void;
}) {
  if (options.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Sección y materia" value={value} onChange={e => onChange(e.target.value)} className={sel}>
        {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      {periodos && onPeriodo && (
        <select aria-label="Período" value={periodo} onChange={e => onPeriodo(e.target.value)} className={sel}>
          {periodos.map(p => <option key={p.k} value={p.k}>{p.label}</option>)}
        </select>
      )}
    </div>
  );
}
