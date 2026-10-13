import type { NotaFiscalDto } from '@stodia/shared';
import { B, hoyDMY, type PDoc } from './print';
import { fmt, fmtDoc } from './fin';
import { cajaSync } from './caja';

/**
 * Documentos de las NOTAS DE CREDITO / DEBITO: tirilla (80 mm) y carta (con firmas). Salen SOLO del DTO de la API (lib/notas.notaDto), de modo que lo que se ve tras emitir,
 * al abrir la nota desde el listado y en el PDF es identico. La vista previa es la de print.tsx y el PDF real lo genera pdfEngine.
 */
export function docNota(n: NotaFiscalDto, formato: 'tirilla' | 'carta' = 'tirilla'): PDoc {
  const cr = n.clase === 'CREDITO', electronico = n.tipoComprobante.modalidad === 'ELECTRONICA';
  const cj = cajaSync(), caja = n.caja || cj.caja, sede = [caja, n.sucursal ? 'Sucursal ' + n.sucursal : ''].filter(Boolean).join(' · ');
  const titulo = (cr ? 'Nota de crédito' : 'Nota de débito') + (electronico ? ' electrónica' : '');
  const lineas = n.lineas.map(l => [l.concepto + (l.alumno ? ' · ' + l.alumno : '') + (l.efecto === 'ReabreCargo' ? ' (vuelve a cobrarse)' : l.efecto === 'Devolucion' ? ' (devolución)' : ''), fmt(l.monto)]);
  const tot: [string, string, boolean?][] = [
    ...(cr ? n.reembolsos.map(r => ['Devuelto en ' + r.metodo + (r.referencia ? ' ' + r.referencia : ''), fmt(r.monto)] as [string, string]) : []),
    [cr ? 'TOTAL ACREDITADO' : 'TOTAL A COBRAR', fmt(n.monto), true],
  ];
  const cliente: [string, string][] = [['Cliente', n.cliente.nombre], ...(n.cliente.rnc ? [['RNC/Cédula', fmtDoc(n.cliente.rnc)] as [string, string]] : n.cliente.cedula ? [['Cédula', n.cliente.cedula] as [string, string]] : []), ...(n.alumnos.length ? [['Alumno(s)', n.alumnos.join(', ')] as [string, string]] : [])];
  const bloques = [
    B.kv([[electronico ? 'e-NCF' : 'NCF', n.ncf], ['Nota', n.id], ['Comprobante', `${n.tipoComprobante.nombre} (${n.tipoComprobante.codigo})`], [electronico ? 'e-NCF modificado' : 'NCF modificado', n.documento.ncf], [n.documento.tipo === 'recibo' ? 'Recibo' : 'Venta', n.documento.id],
      ['Fecha', n.fecha + ' ' + n.hora], ['Cajero', n.cajero], ...cliente]),
    B.kv([['Motivo', `${n.motivo.codigo} · ${n.motivo.nombre}`], ...(n.motivoTexto ? [['Detalle', n.motivoTexto] as [string, string]] : [])]),
    B.table(['Concepto', 'Monto'], lineas, ['1fr', 'auto'], ['left', 'right']),
    ...(n.cargos?.length ? [B.text('Cargos creados (se cobran en Cobros)', true), B.table(['Cargo', 'Vence', 'Monto'], n.cargos.map(c => [c.con + ' · ' + c.al, c.vence, fmt(c.monto)]), ['1fr', 'auto', 'auto'], ['left', 'center', 'right'])] : []),
    B.total(tot),
    ...(electronico && n.estadoDgii === 'PendienteEnvio' ? [B.text('e-NCF pendiente de envío a la DGII')] : []),
    ...(n.fueraDePlazo ? [B.text('Emitida fuera del plazo con autorización de supervisor')] : []),
    ...(n.documentoAnulado ? [B.text('El comprobante modificado queda ANULADO')] : []),
    ...(formato === 'tirilla' ? [B.text('Conserve esta nota junto al comprobante original.')] : []),
  ];
  return {
    firmaDe: { Cajero: n.cajero }, kind: formato, name: `${titulo} ${n.id}`, file: `nota_${cr ? 'credito' : 'debito'}_${n.id}.pdf`, format: formato === 'tirilla' ? 'Tirilla 80 mm' : 'Carta', sede,
    sign: formato === 'carta' ? ['Emitido por (cajero)', 'Autorizado por (supervisor)', 'Recibido por (cliente)'] : [],
    pages: [{ title: titulo, sub: `${n.id} · Ciclo ${n.ciclo}${n.fecha ? ' · ' + n.fecha : hoyDMY()}`, blocks: bloques }],
  };
}
