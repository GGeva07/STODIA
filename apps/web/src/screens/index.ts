import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * Registro automático: cada pantalla vive en src/screens/<id>/index.tsx (export default).
 * <id> = id de NAV (ver lib/access.ts). Para portar una pantalla solo se edita su carpeta;
 * no hay que tocar este archivo ni App.tsx.
 */
const loaders = import.meta.glob<{ default: ComponentType }>('./*/index.tsx');
const cache = new Map<string, LazyExoticComponent<ComponentType>>();

export function screenComponent(id: string): LazyExoticComponent<ComponentType> | null {
  const loader = loaders[`./${id}/index.tsx`];
  if (!loader) return null;
  let c = cache.get(id);
  if (!c) {
    c = lazy(loader);
    cache.set(id, c);
  }
  return c;
}
