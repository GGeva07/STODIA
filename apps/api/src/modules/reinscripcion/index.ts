/**
 * REINSCRIPCION de alumnos existentes (Etapa B; lib/reinscripcion.ts, docs/cierre-y-promocion.md §6). Solo Director / Super Admin: pantalla 'config' (requireScreen).
 *   GET  /reinscripcion/config      politica (SisConfig 'reinscripcion')
 *   PUT  /reinscripcion/config      guarda la politica (auditado)
 *   PUT  /reinscripcion/limite      { ciclo, fecha|null } fecha limite de reinscripcion del ciclo destino (Ciclo.limiteReinscripcion)
 *   GET  /reinscripcion/preview     vista previa de «Abrir reinscripcion» (no escribe)
 *   POST /reinscripcion/abrir       abre la reinscripcion (idempotente)
 *   GET  /reinscripcion/listado     estado por alumno (Reservado / Confirmado / Vencido / Liberado)
 *   POST /reinscripcion/evaluar     evalua ahora las reservas vencidas (perdida de cupo si la politica esta activa; mora si no)
 *   POST /reinscripcion/reactivar   { alumnoId, limite?, pin } reactiva a un alumno liberado (clave de supervisor)
 */
import type { FastifyPluginAsync } from 'fastify';
import type { CfgReinscripcion, ReinscripcionAbrirResp, ReinscripcionEvalResp, ReinscripcionListado, ReinscripcionPreview, ReinscripcionReactivarReq } from '@stodia/shared';
import { audit } from '../../lib/audit';
import { generarMorasSeguro } from '../../lib/mora';
import { abrirReinscripcion, cfgReinscripcion, evaluarPerdidaCupo, fijarLimite, listarReinscripcion, normalizarCfgReins, reactivarAlumno, vistaPreviaApertura } from '../../lib/reinscripcion';
import { cfgSet } from '../../lib/sisconfig';
import { supervisorOk } from '../../lib/supervisor';

export const prefix = '/reinscripcion';

const plugin: FastifyPluginAsync = async app => {
  const cfg = { onRequest: [app.authenticate, app.requireScreen('config')] };

  app.get('/config', cfg, async (): Promise<CfgReinscripcion> => cfgReinscripcion());

  app.put<{ Body: Partial<CfgReinscripcion> }>('/config', cfg, async (req, reply) => {
    const cur = await cfgReinscripcion(), next = normalizarCfgReins(cur, req.body ?? {});
    if (typeof next === 'string') return reply.code(400).send({ error: next });
    await cfgSet('reinscripcion', next);
    await audit(req.user, 'Update', { tabla: 'TenantConfig', id: 'reinscripcion', prev: JSON.stringify(cur), next: JSON.stringify(next), ip: req.ip });
    return next;
  });

  app.put<{ Body: { ciclo?: string; fecha?: string | null } }>('/limite', cfg, async (req, reply) => {
    if (!req.body?.ciclo) return reply.code(400).send({ error: 'Indica el ciclo' });
    const fecha = await fijarLimite(req.body.ciclo, req.body.fecha ? String(req.body.fecha) : null, req.user.usuario);
    return { ciclo: req.body.ciclo, fecha };
  });

  app.get('/preview', cfg, async (): Promise<ReinscripcionPreview> => vistaPreviaApertura());

  app.post('/abrir', cfg, async (req): Promise<ReinscripcionAbrirResp> => abrirReinscripcion(req.user.usuario));

  app.get('/listado', cfg, async (): Promise<ReinscripcionListado> => listarReinscripcion());

  app.post('/evaluar', cfg, async (req): Promise<ReinscripcionEvalResp> => {
    const r = await evaluarPerdidaCupo({ usuario: req.user.usuario });
    await generarMorasSeguro({}, req.log); // sin perdida de cupo: la mora de las cuotas vencidas queda al dia
    return r;
  });

  app.post<{ Body: ReinscripcionReactivarReq }>('/reactivar', cfg, async (req, reply) => {
    if (!req.body?.alumnoId) return reply.code(400).send({ error: 'Indica el alumno' });
    if (!(await supervisorOk(req, req.body.pin, 'reinscripcion.reactivar'))) return reply.code(403).send({ error: 'Clave de supervisor inválida' });
    return reactivarAlumno(req.body.alumnoId, req.user.usuario, req.body.limite);
  });
};
export default plugin;
