import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CobroComprobante, CobroCuenta, RncConsulta, TipoLogico } from '@stodia/shared';
import { api } from '../../lib/api';
import { mascaraRnc, rncValido, soloDigitos } from '../../lib/rnc';

/**
 * Comprobante fiscal del cobro (Terminal de Cobros › Resumen de Cobro). Estado por defecto: UNA línea compacta «Comprobante: Consumo · E32» (Consumo es el tipo por defecto y,
 * bajo el umbral, no pide nada). «Cambiar» despliega 4 segmentos (Crédito fiscal, Consumo, Gubernamental, Régimen especial); el prefijo que se muestra es el que el SERVIDOR usará
 * según la modalidad configurada en Configuración › Fiscal. Los datos del comprador solo aparecen cuando el tipo los exige y NUNCA como inputs si la cuenta ya tiene cédula/RNC
 * registrada (casilla «Hacerlo a nombre de la cédula registrada»). La razón social no se escribe: se resuelve por el RNC (tutores, recibos anteriores y, a futuro, DGII).
 */
export type EstadoRnc = 'idle' | 'buscando' | 'ok' | 'sin';
export interface DatosFiscales {
  rnc: string; nombre: string; regimen: string;
  /** Casilla «a nombre de la cédula registrada» (marcada por defecto cuando la cuenta tiene identificación). */
  usarRegistrada: boolean;
  /** Búsqueda de la razón social por el RNC escrito: ok = fijada por la fuente; sin = no encontrada (se escribe a mano, sin verificar). */
  estadoRnc: EstadoRnc; fuente?: RncConsulta['fuente'];
}
export const DATOS_VACIOS: DatosFiscales = { rnc: '', nombre: '', regimen: '', usarRegistrada: true, estadoRnc: 'idle' };
type Registrada = CobroCuenta['fiscal'] | null | undefined;

export const TIPOS_UI: { logico: TipoLogico; nombre: string }[] = [
  { logico: 'CREDITO_FISCAL', nombre: 'Crédito fiscal' },
  { logico: 'CONSUMO', nombre: 'Consumo' },
  { logico: 'GUBERNAMENTAL', nombre: 'Gubernamental' },
  { logico: 'REGIMEN_ESPECIAL', nombre: 'Régimen especial' },
];
/** Exige RNC/cédula y razón social del comprador (consumo solo sobre el umbral). */
export const exigeDatos = (t: TipoLogico, total: number, umbral: number) => t === 'CREDITO_FISCAL' || t === 'GUBERNAMENTAL' || t === 'REGIMEN_ESPECIAL' || (t === 'CONSUMO' && umbral > 0 && total >= umbral);
/** La casilla «cédula registrada» solo se ofrece en Crédito fiscal y en Consumo sobre el umbral (el RNC de una entidad pública o de régimen especial casi nunca es el del tutor). */
export const ofreceRegistrada = (t: TipoLogico, total: number, umbral: number, reg: Registrada) =>
  !!reg?.tieneIdentificacion && (t === 'CREDITO_FISCAL' || (t === 'CONSUMO' && exigeDatos(t, total, umbral)));
