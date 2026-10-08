import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import bcrypt from 'bcryptjs';
import type { AcadCatalogos, Rol } from '@stodia/shared';
import { prisma } from '../../db';
import { audit } from '../../lib/audit';

/** Catálogos maestros sobre la tabla genérica Catalogo (id = '<tipo>:<id>', data = JSON del registro). */
type Row = { id: string; estado: string } & Record<string, unknown>;
interface Field { k: string; l: string; t?: 'int' | 'time' | 'select' | 'multi' | 'ref' | 'password' | 'role' | 'info'; req?: 1; ref?: string; upper?: 1; opts?: string[] }
interface Def { fields: Field[]; uniq: string[][]; estados?: string[]; user?: boolean }

const ROLES: Rol[] = ['Super Admin', 'Director Académico', 'Docente', 'Cajero', 'Encargado Comedor'];
const DEFS: Record<string, Def> = {
  grados: { uniq: [['nivel', 'grado'], ['orden']], fields: [{ k: 'nivel', l: 'Nivel', t: 'select', opts: ['Inicial', 'Primaria', 'Secundaria'], req: 1 }, { k: 'grado', l: 'Grado', req: 1 }, { k: 'orden', l: 'Orden de promoción', t: 'int', req: 1 }] },
  secciones: { uniq: [['grado', 'seccion', 'tanda']], fields: [{ k: 'grado', l: 'Grado', t: 'ref', ref: 'grados', req: 1 }, { k: 'seccion', l: 'Sección', req: 1, upper: 1 }, { k: 'tanda', l: 'Tanda', t: 'ref', ref: 'tandas', req: 1 }, { k: 'aula', l: 'Aula base', t: 'ref', ref: 'aulas' }, { k: 'cap', l: 'Capacidad máxima', t: 'int', req: 1 }, { k: 'insc', l: 'Inscritos', t: 'info' }] },
  tandas: { uniq: [['nombre']], fields: [{ k: 'nombre', l: 'Nombre', req: 1 }, { k: 'ini', l: 'Hora de entrada', t: 'time', req: 1 }, { k: 'fin', l: 'Hora de salida', t: 'time', req: 1 }] },
  materias: { uniq: [['codigo']], fields: [{ k: 'codigo', l: 'Código', req: 1, upper: 1 }, { k: 'nombre', l: 'Nombre', req: 1 }, { k: 'grados', l: 'Grados', t: 'multi', ref: 'grados', req: 1 }, { k: 'horas', l: 'Horas semanales', t: 'int', req: 1 }] },
  rubricas: { uniq: [['nombre']], fields: [{ k: 'nombre', l: 'Nombre', req: 1 }, { k: 'materias', l: 'Materias', t: 'multi', ref: 'materias', req: 1 }, { k: 'escala', l: 'Escala', t: 'select', opts: ['Numérica 0–100', 'Numérica 0–10', 'Literal A–F', 'Descriptiva (Logrado / En proceso)'], req: 1 }, { k: 'crit', l: 'Criterios y pesos', req: 1 }, { k: 'minimo', l: 'Nota mínima', t: 'int', req: 1 }] },
  docentes: { user: true, uniq: [['cedula'], ['usuario']], fields: [{ k: 'nombre', l: 'Nombre', req: 1 }, { k: 'cedula', l: 'Cédula', req: 1 }, { k: 'esp', l: 'Especialidad', req: 1 }, { k: 'email', l: 'Correo' }, { k: 'usuario', l: 'Usuario', req: 1 }, { k: 'password', l: 'Contraseña', t: 'password' }, { k: 'rol', l: 'Rol', t: 'role', req: 1 }, { k: 'materias', l: 'Materias', t: 'multi', ref: 'materias' }, { k: 'secciones', l: 'Secciones', t: 'multi', ref: 'secciones' }] },
  staff: { user: true, uniq: [['usuario']], fields: [{ k: 'nombre', l: 'Nombre', req: 1 }, { k: 'cargo', l: 'Cargo', req: 1 }, { k: 'usuario', l: 'Usuario', req: 1 }, { k: 'password', l: 'Contraseña', t: 'password' }, { k: 'rol', l: 'Rol', t: 'role', req: 1 }, { k: 'caja', l: 'Caja', t: 'ref', ref: 'cajas' }] },
  aulas: { uniq: [['nombre']], fields: [{ k: 'nombre', l: 'Nombre', req: 1 }, { k: 'tipo', l: 'Tipo', t: 'select', opts: ['Aula', 'Laboratorio', 'Cancha', 'Salón especial'], req: 1 }, { k: 'edif', l: 'Edificio' }, { k: 'pupitres', l: 'Pupitres', t: 'int', req: 1 }] },
  cajas: { uniq: [['codigo']], estados: ['Activa', 'Inactiva'], fields: [{ k: 'codigo', l: 'Código', req: 1 }, { k: 'ubic', l: 'Ubicación', req: 1 }, { k: 'ncf', l: 'Comprobante', t: 'select', opts: ['B02 · Consumo', 'B01 · Crédito fiscal'], req: 1 }] },
  rutas: { uniq: [['nombre'], ['ficha']], fields: [{ k: 'nombre', l: 'Ruta', req: 1 }, { k: 'sectores', l: 'Sectores' }, { k: 'chofer', l: 'Chofer', req: 1 }, { k: 'ficha', l: 'Ficha', req: 1, upper: 1 }, { k: 'asientos', l: 'Asientos', t: 'int', req: 1 }, { k: 'tarifa', l: 'Tarifa', t: 'int', req: 1 }] },
};
const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const parse = (r: { data: string; estado: string }): Row => ({ ...JSON.parse(r.data), estado: r.estado });

