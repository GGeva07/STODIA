import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { getConfig, getStoredApiUrl, probeServer, setApiUrl } from '../lib/api';

/** Primer arranque de la app nativa: cada institución tiene su propia API. */
export default function ServerSetup() {
  const nav = useNavigate();
  const [url, setUrl] = useState(getStoredApiUrl() ?? 'http://');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const clean = url.trim().replace(/\/+$/, '');
      if (!/^https?:\/\/.+/i.test(clean)) throw new Error('Escribe una dirección que empiece con http:// o https://');
      const info = await probeServer(clean);
      await setApiUrl(clean);
      if (info.name) getConfig().institutionName = info.name;
      nav('/login', { replace: true });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'No se pudo conectar con el servidor.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-[#0B1B4A] px-5 py-8 pt-[max(2rem,env(safe-area-inset-top))]">
      <img src="/brand/stodia-mark.svg" alt="" className="h-20 w-auto" />
      <img src="/brand/stodia-wordmark.svg" alt="STODIA" className="mb-4 mt-2 h-12 w-auto" />
      <form onSubmit={submit} noValidate className="w-full max-w-md rounded-3xl bg-white/95 p-6 shadow-2xl">
        <h1 className="text-xl font-bold text-ink">Conectar con tu institución</h1>
        <p className="mb-5 mt-1 text-sm text-slate-500">Escribe la dirección del servidor STODIA que te dio tu institución.</p>
        <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="srv">Dirección del servidor</label>
        <input id="srv" inputMode="url" autoCapitalize="none" autoCorrect="off" value={url} onChange={e => setUrl(e.target.value)}
          placeholder="http://192.168.1.10:3000"
          className="mb-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30" />
        <div role="alert" aria-live="assertive">
          {error && <p className="mb-4 rounded-lg bg-bad-bg px-3 py-2.5 text-sm text-bad-fg">{error}</p>}
        </div>
        <button disabled={busy || url.trim().length < 8}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {busy && <i className="ph ph-circle-notch animate-spin" aria-hidden />}
          {busy ? 'Conectando…' : 'Conectar'}
        </button>
        {getStoredApiUrl() && (
          <button type="button" onClick={() => nav('/login')} className="mt-3 w-full text-center text-xs text-slate-500">Cancelar</button>
        )}
      </form>
    </div>
  );
}
