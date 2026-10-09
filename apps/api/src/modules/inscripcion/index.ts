import type { FastifyPluginAsync } from 'fastify';
import type { ExpFicha, InsConfigResp, InsCupo, InsReq, InsResp, InsTutorLookup } from '@stodia/shared';
import { prisma } from '../../db';
import { audit } from '../../lib/audit';
import { nextSeq } from '../../fin-utils';
import { digits } from '../../lib/personas';
import { errorTutor, fmtCed, fmtTel, unirTipo, type TutorCampos } from '../../lib/tutor-datos';
import { partesEnZona, zonaHoraria } from '../../lib/cxc';
import { MES_ES, MNAME, anioDeMes, catalogoServicios, cicloActivo, cuotasDe, docsRequeridos, getFinanzas, insPlan, mesesCiclo, mesesDe, planesPago, totalDe, vencDMY } from '../../lib/pers-fin';

const slug = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_');

type TutorRowDb = NonNullable<Awaited<ReturnType<typeof prisma.tutor.findFirst>>>;

async function lookup(ced: string): Promise<InsTutorLookup & { tel?: string; row?: TutorRowDb }> {
  const d = digits(ced);
  if (d.length < 11) return { found: false };
  const t = await prisma.tutor.findUnique({ where: { cedula: d } });
  if (!t) return { found: false };
  const [fin, legal] = await Promise.all([prisma.alumno.count({ where: { tutorId: t.id } }), prisma.alumno.count({ where: { tutorLegalId: t.id } })]);
  const info = fin ? `tutor financiero de ${fin} alumno${fin === 1 ? '' : 's'}` : legal ? `tutor${t.parentesco === 'Madre' ? 'a' : ''} legal de ${legal} alumno${legal === 1 ? '' : 's'}` : 'sin alumnos vinculados';
  return { found: true, id: t.id, nombre: t.nombre, info, tel: t.tel, row: t, datos: { parentesco: t.parentesco, tel: t.tel, email: t.email ?? '', rnc: t.rnc ?? '' } };
}

/** Grados, tandas y secciones salen de los Catálogos. Inscritos = alumnos reales de la sección (se calcula; ya no hay contador guardado). */
async function cargarCupos() {
  const [rows, alumnos] = await Promise.all([
    prisma.catalogo.findMany({ where: { tipo: { in: ['grados', 'tandas', 'secciones'] } }, orderBy: { id: 'asc' } }),
    prisma.alumno.findMany({ where: { estado: { not: 'Retirado' } }, select: { grado: true, sec: true, tanda: true } }),
  ]);
  const of = (tipo: string) => rows.filter(r => r.tipo === tipo).map(r => ({ row: r, d: JSON.parse(r.data) as Record<string, unknown> }));
  const gr = of('grados'), td = of('tandas');
  const grados = gr.filter(g => g.row.estado === 'Activo').sort((a, b) => Number(a.d.orden) - Number(b.d.orden)).map(g => ({ id: String(g.d.id), label: `${g.d.nivel} · ${g.d.grado}` }));
  const tandas = td.filter(t => t.row.estado === 'Activo').map(t => String(t.d.nombre));
  const cupos: InsCupo[] = [];
  for (const s of of('secciones')) {
    if (s.row.estado !== 'Activo') continue;
    const g = gr.find(x => x.d.id === s.d.grado && x.row.estado === 'Activo'), t = td.find(x => x.d.id === s.d.tanda && x.row.estado === 'Activo');
    if (!g || !t) continue;
    const real = alumnos.filter(a => a.grado === g.d.grado && a.sec === s.d.seccion && a.tanda === t.d.nombre).length;
    cupos.push({ id: s.row.id, grado: String(g.d.id), tanda: String(t.d.nombre), seccion: String(s.d.seccion), cap: Number(s.d.cap) || 0, used: real });
  }
  return { grados, tandas, cupos, gradoNombre: (id: string) => String(gr.find(g => g.d.id === id)?.d.grado ?? '') };
}

