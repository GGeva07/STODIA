import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { Rol, ScreenId } from '@stodia/shared';
import { prisma } from '../../db';
import { audit } from '../../lib/audit';
import { cfgGet } from '../../lib/sisconfig';
import { dimensionesImagen, mimeReal } from '../../lib/firma-imagen';

export const prefix = ''; // /usuarios/:id/firma, /firmas y /documentos/firmas

/** Roles que firman documentos: Cajero (recibos / cuadre), Director Académico (documentos oficiales), Docente (records). */
const ROLES_FIRMANTES: Rol[] = ['Cajero', 'Director Académico', 'Docente'];
const MAX_BYTES = 300 * 1024;
const MAX_ANCHO = 1200;
const MAX_ALTO = 1200;
const DATA_URL = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

const dataUrl = (mime: string, data: Uint8Array) => `data:${mime};base64,${Buffer.from(data).toString('base64')}`;

const plugin: FastifyPluginAsync = async app => {
  const rd = { onRequest: [app.authenticate] };

  /** ¿Administra usuarios? Super Admin o un rol con la pantalla Catálogos en la matriz (ahí viven las cuentas de acceso). */
  const administra = async (req: FastifyRequest) => {
    if (req.user.rol === 'Super Admin') return true;
    const m = (await cfgGet('access')) as Record<string, ScreenId[]>;
    return !!m[req.user.rol]?.includes('catalogos');
  };

  /** Usuario destino (`me` = el propio; si no, id o login) y permiso: el propio usuario o quien administra usuarios. */
  type Dest = { u: NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>>; status?: undefined; error?: undefined } | { u?: undefined; status: number; error: string };
  const destino = async (req: FastifyRequest, ref: string): Promise<Dest> => {
    const u = ref === 'me'
      ? await prisma.user.findUnique({ where: { id: req.user.sub } })
      : (await prisma.user.findUnique({ where: { id: ref } })) ?? (await prisma.user.findUnique({ where: { usuario: ref } }));
    if (!u) return { status: 404, error: 'Usuario no encontrado' };
    if (u.id !== req.user.sub && !(await administra(req))) return { status: 403, error: 'Sin permiso' };
    return { u };
  };

  /** Lista de firmantes (Configuración › Firmas): solo quien administra usuarios. */
  app.get('/firmas', rd, async (req, reply) => {
    if (!(await administra(req))) return reply.code(403).send({ error: 'Sin permiso' });
    const us = await prisma.user.findMany({
      where: { rol: { in: ROLES_FIRMANTES }, estado: 'Activo' }, orderBy: [{ nombre: 'asc' }],
      select: { id: true, usuario: true, nombre: true, rol: true, firma: { select: { mime: true, updatedAt: true, updatedBy: true } } },
    });
    return us.map(u => ({ id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol, tiene: !!u.firma, mime: u.firma?.mime, updatedAt: u.firma?.updatedAt.toISOString(), updatedBy: u.firma?.updatedBy }));
  });

  /** Imagen de firma como data URL: solo el propio usuario o quien administra usuarios (los documentos usan /documentos/firmas). */
  app.get<{ Params: { id: string } }>('/usuarios/:id/firma', rd, async (req, reply) => {
    const d = await destino(req, req.params.id);
    if (!d.u) return reply.code(d.status).send({ error: d.error });
    const f = await prisma.userFirma.findUnique({ where: { userId: d.u.id } });
    if (!f) return reply.code(404).send({ error: 'Sin firma cargada' });
    return { usuario: d.u.usuario, nombre: d.u.nombre, mime: f.mime, dataUrl: dataUrl(f.mime, f.data), updatedAt: f.updatedAt.toISOString() };
  });

  /** Carga o reemplaza la firma. Body: { imagen: 'data:image/png;base64,...' } (PNG/JPG/WebP, máx. 300 KB y 1200 px de ancho; el tipo se valida por los bytes). */
  app.put<{ Params: { id: string }; Body: { imagen?: string } }>('/usuarios/:id/firma', rd, async (req, reply) => {
    const d = await destino(req, req.params.id);
    if (!d.u) return reply.code(d.status).send({ error: d.error });
    if (!ROLES_FIRMANTES.includes(d.u.rol as Rol)) return reply.code(422).send({ error: 'Solo cajeros, directores académicos y docentes tienen firma' });
    const img = req.body?.imagen;
    const m = typeof img === 'string' && img.length <= Math.ceil(MAX_BYTES * 4 / 3) + 100 ? DATA_URL.exec(img) : null;
    if (!m) return reply.code(422).send({ error: typeof img === 'string' && img.length > Math.ceil(MAX_BYTES * 4 / 3) + 100 ? 'La imagen supera 300 KB' : 'Imagen inválida: usa PNG, JPG o WebP' });
    const data = Buffer.from(m[1], 'base64');
    if (data.length > MAX_BYTES) return reply.code(422).send({ error: 'La imagen supera 300 KB' });
    const mime = mimeReal(data); // por los primeros bytes, no por lo que declare el data URL ni la extensión
    if (!mime) return reply.code(422).send({ error: 'El archivo no es una imagen PNG, JPG o WebP válida' });
    const dim = dimensionesImagen(data, mime);
    if (!dim) return reply.code(422).send({ error: 'No se pudo leer el tamaño de la imagen' });
    if (dim.w > MAX_ANCHO || dim.h > MAX_ALTO) return reply.code(422).send({ error: `La imagen mide ${dim.w}×${dim.h} px; el máximo es ${MAX_ANCHO} px de ancho (reduce la imagen e inténtalo de nuevo)` });
    const prev = await prisma.userFirma.findUnique({ where: { userId: d.u.id }, select: { mime: true } });
    await prisma.userFirma.upsert({
      where: { userId: d.u.id },
      create: { userId: d.u.id, mime, data, updatedBy: req.user.usuario },
      update: { mime, data, updatedBy: req.user.usuario },
    });
    await audit(req.user, prev ? 'Update' : 'Insert', { tabla: 'UserFirma', id: d.u.usuario, prev: prev ? 'firma cargada' : 'sin firma', next: `${mime} ${dim.w}x${dim.h} ${data.length} B`, ip: req.ip });
    return { ok: true, mime, ancho: dim.w, alto: dim.h, bytes: data.length };
  });

  app.delete<{ Params: { id: string } }>('/usuarios/:id/firma', rd, async (req, reply) => {
    const d = await destino(req, req.params.id);
    if (!d.u) return reply.code(d.status).send({ error: d.error });
    const r = await prisma.userFirma.deleteMany({ where: { userId: d.u.id } });
    if (r.count) await audit(req.user, 'Delete', { tabla: 'UserFirma', id: d.u.usuario, prev: 'firma cargada', next: 'sin firma', ip: req.ip });
    return { ok: true };
  });

  // ---- Firmas para imprimir documentos (cualquier usuario autenticado que genere documentos; el Tutor ya está excluido por el plugin de auth) ----
  const conFirma = { select: { id: true, usuario: true, nombre: true, firma: { select: { mime: true, data: true } } } };
  type U = { usuario: string; nombre: string; firma: { mime: string; data: Uint8Array } | null };
  const salida = (u: U | null | undefined) => (u?.firma ? { usuario: u.usuario, nombre: u.nombre, dataUrl: dataUrl(u.firma.mime, u.firma.data) } : null);

  /** Cuenta por login o por nombre exacto; si el nombre es ambiguo (varias cuentas) no se adivina: sin firma. */
  const porRef = async (ref: string, roles?: Rol[]): Promise<U | null> => {
    const base = { estado: 'Activo', ...(roles ? { rol: { in: roles } } : {}) };
    const a = await prisma.user.findFirst({ where: { ...base, usuario: ref }, ...conFirma });
    if (a) return a;
    const b = await prisma.user.findMany({ where: { ...base, nombre: ref }, ...conFirma, take: 2 });
    return b.length === 1 ? b[0] : null;
  };

  /**
   * Regla de firmante (docs/firmas-documentos.md):
   *  - cajero   = quien emitió (login o nombre) · - docente = el del curso (login o nombre; se resuelve por la ficha Docente -> cuenta)
   *  - director = el Director Académico ACTIVO con firma cargada, primero por login (orden estable); sin ninguno -> null.
   * Siempre responde 200; el que no tiene firma sale null y el documento se imprime con la línea en blanco.
   */
  app.get<{ Querystring: { cajero?: string; docente?: string; director?: string } }>('/documentos/firmas', rd, async req => {
    const { cajero, docente, director } = req.query;
    const out: Record<string, ReturnType<typeof salida>> = {};
    if (cajero) out.cajero = salida(await porRef(cajero.slice(0, 200)));
    if (docente) {
      const ref = docente.slice(0, 200);
      const fichas = await prisma.docente.findMany({ where: { estado: 'Activo', OR: [{ usuario: ref }, { nombre: ref }] }, select: { userId: true }, take: 3 });
      const ids = [...new Set(fichas.map(f => f.userId).filter((x): x is string => !!x))];
      const u = ids.length === 1 ? await prisma.user.findFirst({ where: { id: ids[0], estado: 'Activo' }, ...conFirma }) : !fichas.length ? await porRef(ref, ['Docente']) : null;
      out.docente = salida(u);
    }
    if (director) {
      const u = await prisma.user.findFirst({ where: { rol: 'Director Académico', estado: 'Activo', firma: { isNot: null } }, orderBy: { usuario: 'asc' }, ...conFirma });
      out.director = salida(u);
    }
    return out;
  });
};
export default plugin;
