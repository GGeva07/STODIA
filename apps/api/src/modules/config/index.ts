import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type { CfgFinanzas, CfgAssets, CfgNcf, CfgPerfil, CierreResultado, CierreResumen, ConfigGlobal, ResultadoVerifRnc, ModalidadFiscal, Rol, ScreenId, SecuenciaNuevaReq, TipoLogico } from '@stodia/shared';
import { prisma } from '../../db';
import { audit } from '../../lib/audit';
import { rncValido } from '../../lib/rnc';
import { consultarDgii, soloDigitos } from '../../lib/rnc-lookup';
import { CFG_DEFAULTS, cfgGet, cfgSet } from '../../lib/sisconfig';
import { CicloError, FORMATO_CICLO, crearCiclo, listarCiclos, nombreCiclo } from '../../lib/ciclo';
import { cerrarCiclo, resumenCierre } from '../../lib/ciclo-cierre';
import { cambiarModalidad, editarSecuencia, eliminarSecuencia, listarSecuencias, listarTipos, modalidadesFiscales, ncfCompat, refrescarEstados, registrarSecuencia } from '../../lib/fiscal';
import { supervisorOk, verificarPin } from '../../lib/supervisor';

const ROLES_BASE: Rol[] = ['Super Admin', 'Director Académico', 'Docente', 'Cajero', 'Encargado Comedor', 'Tutor'];
const bad = (r: FastifyReply, error: string) => r.code(400).send({ error });

/** Consulta la API de RNC y, salvo `soloConsulta`, actualiza la marca de verificación del perfil. Nunca devuelve ni registra la clave. */
async function verificarPerfilRnc(user: FastifyRequest['user'], ip: string, rnc: string, soloConsulta = false): Promise<{ http: number; resultado: ResultadoVerifRnc }> {
  const base = { rnc, guardado: false };
  const c = await consultarDgii(rnc);
  if (c.tipo === 'sin-config') return { http: 503, resultado: { ...base, estado: 'sin-config', mensaje: 'Verificación de RNC no configurada en este servidor (falta STODIA_RNC_API_URL/KEY)' } };
  if (c.tipo === 'indisponible') return { http: 502, resultado: { ...base, estado: 'no-disponible', mensaje: 'No se pudo consultar la API de RNC ahora; reintenta' } };
  if (c.tipo === 'no-encontrado') {
    if (!soloConsulta) {
      const prev = ((await cfgGet('perfil')) ?? {}) as CfgPerfil;
      await cfgSet('perfil', { ...prev, rncVerificado: false, rncVerificadoAt: undefined, rncEstado: 'NO ENCONTRADO' });
    }
    return { http: 200, resultado: { ...base, guardado: !soloConsulta, estado: 'no-existe', mensaje: 'El RNC no existe en el registro de la DGII' } };
  }
  const datos = { razonSocial: c.razonSocial, nombreComercial: c.nombreComercial, rncEstado: c.estado || undefined };
  if (!soloConsulta) {
    const prev = ((await cfgGet('perfil')) ?? {}) as CfgPerfil;
    const next: CfgPerfil = { ...prev, ...datos, rncVerificado: c.activo, rncVerificadoAt: c.activo ? new Date().toISOString() : undefined };
    for (const k of Object.keys(next) as (keyof CfgPerfil)[]) if (next[k] === undefined) delete next[k];
    await cfgSet('perfil', next);
    await audit(user, 'Update', { tabla: 'TenantConfig', id: 'perfil', next: `Verificación RNC ${rnc}: ${c.activo ? 'ACTIVO' : c.estado || 'sin estado'}`, ip });
  }
  const mensaje = c.activo ? `RNC verificado en la DGII · ACTIVO · ${c.razonSocial}` : `El RNC existe en la DGII pero su estado es «${c.estado || 'desconocido'}», no ACTIVO`;
  return { http: 200, resultado: { ...base, guardado: !soloConsulta, estado: c.activo ? 'verificado' : 'inactivo', mensaje, ...datos } };
}

