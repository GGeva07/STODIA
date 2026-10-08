import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { isNative } from '../lib/native';
import { DEMO_USERS, canAccess, homeFor } from '../lib/access';
import { getConfig } from '../lib/api';
import { useSession } from '../lib/session';

/** En la app nativa el Docente entra directo a la lista móvil. */
const homeOf = (rol: Parameters<typeof homeFor>[0]) => (isNative && rol === 'Docente' ? '/m/lista' : homeFor(rol));

/** Solo vuelve a la ruta pedida antes del login si el rol puede verla; si no, va a su inicio. */
function allowedFrom(rol: Parameters<typeof homeFor>[0], from?: string): string | undefined {
  if (!from || from === '/' || from.startsWith('/login')) return undefined;
  if (from.startsWith('/m/tutor')) return rol === 'Tutor' ? from : undefined;
  if (from.startsWith('/m/lista')) return rol === 'Docente' ? from : undefined;
  if (rol === 'Tutor') return undefined;
  const seg = from.split(/[/?#]/)[1] as Parameters<typeof canAccess>[1];
  return canAccess(rol, seg) ? from : undefined;
}

// Fondo: si el cliente suelta public/login-bg.jpg o .webp se muestra encima del SVG por defecto
// (una capa inexistente simplemente no se pinta).
const BG = "url('/login-bg.jpg'), url('/login-bg.webp'), url('/login-bg.svg')";
const VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) || '0.1.0';
// Contraseña de desarrollo opcional (solo DEV); si no está definida, las demos rellenan solo el usuario.
const DEV_PASSWORD = import.meta.env.DEV ? (import.meta.env.VITE_DEV_PASSWORD as string | undefined) : undefined;

export default function Login() {
  const { user, login } = useSession();
  const nav = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={allowedFrom(user.rol, from) ?? homeOf(user.rol)} replace />;

  const institution = getConfig().institutionName;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const u = await login({ usuario: usuario.trim(), password });
      nav(allowedFrom(u.rol, from) ?? homeOf(u.rol), { replace: true });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'No se pudo iniciar sesión. Verifica tu usuario y contraseña e inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  const field = 'w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm text-ink placeholder:text-slate-400 transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30';

  return (
    <div className="relative flex min-h-full flex-col overflow-y-auto bg-[#0B1B4A] bg-cover bg-center" style={{ backgroundImage: BG }}>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-950/80 via-slate-950/45 to-slate-950/20 max-lg:from-slate-950/70 max-lg:via-slate-950/55 max-lg:to-slate-950/70" aria-hidden />

      <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col items-center gap-8 px-5 py-8 sm:px-8 lg:flex-row lg:justify-between lg:gap-16 lg:px-12">
        <section className="login-rise w-full text-center text-white lg:w-fit lg:max-w-xl">
          <div className="flex items-center justify-center gap-3">
            <img src="/brand/stodia-mark.svg" alt="STODIA" className="h-16 w-auto drop-shadow-[0_8px_24px_rgba(56,189,248,0.4)] lg:h-40 xl:h-48" />
            <span className="text-2xl font-extrabold tracking-[0.2em] lg:hidden">STODIA</span>
          </div>
          <h1 className="mt-4 hidden text-7xl font-extrabold tracking-[0.12em] drop-shadow-lg lg:block xl:text-8xl">STODIA</h1>
          {institution && (
            <p className="mt-3 text-base font-semibold text-blue-100 lg:mt-5 lg:text-2xl">{institution}</p>
          )}
          <p className="mt-1 text-sm text-slate-300 lg:mt-2 lg:text-lg">Gestión escolar integral</p>
        </section>

        <section className="login-rise w-full max-w-md [animation-delay:120ms] lg:shrink-0">
          <form onSubmit={submit} noValidate className="rounded-3xl border border-white/40 bg-white/90 p-6 shadow-2xl shadow-slate-950/40 backdrop-blur-xl sm:p-8">
            <h2 className="text-xl font-bold text-ink">Iniciar sesión</h2>
            <p className="mb-6 mt-1 text-sm text-slate-500">Ingresa tus credenciales para continuar.</p>

            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="usuario">Usuario</label>
            <div className="relative mb-4">
              <i className="ph ph-user pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-slate-400" aria-hidden />
              <input id="usuario" className={field} value={usuario} onChange={e => setUsuario(e.target.value)} autoComplete="username" autoFocus placeholder="Tu usuario" aria-invalid={!!error} />
            </div>

            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="password">Contraseña</label>
            <div className="relative mb-4">
              <i className="ph ph-lock-simple pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-slate-400" aria-hidden />
              <input id="password" type={show ? 'text' : 'password'} className={`${field} pr-11`} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" placeholder="Tu contraseña" aria-invalid={!!error} />
              <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={show}
                className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700">
                <i className={`ph ${show ? 'ph-eye-slash' : 'ph-eye'} text-lg`} aria-hidden />
              </button>
            </div>

            <div role="alert" aria-live="assertive">
              {error && (
                <p className="mb-4 flex items-start gap-2 rounded-lg bg-bad-bg px-3 py-2.5 text-sm text-bad-fg">
                  <i className="ph-fill ph-warning-circle mt-0.5 text-base" aria-hidden />
                  <span>{error}</span>
                </p>
              )}
            </div>

            <button disabled={busy || !usuario || !password}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50">
              {busy && <i className="ph ph-circle-notch animate-spin text-base motion-reduce:animate-none" aria-hidden />}
              {busy ? 'Entrando…' : 'Entrar'}
            </button>

            {import.meta.env.DEV && (
              <div className="mt-5 border-t border-slate-200 pt-3 text-xs text-slate-500">
                Usuarios demo (solo dev):
                <div className="mt-2 flex flex-wrap gap-1">
                  {DEMO_USERS.map(u => (
                    <button type="button" key={u.usuario} title={u.nombre}
                      className="rounded bg-mute-bg px-2 py-1 text-mute-fg hover:bg-slate-200"
                      onClick={() => { setUsuario(u.usuario); if (DEV_PASSWORD) setPassword(DEV_PASSWORD); }}>
                      {u.rol}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </form>
        </section>
      </main>

      <footer className="relative z-10 px-5 pb-4 text-center text-xs text-slate-300/80">
        <span className="font-mono">v{VERSION}</span> · © {new Date().getFullYear()} STODIA
        {isNative && <> · <Link to="/servidor" className="underline">Cambiar servidor</Link></>}
      </footer>
    </div>
  );
}
