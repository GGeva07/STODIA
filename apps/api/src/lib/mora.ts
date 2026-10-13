import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { audit } from './audit';
import { cicloIdActivo } from './ciclo';
import { hoyISO, round2, venceISO, zonaHoraria } from './cxc';
import { getFinanzas, MNAME, planesPago, resolverPlan, type PlanRow } from './pers-fin';
import { TIPO_CARGO_REINS, cfgReinscripcion } from './reinscripcion';

/**
 * GENERADOR IDEMPOTENTE DE RECARGOS POR MORA (FinCobroItem.tipo = 'mora').
 *
 * Reglas (decisiones por defecto, ver docs/mora-automatica.md):
 *  - Cuota elegible: cargo SIN PAGAR del ciclo ACTIVO, tipo 'col' (colegiatura) o 'srv' (servicio RECURRENTE; si es de comedor y su plan de
 *    alimentacion es «Sin mora», no genera), cuya fecha de vencimiento + dias de gracia del plan YA PASO (hoy > vence + gracia).
 *  - Configuracion: la del plan de pago del CONTRATO del alumno en el ciclo (moraTipo 'pct' | 'fijo' | 'none'). 'pct' con moraVal 0 usa finanzas.recargoMoraPct;
 *    'fijo' = moraVal en RD$; 'none' (o sin contrato / sin importe) no genera.
 *  - UNA sola vez por cuota (sin interes compuesto ni repeticion mensual). Base = `monto` de la cuota (con abonos, el saldo pendiente). Pct a 2 decimales.
 *  - Idempotencia: id determinista `mora-<idCuota>` (PK => imposible duplicar aunque corran dos procesos). Ademas, una mora de colegiatura YA sembrada
 *    del mismo alumno + mes + ciclo (concepto «Recargo por mora · Sep. (3%)», id que no empieza por `mora-`) cuenta como existente.
 *  - REINSCRIPCION (Etapa B): el cargo de «Cuota de reinscripcion» (tipo 'reins', ciclo destino Planificado o Activo) tambien genera su mora UNA vez al pasar vence + dias de gracia de la
 *    politica de reinscripcion, con el plan del contrato del alumno en el ciclo activo (sin plan o plan «sin mora»: el recargo global finanzas.recargoMoraPct). Si la politica
 *    «perdida de cupo por falta de pago» esta ACTIVA no se genera mora: el alumno pierde el cupo y el cargo se anula (lib/reinscripcion.ts).
 *  - La mora vence en vence-de-la-cuota + gracia, mismo alumno/tutor/ciclo, orden de la cuota, est 'Vencida'. Si la cuota se paga despues, la mora sigue
 *    pendiente (se exonera con el flujo de Exoneracion de mora + PIN de supervisor).
 */
