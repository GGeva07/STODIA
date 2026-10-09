import { Modal, useToast } from '../../components/system/UiProvider';
import { hoyDMY, usePrintBusy } from '../../components/finanzas/print';
import { printCarta } from '../../components/personas/printCarta';

/** Respuesta de POST /catalogos/:tipo/:id/acceso y de /catalogos/acceso/pendientes (la clave solo viaja esta vez). */
export interface Acceso { tipo: string; id: string; nombre: string; usuario: string; rol: string; password: string; creado: boolean }
export interface AccesoLote { creados: Acceso[]; omitidos: { nombre: string; motivo: string }[] }

const POR_HOJA = 14;

/** Credenciales temporales (una sola vez): se muestran e imprimen aquí; el servidor solo guarda el hash. */
export default function Credenciales({ items, omitidos = [], onClose }: { items: Acceso[]; omitidos?: AccesoLote['omitidos']; onClose: () => void }) {
  const toast = useToast();
  const pb = usePrintBusy()('catAccesos', 'Imprimir credenciales', 'ph ph-printer');
  const copy = (s: string) => navigator.clipboard?.writeText(s).then(() => toast('Copiado', 'ok')).catch(() => toast('No se pudo copiar', 'warn'));
  const imprimir = () => {
    const hojas = [];
    for (let i = 0; i < items.length; i += POR_HOJA) {
      hojas.push({
        title: 'Accesos al sistema · contraseñas temporales', sub: `${hoyDMY()} · hoja ${hojas.length + 1} de ${Math.ceil(items.length / POR_HOJA)}`,
        blocks: [
          { t: 'table' as const, head: ['Nombre', 'Usuario', 'Rol', 'Contraseña temporal'], rows: items.slice(i, i + POR_HOJA).map(a => [a.nombre, a.usuario, a.rol, a.password]), widths: ['2fr', '1.3fr', '1.2fr', '1.3fr'], aligns: ['left', 'left', 'left', 'left'] },
          { t: 'text' as const, s: 'Entregue cada contraseña en persona. Al ingresar por primera vez el sistema exige crear una contraseña nueva. Esta hoja no se puede reimprimir: destrúyala después de entregarla.' },
        ],
      });
    }
    printCarta(hojas, ['Administración'], 'Accesos al sistema', 'catAccesos', `accesos_${new Date().toISOString().slice(0, 10)}.pdf`);
  };
  return (
    <Modal width={items.length > 1 ? 640 : 460} z={95} onClose={onClose}>
      <div className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-2 text-base font-semibold"><i className="ph ph-key text-accent" />{items.length === 1 ? `Acceso creado · ${items[0].nombre}` : `${items.length} accesos creados`}</div>
        <div className="max-h-[320px] overflow-auto rounded-md border border-slate-200">
          <table className="w-full border-collapse text-[13px]">
            <thead><tr>{['Nombre', 'Usuario', 'Rol', 'Contraseña temporal', ''].map(h => <th key={h} className="sticky top-0 border-b border-slate-200 bg-slate-50 px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-600">{h}</th>)}</tr></thead>
            <tbody>{items.map(a => (
              <tr key={a.tipo + a.id}>
                <td className="border-b border-slate-100 px-2.5 py-1.5">{a.nombre}</td>
                <td className="border-b border-slate-100 px-2.5 py-1.5 font-mono text-xs">{a.usuario}</td>
                <td className="border-b border-slate-100 px-2.5 py-1.5 text-xs">{a.rol}</td>
                <td className="border-b border-slate-100 px-2.5 py-1.5 font-mono text-[13px] font-semibold">{a.password}</td>
                <td className="border-b border-slate-100 px-1 py-1.5"><button onClick={() => copy(`${a.usuario} / ${a.password}`)} aria-label={'Copiar credenciales de ' + a.nombre} className="h-7 w-7 rounded-md border border-slate-300 bg-white"><i className="ph ph-copy" /></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {omitidos.length > 0 && <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">Omitidos ({omitidos.length}): {omitidos.map(o => `${o.nombre} (${o.motivo})`).join('; ')}</div>}
        <div className="rounded-md bg-warn-bg px-3 py-2 text-xs leading-snug text-amber-800">Estas contraseñas se muestran <b>una sola vez</b>: no se guardan en claro y no podrán consultarse luego. Cada persona deberá cambiarla en su primer ingreso.</div>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
        <button onClick={imprimir} className="flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium"><i className={pb.icon} style={{ animation: pb.spin }} />{pb.label}</button>
        <button onClick={onClose} className="h-9 rounded-md bg-accent px-4 text-[13px] font-semibold text-white hover:bg-accent-dark">Listo</button>
      </div>
    </Modal>
  );
}
