import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { AcadCatalogos, Rol } from '@stodia/shared';
import { prisma } from '../../db';
import { audit } from '../../lib/audit';
import { borrarTipo, cambiarEstado, dependencias, guardarTipo, leerTipo, parseCrit, type TipoTipado } from '../../lib/catalogos-tipados';

/**
 * Catálogos maestros. TODOS viven en tablas tipadas con FK (lib/catalogos-tipados.ts): Fase 2A (grados, tandas, aulas, secciones, materias, rúbricas,
 * docentes, staff) y Fase 2B (cajas, rutas, tipos y conceptos de beca, métodos de pago, comidas, dietas, alergias). La tabla genérica Catalogo ya no se
 * usa. La forma de respuesta es la misma de siempre para todos: `{ id, estado, ...campos }`.
 */
type Row = { id: string; estado: string } & Record<string, unknown>;
interface Field { k: string; l: string; t?: 'int' | 'time' | 'select' | 'multi' | 'ref' | 'password' | 'role' | 'info' | 'bool' | 'pct'; req?: 1; ref?: string; upper?: 1; opts?: string[] }
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
  conceptosBeca: { uniq: [['nombre']], fields: [{ k: 'nombre', l: 'Concepto', req: 1 }] },
  rutas: { uniq: [['nombre'], ['ficha']], fields: [{ k: 'nombre', l: 'Ruta', req: 1 }, { k: 'sectores', l: 'Sectores' }, { k: 'chofer', l: 'Chofer', req: 1 }, { k: 'ficha', l: 'Ficha', req: 1, upper: 1 }, { k: 'asientos', l: 'Asientos', t: 'int', req: 1 }, { k: 'tarifa', l: 'Tarifa', t: 'int', req: 1 }] },
  // Fase 2B: tipos de beca, medios de pago y catálogos de Alimentación (sin pantalla propia en Catálogos: los consumen Becas, Cobros y Alimentación).
  becas: { uniq: [['nombre']], fields: [{ k: 'nombre', l: 'Tipo de beca', req: 1 }, { k: 'pct', l: 'Porcentaje', t: 'pct' }, { k: 'aprobacion', l: 'Requiere aprobación', t: 'bool' }] },
  metodosPago: { uniq: [['nombre']], fields: [{ k: 'nombre', l: 'Medio de pago', req: 1 }, { k: 'ref', l: 'Etiqueta de la referencia' }] },
  comidas: { uniq: [['nombre']], fields: [{ k: 'nombre', l: 'Comida', req: 1 }] },
  dietas: { uniq: [['nombre']], fields: [{ k: 'nombre', l: 'Dieta', req: 1 }] },
  alergias: { uniq: [['nombre']], fields: [{ k: 'nombre', l: 'Alergia', req: 1 }] },
};
const ALFA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
/** Contraseña temporal aleatoria (CSPRNG, sin caracteres ambiguos). */
const clave = () => Array.from({ length: 10 }, () => ALFA[randomInt(ALFA.length)]).join('');
const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const plugin: FastifyPluginAsync = async app => {
  const rd = { onRequest: [app.authenticate] };
  const wr = { onRequest: [app.authenticate, app.requireRole('Super Admin')] };

  /** Filas de un tipo con la forma histórica (secciones con su `insc` calculado: alumnos no Retirados con esa sección). */
  const list = async (tipo: string, interno = false): Promise<Row[]> => (await leerTipo(tipo as TipoTipado, { insc: tipo === 'secciones', interno })) as Row[];
  const all = async (): Promise<AcadCatalogos> => Object.fromEntries(await Promise.all(Object.keys(DEFS).map(async t => [t, await list(t)])));
  /** Fila tal cual quedó guardada (sin contadores calculados). */
  const reread = async (tipo: string, id: string): Promise<Row | undefined> => (await leerTipo(tipo as TipoTipado)).find(r => r.id === id) as Row | undefined;

  app.get('/', rd, all);
  app.get<{ Params: { tipo: string } }>('/:tipo', rd, async (req, reply) => {
    const { tipo } = req.params;
    if (!DEFS[tipo]) return reply.code(404).send({ error: 'Catálogo desconocido' });
    return list(tipo);
  });

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
      if (f.t === 'pct') { const n = empty ? 0 : Number(val); if (!Number.isFinite(n) || n < 0 || n > 100) return { err: `${f.l}: debe estar entre 0 y 100` }; val = n; }
      if (f.t === 'bool') val = val === true || val === 'true' || val === 1;
      if (f.t === 'time' && !empty && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(val))) return { err: `${f.l}: formato HH:MM (24 h)` };
      if (f.t === 'select' && !empty && !f.opts!.includes(String(val))) return { err: `${f.l}: valor inválido` };
      if (f.t === 'role' && !ROLES.includes(val as Rol)) return { err: `${f.l}: rol inválido` };
      if (f.t === 'multi') val = Array.isArray(val) ? [...new Set(val.map(String))] : [];
      // Las referencias a catálogos deben existir (con FK real un id inexistente se rechaza aquí con un mensaje claro, no con un error de base de datos).
      if (f.t === 'ref' && !empty && f.ref && !cat[f.ref]?.some(r => r.id === val)) return { err: `${f.l}: valor inválido` };
      if (f.t === 'multi' && f.ref && (val as string[]).some(x => !cat[f.ref!]?.some(r => r.id === x))) return { err: `${f.l}: contiene valores inválidos` };
      v[f.k] = val ?? '';
    }
    const estados = def.estados ?? ['Activo', 'Inactivo'];
    v.estado = estados.includes(String(b.estado)) ? b.estado : estados[0];
    if (tipo === 'rubricas') {
      const cs = parseCrit(String(v.crit));
      if (!cs) return { err: 'Criterios: usa el formato «Nombre 20%, Nombre 30%»' };
      const sum = Math.round(cs.reduce((a, c) => a + c.w, 0));
      if (sum !== 100) return { err: `Criterios: los pesos suman ${sum}%; deben sumar 100%` };
      for (const mid of v.materias as string[]) {
        const otra = cat.rubricas.find(r => r.id !== id && r.estado === 'Activo' && (r.materias as string[]).includes(mid));
        if (otra) return { err: `La materia «${cat.materias.find(m => m.id === mid)?.nombre}» ya usa la rúbrica «${otra.nombre}»; una materia tiene una sola rúbrica activa` };
      }
    }
    for (const combo of def.uniq) {
      const dup = cat[tipo].find(r => r.id !== id && combo.every(c => norm(r[c]) === norm(v[c])));
      if (dup) return { err: `Ya existe un registro con ese ${combo[combo.length - 1]}` };
    }
    // Docentes y empleados comparten la tabla de usuarios: el usuario debe ser único entre ambos (y entre sus cuentas ya creadas).
    if (def.user) {
      const otro = (tipo === 'docentes' ? cat.staff : cat.docentes).find(r => norm(r.usuario) === norm(v.usuario));
      if (otro) return { err: `Ya existe un registro con ese usuario (${tipo === 'docentes' ? 'empleado' : 'docente'} «${otro.nombre}»)` };
    }
    if (tipo === 'secciones') {
      const cap = Number(v.cap), aula = cat.aulas.find(a => a.id === v.aula);
      if (cap < Number(v.insc ?? 0)) return { err: `Hay ${v.insc} alumnos inscritos; la capacidad no puede ser menor` };
      if (aula && cap > Number(aula.pupitres)) return { err: `${aula.nombre} solo tiene ${aula.pupitres} pupitres` };
    }
    if (tipo === 'tandas' && String(v.fin) <= String(v.ini)) return { err: 'La hora de salida debe ser posterior a la de entrada' };
    return { v: v as Row, prev, pwd: typeof v.password === 'string' ? v.password : '' };
  };

  /** Dueño de una cuenta de login: docente/empleado distinto de `excepto`, o tutor. */
  const duenoDe = async (userId: string, excepto?: { tipo: string; id: string }) => {
    const [d, e, t] = await Promise.all([prisma.docente.findFirst({ where: { userId } }), prisma.empleado.findFirst({ where: { userId } }), prisma.tutor.findFirst({ where: { userId } })]);
    if (d && !(excepto?.tipo === 'docentes' && excepto.id === d.id)) return `docente «${d.nombre}»`;
    if (e && !(excepto?.tipo === 'staff' && excepto.id === e.id)) return `empleado «${e.nombre}»`;
    if (t) return `tutor «${t.nombre}»`;
    return '';
  };
  const userIdDe = async (tipo: string, id: string): Promise<string | null> =>
    tipo === 'docentes' ? (await prisma.docente.findUnique({ where: { id }, select: { userId: true } }))?.userId ?? null : (await prisma.empleado.findUnique({ where: { id }, select: { userId: true } }))?.userId ?? null;

  const upsert = async (tipo: string, body: Record<string, unknown>, id: string | null, reply: { code: (n: number) => { send: (b: unknown) => unknown } }, req: FastifyRequest) => {
    if (!DEFS[tipo]) return reply.code(404).send({ error: 'Catálogo desconocido' });
    const r = await validate(tipo, body, id);
    if (r.err) return reply.code(422).send({ error: r.err });
    const { pwd } = r;
    if (pwd && pwd.length < 8) return reply.code(422).send({ error: 'Contraseña: mínimo 8 caracteres' });
    const { insc: _insc, password: _pw, ...prevSinCalc } = (r.prev ?? {}) as Record<string, unknown>;
    // Se conservan los campos que el formulario no edita (p. ej. teléfono/correo del empleado) y se aplican los validados.
    const row = { ...prevSinCalc, ...(r.v as Row), id: id ?? tipo[0] + Date.now().toString(36) } as Row;
    delete (row as Record<string, unknown>).insc; delete (row as Record<string, unknown>).password; // el contador se calcula; el hash vive solo en User
    let userRow: { id: string } | null = null;
    if (DEFS[tipo].user) {
      // Cuenta de login enlazada: la existente (solo cambia lo que el formulario edita) o la que se crea al fijar contraseña.
      const userIdActual = id ? await userIdDe(tipo, id) : null;
      const usuario = String(row.usuario);
      if (userIdActual) {
        const u = await prisma.user.findUnique({ where: { id: userIdActual } });
        if (u && norm(u.usuario) !== norm(usuario)) return reply.code(422).send({ error: 'El usuario de una cuenta ya creada no se puede cambiar' });
      }
      if (pwd) {
        const ex = await prisma.user.findUnique({ where: { usuario } });
        if (ex && ex.id !== userIdActual) { const due = await duenoDe(ex.id, id ? { tipo, id } : undefined); if (due) return reply.code(409).send({ error: `El usuario «${usuario}» ya pertenece al ${due}` }); }
      }
    }
    const prevRow = r.prev ? ({ ...r.prev } as Row) : null;
    if (DEFS[tipo].user && pwd) {
      // Docentes/empleados con contraseña: se crea o actualiza su usuario de login y se enlaza (Docente/Empleado.userId).
      const passwordHash = await bcrypt.hash(pwd, 10), u = { nombre: String(row.nombre), rol: String(row.rol), passwordHash };
      userRow = await prisma.user.upsert({ where: { usuario: String(row.usuario) }, update: u, create: { usuario: String(row.usuario), ...u } });
      (row as Record<string, unknown>).userId = userRow.id;
    } else if (DEFS[tipo].user && id) {
      const uid = await userIdDe(tipo, id);
      if (uid) await prisma.user.update({ where: { id: uid }, data: { nombre: String(row.nombre), rol: String(row.rol) } });
    }
    await guardarTipo(tipo as TipoTipado, row, prevRow);
    const out = (await reread(tipo, row.id))!;
    await audit(req.user, id ? 'Update' : 'Insert', { tabla: 'Catalogos/' + tipo, id: row.id, prev: r.prev ? JSON.stringify({ ...r.prev, password: undefined }).slice(0, 200) : undefined, next: JSON.stringify({ ...out, password: undefined }).slice(0, 200), ip: req.ip });
    return out;
  };

  app.post<{ Params: { tipo: string }; Body: Record<string, unknown> }>('/:tipo', wr, (req, reply) => upsert(req.params.tipo, req.body, null, reply, req));
  app.put<{ Params: { tipo: string; id: string }; Body: Record<string, unknown> }>('/:tipo/:id', wr, (req, reply) => upsert(req.params.tipo, req.body, req.params.id, reply, req));

  /** Dependientes (por las FK reales) que impiden eliminar: con historial el catálogo se DESACTIVA, no se elimina. */
  const deps = async (tipo: string, id: string): Promise<string[]> => dependencias(tipo as TipoTipado, id);
  /** El último medio de pago activo no se puede quitar: sin él no se puede cobrar. */
  const ultimoMetodo = async (tipo: string, id: string) => tipo === 'metodosPago' && !(await prisma.metodoPago.count({ where: { estado: 'Activo', id: { not: id } } }));

  app.delete<{ Params: { tipo: string; id: string } }>('/:tipo/:id', wr, async (req, reply) => {
    const { tipo, id } = req.params;
    if (!DEFS[tipo]) return reply.code(404).send({ error: 'Catálogo desconocido' });
    if (!(await reread(tipo, id))) return reply.code(404).send({ error: 'Registro no encontrado' });
    if (await ultimoMetodo(tipo, id)) return reply.code(409).send({ error: 'Debe existir al menos un medio de pago activo.' });
    const d = await deps(tipo, id);
    if (d.length) return reply.code(409).send({ error: 'No se puede eliminar: otros registros dependen de él (' + d.join('; ') + '). Desactívalo en su lugar.' });
    try {
      await borrarTipo(tipo as TipoTipado, id);
    } catch (e) {
      // Red de seguridad: una FK que la comprobación anterior no previó (error 547 / P2003) también se traduce a un 409 amistoso.
      if ((e as { code?: string }).code === 'P2003' || /FOREIGN KEY|constraint/i.test((e as Error).message)) return reply.code(409).send({ error: 'No se puede eliminar: otros registros dependen de él. Desactívalo en su lugar.' });
      throw e;
    }
    await audit(req.user, 'Delete', { tabla: 'Catalogos/' + tipo, id, ip: req.ip });
    return { ok: true };
  });

  // ---- Acceso (usuario de login) de docentes/empleados: contraseña temporal aleatoria, cambio obligatorio en el primer ingreso ----
  type Acceso = { tipo: string; id: string; nombre: string; usuario: string; rol: string; password: string; creado: boolean };
  /** Crea (o restablece, si el registro ya tiene acceso) el usuario del registro. Devuelve la clave en claro UNA vez; solo se guarda el hash. */
  const darAcceso = async (tipo: string, row: Row, req: FastifyRequest): Promise<Acceso | { err: string }> => {
    const usuario = String(row.usuario ?? '').trim(), rol = String(row.rol ?? '');
    if (!usuario) return { err: 'El registro no tiene usuario' };
    if (!ROLES.includes(rol as Rol)) return { err: 'Rol inválido' };
    if (!/^Activ/.test(row.estado)) return { err: 'El registro está inactivo' };
    const ex = await prisma.user.findUnique({ where: { usuario } }), tenia = !!row.password;
    if (ex && !tenia) return { err: `El usuario «${usuario}» ya pertenece a otra cuenta; cámbialo antes de crear el acceso` };
    const password = clave(), passwordHash = await bcrypt.hash(password, 10);
    let uid: string;
    if (ex) { await prisma.user.update({ where: { id: ex.id }, data: { passwordHash, nombre: String(row.nombre), rol, estado: 'Activo', mustChange: true } }); uid = ex.id; }
    else uid = (await prisma.user.create({ data: { usuario, nombre: String(row.nombre), rol, passwordHash, mustChange: true } })).id;
    if (tipo === 'docentes') await prisma.docente.update({ where: { id: row.id }, data: { userId: uid, usuario: null } });
    else await prisma.empleado.update({ where: { id: row.id }, data: { userId: uid, usuario: null } });
    await audit(req.user, ex ? 'Update' : 'Insert', { tabla: 'Usuarios/' + tipo, id: usuario, prev: ex ? '••••' : '—', next: ex ? 'Contraseña temporal restablecida' : 'Acceso creado (contraseña temporal)', ip: req.ip });
    return { tipo, id: row.id, nombre: String(row.nombre), usuario, rol, password, creado: !ex };
  };
  const conUsuario = (tipo: string) => !!DEFS[tipo]?.user;

  app.post<{ Params: { tipo: string; id: string } }>('/:tipo/:id/acceso', wr, async (req, reply) => {
    const { tipo, id } = req.params;
    if (!conUsuario(tipo)) return reply.code(404).send({ error: 'Catálogo desconocido' });
    const cur = (await list(tipo)).find(r => r.id === id);
    if (!cur) return reply.code(404).send({ error: 'Registro no encontrado' });
    const r = await darAcceso(tipo, cur, req);
    return 'err' in r ? reply.code(409).send({ error: r.err }) : r;
  });

  /** Docentes/empleados activos sin acceso: sin cuenta enlazada y sin ninguna cuenta con ese usuario (las existentes nunca se tocan). */
  const pendientes = async () => {
    const users = new Set((await prisma.user.findMany({ select: { usuario: true } })).map(u => u.usuario)), out: { tipo: string; row: Row }[] = [];
    for (const tipo of ['docentes', 'staff']) for (const row of await list(tipo)) {
      const u = String(row.usuario ?? '').trim();
      if (!row.password && /^Activ/.test(row.estado) && u && !users.has(u)) { out.push({ tipo, row }); users.add(u); }
    }
    return out;
  };
  app.get('/acceso/pendientes', rd, async () => ({ n: (await pendientes()).length }));

  /** Crea el acceso de TODOS los docentes/empleados activos que aún no lo tienen, con contraseña temporal aleatoria. */
  app.post('/acceso/pendientes', wr, async req => {
    const creados: Acceso[] = [], omitidos: { nombre: string; motivo: string }[] = [];
    for (const { tipo, row } of await pendientes()) {
      const r = await darAcceso(tipo, row, req);
      if ('err' in r) omitidos.push({ nombre: String(row.nombre), motivo: r.err }); else creados.push(r);
    }
    return { creados, omitidos };
  });

  app.post<{ Params: { tipo: string; id: string } }>('/:tipo/:id/desactivar', wr, async (req, reply) => {
    const { tipo, id } = req.params;
    const cur = DEFS[tipo] && (await list(tipo)).find(r => r.id === id);
    if (!cur) return reply.code(404).send({ error: 'Registro no encontrado' });
    const estados = DEFS[tipo].estados ?? ['Activo', 'Inactivo'];
    const estado = estados[estados.length - 1];
    if (await ultimoMetodo(tipo, id)) return reply.code(409).send({ error: 'Debe existir al menos un medio de pago activo.' });
    await cambiarEstado(tipo as TipoTipado, id, estado);
    const row = (await reread(tipo, id))!;
    await audit(req.user, 'Update', { tabla: 'Catalogos/' + tipo, id, prev: cur.estado, next: row.estado, ip: req.ip });
    return row;
  });
};
export default plugin;
