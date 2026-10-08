import type { FastifyPluginAsync } from 'fastify';
import type { ExpCatalogoItem, ExpDoc, ExpFicha, ExpPersona, ExpServicio, ExpedienteResp } from '@stodia/shared';
import { prisma } from '../../db';
import { audit } from '../../lib/audit';
import { READONLY_ROLES, digits, kidOf, toAlumno } from '../../lib/personas';

// Referencias del prototipo (PL, BE, CATALOG, MONTHS, MNAME).
const PLANES = { '10': { gross: 8500, n: 10, unit: '/ mes' }, '4': { gross: 21250, n: 4, unit: '/ trimestre' }, '1': { gross: 76500, n: 1, unit: 'único' } };
const BECAS = { none: { pct: 0, tag: '' }, hermano: { pct: 0.1, tag: 'Aprobada por Dirección' }, academica: { pct: 0.25, tag: 'Pendiente de aprobación' }, empleado: { pct: 0.5, tag: 'Pendiente de aprobación' } };
const CATALOGO: ExpCatalogoItem[] = [
  { k: 'mer', l: 'Comedor · Plan Merienda', cat: 'Recurrente opcional', freq: 'Mensual', mora: 'Aplica mora', price: 1800, rec: true, icon: 'ph ph-fork-knife', spec: 'Lunes a Viernes 10:00 AM', food: true },
  { k: 'trA', l: 'Transporte · Ruta Zona A', cat: 'Recurrente opcional', freq: 'Mensual', mora: 'Aplica mora', price: 2800, rec: true, icon: 'ph ph-bus', spec: 'Ruta Zona A · Ambos turnos' },
  { k: 'trB', l: 'Transporte · Ruta Zona B', cat: 'Recurrente opcional', freq: 'Mensual', mora: 'Aplica mora', price: 3100, rec: true, icon: 'ph ph-bus', spec: 'Ruta Zona B · Solo mañana' },
  { k: 'rob', l: 'Actividades · Club de Robótica', cat: 'Recurrente opcional', freq: 'Mensual', mora: 'Aplica mora', price: 1900, rec: true, icon: 'ph ph-robot', spec: 'Miércoles 2:30 PM' },
  { k: 'cer', l: 'Emisión de Certificación / Récord', cat: 'Esporádico', freq: 'Por demanda', mora: 'Sin mora', price: 500, rec: false, icon: '', spec: 'Certificación de estudios' },
  { k: 'exs', l: 'Derecho a Examen de Suficiencia', cat: 'Esporádico', freq: 'Por demanda', mora: 'Sin mora', price: 1500, rec: false, icon: '', spec: 'Matemáticas' },
  { k: 'uni', l: 'Kit de Uniformes (juego adicional)', cat: 'Materiales', freq: 'Eventual', mora: 'Sin mora', price: 2300, rec: false, icon: '', spec: 'Talla 12' },
];
const MONTHS = [8, 9, 10, 11, 12, 1, 2, 3, 4, 5];
const MNAME: Record<number, string> = { 1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre' };
const DOCS_DEFAULT = ['Acta de nacimiento', 'Registro de vacunación', 'Fotos 2×2', 'Récord de conducta anterior'];
const CICLO = '2026–2027';

const fichaDefault = (): ExpFicha => ({
  carnet: '', ingreso: '', geo: '',
  medico: { sangre: '', seguro: '', poliza: '', condiciones: '', planAlim: '', planAlimExtra: '', emergenciaNombre: '', emergenciaTel: '', alertaDetalle: '' },
  conducta: { obs: [], record: 'Sin observaciones' }, hist: [],
  contrato: { ciclo: CICLO, plan: '10', beca: 'none', ctr: '', firmado: '' },
});

const persona = (t: { nombre: string; parentesco: string; cedula: string; tel: string } | null): ExpPersona | null =>
  t ? { nombre: t.nombre, parentesco: t.parentesco, cedula: t.cedula, tel: t.tel } : null;

type ServRow = { id: string; kind: string; catKey: string; name: string; icon: string; spec: string; cost: number; corte: string; est: string; alert: string; fecha: string; st: string; mes: string; recibo: string };
const toServ = (s: ServRow): ExpServicio => ({ ...s, kind: s.kind as ExpServicio['kind'], st: s.st as ExpServicio['st'] });

const plugin: FastifyPluginAsync = async app => {
  const auth = { onRequest: [app.authenticate] };
  const canWrite = (rol: string) => !READONLY_ROLES.includes(rol);

  async function loadFicha(alumnoId: string): Promise<ExpFicha> {
    const r = await prisma.persExpediente.findUnique({ where: { alumnoId } });
    return r ? { ...fichaDefault(), ...JSON.parse(r.data) } : fichaDefault();
  }
  const saveFicha = (alumnoId: string, f: ExpFicha) =>
    prisma.persExpediente.upsert({ where: { alumnoId }, update: { data: JSON.stringify(f) }, create: { alumnoId, data: JSON.stringify(f) } });

  async function bundle(id: string): Promise<ExpedienteResp | null> {
    const a = await prisma.alumno.findUnique({ where: { id }, include: { tutor: true } });
    if (!a) return null;
    const ficha = await loadFicha(id);
    let docs = await prisma.persDocumento.findMany({ where: { alumnoId: id }, orderBy: { orden: 'asc' } });
    if (!docs.length) {
      await prisma.persDocumento.createMany({ data: DOCS_DEFAULT.map((n, i) => ({ id: `pdoc-${id}-${i}`, alumnoId: id, n, f: 'Sin archivo', est: 'Pendiente', orden: i })) });
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
    return {
      alumno: toAlumno(a), tutor: persona(a.tutor), legal: persona(legal), ficha,
      hermanos: sibs.map(s => ({ id: s.id, nombre: full(s), curso: `${s.grado} ${s.sec}`, beca: becaOf(s).map(b => 'Beca ' + b).join(' · ') })),
      docs: docs.map(d => ({ id: d.id, n: d.n, f: d.f, est: d.est as ExpDoc['est'] })),
      servicios: servicios.map(toServ),
      cuenta: cuenta.map(c => ({ id: c.id, con: c.con, vence: c.vence, est: c.est, monto: c.monto, paid: c.paid })),
      becasActivas: becaOf(a),
      ref: { planes: PLANES, becas: BECAS, catalogo: CATALOGO, ciclos: [CICLO, '2025–2026'] },
    };
  }

  app.get<{ Params: { id: string } }>('/:id', auth, async (req, reply) => (await bundle(req.params.id)) ?? reply.code(404).send({ error: 'Alumno no encontrado' }));

  app.put<{ Params: { id: string }; Body: { plan: string; beca: string } }>('/:id/contrato', auth, async (req, reply) => {
    if (!canWrite(req.user.rol)) return reply.code(403).send({ error: 'Sin permiso' });
    const { plan, beca } = req.body ?? ({} as { plan: string; beca: string });
    if (!(plan in PLANES) || !(beca in BECAS)) return reply.code(400).send({ error: 'Plan o beca inválidos' });
    const f = await loadFicha(req.params.id);
    await audit(req.user, 'Update', { tabla: 'Contrato', id: f.contrato.ctr || req.params.id, prev: `${f.contrato.plan}/${f.contrato.beca}`, next: `${plan}/${beca}`, ip: req.ip });
    f.contrato = { ...f.contrato, plan: plan as ExpFicha['contrato']['plan'], beca: beca as ExpFicha['contrato']['beca'] };
    await saveFicha(req.params.id, f);
    return { ok: true };
  });

  // Asigna un servicio del catálogo: recurrente (cuotas desde el mes elegido hasta mayo) o cargo único.
  app.post<{ Params: { id: string }; Body: { catKey: string; spec: string; mes: number } }>('/:id/servicios', auth, async (req, reply) => {
    if (!canWrite(req.user.rol)) return reply.code(403).send({ error: 'Sin permiso' });
    const { catKey, spec, mes } = req.body ?? ({} as { catKey: string; spec: string; mes: number });
    const cc = CATALOGO.find(c => c.k === catKey);
    const a = await prisma.alumno.findUnique({ where: { id: req.params.id }, include: { tutor: true } });
    if (!cc || !a || !MONTHS.includes(mes)) return reply.code(400).send({ error: 'Datos inválidos' });
    const sid = `psv-${cc.k}${Date.now().toString(36)}`;
    const venc = (m: number) => `01/${String(m).padStart(2, '0')}/${m >= 8 ? 2026 : 2027}`;
    const meses = cc.rec ? MONTHS.slice(MONTHS.indexOf(mes)) : [mes];
    const name = cc.l.split(' · ').pop()!;
    const sp = spec?.trim() || cc.spec;
    await prisma.persServicio.create({
      data: cc.rec
        ? { id: sid, alumnoId: a.id, kind: 'rec', catKey: cc.k, name, icon: cc.icon, spec: sp, cost: cc.price, corte: 'Día 01 de cada mes', alert: cc.food && a.alg ? 'Sin Maní / Lactosa' : '' }
        : { id: sid, alumnoId: a.id, kind: 'once', catKey: cc.k, name: `${cc.l} · ${sp}`, cost: cc.price, fecha: venc(mes), st: mes === 10 ? 'cargado' : 'prog', mes: MNAME[mes] },
    });
    const base = 1000 + (await prisma.finCobroItem.count());
    await prisma.finCobroItem.createMany({
      data: meses.map((m, i) => ({
        id: `${sid}-${m}`, kid: kidOf(a.id), con: `${name} · ${MNAME[m]}`, al: `${a.nombres.split(' ')[0]} · ${a.grado} ${a.sec}`, vence: venc(m), monto: cc.price,
        est: m === 10 ? 'Por vencer' : 'Pendiente', tipo: 'srv', orden: base + i, ...(a.tutor?.cedula ? { tutorCed: digits(a.tutor.cedula) } : {}),
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
