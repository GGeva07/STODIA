import { useCallback, useEffect, useRef, useState } from 'react';
import { btn, btnPrimary, card } from '../../components/system/styles';
import ConfirmModal from '../../components/system/ConfirmModal';
import { Modal, useToast } from '../../components/system/UiProvider';
import { api } from '../../lib/api';

/** Firmas de cajeros, directores y docentes para los documentos (docs/firmas-documentos.md). La imagen vive en la BD (UserFirma). */
const MAX_BYTES = 300 * 1024, MAX_PX = 1200;

interface Fila { id: string; usuario: string; nombre: string; rol: string; tiene: boolean; updatedAt?: string; updatedBy?: string }
interface FirmaDto { dataUrl: string; updatedAt: string }
const GRUPOS: [string, string, string][] = [['Cajero', 'Cajeros', 'ph-cash-register'], ['Director Académico', 'Directores', 'ph-student'], ['Docente', 'Docentes', 'ph-chalkboard-teacher']];

/** Tipo real por los primeros bytes (no por la extensión ni el type del navegador). */
async function tipoReal(f: File): Promise<boolean> {
  const b = new Uint8Array(await f.slice(0, 12).arrayBuffer());
  const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const jpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const webp = b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
  return png || jpg || webp;
}
const aDataUrl = (f: File) => new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(new Error('No se pudo leer el archivo')); r.readAsDataURL(f); });
const cargarImg = (src: string) => new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('La imagen está dañada o no se puede abrir')); i.src = src; });
const bytesDe = (d: string) => Math.floor((d.length - d.indexOf(',') - 1) * 3 / 4);

/**
 * Prepara la imagen: reduce a 1200 px como máximo y, si se pide, vuelve transparente el fondo blanco/claro (canvas: el alfa sale de la luminosidad,
 * así el trazo conserva su color y los bordes quedan suaves). Sin cambios se conserva el archivo original.
 */
async function preparar(f: File, quitarFondo: boolean): Promise<string> {
  const original = await aDataUrl(f);
  const img = await cargarImg(original);
  const k = Math.min(1, MAX_PX / img.naturalWidth, MAX_PX / img.naturalHeight);
  if (k === 1 && !quitarFondo) return original;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0, c.width, c.height);
  if (quitarFondo) {
    const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      const lum = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
      const a = Math.max(0, Math.min(1, (238 - lum) / (238 - 170))); // ≥238 transparente, ≤170 opaco
      p[i + 3] = Math.round(p[i + 3] * a);
    }
    g.putImageData(d, 0, 0);
  }
  let out = c.toDataURL('image/png');
  if (bytesDe(out) > MAX_BYTES) out = c.toDataURL('image/webp', 0.85);
  return out;
}

