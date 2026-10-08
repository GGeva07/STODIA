import type { FastifyPluginAsync } from 'fastify';
import type { ExpCatalogoItem, ExpDoc, ExpFicha, ExpPersona, ExpServicio, ExpedienteResp, PersPlan } from '@stodia/shared';
import { prisma } from '../../db';
import { audit } from '../../lib/audit';
import { READONLY_ROLES, digits, kidOf, toAlumno } from '../../lib/personas';
import { partesEnZona, zonaHoraria } from '../../lib/cxc';
import { MNAME, anioDeMes, becasCatalogo, catalogoServicios, cicloActivo, docsRequeridos, getFinanzas, mesesCiclo, persPlan, planesPago, resolverPlan, vencDMY } from '../../lib/pers-fin';

const fichaDefault = (ciclo: string): ExpFicha => ({
  carnet: '', ingreso: '', geo: '',
  medico: { sangre: '', seguro: '', poliza: '', condiciones: '', planAlim: '', planAlimExtra: '', emergenciaNombre: '', emergenciaTel: '', alertaDetalle: '' },
  conducta: { obs: [], record: 'Sin observaciones' }, hist: [],
  contrato: { ciclo, plan: '', beca: 'none', ctr: '', firmado: '' },
});

const persona = (t: { nombre: string; parentesco: string; cedula: string; tel: string } | null): ExpPersona | null =>
  t ? { nombre: t.nombre, parentesco: t.parentesco, cedula: t.cedula, tel: t.tel } : null;

type ServRow = { id: string; kind: string; catKey: string; name: string; icon: string; spec: string; cost: number; corte: string; est: string; alert: string; fecha: string; st: string; mes: string; recibo: string };
const toServ = (s: ServRow): ExpServicio => ({ ...s, kind: s.kind as ExpServicio['kind'], st: s.st as ExpServicio['st'] });

