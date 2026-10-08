import { useEffect, useState } from 'react';

/**
 * `wide` del prototipo (_measure): ancho útil del <main> (clientWidth − 48) ≥ 940 px.
 * Terminal de Cobros y Venta Rápida cambian de 2 columnas a 1 según el ancho del contenido, no del viewport.
 */
export function useWide() {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const el = document.querySelector('main');
    const m = () => setWide((el ? el.clientWidth - 48 : window.innerWidth - 260 - 48) >= 940);
    m();
    window.addEventListener('resize', m);
    const t1 = setTimeout(m, 50), t2 = setTimeout(m, 400);
    const ro = el && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(m) : null;
    if (el && ro) ro.observe(el);
    return () => { window.removeEventListener('resize', m); clearTimeout(t1); clearTimeout(t2); ro?.disconnect(); };
  }, []);
  return wide;
}
