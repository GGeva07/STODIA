import type { ReactNode } from 'react';

/** Encabezado estándar de pantalla (título + acciones). Las pantallas portadas deben reutilizarlo. */
export default function ScreenHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="mb-6 flex items-center justify-between gap-4">
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
      <div className="flex items-center gap-2">{children}</div>
    </header>
  );
}
