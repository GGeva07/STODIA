import { useCallback, useState, type ReactNode } from 'react';

export type ToastTone = 'ok' | 'bad' | 'warn' | 'info';
const ICON: Record<ToastTone, [string, string]> = {
  ok: ['ph-fill ph-check-circle', '#4ADE80'], bad: ['ph-fill ph-x-circle', '#F87171'],
  warn: ['ph-fill ph-warning', '#FBBF24'], info: ['ph-fill ph-info', '#60A5FA'],
};

/** Toasts del prototipo (máx. 4, 3.8 s). Uso: `const { toast, toasts } = useToastStack();` y renderizar `{toasts}` en la pantalla. */
export function useToastStack(): { toast: (msg: string, tone?: ToastTone) => void; toasts: ReactNode } {
  const [list, setList] = useState<{ id: number; msg: string; tone: ToastTone }[]>([]);
  const toast = useCallback((msg: string, tone: ToastTone = 'ok') => {
    const id = Math.random();
    setList(l => [...l, { id, msg, tone }].slice(-4));
    setTimeout(() => setList(l => l.filter(t => t.id !== id)), 3800);
  }, []);
  const toasts = (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[90] flex flex-col gap-2" role="status" aria-live="polite">
      {list.map(t => (
        <div key={t.id} className="flex max-w-sm items-center gap-2.5 rounded-lg bg-slate-900 px-3.5 py-2.5 text-[13px] text-slate-50 shadow-lg">
          <i className={ICON[t.tone][0]} style={{ color: ICON[t.tone][1], fontSize: 18 }} />
          {t.msg}
        </div>
      ))}
    </div>
  );
  return { toast, toasts };
}
