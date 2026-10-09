import { randomInt } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import type { TutorAccesoResp, TutorAlumnoOpt, TutorFicha, TutorHijo, TutorRow, TutoresResp } from '@stodia/shared';
import { prisma } from '../../db';
import { audit } from '../../lib/audit';
import { digits } from '../../lib/personas';
import { hoyISO, round2, saldoCuenta, zonaHoraria } from '../../lib/cxc';
import { canalesGet, correoListo, proveedorCorreo } from '../../lib/canales';
import { cfgGet } from '../../lib/sisconfig';
import { errorTutor, fmtCed, fmtTel } from '../../lib/tutor-datos';

/**
 * Pantalla «Tutores» (padres y tutores legales). Única fuente: tablas Tutor / Alumno (tutorId = financiero, tutorLegalId = legal).
 *  - Los tutores nacen en Inscripción (o aquí con «Nuevo tutor»); aquí se edita su contacto, se vinculan estudiantes y se gestiona el acceso al Portal Tutor.
 *  - Lectura y escritura: Super Admin, Director Académico y Cajero (las mismas pantallas que ACCESS). Todo cambio queda en Auditoría.
 */
const ESTADOS = ['Activo', 'Inactivo'];
const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nombreDe = (a: { nombres: string; apellidos: string }) => `${a.nombres} ${a.apellidos}`;


type Link = { id: string; code: string; nombres: string; apellidos: string; grado: string; sec: string; tanda: string; estado: string; tutorId: string };

/** Vínculos tutor→alumno: financiero (Alumno.tutorId) y legal (Alumno.tutorLegalId). */
async function vinculos() {
  const als = await prisma.alumno.findMany({ select: { id: true, code: true, nombres: true, apellidos: true, grado: true, sec: true, tanda: true, estado: true, tutorId: true, tutorLegalId: true } });
  const legal = new Map<string, string>();
  for (const a of als) if (a.tutorLegalId) legal.set(a.id, a.tutorLegalId);
  const hijosDe = new Map<string, { a: Link; fin: boolean; leg: boolean }[]>();
  const push = (tid: string, a: Link, k: 'fin' | 'leg') => {
    const arr = hijosDe.get(tid) ?? [];
    const x = arr.find(h => h.a.id === a.id);
    if (x) x[k] = true; else arr.push({ a, fin: k === 'fin', leg: k === 'leg' });
    hijosDe.set(tid, arr);
  };
  for (const a of als) { if (a.tutorId) push(a.tutorId, a, 'fin'); const l = legal.get(a.id); if (l) push(l, a, 'leg'); }
  return { als, legal, hijosDe };
}

type TutorDb = { id: string; nombre: string; cedula: string; parentesco: string; tipo: string; tel: string; email: string | null; rnc: string | null; userId: string | null; user?: { usuario: string } | null; estado: string };
const toRow = (t: TutorDb, hs: { a: Link }[] = []): TutorRow => ({
  id: t.id, nombre: t.nombre, cedula: fmtCed(t.cedula), parentesco: t.parentesco, tipo: t.tipo, tel: t.tel, email: t.email ?? '', rnc: t.rnc ?? '', usuario: t.user?.usuario ?? '', estado: t.estado,
  alumnos: hs.map(h => ({ id: h.a.id, nombre: nombreDe(h.a) })).sort((p, q) => p.nombre.localeCompare(q.nombre, 'es')),
});

const ALFA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const clave = () => Array.from({ length: 10 }, () => ALFA[randomInt(ALFA.length)]).join('');