export const MORA_PREFIJO = 'mora-';
const MES3 = Object.fromEntries(Object.entries(MNAME).map(([k, v]) => [v.slice(0, 3), Number(k)])) as Record<string, number>;
const RE_LEGADA = /^Recargo por mora · ([A-Za-zñÑ]{3})\.\s*\(/;

const sumarDias = (iso: string, d: number) => new Date(Date.parse(iso + 'T00:00:00Z') + d * 864e5).toISOString().slice(0, 10);
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
export const moraIdDe = (cuotaId: string) => { const id = MORA_PREFIJO + cuotaId; return id.length <= 100 ? id : MORA_PREFIJO + createHash('sha1').update(cuotaId).digest('hex'); };
const rdFmt = (n: number) => 'RD$ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface MoraAlcance { cicloId?: string; alumnoIds?: string[]; tutorId?: string; simular?: boolean }
export interface MoraResultado { creadas: number; monto: number; evaluadas: number; simulada: boolean; detalle: { cuotaId: string; alumnoId: string; con: string; monto: number }[] }

/** Importe de la mora: 'fijo' = RD$ del plan; 'pct' = % del plan (0 => el global) sobre la base, a 2 decimales. */
export function calcularMora(plan: Pick<PlanRow, 'moraTipo' | 'moraVal'>, base: number, pctGlobal: number): { monto: number; etiqueta: string } {
  if (plan.moraTipo === 'fijo') { const monto = round2(plan.moraVal); return { monto, etiqueta: rdFmt(monto) }; }
  if (plan.moraTipo !== 'pct') return { monto: 0, etiqueta: '' };
  const pct = plan.moraVal > 0 ? plan.moraVal : pctGlobal;
  return { monto: round2(base * pct / 100), etiqueta: round2(pct) + '%' };
}

let enCurso = false; // la pasada GLOBAL no se solapa consigo misma (las puntuales no se bloquean: la PK las protege)

export async function generarMoras(alc: MoraAlcance = {}): Promise<MoraResultado> {
  const out: MoraResultado = { creadas: 0, monto: 0, evaluadas: 0, simulada: !!alc.simular, detalle: [] };
  const [tz, activo] = await Promise.all([zonaHoraria(), cicloIdActivo()]);
  const cicloId = alc.cicloId ?? activo;
  if (cicloId !== activo) return out; // los ciclos cerrados/anteriores no generan recargos
  const hoy = hoyISO(tz);

  const filtro: Prisma.FinCobroItemWhereInput = alc.alumnoIds ? { alumnoId: { in: alc.alumnoIds } } : alc.tutorId ? { OR: [{ tutorId: alc.tutorId }, { alumno: { tutorId: alc.tutorId } }] } : {};
  const cuotas = await prisma.finCobroItem.findMany({
    where: { paid: false, cicloId, tipo: { in: ['col', 'srv'] }, ...filtro },
    select: { id: true, alumnoId: true, tutorId: true, cicloId: true, con: true, al: true, vence: true, monto: true, orden: true, tipo: true, servicio: { select: { kind: true, aliPlan: { select: { mora: true } } } } },
  });
  const cfgR = await cfgReinscripcion();
  const reinsOk = !(cfgR.activa && cfgR.perdidaCupoPorFaltaDePago);
  const reins = reinsOk ? await prisma.finCobroItem.findMany({
    where: { paid: false, tipo: TIPO_CARGO_REINS, ciclo: { estado: { in: ['Activo', 'Planificado'] } }, ...filtro },
    select: { id: true, alumnoId: true, tutorId: true, cicloId: true, con: true, al: true, vence: true, monto: true, orden: true, tipo: true, servicio: { select: { kind: true, aliPlan: { select: { mora: true } } } } },
  }) : [];
  const vencidas = [...cuotas, ...reins].filter(c => { const v = venceISO(c.vence); return v && v < hoy; });
  if (!vencidas.length) return out;
  const alumnos = [...new Set(vencidas.map(c => c.alumnoId))];

  const [contratos, planes, fin, previas] = await Promise.all([
    prisma.contrato.findMany({ where: { cicloId, alumnoId: { in: alumnos } }, select: { alumnoId: true, planId: true } }),
    planesPago(), getFinanzas(),
    prisma.finCobroItem.findMany({ where: { tipo: 'mora', alumnoId: { in: alumnos }, OR: [{ cicloId }, { id: { in: vencidas.filter(c => c.tipo === TIPO_CARGO_REINS).map(c => moraIdDe(c.id)) } }] }, select: { id: true, alumnoId: true, con: true } }),
  ]);
  const planDe = new Map<string, PlanRow | null>(contratos.map(c => [c.alumnoId, resolverPlan(planes, c.planId)]));
  const yaGeneradas = new Set(previas.filter(p => p.id.startsWith(MORA_PREFIJO)).map(p => p.id));
  const legadas = new Set<string>(); // alumno|mes de moras de colegiatura ya existentes (sembradas)
  for (const p of previas) { if (p.id.startsWith(MORA_PREFIJO)) continue; const m = RE_LEGADA.exec(p.con); if (m && MES3[m[1]]) legadas.add(`${p.alumnoId}|${MES3[m[1]]}`); }

  const nuevas: Prisma.FinCobroItemUncheckedCreateInput[] = [];
  for (const c of vencidas) {
    out.evaluadas++;
    const esReins = c.tipo === TIPO_CARGO_REINS;
    // Reinscripcion: plan del contrato activo; sin plan o «sin mora» → recargo global. Gracia = la de la politica de reinscripcion.
    const planBase = planDe.get(c.alumnoId);
    const plan = esReins ? (planBase && planBase.moraTipo !== 'none' ? { ...planBase, gracia: cfgR.diasGracia } : { moraTipo: 'pct', moraVal: 0, gracia: cfgR.diasGracia }) : planBase;
    if (!plan || plan.moraTipo === 'none') continue;
    if (c.tipo === 'srv' && (c.servicio?.kind !== 'rec' || c.servicio.aliPlan?.mora === false)) continue;
    const v = venceISO(c.vence)!, venceMora = sumarDias(v, Math.max(0, plan.gracia));
    if (venceMora >= hoy) continue; // aun dentro de la gracia
    const id = moraIdDe(c.id);
    if (yaGeneradas.has(id)) continue;
    const mes = Number(v.slice(5, 7));
    if (c.tipo === 'col' && legadas.has(`${c.alumnoId}|${mes}`)) continue;
    const { monto, etiqueta } = calcularMora(plan, c.monto, fin.recargoMoraPct);
    if (!(monto > 0) || !(c.monto > 0)) continue;
    const suf = c.tipo === 'srv' ? ` · ${c.con.split(' · ')[0]}` : '';
    const con = esReins ? `Recargo por mora · Reinscripción (${etiqueta})` : `Recargo por mora · ${MNAME[mes].slice(0, 3)}. (${etiqueta})${suf}`;
    nuevas.push({ id, alumnoId: c.alumnoId, tutorId: c.tutorId, servicioId: null, cicloId: c.cicloId, con, al: c.al, vence: dmy(venceMora), monto, est: 'Vencida', tipo: 'mora', paid: false, orden: c.orden });
    out.detalle.push({ cuotaId: c.id, alumnoId: c.alumnoId, con, monto });
  }
  out.monto = round2(nuevas.reduce((a, n) => a + n.monto, 0));
  if (alc.simular) { out.creadas = nuevas.length; return out; }
  for (const n of nuevas) {
    try { await prisma.finCobroItem.create({ data: n }); out.creadas++; }
    catch (e) { if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e; /* otro proceso ya la creo */ }
  }
  if (out.creadas) await audit('sistema', 'Insert', { tabla: 'Cobros', id: 'mora-auto', prev: '—', next: `${out.creadas} recargo(s) por mora generados (RD$ ${out.monto.toFixed(2)})${alc.tutorId ? ' · tutor ' + alc.tutorId : alc.alumnoIds ? ' · ' + alc.alumnoIds.length + ' alumno(s)' : ' · pasada global'}` });
  return out;
}

/** Igual que generarMoras pero nunca lanza (para engancharla a rutas sin romperlas). */
export async function generarMorasSeguro(alc: MoraAlcance, log?: { error: (...a: unknown[]) => void }) {
  try { return await generarMoras(alc); } catch (e) { (log?.error ?? console.error)('generarMoras fallo', e); return null; }
}

/** Pasada global diaria. Activa por defecto (la mora se agrega sola al pasar vencimiento + gracia); se apaga con MORA_PASADA_GLOBAL=0. Ademas se genera por demanda al abrir la cuenta / cobrar. No bloquea el arranque. */
export function programarMoras(log: { info: (...a: unknown[]) => void; error: (...a: unknown[]) => void }) {
  if (process.env.MORA_PASADA_GLOBAL === '0') { log.info('Mora automatica: pasada global desactivada (MORA_PASADA_GLOBAL=0); se genera por demanda.'); return; }
  const pasada = async () => {
    if (enCurso) return; enCurso = true;
    try { const r = await generarMoras(); log.info(`Mora automatica: ${r.creadas} recargo(s) creados, RD$ ${r.monto.toFixed(2)} (${r.evaluadas} cuotas vencidas evaluadas)`); }
    catch (e) { log.error(e, 'Mora automatica: la pasada fallo'); }
    finally { enCurso = false; }
  };
  setTimeout(pasada, 20_000).unref();
  setInterval(pasada, 6 * 3600_000).unref(); // idempotente: cada 6 h cubre el cambio de dia sin depender de una hora exacta
}
