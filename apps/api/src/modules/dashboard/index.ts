import type { FastifyPluginAsync } from 'fastify';
import type { DashboardData } from '@stodia/shared';
import { prisma } from '../../db';
import { cfgGet } from '../../lib/sisconfig';
import { cxcResumen, hoyISO, partesEnZona, round2, zonaHoraria } from '../../lib/cxc';
import { esEfectivo, paysDe } from '../../lib/recibos';
import { alumnosPorPlan } from '../../lib/planes';
import { cicloIdActivo, cicloReq, esCicloActivo, listarCiclos, type CicloRow } from '../../lib/ciclo';
import { planesPago } from '../../lib/pers-fin';
import { refrescarEstados, resumenNcf } from '../../lib/fiscal';
import { reembolsosEnRango } from '../../lib/notas';

/**
 * Centro de Control: todo se calcula desde la BD; una instalación sin datos devuelve ceros.
 *  - Recaudo del mes: FinRecibo activos + FinVenta (kiosko/POS rápido) creados dentro del mes calendario de la zona horaria
 *    de la institución, separados en Efectivo / resto (banco, tarjeta, transferencia, cheque). Barras: mismo cálculo, 6 meses.
 *  - Morosidad: CxC vencida (cargos impagos con vencimiento anterior a hoy) según lib/cxc.ts. Alumnos en mora: alumnos activos con CxC vencida.
 *  - Proyección del ciclo: por cada alumno activo, importe anual neto del plan vigente (promedio ponderado por alumnos inscritos en
 *    cada plan activo = COUNT(Contrato) de alumnos activos; si el plan es por tanda, el de la tanda del alumno). Sin planes activos: suma de los cargos de la cartera.
 *  - Matrícula: alumnos activos. Inscripciones del mes: PersInscripcion creadas en el mes. Becas: FinBeca en estado Pendiente.
 *  - Stock bajo: FinProducto con stock <= 5. Alertas de comprobantes: SecuenciaFiscal (fisicas y electronicas) vs. umbral y vencimiento (lib/fiscal.resumenNcf).
 */
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** Contador de FinCounter que lleva el último comprobante emitido por prefijo. */

/** Desfase (ms) de la zona `tz` respecto a UTC en un instante. */
function tzOffsetMs(tz: string, instant: number): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(instant)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(instant / 1000) * 1000;
}
/** Instante UTC en que empieza el mes calendario `m` (1-12) del año `y` en la zona `tz`. */
function inicioMes(tz: string, y: number, m: number): Date {
  const guess = Date.UTC(y, m - 1, 1);
  return new Date(guess - tzOffsetMs(tz, guess - tzOffsetMs(tz, guess)));
}

/**
 * Centro de Control de un ciclo que NO es el activo (Fase 2D, solo lectura). Todo sale del ciclo elegido:
 *  - Matricula = Matricula del ciclo (sin Retirados). Recaudo del mes y barras = FinRecibo ACTIVOS del ciclo, por fecha, hasta el ULTIMO MES del ciclo (los
 *    6 meses que terminan en el). Inscripciones del mes = PersInscripcion del ciclo creadas en ese mes. Becas = FinBeca Pendiente del ciclo.
 *  - Ciclo CERRADO: morosidad = saldo pendiente HISTORICO del ciclo (cargos sin pagar), alumnos en mora = alumnos con ese saldo, proyeccion = lo CONTRATADO
 *    (suma de los cargos del ciclo); asistencia = acumulado de AsistenciaResumen; sin alertas operativas (NCF, stock, e-CF).
 */