const plugin: FastifyPluginAsync = async app => {
  const g = { onRequest: [app.authenticate, app.requireRole('Super Admin', 'Director Académico', 'Cajero')] };

  app.get<{ Querystring: { q?: string; page?: string; size?: string; conHijos?: string } }>('/', g, async (req): Promise<TutoresResp> => {
    const { q = '', conHijos } = req.query;
    const size = Math.min(200, Math.max(1, Number(req.query.size) || 50)), nq = norm(q.trim()), nd = digits(q);
    const [ts, { hijosDe }] = await Promise.all([prisma.tutor.findMany({ orderBy: { nombre: 'asc' }, include: { user: { select: { usuario: true } } } }), vinculos()]);
    const all = ts.map(t => toRow(t, hijosDe.get(t.id) ?? []));
    const rows = all.filter(r => {
      if (conHijos === '1' && !(hijosDe.get(r.id) ?? []).some(h => h.fin)) return false;
      if (!nq) return true;
      const hit = norm([r.nombre, r.parentesco, r.tipo, r.email, r.usuario, r.tel, r.cedula, ...r.alumnos.map(a => a.nombre), ...(hijosDe.get(r.id) ?? []).map(h => h.a.code)].join(' '));
      return hit.includes(nq) || (nd.length >= 3 && digits(r.cedula + r.tel).includes(nd));
    });
    const pages = Math.max(1, Math.ceil(rows.length / size)), page = Math.min(pages, Math.max(1, Number(req.query.page) || 1));
    return { rows: rows.slice((page - 1) * size, page * size), page, size, filtrados: rows.length, total: all.length };
  });

  /** Buscador de estudiantes para vincular (selector de «Estudiantes a cargo»). */
  app.get<{ Querystring: { q?: string } }>('/alumnos', g, async (req): Promise<TutorAlumnoOpt[]> => {
    const nq = norm((req.query.q ?? '').trim());
    const als = await prisma.alumno.findMany({ where: { estado: { not: 'Retirado' } }, include: { tutor: { select: { nombre: true } } }, orderBy: { apellidos: 'asc' } });
    return als.filter(a => !nq || norm(`${nombreDe(a)} ${a.code}`).includes(nq)).slice(0, 25)
      .map(a => ({ id: a.id, code: a.code, nombre: nombreDe(a), grado: a.grado, sec: a.sec, tutor: a.tutor?.nombre ?? '—' }));
  });

  const ficha = async (id: string): Promise<TutorFicha | null> => {
    const t = await prisma.tutor.findUnique({ where: { id }, include: { user: { select: { usuario: true, estado: true, mustChange: true } } } });
    if (!t) return null;
    const [{ hijosDe }, tz, cfg] = await Promise.all([vinculos(), zonaHoraria(), canalesGet()]);
    const hs = hijosDe.get(id) ?? [];
    const hoy = hoyISO(tz);
    const items = await prisma.finCobroItem.findMany({ where: { paid: false, alumnoId: { in: hs.filter(h => h.fin).map(h => h.a.id) } }, select: { alumnoId: true, monto: true, vence: true, est: true } });
    const hijos: TutorHijo[] = hs.map(h => {
      const x = saldoCuenta(items.filter(i => i.alumnoId === h.a.id), hoy); // misma regla que Portal, POS y Dashboard (lib/cxc)
      return { id: h.a.id, code: h.a.code, nombre: nombreDe(h.a), grado: h.a.grado, sec: h.a.sec, tanda: h.a.tanda, estado: h.a.estado, vinculo: (h.fin && h.leg ? 'Financiero y legal' : h.fin ? 'Financiero' : 'Legal') as TutorHijo['vinculo'], vencido: x.vencido, porVencer: x.porVencer };
    }).sort((p, q) => p.nombre.localeCompare(q.nombre, 'es'));
    const vencido = round2(hijos.reduce((a, h) => a + h.vencido, 0)), porVencer = round2(hijos.reduce((a, h) => a + h.porVencer, 0));
    const u = t.user;
    return {
      ...toRow(t, hs), hijos, saldo: { vencido, porVencer, total: round2(vencido + porVencer) },
      acceso: { usuario: u?.usuario ?? '', estado: !u ? 'Sin acceso' : u.estado === 'Activo' ? 'Activo' : 'Inactivo', cambioPendiente: !!u?.mustChange },
      correoListo: correoListo(cfg.email),
    };
  };
  app.get<{ Params: { id: string } }>('/:id', g, async (req, reply) => (await ficha(req.params.id)) ?? reply.code(404).send({ error: 'Tutor no encontrado' }));

  /** Valida y normaliza el cuerpo (mismos campos y mensajes que el formulario). */
  const validar = async (b: Record<string, unknown>, id: string | null) => {
    const s = (k: string) => (typeof b[k] === 'string' ? (b[k] as string).trim() : '');
    const v = { nombre: s('nombre'), cedula: fmtCed(s('cedula')), parentesco: s('parentesco'), tipo: s('tipo'), tel: fmtTel(s('tel')), email: s('email').toLowerCase(), rnc: s('rnc'), estado: ESTADOS.includes(s('estado')) ? s('estado') : 'Activo' };
    const e = errorTutor(v);
    if (e) return { err: e };
    const dup = await prisma.tutor.findUnique({ where: { cedula: digits(v.cedula) }, select: { id: true, nombre: true } });
    if (dup && dup.id !== id) return { err: `Cédula: ya existe: ${dup.nombre}` };
    const ids = Array.isArray(b.alumnos) ? [...new Set((b.alumnos as unknown[]).map(String))] : [];
    return { v, ids };
  };

  /** Aplica los vínculos con estudiantes. Devuelve un error en español o null. */
  const vincular = async (t: { id: string; tipo: string; cedula: string }, ids: string[], req: { user: { usuario: string }; ip: string }): Promise<string | null> => {
    const { als, hijosDe } = await vinculos();
    const byId = new Map(als.map(a => [a.id, a]));
    if (ids.some(i => !byId.has(i))) return 'Estudiantes a cargo: alguno ya no existe';
    const actuales = hijosDe.get(t.id) ?? [];
    const quitar = actuales.filter(h => !ids.includes(h.a.id)), nuevos = ids.filter(i => !actuales.some(h => h.a.id === i));
    const fin = quitar.find(h => h.fin);
    if (fin) return `${nombreDe(fin.a)} no puede quedar sin tutor financiero: asígnalo primero al tutor que lo recibirá.`;
    const ops = [];
    for (const h of quitar) { // solo vínculo legal: vuelve a su tutor financiero
      ops.push(prisma.alumno.update({ where: { id: h.a.id }, data: { tutorLegalId: h.a.tutorId } }));
      await audit(req.user, 'Update', { tabla: 'Tutores', id: `${t.id}/alumnos`, prev: nombreDe(h.a), next: 'Vínculo legal retirado', ip: req.ip });
    }
    const financiero = t.tipo.includes('Financiero'), academico = t.tipo.includes('cadémico');
    for (const i of nuevos) {
      const a = byId.get(i)!;
      if (financiero) {
        ops.push(prisma.alumno.update({ where: { id: i }, data: { tutorId: t.id } }));
        ops.push(prisma.finCobroItem.updateMany({ where: { alumnoId: i, paid: false }, data: { tutorId: t.id } }));
      }
      if (academico || !financiero) {
        ops.push(prisma.alumno.update({ where: { id: i }, data: { tutorLegalId: t.id } }));
      }
      await audit(req.user, 'Update', { tabla: 'Tutores', id: `${t.id}/alumnos`, prev: financiero && a.tutorId ? `Tutor ${a.tutorId}` : '—', next: nombreDe(a), ip: req.ip });
    }
    await prisma.$transaction(ops);
    return null;
  };

  app.post<{ Body: Record<string, unknown> }>('/', g, async (req, reply) => {
    const r = await validar(req.body ?? {}, null);
    if (r.err) return reply.code(422).send({ error: r.err });
    const { v, ids } = r as { v: NonNullable<typeof r.v>; ids: string[] };
    if (!ids.length) return reply.code(422).send({ error: 'Estudiantes a cargo: campo requerido' });
    const seq = Math.max(0, ...(await prisma.tutor.findMany({ select: { id: true } })).map(t => Number(t.id.replace(/\D/g, '')) || 0));
    const id = 'u' + (seq + 1);
    const t = await prisma.tutor.create({ data: { id, ...v, cedula: digits(v.cedula), email: v.email || null, rnc: v.rnc || null } });
    const err = await vincular(t, ids, req);
    if (err) { await prisma.tutor.delete({ where: { id } }); return reply.code(422).send({ error: err }); }
    await audit(req.user, 'Insert', { tabla: 'Tutores', id: fmtCed(t.cedula), prev: '—', next: `${t.nombre} · ${t.tipo}`, ip: req.ip });
    return ficha(id);
  });

  app.put<{ Params: { id: string }; Body: Record<string, unknown> }>('/:id', g, async (req, reply) => {
    const prev = await prisma.tutor.findUnique({ where: { id: req.params.id }, include: { user: { select: { id: true, usuario: true } } } });
    if (!prev) return reply.code(404).send({ error: 'Tutor no encontrado' });
    const r = await validar(req.body ?? {}, prev.id);
    if (r.err) return reply.code(422).send({ error: r.err });
    const { v, ids } = r as { v: NonNullable<typeof r.v>; ids: string[] };
    const tenia = (await vinculos()).hijosDe.get(prev.id) ?? [];
    if (!ids.length && tenia.length) return reply.code(422).send({ error: 'Estudiantes a cargo: campo requerido' });
    const err = await vincular({ id: prev.id, tipo: v.tipo, cedula: v.cedula }, ids, req);
    if (err) return reply.code(422).send({ error: err });
    const t = await prisma.tutor.update({ where: { id: prev.id }, data: { ...v, cedula: digits(v.cedula), email: v.email || null, rnc: v.rnc || null } });
    // Los cargos siguen al tutor por FK (tutorId): cambiar la cédula ya no obliga a reescribir la cartera.
    const campos = ['nombre', 'cedula', 'parentesco', 'tipo', 'tel', 'email', 'rnc', 'estado'] as const;
    for (const k of campos) { const f = (x: string | null) => (k === 'cedula' ? fmtCed(x ?? '') : String(x ?? '')); const a = f(prev[k]), b = f(t[k]); if (a !== b) await audit(req.user, 'Update', { tabla: 'Tutores', id: `${fmtCed(t.cedula)}/${k}`, prev: a || '—', next: b || '—', ip: req.ip }); }
    // Un tutor desactivado/reactivado arrastra su cuenta del portal.
    if (prev.estado !== t.estado && t.userId && t.estado === 'Inactivo') await prisma.user.updateMany({ where: { id: t.userId, rol: 'Tutor' }, data: { estado: 'Inactivo' } });
    return ficha(t.id);
  });

  app.delete<{ Params: { id: string } }>('/:id', g, async (req, reply) => {
    const t = await prisma.tutor.findUnique({ where: { id: req.params.id } });
    if (!t) return reply.code(404).send({ error: 'Tutor no encontrado' });
    const d = ((await vinculos()).hijosDe.get(t.id) ?? []).map(h => nombreDe(h.a));
    if (d.length) return reply.code(409).send({ error: `No se puede eliminar: ${d.length} estudiante(s) dependen de él (${d.slice(0, 4).join(', ')}${d.length > 4 ? '…' : ''}). Desactívalo en su lugar.` });
    // Sin alumnos, pero con historial propio (comprobantes, cargos a su nombre o pagos del portal): la FK NoAction impide borrarlo.
    const [rec, cob, ints] = await Promise.all([prisma.finRecibo.count({ where: { tutorId: t.id } }), prisma.finCobroItem.count({ where: { tutorId: t.id } }), prisma.mobPagoIntencion.count({ where: { tutorId: t.id } })]);
    if (rec || cob || ints) return reply.code(409).send({ error: `No se puede eliminar: tiene historial (${[rec && rec + ' recibo(s)', cob && cob + ' cargo(s)', ints && ints + ' pago(s) del portal'].filter(Boolean).join(', ')}). Desactívalo en su lugar.` });
    await prisma.tutor.delete({ where: { id: t.id } });
    if (t.userId) await prisma.user.deleteMany({ where: { id: t.userId, rol: 'Tutor' } });
    await audit(req.user, 'Delete', { tabla: 'Tutores', id: fmtCed(t.cedula), prev: t.nombre, next: 'Eliminado', ip: req.ip });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/:id/desactivar', g, async (req, reply) => {
    const t = await prisma.tutor.findUnique({ where: { id: req.params.id } });
    if (!t) return reply.code(404).send({ error: 'Tutor no encontrado' });
    await prisma.tutor.update({ where: { id: t.id }, data: { estado: 'Inactivo' } });
    if (t.userId) await prisma.user.updateMany({ where: { id: t.userId, rol: 'Tutor' }, data: { estado: 'Inactivo' } });
    await audit(req.user, 'Update', { tabla: 'Tutores', id: `${fmtCed(t.cedula)}/estado`, prev: t.estado, next: 'Inactivo', ip: req.ip });
    return ficha(t.id);
  });

  // ---- Acceso al Portal Tutor ----
  /** Crea (o restablece) el usuario del tutor con una contraseña temporal aleatoria: se muestra UNA vez y debe cambiarse en el primer ingreso. */
  app.post<{ Params: { id: string } }>('/:id/acceso', g, async (req, reply) => {
    const t = await prisma.tutor.findUnique({ where: { id: req.params.id }, include: { user: { select: { usuario: true } } } });
    if (!t) return reply.code(404).send({ error: 'Tutor no encontrado' });
    if (t.estado !== 'Activo') return reply.code(409).send({ error: 'El tutor está inactivo: actívalo antes de darle acceso al portal.' });
    const usuario = (t.user?.usuario || t.email || fmtCed(t.cedula)).trim().toLowerCase();
    const ex = await prisma.user.findUnique({ where: { usuario } });
    if (ex && (ex.rol !== 'Tutor' || (t.userId !== ex.id && (await prisma.tutor.count({ where: { userId: ex.id, NOT: { id: t.id } } })) > 0)))
      return reply.code(409).send({ error: `El usuario «${usuario}» ya pertenece a otra cuenta. Cambia el correo o la cédula del tutor.` });
    const password = clave();
    const passwordHash = await bcrypt.hash(password, 10);
    const cuenta = ex
      ? await prisma.user.update({ where: { id: ex.id }, data: { passwordHash, nombre: t.nombre, estado: 'Activo', mustChange: true } })
      : await prisma.user.create({ data: { usuario, nombre: t.nombre, rol: 'Tutor', passwordHash, mustChange: true } });
    await prisma.tutor.update({ where: { id: t.id }, data: { userId: cuenta.id } });
    await audit(req.user, ex ? 'Update' : 'Insert', { tabla: 'Usuarios/Tutor', id: usuario, prev: ex ? '••••' : '—', next: ex ? 'Contraseña temporal restablecida' : 'Acceso al Portal Tutor creado', ip: req.ip });

    let enviado = false, aviso = 'Entrégale las credenciales en persona o imprímelas: no se volverán a mostrar.';
    const cfg = (await canalesGet()).email;
    if (t.email && correoListo(cfg)) {
      try {
        const inst = (await cfgGet('perfil')).nombre || 'STODIA';
        await proveedorCorreo(cfg).enviar({ destino: t.email, asunto: `Acceso al Portal Tutor · ${inst}`, cuerpo: `Hola ${t.nombre},\n\nSe creó tu acceso al Portal Tutor de ${inst}.\n\nUsuario: ${usuario}\nContraseña temporal: ${password}\n\nAl ingresar por primera vez el sistema te pedirá cambiar la contraseña.` });
        enviado = true; aviso = `Credenciales enviadas a ${t.email}. También puedes imprimirlas.`;
      } catch { aviso = 'No se pudo enviar el correo; entrega las credenciales en persona o imprímelas.'; }
    }
    const res: TutorAccesoResp = { usuario, password, enviado, aviso, creado: !ex };
    return res;
  });

  app.post<{ Params: { id: string } }>('/:id/acceso/revocar', g, async (req, reply) => {
    const t = await prisma.tutor.findUnique({ where: { id: req.params.id }, include: { user: { select: { usuario: true } } } });
    if (!t?.userId || !t.user) return reply.code(404).send({ error: 'El tutor no tiene acceso al portal' });
    await prisma.user.updateMany({ where: { id: t.userId, rol: 'Tutor' }, data: { estado: 'Inactivo' } });
    await audit(req.user, 'Update', { tabla: 'Usuarios/Tutor', id: t.user.usuario, prev: 'Activo', next: 'Acceso revocado', ip: req.ip });
    return ficha(t.id);
  });
};
export default plugin;
