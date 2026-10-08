import { useState, type FormEvent } from 'react';
import type { LoginResponse } from '@stodia/shared';
import { api, getConfig } from '../lib/api';
import { useSession } from '../lib/session';

/** Cambio obligatorio de la contraseña temporal (primer ingreso del tutor o contraseña restablecida). Bloquea el resto de la app hasta completarse. */
export default function CambiarClave() {
  const { user, logout, setSession } = useSession();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repite, setRepite] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (nueva.length < 8) return setError('La nueva contraseña debe tener al menos 8 caracteres');
    if (nueva !== repite) return setError('Las contraseñas nuevas no coinciden');
    if (nueva === actual) return setError('La nueva contraseña debe ser distinta de la temporal');
    setBusy(true); setError('');
    try { setSession(await api.post<LoginResponse>('/auth/password', { actual, nueva })); } catch (x) { setError(x instanceof Error ? x.message : 'No se pudo cambiar la contraseña'); setBusy(false); }
  };
  const f = 'h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/30';
  return (
    <div className="flex min-h-full items-center justify-center bg-canvas p-5">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
        <div>
          <div className="text-xs text-slate-500">{getConfig().institutionName || 'STODIA'}</div>
          <h1 className="m-0 text-xl font-semibold">Crea tu contraseña</h1>
          <p className="mt-1 text-[13px] leading-snug text-slate-600">Hola {user?.nombre.split(' ')[0]}, ingresaste con una contraseña temporal. Por seguridad debes definir una nueva antes de continuar.</p>
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Contraseña temporal<input type="password" autoComplete="current-password" value={actual} onChange={e => setActual(e.target.value)} className={f} /></label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Nueva contraseña (mínimo 8)<input type="password" autoComplete="new-password" value={nueva} onChange={e => setNueva(e.target.value)} className={f} /></label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Repite la nueva contraseña<input type="password" autoComplete="new-password" value={repite} onChange={e => setRepite(e.target.value)} className={f} /></label>
        {error && <p role="alert" className="m-0 text-xs font-medium text-red-600">{error}</p>}
        <button disabled={busy} className="h-11 w-full rounded-lg bg-accent text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-60">Guardar y continuar</button>
        <button type="button" onClick={logout} className="w-full text-center text-xs text-slate-500 hover:underline">Cancelar y salir</button>
      </form>
    </div>
  );
}