const usaRegistrada = (t: TipoLogico, total: number, umbral: number, d: DatosFiscales, reg: Registrada) => ofreceRegistrada(t, total, umbral, reg) && d.usarRegistrada;
/** Comprador que se envía al cobrar (null = sin datos fiscales). El servidor vuelve a resolver la razón social y es quien la fija en el recibo. */
export function datosEnvio(t: TipoLogico, total: number, umbral: number, d: DatosFiscales, reg: Registrada): { rnc: string; nombre: string } | null {
  if (!exigeDatos(t, total, umbral)) return null;
  if (usaRegistrada(t, total, umbral, d, reg)) return { rnc: soloDigitos(reg!.identificacion), nombre: reg!.nombre };
  return { rnc: soloDigitos(d.rnc), nombre: d.nombre.trim() };
}
/** Mensaje de lo que falta para poder cobrar con este comprobante ('' = completo). */
export function faltaFiscal(t: TipoLogico, total: number, umbral: number, d: DatosFiscales, disponible: boolean, motivo?: string, reg?: Registrada): string {
  if (!disponible) return motivo ?? 'No hay secuencia de comprobante disponible';
  if (!exigeDatos(t, total, umbral)) return '';
  if (usaRegistrada(t, total, umbral, d, reg)) return '';
  if (!d.rnc.trim()) return t === 'CONSUMO' ? 'Consumo sobre el umbral: ingresa la cédula o RNC del comprador' : 'Ingresa el RNC o cédula del comprador';
  if (!rncValido(d.rnc)) return 'El RNC debe tener 9 dígitos o la cédula 11 dígitos';
  if (d.estadoRnc === 'idle' || d.estadoRnc === 'buscando') return 'Buscando la razón social del RNC…';
  if (d.estadoRnc === 'sin' && d.nombre.trim().length < 3) return 'Escribe la razón social del comprador (mínimo 3 caracteres)';
  return '';
}
/** Heurística SIN VALIDAR (A VALIDAR con la DGII): los RNC de entidades públicas suelen empezar por 4. Solo avisa, no bloquea. */
const parecePublico = (rnc: string) => { const d = soloDigitos(rnc); return d.length === 9 && d.startsWith('4'); };
const fmt = (n: number) => 'RD$ ' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
const FUENTE: Record<NonNullable<DatosFiscales['fuente']>, string> = { tutor: 'del registro de tutores', historial: 'de un cobro anterior', dgii: 'verificado en la DGII ✓' };

