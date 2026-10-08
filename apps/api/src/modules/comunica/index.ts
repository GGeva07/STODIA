import type { FastifyPluginAsync } from 'fastify';
import type { CmnCanalesCfg, CmnCanalesInput, CmnDestinatarios, CmnEnviarReq, CmnEnviarRes, CmnEstado, CmnFiltro, CmnMensajeDto } from '@stodia/shared';
import { prisma } from '../../db';
import { saldoVencidoPorAlumno } from '../../lib/cxc';
import { audit } from '../../lib/audit';
import { canalesGet, canalesSet, correoListo, proveedorDe, verificarCorreo } from '../../lib/canales';
import { config } from '../../config';

const CANALES = ['Correo', 'Push', 'SMS', 'WhatsApp'];
const MAX_INTENTOS = 3;
const fmt = (n: number) => 'RD$ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Tutores destinatarios (uno por tutor aunque tenga varios hijos) con sus alumnos y saldo vencido. */
async function resolver(f: CmnFiltro) {
  const alumnos = await prisma.alumno.findMany({
    where: { estado: 'Activo', ...(f.grado ? { grado: f.grado } : {}), ...(f.tanda ? { tanda: f.tanda } : {}), ...(f.cuenta ? { cuenta: f.cuenta } : {}) },
    include: { tutor: true }, orderBy: { id: 'asc' },
  });
  const saldos = await saldoVencidoPorAlumno(alumnos.map(a => a.id));
  const por = new Map<string, { nombre: string; email: string; alumnos: string[]; saldo: number }>();
  for (const a of alumnos) {
    if (!a.tutor?.nombre) continue;
    const g = por.get(a.tutor.id) ?? { nombre: a.tutor.nombre, email: (a.tutor.email ?? '').trim(), alumnos: [], saldo: 0 };
    g.alumnos.push(a.nombres); g.saldo += saldos[a.id] ?? 0;
    por.set(a.tutor.id, g);
  }
  return { alumnos, saldos, tutores: [...por.values()] };
}

async function destinatarios(f: CmnFiltro): Promise<CmnDestinatarios> {
  const { alumnos, saldos, tutores } = await resolver(f);
  const a = alumnos.find(x => x.tutor?.nombre);
  const nombres = [...new Set(tutores.map(t => t.nombre))];
  return { tutores: nombres.slice(0, 20), total: nombres.length, muestra: a ? { tutor: a.tutor!.nombre, alumno: a.nombres, saldo: saldos[a.id] ?? 0 } : null };
}

const toDto = (m: { id: number; batch: string; t: string; to: string; canal: string; asunto: string; estado: string; by: string; error: string; intentos: number }) =>
  ({ id: m.id, batch: m.batch, t: m.t, to: m.to, canal: m.canal, asunto: m.asunto, estado: m.estado, by: m.by, error: m.error, intentos: m.intentos }) as CmnMensajeDto;

const errorReal = (e: unknown) => {
  const x = e as { code?: string; message?: string };
  return `${x.code ? x.code + ': ' : ''}${x.message ?? String(e)}`.slice(0, 300);
};

type Fila = { id: number; batch: string; canal: string; destino: string; asunto: string; cuerpo: string; intentos: number };

/** Procesa un mensaje en cola. Demo = simulación de la demo; real = proveedor del canal (SMTP). Nunca declara Entregado sin que el proveedor confirme. */
async function procesarUno(m: Fila, demo: boolean) {
  if (demo) {
    await prisma.cmnMensaje.update({ where: { id: m.id }, data: { estado: m.id % 9 === 4 && !m.batch.endsWith('~r') ? 'Fallido' : 'Entregado' } });
    return;
  }
  // Reclamo atómico En cola -> Enviando (dos /procesar simultáneos no envían dos veces el mismo mensaje).
  const claim = await prisma.cmnMensaje.updateMany({ where: { id: m.id, estado: 'En cola' }, data: { estado: 'Enviando' } });
  if (!claim.count) return;
  const prov = await proveedorDe(m.canal);
  if (!prov) { await prisma.cmnMensaje.update({ where: { id: m.id }, data: { estado: 'Canal no configurado', error: `Canal ${m.canal} no configurado` } }); return; }
  try {
    await prov.enviar({ destino: m.destino, asunto: m.asunto, cuerpo: m.cuerpo });
    await prisma.cmnMensaje.update({ where: { id: m.id }, data: { estado: 'Entregado', error: '', intentos: m.intentos + 1 } });
  } catch (e) {
    const intentos = m.intentos + 1;
    await prisma.cmnMensaje.update({ where: { id: m.id }, data: { estado: intentos >= MAX_INTENTOS ? 'Fallido' : 'En cola', error: errorReal(e), intentos } });
  }
}