const plugin: FastifyPluginAsync = async app => {
  const sa = { onRequest: [app.authenticate, app.requireRole('Super Admin')] }; // solo la matriz de roles (un rol no puede otorgarse permisos)
  const cfg = { onRequest: [app.authenticate, app.requireScreen('config')] };

  app.get('/', { onRequest: [app.authenticate] }, async (): Promise<ConfigGlobal> => {
    const [perfil, assets, ncf, ecf, ecfInfo, ciclos, access, finanzas, modalidadFiscal, tiposComprobante, papeleriaAbierta] = await Promise.all([cfgGet('perfil'), cfgGet('assets'), ncfCompat(), cfgGet('ecf'), cfgGet('ecfInfo'), listarCiclos(), cfgGet('access'), cfgGet('finanzas'), modalidadesFiscales(), listarTipos(), cfgGet('papeleriaAbierta')]);
    return { perfil, assets, ncf, modalidadFiscal, tiposComprobante, ecf, ecfInfo, ciclos, finanzas: { ...CFG_DEFAULTS.finanzas, ...finanzas }, papeleriaAbierta: papeleriaAbierta === true, access, rolesBase: ROLES_BASE };
  });

  /** Configuración financiera de la instancia: cualquier usuario autenticado lee; solo Super Admin escribe. */
  app.get('/finanzas', { onRequest: [app.authenticate] }, async (): Promise<CfgFinanzas> => ({ ...CFG_DEFAULTS.finanzas, ...(await cfgGet('finanzas')) }));

  app.put<{ Body: Partial<CfgFinanzas> }>('/finanzas', cfg, async (req, reply) => {
    const b = req.body ?? {}, cur = { ...CFG_DEFAULTS.finanzas, ...(await cfgGet('finanzas')) }, next: CfgFinanzas = { ...cur };
    type KNum = Exclude<keyof CfgFinanzas, 'inscripcionModo'>;
    const lim: Record<KNum, [number, number, string]> = {
      matricula: [0, 100_000_000, 'La matrícula'], inscripcion: [0, 100_000_000, 'La inscripción'], itbis: [0, 1, 'El ITBIS (fracción, p. ej. 0.18)'],
      recargoMoraPct: [0, 100, 'El recargo por mora (%)'], umbralConsumoIdentificado: [0, 1_000_000_000, 'El umbral de consumo identificado (RD$)'], descuentoProntoPct: [0, 100, 'El descuento por pronto pago (%)'], diaCorte: [0, 28, 'El día de corte'],
      notaPlazoDias: [0, 3650, 'El plazo para notas de crédito (días; 0 = sin plazo)'], notaCicloAnterior: [0, 1, 'Permitir notas sobre ciclos anteriores (0 o 1)'],
    };
    for (const k of Object.keys(lim) as KNum[]) {
      if (b[k] === undefined || b[k] === null || (b[k] as unknown) === '') continue;
      const v = Number(b[k]), [lo, hi, nombre] = lim[k];
      if (!Number.isFinite(v) || v < lo || v > hi) return bad(reply, `${nombre} debe estar entre ${lo} y ${hi}`);
      next[k] = k === 'diaCorte' || k === 'notaPlazoDias' || k === 'notaCicloAnterior' ? Math.round(v) : Math.round(v * 10000) / 10000;
    }
    // Modalidad de la cuota de inscripcion ('fija' por defecto = comportamiento anterior; 'plan' = la define cada plan de pago).
    if (b.inscripcionModo !== undefined && b.inscripcionModo !== null) {
      if (b.inscripcionModo !== 'fija' && b.inscripcionModo !== 'plan') return bad(reply, 'La modalidad de inscripción debe ser «fija» o «plan»');
      next.inscripcionModo = b.inscripcionModo;
    }
    await cfgSet('finanzas', next);
    await audit(req.user, 'Update', { tabla: 'TenantConfig', id: 'finanzas', prev: JSON.stringify(cur), next: JSON.stringify(next), ip: req.ip });
    return next;
  });

  /** Papelería abierta al público (habilita Venta Rápida). Solo quien puede escribir config. */
  app.put<{ Body: { abierta?: boolean } }>('/papeleria', cfg, async (req, reply) => {
    if (typeof req.body?.abierta !== 'boolean') return bad(reply, 'Indica si la papelería está abierta (true/false)');
    const prev = (await cfgGet('papeleriaAbierta')) === true, next = req.body.abierta;
    await cfgSet('papeleriaAbierta', next);
    await audit(req.user, 'Update', { tabla: 'TenantConfig', id: 'papeleriaAbierta', prev: prev ? 'abierta' : 'cerrada', next: next ? 'abierta' : 'cerrada', ip: req.ip });
    return { papeleriaAbierta: next };
  });

  app.put<{ Body: CfgPerfil }>('/perfil', cfg, async (req, reply) => {
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
    if (cambioRnc) { try { await verificarPerfilRnc(req.user, req.ip, soloDigitos(b.rnc)); } catch { /* best-effort: no bloquea el guardado */ } }
    return cfgGet('perfil');
  });

  /** Verifica el RNC contra la API externa. Con un RNC distinto del guardado (cuerpo) solo consulta y NO modifica el perfil. */
  app.post<{ Body: { rnc?: string } }>('/perfil/verificar-rnc', cfg, async (req, reply) => {
    const prev = ((await cfgGet('perfil')) ?? {}) as CfgPerfil;
    const guardado = soloDigitos(prev.rnc), enviado = soloDigitos(req.body?.rnc);
    const rnc = enviado || guardado;
    if (!rncValido(rnc)) return bad(reply, 'RNC de 9 u 11 dígitos obligatorio');
    const r = await verificarPerfilRnc(req.user, req.ip, rnc, rnc !== guardado);
    if (r.http !== 200) return reply.code(r.http).send({ error: r.resultado.mensaje, resultado: r.resultado });
    return { perfil: await cfgGet('perfil'), resultado: r.resultado };
  });

  app.post<{ Params: { k: keyof CfgAssets } }>('/assets/:k', cfg, async (req, reply) => {
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

  app.post<{ Body: SecuenciaNuevaReq }>('/fiscal/secuencias', cfg, async (req, reply) => {
    if (!(await pinFiscal(req, reply, req.body?.pin))) return;
    const s = await registrarSecuencia(req.body, req.user.usuario);
    await audit(req.user, 'Insert', { tabla: 'SecuenciasFiscales', id: s.id!, next: `${s.pref} ${s.modalidad} ${s.desde}–${s.hasta}${s.vence ? ' · vence ' + s.vence : ''}${s.autorizacion ? ' · aut. ' + s.autorizacion : ''}`, ip: req.ip });
    return fiscalRes();
  });

  app.put<{ Params: { id: string }; Body: { umbral?: number; vence?: string | null; estado?: 'Activa' | 'Inactiva'; autorizacion?: string; pin?: string } }>('/fiscal/secuencias/:id', cfg, async (req, reply) => {
    const b = req.body ?? {};
    // El umbral es solo una alerta; activar/desactivar y prorrogar el vencimiento cambian lo facturable: PIN.
    if ((b.estado !== undefined || b.vence !== undefined || b.autorizacion !== undefined) && !(await pinFiscal(req, reply, b.pin))) return;
    const { antes, despues } = await editarSecuencia(req.params.id, { umbral: b.umbral, vence: b.vence, estado: b.estado, autorizacion: b.autorizacion });
    await audit(req.user, 'Update', { tabla: 'SecuenciasFiscales', id: req.params.id, prev: `${antes.estado} · umbral ${antes.umbral}% · vence ${antes.vence ?? '—'} · aut. ${antes.autorizacion || '—'}`, next: `${despues.estado} · umbral ${despues.umbral}% · vence ${despues.vence ?? '—'} · aut. ${despues.autorizacion || '—'}`, ip: req.ip });
    return fiscalRes();
  });

  app.delete<{ Params: { id: string }; Body?: { pin?: string } }>('/fiscal/secuencias/:id', cfg, async (req, reply) => {
    if (!(await pinFiscal(req, reply, req.body?.pin))) return;
    await eliminarSecuencia(req.params.id);
    await audit(req.user, 'Delete', { tabla: 'SecuenciasFiscales', id: req.params.id, prev: 'secuencia sin uso', ip: req.ip });
    return fiscalRes();
  });

  /** Modalidad por tipo logico. Electronico: exige una secuencia electronica activa del tipo y, si no hay certificado e-CF, `confirmar: true` (advertencia, no bloqueo duro). */
  app.put<{ Body: { tipo: TipoLogico; modalidad: ModalidadFiscal; confirmar?: boolean; pin?: string } }>('/fiscal/modalidad', cfg, async (req, reply) => {
    const b = req.body ?? ({} as never);
    if (!(await pinFiscal(req, reply, b.pin))) return;
    const prev = (await modalidadesFiscales())[b.tipo];
    const r = await cambiarModalidad(b.tipo, b.modalidad, !!b.confirmar);
    await audit(req.user, 'Update', { tabla: 'TenantConfig', id: 'modalidadFiscal/' + b.tipo, prev, next: b.modalidad + (r.advertencias.length ? ' (confirmado sin certificado e-CF)' : ''), ip: req.ip });
    return { ...(await fiscalRes()), advertencias: r.advertencias };
  });

  // --- Compatibilidad con la pantalla anterior (misma forma `ncf: CfgNcf[]`): alta fisica por prefijo y umbral por indice.
  app.post<{ Body: { pref: string; desde: number; hasta: number; pin?: string } }>('/ncf', cfg, async (req, reply) => {
    if (!(await pinFiscal(req, reply, req.body?.pin))) return;
    const { pref, desde, hasta } = req.body;
    const s = await registrarSecuencia({ tipo: pref, modalidad: 'FISICA', desde, hasta, umbral: 10 }, req.user.usuario);
    await audit(req.user, 'Insert', { tabla: 'SecuenciasFiscales', id: s.id!, next: `${pref} ${desde}–${hasta}`, ip: req.ip });
    return ncfCompat();
  });

  app.put<{ Params: { i: string }; Body: { umbral: number } }>('/ncf/:i', cfg, async (req, reply) => {
    const list: CfgNcf[] = await listarSecuencias(), s = list[Number(req.params.i)];
    if (!s?.id) return reply.code(404).send({ error: 'Secuencia no encontrada' });
    const { antes, despues } = await editarSecuencia(s.id, { umbral: Number(req.body?.umbral) });
    await audit(req.user, 'Update', { tabla: 'SecuenciasFiscales', id: s.id, prev: `umbral ${antes.umbral}%`, next: `umbral ${despues.umbral}%`, ip: req.ip });
    return ncfCompat();
  });


  app.post<{ Body?: { archivo?: string; vence?: string } }>('/ecf', cfg, async req => {
    const prev = await cfgGet('ecf');
    await cfgSet('ecf', true);
    // Metadatos del certificado (nombre del .p12 y vencimiento) si el cliente los informa; nunca el contenido.
    const archivo = String(req.body?.archivo ?? '').trim().slice(0, 120), vence = String(req.body?.vence ?? '').trim().slice(0, 10);
    await cfgSet('ecfInfo', { ...(archivo ? { archivo } : {}), ...(vence ? { vence } : {}) });
    await audit(req.user, 'Update', { tabla: 'TenantConfig', id: 'e-CF', prev: prev ? 'cert anterior' : 'vacío', next: 'nuevo certificado', ip: req.ip });
    return { ecf: true };
  });

  app.post<{ Body: { n: string } }>('/ciclos', cfg, async (req, reply) => {
    const n = nombreCiclo(String(req.body?.n ?? ''));
    if (!FORMATO_CICLO.test(n)) return bad(reply, 'Formato inválido. Usa 2027–2028');
    if (await prisma.ciclo.findUnique({ where: { nombre: n } })) return bad(reply, 'Ese ciclo ya existe');
    await crearCiclo(prisma, n, 'Planificado'); // el ciclo y sus 4 periodos academicos (Ago–Oct, Nov–Ene, Feb–Abr, May–Jul)
    await audit(req.user, 'Insert', { tabla: 'CiclosLectivos', id: n, next: 'Planificado', ip: req.ip });
    return listarCiclos();
  });

  /** Vista previa del cierre contable (totales del ciclo y mayores deudores) o, si ya está Cerrado, la foto guardada en CierreCiclo. Solo lectura. */
  app.get<{ Params: { n: string } }>('/ciclos/:n/cierre', cfg, async (req): Promise<CierreResumen> => resumenCierre(nombreCiclo(req.params.n)));

  /**
   * Cierre del año escolar (EOY) = cierre CONTABLE/ADMINISTRATIVO y de edición (lib/ciclo-cierre.ts): guarda la foto financiera (CierreCiclo), deja el ciclo
   * Cerrado (solo lectura) y activa el Planificado siguiente. NO promueve alumnos (eso es la promoción de curso: /academico/promocion). Exige el texto
   * `CERRAR-<ciclo>` y la clave de supervisor (token de un solo uso de /auth/supervisor; el Super Admin no la necesita).
   */
  app.post<{ Params: { n: string }; Body: { code: string; pin?: string } }>('/ciclos/:n/eoy', cfg, async (req, reply): Promise<CierreResultado | void> => {
    const n = nombreCiclo(req.params.n);
    const cur = await prisma.ciclo.findUnique({ where: { nombre: n } });
    if (!cur || cur.estado !== 'Activo') return bad(reply, 'Solo se puede cerrar el ciclo activo');
    if (!(await prisma.ciclo.count({ where: { estado: 'Planificado' } }))) return bad(reply, 'Crea primero el ciclo siguiente para poder cerrar este');
    if (req.body?.code !== 'CERRAR-' + n.replace('–', '-')) return bad(reply, 'El texto de confirmación no coincide');
    if (!(await supervisorOk(req, req.body?.pin, 'cierre-ciclo'))) return reply.code(403).send({ error: 'Se requiere la clave de supervisor para cerrar el año escolar' });
    let r;
    try { r = await cerrarCiclo(n, req.user); } catch (e) { if (e instanceof CicloError) return reply.code(e.status).send({ error: e.message }); throw e; }
    const t = r.resumen;
    await audit(req.user, 'Update', { tabla: 'CiclosLectivos', id: n, prev: 'Activo', next: `Cerrado (cierre contable) · ${r.activo} activo · facturado ${t.facturado} · cobrado ${t.cobrado} · pendiente ${t.pendiente} (${t.alumnosConDeuda} alumnos con deuda)`, ip: req.ip });
    return { ciclos: await listarCiclos(), activo: r.activo, resumen: t, alineados: r.alineados, egresados: r.egresados };
  });

  /** Matriz de roles/permisos completa (rol -> pantallas). Quien tenga la pantalla Configuración puede editarla (decisión del Super Admin), pero solo el Super Admin toca la fila del Super Admin y la pantalla 'licencia'. */
  app.put<{ Body: { access: Record<string, ScreenId[]>; base?: Record<string, ScreenId[]> } }>('/access', cfg, async (req, reply) => {
    const a = req.body?.access;
    if (!a || typeof a !== 'object') return bad(reply, 'Matriz inválida');
    const stored = await cfgGet('access'), prev = Object.keys(stored).length ? stored : (req.body.base ?? {});
    if (req.user.rol !== 'Super Admin') {
      // Un rol delegado no puede quitarle nada al Super Admin ni repartir/retirar 'licencia' (sería escalar privilegios).
      a['Super Admin'] = prev['Super Admin'] ?? a['Super Admin'] ?? [];
      for (const r of Object.keys(a)) {
        const sin = (a[r] ?? []).filter(x => x !== 'licencia'), tenia = (prev[r] ?? []).includes('licencia' as ScreenId);
        a[r] = tenia ? [...sin, 'licencia' as ScreenId] : sin;
      }
    }
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
