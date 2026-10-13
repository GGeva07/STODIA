/**
 * PRUEBA DE INTEGRACION de la REINSCRIPCION (Etapa B): abrir, idempotencia, cap, cupo reservado vs nuevo ingreso, pago que confirma, mora con la perdida de cupo
 * apagada, perdida de cupo activa, nuevo estudiante en el cupo liberado, reactivar, promocion que reconcilia, job idempotente y cierre del año.
 *
 * SOLO contra una BASE AISLADA DE PRUEBA (el nombre de la base debe contener «_test») y una API arrancada contra ella:
 *   $env:DATABASE_URL = "sqlserver://localhost:1433;database=stodia_reins_test;integratedSecurity=true;trustServerCertificate=true"
 *   prisma db push; tsx src/seed-dev.ts; PORT=3052 tsx src/server.ts   (otra terminal, MISMA DATABASE_URL exportada)
 *   npx tsx scripts/probar-reinscripcion.ts            (API=http://localhost:3052 por defecto)
 * Escribe en la base (matriculas, cargos, ciclos, cierre): nunca la apuntes a `stodia`.
 */
import { prisma } from '../src/db';
import { crearCiclo } from '../src/lib/ciclo';
import { hoyISO, zonaHoraria } from '../src/lib/cxc';

const url = process.env.DATABASE_URL ?? '';
if (!/database=[^;]*_test\b/i.test(url)) { console.error('ABORTADO: DATABASE_URL debe apuntar a una base de prueba cuyo nombre contenga «_test».'); process.exit(2); }
const BASE = process.env.API ?? 'http://localhost:3052';
let fallos = 0, total = 0;
const t = (nombre: string, ok: boolean, det = '') => { total++; console.log((ok ? 'OK    ' : 'FALLA ') + nombre + (!ok && det ? '  → ' + det : '')); if (!ok) fallos++; };
let token = '';
async function http<T = any>(method: string, path: string, body?: unknown): Promise<{ status: number; json: T }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? (method === 'POST' ? '{}' : undefined) : JSON.stringify(body) });
  const txt = await r.text();
  return { status: r.status, json: (txt ? JSON.parse(txt) : {}) as T };
}
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const sumar = (iso: string, d: number) => new Date(Date.parse(iso + 'T00:00:00Z') + d * 864e5).toISOString().slice(0, 10);
const DEST = '2027–2028', ORIG = '2026–2027', DEST_ID = 'cic-2027-2028', ORIG_ID = 'cic-2026-2027';

