import type { CSSProperties } from 'react';

/** Trazos manuscritos que se "dibujan" (stroke-dashoffset) al entrar en pantalla. Decorativos: aria-hidden. */
interface P { className?: string; color?: string; delay?: number; width?: number }
const st = (delay?: number): CSSProperties | undefined => (delay ? ({ '--d': `${delay}ms` } as CSSProperties) : undefined);

export function Underline({ className = '', color = '#2563EB', delay = 400, width = 7 }: P) {
  return (
    <svg data-draw className={`pointer-events-none absolute left-0 w-full ${className}`} viewBox="0 0 300 24" preserveAspectRatio="none" aria-hidden="true" focusable="false" style={{ height: '0.4em', bottom: '-0.28em' }}>
      <path className="draw" pathLength={1} d="M4 14 C 50 4, 96 20, 150 11 S 248 5, 296 13" stroke={color} strokeWidth={width} style={st(delay)} />
      <path className="draw" pathLength={1} d="M30 20 C 90 14, 170 22, 262 17" stroke={color} strokeWidth={width * 0.55} style={st(delay + 350)} opacity=".6" />
    </svg>
  );
}

export function Circle({ className = '', color = '#F59E0B', delay = 400, width = 4 }: P) {
  return (
    <svg data-draw className={`pointer-events-none absolute -inset-x-3 -inset-y-2 ${className}`} viewBox="0 0 200 80" preserveAspectRatio="none" aria-hidden="true" focusable="false" style={{ width: 'calc(100% + 1.5rem)', height: 'calc(100% + 1rem)' }}>
      <path className="draw" pathLength={1} d="M100 6 C 40 4, 6 24, 10 42 C 14 64, 70 76, 120 72 C 170 68, 198 48, 190 28 C 182 10, 140 4, 96 8" stroke={color} strokeWidth={width} style={st(delay)} />
    </svg>
  );
}

/** Flecha curva dibujada a mano. `flip` la gira en horizontal. */
export function Arrow({ className = '', color = '#0F172A', delay = 300, flip = false }: P & { flip?: boolean }) {
  return (
    <svg data-draw className={className} width="120" height="90" viewBox="0 0 120 90" aria-hidden="true" focusable="false" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
      <path className="draw" pathLength={1} d="M6 12 C 40 4, 92 20, 96 62" stroke={color} strokeWidth={3.5} style={st(delay)} />
      <path className="draw" pathLength={1} d="M80 52 L 96 66 L 108 46" stroke={color} strokeWidth={3.5} style={st(delay + 700)} />
    </svg>
  );
}

export function Squiggle({ className = '', color = '#F59E0B', delay = 200 }: P) {
  return (
    <svg data-draw className={className} width="110" height="26" viewBox="0 0 110 26" aria-hidden="true" focusable="false">
      <path className="draw" pathLength={1} d="M3 14 C 12 2, 20 2, 28 14 S 44 26, 54 14 S 70 2, 80 14 S 96 26, 107 12" stroke={color} strokeWidth={4} style={st(delay)} />
    </svg>
  );
}

export function Sparkle({ className = '', color = '#FACC15' }: { className?: string; color?: string }) {
  return (
    <svg className={className} width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 1 L14.4 9.6 L23 12 L14.4 14.4 L12 23 L9.6 14.4 L1 12 L9.6 9.6 Z" fill={color} />
    </svg>
  );
}
