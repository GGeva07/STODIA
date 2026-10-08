import type { FastifyPluginAsync } from 'fastify';
import type { ExpFicha, InsConfigResp, InsReq, InsResp, InsTutorLookup } from '@stodia/shared';
import { prisma } from '../../db';
import { audit } from '../../lib/audit';
import { nextSeq } from '../../fin-utils';
import { digits } from '../../lib/personas';

// Constantes del wizard del prototipo (wzCalc).
const COL = 85000;
const INS = 15000;
const SERVICIOS = [
  { k: 'tra', n: 'Ruta de Transporte · Zona A', name: 'Ruta Zona A', icon: 'ph ph-bus', price: 2800, spec: 'Ruta Zona A · Ambos turnos' },
  { k: 'com', n: 'Plan de Comedor · Almuerzo', name: 'Plan Almuerzo Completo', icon: 'ph ph-fork-knife', price: 3200, spec: 'Lunes a Viernes 12:30 PM' },
  { k: 'act', n: 'Actividades extracurriculares', name: 'Actividades extracurriculares', icon: 'ph ph-medal', price: 1200, spec: 'Según inscripción' },
];
const DOCS = ['Acta de nacimiento', 'Registro de vacunación', 'Fotos 2×2', 'Récord de conducta anterior'];
const MONTHS = [8, 9, 10, 11, 12, 1, 2, 3, 4, 5];
const MNAME: Record<number, string> = { 1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre' };
const MES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const fmtCed = (v: string) => {
  const d = digits(v).slice(0, 11);
  return d.length <= 3 ? d : d.length <= 10 ? `${d.slice(0, 3)}-${d.slice(3)}` : `${d.slice(0, 3)}-${d.slice(3, 10)}-${d.slice(10)}`;
};

async function lookup(ced: string): Promise<InsTutorLookup & { tel?: string }> {
  const d = digits(ced);
  if (d.length < 11) return { found: false };
  const tutors = await prisma.tutor.findMany();
  const t = tutors.find(x => digits(x.cedula) === d);
  if (!t) return { found: false };
  const [fin, leg] = await Promise.all([
    prisma.alumno.count({ where: { tutorId: t.id } }),
    prisma.persExpediente.findMany({ select: { data: true } }),
  ]);
  const legal = leg.filter(r => (JSON.parse(r.data) as ExpFicha).tutorLegalId === t.id).length;
  const info = fin ? `tutor financiero de ${fin} alumno${fin === 1 ? '' : 's'}` : legal ? `tutor${t.parentesco === 'Madre' ? 'a' : ''} legal de ${legal} alumno${legal === 1 ? '' : 's'}` : 'sin alumnos vinculados';
  return { found: true, id: t.id, nombre: t.nombre, info, tel: t.tel };
}

const plugin: FastifyPluginAsync = async app => {
  const guard = { onRequest: [app.authenticate, app.requireRole('Super Admin', 'Cajero')] };

  app.get('/config', guard, async (): Promise<InsConfigResp> => {
    const cupos = await prisma.persCupo.findMany({ orderBy: [{ tanda: 'asc' }, { seccion: 'asc' }] });
    return {
      cupos, docs: DOCS, ciclo: '2026–2027', colegiatura: COL, inscripcion: INS,
      servicios: SERVICIOS.map(s => ({ k: s.k, n: s.n, price: s.price })),
    };
  });

  // Consulta de duplicados por documento de identidad.
  app.post<{ Body: { ced?: string } }>('/tutor', guard, async req => {
    const { tel: _tel, ...res } = await lookup(req.body?.ced ?? '');
    return res satisfies InsTutorLookup;
  });

  app.post<{ Body: InsReq }>('/', guard, async (req, reply) => {
    const b = req.body;
    const fail = (error: string) => reply.code(400).send({ error });
    if (!b?.nombre?.trim() || !b.apellido?.trim() || !b.fnac) return fail('Completa nombres, apellidos y fecha de nacimiento');
    if (!['10', '4', '1'].includes(b.plan)) return fail('Plan de pago inválido');

    const L = await lookup(b.legalCed);
    const F = b.finSame ? L : await lookup(b.finCed);
    const legalName = L.found ? L.nombre! : b.legalName?.trim();
    const finName = b.finSame ? legalName : F.found ? F.nombre! : b.finName?.trim();
    if (!legalName || !finName) return fail('Identifica al tutor legal y financiero');

    const cupo = await prisma.persCupo.findFirst({ where: { tanda: b.tanda, seccion: b.sec } });
    if (!cupo || cupo.used >= cupo.cap) return fail('Selecciona una sección con cupo');

    // Tutores: vincula los existentes o crea los nuevos (sin duplicar por cédula).
    const all = await prisma.tutor.findMany({ select: { id: true } });
    let seq = Math.max(0, ...all.map(t => Number(t.id.replace(/\D/g, '')) || 0));
    const resolve = async (l: InsTutorLookup, name: string, ced: string, tipo: string) => {
      if (l.found) return l.id!;
      const id = 'u' + ++seq;
      await prisma.tutor.create({ data: { id, nombre: name, cedula: fmtCed(ced), parentesco: 'Tutor legal', tipo, tel: '' } });
      return id;
    };
    const legalId = await resolve(L, legalName, b.legalCed, b.finSame ? 'Financiero y académico' : 'Académico');
    const finId = b.finSame ? legalId : await resolve(F, finName, b.finCed, 'Financiero');
    const finTutor = await prisma.tutor.findUniqueOrThrow({ where: { id: finId } });

    const ids = (await prisma.alumno.findMany({ select: { id: true } })).map(a => Number(a.id) || 0);
    const id = String(Math.max(...ids, 0) + 1).padStart(4, '0');
    const code = 'EST-2026-' + id;
    const grado = b.grado.replace('Primaria · ', '');
    const now = new Date();
    const hoy = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

    const ficha: ExpFicha = {
      carnet: '', ingreso: `${MES_ES[now.getMonth()][0].toUpperCase()}${MES_ES[now.getMonth()].slice(1)} ${now.getFullYear()} · ${grado} ${b.sec}`, geo: '',
      medico: { sangre: '', seguro: '', poliza: '', condiciones: '', planAlim: '', planAlimExtra: '', emergenciaNombre: '', emergenciaTel: finTutor.tel, alertaDetalle: '' },
      conducta: { obs: [], record: 'Sin observaciones' }, hist: [], tutorLegalId: legalId,
      contrato: { ciclo: '2026–2027', plan: b.plan, beca: 'none', ctr: 'CTR-2026-' + id, firmado: b.firma === 'digital' ? hoy : '' },
    };
    const COLM = b.plan === '1' ? COL * 0.9 : b.plan === '4' ? COL / 4 : COL / 10;
    const cuotas = b.plan === '1' ? [8] : b.plan === '4' ? [8, 11, 2, 5] : MONTHS;
    const factura = INS + (b.plan === '1' ? COL * 0.9 : 0);
    const ncf = 'B02' + String(await nextSeq('ncf', 1881)).padStart(8, '0');
    const venc = (m: number) => `01/${String(m).padStart(2, '0')}/${m >= 8 ? 2026 : 2027}`;
    const al = `${b.nombre.trim().split(' ')[0]} · ${grado} ${b.sec}`;
    const base = 2000 + (await prisma.finCobroItem.count());
    const ced = digits(finTutor.cedula);
    const svc = SERVICIOS.filter((_, i) => b.serv?.[i]);

    await prisma.$transaction([
      prisma.alumno.create({
        data: { id, code, nombres: b.nombre.trim(), apellidos: b.apellido.trim(), fnac: b.fnac, grado, sec: b.sec, tanda: b.tanda, cuenta: 'ok', estado: 'Activo', tel: finTutor.tel, tutorId: finId },
      }),
      prisma.persExpediente.create({ data: { alumnoId: id, data: JSON.stringify(ficha) } }),
      prisma.persDocumento.createMany({
        data: DOCS.map((n, i) => ({ id: `pdoc-${id}-${i}`, alumnoId: id, n, f: b.docs?.[i] ? 'recibido_' + n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_') + '.pdf' : 'Sin archivo', est: b.docs?.[i] ? 'En revisión' : 'Pendiente', orden: i })),
      }),
      prisma.persServicio.createMany({
        data: svc.map(s => ({ id: `psv-${s.k}-${id}`, alumnoId: id, kind: 'rec', catKey: s.k, name: s.name, icon: s.icon, spec: s.spec, cost: s.price, corte: 'Día 01 de cada mes' })),
      }),
      prisma.finCobroItem.createMany({
        data: [
          ...cuotas.map((m, i) => ({ id: `ins-${id}-c${m}`, kid: id, con: `Colegiatura ${MNAME[m]} ${m >= 8 ? 2026 : 2027}`, al, vence: venc(m), monto: COLM, est: 'Pendiente', tipo: 'col', orden: base + i, tutorCed: ced })),
          ...svc.flatMap((s, j) => MONTHS.slice(MONTHS.indexOf(10)).map((m, i) => ({ id: `ins-${id}-${s.k}${m}`, kid: id, con: `${s.name} · ${MNAME[m]}`, al, vence: venc(m), monto: s.price, est: 'Pendiente', tipo: 'srv', orden: base + 100 + j * 20 + i, tutorCed: ced }))),
        ],
      }),
      prisma.persCupo.update({ where: { id: cupo.id }, data: { used: { increment: 1 } } }),
      prisma.persInscripcion.create({ data: { id: 'ins-' + id, alumnoId: id, ncf, factura, plan: b.plan, cuotas: cuotas.length, firma: b.firma } }),
    ]);
    await audit(req.user, 'Insert', { tabla: 'Inscripciones', id: code, prev: '—', next: `${ncf} · ${factura}`, ip: req.ip });
    const res: InsResp = { code, ncf, factura, cuotas: cuotas.length };
    return res;
  });
};
export default plugin;
