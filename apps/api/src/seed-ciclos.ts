/**
 * SOLO DEMO (SEED_DEMO=true). Ciclos lectivos y datos de los ciclos ANTERIORES (Fase 2C), para que el selector «Ciclo lectivo activo» tenga que mostrar:
 *  - seedCiclosDemo(): 4 ciclos con sus 4 periodos (3 cerrados + el activo del año en curso). Debe correr ANTES que cualquier dato por ciclo.
 *  - seedCicloAnterior(): historial coherente de los alumnos de la demo (idempotente por SisConfig 'demoCiclos'; determinista, PRNG propio para NO alterar
 *    la secuencia aleatoria del ciclo activo): Matricula de los 3 ciclos anteriores (grado inmediato inferior; algunos repitentes; los de nuevo ingreso no tienen
 *    matricula previa), contrato + cargos + recibos PAGADOS del ciclo inmediato anterior (casi 100 % cobrado, unos pocos saldos), becas, notas finales de los
 *    4 periodos, asistencia resumida y las asignaciones/horarios del ciclo anterior (copia de los del activo).
 *    El Expediente 360 de Juan Mendoza (0412) sale de estas tablas: 4to A 89.4 / 3ro A 91.2 / 2do A 87.8 (+ el parcial del ciclo activo, 83.5).
 *  Los cargos y recibos del ciclo cerrado llevan su cicloId: NO entran en morosidad, recaudo del mes ni proyeccion del ciclo activo.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from './db';
import { anioInicio, cicloActivoRow, crearCiclo, y0DeHoy } from './lib/ciclo';
import { idMatricula } from './lib/matricula';
import { MNAME, cuotasDe, getFinanzas, mesesDe, planesPago, vencDMY } from './lib/pers-fin';
import { cajaDe, lineasData } from './lib/recibos';
import { round2 } from './lib/cxc';

type Tx = Prisma.TransactionClient;

export async function seedCiclosDemo(): Promise<void> {
  const y0 = y0DeHoy();
  for (const k of [3, 2, 1]) await crearCiclo(prisma, `${y0 - k}–${y0 - k + 1}`, 'Cerrado');
  await crearCiclo(prisma, `${y0}–${y0 + 1}`, 'Activo');
}

// ---------------- PRNG propio (no toca el de seed-demo-grande) ----------------
function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rand = mulberry32(20251001);
const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const chance = (p: number) => rand() < p;
function wpick<T>(items: readonly (readonly [T, number])[]): T { const tot = items.reduce((a, [, w]) => a + w, 0); let r = rand() * tot; for (const [v, w] of items) { r -= w; if (r <= 0) return v; } return items[items.length - 1][0]; }
const p2 = (n: number) => String(n).padStart(2, '0');
async function bulk<T>(rows: T[], fn: (c: T[]) => Promise<unknown>, n = 300) { for (let i = 0; i < rows.length; i += n) await fn(rows.slice(i, i + n)); }

const METODO_PAGO: readonly (readonly [string, number])[] = [['Efectivo', 35], ['Transferencia', 33], ['Tarjeta de Crédito', 27], ['Cheque', 5]];
const refDe = (m: string) => (m === 'Efectivo' ? '' : m === 'Transferencia' ? 'TRF-' + int(100000, 999999) : m.startsWith('Tarjeta') ? 'AUT-' + int(100000, 999999) : 'CHQ-' + int(1000, 9999));
/** Promedios de Juan Mendoza (0412) por ciclo (respetan exactamente su historial de la demo) y tuplas c1..c4+ex de suma fija (promedio exacto). */
const JUAN: Record<number, { prom: number; tuplas: number[][] }> = {
  1: { prom: 89.4, tuplas: [[89, 90, 88, 91, 89], [90, 88, 91, 89, 89], [88, 91, 89, 90, 89], [91, 89, 89, 88, 90], [89, 89, 90, 91, 88]] },
  2: { prom: 91.2, tuplas: [[91, 92, 90, 93, 90], [92, 90, 93, 90, 91], [90, 93, 90, 91, 92], [93, 90, 91, 92, 90], [90, 91, 92, 90, 93]] },
  3: { prom: 87.8, tuplas: [[87, 88, 86, 89, 89], [88, 86, 89, 89, 87], [86, 89, 89, 87, 88], [89, 89, 87, 88, 86], [89, 87, 88, 86, 89]] },
};

