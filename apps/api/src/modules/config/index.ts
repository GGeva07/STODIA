import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type { CfgFinanzas, CfgAssets, CfgNcf, CfgPerfil, ConfigGlobal, ModalidadFiscal, Rol, ScreenId, SecuenciaNuevaReq, TipoLogico } from '@stodia/shared';
import { prisma } from '../../db';
import { audit } from '../../lib/audit';
import { rncValido } from '../../lib/rnc';
import { CFG_DEFAULTS, cfgGet, cfgSet } from '../../lib/sisconfig';
import { CicloError, FORMATO_CICLO, crearCiclo, listarCiclos, nombreCiclo } from '../../lib/ciclo';
import { cerrarCiclo } from '../../lib/ciclo-cierre';
import { cambiarModalidad, editarSecuencia, eliminarSecuencia, listarSecuencias, listarTipos, modalidadesFiscales, ncfCompat, refrescarEstados, registrarSecuencia } from '../../lib/fiscal';
import { verificarPin } from '../../lib/supervisor';

const ROLES_BASE: Rol[] = ['Super Admin', 'Director Académico', 'Docente', 'Cajero', 'Encargado Comedor', 'Tutor'];
const bad = (r: FastifyReply, error: string) => r.code(400).send({ error });

const plugin: FastifyPluginAsync = async app => {
  const sa = { onRequest: [app.authenticate, app.requireRole('Super Admin')] };

  app.get('/', { onRequest: [app.authenticate] }, async (): Promise<ConfigGlobal> => {
    const [perfil, assets, ncf, ecf, ecfInfo, ciclos, access, finanzas, modalidadFiscal, tiposComprobante] = await Promise.all([cfgGet('perfil'), cfgGet('assets'), ncfCompat(), cfgGet('ecf'), cfgGet('ecfInfo'), listarCiclos(), cfgGet('access'), cfgGet('finanzas'), modalidadesFiscales(), listarTipos()]);
    return { perfil, assets, ncf, modalidadFiscal, tiposComprobante, ecf, ecfInfo, ciclos, finanzas: { ...CFG_DEFAULTS.finanzas, ...finanzas }, access, rolesBase: ROLES_BASE };
  });

  /** Configuración financiera de la instancia: cualquier usuario autenticado lee; solo Super Admin escribe. */
  app.get('/finanzas', { onRequest: [app.authenticate] }, async (): Promise<CfgFinanzas> => ({ ...CFG_DEFAULTS.finanzas, ...(await cfgGet('finanzas')) }));

  app.put<{ Body: Partial<CfgFinanzas> }>('/finanzas', sa, async (req, reply) => {
    const b = req.body ?? {}, cur = { ...CFG_DEFAULTS.finanzas, ...(await cfgGet('finanzas')) }, next: CfgFinanzas = { ...cur };
    const lim: Record<keyof CfgFinanzas, [number, number, string]> = {
      matricula: [0, 100_000_000, 'La matrícula'], inscripcion: [0, 100_000_000, 'La inscripción'], itbis: [0, 1, 'El ITBIS (fracción, p. ej. 0.18)'],
      recargoMoraPct: [0, 100, 'El recargo por mora (%)'], umbralConsumoIdentificado: [0, 1_000_000_000, 'El umbral de consumo identificado (RD$)'], descuentoProntoPct: [0, 100, 'El descuento por pronto pago (%)'], diaCorte: [0, 28, 'El día de corte'],
      notaPlazoDias: [0, 3650, 'El plazo para notas de crédito (días; 0 = sin plazo)'], notaCicloAnterior: [0, 1, 'Permitir notas sobre ciclos anteriores (0 o 1)'],
    };
    for (const k of Object.keys(lim) as (keyof CfgFinanzas)[]) {
      if (b[k] === undefined || b[k] === null || (b[k] as unknown) === '') continue;
      const v = Number(b[k]), [lo, hi, nombre] = lim[k];
      if (!Number.isFinite(v) || v < lo || v > hi) return bad(reply, `${nombre} debe estar entre ${lo} y ${hi}`);
      next[k] = k === 'diaCorte' || k === 'notaPlazoDias' || k === 'notaCicloAnterior' ? Math.round(v) : Math.round(v * 10000) / 10000;
    }
    await cfgSet('finanzas', next);
    await audit(req.user, 'Update', { tabla: 'TenantConfig', id: 'finanzas', prev: JSON.stringify(cur), next: JSON.stringify(next), ip: req.ip });
    return next;
  });

  app.put<{ Body: CfgPerfil }>('/perfil', sa, async (req, reply) => {
    const b = req.body ?? ({} as CfgPerfil);
    if (!b.nombre?.trim() || !rncValido(b.rnc)) return bad(reply, 'Razón social obligatoria y RNC de 9 u 11 dígitos');
    const prev = ((await cfgGet('perfil')) ?? {}) as CfgPerfil;
    // rncVerificado/razonSocial/... los escribe SOLO el instalador/servidor: del cuerpo se ignoran. Si el RNC cambia sin verificar, se limpian y rncVerificado pasa a false.
    const cambioRnc = String(prev.rnc ?? '').replace(/\D/g, '') !== String(b.rnc).replace(/\D/g, '');
    const { rncVerificado, rncVerificadoAt, rncEstado, razonSocial, nombreComercial, ...resto } = prev;
    const verif: Partial<CfgPerfil> = cambioRnc ? { rncVerificado: false } : { rncVerificado, rncVerificadoAt, rncEstado, razonSocial, nombreComercial };
    for (const k of Object.keys(verif) as (keyof CfgPerfil)[]) if (verif[k] === undefined) delete verif[k];
    await cfgSet('perfil', { ...resto, ...verif, nombre: b.nombre.trim(), rnc: b.rnc, tel: b.tel ?? '', dir: b.dir ?? '', ...(b.ciudad !== undefined ? { ciudad: b.ciudad } : {}) });
    await audit(req.user, 'Update', { tabla: 'TenantConfig', id: 'perfil', next: `${b.nombre} · RNC ${b.rnc}`, ip: req.ip });
    return cfgGet('perfil');
  });

  app.post<{ Params: { k: keyof CfgAssets } }>('/assets/:k', sa, async (req, reply) => {
    const k = req.params.k, a = await cfgGet('assets');
    if (!(k in a)) return bad(reply, 'Recurso desconocido');
    await cfgSet('assets', { ...a, [k]: true });
    await audit(req.user, 'Update', { tabla: 'TenantConfig', id: k, prev: a[k] ? 'cargado' : 'vacío', next: 'cargado', ip: req.ip });
    return cfgGet('assets');
  });

  // ---------------------------------------------------------------- Secuencias fiscales (tabla SecuenciaFiscal; ver lib/fiscal.ts y docs/fiscal-ncf.md)
  /** Exige el PIN de supervisor (tambien al Super Admin): registrar / desactivar una autorizacion DGII cambia lo que se puede facturar. */
  const pinFiscal = async (req: FastifyRequest, reply: FastifyReply, pin: unknown): Promise<boolean> => {
    const r = await verificarPin(req, pin);
    if (r.ok) return true;
    reply.code(r.status).send({ error: r.error, ...(r.retryAfter ? { retryAfter: r.retryAfter } : {}) });
    return false;
  };
  const fiscalRes = async () => ({ secuencias: await ncfCompat(), tipos: await listarTipos(), modalidadFiscal: await modalidadesFiscales(), ecf: await cfgGet('ecf'), ecfInfo: await cfgGet('ecfInfo') });

  app.get('/fiscal', { onRequest: [app.authenticate] }, async () => { await refrescarEstados(); return fiscalRes(); });

  app.post<{ Body: SecuenciaNuevaReq }>('/fiscal/secuencias', sa, async (req, reply) => {
    if (!(await pinFiscal(req, reply, req.body?.pin))) return;
    const s = await registrarSecuencia(req.body, req.user.usuario);
    await audit(req.user, 'Insert', { tabla: 'SecuenciasFiscales', id: s.id!, next: `${s.pref} ${s.modalidad} ${s.desde}–${s.hasta}${s.vence ? ' · vence ' + s.vence : ''}${s.autorizacion ? ' · aut. ' + s.autorizacion : ''}`, ip: req.ip });
    return fiscalRes();
  });

  app.put<{ Params: { id: string }; Body: { umbral?: number; vence?: string | null; estado?: 'Activa' | 'Inactiva'; autorizacion?: string; pin?: string } }>('/fiscal/secuencias/:id', sa, async (req, reply) => {
    const b = req.body ?? {};
    // El umbral es solo una alerta; activar/desactivar y prorrogar el vencimiento cambian lo facturable: PIN.
    if ((b.estado !== undefined || b.vence !== undefined) && !(await pinFiscal(req, reply, b.pin))) return;
    const { antes, despues } = await editarSecuencia(req.params.id, { umbral: b.umbral, vence: b.vence, estado: b.estado, autorizacion: b.autorizacion });
    await audit(req.user, 'Update', { tabla: 'SecuenciasFiscales', id: req.params.id, prev: `${antes.estado} · umbral ${antes.umbral}% · vence ${antes.vence ?? '—'}`, next: `${despues.estado} · umbral ${despues.umbral}% · vence ${despues.vence ?? '—'}`, ip: req.ip });
    return fiscalRes();
  });

  app.delete<{ Params: { id: string }; Body?: { pin?: string } }>('/fiscal/secuencias/:id', sa, async (req, reply) => {
    if (!(await pinFiscal(req, reply, req.body?.pin))) return;
    await eliminarSecuencia(req.params.id);
    await audit(req.user, 'Delete', { tabla: 'SecuenciasFiscales', id: req.params.id, prev: 'secuencia sin uso', ip: req.ip });
    return fiscalRes();
  });

  /** Modalidad por tipo logico. Electronico: exige una secuencia electronica activa del tipo y, si no hay certificado e-CF, `confirmar: true` (advertencia, no bloqueo duro). */
  app.put<{ Body: { tipo: TipoLogico; modalidad: ModalidadFiscal; confirmar?: boolean; pin?: string } }>('/fiscal/modalidad', sa, async (req, reply) => {
    const b = req.body ?? ({} as never);
    if (!(await pinFiscal(req, reply, b.pin))) return;
    const prev = (await modalidadesFiscales())[b.tipo];
    const r = await cambiarModalidad(b.tipo, b.modalidad, !!b.confirmar);
    await audit(req.user, 'Update', { tabla: 'TenantConfig', id: 'modalidadFiscal/' + b.tipo, prev, next: b.modalidad + (r.advertencias.length ? ' (confirmado sin certificado e-CF)' : ''), ip: req.ip });
    return { ...(await fiscalRes()), advertencias: r.advertencias };
  });

  // --- Compatibilidad con la pantalla anterior (misma forma `ncf: CfgNcf[]`): alta fisica por prefijo y umbral por indice.
  app.post<{ Body: { pref: string; desde: number; hasta: number; pin?: string } }>('/ncf', sa, async (req, reply) => {
    if (!(await pinFiscal(req, reply, req.body?.pin))) return;
    const { pref, desde, hasta } = req.body;
    const s = await registrarSecuencia({ tipo: pref, modalidad: 'FISICA', desde, hasta, umbral: 10 }, req.user.usuario);
    await audit(req.user, 'Insert', { tabla: 'SecuenciasFiscales', id: s.id!, next: `${pref} ${desde}–${hasta}`, ip: req.ip });
    return ncfCompat();
  });

  app.put<{ Params: { i: string }; Body: { umbral: number } }>('/ncf/:i', sa, async (req, reply) => {
    const list: CfgNcf[] = await listarSecuencias(), s = list[Number(req.params.i)];
    if (!s?.id) return reply.code(404).send({ error: 'Secuencia no encontrada' });
    const { antes, despues } = await editarSecuencia(s.id, { umbral: Number(req.body?.umbral) });
    await audit(req.user, 'Update', { tabla: 'SecuenciasFiscales', id: s.id, prev: `umbral ${antes.umbral}%`, next: `umbral ${despues.umbral}%`, ip: req.ip });
    return ncfCompat();
  });


  app.post<{ Body?: { archivo?: string; vence?: string } }>('/ecf', sa, async req => {
    const prev = await cfgGet('ecf');
    await cfgSet('ecf', true);
    // Metadatos del certificado (nombre del .p12 y vencimiento) si el cliente los informa; nunca el contenido.
    const archivo = String(req.body?.archivo ?? '').trim().slice(0, 120), vence = String(req.body?.vence ?? '').trim().slice(0, 10);
    await cfgSet('ecfInfo', { ...(archivo ? { archivo } : {}), ...(vence ? { vence } : {}) });
    await audit(req.user, 'Update', { tabla: 'TenantConfig', id: 'e-CF', prev: prev ? 'cert anterior' : 'vacío', next: 'nuevo certificado', ip: req.ip });
    return { ecf: true };
  });

  app.post<{ Body: { n: string } }>('/ciclos', sa, async (req, reply) => {
    const n = nombreCiclo(String(req.body?.n ?? ''));
    if (!FORMATO_CICLO.test(n)) return bad(reply, 'Formato inválido. Usa 2027–2028');
    if (await prisma.ciclo.findUnique({ where: { nombre: n } })) return bad(reply, 'Ese ciclo ya existe');
    await crearCiclo(prisma, n, 'Planificado'); // el ciclo y sus 4 periodos academicos (Ago–Oct, Nov–Ene, Feb–Abr, May–Jul)
    await audit(req.user, 'Insert', { tabla: 'CiclosLectivos', id: n, next: 'Planificado', ip: req.ip });
    return listarCiclos();
  });

  /** Cierre EOY: promueve alumnos activos, egresa 6to, cierra el ciclo y activa el siguiente planificado. */
  app.post<{ Params: { n: string }; Body: { code: string } }>('/ciclos/:n/eoy', sa, async (req, reply) => {
    const n = req.params.n;
    const cur = await prisma.ciclo.findUnique({ where: { nombre: n } });
    if (!cur || cur.estado !== 'Activo') return bad(reply, 'Solo se puede cerrar el ciclo activo');
    if (!(await prisma.ciclo.count({ where: { estado: 'Planificado' } }))) return bad(reply, 'Crea primero el ciclo siguiente para poder cerrar este');
    if (req.body?.code !== 'CERRAR-' + n.replace('–', '-')) return bad(reply, 'El texto de confirmación no coincide');
    // Promoción por SECCIÓN y matrícula por ciclo (lib/ciclo-cierre): la matrícula del ciclo que se cierra queda Promovido / Repitente / Graduado y se crea la del siguiente.
    let r;
    try { r = await cerrarCiclo(n); } catch (e) { if (e instanceof CicloError) return reply.code(e.status).send({ error: e.message }); throw e; }
    await audit(req.user, 'Update', { tabla: 'CiclosLectivos', id: n, prev: 'Activo', next: 'Cerrado', ip: req.ip });
    return { ciclos: await listarCiclos(), promovidos: r.promovidos, egresados: r.egresados, ...(r.repitentes ? { repitentes: r.repitentes } : {}), ...(r.sinSeccion ? { sinSeccion: r.sinSeccion } : {}), activo: r.activo };
  });

  /** Matriz de roles/permisos completa (rol -> pantallas). Super Admin conserva siempre 'licencia'. */
  app.put<{ Body: { access: Record<string, ScreenId[]>; base?: Record<string, ScreenId[]> } }>('/access', sa, async (req, reply) => {
    const a = req.body?.access;
    if (!a || typeof a !== 'object') return bad(reply, 'Matriz inválida');
    const stored = await cfgGet('access'), prev = Object.keys(stored).length ? stored : (req.body.base ?? {});
    a['Super Admin'] = [...new Set([...(a['Super Admin'] ?? []), 'licencia' as ScreenId])];
    await cfgSet('access', a);
    const had = Object.keys(prev).length > 0;
    for (const r of new Set([...Object.keys(prev), ...Object.keys(a)])) {
      if (had && !prev[r]) await audit(req.user, 'Insert', { tabla: 'Roles', id: r, next: 'sin permisos', ip: req.ip });
      else if (!a[r]) await audit(req.user, 'Delete', { tabla: 'Roles', id: r, prev: 'rol', ip: req.ip });
      else {
        const p = new Set(prev[r] ?? []), q = new Set(a[r]);
        for (const id of new Set([...p, ...q])) if (p.has(id) !== q.has(id)) await audit(req.user, 'Update', { tabla: 'Roles', id: `${r}/${id}`, prev: p.has(id) ? 'acceso' : 'sin acceso', next: q.has(id) ? 'acceso' : 'sin acceso', ip: req.ip });
      }
    }
    return cfgGet('access');
  });
};
export default plugin;
