/**
 * DETALLE DEL CIERRE (Informes › Cierre de año, etapa 2): foto LINEA POR LINEA del ciclo al cerrarlo → tabla CierreCicloDetalle (schema.prisma).
 * Se construye con las MISMAS definiciones de lib/ciclo-cierre.resumenFinancieroCiclo para que las filas cuadren con los totales de CierreCiclo:
 *   Σ monto(cargo)      = facturado   (cada cargo = Σ lineas de recibos vigentes que lo cobraron + su monto si sigue sin pagar)
 *   Σ pendiente(cargo)  = pendiente   (cargos paid = false; el abono parcial ya viene descontado en FinCobroItem.monto)
 *   Σ descuento(cargo)  = descuentos  = Σ monto(descuento)
 *   Σ monto(recibo Emitido) = cobrado ; nº recibos Emitido/Anulado = recibos / recibosAnulados ; nº cargos = cargos
 *   notas: nota.cicloId = ciclo (notasCredito/notasDebito: Emitidas) + notas de credito sobre recibos del ciclo (cobradoNeto); `extra.enCiclo` / `extra.sobreReciboVigente`
 *   ventas: FinVenta no tiene ciclo → se guardan las del RANGO DE FECHAS del ciclo (como el informe de Recaudacion); NO suman a ningun total de CierreCiclo.
 * `construirDetalle` es de solo lectura; `guardarDetalle` inserta por lotes dentro de la transaccion del cierre. Sin backfill: un cierre anterior no tiene filas.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { estadoCuota, inicioDia, round2, venceISO } from './cxc';

type Db = typeof prisma | Prisma.TransactionClient;
type Fila = Prisma.CierreCicloDetalleCreateManyInput;

import { categoriaCargo, type CategoriaCargo } from './categorias';
export { categoriaCargo, type CategoriaCargo };

const cortar = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Minutos de desfase de la zona horaria respecto a UTC (para los GROUP BY por mes en SQL). */
export function offsetMinutos(tz: string, d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(d).map(x => [x.type, Number(x.value)]));
  return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - d.getTime()) / 60000);
}

export interface DetalleCierre { filas: Fila[]; avisos: string[] }

/**
 * Construye TODAS las filas del detalle (sin `cierreId`, que se fija al guardar). `hoy` = dia del cierre (AAAA-MM-DD en la zona del perfil) para el estado Vencido;
 * `tz` para el mes de la fecha de los recibos. Lee con `db` (dentro de la transaccion del cierre se ve el mismo estado que el resumen).
 */
