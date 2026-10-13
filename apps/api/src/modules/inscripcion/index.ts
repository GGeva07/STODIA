import type { FastifyPluginAsync } from 'fastify';
import type { ExpFicha, InsConfigResp, InsContratoTutor, InsCupo, InsReq, InsResp, InsTutorBusq, InsTutoresResp, InsTutorLookup } from '@stodia/shared';
import { prisma } from '../../db';
import { audit } from '../../lib/audit';
import { FiscalError, asignarNcf, contextoFiscal, disponibilidad, refrescarEstados, enSerie, transaccionFiscal } from '../../lib/fiscal';
import { digits } from '../../lib/personas';
import { errorTutor, fmtCed, fmtTel, unirTipo, type TutorCampos } from '../../lib/tutor-datos';
import { cxcResumen, partesEnZona, zonaHoraria } from '../../lib/cxc';
import { MES_ES, MNAME, anioDeMes, catalogoServicios, cicloDestino, cuotasDe, docsRequeridos, getFinanzas, inscripcionDe, insPlan, materialesDe, mesesCiclo, mesesDe, moraTxt, planesPago, tiposDocumentoRequeridos, totalDe, vencDMY } from '../../lib/pers-fin';
import { fkDeCatKey } from '../../lib/servicios';
import { idMatricula } from '../../lib/matricula';
import { vinculosDeseados } from '../../lib/tutor-alumno';
import { ESTADOS_SIN_CUPO, sinLiberarEn } from '../../lib/reinscripcion';

const slug = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_');

type TutorRowDb = NonNullable<Awaited<ReturnType<typeof prisma.tutor.findFirst>>>;

async function lookup(ced: string): Promise<InsTutorLookup & { tel?: string; row?: TutorRowDb }> {
  const d = digits(ced ?? '');
  if (d.length < 11) return { found: false };
  const t = await prisma.tutor.findUnique({ where: { cedula: d } });
  if (!t) return { found: false };
  const [fin, legal] = await Promise.all([prisma.alumno.count({ where: { tutorId: t.id } }), prisma.alumno.count({ where: { tutorLegalId: t.id } })]);
  const info = fin ? `tutor financiero de ${fin} alumno${fin === 1 ? '' : 's'}` : legal ? `tutor${t.parentesco === 'Madre' ? 'a' : ''} legal de ${legal} alumno${legal === 1 ? '' : 's'}` : 'sin alumnos vinculados';
  return { found: true, id: t.id, nombre: t.nombre, info, tel: t.tel, row: t, datos: { parentesco: t.parentesco, tel: t.tel, email: t.email ?? '', rnc: t.rnc ?? '' } };
}

/** Tutor ya registrado elegido en el buscador (por id). Error: 404 si no existe, 409 si está inactivo. */
async function porId(id: string, rol: string): Promise<{ look: InsTutorLookup & { row: TutorRowDb } } | { code: 404 | 409; error: string }> {
  const t = await prisma.tutor.findUnique({ where: { id } });
  if (!t) return { code: 404, error: `${rol}: el tutor seleccionado no existe` };
  if (t.estado !== 'Activo') return { code: 409, error: `${rol}: ${t.nombre} está inactivo y no se puede vincular; reactívalo en Tutores o elige otro` };
  return { look: { found: true, id: t.id, nombre: t.nombre, row: t, datos: { parentesco: t.parentesco, tel: t.tel, email: t.email ?? '', rnc: t.rnc ?? '' } } };
}
/** Tipo de beca de hermanos del catálogo: prefiere «Plan Hermano»; si no, cualquiera activo que diga «Hermano». */
const tipoHermano = async () => (await prisma.tipoBeca.findFirst({ where: { estado: 'Activo', nombre: { contains: 'Plan Hermano' } }, orderBy: { id: 'asc' } })) ?? prisma.tipoBeca.findFirst({ where: { estado: 'Activo', nombre: { contains: 'Hermano' } }, orderBy: { id: 'asc' } });
const normTxt = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Grados, tandas y secciones salen de las tablas tipadas (Catálogos). Inscritos = alumnos reales de la sección (se calcula con Alumno.seccionId). */
/** Cupos del ciclo DESTINO: en el activo se cuentan los alumnos de cada seccion (sin pre-inscritos ni cupos liberados); en un ciclo planificado, las MATRICULAS de ese ciclo
 *  (incluye las reservas de reinscripcion 'Reservado'; no cuentan Retirado / Liberada). */