const plugin: FastifyPluginAsync = async app => {
  const guard = { onRequest: [app.authenticate, app.requireRole('Super Admin', 'Cajero')] };

  app.get('/config', guard, async (): Promise<InsConfigResp> => {
    const [c, planes, fin, ciclo, cat, docs] = await Promise.all([cargarCupos(), planesPago(), getFinanzas(), cicloActivo(), catalogoServicios(), docsRequeridos()]);
    const activos = planes.filter(p => p.estado === 'Activo');
    const avisos: string[] = [];
    if (!activos.length) avisos.push('Configura planes y precios: no hay Planes de Pago activos (Finanzas → Planes de Pago).');
    if (!ciclo.configurado) avisos.push('Configura el ciclo lectivo activo en Configuración.');
    if (!c.grados.length || !c.tandas.length) avisos.push('Configura grados y tandas en Catálogos.');
    else if (!c.cupos.length) avisos.push('Configura las secciones (con su capacidad) en Catálogos.');
    return {
      cupos: c.cupos, docs, ciclo: ciclo.nombre, grados: c.grados, tandas: c.tandas,
      planes: activos.map(p => insPlan(p, c.tandas, fin, ciclo.y0)),
      inscripcion: fin.inscripcion,
      servicios: cat.filter(s => s.rec).map(s => ({ k: s.k, n: s.l, price: s.price })),
      avisos,
    };
  });

  // Consulta de duplicados por documento de identidad.
  app.post<{ Body: { ced?: string } }>('/tutor', guard, async req => {
    const { tel: _tel, row: _row, ...res } = await lookup(req.body?.ced ?? '');
    return res satisfies InsTutorLookup;
  });

  app.post<{ Body: InsReq }>('/', guard, async (req, reply) => {
    const b = req.body;
    const fail = (error: string) => reply.code(400).send({ error });
    if (!b?.nombre?.trim() || !b.apellido?.trim() || !b.fnac) return fail('Completa nombres, apellidos y fecha de nacimiento');

    const [planes, fin, ciclo, cat, DOCS, c] = await Promise.all([planesPago(), getFinanzas(), cicloActivo(), catalogoServicios(), docsRequeridos(), cargarCupos()]);
    const plan = planes.find(p => p.id === b.plan && p.estado === 'Activo');
    if (!plan) return fail(planes.some(p => p.estado === 'Activo') ? 'Plan de pago inválido' : 'Configura planes y precios antes de inscribir (Finanzas → Planes de Pago)');

    const L = await lookup(b.legalCed);
    const F = b.finSame ? L : await lookup(b.finCed);
    const legalName = L.found ? L.nombre! : b.legalName?.trim();
    const finName = b.finSame ? legalName : F.found ? F.nombre! : b.finName?.trim();
    if (!legalName || !finName) return fail('Identifica al tutor legal y financiero');
    if (!b.finSame && digits(b.legalCed) === digits(b.finCed)) return fail('El tutor legal y el financiero tienen la misma cédula: marca que son la misma persona');

    // Datos de contacto de cada tutor: mismos campos y validaciones que la pantalla Tutores. Se validan TODOS antes de escribir nada.
    const campos = (rol: string, look: InsTutorLookup & { row?: TutorRowDb }, name: string, ced: string, d: InsReq['legalDatos'] | undefined, tipo: string): { v: TutorCampos } | { err: string } => {
      const s = (x: unknown) => (typeof x === 'string' ? x.trim() : '');
      const v: TutorCampos = {
        nombre: look.found ? look.nombre! : name, cedula: fmtCed(ced), parentesco: s(d?.parentesco), tipo: look.row ? unirTipo(look.row.tipo, tipo) : tipo,
        tel: fmtTel(s(d?.tel)), email: s(d?.email).toLowerCase(), rnc: s(d?.rnc),
      };
      const e = errorTutor(v);
      return e ? { err: `${rol}: ${e}` } : { v };
    };
    const cl = campos('Tutor legal', L, legalName, b.legalCed, b.legalDatos, b.finSame ? 'Financiero y académico' : 'Académico');
    if ('err' in cl) return fail(cl.err);
    const cf = b.finSame ? cl : campos('Tutor financiero', F, finName, b.finCed, b.finDatos, 'Financiero');
    if ('err' in cf) return fail(cf.err);

    const cupo = c.cupos.find(x => x.id === b.cupo);
    if (!cupo || cupo.used >= cupo.cap) return fail('Selecciona una sección con cupo');
    const grado = c.gradoNombre(cupo.grado), sec = cupo.seccion, tanda = cupo.tanda;
    if (totalDe(plan, tanda) <= 0) return fail(`El plan ${plan.name} no tiene monto definido para la tanda ${tanda}`);

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

    const ids = (await prisma.alumno.findMany({ select: { id: true } })).map(a => Number(a.id) || 0);
    const id = String(Math.max(...ids, 0) + 1).padStart(4, '0');
    const code = `EST-${ciclo.y0}-${id}`;
    const tz = await zonaHoraria();
    const hoyP = partesEnZona(tz);
    const hoy = `${String(hoyP.d).padStart(2, '0')}/${String(hoyP.m).padStart(2, '0')}/${hoyP.y}`;
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
    const factura = fin.inscripcion + (unico ? totalDe(plan, tanda) : 0);
    const ncf = 'B02' + String(await nextSeq('ncf')).padStart(8, '0');
    const meses = mesesCiclo(planes), idxHoy = Math.max(0, meses.indexOf(hoyP.m));
    const dia = fin.diaCorte > 0 ? fin.diaCorte : 1;
    const venc = (m: number) => vencDMY(dia, m, anioDeMes(meses, ciclo.y0, m));
    const al = `${b.nombre.trim().split(' ')[0]} · ${grado} ${sec}`;
    const base = 2000 + (await prisma.finCobroItem.count());
    const svc = cat.filter(s => s.rec && b.serv?.includes(s.k));
    const sname = (l: string) => l.split(' · ').pop()!;
    const svcId = (k: string) => `psv-${k.replace(/\W/g, '')}-${id}`;

    await prisma.$transaction([
      prisma.alumno.create({
        data: { id, code, nombres: b.nombre.trim(), apellidos: b.apellido.trim(), fnac: b.fnac, grado, sec, tanda, cuenta: 'ok', estado: 'Activo', tel: finTutor.tel, tutorId: finId, tutorLegalId: legalId },
      }),
      prisma.persExpediente.create({ data: { alumnoId: id, data: JSON.stringify(ficha) } }),
      prisma.persDocumento.createMany({
        data: DOCS.map((n, i) => ({ id: `pdoc-${id}-${i}`, alumnoId: id, n, f: b.docs?.[i] ? 'recibido_' + slug(n) + '.pdf' : 'Sin archivo', est: b.docs?.[i] ? 'En revisión' : 'Pendiente', orden: i })),
      }),
      prisma.persServicio.createMany({
        data: svc.map(s => ({ id: svcId(s.k), alumnoId: id, kind: 'rec', catKey: s.k, name: sname(s.l), icon: s.icon, spec: s.spec, cost: s.price, corte: `Día ${String(dia).padStart(2, '0')} de cada mes` })),
      }),
      prisma.finCobroItem.createMany({
        data: [
          ...vencs.map((v, i) => ({ id: `ins-${id}-c${v.m}`, alumnoId: id, tutorId: finId, con: `Colegiatura ${MNAME[v.m]} ${v.y}`, al, vence: vencDMY(plan.dia, v.m, v.y), monto: montos[i], est: 'Pendiente', tipo: 'col', orden: base + i })),
          ...svc.flatMap((s, j) => meses.slice(idxHoy).map((m, i) => ({ id: `ins-${id}-${s.k.replace(/\W/g, '')}${m}`, alumnoId: id, tutorId: finId, servicioId: svcId(s.k), con: `${sname(s.l)} · ${MNAME[m]}`, al, vence: venc(m), monto: s.price, est: 'Pendiente', tipo: 'srv', orden: base + 100 + j * 20 + i }))),
        ],
      }),
      // Contrato del ciclo (plan con FK; «alumnos» del plan se cuenta desde aquí) y evidencia fiscal de la inscripción.
      prisma.contrato.create({ data: { id: `ctr-${id}-${ciclo.y0}`, alumnoId: id, ciclo: ciclo.nombre, planId: plan.id, beca: null, ctr: `CTR-${ciclo.y0}-${id}`, firmado: b.firma === 'digital' ? hoy : '' } }),
      prisma.persInscripcion.create({ data: { id: 'ins-' + id, alumnoId: id, ncf, factura, planId: plan.id, cuotas: vencs.length, firma: b.firma } }),
    ]);
    await audit(req.user, 'Insert', { tabla: 'Inscripciones', id: code, prev: '—', next: `${ncf} · ${factura}`, ip: req.ip });
    const res: InsResp = { code, ncf, factura, cuotas: vencs.length };
    return res;
  });
};
export default plugin;
