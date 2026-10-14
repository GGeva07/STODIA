import type { Prisma } from '@prisma/client';
import type { InformeCelda, InformeResp } from '@stodia/shared';
import { prisma } from '../../db';
import { round2 } from '../cxc';
import { col, etiquetasFiltros, fechaDMY, hoy as hoyDMY, paginaDb, rangoCreado, type Filtros } from './comun';

/**
 * INFORME 7 · Notas de crédito / débito (inf-facturacion). Ciclo, rango y cajero son los de la NOTA (NotaFiscal.cicloId/createdAt). El resumen por motivo y por
 * tipo cuenta solo notas Emitidas; el listado muestra todas con su estado. «Reabrir cobro» = alguna línea con efecto ReabreCargo.
 */
const EFECTO: Record<string, string> = { ReabreCargo: 'Reabre el cargo', Devolucion: 'Devolución', Ajuste: 'Ajuste', NuevoCargo: 'Nuevo cargo' };

export async function informeNotas(f: Filtros): Promise<InformeResp> {
  const rango = rangoCreado(f);
  const where: Prisma.NotaFiscalWhereInput = {
    cicloId: f.ciclo.id, ...(rango ? { createdAt: rango } : {}),
    ...(f.tipo === 'CREDITO' || f.tipo === 'DEBITO' ? { clase: f.tipo } : {}), ...(f.motivo ? { motivoId: f.motivo } : {}), ...(f.cajero ? { cajeroId: f.cajero } : {}),
  };
  const emitidas = { ...where, estado: 'Emitida' };
  const pg = paginaDb(f, 'notas');
  const [total, rows, porMotivo, porTipo, sumas] = await Promise.all([
    prisma.notaFiscal.count({ where }),
    prisma.notaFiscal.findMany({
      where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...(pg.take ? { skip: pg.skip, take: pg.take } : {}),
      select: {
        id: true, clase: true, ncf: true, ncfModificado: true, reciboId: true, ventaId: true, monto: true, estado: true, hora: true, createdAt: true, motivoTexto: true, clienteNombre: true,
        tipoComprobante: { select: { codigo: true } }, motivo: { select: { nombre: true, codigoDgii: true } }, cajero: { select: { nombre: true } }, tutor: { select: { nombre: true } },
        lineas: { orderBy: { orden: 'asc' }, select: { concepto: true, cantidad: true, monto: true, efecto: true } },
      },
    }),
    prisma.notaFiscal.groupBy({ by: ['motivoId', 'clase'], where: emitidas, _sum: { monto: true }, _count: { _all: true } }),
    prisma.notaFiscal.groupBy({ by: ['clase', 'tipoComprobanteId'], where: emitidas, _sum: { monto: true }, _count: { _all: true } }),
    prisma.notaFiscal.groupBy({ by: ['clase'], where: emitidas, _sum: { monto: true }, _count: { _all: true } }),
  ]);
  const [motivos, tipos] = await Promise.all([
    prisma.motivoNota.findMany({ where: { id: { in: porMotivo.map(x => x.motivoId) } }, select: { id: true, nombre: true, codigoDgii: true } }),
    prisma.tipoComprobante.findMany({ where: { id: { in: porTipo.map(x => x.tipoComprobanteId) } }, select: { id: true, codigo: true, nombre: true } }),
  ]);
  const mm = new Map(motivos.map(m => [m.id, m])), tt = new Map(tipos.map(t => [t.id, t]));
  const S = (c: string) => sumas.find(x => x.clase === c);
  const nCred = S('CREDITO')?._count._all ?? 0, nDeb = S('DEBITO')?._count._all ?? 0, mCred = round2(S('CREDITO')?._sum.monto ?? 0), mDeb = round2(S('DEBITO')?._sum.monto ?? 0);
  const nEmit = nCred + nDeb;

  const filas = rows.map(n => [
    `${fechaDMY(n.createdAt, f.tz)} ${n.hora}`, n.ncf, `${n.clase === 'CREDITO' ? 'Crédito' : 'Débito'} ${n.tipoComprobante.codigo}`, n.reciboId ?? (n.ventaId ? `Venta ${n.ventaId}` : ''), n.ncfModificado,
    n.motivo.nombre + (n.motivoTexto ? ` · ${n.motivoTexto}` : ''), n.lineas.length, round2(n.monto), n.lineas.some(l => l.efecto === 'ReabreCargo') ? 'Sí' : 'No', n.estado, n.cajero?.nombre ?? '—', n.tutor?.nombre ?? n.clienteNombre ?? '',
  ] as InformeCelda[]);
  const subt = (c: string) => round2(porMotivo.filter(x => x.clase === c).reduce((a, x) => a + (x._sum.monto ?? 0), 0));
  void subt;
  return {
    id: 'notas', titulo: 'Notas de crédito y débito', grupo: 'inf-facturacion', ciclo: f.ciclo.nombre, generado: hoyDMY(f.tz),
    filtros: await etiquetasFiltros(f, ['ciclo', 'desde', 'hasta', 'tipo', 'motivo', 'cajero']),
    resumen: [
      { id: 'n', etiqueta: 'Notas emitidas', valor: nEmit, tipo: 'entero' },
      { id: 'cred', etiqueta: `Notas de crédito (${nCred})`, valor: mCred, tipo: 'moneda', tono: 'warn' },
      { id: 'deb', etiqueta: `Notas de débito (${nDeb})`, valor: mDeb, tipo: 'moneda', tono: 'info' },
      { id: 'neto', etiqueta: 'Neto (débito − crédito)', valor: round2(mDeb - mCred), tipo: 'moneda' },
    ],
    tablas: [
      {
        id: 'motivo', titulo: 'Resumen por motivo', columnas: [col('motivo', 'Motivo'), col('clase', 'Tipo'), col('dgii', 'Código DGII'), col('n', 'Notas', 'entero'), col('monto', 'Monto', 'moneda')],
        filas: [...porMotivo].sort((a, b) => (b._sum.monto ?? 0) - (a._sum.monto ?? 0)).map(x => [mm.get(x.motivoId)?.nombre ?? x.motivoId, x.clase === 'CREDITO' ? 'Crédito' : 'Débito', mm.get(x.motivoId)?.codigoDgii ?? '', x._count._all, round2(x._sum.monto ?? 0)] as InformeCelda[]),
        totales: ['TOTAL', '', '', nEmit, round2(mCred + mDeb)], total: porMotivo.length, page: 1, size: porMotivo.length, vacio: 'No hay notas con estos filtros.',
      },
      {
        id: 'tipo', titulo: 'Resumen por tipo de comprobante', columnas: [col('tipo', 'Tipo'), col('codigo', 'Comprobante'), col('n', 'Notas', 'entero'), col('monto', 'Monto', 'moneda')],
        filas: [...porTipo].sort((a, b) => b._count._all - a._count._all).map(x => [x.clase === 'CREDITO' ? 'Nota de crédito' : 'Nota de débito', `${tt.get(x.tipoComprobanteId)?.codigo ?? ''} · ${tt.get(x.tipoComprobanteId)?.nombre ?? ''}`, x._count._all, round2(x._sum.monto ?? 0)] as InformeCelda[]),
        totales: ['TOTAL', '', nEmit, round2(mCred + mDeb)], total: porTipo.length, page: 1, size: porTipo.length, vacio: 'No hay notas con estos filtros.',
      },
      {
        id: 'notas', titulo: 'Detalle de notas', paginable: true,
        columnas: [col('fecha', 'Fecha'), col('ncf', 'NCF'), col('tipo', 'Tipo'), col('origen', 'Recibo / documento'), col('ncfmod', 'NCF modificado'), col('motivo', 'Motivo'), col('lineas', 'Líneas', 'entero'), col('monto', 'Monto', 'moneda'), col('reabre', 'Reabre cobro'), col('estado', 'Estado'), col('cajero', 'Cajero'), col('cliente', 'Tutor / cliente')],
        filas, total, page: pg.page, size: f.size === 0 ? filas.length : f.size, vacio: 'No hay notas fiscales con estos filtros.',
        detalle: { titulo: 'Líneas de la nota', columnas: [col('concepto', 'Concepto'), col('cant', 'Cantidad', 'entero'), col('efecto', 'Efecto'), col('monto', 'Monto', 'moneda')], porFila: rows.map(n => n.lineas.map(l => [l.concepto, l.cantidad || null, EFECTO[l.efecto] ?? l.efecto, round2(l.monto)] as InformeCelda[])) },
      },
    ],
    notas: [
      'El ciclo, el rango de fechas y el cajero corresponden a la NOTA (cuándo se emitió), no al recibo de origen. Los resúmenes por motivo y tipo cuentan solo notas en estado Emitida; el detalle muestra todas con su estado.',
      '«Reabre cobro» = la nota devolvió el cargo a cuentas por cobrar (efecto «Reabre el cargo» en alguna línea). Las notas de crédito restan al cobrado: ver «Cobrado neto tras devoluciones».',
    ],
  };
}