const plugin: FastifyPluginAsync = async app => {
  const guard = { onRequest: [app.authenticate, app.requireRole('Super Admin', 'Director Académico')] };
  const sa = { onRequest: [app.authenticate, app.requireRole('Super Admin')] };

  app.get<{ Querystring: Partial<CmnFiltro> }>('/destinatarios', guard, async req =>
    destinatarios({ grado: req.query.grado ?? '', tanda: req.query.tanda ?? '', cuenta: req.query.cuenta ?? '' }));

  app.post<{ Body: CmnEnviarReq }>('/enviar', guard, async (req, reply): Promise<CmnEnviarRes | void> => {
    const { canales, asunto, mensaje } = req.body;
    if (!asunto?.trim() || !mensaje?.trim()) return reply.code(400).send({ error: 'Completa asunto y mensaje' });
    const cs = CANALES.filter(c => canales?.includes(c as never));
    if (!cs.length) return reply.code(400).send({ error: 'Elige al menos un canal' });
    const { tutores } = await resolver(req.body);
    if (!tutores.length) return reply.code(400).send({ error: 'El filtro no tiene destinatarios' });
    const cfg = await canalesGet();
    const batch = 'B' + Date.now().toString(36);
    const t = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const fill = (txt: string, d: (typeof tutores)[number]) => txt.replace(/\{tutor\}/g, d.nombre).replace(/\{alumno\}/g, d.alumnos.join(', ')).replace(/\{saldo\}/g, fmt(d.saldo));
    const data = tutores.flatMap(d => cs.map(canal => {
      // Estado honesto desde el origen: solo 'En cola' si hay un proveedor real (o modo demo explícito) que pueda enviarlo.
      let estado: CmnEstado = 'En cola', error = '';
      if (!cfg.demo) {
        if (canal === 'Correo' && correoListo(cfg.email)) { if (!d.email) { estado = 'Fallido'; error = 'El tutor no tiene correo registrado'; } }
        else { estado = 'Canal no configurado'; error = canal === 'Correo' ? 'Correo (SMTP) no configurado' : `Canal ${canal} sin proveedor configurado`; }
      }
      return { batch, t, to: d.nombre, canal, asunto: fill(asunto.trim(), d), cuerpo: fill(mensaje.trim(), d), destino: canal === 'Correo' ? d.email : '', estado, error, by: req.user.usuario };
    }));
    await prisma.cmnMensaje.createMany({ data });
    return { batch, total: data.length, enCola: data.filter(m => m.estado === 'En cola').length, sinCanal: data.filter(m => m.estado === 'Canal no configurado').length };
  });

  app.get<{ Querystring: { estado?: string } }>('/bandeja', guard, async req => {
    const [all, rows] = await Promise.all([
      prisma.cmnMensaje.groupBy({ by: ['estado'], _count: { _all: true } }),
      prisma.cmnMensaje.findMany({ where: req.query.estado ? { estado: req.query.estado } : {}, orderBy: [{ t: 'desc' }, { id: 'desc' }], take: 60 }),
    ]);
    const n = (e: string) => all.find(x => x.estado === e)?._count._all ?? 0;
    return {
      rows: rows.map(toDto),
      conteos: { todos: all.reduce((a, x) => a + x._count._all, 0), 'En cola': n('En cola'), Enviando: n('Enviando'), Entregado: n('Entregado'), Fallido: n('Fallido'), 'Canal no configurado': n('Canal no configurado') },
    };
  });

  /** Worker de envío: procesa hasta 4 mensajes en cola en paralelo (con topes de tiempo SMTP; no cuelga). Con canales.demo (solo SEED_DEMO) simula como la demo (id % 9 === 4 falla salvo reintento). */
  app.post<{ Querystring: { batch?: string } }>('/procesar', guard, async req => {
    const demo = (await canalesGet()).demo;
    const cola = await prisma.cmnMensaje.findMany({ where: { estado: 'En cola' }, orderBy: { id: 'asc' }, take: 4 });
    await Promise.all(cola.map(m => procesarUno(m, demo)));
    const batch = req.query.batch;
    const lote = batch ? await prisma.cmnMensaje.findMany({ where: { batch: { startsWith: batch } }, select: { estado: true } }) : [];
    const pend = (e: string) => e === 'En cola' || e === 'Enviando';
    return {
      restantes: await prisma.cmnMensaje.count({ where: { estado: { in: ['En cola', 'Enviando'] } } }),
      lote: { total: lote.length, hechos: lote.filter(x => !pend(x.estado)).length, fallidos: lote.filter(x => x.estado === 'Fallido').length, sinCanal: lote.filter(x => x.estado === 'Canal no configurado').length },
    };
  });

  /** Reencola los Fallidos y los 'Canal no configurado' cuyo canal ya está operativo. */
  app.post('/reintentar', guard, async () => {
    const cfg = await canalesGet();
    const filas = await prisma.cmnMensaje.findMany({ where: { estado: { in: ['Fallido', 'Canal no configurado'] } } });
    let n = 0;
    for (const m of filas) {
      if (m.estado === 'Canal no configurado' && !cfg.demo && !(m.canal === 'Correo' && correoListo(cfg.email) && m.destino)) continue;
      await prisma.cmnMensaje.update({ where: { id: m.id }, data: { estado: 'En cola', intentos: 0, error: '', batch: m.batch.endsWith('~r') ? m.batch : m.batch + '~r' } });
      n++;
    }
    return { reintentados: n };
  });

  // ---- Canales (Super Admin). SMS / WhatsApp / Push: sin proveedor implementado -> 'Canal no configurado'. ----
  const cfgCanales = async (): Promise<CmnCanalesCfg> => {
    const c = await canalesGet();
    return {
      email: { activo: c.email.activo, host: c.email.host, port: c.email.port, user: c.email.user, passSet: !!c.email.pass, from: c.email.from, fuente: c.fuente },
      sms: { activo: false, soportado: false }, whatsapp: { activo: false, soportado: false }, push: { activo: false, soportado: false },
      demo: c.demo, demoDisponible: config.seedDemo,
    };
  };
  app.get('/canales', sa, cfgCanales);
  app.put<{ Body: CmnCanalesInput }>('/canales', sa, async (req, reply) => {
    const b = req.body ?? {};
    const prev = await canalesGet();
    if (b.demo && !config.seedDemo) return reply.code(400).send({ error: 'El modo demo solo existe en instalaciones de demostración' });
    const e = b.email ?? {};
    const port = e.port === undefined ? undefined : Number(e.port);
    if (port !== undefined && !(Number.isInteger(port) && port > 0 && port < 65536)) return reply.code(400).send({ error: 'Puerto SMTP inválido' });
    const host = e.host === undefined ? prev.email.host : String(e.host).trim();
    const from = e.from === undefined ? prev.email.from : String(e.from).trim();
    if (e.activo && (!host || !/.+@.+/.test(from))) return reply.code(400).send({ error: 'Para activar el correo indica el servidor SMTP y un remitente (correo) válido' });
    await canalesSet({
      ...(b.demo !== undefined ? { demo: b.demo } : {}),
      email: {
        ...(e.activo !== undefined ? { activo: !!e.activo } : {}), ...(e.host !== undefined ? { host } : {}), ...(port !== undefined ? { port } : {}),
        ...(e.user !== undefined ? { user: String(e.user).trim() } : {}), ...(e.pass ? { pass: String(e.pass) } : {}), ...(e.from !== undefined ? { from } : {}),
      },
    });
    await audit(req.user, 'Update', { tabla: 'TenantConfig', id: 'canales', next: `correo ${e.activo === undefined ? 'sin cambio' : e.activo ? 'activo' : 'inactivo'}${b.demo !== undefined ? ' · demo ' + b.demo : ''}`, ip: req.ip });
    return cfgCanales();
  });
  /** Prueba la conexión/autenticación SMTP con la config vigente (no envía correo). */
  app.post('/canales/probar', sa, async (_req, reply) => {
    const c = (await canalesGet()).email;
    if (!c.host) return reply.code(400).send({ error: 'Falta el servidor SMTP' });
    try { await verificarCorreo(c); return { ok: true }; } catch (e) { return reply.code(502).send({ error: errorReal(e) }); }
  });
};
export default plugin;