async function cargarCupos(dest?: { id: string | null; planificado: boolean }) {
  const activoId = dest?.planificado ? null : (await prisma.ciclo.findFirst({ where: { estado: 'Activo' }, select: { id: true } }))?.id ?? null;
  const [gr, td, secs, cuenta] = await Promise.all([
    prisma.grado.findMany({ include: { nivel: true }, orderBy: { id: 'asc' } }),
    prisma.tanda.findMany({ orderBy: { id: 'asc' } }),
    prisma.seccion.findMany({ where: { estado: 'Activo' }, orderBy: { id: 'asc' } }),
    dest?.planificado
      ? prisma.matricula.groupBy({ by: ['seccionId'], where: { cicloId: dest.id!, estado: { notIn: ESTADOS_SIN_CUPO } }, _count: { _all: true } })
      : prisma.alumno.groupBy({ by: ['seccionId'], where: { estado: { notIn: ['Retirado', 'Preinscrito'] }, ...(activoId ? sinLiberarEn(activoId) : {}) }, _count: { _all: true } }),
  ]);
  const usados = new Map(cuenta.map(c => [c.seccionId, c._count._all]));
  const grados = gr.filter(g => g.estado === 'Activo').sort((a, b) => a.orden - b.orden).map(g => ({ id: g.id, label: `${g.nivel.nombre} · ${g.nombre}` }));
  const tandas = td.filter(t => t.estado === 'Activo').map(t => t.nombre);
  const cupos: InsCupo[] = [];
  for (const s of secs) {
    const g = gr.find(x => x.id === s.gradoId && x.estado === 'Activo'), t = td.find(x => x.id === s.tandaId && x.estado === 'Activo');
    if (!g || !t) continue;
    cupos.push({ id: s.id, grado: g.id, tanda: t.nombre, seccion: s.letra, cap: s.cap || 0, used: usados.get(s.id) ?? 0 });
  }
  return { grados, tandas, cupos, gradoNombre: (id: string) => gr.find(g => g.id === id)?.nombre ?? '' };
}