export async function construirDetalle(
  ciclo: { id: string; fechaInicio: string; fechaFin: string }, db: Db, hoy: string, tz: string,
): Promise<{ filas: Omit<Fila, 'cierreId'>[] }> {
  const cicloId = ciclo.id;
  const [cargos, lineas, recibos, notas, metodos, ventas] = await Promise.all([
    db.finCobroItem.findMany({ where: { cicloId }, select: { id: true, alumnoId: true, tutorId: true, con: true, vence: true, monto: true, tipo: true, paid: true, est: true, abono: true, categoria: true } }),
    db.finReciboItem.findMany({
      where: { recibo: { est: { not: 'Anulado' } }, cobroItem: { is: { cicloId } } },
      select: { id: true, reciboId: true, monto: true, descuento: true, descuentoMotivo: true, concepto: true, cobroItemId: true },
    }),
    db.finRecibo.findMany({
      where: { cicloId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true, ncf: true, tutor: true, hora: true, monto: true, est: true, abono: true, change: true, createdAt: true, cajero: { select: { nombre: true } },
        pagos: { orderBy: { orden: 'asc' }, select: { metodoPagoId: true, monto: true, referencia: true } },
        lineas: { select: { concepto: true, descuento: true, cobroItem: { select: { alumnoId: true, tipo: true, con: true } } } },
      },
    }),
    db.notaFiscal.findMany({
      where: { OR: [{ cicloId }, { recibo: { is: { cicloId } } }] }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true, clase: true, ncf: true, ncfModificado: true, monto: true, estado: true, createdAt: true, motivoTexto: true, motivo: { select: { nombre: true } }, cicloId: true,
        reciboId: true, ventaId: true, clienteNombre: true, fueraDePlazo: true, cajero: { select: { nombre: true } },
        recibo: { select: { cicloId: true, est: true, ncf: true } }, tutor: { select: { nombre: true } },
        reembolsos: { orderBy: { orden: 'asc' }, select: { metodoPagoId: true, monto: true } },
        lineas: { select: { efecto: true, concepto: true, monto: true, cobroItem: { select: { alumnoId: true } } } },
      },
    }),
    db.metodoPago.findMany({ select: { id: true, nombre: true } }),
    db.finVenta.findMany({
      where: { createdAt: { gte: inicioDia(ciclo.fechaInicio, tz), lt: inicioDia(new Date(Date.UTC(+ciclo.fechaFin.slice(0, 4), +ciclo.fechaFin.slice(5, 7) - 1, +ciclo.fechaFin.slice(8, 10) + 1)).toISOString().slice(0, 10), tz) } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, ncf: true, total: true, metodo: true, doc: true, createdAt: true, cajero: { select: { nombre: true } }, lineas: { select: { nombre: true, cantidad: true } } },
    }),
  ]);
  const nomMetodo = new Map(metodos.map(m => [m.id, m.nombre]));
  const metodoDe = (id: string) => nomMetodo.get(id) ?? id;

  // Alumnos y tutores (instantaneas)
  const alIds = new Set<string>(cargos.map(c => c.alumnoId));
  for (const r of recibos) for (const l of r.lineas) if (l.cobroItem) alIds.add(l.cobroItem.alumnoId);
  for (const n of notas) for (const l of n.lineas) if (l.cobroItem) alIds.add(l.cobroItem.alumnoId);
  const als = new Map<string, { code: string; nombre: string }>();
  const lista = [...alIds];
  for (let i = 0; i < lista.length; i += 800) {
    for (const a of await db.alumno.findMany({ where: { id: { in: lista.slice(i, i + 800) } }, select: { id: true, code: true, nombres: true, apellidos: true } })) als.set(a.id, { code: a.code, nombre: `${a.nombres} ${a.apellidos}`.trim() });
  }
  const tutIds = [...new Set(cargos.map(c => c.tutorId).filter((x): x is string => !!x))];
  const tuts = new Map<string, string>();
  for (let i = 0; i < tutIds.length; i += 800) for (const t of await db.tutor.findMany({ where: { id: { in: tutIds.slice(i, i + 800) } }, select: { id: true, nombre: true } })) tuts.set(t.id, t.nombre);
  // Tutor financiero actual de los alumnos sin tutor en el cargo (el del alumno)
  const sinTutor = [...new Set(cargos.filter(c => !c.tutorId).map(c => c.alumnoId))];
  const tutAl = new Map<string, string>();
  for (let i = 0; i < sinTutor.length; i += 800) {
    for (const v of await db.tutorAlumno.findMany({ where: { alumnoId: { in: sinTutor.slice(i, i + 800) }, rol: 'Financiero', hasta: null }, select: { alumnoId: true, tutor: { select: { nombre: true } } } })) tutAl.set(v.alumnoId, v.tutor.nombre);
  }

  // Lineas de recibos vigentes por cargo
  const porCargo = new Map<string, typeof lineas>();
  for (const l of lineas) if (l.cobroItemId) porCargo.set(l.cobroItemId, [...(porCargo.get(l.cobroItemId) ?? []), l]);
  const recInfo = new Map(recibos.map(r => [r.id, r]));

  const out: Omit<Fila, 'cierreId'>[] = [];

  // ---- CARGOS ----
  const cargoPorId = new Map(cargos.map(c => [c.id, c]));
  for (const c of cargos) {
    const ls = porCargo.get(c.id) ?? [];
    const cobradoBruto = ls.reduce((a, l) => a + l.monto, 0), desc = ls.reduce((a, l) => a + (l.descuento ?? 0), 0);
    const pend = c.paid ? 0 : c.monto;
    const iso = venceISO(c.vence);
    const est = c.paid ? 'Pagado' : estadoCuota({ vence: c.vence, est: c.est }, hoy) === 'Vencida' ? 'Vencido' : 'Pendiente';
    const a = als.get(c.alumnoId);
    const cat = c.categoria ?? categoriaCargo(c.tipo, c.con);
    out.push({
      tipo: 'cargo', refId: c.id, fecha: iso ? dia(iso) : null, alumnoId: c.alumnoId, alumnoCodigo: a?.code ?? '', alumnoNombre: cortar(a?.nombre ?? '', 300),
      tutorNombre: cortar((c.tutorId ? tuts.get(c.tutorId) : tutAl.get(c.alumnoId)) ?? '', 300), concepto: cortar(c.con, 500), categoria: cat,
      metodo: null, ncf: ls.length ? (recInfo.get(ls[0].reciboId)?.ncf ?? null) : null, cajero: null,
      monto: round2(cobradoBruto + pend), descuento: round2(desc), pendiente: round2(pend), estado: est,
      extra: JSON.stringify({
        tipo: c.tipo, vence: c.vence, ym: iso ? iso.slice(0, 7) : null, mes: iso ? `${MESES[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}` : null,
        diasVencido: iso && est === 'Vencido' ? Math.round((Date.parse(hoy) - Date.parse(iso)) / 86_400_000) : 0,
        cobradoBruto: round2(cobradoBruto), montoCargo: c.monto, abono: c.abono || undefined, recibos: [...new Set(ls.map(l => l.reciboId))],
      }),
    });
  }

  // ---- RECIBOS ----
  for (const r of recibos) {
    const alu = new Set(r.lineas.map(l => l.cobroItem?.alumnoId).filter((x): x is string => !!x));
    const unico = alu.size === 1 ? [...alu][0] : null;
    const nombres = [...alu].map(id => als.get(id)?.nombre ?? id);
    const cats = new Set(r.lineas.map(l => (l.cobroItem ? categoriaCargo(l.cobroItem.tipo, l.cobroItem.con) : 'otro')));
    const pagos = r.pagos.map(p => ({ metodo: metodoDe(p.metodoPagoId), monto: round2(p.monto), referencia: p.referencia || undefined }));
    const principal = [...pagos].sort((x, y) => y.monto - x.monto)[0];
    const mixto = pagos.length > 1;
    out.push({
      tipo: 'recibo', refId: r.id, fecha: r.createdAt, alumnoId: unico, alumnoCodigo: unico ? (als.get(unico)?.code ?? '') : [...alu].map(id => als.get(id)?.code ?? '').join(', ').slice(0, 100),
      alumnoNombre: cortar(nombres.join(', '), 300), tutorNombre: cortar(r.tutor, 300),
      concepto: cortar([...new Set(r.lineas.map(l => l.concepto))].join(' · ') || '—', 500), categoria: cats.size === 1 ? [...cats][0] : cats.size ? 'varios' : 'otro',
      metodo: principal?.metodo ?? null, ncf: r.ncf, cajero: r.cajero?.nombre ?? null,
      monto: round2(r.monto), descuento: round2(r.lineas.reduce((a, l) => a + (l.descuento ?? 0), 0)), pendiente: 0, estado: r.est === 'Anulado' ? 'Anulado' : 'Emitido',
      extra: JSON.stringify({ hora: r.hora, abono: r.abono || undefined, cambio: r.change || undefined, mixto: mixto || undefined, pagos: mixto ? pagos : undefined, lineas: r.lineas.length }),
    });
  }

  // ---- NOTAS ----
  for (const n of notas) {
    const alu = [...new Set(n.lineas.map(l => l.cobroItem?.alumnoId).filter((x): x is string => !!x))];
    const unico = alu.length === 1 ? alu[0] : null;
    const reemb = n.reembolsos.map(x => ({ metodo: metodoDe(x.metodoPagoId), monto: round2(x.monto) }));
    out.push({
      tipo: 'nota', refId: n.id, fecha: n.createdAt, alumnoId: unico, alumnoCodigo: unico ? (als.get(unico)?.code ?? '') : alu.map(id => als.get(id)?.code ?? '').join(', ').slice(0, 100),
      alumnoNombre: cortar(alu.map(id => als.get(id)?.nombre ?? id).join(', '), 300), tutorNombre: cortar(n.tutor?.nombre ?? n.clienteNombre ?? '', 300),
      concepto: cortar(n.motivo.nombre + (n.motivoTexto ? ` — ${n.motivoTexto}` : ''), 500), categoria: n.clase === 'CREDITO' ? 'credito' : 'debito',
      metodo: reemb.length ? [...reemb].sort((x, y) => y.monto - x.monto)[0].metodo : null, ncf: n.ncf, cajero: n.cajero?.nombre ?? null,
      monto: round2(n.monto), descuento: 0, pendiente: 0, estado: n.estado === 'Emitida' ? 'Emitido' : 'Anulado',
      extra: JSON.stringify({
        clase: n.clase, motivo: n.motivo.nombre, motivoTexto: n.motivoTexto || undefined, ncfModificado: n.ncfModificado, reciboId: n.reciboId ?? undefined, ventaId: n.ventaId ?? undefined,
        reabre: n.lineas.some(l => l.efecto === 'ReabreCargo'), fueraDePlazo: n.fueraDePlazo || undefined, reembolsos: reemb,
        enCiclo: n.cicloId === cicloId, sobreReciboVigente: !!n.recibo && n.recibo.cicloId === cicloId && n.recibo.est !== 'Anulado' && n.clase === 'CREDITO',
      }),
    });
  }

  // ---- DESCUENTOS (lineas con descuento > 0 de recibos vigentes que cobraron cargos del ciclo: las mismas de Σ descuentos) ----
  for (const l of lineas) {
    if (!(l.descuento > 0)) continue;
    const c = l.cobroItemId ? cargoPorId.get(l.cobroItemId) : undefined;
    const r = recInfo.get(l.reciboId);
    const a = c ? als.get(c.alumnoId) : undefined;
    const pct = l.monto > 0 ? round2((l.descuento / l.monto) * 100) : 0;
    const iso = c ? venceISO(c.vence) : null;
    out.push({
      tipo: 'descuento', refId: String(l.id), fecha: r?.createdAt ?? null, alumnoId: c?.alumnoId ?? null, alumnoCodigo: a?.code ?? '', alumnoNombre: cortar(a?.nombre ?? '', 300),
      tutorNombre: cortar(r?.tutor ?? '', 300), concepto: cortar(l.descuentoMotivo?.trim() || 'Sin motivo', 500), categoria: c ? categoriaCargo(c.tipo, c.con) : 'otro',
      metodo: null, ncf: r?.ncf ?? null, cajero: r?.cajero?.nombre ?? null, monto: round2(l.descuento), descuento: 0, pendiente: 0, estado: 'Emitido',
      extra: JSON.stringify({ pct, montoLinea: round2(l.monto), lineaConcepto: l.concepto, reciboId: l.reciboId, cargoId: l.cobroItemId ?? undefined, ym: iso ? iso.slice(0, 7) : undefined }),
    });
  }

  // ---- VENTAS RAPIDAS (rango de fechas del ciclo) ----
  for (const v of ventas) {
    out.push({
      tipo: 'venta', refId: v.id, fecha: v.createdAt, alumnoId: null, alumnoCodigo: '', alumnoNombre: '', tutorNombre: '',
      concepto: cortar(v.lineas.map(x => `${x.cantidad}× ${x.nombre}`).join(', ') || v.doc, 500), categoria: 'articulo', metodo: v.metodo, ncf: v.ncf || null, cajero: v.cajero?.nombre ?? null,
      monto: round2(v.total), descuento: 0, pendiente: 0, estado: 'Emitido', extra: JSON.stringify({ doc: v.doc, articulos: v.lineas.reduce((a, x) => a + x.cantidad, 0) }),
    });
  }
  return { filas: out };
}

