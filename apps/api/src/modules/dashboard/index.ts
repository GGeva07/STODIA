import type { FastifyPluginAsync } from 'fastify';
import type { DashboardData } from '@stodia/shared';
import { prisma } from '../../db';
import { cfgGet } from '../../lib/sisconfig';
import { cxcResumen, hoyISO, partesEnZona, round2, zonaHoraria } from '../../lib/cxc';
import { kidOf } from '../../lib/personas';

/**
 * Centro de Control: todo se calcula desde la BD; una instalación sin datos devuelve ceros.
 *  - Recaudo del mes: FinRecibo activos + FinVenta (kiosko/POS rápido) creados dentro del mes calendario de la zona horaria
 *    de la institución, separados en Efectivo / resto (banco, tarjeta, transferencia, cheque). Barras: mismo cálculo, 6 meses.
 *  - Morosidad: CxC vencida (cargos impagos con vencimiento anterior a hoy) según lib/cxc.ts. Alumnos en mora: alumnos activos con CxC vencida.
 *  - Proyección del ciclo: por cada alumno activo, importe anual neto del plan vigente (promedio ponderado por alumnos inscritos en
 *    cada plan activo; si el plan es por tanda, el de la tanda del alumno). Sin planes activos: suma de los cargos de la cartera.
 *  - Matrícula: alumnos activos. Inscripciones del mes: PersInscripcion creadas en el mes. Becas: FinBeca en estado Pendiente.
 *  - Stock bajo: FinProducto con stock <= 5. Alertas NCF: consumo real (contadores) vs. rango y umbral de SisConfig 'ncf'.
 */
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** Contador de FinCounter que lleva el último comprobante emitido por prefijo. */
const NCF_COUNTER: Record<string, string> = { B02: 'ncf', B01: 'b01', B04: 'nc' };

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