const plugin: FastifyPluginAsync = async app => {
  const auth = { onRequest: [app.authenticate] };
  const canWrite = (rol: string) => !READONLY_ROLES.includes(rol);

  async function loadFicha(alumnoId: string): Promise<ExpFicha> {
    const [r, ciclo] = await Promise.all([prisma.persExpediente.findUnique({ where: { alumnoId } }), cicloActivo()]);
    return r ? { ...fichaDefault(ciclo.nombre), ...JSON.parse(r.data) } : fichaDefault(ciclo.nombre);
  }
  const saveFicha = (alumnoId: string, f: ExpFicha) =>
    prisma.persExpediente.upsert({ where: { alumnoId }, update: { data: JSON.stringify(f) }, create: { alumnoId, data: JSON.stringify(f) } });

  /** Calendario del ciclo activo: meses, año de inicio, hoy y mes actual (zona horaria de la institución). */
  async function calendario(planes: Awaited<ReturnType<typeof planesPago>>) {
    const [ciclo, tz] = await Promise.all([cicloActivo(), zonaHoraria()]);
    const meses = mesesCiclo(planes), { y, m, d } = partesEnZona(tz);
    const ultimo = meses[meses.length - 1];
    const fin = new Date(Date.UTC(anioDeMes(meses, ciclo.y0, ultimo), ultimo, 0)).toISOString().slice(0, 10);
    return { ciclo, meses, hoy: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, mesActual: m, finCiclo: fin };
  }

  async function bundle(id: string): Promise<ExpedienteResp | null> {
    const a = await prisma.alumno.findUnique({ where: { id }, include: { tutor: true } });
    if (!a) return null;
    const [ficha, planes, fin, becasCat, catalogo] = await Promise.all([loadFicha(id), planesPago(), getFinanzas(), becasCatalogo(), catalogoServicios()]);
    const cal = await calendario(planes);
    let docs = await prisma.persDocumento.findMany({ where: { alumnoId: id }, orderBy: { orden: 'asc' } });
    if (!docs.length) {
      await prisma.persDocumento.createMany({ data: (await docsRequeridos()).map((n, i) => ({ id: `pdoc-${id}-${i}`, alumnoId: id, n, f: 'Sin archivo', est: 'Pendiente', orden: i })) });
      docs = await prisma.persDocumento.findMany({ where: { alumnoId: id }, orderBy: { orden: 'asc' } });
    }
    const [servicios, cuenta, legal, sibs, becas] = await Promise.all([
      prisma.persServicio.findMany({ where: { alumnoId: id } }),
      prisma.finCobroItem.findMany({ where: { kid: kidOf(id) }, orderBy: { orden: 'asc' } }),
      ficha.tutorLegalId ? prisma.tutor.findUnique({ where: { id: ficha.tutorLegalId } }) : null,
      a.tutorId ? prisma.alumno.findMany({ where: { tutorId: a.tutorId, NOT: { id } } }) : [],
      prisma.finBeca.findMany({ where: { estado: 'Aprobada' } }),
    ]);
    const full = (x: { nombres: string; apellidos: string }) => `${x.nombres} ${x.apellidos}`;
    const becaOf = (x: { nombres: string; apellidos: string }) => becas.filter(b => b.est === full(x)).map(b => `${b.tipo} ${b.regla.includes('%') ? '−' : ''}${b.regla}`);

    // El contrato guarda el id del plan (o la clave heredada '10'/'4'/'1'); se normaliza al plan real.
    const actual = resolverPlan(planes, ficha.contrato.plan);
    ficha.contrato = { ...ficha.contrato, plan: actual?.id ?? '' };
    const refPlanes: Record<string, PersPlan> = {};
    for (const p of planes) if (p.estado === 'Activo' || p.id === actual?.id) refPlanes[p.id] = persPlan(p, a.tanda, fin, cal.ciclo.y0);
    const avisos: string[] = [];
    if (!Object.keys(refPlanes).length) avisos.push('Configura planes y precios: no hay Planes de Pago activos (Finanzas → Planes de Pago).');
    if (!cal.ciclo.configurado) avisos.push('Configura el ciclo lectivo activo en Configuración.');
    if (!catalogo.length) avisos.push('No hay servicios con precio configurado (rutas, planes de alimentación, actividades o productos).');
    return {
      alumno: toAlumno(a), tutor: persona(a.tutor), legal: persona(legal), ficha,
      hermanos: sibs.map(s => ({ id: s.id, nombre: full(s), curso: `${s.grado} ${s.sec}`, beca: becaOf(s).map(b => 'Beca ' + b).join(' · ') })),
      docs: docs.map(d => ({ id: d.id, n: d.n, f: d.f, est: d.est as ExpDoc['est'] })),
      servicios: servicios.map(toServ),
      cuenta: cuenta.map(c => ({ id: c.id, con: c.con, vence: c.vence, est: c.est, monto: c.monto, paid: c.paid })),
      becasActivas: becaOf(a),
      ref: {
        planes: refPlanes,
        becas: Object.fromEntries(becasCat.map(b => [b.key, { nombre: b.nombre, pct: b.pct, aprobacion: b.aprobacion, tag: b.aprobacion ? 'Pendiente de aprobación' : 'Aprobada por Dirección' }])),
        catalogo, ciclos: [cal.ciclo.nombre, ...cal.ciclo.otros], meses: cal.meses, anio0: cal.ciclo.y0, hoy: cal.hoy, mesActual: cal.mesActual, finCiclo: cal.finCiclo, avisos,
      },
    };
  }

  app.get<{ Params: { id: string } }>('/:id', auth, async (req, reply) => (await bundle(req.params.id)) ?? reply.code(404).send({ error: 'Alumno no encontrado' }));

  app.put<{ Params: { id: string }; Body: { plan: string; beca: string } }>('/:id/contrato', auth, async (req, reply) => {
    if (!canWrite(req.user.rol)) return reply.code(403).send({ error: 'Sin permiso' });
    const { plan, beca } = req.body ?? ({} as { plan: string; beca: string });
    const [planes, becas, f] = await Promise.all([planesPago(), becasCatalogo(), loadFicha(req.params.id)]);
    const prev = resolverPlan(planes, f.contrato.plan), next = resolverPlan(planes, plan);
    if (!next || (next.estado !== 'Activo' && next.id !== prev?.id) || (beca !== 'none' && !becas.some(b => b.key === beca) && beca !== f.contrato.beca)) return reply.code(400).send({ error: 'Plan o beca inválidos' });
    await audit(req.user, 'Update', { tabla: 'Contrato', id: f.contrato.ctr || req.params.id, prev: `${f.contrato.plan}/${f.contrato.beca}`, next: `${next.id}/${beca}`, ip: req.ip });
    f.contrato = { ...f.contrato, plan: next.id, beca };
    await prisma.$transaction([
      ...(prev && prev.id !== next.id ? [prisma.finPlan.updateMany({ where: { id: prev.id, alumnos: { gt: 0 } }, data: { alumnos: { decrement: 1 } } })] : []),
      ...(!prev || prev.id !== next.id ? [prisma.finPlan.update({ where: { id: next.id }, data: { alumnos: { increment: 1 } } })] : []),
    ]);
    await saveFicha(req.params.id, f);
    return { ok: true };
  });

  // Asigna un servicio del catálogo: recurrente (cuotas desde el mes elegido hasta fin de ciclo) o cargo único.
  app.post<{ Params: { id: string }; Body: { catKey: string; spec: string; mes: number } }>('/:id/servicios', auth, async (req, reply) => {
    if (!canWrite(req.user.rol)) return reply.code(403).send({ error: 'Sin permiso' });
    const { catKey, spec, mes } = req.body ?? ({} as { catKey: string; spec: string; mes: number });
    const [catalogo, planes, fin] = await Promise.all([catalogoServicios(), planesPago(), getFinanzas()]);
    const cc: ExpCatalogoItem | undefined = catalogo.find(c => c.k === catKey);
    const a = await prisma.alumno.findUnique({ where: { id: req.params.id }, include: { tutor: true } });
    const cal = await calendario(planes);
    const idx = cal.meses.indexOf(mes), idxHoy = Math.max(0, cal.meses.indexOf(cal.mesActual));
    if (!cc || !a || idx < 0 || idx < idxHoy) return reply.code(400).send({ error: 'Datos inválidos' });
    const sid = `psv-${cc.k.replace(/\W/g, '')}${Date.now().toString(36)}`;
    const dia = fin.diaCorte > 0 ? fin.diaCorte : 1;
    const venc = (m: number) => vencDMY(dia, m, anioDeMes(cal.meses, cal.ciclo.y0, m));
    const meses = cc.rec ? cal.meses.slice(idx) : [mes];
    const name = cc.l.split(' · ').pop()!;
    const sp = spec?.trim() || cc.spec;
    const alert = cc.food && a.alg ? 'Sin ' + a.alg.split(',').map(x => x.trim()).filter(Boolean).join(' / ') : '';
    await prisma.persServicio.create({
      data: cc.rec
        ? { id: sid, alumnoId: a.id, kind: 'rec', catKey: cc.k, name, icon: cc.icon, spec: sp, cost: cc.price, corte: `Día ${String(dia).padStart(2, '0')} de cada mes`, alert }
        : { id: sid, alumnoId: a.id, kind: 'once', catKey: cc.k, name: sp ? `${cc.l} · ${sp}` : cc.l, cost: cc.price, fecha: venc(mes), st: mes === cal.mesActual ? 'cargado' : 'prog', mes: MNAME[mes] },
    });
    const base = 1000 + (await prisma.finCobroItem.count());
    await prisma.finCobroItem.createMany({
      data: meses.map((m, i) => ({
        id: `${sid}-${m}`, kid: kidOf(a.id), con: `${name} · ${MNAME[m]}`, al: `${a.nombres.split(' ')[0]} · ${a.grado} ${a.sec}`, vence: venc(m), monto: cc.price,
        est: m === cal.mesActual ? 'Por vencer' : 'Pendiente', tipo: 'srv', orden: base + i, ...(a.tutor?.cedula ? { tutorCed: digits(a.tutor.cedula) } : {}),
      })),
    });
    await audit(req.user, 'Insert', { tabla: 'Servicios', id: `${a.code}/${cc.k}`, prev: '—', next: `${meses.length} cargo(s) × ${cc.price}`, ip: req.ip });
    return { id: sid, cargos: meses.length };
  });

  app.put<{ Params: { id: string; sid: string }; Body: { spec: string } }>('/:id/servicios/:sid', auth, async (req, reply) => {
    if (!canWrite(req.user.rol)) return reply.code(403).send({ error: 'Sin permiso' });
    const s = await prisma.persServicio.findFirst({ where: { id: req.params.sid, alumnoId: req.params.id } });
    if (!s) return reply.code(404).send({ error: 'Servicio no encontrado' });
    await prisma.persServicio.update({ where: { id: s.id }, data: { spec: req.body?.spec?.trim() || s.spec } });
    return { ok: true };
  });

  // Baja: marca el servicio y anula las cuotas futuras pendientes (no vencidas ni pagadas) en CxC.
  const LEGACY: Record<string, string[]> = { 'psv-fut': ['f10'] };
  app.post<{ Params: { id: string; sid: string }; Body: { fecha: string } }>('/:id/servicios/:sid/baja', auth, async (req, reply) => {
    if (!canWrite(req.user.rol)) return reply.code(403).send({ error: 'Sin permiso' });
    const s = await prisma.persServicio.findFirst({ where: { id: req.params.sid, alumnoId: req.params.id, kind: 'rec' } });
    const f = req.body?.fecha ?? '';
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return reply.code(400).send({ error: 'Datos inválidos' });
    await prisma.persServicio.update({ where: { id: s.id }, data: { est: 'Baja · ' + f.split('-').reverse().join('/') } });
    const del = await prisma.finCobroItem.deleteMany({
      where: { paid: false, NOT: { est: 'Vencida' }, OR: [{ id: { startsWith: s.id + '-' } }, { id: { in: LEGACY[s.id] ?? [] } }] },
    });
    await audit(req.user, 'Update', { tabla: 'Servicios', id: s.id, prev: 'Activo', next: 'Baja ' + f, ip: req.ip });
    return { anuladas: del.count };
  });

  app.delete<{ Params: { id: string; sid: string } }>('/:id/servicios/:sid', auth, async (req, reply) => {
    if (!canWrite(req.user.rol)) return reply.code(403).send({ error: 'Sin permiso' });
    const s = await prisma.persServicio.findFirst({ where: { id: req.params.sid, alumnoId: req.params.id, kind: 'once', st: 'prog' } });
    if (!s) return reply.code(400).send({ error: 'Solo se cancelan cargos programados' });
    await prisma.$transaction([
      prisma.persServicio.delete({ where: { id: s.id } }),
      prisma.finCobroItem.deleteMany({ where: { id: { startsWith: s.id + '-' }, paid: false } }),
    ]);
    return { ok: true };
  });

  // Carga de documento (simulada como en el prototipo: aún no hay almacenamiento de archivos).
  app.put<{ Params: { id: string; did: string } }>('/:id/documentos/:did', auth, async (req, reply) => {
    if (!canWrite(req.user.rol)) return reply.code(403).send({ error: 'Sin permiso' });
    const d = await prisma.persDocumento.findFirst({ where: { id: req.params.did, alumnoId: req.params.id } });
    if (!d) return reply.code(404).send({ error: 'Documento no encontrado' });
    const slug = d.n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    await prisma.persDocumento.update({ where: { id: d.id }, data: { est: 'En revisión', f: d.f === 'Sin archivo' ? `${slug}.pdf` : d.f } });
    return { ok: true };
  });
};
export default plugin;