/**
 * Inserta las filas bajo `cierreId`. SQL Server: lotes de 1000 filas en UN INSERT ... SELECT FROM OPENJSON (≈ 30× mas rapido que createMany, que Prisma emite fila a fila:
 * 16 000 filas = 120 s vs 3 s). Otros motores (SQLite de respaldo): createMany por lotes de 1000. Devuelve el numero de filas guardadas.
 */
export async function guardarDetalle(db: Db, cierreId: number, filas: Omit<Fila, 'cierreId'>[]): Promise<number> {
  const sqlserver = (process.env.DATABASE_URL ?? '').startsWith('sqlserver:');
  for (let i = 0; i < filas.length; i += 1000) {
    const lote = filas.slice(i, i + 1000);
    if (!sqlserver) { await db.cierreCicloDetalle.createMany({ data: lote.map(f => ({ ...f, cierreId })) }); continue; }
    const json = JSON.stringify(lote.map(f => ({ ...f, fecha: f.fecha instanceof Date ? f.fecha.toISOString() : f.fecha ?? undefined })));
    await db.$executeRaw`INSERT INTO dbo.CierreCicloDetalle (cierreId, tipo, refId, fecha, alumnoId, alumnoCodigo, alumnoNombre, tutorNombre, concepto, categoria, metodo, ncf, cajero, monto, descuento, pendiente, estado, extra)
      SELECT ${cierreId}, tipo, refId, fecha, alumnoId, ISNULL(alumnoCodigo, ''), ISNULL(alumnoNombre, ''), ISNULL(tutorNombre, ''), ISNULL(concepto, ''), ISNULL(categoria, ''), metodo, ncf, cajero, monto, ISNULL(descuento, 0), ISNULL(pendiente, 0), estado, extra
      FROM OPENJSON(${json}) WITH (tipo NVARCHAR(20) '$.tipo', refId NVARCHAR(100) '$.refId', fecha DATETIME2(3) '$.fecha', alumnoId NVARCHAR(100) '$.alumnoId', alumnoCodigo NVARCHAR(100) '$.alumnoCodigo',
        alumnoNombre NVARCHAR(300) '$.alumnoNombre', tutorNombre NVARCHAR(300) '$.tutorNombre', concepto NVARCHAR(500) '$.concepto', categoria NVARCHAR(40) '$.categoria', metodo NVARCHAR(100) '$.metodo',
        ncf NVARCHAR(100) '$.ncf', cajero NVARCHAR(200) '$.cajero', monto FLOAT '$.monto', descuento FLOAT '$.descuento', pendiente FLOAT '$.pendiente', estado NVARCHAR(20) '$.estado', extra NVARCHAR(MAX) '$.extra')`;
  }
  return filas.length;
}

/** Totales de las filas para cuadrar con CierreCiclo (cualquier divergencia se reporta, nunca aborta el cierre). */
export function cuadreDetalle(filas: { tipo: string; monto: number; descuento: number; pendiente: number; estado: string }[]) {
  const s = { facturado: 0, pendiente: 0, descuentos: 0, descuentosLineas: 0, cobrado: 0, cargos: 0, recibos: 0, recibosAnulados: 0 };
  for (const f of filas) {
    if (f.tipo === 'cargo') { s.facturado += f.monto; s.pendiente += f.pendiente; s.descuentos += f.descuento; s.cargos++; }
    else if (f.tipo === 'descuento') s.descuentosLineas += f.monto;
    else if (f.tipo === 'recibo') { if (f.estado === 'Anulado') s.recibosAnulados++; else { s.cobrado += f.monto; s.recibos++; } }
  }
  return { ...s, facturado: round2(s.facturado), pendiente: round2(s.pendiente), descuentos: round2(s.descuentos), descuentosLineas: round2(s.descuentosLineas), cobrado: round2(s.cobrado) };
}
