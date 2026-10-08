/** Selector segmentado tipo "pastillas" del prototipo (densidad, categorías, tipo…). */
export interface SegOption<K extends string> { k: K; label: string; icon?: string; n?: number }

export default function SegTabs<K extends string>({ options, value, onChange, wrap }: { options: SegOption<K>[]; value: K; onChange: (k: K) => void; wrap?: boolean }) {
  return (
    <div className={`flex gap-0.5 rounded-lg bg-mute-bg p-[3px] ${wrap ? 'flex-wrap' : ''}`} role="tablist">
      {options.map(o => {
        const on = o.k === value;
        return (
          <button
            key={o.k} role="tab" aria-selected={on} onClick={() => onChange(o.k)}
            className={`flex h-7 items-center gap-[5px] rounded-md px-2.5 text-xs font-medium ${on ? 'bg-white text-ink shadow-[0_1px_2px_rgba(15,23,42,0.12)]' : 'text-slate-600'}`}
          >
            {o.icon && <i className={o.icon} />}
            {o.label}
            {o.n !== undefined && <span className="font-mono text-slate-400">{o.n}</span>}
          </button>
        );
      })}
    </div>
  );
}
