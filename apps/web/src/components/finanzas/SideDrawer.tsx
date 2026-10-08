import type { ReactNode } from 'react';

/** Panel lateral derecho del prototipo (overlay + panel). */
export default function SideDrawer({ width, z = 66, onClose, children }: { width: number; z?: number; onClose: () => void; children: ReactNode }) {
  return (
    <div onClick={onClose} className="fixed inset-0 flex justify-end bg-slate-900/40" style={{ zIndex: z }}>
      <div
        onClick={e => e.stopPropagation()}
        className="flex h-full flex-col bg-white shadow-[-12px_0_32px_rgba(15,23,42,0.2)]"
        style={{ width: `min(${width}px,100vw)` }}
        role="dialog" aria-modal="true"
      >
        {children}
      </div>
    </div>
  );
}