/** Cuadro de vista previa sobre fondo blanco (así saldrá en el documento). */
function Vista({ src, vacio }: { src?: string; vacio: string }) {
  return (
    <div className="grid h-[120px] place-items-center rounded-md border border-slate-300 bg-white p-2">
      {src ? <img src={src} alt="Vista previa de la firma" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-slate-400">{vacio}</span>}
    </div>
  );
}

/** Editor de la firma de UN usuario (id = 'me' o el id de la cuenta): cargar / reemplazar / quitar, con vista previa y errores dentro del modal. */
export function FirmaModal({ id, nombre, rol, onClose, onChanged }: { id: string; nombre: string; rol: string; onClose: () => void; onChanged?: () => void }) {
  const [actual, setActual] = useState<FirmaDto | null | undefined>(undefined);
  const [nueva, setNueva] = useState<{ file: File; url: string } | null>(null);
  const [quitarFondo, setQuitarFondo] = useState(false);
  const [vista, setVista] = useState<string | undefined>();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const inp = useRef<HTMLInputElement>(null);
  const ruta = `/usuarios/${encodeURIComponent(id)}/firma`;

  useEffect(() => {
    api.get<FirmaDto>(ruta).then(setActual).catch(() => setActual(null));
  }, [ruta]);

  // La vista previa se recalcula al elegir archivo o al activar «quitar fondo».
  useEffect(() => {
    if (!nueva) { setVista(undefined); return; }
    let vivo = true;
    preparar(nueva.file, quitarFondo).then(u => { if (vivo) { setVista(u); setErr(bytesDe(u) > MAX_BYTES ? 'La imagen pesa más de 300 KB aun reducida: usa una más liviana' : ''); } }).catch(e => { if (vivo) { setVista(undefined); setErr((e as Error).message); } });
    return () => { vivo = false; };
  }, [nueva, quitarFondo]);

  const elegir = async (f?: File) => {
    if (!f) return;
    setErr('');
    if (!(await tipoReal(f))) { setNueva(null); return setErr('El archivo no es una imagen PNG, JPG o WebP'); }
    if (f.size > 4 * 1024 * 1024) { setNueva(null); return setErr('El archivo es demasiado grande (máx. 4 MB; se reduce a 300 KB al cargar)'); }
    setNueva({ file: f, url: '' });
  };

  const guardar = async () => {
    if (!vista) return;
    setBusy(true); setErr('');
    try { await api.put(ruta, { imagen: vista }); onChanged?.(); onClose(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const quitar = async () => {
    setBusy(true); setErr('');
    try { await api.del(ruta); setConfirmar(false); onChanged?.(); onClose(); } catch (e) { setConfirmar(false); setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <>
      <Modal onClose={busy ? undefined : onClose} width={480}>
        <div className="flex flex-col gap-3 p-5">
          <div>
            <div className="text-base font-semibold">{id === 'me' ? 'Mi firma' : 'Firma de ' + nombre}</div>
            <div className="text-xs text-slate-500">{rol} · se imprime sobre la línea de firma de los documentos que te corresponden.</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1"><span className="text-xs font-medium text-slate-600">Firma actual</span><Vista src={actual?.dataUrl} vacio={actual === undefined ? 'Cargando…' : 'Sin firma cargada'} /></div>
            <div className="flex flex-col gap-1"><span className="text-xs font-medium text-slate-600">Nueva (vista previa)</span><Vista src={vista} vacio="Elige una imagen" /></div>
          </div>
          <input ref={inp} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { void elegir(e.target.files?.[0]); e.target.value = ''; }} />
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => inp.current?.click()} disabled={busy} className={btn}><i className="ph ph-upload-simple" />{actual ? 'Reemplazar…' : 'Cargar firma…'}</button>
            <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={quitarFondo} onChange={e => setQuitarFondo(e.target.checked)} disabled={!nueva} />Quitar fondo blanco</label>
          </div>
          <div className="text-[11px] text-slate-500">PNG, JPG o WebP · máx. 300 KB y 1200 px (las imágenes grandes se reducen solas). Mejor si es una firma oscura sobre fondo blanco o transparente.</div>
          {err && <div role="alert" className="text-xs font-medium text-[#DC2626]">{err}</div>}
        </div>
        <div className="flex items-center gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
          {actual && <button onClick={() => setConfirmar(true)} disabled={busy} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-[13px] font-medium text-[#DC2626] disabled:opacity-50"><i className="ph ph-trash" /> Quitar</button>}
          <span className="flex-1" />
          <button onClick={onClose} disabled={busy} className="h-9 rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium disabled:opacity-50">Cerrar</button>
          <button onClick={guardar} disabled={!vista || busy || !!err} className={`${btnPrimary} disabled:cursor-not-allowed disabled:opacity-50`}>{busy ? 'Guardando…' : 'Guardar firma'}</button>
        </div>
      </Modal>
      {confirmar && <ConfirmModal title="Quitar la firma" confirmLabel="Quitar firma" busyLabel="Quitando…" danger busy={busy} onConfirm={quitar} onClose={() => setConfirmar(false)}>
        {id === 'me' ? 'Tus' : `Los`} documentos dejarán de llevar la firma {id === 'me' ? '' : `de ${nombre} `}y saldrán con la línea en blanco. Queda registrado en auditoría.
      </ConfirmModal>}
    </>
  );
}

/** Miniatura de la lista (carga perezosa: la API solo entrega la imagen a quien administra usuarios). */
function Mini({ id, v }: { id: string; v: string | undefined }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => { let vivo = true; setSrc(undefined); if (v) api.get<FirmaDto>(`/usuarios/${encodeURIComponent(id)}/firma`).then(r => vivo && setSrc(r.dataUrl)).catch(() => undefined); return () => { vivo = false; }; }, [id, v]);
  return <span className="grid h-10 w-24 flex-none place-items-center rounded border border-slate-200 bg-white">{src ? <img src={src} alt="" className="max-h-9 max-w-[88px] object-contain" /> : <span className="text-[10px] text-slate-400">{v ? '…' : 'Sin firma'}</span>}</span>;
}

/** Configuración › Firmas: lista de firmantes por rol. */
export default function Firmas() {
  const toast = useToast();
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState('');
  const [sel, setSel] = useState<Fila | null>(null);
  const [quitar, setQuitar] = useState<Fila | null>(null);
  const [busy, setBusy] = useState(false);
  const cargar = useCallback(() => { api.get<Fila[]>('/firmas').then(r => { setFilas(r); setError(''); }).catch(e => setError((e as Error).message)); }, []);
  useEffect(cargar, [cargar]);

  const confirmarQuitar = async () => {
    if (!quitar) return;
    setBusy(true);
    try { await api.del(`/usuarios/${encodeURIComponent(quitar.id)}/firma`); toast('Firma de ' + quitar.nombre + ' eliminada', 'ok'); setQuitar(null); cargar(); } catch (e) { toast((e as Error).message, 'bad'); setQuitar(null); } finally { setBusy(false); }
  };

  return (
    <div className="flex max-w-[860px] flex-col gap-3.5">
      <section className={`${card} p-[18px]`}>
        <div className="text-sm font-semibold">Firmas en documentos</div>
        <div className="mt-0.5 text-xs text-slate-500">Recibos y cuadre llevan la firma de la cajera que los emitió; los documentos oficiales, la del Director Académico activo; los records, la del docente responsable. Quien no tiene firma cargada imprime la línea en blanco. Cada persona también puede cargar la suya desde su menú de usuario («Mi firma»).</div>
      </section>
      {error && <div role="alert" className="text-sm font-medium text-[#DC2626]">{error}</div>}
      {!filas && !error && <div className="text-sm text-slate-500">Cargando…</div>}
      {filas && GRUPOS.map(([rol, titulo, icon]) => {
        const g = filas.filter(f => f.rol === rol);
        return (
          <section key={rol} className={`${card} overflow-hidden`}>
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 text-sm font-semibold"><i className={`ph ${icon} text-slate-500`} />{titulo}<span className="text-xs font-normal text-slate-500">· {g.filter(f => f.tiene).length} de {g.length} con firma</span></div>
            {!g.length && <div className="px-4 py-3 text-[13px] text-slate-500">No hay usuarios activos con este rol.</div>}
            {g.map(f => (
              <div key={f.id} className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-b-0">
                <Mini id={f.id} v={f.tiene ? f.updatedAt : undefined} />
                <div className="min-w-[160px] flex-1"><div className="text-[13px] font-medium">{f.nombre}</div><div className="font-mono text-[11px] text-slate-500">{f.usuario}{f.updatedAt ? ` · actualizada ${new Date(f.updatedAt).toLocaleDateString('es-DO')} por ${f.updatedBy}` : ''}</div></div>
                <button onClick={() => setSel(f)} className={btn}><i className="ph ph-upload-simple" />{f.tiene ? 'Reemplazar' : 'Cargar firma'}</button>
                {f.tiene && <button onClick={() => setQuitar(f)} className={`${btn} text-[#DC2626]`}><i className="ph ph-trash" />Quitar</button>}
              </div>
            ))}
          </section>
        );
      })}
      {sel && <FirmaModal id={sel.id} nombre={sel.nombre} rol={sel.rol} onClose={() => setSel(null)} onChanged={() => { toast('Firma de ' + sel.nombre + ' guardada', 'ok'); cargar(); }} />}
      {quitar && <ConfirmModal title={'Quitar la firma de ' + quitar.nombre} confirmLabel="Quitar firma" busyLabel="Quitando…" danger busy={busy} onConfirm={confirmarQuitar} onClose={() => setQuitar(null)}>
        Sus documentos saldrán con la línea de firma en blanco. Queda registrado en auditoría.
      </ConfirmModal>}
    </div>
  );
}
