/**
 * REINSCRIPCION de alumnos existentes en el ciclo siguiente (ETAPA B) con RESERVA DE CUPO y politica de perdida de cupo.
 * Documentacion completa: docs/cierre-y-promocion.md §6.
 *
 * Decision de negocio: el ciclo siguiente (p. ej. 2027-2028, estado Planificado) permite inscribir y COBRAR con anticipacion aunque el actual no este cerrado.
 * «Abrir reinscripcion» crea, por cada alumno vigente, una Matricula 'Reservado' (marcada en ReinscripcionReserva) en el ciclo destino + el cargo «Cuota de reinscripcion»
 * (FinCobroItem tipo 'reins', vence = CicloReinscripcion.limite). Pagar el cargo CONFIRMA la reserva (matricula 'Activo'). Si vence:
 *   - check «perdidaCupoPorFaltaDePago» APAGADO (defecto): solo se genera la MORA (lib/mora.ts) y el cupo queda asegurado.
 *   - check ACTIVO: el job `evaluarPerdidaCupo` pasa la matricula a 'Liberada', el alumno a 'Inactivo', anula el cargo y el cupo vuelve a estar disponible.
 *
 * Estados de Matricula que esta etapa agrega (CHECK CK_Matricula_estado, aditivo): 'Reservado' (cuenta cupo) y 'Liberada' (NO cuenta cupo, como 'Retirado').
 */
import type { Prisma } from '@prisma/client';
import type { CfgFinanzas, CfgReinscripcion, EstadoReinscripcion, ReinscripcionConteos, ReinscripcionEvalResp, ReinscripcionFila, ReinscripcionListado, ReinscripcionPreview } from '@stodia/shared';
import { prisma } from '../db';
import { audit } from './audit';
import { CicloError, anioInicio, cicloActivoRow } from './ciclo';
import { hoyISO, round2, venceISO, zonaHoraria } from './cxc';
import { idMatricula } from './matricula';
import { MNAME, cuotasDe, getFinanzas, inscripcionDe, materialesDe, mesesDe, planesPago, resolverPlan, totalDe, vencDMY, type PlanRow } from './pers-fin';
import { CFG_DEFAULTS, cfgGet } from './sisconfig';

type Db = typeof prisma | Prisma.TransactionClient;

/** Matriculas que NO ocupan cupo de la seccion. */
export const ESTADOS_SIN_CUPO = ['Retirado', 'Liberada'];
export const TIPO_CARGO_REINS = 'reins';
/** Filtro de Matricula: es una RESERVA por reinscripcion (fila en ReinscripcionReserva). */
export const ES_RESERVA: Prisma.MatriculaWhereInput = { reinscripcion: { isNot: null } };
/** Fecha limite (ISO) de reinscripcion de un ciclo, o null. */
export async function limiteDe(cicloId: string, db: Db = prisma): Promise<string | null> { return (await db.cicloReinscripcion.findUnique({ where: { cicloId } }))?.limite ?? null; }

/** Error de negocio con su codigo HTTP (`statusCode`: el manejador global de app.ts responde { error } con ese codigo). */
export class ReinscripcionError extends Error { constructor(message: string, public statusCode = 400) { super(message); } }