const plugin: FastifyPluginAsync = async app => {
  const guard = { onRequest: [app.authenticate, app.requireRole('Super Admin', 'Cajero')] };

  /** `?ciclo=` = ciclo destino (activo por defecto; un ciclo PLANIFICADO = inscripcion anticipada). Un ciclo cerrado o inexistente cae al activo. */
  app.get<{ Querystring: { ciclo?: string } }>('/config', guard, async (req): Promise<InsConfigResp> => {
    const d0 = await cicloDestino(req.query.ciclo), dest = 'error' in d0 ? await cicloDestino() : d0;
    if ('error' in dest) throw new Error(dest.error);
    const anticipada = dest.estado === 'Planificado';
    const [c, planes, fin, cat, docs, ciclosAll] = await Promise.all([cargarCupos({ id: dest.info.id, planificado: anticipada }), planesPago(), getFinanzas(), catalogoServicios(), docsRequeridos(), prisma.ciclo.findMany({ where: { estado: { in: ['Activo', 'Planificado'] } }, orderBy: { fechaInicio: 'asc' } })]);
    const ciclo = dest.info;
    const activos = planes.filter(p => p.estado === 'Activo');
    const avisos: string[] = [];
    if (!activos.length) avisos.push('Configura planes y precios: no hay Planes de Pago activos (Finanzas → Planes de Pago).');
    if (!ciclo.configurado) avisos.push('Configura el ciclo lectivo activo en Configuración.');
    if (anticipada) avisos.push(`Inscripción anticipada: el alumno queda matriculado en el ciclo planificado ${ciclo.nombre} (pre-inscrito) y sus cargos se generan en ese ciclo; el ciclo activo no cambia.`);
    if (fin.inscripcionModo === 'plan') {
      const sin = activos.filter(p => inscripcionDe(p, fin).origen === 'respaldo').map(p => p.name);
      if (sin.length) avisos.push(`Inscripción según el plan: ${sin.length === 1 ? 'el plan' : 'los planes'} «${sin.join('», «')}» no ${sin.length === 1 ? 'tiene' : 'tienen'} cuota de inscripción; se usa la cuota fija (RD$ ${fin.inscripcion.toFixed(2)}) como respaldo.`);
    }
    if (!c.grados.length || !c.tandas.length) avisos.push('Configura grados y tandas en Catálogos.');
    else if (!c.cupos.length) avisos.push('Configura las secciones (con su capacidad) en Catálogos.');
    return {
      cupos: c.cupos, docs, ciclo: ciclo.nombre, anticipada, ciclosDestino: ciclosAll.map(x => ({ n: x.nombre, estado: x.estado as 'Activo' | 'Planificado' })), grados: c.grados, tandas: c.tandas,
      planes: activos.map(p => insPlan(p, c.tandas, fin, ciclo.y0)),
      inscripcion: fin.inscripcion, inscripcionModo: fin.inscripcionModo === 'plan' ? 'plan' : 'fija',
      servicios: cat.filter(s => s.rec).map(s => ({ k: s.k, n: s.l, price: s.price })),
      avisos,
    };
  });

  /**
   * Buscador de tutores existentes (para inscribir otro hijo a una familia). Por nombre, cédula (con o sin guiones), teléfono, correo o nombre de un hijo.
   * Devuelve lo mínimo (máx. 10 por página): contacto, hijos no retirados con su sección vigente y RD$ vencidos (lib/cxc, ciclo activo). Los inactivos
   * salen con `disponible: false`.
   */
  app.get<{ Querystring: { q?: string; page?: string } }>('/tutores', guard, async (req): Promise<InsTutoresResp> => {
    const q = (req.query.q ?? '').trim().slice(0, 80), nq = normTxt(q), nd = digits(q), size = 10;
    const [tipoHerm, tutores, alumnos] = await Promise.all([
      tipoHermano(),
      prisma.tutor.findMany({ select: { id: true, nombre: true, cedula: true, tel: true, email: true, parentesco: true, rnc: true, tipo: true, estado: true }, orderBy: { nombre: 'asc' } }),
      prisma.alumno.findMany({ where: { estado: { not: 'Retirado' } }, select: { id: true, nombres: true, apellidos: true, tutorId: true, tutorLegalId: true, seccion: { select: { letra: true, grado: { select: { nombre: true } } } } } }),
    ]);
    const becaHermano = tipoHerm ? { id: tipoHerm.id, nombre: tipoHerm.nombre.trim(), pct: tipoHerm.pct } : null;
    if (nq.length < 2 && nd.length < 3) { return { rows: [], page: 1, size, total: 0, hayMas: false, becaHermano }; }
    const hijosDe = new Map<string, { id: string; nombre: string; seccion: string; fin: boolean }[]>();
    for (const a of alumnos) {
      const h = { id: a.id, nombre: `${a.nombres} ${a.apellidos}`, seccion: `${a.seccion.grado.nombre} ${a.seccion.letra}` };
      for (const [tid, fin] of [[a.tutorId, true], [a.tutorLegalId, false]] as const) {
        if (!tid) continue;
        const arr = hijosDe.get(tid) ?? [];
        const x = arr.find(y => y.id === h.id);
        if (x) x.fin ||= fin; else arr.push({ ...h, fin });
        hijosDe.set(tid, arr);
      }
    }
    const tokens = nq.split(/\s+/).filter(Boolean), soloDig = /^[\d\s-]+$/.test(q);
    const hit = tutores.filter(t => {
      if (nd.length >= 3 && (digits(t.cedula).includes(nd) || digits(t.tel).includes(nd))) return true;
      if (soloDig) return false;
      const hay = normTxt([t.nombre, t.email, ...(hijosDe.get(t.id) ?? []).map(h => h.nombre)].join(' '));
      return tokens.every(k => hay.includes(k));
    });
    const page = Math.max(1, Math.min(Math.ceil(hit.length / size) || 1, Number(req.query.page) || 1)), pag = hit.slice((page - 1) * size, page * size);
    const finIds = pag.flatMap(t => (hijosDe.get(t.id) ?? []).filter(h => h.fin).map(h => h.id));
    const cx = finIds.length ? await cxcResumen(finIds) : null;
    const rows: InsTutorBusq[] = pag.map(t => {
      const hs = (hijosDe.get(t.id) ?? []).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      const vencido = Math.round(hs.filter(h => h.fin).reduce((x, h) => x + (cx?.vencidoPorAlumno.get(h.id) ?? 0), 0) * 100) / 100;
      return { id: t.id, nombre: t.nombre, cedula: fmtCed(t.cedula), tel: t.tel, email: t.email ?? '', parentesco: t.parentesco, rnc: t.rnc ?? '', tipo: t.tipo, hijos: hs.map(h => ({ nombre: h.nombre, seccion: h.seccion })), vencido, disponible: t.estado === 'Activo' };
    });
    return { rows, page, size, total: hit.length, hayMas: page * size < hit.length, becaHermano };
  });

  // Consulta de duplicados por documento de identidad.
  app.post<{ Body: { ced?: string } }>('/tutor', guard, async req => {
    const { tel: _tel, row: _row, ...res } = await lookup(req.body?.ced ?? '');
    return res satisfies InsTutorLookup;
  });

  app.post<{ Body: InsReq }>('/', guard, (req, reply) => enSerie(async () => {
    const b = req.body;
    const fail = (error: string) => reply.code(400).send({ error });
    if (!b?.nombre?.trim() || !b.apellido?.trim() || !b.fnac) return fail('Completa nombres, apellidos y fecha de nacimiento');

    const dest = await cicloDestino(b.ciclo);
    if ('error' in dest) return reply.code(dest.code).send({ error: dest.error });
    const ciclo = dest.info, anticipada = dest.estado === 'Planificado';
    const [planes, fin, cat, DOCS, c] = await Promise.all([planesPago(), getFinanzas(), catalogoServicios(), tiposDocumentoRequeridos(), cargarCupos({ id: ciclo.id, planificado: anticipada })]);
    if (!ciclo.id) return fail('Configura el ciclo lectivo activo en Configuración antes de inscribir');
    const plan = planes.find(p => p.id === b.plan && p.estado === 'Activo');
    if (!plan) return fail(planes.some(p => p.estado === 'Activo') ? 'Plan de pago inválido' : 'Configura planes y precios antes de inscribir (Finanzas → Planes de Pago)');

    // Tutor existente elegido en el buscador (por id) o, como antes, por cédula + datos.
    const err = (code: number, error: string) => reply.code(code).send({ error });
    let L: InsTutorLookup & { row?: TutorRowDb }, F: InsTutorLookup & { row?: TutorRowDb };
    if (b.tutorLegalId) { const r = await porId(String(b.tutorLegalId), 'Tutor legal'); if ('error' in r) return err(r.code, r.error); L = r.look; } else L = await lookup(b.legalCed);
    if (b.finSame) F = L;
    else if (b.tutorFinancieroId) { const r = await porId(String(b.tutorFinancieroId), 'Tutor financiero'); if ('error' in r) return err(r.code, r.error); F = r.look; } else F = await lookup(b.finCed);
    for (const [rol, x] of [['Tutor legal', L], ['Tutor financiero', F]] as const) if (x.row && x.row.estado !== 'Activo') return err(409, `${rol}: ${x.row.nombre} está inactivo y no se puede vincular; reactívalo en Tutores o elige otro`);
    const legalName = L.found ? L.nombre! : b.legalName?.trim();
    const finName = b.finSame ? legalName : F.found ? F.nombre! : b.finName?.trim();
    if (!legalName || !finName) return fail('Identifica al tutor legal y financiero');
    if (!b.finSame && ((L.found && F.found && L.id === F.id) || (!(L.found && F.found) && digits(b.legalCed) === digits(b.finCed)))) return fail('El tutor legal y el financiero tienen la misma cédula: marca que son la misma persona');

    // Datos de contacto de cada tutor: mismos campos y validaciones que la pantalla Tutores. Se validan TODOS antes de escribir nada.
    const campos = (rol: string, look: InsTutorLookup & { row?: TutorRowDb }, name: string, ced: string, d: InsReq['legalDatos'] | undefined, tipo: string): { v: TutorCampos } | { err: string } => {
      const s = (x: unknown) => (typeof x === 'string' ? x.trim() : '');
      // Tutor existente sin datos en la petición: se conservan los guardados (la petición puede editarlos).
      const dd = d ?? look.datos;
      const v: TutorCampos = {
        nombre: look.found ? look.nombre! : name, cedula: look.row ? look.row.cedula : fmtCed(ced), parentesco: s(dd?.parentesco), tipo: look.row ? unirTipo(look.row.tipo, tipo) : tipo,
        tel: fmtTel(s(dd?.tel)), email: s(dd?.email).toLowerCase(), rnc: s(dd?.rnc),
      };
      const e = errorTutor(v);
      return e ? { err: `${rol}: ${e}` } : { v };
    };
    const cl = campos('Tutor legal', L, legalName, b.legalCed, b.legalDatos, b.finSame ? 'Financiero y académico' : 'Académico');
    if ('err' in cl) return fail(cl.err);
    const cf = b.finSame ? cl : campos('Tutor financiero', F, finName, b.finCed, b.finDatos, 'Financiero');
    if ('err' in cf) return fail(cf.err);

    const alergiasIds = [...new Set((b.alergias ?? []).map(String))];
    if (alergiasIds.length && (await prisma.alergia.count({ where: { id: { in: alergiasIds }, estado: 'Activo' } })) !== alergiasIds.length) return fail('Alguna alergia no existe en el catálogo de alergias');
    const cupo = c.cupos.find(x => x.id === b.cupo);
    if (!cupo || cupo.used >= cupo.cap) return fail('Selecciona una sección con cupo');
    const grado = c.gradoNombre(cupo.grado), sec = cupo.seccion, tanda = cupo.tanda;
    if (totalDe(plan, tanda) <= 0) return fail(`El plan ${plan.name} no tiene monto definido para la tanda ${tanda}`);

    // Beca Plan Hermano (opcional): solo si la familia ya tiene hijos. Queda PENDIENTE de aprobación (flujo normal de Becas); no se aprueba ni se aplica nada aquí.
    let hermano: { tipoId: string; pct: number; conceptoId: string; nombre: string; familia: number } | null = null;
    if (b.becaHermano) {
      const tutoresIds = [...new Set([L.id, F.id].filter((x): x is string => !!x))]; // tutores nuevos (sin id) no tienen familia
      const familia = await prisma.alumno.count({ where: { estado: { not: 'Retirado' }, OR: [{ tutorId: { in: tutoresIds } }, { tutorLegalId: { in: tutoresIds } }] } });
      if (!familia) return fail('La beca Plan Hermano requiere que la familia ya tenga al menos un hijo inscrito');
      const [tipo, conc] = await Promise.all([tipoHermano(), prisma.conceptoBeca.findFirst({ where: { estado: 'Activo', nombre: 'Colegiatura' } })]);
      if (!tipo) return fail('No existe un tipo de beca de hermanos activo en el catálogo de becas');
      if (!conc) return fail('Falta el concepto de beca «Colegiatura» en el catálogo de conceptos de beca');
      hermano = { tipoId: tipo.id, pct: tipo.pct, conceptoId: conc.id, nombre: tipo.nombre.trim(), familia };
    }

    // Tutores: vincula los existentes o crea los nuevos (sin duplicar por cédula).
    const all = await prisma.tutor.findMany({ select: { id: true } });
    let seq = Math.max(0, ...all.map(t => Number(t.id.replace(/\D/g, '')) || 0));
    const resolve = async (l: InsTutorLookup & { row?: TutorRowDb }, v: TutorCampos) => {
      const datos = { parentesco: v.parentesco, tipo: v.tipo, tel: v.tel, email: v.email || null, rnc: v.rnc || null };
      if (l.row) { // tutor existente: se reutiliza y se actualizan sus datos si cambiaron (queda en Auditoría)
        const prev = l.row;
        const t = await prisma.tutor.update({ where: { id: prev.id }, data: datos });
        for (const k of ['parentesco', 'tipo', 'tel', 'email', 'rnc'] as const) { const x = String(prev[k] ?? ''), y = String(t[k] ?? ''); if (x !== y) await audit(req.user, 'Update', { tabla: 'Tutores', id: `${fmtCed(t.cedula)}/${k}`, prev: x || '—', next: y || '—', ip: req.ip }); }
        return t.id;
      }
      const id = 'u' + ++seq;
      await prisma.tutor.create({ data: { id, nombre: v.nombre, cedula: digits(v.cedula), ...datos } });
      await audit(req.user, 'Insert', { tabla: 'Tutores', id: v.cedula, prev: '—', next: `${v.nombre} · ${v.tipo}`, ip: req.ip });
      return id;
    };
    const legalId = await resolve(L, cl.v);
    const finId = b.finSame ? legalId : await resolve(F, cf.v);
    const finTutor = await prisma.tutor.findUniqueOrThrow({ where: { id: finId } });
    const legalTutor = legalId === finId ? finTutor : await prisma.tutor.findUniqueOrThrow({ where: { id: legalId } });

    const ids = (await prisma.alumno.findMany({ select: { id: true } })).map(a => Number(a.id) || 0);
    const id = String(Math.max(...ids, 0) + 1).padStart(4, '0');
    const code = `EST-${ciclo.y0}-${id}`;
    const becaId = `bec-ins-${id}`;
    const tz = await zonaHoraria();
    const hoyP = partesEnZona(tz);
    const hoy = `${String(hoyP.d).padStart(2, '0')}/${String(hoyP.m).padStart(2, '0')}/${hoyP.y}`;
    const hoyIso = `${hoyP.y}-${String(hoyP.m).padStart(2, '0')}-${String(hoyP.d).padStart(2, '0')}`;
    const mesNom = MES_ES[hoyP.m - 1];

    // El contrato y el tutor legal tienen tabla/columna propia (Contrato, Alumno.tutorLegalId): no se duplican en el JSON de la ficha.
    const ficha: Omit<ExpFicha, 'contrato' | 'tutorLegalId'> = {
      carnet: '', ingreso: `${mesNom[0].toUpperCase()}${mesNom.slice(1)} ${hoyP.y} · ${grado} ${sec}`, geo: '',
      medico: { sangre: '', seguro: '', poliza: '', condiciones: '', planAlim: '', planAlimExtra: '', emergenciaNombre: '', emergenciaTel: finTutor.tel, alertaDetalle: '' },
      conducta: { obs: [], record: 'Sin observaciones' }, hist: [],
    };

    // Cartera: cuotas del plan real (montos por tanda, descuento y meses del plan) + servicios desde el mes actual hasta fin de ciclo.
    const montos = cuotasDe(plan, tanda), vencs = mesesDe(plan, ciclo.y0);
    const unico = plan.n === 1;
    const insMonto = inscripcionDe(plan, fin).monto; // fija → global; plan → la del plan (respaldo: global)
    const materiales = materialesDe(plan);           // 0 si el check del plan esta apagado
    const factura = insMonto + (unico ? totalDe(plan, tanda) : 0);
    await refrescarEstados();
    const dispNcf = (await disponibilidad(prisma, ['CONSUMO']))[0];
    if (!dispNcf.disponible) throw new FiscalError(409, dispNcf.motivo!);
    const ctxFiscal = await contextoFiscal('CONSUMO');
    const meses = mesesCiclo(planes), idxHoy = anticipada ? 0 : Math.max(0, meses.indexOf(hoyP.m)); // ciclo planificado: los servicios cargan desde el primer mes del ciclo
    const dia = fin.diaCorte > 0 ? fin.diaCorte : 1;
    const venc = (m: number) => vencDMY(dia, m, anioDeMes(meses, ciclo.y0, m));
    const al = `${b.nombre.trim().split(' ')[0]} · ${grado} ${sec}`;
    const base = 2000 + (await prisma.finCobroItem.count());
    const svc = cat.filter(s => s.rec && b.serv?.includes(s.k));
    const sname = (l: string) => l.split(' · ').pop()!;
    const svcId = (k: string) => `psv-${k.replace(/\W/g, '')}-${id}`;

    // Alta + factura de inscripcion en UNA transaccion; el NCF (B02 / E32 segun la modalidad configurada) sale de SecuenciaFiscal dentro de ella: si algo falla, el numero se revierte.
    let ncf = '';
    await transaccionFiscal(async tx => {
      ncf = (await asignarNcf(tx, 'CONSUMO', ctxFiscal)).ncf;
      for (const op of [
      tx.alumno.create({
        data: { id, code, nombres: b.nombre.trim(), apellidos: b.apellido.trim(), fnac: b.fnac, seccionId: cupo.id, cuenta: 'ok', estado: anticipada ? 'Preinscrito' : 'Activo', tel: finTutor.tel, tutorId: finId, tutorLegalId: legalId },
      }),
      tx.alumnoAlergia.createMany({ data: alergiasIds.map(alergiaId => ({ alumnoId: id, alergiaId })) }),
      tx.persExpediente.create({ data: { alumnoId: id, data: JSON.stringify(ficha) } }),
      tx.persDocumento.createMany({
        data: DOCS.map((t, i) => ({ id: `pdoc-${id}-${i}`, alumnoId: id, tipoId: t.id, f: b.docs?.[i] ? 'recibido_' + slug(t.nombre) + '.pdf' : 'Sin archivo', est: b.docs?.[i] ? 'En revisión' : 'Pendiente', orden: i })),
      }),
      tx.servicioAlumno.createMany({
        data: svc.map(s => ({ id: svcId(s.k), alumnoId: id, kind: 'rec', ...fkDeCatKey(s.k)!, name: sname(s.l), icon: s.icon, spec: s.spec, cost: s.price, corte: `Día ${String(dia).padStart(2, '0')} de cada mes` })),
      }),
      tx.finCobroItem.createMany({
        data: [
          ...vencs.map((v, i) => ({ id: `ins-${id}-c${v.m}`, alumnoId: id, tutorId: finId, cicloId: ciclo.id!, con: `Colegiatura ${MNAME[v.m]} ${v.y}`, al, vence: vencDMY(plan.dia, v.m, v.y), monto: montos[i], est: 'Pendiente', tipo: 'col', orden: base + i })),
          // Cuota de materiales: UN cargo aparte (tipo 'mat': sin pronto pago ni mora, que solo miran 'col'/'srv') en el primer vencimiento del plan.
          ...(materiales > 0 ? [{ id: `ins-${id}-mat`, alumnoId: id, tutorId: finId, cicloId: ciclo.id!, con: 'Cuota de materiales', al, vence: vencDMY(plan.dia, vencs[0].m, vencs[0].y), monto: materiales, est: 'Pendiente', tipo: 'mat', orden: base + 50 }] : []),
          ...svc.flatMap((s, j) => meses.slice(idxHoy).map((m, i) => ({ id: `ins-${id}-${s.k.replace(/\W/g, '')}${m}`, alumnoId: id, tutorId: finId, servicioId: svcId(s.k), cicloId: ciclo.id!, con: `${sname(s.l)} · ${MNAME[m]}`, al, vence: venc(m), monto: s.price, est: 'Pendiente', tipo: 'srv', orden: base + 100 + j * 20 + i }))),
        ],
      }),
      // Contrato del ciclo (plan con FK; «alumnos» del plan se cuenta desde aquí) y evidencia fiscal de la inscripción.
      tx.contrato.create({ data: { id: `ctr-${id}-${ciclo.y0}`, alumnoId: id, cicloId: ciclo.id!, planId: plan.id, tipoBecaId: null, ctr: `CTR-${ciclo.y0}-${id}`, firmado: b.firma === 'digital' ? hoy : '' } }),
      tx.persInscripcion.create({ data: { id: 'ins-' + id, alumnoId: id, cicloId: ciclo.id!, ncf, factura, planId: plan.id, cuotas: vencs.length, firma: b.firma } }),
      // Historial por ciclo (matricula del ciclo activo) y vinculos tutor-alumno con rol y vigencia: Alumno.seccionId / tutorId / tutorLegalId son su copia vigente.
      ...(hermano ? [tx.finBeca.create({ data: { id: becaId, cicloId: ciclo.id!, alumnoId: id, est: `${b.nombre.trim()} ${b.apellido.trim()}`, grado: `${grado} ${sec}`, tipoBecaId: hermano.tipoId, modo: 'pct', valor: hermano.pct, conceptos: { create: [{ conceptoId: hermano.conceptoId, orden: 0 }] }, exp: `Plan Hermano · familia de ${finTutor.nombre} (${hermano.familia} hijo${hermano.familia === 1 ? '' : 's'} inscrito${hermano.familia === 1 ? '' : 's'}) · solicitada en la inscripción ${code}`, estado: 'Pendiente', aprob: 'Esperando Director Financiero' } })] : []),
      tx.matricula.create({ data: { id: idMatricula(id, ciclo.id!), alumnoId: id, cicloId: ciclo.id!, seccionId: cupo.id, estado: 'Activo', fechaIngreso: anticipada ? dest.fechaInicio : hoyIso } }),
      tx.tutorAlumno.createMany({ data: vinculosDeseados({ tutorId: finId, tutorLegalId: legalId }, new Map([[finId, finTutor.tipo], [legalId, legalTutor.tipo]])).map(v => ({ alumnoId: id, tutorId: v.tutorId, rol: v.rol, desde: hoyIso })) }),
      ]) await op;
    });
    await audit(req.user, 'Insert', { tabla: 'Inscripciones', id: code, prev: '—', next: `${ncf} · ${factura}${anticipada ? ` · pre-inscripción ${ciclo.nombre}` : ""}`, ip: req.ip });
    if (hermano) await audit(req.user, 'Insert', { tabla: 'Becas', id: becaId, next: `${hermano.nombre} · ${hermano.pct}% · ${b.nombre.trim()} ${b.apellido.trim()} · Pendiente (inscripción ${code})`, ip: req.ip });
    const tut = (t: typeof finTutor): InsContratoTutor => ({ nombre: t.nombre, cedula: fmtCed(t.cedula), parentesco: t.parentesco, tel: t.tel, email: t.email ?? '', rnc: t.rnc ?? '' });
    const contrato: InsResp['contrato'] = {
      alumnoId: id, ctr: `CTR-${ciclo.y0}-${id}`, ciclo: ciclo.nombre, fecha: hoy, tutorLegal: tut(legalTutor), tutorFinanciero: tut(finTutor),
      calendario: [
        ...vencs.map((v, i) => ({ con: `Colegiatura ${MNAME[v.m]} ${v.y}`, vence: vencDMY(plan.dia, v.m, v.y), monto: montos[i], ...(unico ? { enFactura: true } : {}) })),
        ...(materiales > 0 ? [{ con: 'Cuota de materiales', vence: vencDMY(plan.dia, vencs[0].m, vencs[0].y), monto: materiales }] : []),
      ],
      servicios: svc.map(s => ({ n: sname(s.l), price: s.price })),
      plan: { name: plan.name, n: plan.n, freq: plan.freq, desc: plan.desc, dia: plan.dia, gracia: plan.gracia, mora: moraTxt(plan, fin), pronto: plan.pronto, prontoDias: plan.prontoDias, total: totalDe(plan, tanda) },
    };
    const res: InsResp = { code, ncf, factura, cuotas: vencs.length, contrato, inscripcion: insMonto, ...(materiales > 0 ? { materiales } : {}), ...(hermano ? { becaId } : {}) };
    return res;
  }));
};
export default plugin;