export default function ComprobanteSelector({ tipos, value, onChange, datos, onDatos, registrada, total, umbral, habitual, recordar, onRecordar, disabled, ecf }: {
  tipos: CobroComprobante[]; value: TipoLogico; onChange: (t: TipoLogico) => void; datos: DatosFiscales; onDatos: React.Dispatch<React.SetStateAction<DatosFiscales>>; registrada?: Registrada;
  total: number; umbral: number; habitual: TipoLogico | null; recordar: boolean; onRecordar: (b: boolean) => void; disabled?: boolean; ecf: boolean;
}) {
  const nav = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [tocado, setTocado] = useState(false);
  const rncRef = useRef<HTMLInputElement>(null);
  const por = (l: TipoLogico) => tipos.find(t => t.logico === l);
  const nombreLog = TIPOS_UI.find(t => t.logico === value)?.nombre ?? '', sel = por(value), exige = exigeDatos(value, total, umbral);
  const ofrece = ofreceRegistrada(value, total, umbral, registrada), conCasilla = usaRegistrada(value, total, umbral, datos, registrada);
  const manual = exige && !conCasilla;
  const digs = soloDigitos(datos.rnc), rncOk = rncValido(datos.rnc);
  const rncMal = digs.length > 0 && !rncOk && (tocado || digs.length > 11 || digs.length === 10);
  const field = 'h-8 w-full rounded-md border bg-white px-2.5 text-xs outline-none focus:border-accent';

  // Búsqueda automática de la razón social al completar 9/11 dígitos (debounce 350 ms). El servidor vuelve a resolverla al cobrar.
  useEffect(() => {
    if (!manual || !rncOk) return;
    let vivo = true;
    onDatos(p => (p.estadoRnc === 'buscando' ? p : { ...p, estadoRnc: 'buscando' }));
    const t = setTimeout(() => {
      const fin = (f: (p: DatosFiscales) => DatosFiscales) => { if (vivo) onDatos(p => (soloDigitos(p.rnc) === digs ? f(p) : p)); };
      api.get<RncConsulta>('/cobros/rnc/' + digs)
        .then(r => fin(p => (r.encontrado && r.razonSocial ? { ...p, estadoRnc: 'ok', nombre: r.razonSocial, fuente: r.fuente } : { ...p, estadoRnc: 'sin', fuente: undefined, nombre: '' })))
        .catch(() => fin(p => ({ ...p, estadoRnc: 'sin', fuente: undefined, nombre: '' })));
    }, 350);
    return () => { vivo = false; clearTimeout(t); };
  }, [manual, rncOk, digs, onDatos]);

  const elegir = (l: TipoLogico) => {
    const c = por(l);
    if (!c || !c.disponible) { setAviso(`${c?.codigo ?? ''} sin secuencia disponible.`.trim()); return; }
    setAviso(null); onChange(l); setAbierto(false);
  };
  const mover = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    for (let k = 1; k <= TIPOS_UI.length; k++) {
      const j = (i + d * k + TIPOS_UI.length * 4) % TIPOS_UI.length, c = por(TIPOS_UI[j].logico);
      if (c?.disponible) { elegir(TIPOS_UI[j].logico); (e.currentTarget.parentElement?.children[j] as HTMLElement | undefined)?.focus(); return; }
    }
  };
  const setRnc = (v: string) => onDatos(p => ({ ...p, rnc: mascaraRnc(v), nombre: '', estadoRnc: 'idle', fuente: undefined }));
  const cambiarRnc = () => { onDatos(p => ({ ...p, rnc: '', nombre: '', estadoRnc: 'idle', fuente: undefined })); setTocado(false); setTimeout(() => rncRef.current?.focus(), 0); };

  const etiquetaCasilla = value === 'CONSUMO' ? 'Identificar al comprador con la cédula registrada' : registrada?.esRnc ? 'Hacerlo a nombre del RNC registrado' : 'Hacerlo a nombre de la cédula registrada';
  return (
    <div className="flex flex-col gap-2 border-t border-slate-200 pt-2.5" data-testid="comprobante">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-500">Comprobante:</span>
        <button type="button" onClick={() => setAbierto(a => !a)} disabled={disabled} aria-expanded={abierto} aria-controls="comprobante-opciones" data-testid="comprobante-chip"
          title={habitual === value ? 'Comprobante habitual de esta cuenta' : 'Cambiar el tipo de comprobante'}
          className="inline-flex h-6 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 font-medium text-slate-700 hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60">
          <span data-testid="comprobante-resumen">{sel ? `${nombreLog} · ${sel.codigo}` : nombreLog}</span>
          {habitual === value && <i className="ph-fill ph-star text-[10px] text-amber-500" aria-label="Habitual" />}
          <i className={`ph ph-caret-${abierto ? 'up' : 'down'} text-[10px] text-slate-500`} aria-hidden />
        </button>
        {sel?.modalidad === 'ELECTRONICA' && (
          <span role="img" tabIndex={0} data-testid="comprobante-ecf" className="text-warn-fg"
            aria-label={`e-NCF: queda pendiente de envío a la DGII.${ecf ? '' : ' Sin certificado e-CF cargado.'}`}
            title={`e-NCF: queda pendiente de envío a la DGII.${ecf ? '' : ' Sin certificado e-CF cargado.'}`}><i className="ph ph-paper-plane-tilt" /></span>
        )}
        <button type="button" onClick={() => setAbierto(a => !a)} disabled={disabled} className="ml-auto text-[11px] font-semibold text-accent hover:underline disabled:opacity-50">{abierto ? 'Cerrar' : 'Cambiar'}</button>
      </div>

      {abierto && (
        <div id="comprobante-opciones" className="flex flex-col gap-1.5">
          <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label="Tipo de comprobante">
            {TIPOS_UI.map((t, i) => {
              const c = por(t.logico), on = value === t.logico, off = !c || !c.disponible;
              return (
                <button key={t.logico} type="button" role="radio" aria-checked={on} aria-disabled={off || undefined} data-tipo={t.logico} tabIndex={on ? 0 : -1}
                  title={c && !c.disponible ? c.motivo : habitual === t.logico ? 'Comprobante habitual de esta cuenta' : undefined}
                  onClick={() => elegir(t.logico)} onKeyDown={e => mover(e, i)}
                  className={`flex h-8 min-w-0 items-center justify-between gap-1 rounded-md border px-2 text-left text-xs ${on ? 'border-accent bg-blue-50 font-semibold text-accent' : 'border-slate-200 bg-white font-medium text-slate-700 hover:border-slate-300'} ${off ? 'cursor-not-allowed opacity-50' : ''}`}>
                  <span className="truncate">{t.nombre}</span>
                  <span className="flex flex-none items-center gap-1 font-mono text-[10px] text-slate-500">{off && <span className="font-sans italic">sin sec.</span>}{c?.codigo || '—'}</span>
                </button>
              );
            })}
          </div>
          <div aria-live="polite">
            {aviso && (
              <div className="text-[11px] text-slate-600">{aviso} <button type="button" onClick={() => nav('/config?tab=fiscal')} className="font-semibold text-accent hover:underline">Registrar una autorización en Configuración › Fiscal</button></div>
            )}
          </div>
          {value !== (habitual ?? 'CONSUMO') && (
            <button type="button" aria-pressed={recordar} onClick={() => onRecordar(!recordar)} className="self-start text-[11px] font-medium text-accent hover:underline">
              <i className={`ph ${recordar ? 'ph-check-square' : 'ph-square'}`} aria-hidden /> Recordar {nombreLog.toLowerCase()} como habitual de esta cuenta
            </button>
          )}
        </div>
      )}

      {exige && (
        <div className="flex flex-col gap-1.5 rounded-md bg-slate-50 px-2.5 py-2 text-[11px] text-slate-600" data-testid="datos-fiscales">
          {value === 'CONSUMO' && <div>Consumo por {fmt(umbral)} o más: hay que identificar al comprador.</div>}
          {ofrece && (
            <label className="flex cursor-pointer select-none items-start gap-1.5">
              <input type="checkbox" className="mt-0.5" checked={datos.usarRegistrada} onChange={e => onDatos(p => ({ ...p, usarRegistrada: e.target.checked }))} data-testid="usar-registrada" />
              <span><span className="font-medium text-slate-700">{etiquetaCasilla}</span><br /><span data-testid="registrada-dato">{registrada!.nombre} · {registrada!.identificacion}</span></span>
            </label>
          )}
          {manual && (
            <>
              <label className="flex flex-col gap-1 font-medium">RNC / Cédula *
                <input ref={rncRef} value={datos.rnc} onChange={e => setRnc(e.target.value)} onBlur={() => setTocado(true)} inputMode="numeric" placeholder="9 u 11 dígitos" maxLength={13} data-testid="cliente-rnc"
                  aria-invalid={rncMal || undefined} className={`${field} font-mono`} style={{ borderColor: rncMal || !digs ? '#F59E0B' : '#CBD5E1' }} />
              </label>
              {rncMal && <div className="font-medium text-[#B45309]" role="alert">Debe tener 9 dígitos (RNC) u 11 (cédula).</div>}
              <div aria-live="polite" data-testid="razon-social">
                {rncOk && datos.estadoRnc !== 'sin' && datos.estadoRnc !== 'ok' && <span className="italic text-slate-500">Buscando…</span>}
                {rncOk && datos.estadoRnc === 'ok' && (
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><div className="truncate text-xs font-semibold text-slate-800" data-testid="razon-social-texto" title={datos.nombre}>{datos.nombre}</div>
                      <div className="text-[10px] text-slate-500">{datos.fuente ? FUENTE[datos.fuente] : ''}</div></div>
                    <button type="button" onClick={cambiarRnc} className="flex-none font-semibold text-accent hover:underline">Cambiar RNC</button>
                  </div>
                )}
                {rncOk && datos.estadoRnc === 'sin' && (
                  <label className="flex flex-col gap-1 font-medium">Razón social / nombre *
                    <input value={datos.nombre} onChange={e => onDatos(p => ({ ...p, nombre: e.target.value }))} data-testid="cliente-nombre" className={field} style={{ borderColor: datos.nombre.trim().length < 3 ? '#F59E0B' : '#CBD5E1' }} />
                    <span className="text-[10px] font-normal italic text-slate-500">Sin verificar: se validará con la DGII cuando se configure.</span>
                  </label>
                )}
              </div>
              {value === 'REGIMEN_ESPECIAL' && (
                <label className="flex flex-col gap-1 font-medium">Número / certificación del régimen (opcional · A VALIDAR)
                  <input value={datos.regimen} onChange={e => onDatos(p => ({ ...p, regimen: e.target.value }))} data-testid="cliente-regimen" className={`${field} font-mono`} style={{ borderColor: '#CBD5E1' }} />
                </label>
              )}
              {value === 'GUBERNAMENTAL' && rncOk && !parecePublico(datos.rnc) && datos.estadoRnc === 'sin' && (
                <div className="font-medium text-warn-fg"><i className="ph ph-warning" /> El RNC no parece de una entidad pública (A VALIDAR). Puedes continuar.</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