const plugin: FastifyPluginAsync = async app => {
  const rd = { onRequest: [app.authenticate] };
  const wr = { onRequest: [app.authenticate, app.requireRole('Super Admin')] };

  const list = async (tipo: string) => (await prisma.catalogo.findMany({ where: { tipo }, orderBy: { id: 'asc' } })).map(parse);
  const all = async (): Promise<AcadCatalogos> => Object.fromEntries(await Promise.all(Object.keys(DEFS).map(async t => [t, await list(t)])));
  const save = (tipo: string, r: Row) => prisma.catalogo.upsert({ where: { id: `${tipo}:${r.id}` }, update: { data: JSON.stringify(r), estado: r.estado }, create: { id: `${tipo}:${r.id}`, tipo, data: JSON.stringify(r), estado: r.estado } });

  app.get('/', rd, all);
  app.get<{ Params: { tipo: string } }>('/:tipo', rd, async (req, reply) => (DEFS[req.params.tipo] ? list(req.params.tipo) : reply.code(404).send({ error: 'Catálogo desconocido' })));

  /** Valida y normaliza `b` contra la definición; devuelve el primer error en español o el registro limpio. */
  const validate = async (tipo: string, b: Record<string, unknown>, id: string | null) => {
    const def = DEFS[tipo], cat = await all(), prev = id ? cat[tipo].find(r => r.id === id) : undefined, v: Record<string, unknown> = {};
    for (const f of def.fields) {
      if (f.t === 'info') { v[f.k] = prev?.[f.k] ?? 0; continue; }
      let val = b[f.k];
      if (f.t === 'password') { v[f.k] = val; continue; }
      if (typeof val === 'string') { val = val.trim(); if (f.upper) val = (val as string).toUpperCase(); }
      const empty = val === '' || val == null || (Array.isArray(val) && !val.length);
      if (f.req && empty) return { err: `${f.l}: campo requerido` };
      if (f.t === 'int' && !empty) { if (!/^\d+$/.test(String(val)) || Number(val) <= 0) return { err: `${f.l}: debe ser un número entero mayor que 0` }; val = Number(val); }
      if (f.t === 'time' && !empty && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(val))) return { err: `${f.l}: formato HH:MM (24 h)` };
      if (f.t === 'select' && !empty && !f.opts!.includes(String(val))) return { err: `${f.l}: valor inválido` };
      if (f.t === 'role' && !ROLES.includes(val as Rol)) return { err: `${f.l}: rol inválido` };
      if (f.t === 'multi') val = Array.isArray(val) ? val : [];
      v[f.k] = val ?? '';
    }
    const estados = def.estados ?? ['Activo', 'Inactivo'];
    v.estado = estados.includes(String(b.estado)) ? b.estado : estados[0];
    if (tipo === 'rubricas') {
      const sum = Math.round((String(v.crit).match(/(\d+(?:\.\d+)?)\s*%/g) ?? []).map(parseFloat).reduce((a, c) => a + c, 0));
      if (sum !== 100) return { err: `Criterios: los pesos suman ${sum}%; deben sumar 100%` };
    }
    for (const combo of def.uniq) {
      const dup = cat[tipo].find(r => r.id !== id && combo.every(c => norm(r[c]) === norm(v[c])));
      if (dup) return { err: `Ya existe un registro con ese ${combo[combo.length - 1]}` };
    }
    if (tipo === 'secciones') {
      const cap = Number(v.cap), aula = cat.aulas.find(a => a.id === v.aula);
      if (cap < Number(v.insc ?? 0)) return { err: `Hay ${v.insc} alumnos inscritos; la capacidad no puede ser menor` };
      if (aula && cap > Number(aula.pupitres)) return { err: `${aula.nombre} solo tiene ${aula.pupitres} pupitres` };
    }
    if (tipo === 'tandas' && String(v.fin) <= String(v.ini)) return { err: 'La hora de salida debe ser posterior a la de entrada' };
    return { v: v as Row, prev, pwd: typeof v.password === 'string' ? v.password : '' };
  };

  const upsert = async (tipo: string, body: Record<string, unknown>, id: string | null, reply: { code: (n: number) => { send: (b: unknown) => unknown } }, req: FastifyRequest) => {
    if (!DEFS[tipo]) return reply.code(404).send({ error: 'Catálogo desconocido' });
    const r = await validate(tipo, body, id);
    if (r.err) return reply.code(422).send({ error: r.err });
    const { pwd } = r;
    if (DEFS[tipo].user && !id && !pwd) return reply.code(422).send({ error: 'Contraseña: requerida para crear el usuario' });
    if (pwd && pwd.length < 8) return reply.code(422).send({ error: 'Contraseña: mínimo 8 caracteres' });
    const row: Row = { ...(r.v as Row), id: id ?? tipo[0] + Date.now().toString(36) };
    if (DEFS[tipo].user) row.password = pwd || r.prev?.password ? 'set' : ''; // marca; el hash vive solo en User
    if (tipo === 'secciones' && !id) row.insc = 0;
    await save(tipo, row);
    await audit(req.user, id ? 'Update' : 'Insert', { tabla: 'Catalogos/' + tipo, id: row.id, prev: r.prev ? JSON.stringify({ ...r.prev, password: undefined }).slice(0, 200) : undefined, next: JSON.stringify({ ...row, password: undefined }).slice(0, 200), ip: req.ip });
    if (DEFS[tipo].user && pwd) {
      // Docentes/empleados con contraseña: se crea o actualiza su usuario de login.
      const passwordHash = await bcrypt.hash(pwd, 10), u = { nombre: String(row.nombre), rol: String(row.rol), passwordHash };
      await prisma.user.upsert({ where: { usuario: String(row.usuario) }, update: u, create: { usuario: String(row.usuario), ...u } });
    }
    return row;
  };

  app.post<{ Params: { tipo: string }; Body: Record<string, unknown> }>('/:tipo', wr, (req, reply) => upsert(req.params.tipo, req.body, null, reply, req));
  app.put<{ Params: { tipo: string; id: string }; Body: Record<string, unknown> }>('/:tipo/:id', wr, (req, reply) => upsert(req.params.tipo, req.body, req.params.id, reply, req));

  /** Registros que referencian a `tipo:id` (para bloquear la eliminación). */
  const deps = async (tipo: string, id: string) => {
    const cat = await all(), out: string[] = [];
    for (const [t, d] of Object.entries(DEFS)) for (const f of d.fields.filter(x => x.ref === tipo)) {
      const n = cat[t].filter(r => (f.t === 'multi' ? ((r[f.k] as string[]) ?? []).includes(id) : r[f.k] === id)).length;
      if (n) out.push(`${n} en ${t} (${f.l.toLowerCase()})`);
    }
    return out;
  };

  app.delete<{ Params: { tipo: string; id: string } }>('/:tipo/:id', wr, async (req, reply) => {
    const { tipo, id } = req.params;
    if (!DEFS[tipo]) return reply.code(404).send({ error: 'Catálogo desconocido' });
    const d = await deps(tipo, id);
    if (d.length) return reply.code(409).send({ error: 'No se puede eliminar: otros registros dependen de él (' + d.join('; ') + '). Desactívalo en su lugar.' });
    await prisma.catalogo.deleteMany({ where: { id: `${tipo}:${id}` } });
    await audit(req.user, 'Delete', { tabla: 'Catalogos/' + tipo, id, ip: req.ip });
    return { ok: true };
  });

  app.post<{ Params: { tipo: string; id: string } }>('/:tipo/:id/desactivar', wr, async (req, reply) => {
    const { tipo, id } = req.params;
    const cur = DEFS[tipo] && (await list(tipo)).find(r => r.id === id);
    if (!cur) return reply.code(404).send({ error: 'Registro no encontrado' });
    const estados = DEFS[tipo].estados ?? ['Activo', 'Inactivo'];
    const row = { ...cur, estado: estados[estados.length - 1] };
    await save(tipo, row);
    await audit(req.user, 'Update', { tabla: 'Catalogos/' + tipo, id, prev: cur.estado, next: row.estado, ip: req.ip });
    return row;
  });
};
export default plugin;