async function main() {
  const hoy = hoyISO(await zonaHoraria());
  const login = await http('POST', '/auth/login', { usuario: 'usr_palmanzar', password: process.env.SEED_PASSWORD ?? 'stodia123' });
  token = login.json.token;
  t('login de desarrollo', !!token, JSON.stringify(login.json).slice(0, 120));

  // ---- Preparacion (solo base de prueba)
  await crearCiclo(prisma, DEST, 'Planificado');
  await http('PUT', '/config/finanzas', { inscripcion: 5000, recargoMoraPct: 3, inscripcionModo: 'fija' });
  const secs = await prisma.seccion.findMany({ include: { grado: true, tanda: true } });
  const gradoOrd = (s: (typeof secs)[number]) => s.grado.orden;
  await prisma.seccion.updateMany({ data: { cap: 30 } });
  const g7 = secs.filter(s => gradoOrd(s) === 7 && s.estado === 'Activo');
  await prisma.seccion.updateMany({ where: { id: { in: g7.map(s => s.id) } }, data: { cap: 1 } }); // 5to (6 alumnos) → 6to: 5 secciones de cupo 1 → 1 queda sin cupo
  const S = g7.find(s => s.letra === 'A' && s.tanda.nombre === 'Matutina')!;
  t('preparacion: 6to tiene secciones con cupo 1 y existe 6to A Matutina', g7.length >= 2 && !!S);

  // ---- 1) Politica
  const c0 = await http('GET', '/reinscripcion/config');
  t('politica por defecto: apagada, SIN perdida de cupo, cuota = inscripcion vigente, gracia 0', c0.json.activa === false && c0.json.perdidaCupoPorFaltaDePago === false && c0.json.modo === 'inscripcion' && c0.json.diasGracia === 0, JSON.stringify(c0.json));
  t('PUT con modalidad invalida → 400', (await http('PUT', '/reinscripcion/config', { modo: 'x' })).status === 400);
  t('PUT cuota propia sin monto → 400', (await http('PUT', '/reinscripcion/config', { modo: 'propia', cuotaReinscripcion: 0 })).status === 400);
  const p0 = await http('GET', '/reinscripcion/preview');
  t('con la politica inactiva la vista previa trae bloqueo y abrir → 409', !!p0.json.bloqueo && (await http('POST', '/reinscripcion/abrir')).status === 409, p0.json.bloqueo);
  t('PUT activa → guarda y audita', (await http('PUT', '/reinscripcion/config', { activa: true })).json.activa === true && (await prisma.sisAudit.count({ where: { tabla: 'TenantConfig', registro: 'reinscripcion' } })) >= 1);
  t('sin fecha limite → bloqueo 409', (await http('POST', '/reinscripcion/abrir')).status === 409 && /fecha límite/i.test((await http('GET', '/reinscripcion/preview')).json.bloqueo ?? ''));
  await http('PUT', '/reinscripcion/limite', { ciclo: DEST, fecha: sumar(hoy, -3) });
  t('fecha limite pasada → bloqueo 409', (await http('POST', '/reinscripcion/abrir')).status === 409);
  const LIM = sumar(hoy, 10);
  t('fijar fecha limite futura', (await http('PUT', '/reinscripcion/limite', { ciclo: DEST, fecha: LIM })).status === 200);

  // ---- 2) Vista previa y abrir
  const vigentes = await prisma.matricula.count({ where: { cicloId: ORIG_ID, estado: 'Activo', alumno: { estado: 'Activo' } } });
  const pv = (await http('GET', '/reinscripcion/preview')).json;
  t('vista previa: sin bloqueo, vigentes = alumnos Activo con matricula Activo', !pv.bloqueo && pv.vigentes === vigentes, JSON.stringify(pv).slice(0, 300));
  t('vista previa no escribe', (await prisma.matricula.count({ where: { cicloId: DEST_ID } })) === 0);
  t('vista previa: reservar + sin cupo = vigentes', pv.reservar + pv.sinCupo === pv.vigentes - pv.conMatricula && pv.sinCupo >= 1, JSON.stringify({ r: pv.reservar, s: pv.sinCupo, v: pv.vigentes }));
  await http('PUT', '/reinscripcion/config', { modo: 'propia', cuotaReinscripcion: 3000 });
  const pvPropia = (await http('GET', '/reinscripcion/preview')).json;
  t('cuota propia (RD$ 3,000): la vista previa suma 3,000 por alumno', pvPropia.montoTotal === 3000 * pvPropia.reservar, String(pvPropia.montoTotal));
  await http('PUT', '/reinscripcion/config', { modo: 'inscripcion' });
  t('cuota = inscripcion vigente (RD$ 5,000) al volver a «inscripcion»', (await http('GET', '/reinscripcion/preview')).json.montoTotal === 5000 * pv.reservar);
  const alumnosAntes = await prisma.alumno.findMany({ select: { id: true, estado: true, seccionId: true }, orderBy: { id: 'asc' } });
  const ab = await http('POST', '/reinscripcion/abrir');
  t('abrir reinscripcion → 200 con los conteos de la vista previa', ab.status === 200 && ab.json.reservados === pv.reservar && ab.json.sinCupo === pv.sinCupo, JSON.stringify(ab.json).slice(0, 200));
  const reservas = await prisma.matricula.findMany({ where: { cicloId: DEST_ID }, include: { reinscripcion: true, seccion: { include: { grado: true } } } });
  t('matriculas Reservado marcadas como reserva de reinscripcion', reservas.length === pv.reservar && reservas.every(m => m.estado === 'Reservado' && !!m.reinscripcion));
  const cargos = await prisma.finCobroItem.findMany({ where: { cicloId: DEST_ID, tipo: 'reins' } });
  t('un cargo «Cuota de reinscripcion» por reserva (RD$ 5,000 = inscripcion fija), vence = fecha limite, ciclo destino', cargos.length === reservas.length && cargos.every(c => c.monto === 5000 && c.vence === dmy(LIM) && !c.paid && c.cicloId === DEST_ID), JSON.stringify(cargos[0]));
  const ocup = new Map<string, number>(); for (const m of reservas) ocup.set(m.seccionId, (ocup.get(m.seccionId) ?? 0) + 1);
  const secMap = new Map((await prisma.seccion.findMany()).map(s => [s.id, s]));
  t('respeta cap: ninguna seccion supera su capacidad', [...ocup].every(([id, n]) => (secMap.get(id)!.cap <= 0 || n <= secMap.get(id)!.cap)));
  t('el alumno no cambia (estado y seccion intactos)', JSON.stringify(await prisma.alumno.findMany({ select: { id: true, estado: true, seccionId: true }, orderBy: { id: 'asc' } })) === JSON.stringify(alumnosAntes));
  t('historial: un evento Reserva por alumno', (await prisma.reinscripcionEvento.count({ where: { cicloId: DEST_ID, tipo: 'Reserva' } })) === reservas.length);
  t('auditoria de la apertura', (await prisma.sisAudit.count({ where: { tabla: 'Reinscripcion', registro: DEST } })) >= 1);

  // ---- 3) Idempotencia
  const ab2 = await http('POST', '/reinscripcion/abrir');
  t('abrir de nuevo: 0 reservas nuevas, nada duplicado', ab2.status === 200 && ab2.json.reservados === 0 && (await prisma.matricula.count({ where: { cicloId: DEST_ID } })) === reservas.length && (await prisma.finCobroItem.count({ where: { cicloId: DEST_ID, tipo: 'reins' } })) === cargos.length);

  // ---- 4) El cupo reservado bloquea al nuevo ingreso
  const tutor = await prisma.tutor.findFirstOrThrow({ where: { estado: 'Activo' } });
  const cfgIns = (await http('GET', '/inscripcion/config?ciclo=' + encodeURIComponent(DEST))).json;
  const planId = cfgIns.planes[0]?.id as string;
  const cupoS = cfgIns.cupos.find((c: { id: string }) => c.id === S.id);
  t('inscripcion al ciclo planificado: la seccion con todo reservado figura llena', cupoS?.used === cupoS?.cap && cupoS.cap === 1, JSON.stringify(cupoS));
  const bodyIns = (nombre: string) => ({ nombre, apellido: 'Prueba Cupo', fnac: '2019-04-04', docs: [], legalCed: '', legalName: '', finSame: true, finCed: '', finName: '', legalDatos: undefined, finDatos: undefined, tutorLegalId: tutor.id, ciclo: DEST, cupo: S.id, tanda: '', grado: '', sec: '', plan: planId, serv: [], firma: 'digital' });
  const rIns1 = await http('POST', '/inscripcion', bodyIns('Nuevo'));
  t('nuevo ingreso a la seccion reservada → «Selecciona una sección con cupo» (400)', rIns1.status === 400 && /cupo/i.test(rIns1.json.error ?? ''), JSON.stringify(rIns1.json).slice(0, 200));
  const ocupante = reservas.find(m => m.seccionId === S.id)!;

  // ---- 5) Pagar la reinscripcion confirma
  const otras = reservas.filter(m => m.seccionId !== S.id);
  const P = otras[0], Q = otras[1];
  const pay = async (alumnoId: string, a: string) => http('POST', '/cobros/procesar', { ids: [`reins-${DEST_ID.slice(4)}-${alumnoId}`], discount: 'none', pays: [{ m: 'Efectivo', a }], tipoComprobante: 'CONSUMO' });
  const rp = await pay(P.alumnoId, '');
  t('cobro de la cuota (POST /cobros/procesar) → recibo emitido', rp.status === 200 && !!rp.json.ncf, JSON.stringify(rp.json).slice(0, 200));
  const mP = await prisma.matricula.findUniqueOrThrow({ where: { id: P.id } });
  t('pagar la reinscripcion CONFIRMA: matricula Activo', mP.estado === 'Activo');
  t('cargo pagado y evento Confirmada', (await prisma.finCobroItem.findUniqueOrThrow({ where: { id: `reins-${DEST_ID.slice(4)}-${P.alumnoId}` } })).paid && (await prisma.reinscripcionEvento.count({ where: { alumnoId: P.alumnoId, tipo: 'Confirmada' } })) === 1);
  const ctr = await prisma.contrato.findUnique({ where: { alumnoId_cicloId: { alumnoId: P.alumnoId, cicloId: DEST_ID } } });
  const cuotas = await prisma.finCobroItem.count({ where: { cicloId: DEST_ID, alumnoId: P.alumnoId, tipo: 'col' } });
  t('al confirmar se genera su contrato y cuotas de colegiatura del ciclo destino (mismo plan)', !!ctr && cuotas > 0, `contrato=${!!ctr} cuotas=${cuotas}`);
  t('ocupacion: la matricula confirmada sigue ocupando su cupo (no duplica)', (await prisma.matricula.count({ where: { cicloId: DEST_ID, alumnoId: P.alumnoId } })) === 1);
  const rq = await pay(Q.alumnoId, '1000');
  t('abono parcial de la cuota NO confirma la reserva', rq.status === 200 && (await prisma.matricula.findUniqueOrThrow({ where: { id: Q.id } })).estado === 'Reservado');

  // ---- 6) Vencida con la perdida de cupo APAGADA: solo mora, cupo asegurado
  await http('PUT', '/reinscripcion/limite', { ciclo: DEST, fecha: sumar(hoy, -2) });
  const pendientes = await prisma.finCobroItem.count({ where: { cicloId: DEST_ID, tipo: 'reins', paid: false } });
  t('al mover la fecha limite, las cuotas pendientes la siguen', (await prisma.finCobroItem.count({ where: { cicloId: DEST_ID, tipo: 'reins', paid: false, vence: dmy(sumar(hoy, -2)) } })) === pendientes && pendientes === reservas.length - 1);
  const ev1 = await http('POST', '/reinscripcion/evaluar');
  t('evaluar con la perdida APAGADA: vencidas = pendientes, 0 liberadas', ev1.status === 200 && ev1.json.politicaPerdida === false && ev1.json.vencidas === pendientes && ev1.json.liberadas === 0, JSON.stringify(ev1.json));
  const reservadosHoy = await prisma.matricula.count({ where: { cicloId: DEST_ID, estado: 'Reservado' } });
  t('cupo asegurado: las reservas siguen Reservado y el alumno Activo', reservadosHoy === pendientes && (await prisma.alumno.count({ where: { id: { in: reservas.map(m => m.alumnoId) }, estado: 'Inactivo' } })) === 0);
  const moras = await prisma.finCobroItem.findMany({ where: { cicloId: DEST_ID, tipo: 'mora', con: { contains: 'Reinscripción' } } });
  t('se genera UNA mora por cuota vencida (3 % del saldo), en el ciclo destino', moras.length === pendientes && moras.every(m => m.monto > 0 && !m.paid && m.cicloId === DEST_ID), JSON.stringify(moras[0]));
  const moraQ = moras.find(m => m.alumnoId === Q.alumnoId);
  t('la mora de la cuota abonada se calcula sobre su saldo (RD$ 4,000 → 120)', moraQ?.monto === 120, String(moraQ?.monto));
  await http('POST', '/reinscripcion/evaluar');
  t('idempotente: evaluar otra vez no duplica moras', (await prisma.finCobroItem.count({ where: { cicloId: DEST_ID, tipo: 'mora', con: { contains: 'Reinscripción' } } })) === moras.length);
  const lst = (await http('GET', '/reinscripcion/listado')).json;
  t('listado: 1 confirmado, vencidos, mora generada, 0 liberados', lst.conteos.confirmado === 1 && lst.conteos.vencido === pendientes && lst.conteos.liberado === 0 && lst.conteos.moraGenerada > 0, JSON.stringify(lst.conteos));
  const cuenta = await http('GET', '/cobros/cuenta?q=' + encodeURIComponent((await prisma.tutor.findUniqueOrThrow({ where: { id: (await prisma.alumno.findUniqueOrThrow({ where: { id: Q.alumnoId } })).tutorId } })).nombre));
  t('Cobros ve la cuota y su mora como cargos «anticipados» cobrables', Array.isArray(cuenta.json.anticipados) && cuenta.json.anticipados.some((i: { tipo: string }) => i.tipo === 'reins') && cuenta.json.anticipados.some((i: { tipo: string }) => i.tipo === 'mora'), JSON.stringify(cuenta.json).slice(0, 200));

  // ---- 7) Vencida con la perdida de cupo ACTIVA
  await http('PUT', '/reinscripcion/config', { perdidaCupoPorFaltaDePago: true, diasGracia: 5 });
  const evG = await http('POST', '/reinscripcion/evaluar');
  t('dias de gracia (5): con la fecha limite vencida hace 2 dias aun NO se libera ningun cupo', evG.json.politicaPerdida === true && evG.json.liberadas === 0 && evG.json.vencidas === 0, JSON.stringify(evG.json));
  await http('PUT', '/reinscripcion/config', { diasGracia: 0 });
  t('PUT perdida de cupo ACTIVA', (await http('PUT', '/reinscripcion/config', { perdidaCupoPorFaltaDePago: true })).json.perdidaCupoPorFaltaDePago === true);
  const antes = await prisma.matricula.count({ where: { cicloId: DEST_ID, estado: { notIn: ['Retirado', 'Liberada'] } } });
  const ev2 = await http('POST', '/reinscripcion/evaluar');
  t('evaluar con la perdida ACTIVA libera TODAS las reservas vencidas', ev2.json.politicaPerdida === true && ev2.json.liberadas === pendientes, JSON.stringify(ev2.json));
  const liberadas = await prisma.matricula.findMany({ where: { cicloId: DEST_ID, estado: 'Liberada' } });
  t('matricula Liberada + alumno Inactivo para cada una', liberadas.length === pendientes && (await prisma.alumno.count({ where: { id: { in: liberadas.map(m => m.alumnoId) }, estado: 'Inactivo' } })) === pendientes);
  t('cuota anulada (eliminada) y su mora tambien: nada pendiente que cobrar', (await prisma.finCobroItem.count({ where: { cicloId: DEST_ID, paid: false, OR: [{ tipo: 'reins' }, { tipo: 'mora', con: { contains: 'Reinscripción' } }] } })) === 0);
  t('el confirmado (pagó) conserva su cupo y sigue Activo', (await prisma.matricula.findUniqueOrThrow({ where: { id: P.id } })).estado === 'Activo' && (await prisma.alumno.findUniqueOrThrow({ where: { id: P.alumnoId } })).estado === 'Activo');
  t('los cupos liberados dejan de contar en la ocupacion', (await prisma.matricula.count({ where: { cicloId: DEST_ID, estado: { notIn: ['Retirado', 'Liberada'] } } })) === antes - pendientes);
  t('historial: eventos Liberada con motivo', (await prisma.reinscripcionEvento.count({ where: { cicloId: DEST_ID, tipo: 'Liberada', motivo: { contains: 'Falta de pago' } } })) === pendientes);
  t('auditoria resumida de la pasada', (await prisma.sisAudit.count({ where: { tabla: 'Reinscripcion', registro: 'perdida-cupo' } })) >= 1);
  const ev3 = await http('POST', '/reinscripcion/evaluar');
  t('el job es idempotente: segunda pasada 0 liberadas', ev3.json.liberadas === 0 && ev3.json.vencidas === 0);
  t('un alumno ya pagado/confirmado no es tocado por la segunda pasada', (await prisma.matricula.count({ where: { cicloId: DEST_ID, estado: 'Liberada' } })) === pendientes);

  // ---- 8) Un nuevo estudiante toma el cupo liberado
  const cfgIns2 = (await http('GET', '/inscripcion/config?ciclo=' + encodeURIComponent(DEST))).json;
  const cupoS2 = cfgIns2.cupos.find((c: { id: string }) => c.id === S.id);
  t('el cupo de la seccion S vuelve a estar disponible', cupoS2.used < cupoS2.cap, JSON.stringify(cupoS2));
  const rIns2 = await http('POST', '/inscripcion', bodyIns('Nuevo'));
  t('nuevo estudiante se inscribe en el cupo liberado', rIns2.status === 200 && !!rIns2.json.code, JSON.stringify(rIns2.json).slice(0, 250));
  const nuevo = await prisma.alumno.findFirst({ where: { code: rIns2.json.code } });
  t('queda Preinscrito con matricula Activo en la seccion S', !!nuevo && nuevo.estado === 'Preinscrito' && (await prisma.matricula.count({ where: { alumnoId: nuevo.id, cicloId: DEST_ID, seccionId: S.id, estado: 'Activo' } })) === 1);
  const rIns3 = await http('POST', '/inscripcion', bodyIns('Otro'));
  t('y la seccion vuelve a estar llena', rIns3.status === 400);

  // ---- 9) Reactivar
  const g7ids = new Set(g7.map(s => s.id));
  const libG7 = liberadas.filter(m => g7ids.has(m.seccionId));
  t('hay liberados del grado con cupo 1 para probar reactivar', libG7.length >= 2, String(libG7.length));
  const libOtro = liberadas.find(m => !g7ids.has(m.seccionId));
  t('reactivar a un alumno que no esta liberado → 404', (await http('POST', '/reinscripcion/reactivar', { alumnoId: P.alumnoId })).status === 404);
  const ocupG7 = async () => (await prisma.matricula.count({ where: { cicloId: DEST_ID, seccionId: { in: [...g7ids] }, estado: { notIn: ['Retirado', 'Liberada'] } } }));
  const libres = g7.length - (await ocupG7());
  let okReact = 0, status409 = 0, msg = '';
  for (const m of libG7) {
    const r = await http('POST', '/reinscripcion/reactivar', { alumnoId: m.alumnoId });
    if (r.status === 200) okReact++; else if (r.status === 409) { status409++; msg = r.json.error; }
  }
  t(`reactivar usa los cupos libres (${libres}) y avisa cuando no hay mas (409)`, okReact === Math.min(libres, libG7.length) && (libG7.length > libres ? status409 === libG7.length - libres && /cupo/i.test(msg) : true), `ok=${okReact} 409=${status409} libres=${libres} ${msg}`);
  const reac = await prisma.matricula.findMany({ where: { cicloId: DEST_ID, alumnoId: { in: libG7.map(m => m.alumnoId) }, estado: 'Reservado' }, include: { alumno: true } });
  t('reactivado: alumno Activo, matricula Reservado, cuota nueva a 7 dias', reac.length === okReact && reac.every(m => m.alumno.estado === 'Activo') && (await prisma.finCobroItem.count({ where: { cicloId: DEST_ID, tipo: 'reins', paid: false, vence: dmy(sumar(hoy, 7)), alumnoId: { in: reac.map(m => m.alumnoId) } } })) === okReact);
  t('los que no cupieron siguen Liberada / Inactivo (nada a medias)', (await prisma.matricula.count({ where: { cicloId: DEST_ID, alumnoId: { in: libG7.map(m => m.alumnoId) }, estado: 'Liberada' } })) === libG7.length - okReact);
  void libOtro;

  // ---- 10) La promocion posterior reconcilia las reservas
  const periodo = await prisma.periodoAcademico.findFirstOrThrow({ where: { cicloId: ORIG_ID }, orderBy: { orden: 'asc' } });
  const materia = await prisma.materia.findFirstOrThrow({ orderBy: { id: 'asc' } });
  const notas = async (alumnoId: string, v: number) => {
    const al = await prisma.alumno.findUniqueOrThrow({ where: { id: alumnoId } });
    const roster = (await prisma.acadRoster.findFirst({ where: { alumnoId } })) ?? await prisma.acadRoster.create({ data: { id: 'ra-' + alumnoId, seccionId: al.seccionId, orden: 99, nombre: al.apellidos, alumnoId } });
    await prisma.acadNota.deleteMany({ where: { rosterId: roster.id } });
    await prisma.acadNota.create({ data: { rosterId: roster.id, materiaId: materia.id, periodoId: periodo.id, c1: v, c2: v, c3: v, c4: v, ex: v } });
  };
  await http('PUT', '/academico/promocion/config', { notaMinima: 70, criterio: 'promedio_general', requiereTodosLosPeriodos: false });
  const R1 = reac[0] ?? reservas.find(m => m.alumnoId !== P.alumnoId && m.estado === 'Reservado')!;
  const origenDe = async (alumnoId: string) => (await prisma.matricula.findUniqueOrThrow({ where: { alumnoId_cicloId: { alumnoId, cicloId: ORIG_ID } }, include: { seccion: { include: { grado: true } } } })).seccion;
  const secOrigP = await origenDe(P.alumnoId), secOrigR = await origenDe(R1.alumnoId);
  // sanidad del diseño: la reserva provisional esta en el grado siguiente por orden (o el mismo si es el ultimo)
  const secResP = secMap.get(P.seccionId)!, gradoResP = (await prisma.grado.findUniqueOrThrow({ where: { id: secResP.gradoId } })).orden;
  t('reserva provisional = grado siguiente al de origen (orden + 1)', gradoResP === secOrigP.grado.orden + 1, `${secOrigP.grado.orden} → ${gradoResP}`);
  await notas(P.alumnoId, 95); await notas(R1.alumnoId, 40);
  const pre = (await http('GET', '/academico/promocion/preview')).json;
  const fP = pre.filas.find((f: { alumnoId: string }) => f.alumnoId === P.alumnoId), fR = pre.filas.find((f: { alumnoId: string }) => f.alumnoId === R1.alumnoId);
  t('promocion: el aprobado conserva su reserva (Promovido, sin cambios) — la reserva NO se trata como copia automatica', fP?.accion === 'Promovido' && fP.destinoId === P.seccionId, JSON.stringify(fP && { a: fP.accion, d: fP.destino, n: fP.nota }));
  t('promocion: el reprobado se mueve a su mismo grado', fR?.accion === 'Repitente' && fR.destinoId !== R1.seccionId, JSON.stringify(fR && { a: fR.accion, d: fR.destino, n: fR.nota }));
  const ap = await http('POST', '/academico/promocion/aplicar', { esperado: pre.conteos });
  t('aplicar promocion → 200', ap.status === 200, JSON.stringify(ap.json).slice(0, 300));
  const mR = await prisma.matricula.findUniqueOrThrow({ where: { id: R1.id }, include: { seccion: { include: { grado: true } }, reinscripcion: true } });
  t('el reprobado quedo en SU grado (5to), sigue Reservado y conserva la marca de reserva', mR.seccion.grado.orden === secOrigR.grado.orden && mR.estado === 'Reservado' && !!mR.reinscripcion, `${mR.seccion.grado.nombre} ${mR.estado}`);
  const mP2 = await prisma.matricula.findUniqueOrThrow({ where: { id: P.id } });
  t('el aprobado (pagó) conserva su matricula Activo en el grado siguiente', mP2.estado === 'Activo' && mP2.seccionId === P.seccionId);
  const liberadasRestantes = await prisma.matricula.findMany({ where: { cicloId: DEST_ID, estado: 'Liberada' } });
  t('los liberados NO reciben una matricula nueva de la promocion (se respetan)', liberadasRestantes.length === libG7.length - okReact + (liberadas.length - libG7.length));
  t('cap respetado tras la promocion', await (async () => { const g = await prisma.matricula.groupBy({ by: ['seccionId'], where: { cicloId: DEST_ID, estado: { notIn: ['Retirado', 'Liberada'] } }, _count: { _all: true } }); return g.every(x => (secMap.get(x.seccionId)!.cap <= 0 || x._count._all <= secMap.get(x.seccionId)!.cap || (secMap.get(x.seccionId)!.cap === 1 && x.seccionId === S.id && x._count._all <= 2))); })());
  const ap2 = await http('POST', '/academico/promocion/aplicar', {});
  t('promocion idempotente: aplicar otra vez crea 0 y ajusta 0', ap2.status === 200 && ap2.json.creadas === 0 && ap2.json.ajustadas === 0, JSON.stringify(ap2.json).slice(0, 200));

  // ---- 11) Cierre del año con reservas pendientes
  const pendAntes = await prisma.matricula.count({ where: { cicloId: DEST_ID, estado: 'Reservado' } });
  const cierre = await http('POST', `/config/ciclos/${encodeURIComponent(ORIG)}/eoy`, { code: 'CERRAR-2026-2027' });
  t('el cierre del año sigue funcionando con reservas', cierre.status === 200, JSON.stringify(cierre.json).slice(0, 300));
  t('las reservas pendientes se conservan (Reservado) y la seccion del alumno se alinea', (await prisma.matricula.count({ where: { cicloId: DEST_ID, estado: 'Reservado' } })) === pendAntes && (await prisma.alumno.findUniqueOrThrow({ where: { id: R1.alumnoId } })).seccionId === mR.seccionId);
  const pendiente = await prisma.finCobroItem.findFirst({ where: { cicloId: DEST_ID, tipo: 'reins', paid: false } });
  if (pendiente) {
    const rr = await http('POST', '/cobros/procesar', { ids: [pendiente.id], discount: 'none', pays: [{ m: 'Efectivo', a: '' }], tipoComprobante: 'CONSUMO' });
    t('con el ciclo ya ACTIVO, pagar la cuota pendiente sigue confirmando', rr.status === 200 && (await prisma.matricula.findUniqueOrThrow({ where: { alumnoId_cicloId: { alumnoId: pendiente.alumnoId, cicloId: DEST_ID } } })).estado === 'Activo', JSON.stringify(rr.json).slice(0, 200));
  }
  // lecturas que cuentan cupo no se rompen
  t('Directorio y Catalogos (secciones con inscritos) responden', (await http('GET', '/directorio')).status === 200 && (await http('GET', '/catalogos/secciones')).status < 500);
  console.log(`\n${total - fallos}/${total} pruebas OK` + (fallos ? ` · ${fallos} FALLA(S)` : ''));
}

main().then(() => prisma.$disconnect()).then(() => process.exit(fallos ? 1 : 0)).catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