const plugin: FastifyPluginAsync = async app => {
  app.get('/', { onRequest: [app.authenticate, app.requireRole('Super Admin', 'Director Académico', 'Cajero')] }, async (): Promise<DashboardData> => {
    const tz = await zonaHoraria(), ahora = new Date(), hoy = hoyISO(tz, ahora), cur = partesEnZona(tz, ahora);
    const mesIni = inicioMes(tz, cur.y, cur.m);
    const mesFin = inicioMes(tz, cur.m === 12 ? cur.y + 1 : cur.y, cur.m === 12 ? 1 : cur.m + 1);
    const meses = Array.from({ length: 6 }, (_, i) => { const t = cur.y * 12 + (cur.m - 1) - (5 - i); return { y: Math.floor(t / 12), m: (t % 12) + 1 }; });
    const desde = inicioMes(tz, meses[0].y, meses[0].m);
    const keyOf = (d: Date) => { const p = partesEnZona(tz, d); return p.y * 12 + p.m - 1; };

    const [alumnos, rosterSecs, marcas, recibos, ventas, cxc, becasPendientes, productos, inscripcionesMes, planes, cobroTotal, ncf, ecf, ciclos, counters] = await Promise.all([
      prisma.alumno.findMany({ where: { estado: 'Activo' }, select: { id: true, tanda: true } }),
      prisma.acadRoster.groupBy({ by: ['seccion'], _count: { _all: true } }),
      prisma.acadAsistencia.findMany({ where: { fecha: hoy }, select: { estado: true } }),
      prisma.finRecibo.findMany({ where: { est: 'Activo', createdAt: { gte: desde, lt: mesFin } }, select: { monto: true, metodo: true, createdAt: true } }),
      prisma.finVenta.findMany({ where: { createdAt: { gte: desde, lt: mesFin } }, select: { total: true, metodo: true, createdAt: true } }),
      cxcResumen(undefined, tz),
      prisma.finBeca.count({ where: { estado: 'Pendiente' } }),
      prisma.finProducto.findMany({ select: { stock: true } }),
      prisma.persInscripcion.count({ where: { createdAt: { gte: mesIni, lt: mesFin } } }),
      prisma.finPlan.findMany({ where: { estado: 'Activo' } }),
      prisma.finCobroItem.aggregate({ _sum: { monto: true } }),
      cfgGet('ncf'), cfgGet('ecf'), cfgGet('ciclos'),
      prisma.finCounter.findMany(),
    ]);

    // --- Recaudo del mes y de los últimos 6 meses ---
    const mov = [...recibos.map(r => ({ v: r.monto, efe: r.metodo === 'Efectivo', k: keyOf(r.createdAt) })), ...ventas.map(v => ({ v: v.total, efe: v.metodo === 'Efectivo', k: keyOf(v.createdAt) }))];
    const kCur = cur.y * 12 + cur.m - 1;
    const recaudoEfectivo = round2(mov.filter(x => x.k === kCur && x.efe).reduce((a, x) => a + x.v, 0));
    const recaudoBanco = round2(mov.filter(x => x.k === kCur && !x.efe).reduce((a, x) => a + x.v, 0));
    const barras = meses.map(({ y, m }) => ({ m: MESES[m - 1], v: round2(mov.filter(x => x.k === y * 12 + m - 1).reduce((a, x) => a + x.v, 0) / 1e6) }));

    // --- Alumnos en mora (consistente con la morosidad: misma CxC vencida) ---
    const alumnosEnMora = alumnos.filter(a => (cxc.vencidoPorKid.get(kidOf(a.id)) ?? 0) > 0).length;

    // --- Proyección del ciclo: matrícula activa x plan (ponderado) ---
    const anual = (d: Record<string, unknown>, tanda: string) => {
      const tm = (d.tm ?? {}) as Record<string, string>;
      const bruto = Number(d.porTanda && tm[tanda] !== undefined ? tm[tanda] : d.anual) || 0;
      return bruto * (1 - (Number(d.desc) || 0) / 100);
    };
    const pl = planes.map(p => ({ w: p.alumnos, d: JSON.parse(p.data) as Record<string, unknown> }));
    const wTot = pl.reduce((a, p) => a + p.w, 0);
    const proyeccionCiclo = pl.length
      ? round2(alumnos.reduce((sum, a) => sum + (wTot > 0 ? pl.reduce((s, p) => s + anual(p.d, a.tanda) * p.w, 0) / wTot : pl.reduce((s, p) => s + anual(p.d, a.tanda), 0) / pl.length), 0))
      : round2(cobroTotal._sum.monto ?? 0);

    const rosterN = rosterSecs.reduce((a, s) => a + s._count._all, 0);

    // --- NCF ---
    const cnt = new Map(counters.map(c => [c.key, c.value]));
    const ncfOut: DashboardData['ncf'] = ncf.map(s => {
      const total = s.hasta - s.desde + 1, usado = cnt.get(NCF_COUNTER[s.pref] ?? '') ?? s.act ?? s.desde - 1;
      const rem = Math.max(0, s.hasta - usado);
      return { pref: s.pref, tipo: s.tipo, estado: rem <= 0 ? 'Agotada' : total > 0 && rem / total * 100 <= s.umbral ? 'Por agotar' : 'Vigente', restantes: rem, total };
    });

    return {
      fecha: `${DIAS[new Date(Date.UTC(cur.y, cur.m - 1, cur.d)).getUTCDay()]}, ${cur.d} de ${MESES_L[cur.m - 1]} de ${cur.y}`,
      ciclo: ciclos.find(c => c.estado === 'Activo')?.n ?? '',
      recaudoEfectivo, recaudoBanco, morosidad: cxc.vencido, proyeccionCiclo,
      matricula: alumnos.length, inscripcionesMes,
      asistenciaIncidencias: marcas.filter(m => m.estado !== 'P').length, asistenciaPresentes: marcas.filter(m => m.estado === 'P').length,
      asistenciaSinMarcar: Math.max(0, rosterN - marcas.length), asistenciaSeccion: rosterSecs.length === 1 ? rosterSecs[0].seccion : '',
      becasPendientes, alumnosEnMora, stockBajo: productos.filter(p => p.stock != null && p.stock <= 5).length, ecfCargado: ecf,
      ncf: ncfOut, barras,
    };
  });
};
export default plugin;
