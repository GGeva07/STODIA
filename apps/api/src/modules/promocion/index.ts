/**
 * PROMOCION / AVANCE DE CURSO por notas (lib/promocion.ts, docs/cierre-y-promocion.md). Separado del cierre contable del año (/config/ciclos/:n/eoy).
 * Solo Director / Super Admin: pantalla 'config' (requireScreen). No es una ruta «por ciclo» (lib/ciclo.PREFIJOS_POR_CICLO): el ciclo de origen va en `?origen=`.
 *   GET  /academico/promocion/config            parametros (SisConfig 'promocion')
 *   PUT  /academico/promocion/config            guarda parametros (auditado)
 *   GET  /academico/promocion/preview?origen=   VISTA PREVIA sin escribir (resultado por alumno y que haria «Aplicar»)
 *   POST /academico/promocion/aplicar           { origen?, esperado? } aplica la promocion (transaccion, idempotente, auditada)
 */
import type { FastifyPluginAsync } from 'fastify';
import type { CfgPromocion, PromocionAplicarReq, PromocionAplicarResp, PromocionPreview } from '@stodia/shared';
import { audit } from '../../lib/audit';
import { aplicarPromocion, cfgPromocion, evaluarPromocion, normalizarCfg } from '../../lib/promocion';
import { cfgSet } from '../../lib/sisconfig';

export const prefix = '/academico/promocion';

const plugin: FastifyPluginAsync = async app => {
  // Errores: PromocionError (statusCode) y CicloError los traduce el manejador global de app.ts a { error } con su codigo HTTP.
  const cfg = { onRequest: [app.authenticate, app.requireScreen('config')] };

  app.get('/config', cfg, async (): Promise<CfgPromocion> => cfgPromocion());

  app.put<{ Body: Partial<CfgPromocion> }>('/config', cfg, async (req, reply) => {
    const cur = await cfgPromocion(), next = normalizarCfg(cur, req.body ?? {});
    if (typeof next === 'string') return reply.code(400).send({ error: next });
    await cfgSet('promocion', next);
    await audit(req.user, 'Update', { tabla: 'TenantConfig', id: 'promocion', prev: JSON.stringify(cur), next: JSON.stringify(next), ip: req.ip });
    return next;
  });

  app.get<{ Querystring: { origen?: string } }>('/preview', cfg, async (req): Promise<PromocionPreview> => (await evaluarPromocion(req.query.origen)).preview);

  app.post<{ Body: PromocionAplicarReq }>('/aplicar', cfg, async (req): Promise<PromocionAplicarResp> => {
    const r = await aplicarPromocion(req.body?.origen, req.user.usuario, req.body?.esperado);
    const preview = (await evaluarPromocion(req.body?.origen)).preview;
    const c = r.conteos;
    await audit(req.user, 'Insert', {
      tabla: 'PromocionCiclo', id: String(r.id),
      next: `${preview.origen} → ${preview.destino} · ${c.aprobados} aprobados, ${c.reprobados} reprobados, ${c.pendientes} pendientes, ${c.graduados} graduados, ${c.sinSeccion} sin sección · matrículas: ${r.creadas} creadas, ${r.ajustadas} ajustadas · nota mínima ${preview.cfg.notaMinima} (${preview.cfg.criterio})`,
      ip: req.ip,
    });
    return { ...r, preview };
  });
};
export default plugin;
