import { useEffect, useState } from 'react';
import type { CierreResultado, CierreResumen } from '@stodia/shared';
import { btn, btnPrimary, td, th } from '../../components/system/styles';
import { Modal, useUi } from '../../components/system/UiProvider';
import { fmt } from '../../components/finanzas/fin';
import { api } from '../../lib/api';

/**
 * CIERRE DEL AÑO ESCOLAR (contable/administrativo) en Configuración → Ciclos lectivos. Flujo: vista previa con los totales del ciclo (GET /config/ciclos/:n/cierre)
 * → confirmación escrita CERRAR-<ciclo> + clave de supervisor (Guard de UiProvider) → POST /config/ciclos/:n/eoy → resultado con la foto guardada.
 * El cierre NO promueve alumnos: eso es «Promoción de curso» (pestaña propia). Ver docs/cierre-y-promocion.md.
 */
export function ResumenCierre({ r }: { r: CierreResumen }) {
  const T: [string, number, string?][] = [
    ['Facturado (cargos del ciclo)', r.facturado], ['Cobrado (recibos del ciclo)', r.cobrado], ['Notas de crédito', r.notasCredito], ['Notas de débito', r.notasDebito],
    ['Cobrado neto', r.cobradoNeto], ['Descuentos aplicados', r.descuentos], ['Pendiente por cobrar', r.pendiente, 'text-[#B45309]'], ['De ello vencido', r.vencido, 'text-[#DC2626]'],
    ['Recargos por mora', r.mora], ['Mora pendiente', r.moraPendiente],
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr))]">
        {T.map(([l, v, c]) => (
          <div key={l} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[11px] font-medium text-slate-500">{l}</div>
            <div className={`font-mono text-sm font-semibold ${c ?? 'text-ink'}`}>{fmt(v)}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        <span>{r.recibos} recibos{r.recibosAnulados ? ` (+${r.recibosAnulados} anulados)` : ''}</span><span>{r.cargos} cargos · {r.cargosPendientes} sin pagar</span>
        <span>{r.alumnosConDeuda} alumnos con deuda</span><span>{r.matriculas} matrículas en el ciclo</span>
      </div>
      {r.deudaAlumnos.length > 0 && (
        <div className="max-h-[220px] overflow-auto rounded-md border border-slate-200">
          <table className="w-full border-collapse text-[12px]">
            <thead className="sticky top-0"><tr><th className={th}>Mayores deudas al cierre</th><th className={th}>Sección</th><th className={`${th} text-right`}>Pendiente</th><th className={`${th} text-right`}>Vencido</th></tr></thead>
            <tbody>
              {r.deudaAlumnos.slice(0, 15).map(d => (
                <tr key={d.alumnoId} className="h-8"><td className={td}>{d.nombre} <span className="font-mono text-[11px] text-slate-400">{d.code}</span></td><td className={td}>{d.seccion}</td><td className={`${td} text-right font-mono`}>{fmt(d.pendiente)}</td><td className={`${td} text-right font-mono text-[#DC2626]`}>{d.vencido ? fmt(d.vencido) : '—'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Modal del cierre: `ciclo` activo a cerrar (o uno Cerrado para consultar su foto). `onDone` recarga Configuración tras cerrar. */
export function CierreModal({ ciclo, onClose, onDone }: { ciclo: string; onClose: () => void; onDone: () => Promise<void> }) {
  const { toast, openGuard } = useUi();
  const [r, setR] = useState<CierreResumen | null>(null);
  const [err, setErr] = useState('');
  const [hecho, setHecho] = useState<CierreResultado | null>(null);
  useEffect(() => {
    let vivo = true;
    api.get<CierreResumen>(`/config/ciclos/${encodeURIComponent(ciclo)}/cierre`).then(x => { if (vivo) setR(x); }).catch(e => { if (vivo) setErr((e as Error).message); });
    return () => { vivo = false; };
  }, [ciclo]);
  const code = 'CERRAR-' + ciclo.replace('–', '-');
  const cerrar = () => {
    if (!r) return;
    if (!r.siguiente) return toast('Crea primero el ciclo siguiente para poder cerrar este', 'warn');
    openGuard({
      title: 'Cierre del año escolar · ' + ciclo, code, pin: true, label: 'Cerrar año escolar',
      desc: `Congela ${ciclo} para edición (solo lectura), guarda el resumen contable y activa ${r.siguiente}. No promueve alumnos. No se puede deshacer.`,
      onOk: async token => {
        try {
          const res = await api.post<CierreResultado>(`/config/ciclos/${encodeURIComponent(ciclo)}/eoy`, { code, pin: token });
          setHecho(res); setR(res.resumen);
          toast(`Año escolar ${ciclo} cerrado · ${res.activo} activo`, 'ok');
        } catch (e) { toast((e as Error).message, 'bad'); }
      },
    });
  };
  // Tras cerrar, Configuración se recarga al SALIR del modal (recargar antes cambia el selector de ciclo y desmonta la pantalla, perdiendo el resultado).
  const salir = () => { onClose(); if (hecho) void onDone(); };
  const yaCerrado = r?.estado === 'Cerrado'; // con foto (CierreCiclo) o cerrado antes de existir el registro de cierres (totales calculados al consultar)
  return (
    <Modal onClose={salir} width={720}>
      <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-3.5">
        <span className={`grid h-9 w-9 flex-none place-items-center rounded-full text-lg ${yaCerrado ? 'bg-ok-bg text-ok-fg' : 'bg-bad-bg text-[#DC2626]'}`}><i className={yaCerrado ? 'ph ph-lock-key' : 'ph ph-calculator'} /></span>
        <div className="min-w-0">
          <div className="text-base font-semibold">{yaCerrado ? `Cierre del año escolar ${ciclo}` : `Cerrar el año escolar ${ciclo}`}</div>
          <div className="mt-0.5 text-[12px] leading-normal text-slate-600">
            {hecho ? <>Cierre completado. <b>{hecho.activo}</b> es ahora el ciclo activo{hecho.alineados ? ` · ${hecho.alineados} alumnos pasan a la sección que ya tenían en ${hecho.activo}` : ''}{hecho.egresados ? ` · ${hecho.egresados} egresados (promoción ya aplicada)` : ''}.</>
              : yaCerrado ? (r?.cerrado ? <>Cerrado el {new Date(r.cerrado.fecha).toLocaleString('es-DO')} por {r.cerrado.usuarioNombre || r.cerrado.usuario}. Foto contable guardada al cerrar (solo lectura).</> : <>Ciclo cerrado antes de existir el registro de cierres: totales calculados ahora con los datos del ciclo (solo lectura).</>)
              : <>Cierre <b>contable y de edición</b>: guarda este resumen, deja {ciclo} en solo lectura y activa {r?.siguiente ?? 'el ciclo siguiente'}. <b>No mueve alumnos de curso</b>: la promoción se hace aparte, por notas, en «Promoción de curso». La deuda pendiente sigue cobrable desde el ciclo activo.</>}
          </div>
        </div>
      </div>
      <div className="max-h-[65vh] overflow-auto px-5 py-4">
        {err ? <div role="alert" className="rounded-md bg-bad-bg px-3 py-2 text-xs text-[#DC2626]">{err}</div> : !r ? <div className="text-sm text-slate-500">Calculando resumen…</div> : <ResumenCierre r={r} />}
        {r && !yaCerrado && !r.siguiente && <div role="alert" className="mt-3 rounded-md bg-warn-bg px-3 py-2 text-xs text-[#92400E]">Crea primero el ciclo siguiente (Nuevo año escolar) para poder cerrar este.</div>}
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
        <button onClick={salir} className={btn}>{yaCerrado ? 'Cerrar' : 'Cancelar'}</button>
        {r && !yaCerrado && <button onClick={cerrar} disabled={!r.siguiente} className={`${btnPrimary} !bg-[#DC2626]`}><i className="ph ph-lock-key" />Continuar al cierre…</button>}
      </div>
    </Modal>
  );
}