async function dashboardCiclo(ciclo: CicloRow, tz: string): Promise<DashboardData> {
  const cerrado = ciclo.estado === 'Cerrado';
  const ref = Number((cerrado ? ciclo.fechaFin : ciclo.fechaInicio).slice(0, 4)) * 12 + Number((cerrado ? ciclo.fechaFin : ciclo.fechaInicio).slice(5, 7)) - 1;
  const meses = Array.from({ length: 6 }, (_, i) => { const t = ref - (5 - i); return { y: Math.floor(t / 12), m: (t % 12) + 1 }; });
  const desde = inicioMes(tz, meses[0].y, meses[0].m), mesIni = inicioMes(tz, meses[5].y, meses[5].m);
  const mesFin = inicioMes(tz, meses[5].m === 12 ? meses[5].y + 1 : meses[5].y, meses[5].m === 12 ? 1 : meses[5].m + 1);
  const keyOf = (d: Date) => { const p = partesEnZona(tz, d); return p.y * 12 + p.m - 1; };
  const cicloId = ciclo.id;
  const [matricula, recibos, becasPendientes, inscripcionesMes, cargos, resumen, ciclos, devoluciones] = await Promise.all([
    prisma.matricula.count({ where: { cicloId, estado: { not: 'Retirado' } } }),
    prisma.finRecibo.findMany({ where: { cicloId, createdAt: { gte: desde, lt: mesFin } }, select: { monto: true, createdAt: true, pagos: { select: { monto: true, referencia: true, metodoPago: { select: { nombre: true } } } } } }),
    prisma.finBeca.count({ where: { estado: 'Pendiente', cicloId } }),
    prisma.persInscripcion.count({ where: { cicloId, createdAt: { gte: mesIni, lt: mesFin } } }),
    prisma.finCobroItem.findMany({ where: { cicloId }, select: { alumnoId: true, monto: true, paid: true } }),
    prisma.asistenciaResumen.aggregate({ where: { matricula: { cicloId } }, _sum: { presentes: true, tardanzas: true, ausenciasJustificadas: true, ausenciasInjustificadas: true } }),
    listarCiclos(),
    reembolsosEnRango(desde, mesFin, { cicloId }),
  ]);
  // Recaudo NETO: cada recibo cuenta en SU fecha y cada nota de credito resta en la fecha de LA NOTA, por medio de pago del reembolso.
  const mov = [...recibos.map(r => ({ v: r.monto, efe: esEfectivo(paysDe(r)), k: keyOf(r.createdAt) })), ...devoluciones.map(d => ({ v: -d.monto, efe: d.efectivo, k: keyOf(d.createdAt) }))];
  const kCur = ref;
  const recaudoEfectivo = round2(mov.filter(x => x.k === kCur && x.efe).reduce((a, x) => a + x.v, 0));
  const recaudoBanco = round2(mov.filter(x => x.k === kCur && !x.efe).reduce((a, x) => a + x.v, 0));
  const barras = meses.map(({ y, m }) => ({ m: MESES[m - 1], v: round2(mov.filter(x => x.k === y * 12 + m - 1).reduce((a, x) => a + x.v, 0) / 1e6) }));
  const pend = cargos.filter(c => !c.paid);
  const hoy = partesEnZona(tz);
  const s = resumen._sum;
  return {
    fecha: `${DIAS[new Date(Date.UTC(hoy.y, hoy.m - 1, hoy.d)).getUTCDay()]}, ${hoy.d} de ${MESES_L[hoy.m - 1]} de ${hoy.y}`,
    ciclo: ciclo.nombre, historico: cerrado, cicloEstado: ciclo.estado, mesRef: `${MESES_L[meses[5].m - 1]} ${meses[5].y}`,
    recaudoEfectivo, recaudoBanco, morosidad: round2(pend.reduce((a, c) => a + c.monto, 0)), proyeccionCiclo: round2(cargos.reduce((a, c) => a + c.monto, 0)),
    matricula, inscripcionesMes,
    asistenciaIncidencias: (s.tardanzas ?? 0) + (s.ausenciasJustificadas ?? 0) + (s.ausenciasInjustificadas ?? 0), asistenciaPresentes: s.presentes ?? 0, asistenciaSinMarcar: 0, asistenciaSeccion: '',
    becasPendientes, alumnosEnMora: new Set(pend.map(c => c.alumnoId)).size, stockBajo: 0, ecfCargado: true, ncf: [], barras,
  };
}

