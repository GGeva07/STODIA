import { useEffect, useRef, useState, type RefObject } from 'react';

export const prefersReducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};
export const canAnimate = () => typeof window !== 'undefined' && 'IntersectionObserver' in window && !prefersReducedMotion();
const fmt = new Intl.NumberFormat('es-DO');

function runCounter(el: HTMLElement) {
  const target = Number(el.dataset.count);
  const suffix = el.dataset.suffix ?? '';
  const t0 = performance.now();
  const tick = (now: number) => {
    const p = Math.min(1, (now - t0) / 1400);
    el.textContent = fmt.format(Math.round(target * (1 - Math.pow(1 - p, 3)))) + suffix;
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function useLandingMotion(root: RefObject<HTMLElement>, progress: RefObject<HTMLElement>) {
  const [scrolled, setScrolled] = useState(false);
  const scrolledRef = useRef(false);
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    const reduce = prefersReducedMotion();
    const cleanups: Array<() => void> = [];
    const para = reduce ? [] : Array.from(host.querySelectorAll<HTMLElement>('[data-parallax]'));
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        if (progress.current && !reduce) progress.current.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
        const s = y > 12;
        if (s !== scrolledRef.current) { scrolledRef.current = s; setScrolled(s); }
        const vh = window.innerHeight;
        for (const el of para) {
          const r = el.parentElement?.getBoundingClientRect() ?? el.getBoundingClientRect();
          if (r.bottom < -200 || r.top > vh + 200) continue;
          el.style.setProperty('--py', `${((r.top + r.height / 2 - vh / 2) * (Number(el.dataset.parallax) || 0.1) * -1).toFixed(1)}px`);
        }
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    cleanups.push(() => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf); });
    if (!reduce && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          el.classList.add('is-in');
          if (el.dataset.count) runCounter(el);
          io.unobserve(el);
        }
      }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
      host.querySelectorAll('[data-reveal],[data-draw],[data-count]').forEach(el => io.observe(el));
      cleanups.push(() => io.disconnect());
    } else {
      host.querySelectorAll<HTMLElement>('[data-count]').forEach(el => { el.textContent = fmt.format(Number(el.dataset.count)) + (el.dataset.suffix ?? ''); });
    }
    if (!reduce && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      const move = (ev: PointerEvent) => {
        const card = (ev.target as HTMLElement).closest<HTMLElement>('.tilt');
        if (!card) return;
        const r = card.getBoundingClientRect();
        card.style.setProperty('--rx', `${(-((ev.clientY - r.top) / r.height - 0.5) * 6).toFixed(2)}deg`);
        card.style.setProperty('--ry', `${(((ev.clientX - r.left) / r.width - 0.5) * 8).toFixed(2)}deg`);
      };
      const leave = (ev: PointerEvent) => {
        const card = (ev.target as HTMLElement).closest<HTMLElement>('.tilt');
        card?.style.setProperty('--rx', '0deg');
        card?.style.setProperty('--ry', '0deg');
      };
      host.addEventListener('pointermove', move);
      host.addEventListener('pointerout', leave);
      cleanups.push(() => { host.removeEventListener('pointermove', move); host.removeEventListener('pointerout', leave); });
    }
    return () => cleanups.forEach(f => f());
  }, [root, progress]);
  return scrolled;
}
