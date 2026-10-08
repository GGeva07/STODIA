import { randomBytes } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../db';
import { audit } from '../../lib/audit';

export const prefix = ''; // /documentos/folios (autenticado) y /verificar/:folio (público)

const HEX64 = /^[0-9a-f]{64}$/;

/** Folio legible tipo BOL-2026-7K3QX9PA (sin caracteres ambiguos). */
function nuevoFolio(tipo: string) {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = randomBytes(8);
  const code = Array.from(b, x => A[x % A.length]).join('');
  return `${tipo.slice(0, 3).toUpperCase()}-${new Date().getFullYear()}-${code}`;
}

const plugin: FastifyPluginAsync = async app => {
  /** Registra folio + hash de documentos recién generados. Devuelve los folios asignados, en el mismo orden. */
  app.post<{ Body: { tipo: string; items: { hash: string; detalle?: string }[] } }>(
    '/documentos/folios', { onRequest: [app.authenticate] },
    async (req, reply) => {
      const { tipo, items } = req.body ?? ({} as never);
      if (typeof tipo !== 'string' || !/^[A-Za-z]{3,12}$/.test(tipo) || !Array.isArray(items) || !items.length || items.length > 2000)
        return reply.code(400).send({ error: 'Solicitud de folios inválida' });
      if (items.some(i => typeof i?.hash !== 'string' || !HEX64.test(i.hash))) return reply.code(400).send({ error: 'Hash SHA-256 inválido' });
      const data = items.map(i => ({ folio: nuevoFolio(tipo), tipo, hash: i.hash, detalle: String(i.detalle ?? '').slice(0, 200), emitidoPor: req.user.usuario }));
      await prisma.docFolio.createMany({ data });
      await audit(req.user, 'Insert', { tabla: 'DocFolio', id: data[0].folio, next: `${data.length} folio(s) ${tipo}`, ip: req.ip });
      return data.map(d => ({ folio: d.folio, tipo: d.tipo }));
    },
  );

  /** Verificación pública (sin autenticación): confirma que el folio existe y cuándo se emitió. Con ?hash= compara el contenido. */
  app.get<{ Params: { folio: string }; Querystring: { hash?: string } }>('/verificar/:folio', async (req, reply) => {
    const f = /^[A-Za-z0-9-]{6,40}$/.test(req.params.folio) ? await prisma.docFolio.findUnique({ where: { folio: req.params.folio.toUpperCase() } }) : null;
    if (!f) return reply.code(404).send({ valido: false, error: 'Folio no encontrado' });
    const h = (req.query.hash ?? '').toLowerCase();
    return {
      valido: true, folio: f.folio, tipo: f.tipo, fecha: f.createdAt.toISOString(), detalle: f.detalle,
      hashPrefijo: f.hash.slice(0, 16), ...(h ? { coincideHash: h === f.hash } : {}),
      aviso: 'Confirma que el sistema emitió este folio; no es una firma digital con certificado.',
    };
  });
};
export default plugin;