const plugin: FastifyPluginAsync = async app => {
  app.get('/', { onRequest: [app.authenticate, app.requireRole('Super Admin', 'Director Académico', 'Cajero')] }, async (req): Promise<DashboardData> => {
    const tz = await zonaHoraria(), ahora = new Date(), hoy = hoyISO(tz, ahora), cur = partesEnZona(tz, ahora);
    const cicloReqRow = await cicloReq(req); // Fase 2D: ciclo elegido (X-Ciclo); por defecto el activo
    if (!esCicloActivo(cicloReqRow)) return dashboardCiclo(cicloReqRow, tz);
    const mesIni = inicioMes(tz, cur.y, cur.m);
    const mesFin = inicioMes(tz, cur.m === 12 ? cur.y + 1 : cur.y, cur.m === 12 ? 1 : cur.m + 1);
    const meses = Array.from({ length: 6 }, (_, i) => { const t = cur.y * 12 + (cur.m - 1) - (5 - i); return { y: Math.floor(t / 12), m: (t % 12) + 1 }; });
    const desde = inicioMes(tz, meses[0].y, meses[0].m);
    const keyOf = (d: Date) => { const p = partesEnZona(tz, d); return p.y * 12 + p.m - 1; };

    const cicloId = await cicloIdActivo(); // las cifras del Centro de Control son las del ciclo ACTIVO (el recaudo por mes es por fecha)
    const [alumnos, rosterSecs, marcas, recibos, ventas, cxc, becasPendientes, productos, inscripcionesMes, planesAll, pesos, cobroTotal, ecf, ciclos, devoluciones] = await Promise.all([
      prisma.alumno.findMany({ where: { estado: 'Activo' }, select: { id: true, seccion: { select: { tanda: { select: { nombre: true } } } } } }).then(l => l.map(a => ({ id: a.id, tanda: a.seccion.tanda.nombre }))),
      prisma.acadRoster.groupBy({ by: ['seccionId'], _count: { _all: true } }),
      prisma.acadAsistencia.findMany({ where: { fecha: hoy }, select: { estado: true } }),
      prisma.finRecibo.findMany({ where: { createdAt: { gte: desde, lt: mesFin } }, select: { monto: true, createdAt: true, pagos: { select: { monto: true, referencia: true, metodoPago: { select: { nombre: true } } } } } }),
      prisma.finVenta.findMany({ where: { createdAt: { gte: desde, lt: mesFin } }, select: { total: true, metodo: true, createdAt: true } }),
      cxcResumen(undefined, tz),
      prisma.finBeca.count({ where: { estado: 'Pendiente', cicloId } }),
      prisma.finProducto.findMany({ select: { stock: true } }),
      prisma.persInscripcion.count({ where: { cicloId, createdAt: { gte: mesIni, lt: mesFin } } }),
      planesPago(),
      alumnosPorPlan(true),
      prisma.finCobroItem.aggregate({ where: { cicloId }, _sum: { monto: true } }),
      cfgGet('ecf'), listarCiclos(), reembolsosEnRango(desde, mesFin),
    ]);

    // --- Recaudo del mes y de los últimos 6 meses ---
    // Recaudo NETO: recibos y ventas en SU fecha; cada nota de credito resta en la fecha de LA NOTA, por medio de pago del reembolso (recibos anulados incluidos: su nota los compensa).
    const mov = [...recibos.map(r => ({ v: r.monto, efe: esEfectivo(paysDe(r)), k: keyOf(r.createdAt) })), ...ventas.map(v => ({ v: v.total, efe: v.metodo === 'Efectivo', k: keyOf(v.createdAt) })), ...devoluciones.map(d => ({ v: -d.monto, efe: d.efectivo, k: keyOf(d.createdAt) }))];
    const kCur = cur.y * 12 + cur.m - 1;
    const recaudoEfectivo = round2(mov.filter(x => x.k === kCur && x.efe).reduce((a, x) => a + x.v, 0));
    const recaudoBanco = round2(mov.filter(x => x.k === kCur && !x.efe).reduce((a, x) => a + x.v, 0));
    const barras = meses.map(({ y, m }) => ({ m: MESES[m - 1], v: round2(mov.filter(x => x.k === y * 12 + m - 1).reduce((a, x) => a + x.v, 0) / 1e6) }));

    // --- Alumnos en mora (consistente con la morosidad: misma CxC vencida) ---
    const alumnosEnMora = alumnos.filter(a => (cxc.vencidoPorAlumno.get(a.id) ?? 0) > 0).length;

    // --- Proyección del ciclo: matrícula activa x plan (ponderado) ---
    const anual = (d: { porTanda: boolean; tm: Record<string, number>; anual: number; desc: number }, tanda: string) => {
      const bruto = Number(d.porTanda && d.tm[tanda] !== undefined ? d.tm[tanda] : d.anual) || 0;
      return bruto * (1 - (Number(d.desc) || 0) / 100);
    };
    const pl = planesAll.filter(p => p.estado === 'Activo').map(p => ({ w: pesos.get(p.id) ?? 0, d: p }));
    const wTot = pl.reduce((a, p) => a + p.w, 0);
    const proyeccionCiclo = pl.length
      ? round2(alumnos.reduce((sum, a) => sum + (wTot > 0 ? pl.reduce((s, p) => s + anual(p.d, a.tanda) * p.w, 0) / wTot : pl.reduce((s, p) => s + anual(p.d, a.tanda), 0) / pl.length), 0))
      : round2(cobroTotal._sum.monto ?? 0);

    const rosterN = rosterSecs.reduce((a, s) => a + s._count._all, 0);

    // --- Comprobantes fiscales (SecuenciaFiscal: fisicas y electronicas) ---
    await refrescarEstados(prisma, hoy);
    const { ncf: ncfOut, sinSecuencia } = await resumenNcf(hoy);

    return {
      fecha: `${DIAS[new Date(Date.UTC(cur.y, cur.m - 1, cur.d)).getUTCDay()]}, ${cur.d} de ${MESES_L[cur.m - 1]} de ${cur.y}`,
      ciclo: ciclos.find(c => c.estado === 'Activo')?.n ?? '',
      recaudoEfectivo, recaudoBanco, morosidad: cxc.vencido, proyeccionCiclo,
      matricula: alumnos.length, inscripcionesMes,
      asistenciaIncidencias: marcas.filter(m => m.estado !== 'P').length, asistenciaPresentes: marcas.filter(m => m.estado === 'P').length,
      asistenciaSinMarcar: Math.max(0, rosterN - marcas.length), asistenciaSeccion: rosterSecs.length === 1 ? rosterSecs[0].seccionId : '',
      becasPendientes, alumnosEnMora, stockBajo: productos.filter(p => p.stock != null && p.stock <= 5).length, ecfCargado: ecf,
      ncf: ncfOut, ...(sinSecuencia.length ? { ncfSinSecuencia: sinSecuencia } : {}), barras,
    };
  });
};
export default plugin;