export async function seedCicloAnterior(): Promise<void> {
  if (await prisma.sisConfig.findUnique({ where: { clave: 'demoCiclos' } })) { console.log('seed ciclos anteriores: ya existe'); return; }
  const act = await cicloActivoRow();
  if (!act) return;
  const t0 = Date.now(), y0 = anioInicio(act.nombre);
  const cs = await Promise.all([1, 2, 3].map(k => prisma.ciclo.findUnique({ where: { nombre: `${y0 - k}–${y0 - k + 1}` } })));
  const [c1, c2, c3] = cs;
  if (!c1) return;
  const [fin, planes, grados, secciones, alumnos, insc, rosters, mgs, contratosAct, metodos, cajero] = await Promise.all([
    getFinanzas(), planesPago(), prisma.grado.findMany({ orderBy: { orden: 'asc' } }), prisma.seccion.findMany({ where: { estado: 'Activo' }, orderBy: { id: 'asc' } }),
    prisma.alumno.findMany({ select: { id: true, nombres: true, estado: true, tutorId: true, seccion: { select: { id: true, letra: true, tandaId: true, tanda: { select: { nombre: true } }, grado: { select: { id: true, orden: true } } } } } }),
    prisma.persInscripcion.findMany({ where: { cicloId: act.id }, select: { alumnoId: true } }),
    prisma.acadRoster.findMany({ where: { alumnoId: { not: null } }, select: { id: true, alumnoId: true } }),
    prisma.materiaGrado.findMany({ select: { gradoId: true, materiaId: true } }),
    prisma.contrato.findMany({ where: { cicloId: act.id }, select: { alumnoId: true, planId: true, tipoBecaId: true } }),
    prisma.metodoPago.findMany({ select: { id: true, nombre: true } }),
    prisma.user.findUnique({ where: { usuario: 'usr_arosario' } }),
  ]);
  const cajaId = cajero ? await cajaDe({ usuario: cajero.usuario, nombre: cajero.nombre }) : null;
  const nuevos = new Set(insc.map(i => i.alumnoId)), rosterDe = new Map(rosters.map(r => [r.alumnoId!, r.id]));
  const porOrden = new Map(grados.map(g => [g.orden, g])), materiasDe = new Map<string, string[]>();
  for (const m of mgs) materiasDe.set(m.gradoId, [...(materiasDe.get(m.gradoId) ?? []), m.materiaId]);
  const secDeGrado = new Map<string, typeof secciones>();
  for (const s of secciones) secDeGrado.set(s.gradoId, [...(secDeGrado.get(s.gradoId) ?? []), s]);
  const planDe = new Map(planes.map(p => [p.id, p])), ctrAct = new Map(contratosAct.map(c => [c.alumnoId, c]));
  const metodoId = new Map(metodos.map(m => [m.nombre, m.id]));

  /** Seccion del grado `orden` para el alumno: misma letra y tanda; si no, misma tanda; si no, la primera. `letra` fuerza la letra (Juan: «A»). */
  const seccionDe = (orden: number, letra: string, tandaId: string, forzar?: string) => {
    const g = porOrden.get(orden); if (!g) return null;
    const l = secDeGrado.get(g.id) ?? []; if (!l.length) return null;
    const L = forzar ?? letra;
    return l.find(s => s.letra === L && s.tandaId === tandaId) ?? l.find(s => s.letra === L) ?? (forzar ? null : l.find(s => s.tandaId === tandaId) ?? l[0]);
  };

  // ---------------- 1) Matriculas de los 3 ciclos anteriores ----------------
  interface M { id: string; alumnoId: string; cicloId: string; seccionId: string; estado: string; fechaIngreso: string; fechaRetiro: null }
  const matriculas: M[] = [], c1De = new Map<string, { sec: (typeof secciones)[number]; orden: number; estado: string }>();
  for (const a of alumnos) {
    if (nuevos.has(a.id)) continue; // inscritos este ano: sin matricula previa
    const o = a.seccion.grado.orden, juan = a.id === '0412';
    const repite = !juan && o > 1 && chance(0.03); // repitente: estuvo el ciclo pasado en el MISMO grado
    const niveles: [NonNullable<typeof c1> | null, number, string][] = [[c1, repite ? o : o - 1, repite ? 'Repitente' : 'Promovido'], [c2, (repite ? o : o - 1) - 1, 'Promovido'], [c3, (repite ? o : o - 1) - 2, 'Promovido']];
    for (const [i, [c, orden, estado]] of niveles.entries()) {
      if (!c) continue;
      const s = seccionDe(orden, a.seccion.letra, a.seccion.tandaId, juan ? 'A' : undefined);
      if (!s) continue;
      matriculas.push({ id: idMatricula(a.id, c.id), alumnoId: a.id, cicloId: c.id, seccionId: s.id, estado, fechaIngreso: c.fechaInicio, fechaRetiro: null });
      if (i === 0) c1De.set(a.id, { sec: s, orden, estado });
    }
  }
  await bulk(matriculas, d => prisma.matricula.createMany({ data: d }), 400);

  // ---------------- 2) Contratos y cargos del ciclo inmediato anterior (cobrados) ----------------
  interface Cargo { id: string; alumnoId: string; tutorId: string; cicloId: string; con: string; al: string; vence: string; monto: number; est: string; tipo: string; paid: boolean; orden: number; ym: number; key: string; ymd: string; nombre1: string; tutor: string }
  const y1 = anioInicio(c1.nombre);
  const contratos: { id: string; alumnoId: string; cicloId: string; planId: string; tipoBecaId: string | null; ctr: string; firmado: string }[] = [];
  const cargos: Cargo[] = []; let orden0 = 100_000;
  const planActivo = planes.filter(p => p.estado === 'Activo');
  for (const a of alumnos) {
    const m = c1De.get(a.id); if (!m) continue;
    const act0 = ctrAct.get(a.id), plan = (act0 && planDe.get(act0.planId)) || planActivo[0]; if (!plan) continue;
    contratos.push({ id: `ctr-${a.id}-${y1}`, alumnoId: a.id, cicloId: c1.id, planId: plan.id, tipoBecaId: (act0?.tipoBecaId === 'hermano' && chance(0.5)) || chance(0.012) ? 'hermano' : null, ctr: `CTR-${y1}-${a.id}`, firmado: `${p2(int(1, 28))}/07/${y1}` });
    const tanda = a.seccion.tanda.nombre, montos = cuotasDe(plan, tanda), vencs = mesesDe(plan, y1), al = `${a.nombres.split(' ')[0]} · ${porOrden.get(m.orden)?.nombre ?? ''} ${m.sec.letra}`;
    const mk = (id: string, con: string, vence: string, monto: number, tipo: string): Cargo => {
      const [d, mo, y] = vence.split('/').map(Number);
      return { id, alumnoId: a.id, tutorId: a.tutorId, cicloId: c1.id, con, al, vence, monto, est: 'Pendiente', tipo, paid: true, orden: orden0++, ym: y * 12 + mo - 1, key: `${a.tutorId}|${a.nombres.split(' ')[0]}`, ymd: `${y}-${p2(mo)}-${p2(d)}`, nombre1: a.nombres.split(' ')[0], tutor: a.tutorId };
    };
    cargos.push(mk(`p-${a.id}-ins`, `Reinscripción ${c1.nombre}`, `01/08/${y1}`, fin.inscripcion, 'mat'));
    vencs.forEach((v, i) => cargos.push(mk(`p-${a.id}-c${v.y}${p2(v.m)}`, `Colegiatura ${MNAME[v.m]} ${v.y}`, vencDMY(plan.dia, v.m, v.y), montos[i], 'col')));
  }
  await bulk(contratos, d => prisma.contrato.createMany({ data: d }), 400);

  // Vinculo con los recibos que el generador del ciclo activo ya creo para mayo del ciclo cerrado (lineas «Colegiatura Mayo <año>» sin cargo).
  const mayo = await prisma.finReciboItem.findMany({ where: { cobroItemId: null, concepto: { startsWith: `Colegiatura Mayo ${y1 + 1} ·` }, recibo: { cicloId: c1.id } }, select: { id: true, concepto: true, monto: true, recibo: { select: { tutorId: true } } } });
  const lineaPorClave = new Map<string, typeof mayo>();
  for (const l of mayo) { const k = `${l.recibo.tutorId}|${l.concepto.split('·').pop()!.trim()}`; lineaPorClave.set(k, [...(lineaPorClave.get(k) ?? []), l]); }
  const vinculos: { lineaId: number; cargo: Cargo }[] = [];
  for (const c of cargos) if (c.tipo === 'col' && c.con === `Colegiatura Mayo ${y1 + 1}`) { const l = lineaPorClave.get(c.key)?.shift(); if (l) { c.monto = l.monto; vinculos.push({ lineaId: l.id, cargo: c }); } }
  const vinc = new Set(vinculos.map(v => v.cargo.id));
  // Pocos saldos: la ultima cuota sin pagar de ~1.5 % de los alumnos (cartera VENCIDA del ciclo cerrado; no entra en la morosidad del activo).
  let saldos = 0;
  for (const a of new Set(cargos.map(c => c.alumnoId))) {
    if (!chance(0.017)) continue;
    const ult = [...cargos].reverse().find(c => c.alumnoId === a && c.tipo === 'col' && !vinc.has(c.id)); if (!ult) continue;
    ult.paid = false; ult.est = 'Vencida'; saldos++;
  }
  await bulk(cargos, d => prisma.finCobroItem.createMany({ data: d.map(({ ym: _a, key: _b, ymd: _c, nombre1: _d, tutor: _e, ...r }) => r) }), 250);
  for (const v of vinculos) await prisma.finReciboItem.update({ where: { id: v.lineaId }, data: { cobroItemId: v.cargo.id } });

  // ---------------- 3) Recibos de los cargos cobrados (uno por tutor y mes de pago) ----------------
  const abril30 = `${y1 + 1}-04-30`;
  const grupos = new Map<string, { tutorId: string; pago: string; lineas: { con: string; monto: number; cobroItemId: string }[] }>();
  for (const c of cargos) {
    if (!c.paid || vinc.has(c.id)) continue;
    const venc = new Date(Date.UTC(+c.ymd.slice(0, 4), +c.ymd.slice(5, 7) - 1, +c.ymd.slice(8, 10)));
    let pago = new Date(venc.getTime() - int(0, 6) * 864e5).toISOString().slice(0, 10);
    if (pago > abril30) pago = `${y1 + 1}-04-${p2(int(15, 30))}`; // cuotas de mayo en adelante pagadas por adelantado (los meses recientes ya los cubre el recaudo del ciclo activo)
    const k = `${c.tutor}|${pago.slice(0, 7)}`, g = grupos.get(k) ?? { tutorId: c.tutor, pago, lineas: [] };
    g.lineas.push({ con: `${c.con} · ${c.nombre1}`, monto: c.monto, cobroItemId: c.id }); grupos.set(k, g);
  }
  const hm = (h: number, m: number) => `${p2(h)}:${p2(m)}`;
  const nombreTutor = new Map((await prisma.tutor.findMany({ select: { id: true, nombre: true } })).map(t => [t.id, t.nombre]));
  const recibos: Prisma.FinReciboCreateManyInput[] = [], lineas: ReturnType<typeof lineasData> = [], pagos: Prisma.FinReciboPagoCreateManyInput[] = [];
  [...grupos.values()].sort((a, b) => a.pago.localeCompare(b.pago)).forEach((g, i) => {
    const id = 'REC-P' + String(i + 1).padStart(5, '0'), monto = round2(g.lineas.reduce((a, l) => a + l.monto, 0)), hh = int(8, 16), mm = int(0, 59);
    const metodo = wpick(METODO_PAGO), mixto = monto > 20000 && chance(0.25) && metodo !== 'Cheque';
    const otro = metodo === 'Efectivo' ? 'Transferencia' : 'Efectivo', parte = mixto ? round2(Math.floor(monto * 0.4 / 100) * 100) : 0;
    const filasPago = mixto ? [{ m: otro, r: refDe(otro), amt: parte }, { m: metodo, r: refDe(metodo), amt: round2(monto - parte) }] : [{ m: metodo, r: refDe(metodo), amt: monto }];
    recibos.push({
      id, ncf: 'B02' + String(70_000_000 + i + 1), tutor: nombreTutor.get(g.tutorId) ?? 'Consumidor final', tutorId: g.tutorId, cajaId, cicloId: c1.id, metodoPagoId: mixto ? null : metodoId.get(metodo) ?? null, cajeroId: cajero?.id ?? null,
      hora: hm(hh, mm), monto, abono: false, saldo: 0, change: 0, est: 'Activo', createdAt: new Date(Date.UTC(+g.pago.slice(0, 4), +g.pago.slice(5, 7) - 1, +g.pago.slice(8, 10), hh + 4, mm)),
    });
    lineas.push(...lineasData(id, g.lineas));
    filasPago.forEach((p, orden) => pagos.push({ reciboId: id, orden, metodoPagoId: metodoId.get(p.m)!, monto: p.amt, referencia: p.r }));
  });
  await bulk(recibos, d => prisma.finRecibo.createMany({ data: d }), 250);
  await bulk(lineas, d => prisma.finReciboItem.createMany({ data: d }), 400);
  await bulk(pagos, d => prisma.finReciboPago.createMany({ data: d }), 400);

  // ---------------- 4) Becas del ciclo cerrado ----------------
  const conBeca = contratos.filter(c => c.tipoBecaId === 'hermano').slice(0, 8);
  const als = new Map(alumnos.map(a => [a.id, a]));
  const becas = conBeca.map(c => { const a = als.get(c.alumnoId)!, s = c1De.get(c.alumnoId)!; return { id: `P-${c.alumnoId}`, cicloId: c1.id, alumnoId: c.alumnoId, est: a.nombres, grado: `${porOrden.get(s.orden)?.nombre ?? ''} ${s.sec.letra}`, tipoBecaId: 'hermano', modo: 'pct', valor: 10, exp: `EXP-BEC-P${c.alumnoId}`, estado: 'Aprobada', aprob: `C. Vidal · ${p2(int(1, 28))}/08/${y1}` }; });
  if (becas.length) {
    const nombres = new Map((await prisma.alumno.findMany({ where: { id: { in: becas.map(b => b.alumnoId) } }, select: { id: true, nombres: true, apellidos: true } })).map(a => [a.id, `${a.nombres} ${a.apellidos}`]));
    await prisma.finBeca.createMany({ data: becas.map(b => ({ ...b, est: nombres.get(b.alumnoId) ?? b.est })) });
    const conc = await prisma.conceptoBeca.findUnique({ where: { nombre: 'Colegiatura' } });
    if (conc) await prisma.finBecaConcepto.createMany({ data: becas.map(b => ({ becaId: b.id, conceptoId: conc.id, orden: 0 })) });
  }

  // ---------------- 5) Notas finales (4 periodos) ----------------
  const periodos = new Map<string, string>();
  for (const c of [c1, c2, c3]) if (c) for (const p of await prisma.periodoAcademico.findMany({ where: { cicloId: c.id } })) periodos.set(`${c.id}|${p.orden}`, p.id);
  type Nota = { rosterId: string; materiaId: string; periodoId: string; c1: number; c2: number; c3: number; c4: number; ex: number };
  const notas: Nota[] = [];
  const clamp = (v: number) => Math.max(40, Math.min(100, Math.round(v)));
  for (const a of alumnos) {
    const rid = rosterDe.get(a.id); if (!rid) continue;
    const base = 82 + (rand() + rand() + rand() - 1.5) * 12; // ~ N(82, 6)
    for (const [k, c] of [[1, c1], [2, c2], [3, c3]] as const) {
      if (!c) continue;
      const m = matriculas.find(x => x.alumnoId === a.id && x.cicloId === c.id); if (!m) continue;
      const juan = a.id === '0412';
      if (k > 1 && !juan) continue; // 2024–2025 y 2023–2024: menos detalle (solo el historial de la demo)
      const grado = secciones.find(s => s.id === m.seccionId)?.gradoId; const mats: string[] = (grado ? materiasDe.get(grado) : undefined) ?? [];
      mats.forEach((materiaId, mi) => {
        for (let per = 1; per <= 4; per++) {
          const periodoId = periodos.get(`${c.id}|${per}`); if (!periodoId) continue;
          if (juan) { const t = JUAN[k].tuplas[(mi + per) % 5]; notas.push({ rosterId: rid, materiaId, periodoId, c1: t[0], c2: t[1], c3: t[2], c4: t[3], ex: t[4] }); continue; }
          const b = base + (rand() - 0.5) * 8;
          notas.push({ rosterId: rid, materiaId, periodoId, c1: clamp(b + int(-4, 4)), c2: clamp(b + int(-4, 4)), c3: clamp(b + int(-4, 4)), c4: clamp(b + int(-4, 4)), ex: clamp(b + int(-6, 6)) });
        }
      });
    }
  }
  await bulk(notas, d => prisma.acadNota.createMany({ data: d }), 250);

  // ---------------- 6) Asistencia resumida del ciclo anterior ----------------
  const DIAS = [46, 44, 46, 45];
  const resumen = matriculas.filter(m => m.cicloId === c1.id).flatMap(m => DIAS.map((dias, i) => {
    const aj = int(0, 3), ai = chance(0.3) ? int(1, 3) : int(0, 1), tard = int(0, 4);
    return { matriculaId: m.id, periodoId: periodos.get(`${c1.id}|${i + 1}`)!, diasLectivos: dias, presentes: dias - aj - ai, tardanzas: tard, ausenciasJustificadas: aj, ausenciasInjustificadas: ai };
  }));
  await bulk(resumen, d => prisma.asistenciaResumen.createMany({ data: d }), 400);

  // ---------------- 7) Asignaciones y horarios del ciclo anterior (copia de los del activo) ----------------
  const asig = await prisma.acadAsignacion.findMany({ where: { cicloId: act.id }, include: { aulas: true } });
  const idNuevo = new Map(asig.map((a, i) => [a.id, `asg-${c1.id.slice(4)}-${i + 1}`]));
  await bulk(asig, d => prisma.acadAsignacion.createMany({ data: d.map(a => ({ id: idNuevo.get(a.id)!, cicloId: c1.id, docenteId: a.docenteId, seccionId: a.seccionId, materiaId: a.materiaId, heredada: a.heredada, aulaElegidaId: a.aulaElegidaId })) }), 300);
  await bulk(asig.flatMap(a => a.aulas.map(x => ({ asignacionId: idNuevo.get(a.id)!, aulaId: x.aulaId, orden: x.orden }))), d => prisma.asignacionAula.createMany({ data: d }), 400);
  const hor = await prisma.acadHorario.findMany({ where: { cicloId: act.id } });
  await bulk(hor, d => prisma.acadHorario.createMany({ data: d.map(h => ({ cicloId: c1.id, seccionId: h.seccionId, slot: h.slot, materiaId: h.materiaId })) }), 400);

  await prisma.sisConfig.create({ data: { clave: 'demoCiclos', valor: JSON.stringify({ version: 1, creado: new Date().toISOString(), matriculas: matriculas.length, contratos: contratos.length, cargos: cargos.length, saldos, recibos: recibos.length, vinculadosMayo: vinculos.length, notas: notas.length, resumenes: resumen.length, asignaciones: asig.length, horarios: hor.length }) } });
  console.log(`seed ciclos anteriores ok en ${((Date.now() - t0) / 1000).toFixed(1)}s: ${matriculas.length} matrículas, ${contratos.length} contratos, ${cargos.length} cargos (${saldos} con saldo), ${recibos.length} recibos, ${becas.length} becas, ${notas.length} notas, ${resumen.length} resúmenes de asistencia, ${asig.length} asignaciones, ${hor.length} horarios`);
}

