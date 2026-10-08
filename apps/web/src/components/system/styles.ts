/** Clases Tailwind reutilizables, equivalentes a los estilos inline repetidos del prototipo. */
export const btn = 'inline-flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 text-[13px] font-medium text-ink hover:bg-slate-100 disabled:opacity-50';
export const btnPrimary = 'inline-flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-md border-0 bg-accent px-3.5 text-[13px] font-medium text-white hover:bg-accent-dark disabled:opacity-50';
export const input = 'h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-[13px] text-ink outline-none focus:border-accent';
export const card = 'rounded-lg border border-slate-200 bg-white';
export const th = 'whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-600';
export const td = 'border-b border-slate-100 px-3 py-0';
export const sectionLabel = 'text-xs font-semibold uppercase tracking-[0.04em] text-slate-600';

export type PillTone = 'ok' | 'warn' | 'bad' | 'info' | 'mute';
export const pill: Record<PillTone, string> = {
  ok: 'bg-ok-bg text-ok-fg', warn: 'bg-warn-bg text-warn-fg', bad: 'bg-bad-bg text-bad-fg', info: 'bg-info-bg text-info-fg', mute: 'bg-mute-bg text-mute-fg',
};
/** Píldora de estado de ancho fijo (prototipo: height 19px, 10px/600). */
export const pillBase = 'inline-flex h-[19px] flex-none items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full px-[5px] text-[10px] font-semibold leading-none';