const trozos = <T>(a: T[], n = 150): T[][] => { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const sumarDias = (iso: string, d: number) => new Date(Date.parse(iso + 'T00:00:00Z') + d * 864e5).toISOString().slice(0, 10);
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
export const fechaValida = (s: unknown): s is string => typeof s === 'string' && ISO_RE.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;

/** Id determinista del cargo de reinscripcion de un alumno en un ciclo destino (PK: imposible duplicarlo). */
export const idCargoReins = (alumnoId: string, cicloId: string) => `reins-${cicloId.slice(4)}-${alumnoId}`;

// ---------------------------------------------------------------- Politica (SisConfig 'reinscripcion')
export async function cfgReinscripcion(): Promise<CfgReinscripcion> { return { ...CFG_DEFAULTS.reinscripcion, ...(await cfgGet('reinscripcion')) }; }

/** Valida y fusiona los cambios de la politica. Devuelve la politica nueva o el mensaje de error. */
export function normalizarCfgReins(cur: CfgReinscripcion, b: Partial<CfgReinscripcion>): CfgReinscripcion | string {
  const next = { ...cur };
  for (const k of ['activa', 'perdidaCupoPorFaltaDePago'] as const) {
    if (b[k] === undefined) continue;
    if (typeof b[k] !== 'boolean') return `«${k}» debe ser verdadero o falso`;
    next[k] = b[k]!;
  }
  if (b.modo !== undefined) {
    if (b.modo !== 'inscripcion' && b.modo !== 'propia') return 'La modalidad de la cuota debe ser «inscripcion» o «propia»';
    next.modo = b.modo;
  }
  if (b.cuotaReinscripcion !== undefined) {
    const v = Number(b.cuotaReinscripcion);
    if (!Number.isFinite(v) || v < 0 || v > 100_000_000) return 'La cuota de reinscripción debe estar entre 0 y 100,000,000';
    next.cuotaReinscripcion = round2(v);
  }
  if (b.diasGracia !== undefined) {
    const v = Number(b.diasGracia);
    if (!Number.isInteger(v) || v < 0 || v > 365) return 'Los días de gracia deben ser un entero entre 0 y 365';
    next.diasGracia = v;
  }
  if (next.modo === 'propia' && !(next.cuotaReinscripcion > 0)) return 'Indica el monto de la cuota de reinscripción propia (mayor que cero) o usa la cuota de inscripción vigente';
  return next;
}

// ---------------------------------------------------------------- Cupos
/** Filtro de alumnos que ocupan cupo en el ciclo ACTIVO (conteo por Alumno.seccionId): excluye a quien perdio el cupo (matricula 'Liberada' del ciclo activo). */
export const sinLiberarEn = (cicloActivoId: string): Prisma.AlumnoWhereInput => ({ matriculas: { none: { cicloId: cicloActivoId, estado: 'Liberada' } } });

/** Ocupacion por seccion de un ciclo (matriculas que cuentan cupo: todas menos Retirado / Liberada; incluye 'Reservado'). */
export async function ocupacionCiclo(cicloId: string, db: Db = prisma): Promise<Map<string, number>> {
  const g = await db.matricula.groupBy({ by: ['seccionId'], where: { cicloId, estado: { notIn: ESTADOS_SIN_CUPO } }, _count: { _all: true } });
  return new Map(g.map(x => [x.seccionId, x._count._all]));
}

interface SecLite { id: string; gradoId: string; letra: string; tandaId: string; cap: number; estado: string }
interface Contexto {
  activo: { id: string; nombre: string; fechaInicio: string; fechaFin: string };
  destino: { id: string; nombre: string; estado: string; fechaInicio: string; limiteReinscripcion: string | null } | null;
}
async function contexto(db: Db = prisma): Promise<Contexto> {
  const activo = await cicloActivoRow(db);
  if (!activo) throw new CicloError('No hay un ciclo lectivo activo: actívalo en Configuración → Ciclos lectivos.', 409);
  const d = await db.ciclo.findFirst({ where: { estado: 'Planificado', fechaInicio: { gt: activo.fechaInicio } }, orderBy: { fechaInicio: 'asc' }, select: { id: true, nombre: true, estado: true, fechaInicio: true, reinscripcionCfg: { select: { limite: true } } } });
  const destino = d ? { id: d.id, nombre: d.nombre, estado: d.estado, fechaInicio: d.fechaInicio, limiteReinscripcion: d.reinscripcionCfg?.limite ?? null } : null;
  return { activo, destino };
}

/** Monto de la cuota de reinscripcion de un alumno segun la politica: 'propia' = monto propio; 'inscripcion' = inscripcion vigente (fija, o la del plan de su contrato en el ciclo activo). */
function montoCuota(cfg: CfgReinscripcion, fin: CfgFinanzas, plan: PlanRow | null): number {
  if (cfg.modo === 'propia') return round2(cfg.cuotaReinscripcion);
  return round2(plan ? inscripcionDe(plan, fin).monto : fin.inscripcion);
}

// ---------------------------------------------------------------- Abrir reinscripcion
interface PlanApertura {
  alumnoId: string; code: string; nombre: string; origenSeccion: string; gradoOrden: number;
  seccionId: string | null; monto: number; tutorId: string; corto: string; etiquetaSec: string;
}
interface Apertura { preview: ReinscripcionPreview; filas: PlanApertura[]; destino: NonNullable<Contexto['destino']> | null; origen: Contexto['activo'] }

async function planearApertura(db: Db = prisma): Promise<Apertura> {
  const [{ activo, destino }, cfg, fin, planes] = await Promise.all([contexto(db), cfgReinscripcion(), getFinanzas(), planesPago()]);
  const base: ReinscripcionPreview = { origen: activo.nombre, destino: destino?.nombre ?? null, destinoEstado: destino?.estado ?? null, limite: destino?.limiteReinscripcion ?? null, cfg, vigentes: 0, conMatricula: 0, reservar: 0, sinCupo: 0, sinCupoNombres: [], montoTotal: 0, sinCuota: 0, avisos: [] };
  const hoy = hoyISO(await zonaHoraria());
  const bloqueo = !cfg.activa ? 'La reinscripción no está activa: actívala en Configuración → Reinscripción.'
    : !destino ? `No hay un ciclo Planificado después de ${activo.nombre}: crea el ciclo siguiente en Ciclos lectivos.`
    : !destino.limiteReinscripcion ? `Define la fecha límite de reinscripción de ${destino.nombre} antes de abrir.`
    : destino.limiteReinscripcion < hoy ? `La fecha límite de reinscripción (${dmy(destino.limiteReinscripcion)}) ya pasó: define una fecha futura.` : undefined;
  if (!destino) return { preview: { ...base, ...(bloqueo ? { bloqueo } : {}) }, filas: [], destino, origen: activo };

  const [mats, destMats, grados, secciones, contratos] = await Promise.all([
    db.matricula.findMany({
      where: { cicloId: activo.id, estado: 'Activo', alumno: { estado: 'Activo' } },
      select: { seccionId: true, alumno: { select: { id: true, code: true, nombres: true, apellidos: true, tutorId: true } } },
    }),
    db.matricula.findMany({ where: { cicloId: destino.id }, select: { alumnoId: true, seccionId: true, estado: true } }),
    db.grado.findMany({ orderBy: { orden: 'asc' } }),
    db.seccion.findMany(),
    db.contrato.findMany({ where: { cicloId: activo.id }, select: { alumnoId: true, planId: true } }),
  ]);
  const gradoMap = new Map(grados.map(g => [g.id, g])), secMap = new Map(secciones.map(s => [s.id, s]));
  const gradosAct = grados.filter(g => g.estado === 'Activo');
  const planDe = new Map(contratos.map(c => [c.alumnoId, resolverPlan(planes, c.planId)]));
  const yaDest = new Set(destMats.map(d => d.alumnoId));
  const ocup = new Map<string, number>();
  for (const d of destMats) if (!ESTADOS_SIN_CUPO.includes(d.estado)) ocup.set(d.seccionId, (ocup.get(d.seccionId) ?? 0) + 1);
  const cupo = (s: SecLite) => s.cap <= 0 || (ocup.get(s.id) ?? 0) < s.cap;
  const activasDe = (gid: string) => secciones.filter(s => s.gradoId === gid && s.estado === 'Activo').sort((p, q) => (p.letra + '|' + p.tandaId).localeCompare(q.letra + '|' + q.tandaId));

  const candidatos = mats.filter(m => !yaDest.has(m.alumno.id)).map(m => {
    const sec = secMap.get(m.seccionId)!, g = gradoMap.get(sec.gradoId)!;
    return { m, sec, g, etiqueta: `${g.nombre} ${sec.letra}` };
  }).sort((x, y) => x.g.orden - y.g.orden || x.etiqueta.localeCompare(y.etiqueta, 'es') || `${x.m.alumno.apellidos} ${x.m.alumno.nombres}`.localeCompare(`${y.m.alumno.apellidos} ${y.m.alumno.nombres}`, 'es'));

  const filas: PlanApertura[] = [];
  const sinCupoNombres: string[] = [];
  let montoTotal = 0, sinCuota = 0;
  for (const { m, sec, g, etiqueta } of candidatos) {
    // Seccion PROVISIONAL: grado siguiente (por orden) con la misma letra y tanda; si no hay cupo, la de la misma tanda con menos carga, y si no, cualquiera del grado. Ultimo grado: el mismo.
    const sig = gradosAct.find(x => x.orden > g.orden) ?? g;
    const cand = activasDe(sig.id);
    const menor = (l: SecLite[]) => [...l].filter(cupo).sort((p, q) => (ocup.get(p.id) ?? 0) - (ocup.get(q.id) ?? 0))[0];
    const misma = cand.find(s => s.letra === sec.letra && s.tandaId === sec.tandaId);
    const dest = (misma && cupo(misma) ? misma : undefined) ?? menor(cand.filter(s => s.tandaId === sec.tandaId)) ?? menor(cand);
    const a = m.alumno, nombre = `${a.apellidos}, ${a.nombres}`.trim();
    if (!dest) { sinCupoNombres.push(`${nombre} (${etiqueta})`); continue; }
    ocup.set(dest.id, (ocup.get(dest.id) ?? 0) + 1);
    const monto = montoCuota(cfg, fin, planDe.get(a.id) ?? null);
    montoTotal += monto; if (monto <= 0) sinCuota++;
    filas.push({ alumnoId: a.id, code: a.code, nombre, origenSeccion: etiqueta, gradoOrden: g.orden, seccionId: dest.id, monto, tutorId: a.tutorId, corto: a.nombres.split(' ')[0], etiquetaSec: `${gradoMap.get(dest.gradoId)?.nombre ?? ''} ${dest.letra}`.trim() });
  }
  const avisos: string[] = [];
  if (sinCuota) avisos.push(`${sinCuota} alumno(s) tienen cuota de reinscripción de RD$ 0: quedan confirmados directamente, sin cargo.`);
  if (cfg.modo === 'inscripcion' && fin.inscripcion <= 0 && fin.inscripcionModo !== 'plan') avisos.push('La cuota de inscripción vigente es RD$ 0: configúrala en Finanzas o define una cuota propia de reinscripción.');
  const preview: ReinscripcionPreview = {
    ...base, vigentes: mats.length, conMatricula: mats.length - candidatos.length, reservar: filas.length, sinCupo: sinCupoNombres.length, sinCupoNombres: sinCupoNombres.slice(0, 50),
    montoTotal: round2(montoTotal), sinCuota, avisos, ...(bloqueo ? { bloqueo } : {}),
  };
  return { preview, filas, destino, origen: activo };
}

export async function vistaPreviaApertura(): Promise<ReinscripcionPreview> { return (await planearApertura()).preview; }

let aperturaEnCurso = false;
export interface ResultadoApertura { preview: ReinscripcionPreview; reservados: number; cargos: number; confirmados: number; sinCupo: number }

/** Abre la reinscripcion (idempotente: solo procesa a quien aun no tiene matricula en el destino). Una transaccion. */
export async function abrirReinscripcion(usuario: string): Promise<ResultadoApertura> {
  if (aperturaEnCurso) throw new ReinscripcionError('Ya hay una apertura en curso; espera a que termine', 409);
  aperturaEnCurso = true;
  try {
    const plan = await planearApertura();
    const { preview, filas, destino, origen } = plan;
    if (preview.bloqueo || !destino) throw new ReinscripcionError(preview.bloqueo ?? 'No hay ciclo destino', 409);
    const limite = destino.limiteReinscripcion!;
    let cargos = 0, confirmados = 0;
    await prisma.$transaction(async tx => {
      for (const ch of trozos(filas)) {
        const nuevas = ch.filter(f => f.monto > 0), gratis = ch.filter(f => f.monto <= 0);
        await tx.matricula.createMany({
          data: ch.map(f => ({ id: idMatricula(f.alumnoId, destino.id), alumnoId: f.alumnoId, cicloId: destino.id, seccionId: f.seccionId!, estado: f.monto > 0 ? 'Reservado' : 'Activo', fechaIngreso: destino.fechaInicio })),
        });
        await tx.reinscripcionReserva.createMany({ data: ch.map(f => ({ matriculaId: idMatricula(f.alumnoId, destino.id), cicloId: destino.id, alumnoId: f.alumnoId })) });
        if (nuevas.length) await tx.finCobroItem.createMany({
          data: nuevas.map((f, i) => ({
            id: idCargoReins(f.alumnoId, destino.id), alumnoId: f.alumnoId, tutorId: f.tutorId, cicloId: destino.id, con: `Cuota de reinscripción ${destino.nombre}`, al: `${f.corto} · ${f.origenSeccion}`,
            vence: dmy(limite), monto: f.monto, est: 'Pendiente', tipo: TIPO_CARGO_REINS, orden: 10 + i,
          })),
        });
        await tx.reinscripcionEvento.createMany({
          data: ch.map(f => ({ cicloId: destino.id, alumnoId: f.alumnoId, tipo: 'Reserva', motivo: f.monto > 0 ? `Cuota RD$ ${f.monto.toFixed(2)} · vence ${dmy(limite)}` : 'Sin cuota (RD$ 0): confirmada directamente', usuario, seccionId: f.seccionId, cargoId: f.monto > 0 ? idCargoReins(f.alumnoId, destino.id) : null })),
        });
        cargos += nuevas.length;
        for (const f of gratis) { await confirmarTx(tx, f.alumnoId, destino.id, usuario, 'Sin cuota de reinscripción', false); confirmados++; }
      }
    }, { timeout: 300_000, maxWait: 60_000 });
    await audit(usuario, 'Insert', {
      tabla: 'Reinscripcion', id: destino.nombre,
      next: `Reinscripción abierta ${origen.nombre} → ${destino.nombre} · ${filas.length} reservas (${cargos} cargos, RD$ ${preview.montoTotal.toFixed(2)}), ${preview.sinCupo} sin cupo · límite ${dmy(limite)} · pérdida de cupo ${preview.cfg.perdidaCupoPorFaltaDePago ? 'ACTIVA' : 'apagada (solo mora)'}`,
    });
    return { preview: (await planearApertura()).preview, reservados: filas.length, cargos, confirmados, sinCupo: preview.sinCupo };
  } finally { aperturaEnCurso = false; }
}

// ---------------------------------------------------------------- Confirmacion (pago) y contrato del ciclo destino
/** Contrato + colegiatura (+ materiales) del ciclo destino con el MISMO plan del contrato del ciclo activo. Idempotente. No traslada servicios recurrentes (se contratan aparte). */
async function crearContratoDestinoTx(tx: Prisma.TransactionClient, alumnoId: string, cicloId: string): Promise<boolean> {
  const [dest, activo] = await Promise.all([tx.ciclo.findUnique({ where: { id: cicloId } }), cicloActivoRow(tx)]);
  if (!dest || !activo) return false;
  const ya = await tx.contrato.findUnique({ where: { alumnoId_cicloId: { alumnoId, cicloId } } });
  if (ya) return false;
  const previo = await tx.contrato.findFirst({ where: { alumnoId, cicloId: activo.id } }) ?? await tx.contrato.findFirst({ where: { alumnoId, ciclo: { fechaInicio: { lt: dest.fechaInicio } } }, orderBy: { ciclo: { fechaInicio: 'desc' } } });
  if (!previo) return false;
  const planes = await planesPago(), plan = resolverPlan(planes, previo.planId);
  const mat = await tx.matricula.findUnique({ where: { alumnoId_cicloId: { alumnoId, cicloId } }, include: { seccion: { include: { tanda: true, grado: true } } } });
  const al = await tx.alumno.findUnique({ where: { id: alumnoId }, select: { nombres: true, tutorId: true } });
  if (!plan || plan.estado !== 'Activo' || !mat || !al) return false;
  const tanda = mat.seccion.tanda.nombre;
  if (totalDe(plan, tanda) <= 0) return false;
  const y0 = anioInicio(dest.nombre), montos = cuotasDe(plan, tanda), vencs = mesesDe(plan, y0), etiqueta = `${al.nombres.split(' ')[0]} · ${mat.seccion.grado.nombre} ${mat.seccion.letra}`;
  const orden0 = 100;
  await tx.contrato.create({ data: { id: `ctr-${alumnoId}-${y0}`, alumnoId, cicloId, planId: plan.id, tipoBecaId: null, ctr: `CTR-${y0}-${alumnoId}`, firmado: '' } });
  const materiales = materialesDe(plan);
  await tx.finCobroItem.createMany({
    data: [
      ...vencs.map((v, i) => ({ id: `rei-${y0}-${alumnoId}-c${v.m}`, alumnoId, tutorId: al.tutorId, cicloId, con: `Colegiatura ${MNAME[v.m]} ${v.y}`, al: etiqueta, vence: vencDMY(plan.dia, v.m, v.y), monto: montos[i], est: 'Pendiente', tipo: 'col', orden: orden0 + i })),
      ...(materiales > 0 ? [{ id: `rei-${y0}-${alumnoId}-mat`, alumnoId, tutorId: al.tutorId, cicloId, con: 'Cuota de materiales', al: etiqueta, vence: vencDMY(plan.dia, vencs[0].m, vencs[0].y), monto: materiales, est: 'Pendiente', tipo: 'mat', orden: orden0 + 50 }] : []),
    ],
  });
  return true;
}

/** Confirma la reserva (matricula 'Activo') y genera el contrato/cuotas del ciclo destino. Idempotente. Devuelve true si cambio algo. */
async function confirmarTx(tx: Prisma.TransactionClient, alumnoId: string, cicloId: string, usuario: string, motivo: string, evento = true): Promise<boolean> {
  const m = await tx.matricula.findUnique({ where: { alumnoId_cicloId: { alumnoId, cicloId } } });
  if (!m || !(await tx.reinscripcionReserva.findUnique({ where: { matriculaId: m.id } }))) return false;
  let cambio = false;
  if (m.estado === 'Reservado') { await tx.matricula.update({ where: { id: m.id }, data: { estado: 'Activo' } }); cambio = true; }
  else if (m.estado !== 'Activo') return false; // Liberada / Retirado / final: no se revive con un pago
  if (cambio && evento) await tx.reinscripcionEvento.create({ data: { cicloId, alumnoId, tipo: 'Confirmada', motivo, usuario, seccionId: m.seccionId, cargoId: idCargoReins(alumnoId, cicloId) } });
  await crearContratoDestinoTx(tx, alumnoId, cicloId);
  return cambio;
}

/** Gancho de /cobros/procesar: se llama DENTRO de la transaccion del cobro con los cargos 'reins' pagados por completo. */
export async function confirmarPagoReinscripcionTx(tx: Prisma.TransactionClient, cargos: { alumnoId: string; cicloId: string }[], usuario: string): Promise<number> {
  let n = 0;
  for (const c of cargos) if (await confirmarTx(tx, c.alumnoId, c.cicloId, usuario, 'Cuota de reinscripción pagada')) n++;
  return n;
}

// ---------------------------------------------------------------- Liberacion (perdida de cupo)
/** Anula un cargo SIN PAGAR: se elimina; si ya esta referenciado (intencion de pago del portal, nota, recibo) se marca «Anulada» (paid, sin cobro). */
async function anularCargoTx(tx: Prisma.TransactionClient, id: string): Promise<void> {
  const cargo = await tx.finCobroItem.findUnique({ where: { id } });
  if (!cargo || cargo.paid) return;
  const [a, b, c] = await Promise.all([tx.mobPagoIntencionCargo.count({ where: { cobroItemId: id } }), tx.notaFiscalLinea.count({ where: { cobroItemId: id } }), tx.finReciboItem.count({ where: { cobroItemId: id } })]);
  if (a + b + c === 0) await tx.finCobroItem.delete({ where: { id } });
  else await tx.finCobroItem.update({ where: { id }, data: { paid: true, est: 'Anulada', con: `[Anulada] ${cargo.con}` } });
}

/** Libera una reserva: matricula 'Liberada', cargo anulado (se elimina; si ya esta referenciado se marca «Anulada»), alumno 'Inactivo' (si procede) y evento. */
export async function liberarReservaTx(tx: Prisma.TransactionClient, mat: { id: string; alumnoId: string; cicloId: string; seccionId: string }, o: { motivo: string; usuario: string; inactivar: boolean }): Promise<void> {
  await tx.matricula.update({ where: { id: mat.id }, data: { estado: 'Liberada' } });
  const cid = idCargoReins(mat.alumnoId, mat.cicloId);
  await anularCargoTx(tx, cid);
  await anularCargoTx(tx, 'mora-' + cid); // la mora (pendiente) generada sobre esa cuota tampoco se cobra: el alumno perdio el cupo
  if (o.inactivar) await tx.alumno.updateMany({ where: { id: mat.alumnoId, estado: 'Activo' }, data: { estado: 'Inactivo' } });
  await tx.reinscripcionEvento.create({ data: { cicloId: mat.cicloId, alumnoId: mat.alumnoId, tipo: 'Liberada', motivo: o.motivo, usuario: o.usuario, seccionId: mat.seccionId, cargoId: cid } });
}

let evaluando = false;
/**
 * JOB de perdida de cupo (idempotente). Evalua las reservas con cuota impaga cuya fecha limite (+gracia) ya paso.
 *  - politica `perdidaCupoPorFaltaDePago` ACTIVA y reinscripcion activa: libera (alumno Inactivo, matricula Liberada, cargo anulado, cupo disponible) + auditoria.
 *  - APAGADA: no toca nada (cupo asegurado); la mora la genera lib/mora.ts (se invoca al final para que sea inmediata).
 */
export async function evaluarPerdidaCupo(o: { simular?: boolean; usuario?: string } = {}): Promise<ReinscripcionEvalResp> {
  const out: ReinscripcionEvalResp = { evaluadas: 0, vencidas: 0, liberadas: 0, conMora: 0, politicaPerdida: false };
  const cfg = await cfgReinscripcion();
  out.politicaPerdida = cfg.activa && cfg.perdidaCupoPorFaltaDePago;
  const hoy = hoyISO(await zonaHoraria());
  const mats = await prisma.matricula.findMany({ where: { estado: 'Reservado', ...ES_RESERVA, ciclo: { estado: { in: ['Planificado', 'Activo'] } } }, select: { id: true, alumnoId: true, cicloId: true, seccionId: true } });
  if (!mats.length) return out;
  const cargos = new Map<string, { vence: string }>();
  for (const ch of trozos(mats, 500)) for (const c of await prisma.finCobroItem.findMany({ where: { id: { in: ch.map(m => idCargoReins(m.alumnoId, m.cicloId)) }, paid: false }, select: { id: true, vence: true } })) cargos.set(c.id, c);
  const vencidas = mats.filter(m => {
    const c = cargos.get(idCargoReins(m.alumnoId, m.cicloId)); if (!c) return false;
    out.evaluadas++;
    const v = venceISO(c.vence);
    return !!v && sumarDias(v, Math.max(0, cfg.diasGracia)) < hoy;
  });
  out.vencidas = vencidas.length;
  if (!out.politicaPerdida) { out.conMora = vencidas.length; return out; }
  if (o.simular) { out.liberadas = vencidas.length; return out; }
  const usuario = o.usuario ?? 'sistema';
  for (const m of vencidas) {
    await prisma.$transaction(async tx => {
      const cur = await tx.matricula.findUnique({ where: { id: m.id } });
      if (!cur || cur.estado !== 'Reservado') return; // otro proceso (o un pago) ya la resolvio
      const c = await tx.finCobroItem.findUnique({ where: { id: idCargoReins(m.alumnoId, m.cicloId) } });
      if (!c || c.paid) return;
      await liberarReservaTx(tx, m, { motivo: `Falta de pago de la cuota de reinscripción (vencía ${c.vence}${cfg.diasGracia ? ` + ${cfg.diasGracia} día(s) de gracia` : ''})`, usuario, inactivar: true });
      out.liberadas++;
    });
  }
  if (out.liberadas) await audit(usuario, 'Update', { tabla: 'Reinscripcion', id: 'perdida-cupo', prev: 'Reservado', next: `${out.liberadas} cupo(s) liberado(s) por falta de pago de la reinscripción (alumno Inactivo, cargo anulado)` });
  return out;
}

export function programarReinscripcion(log: { info: (...a: unknown[]) => void; error: (...a: unknown[]) => void }) {
  if (process.env.REINSCRIPCION_PASADA_GLOBAL === '0') { log.info('Reinscripción: pasada de pérdida de cupo desactivada (REINSCRIPCION_PASADA_GLOBAL=0).'); return; }
  const pasada = async () => {
    if (evaluando) return; evaluando = true;
    try { const r = await evaluarPerdidaCupo(); log.info(`Reinscripción: ${r.evaluadas} reservas con cuota impaga, ${r.vencidas} vencidas, ${r.liberadas} cupo(s) liberado(s)${r.politicaPerdida ? '' : ' (política de pérdida de cupo apagada: solo mora)'}`); }
    catch (e) { log.error(e, 'Reinscripción: la pasada falló'); }
    finally { evaluando = false; }
  };
  setTimeout(pasada, 25_000).unref();
  setInterval(pasada, 6 * 3600_000).unref();
}

// ---------------------------------------------------------------- Reactivar un alumno liberado
export async function reactivarAlumno(alumnoId: string, usuario: string, limitePedido?: string): Promise<{ seccion: string; limite: string; confirmado: boolean }> {
  const hoy = hoyISO(await zonaHoraria());
  const mat = await prisma.matricula.findFirst({
    where: { alumnoId, estado: 'Liberada', ...ES_RESERVA, ciclo: { estado: { in: ['Planificado', 'Activo'] } } }, orderBy: { ciclo: { fechaInicio: 'desc' } },
    include: { ciclo: true, alumno: { select: { id: true, estado: true, tutorId: true, nombres: true } }, seccion: { include: { grado: true } } },
  });
  if (!mat) throw new ReinscripcionError('El alumno no tiene un cupo liberado por reinscripción que reactivar', 404);
  if (mat.alumno.estado !== 'Inactivo') throw new ReinscripcionError(`El alumno está ${mat.alumno.estado}: solo se reactivan alumnos Inactivos`, 409);
  const limite = limitePedido ? limitePedido : sumarDias(hoy, 7);
  if (!fechaValida(limite) || limite < hoy) throw new ReinscripcionError('La nueva fecha límite debe ser hoy o posterior (AAAA-MM-DD)', 400);
  const [cfg, fin, planes, secciones, ocup, contrato] = await Promise.all([
    cfgReinscripcion(), getFinanzas(), planesPago(), prisma.seccion.findMany({ where: { gradoId: mat.seccion.gradoId, estado: 'Activo' }, include: { grado: true } }),
    ocupacionCiclo(mat.cicloId), prisma.contrato.findFirst({ where: { alumnoId, ciclo: { fechaInicio: { lt: mat.ciclo.fechaInicio } } }, orderBy: { ciclo: { fechaInicio: 'desc' } } }),
  ]);
  // Cupo: su seccion reservada; si esta llena, otra del mismo grado (misma tanda primero). Sin cupo: se avisa y no se cambia nada.
  const libre = (s: { id: string; cap: number }) => s.cap <= 0 || (ocup.get(s.id) ?? 0) < s.cap;
  const sec = secciones.find(s => s.id === mat.seccionId && libre(s)) ?? secciones.filter(s => s.tandaId === mat.seccion.tandaId && libre(s)).sort((a, b) => (ocup.get(a.id) ?? 0) - (ocup.get(b.id) ?? 0))[0] ?? secciones.filter(libre).sort((a, b) => (ocup.get(a.id) ?? 0) - (ocup.get(b.id) ?? 0))[0];
  if (!sec) throw new ReinscripcionError(`No hay cupo en ${mat.seccion.grado.nombre} (${mat.ciclo.nombre}): todas las secciones están llenas. Amplía la capacidad en Catálogos o libera un cupo y vuelve a intentarlo.`, 409);
  const plan = contrato ? resolverPlan(planes, contrato.planId) : null;
  const monto = montoCuota(cfg, fin, plan);
  const cid = idCargoReins(alumnoId, mat.cicloId);
  const etiqueta = `${mat.alumno.nombres.split(' ')[0]} · ${sec.grado.nombre} ${sec.letra}`;
  await prisma.$transaction(async tx => {
    await tx.alumno.update({ where: { id: alumnoId }, data: { estado: 'Activo' } });
    await tx.matricula.update({ where: { id: mat.id }, data: { estado: monto > 0 ? 'Reservado' : 'Activo', seccionId: sec.id } });
    if (monto > 0) {
      const data = { alumnoId, tutorId: mat.alumno.tutorId, cicloId: mat.cicloId, con: `Cuota de reinscripción ${mat.ciclo.nombre}`, al: etiqueta, vence: dmy(limite), monto, est: 'Pendiente', tipo: TIPO_CARGO_REINS, paid: false, orden: 10 };
      await tx.finCobroItem.upsert({ where: { id: cid }, update: data, create: { id: cid, ...data } });
    } else await crearContratoDestinoTx(tx, alumnoId, mat.cicloId);
    await tx.reinscripcionEvento.create({ data: { cicloId: mat.cicloId, alumnoId, tipo: 'Reactivada', motivo: monto > 0 ? `Reactivado por el Director · nueva fecha límite ${dmy(limite)}` : 'Reactivado por el Director · sin cuota', usuario, seccionId: sec.id, cargoId: monto > 0 ? cid : null } });
  });
  await audit(usuario, 'Update', { tabla: 'Reinscripcion', id: alumnoId, prev: 'Liberada · Inactivo', next: `Reactivado en ${sec.grado.nombre} ${sec.letra} (${mat.ciclo.nombre})${monto > 0 ? ` · cuota RD$ ${monto.toFixed(2)} vence ${dmy(limite)}` : ''}` });
  return { seccion: `${sec.grado.nombre} ${sec.letra}`, limite, confirmado: monto <= 0 };
}

// ---------------------------------------------------------------- Listado del Director
export async function listarReinscripcion(): Promise<ReinscripcionListado> {
  const [cfg, ctx] = await Promise.all([cfgReinscripcion(), contexto()]);
  // Ciclo de la reinscripcion: el ultimo (no cerrado) con reservas de reinscripcion; si no hay, el Planificado siguiente (para mostrar el limite).
  const conReservas = await prisma.matricula.findFirst({ where: { ...ES_RESERVA, ciclo: { estado: { in: ['Planificado', 'Activo'] } } }, orderBy: { ciclo: { fechaInicio: 'desc' } }, select: { cicloId: true } });
  const cid = conReservas?.cicloId ?? ctx.destino?.id;
  const dd = cid ? await prisma.ciclo.findUnique({ where: { id: cid }, include: { reinscripcionCfg: true } }) : null;
  const destino = dd ? { ...dd, limiteReinscripcion: dd.reinscripcionCfg?.limite ?? null } : null;
  const vacio: ReinscripcionListado = { destino: destino?.nombre ?? null, destinoEstado: destino?.estado ?? null, limite: destino?.limiteReinscripcion ?? null, cfg, conteos: { reservado: 0, confirmado: 0, vencido: 0, liberado: 0, total: 0, moraGenerada: 0 }, cuposLiberados: 0, filas: [] };
  if (!destino || !conReservas) return vacio;
  const hoy = hoyISO(await zonaHoraria());
  const origenCiclo = await prisma.ciclo.findFirst({ where: { fechaInicio: { lt: destino.fechaInicio } }, orderBy: { fechaInicio: 'desc' }, select: { id: true } });
  const mats = await prisma.matricula.findMany({
    where: { cicloId: destino.id, ...ES_RESERVA },
    include: { alumno: { select: { id: true, code: true, nombres: true, apellidos: true, estado: true } }, seccion: { include: { grado: true, tanda: true } } },
  });
  const ids = mats.map(m => m.alumnoId);
  const [cargos, moras, origMats] = await Promise.all([
    Promise.all(trozos(ids, 800).map(ch => prisma.finCobroItem.findMany({ where: { cicloId: destino.id, tipo: TIPO_CARGO_REINS, alumnoId: { in: ch } }, select: { id: true, alumnoId: true, monto: true, vence: true, paid: true, est: true } }))).then(x => x.flat()),
    Promise.all(trozos(ids, 800).map(ch => prisma.finCobroItem.findMany({ where: { cicloId: destino.id, tipo: 'mora', paid: false, alumnoId: { in: ch }, con: { contains: 'Reinscripción' } }, select: { alumnoId: true, monto: true } }))).then(x => x.flat()),
    origenCiclo ? Promise.all(trozos(ids, 800).map(ch => prisma.matricula.findMany({ where: { cicloId: origenCiclo.id, alumnoId: { in: ch } }, select: { alumnoId: true, seccion: { select: { letra: true, grado: { select: { nombre: true } } } } } }))).then(x => x.flat()) : Promise.resolve([]),
  ]);
  const cargoDe = new Map(cargos.map(c => [c.alumnoId, c])), moraDe = new Map<string, number>(), origenDe = new Map(origMats.map(o => [o.alumnoId, `${o.seccion.grado.nombre} ${o.seccion.letra}`]));
  for (const m of moras) moraDe.set(m.alumnoId, round2((moraDe.get(m.alumnoId) ?? 0) + m.monto));
  const filas: ReinscripcionFila[] = mats.map(m => {
    const c = cargoDe.get(m.alumnoId), mora = moraDe.get(m.alumnoId) ?? 0;
    const venceI = c ? venceISO(c.vence) : null, vencido = !!c && !c.paid && !!venceI && sumarDias(venceI, Math.max(0, cfg.diasGracia)) < hoy;
    const estado: EstadoReinscripcion = m.estado === 'Liberada' ? 'Liberado' : m.estado === 'Reservado' ? (vencido ? 'Vencido' : 'Reservado') : 'Confirmado';
    const nota = estado === 'Liberado' ? 'Liberado por falta de pago' : estado === 'Vencido' ? (cfg.perdidaCupoPorFaltaDePago && cfg.activa ? 'Vencida: el cupo se liberará en la próxima evaluación' : `Vencida: cupo asegurado${mora ? ' · mora generada' : ' · la mora se genera en la próxima pasada'}`) : '';
    const g = m.seccion.grado;
    return { alumnoId: m.alumnoId, code: m.alumno.code, nombre: `${m.alumno.apellidos}, ${m.alumno.nombres}`.trim(), gradoId: g.id, grado: g.nombre, gradoOrden: g.orden, seccionId: m.seccionId, seccion: `${g.nombre} ${m.seccion.letra}`, tanda: m.seccion.tanda.nombre, origen: origenDe.get(m.alumnoId) ?? '—', estado, monto: c?.monto ?? 0, vence: c?.vence ?? null, cargoId: c?.id ?? null, mora, alumnoEstado: m.alumno.estado, nota };
  }).sort((x, y) => x.gradoOrden - y.gradoOrden || x.seccion.localeCompare(y.seccion, 'es') || x.nombre.localeCompare(y.nombre, 'es'));
  const n = (e: EstadoReinscripcion) => filas.filter(f => f.estado === e).length;
  const conteos: ReinscripcionConteos = { reservado: n('Reservado'), confirmado: n('Confirmado'), vencido: n('Vencido'), liberado: n('Liberado'), total: filas.length, moraGenerada: round2(filas.reduce((a, f) => a + f.mora, 0)) };
  return { ...vacio, conteos, cuposLiberados: conteos.liberado, filas };
}

/** Fecha limite de reinscripcion de un ciclo Planificado (editable por el Director). */
export async function fijarLimite(nombre: string, fecha: string | null, usuario: string): Promise<string | null> {
  const c = await prisma.ciclo.findUnique({ where: { nombre: nombre.replace('-', '–') } });
  if (!c) throw new ReinscripcionError(`El ciclo «${nombre}» no existe`, 404);
  if (c.estado === 'Cerrado') throw new ReinscripcionError(`El ciclo ${c.nombre} está cerrado: no se puede cambiar su fecha límite`, 409);
  if (fecha !== null && !fechaValida(fecha)) throw new ReinscripcionError('Fecha inválida (usa AAAA-MM-DD)', 400);
  if (fecha !== null && fecha >= c.fechaFin) throw new ReinscripcionError('La fecha límite debe ser anterior al fin del ciclo', 400);
  const anterior = await limiteDe(c.id);
  await prisma.cicloReinscripcion.upsert({ where: { cicloId: c.id }, update: { limite: fecha }, create: { cicloId: c.id, limite: fecha } });
  await audit(usuario, 'Update', { tabla: 'CiclosLectivos', id: c.nombre, prev: `límite reinscripción ${anterior ?? '—'}`, next: `límite reinscripción ${fecha ?? '—'}` });
  // Las reservas abiertas con cuota impaga siguen la nueva fecha (el cargo vence = fecha limite).
  // (solo las que seguian la fecha anterior: una prorroga individual por «Reactivar» no se pisa).
  if (fecha && anterior) await prisma.finCobroItem.updateMany({ where: { cicloId: c.id, tipo: TIPO_CARGO_REINS, paid: false, vence: dmy(anterior) }, data: { vence: dmy(fecha) } });
  return fecha;
}