/** quitarDemoGrande: borra los datos del ciclo anterior ligados a los alumnos generados (`ids`) y los prefijos propios (REC-P, p-, P-). */
export async function limpiarCicloAnterior(tx: Tx, ids: string[]): Promise<void> {
  const rec = { startsWith: 'REC-P' };
  await tx.finReciboItem.deleteMany({ where: { reciboId: rec } });
  await tx.finReciboPago.deleteMany({ where: { reciboId: rec } });
  await tx.mobPagoIntencionCargo.deleteMany({ where: { cobroItemId: { startsWith: 'p-' } } });
  await tx.finCobroItem.deleteMany({ where: { id: { startsWith: 'p-' } } });
  await tx.finRecibo.deleteMany({ where: { id: rec } });
  await tx.finBecaConcepto.deleteMany({ where: { becaId: { startsWith: 'P-' } } });
  await tx.finBeca.deleteMany({ where: { id: { startsWith: 'P-' } } });
  const rosters = (await tx.acadRoster.findMany({ where: { alumnoId: { in: ids } }, select: { id: true } })).map(r => r.id);
  await tx.acadNota.deleteMany({ where: { rosterId: { in: rosters } } });
  await tx.asistenciaResumen.deleteMany({ where: { matricula: { alumnoId: { in: ids } } } });
  await tx.sisConfig.deleteMany({ where: { clave: 'demoCiclos' } });
}
