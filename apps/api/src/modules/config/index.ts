import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import type { CfgAssets, CfgPerfil, ConfigGlobal, Rol, ScreenId } from '@stodia/shared';
import { prisma } from '../../db';
import { audit } from '../../lib/audit';
import { cfgGet, cfgSet } from '../../lib/sisconfig';

const ROLES_BASE: Rol[] = ['Super Admin', 'Director Académico', 'Docente', 'Cajero', 'Encargado Comedor', 'Tutor'];
const NCF_TIPO: Record<string, string> = { B01: 'Crédito fiscal', B02: 'Consumo', B04: 'Nota de crédito', B14: 'Regímenes especiales' };
const ORD = ['1ro', '2do', '3ro', '4to', '5to', '6to'];
const bad = (r: FastifyReply, error: string) => r.code(400).send({ error });

const plugin: FastifyPluginAsync = async app => {
  const sa = { onRequest: [app.authenticate, app.requireRole('Super Admin')] };

  app.get('/', { onRequest: [app.authenticate] }, async (): Promise<ConfigGlobal> => {
    const [perfil, assets, ncf, ecf, ecfInfo, ciclos, access] = await Promise.all([cfgGet('perfil'), cfgGet('assets'), cfgGet('ncf'), cfgGet('ecf'), cfgGet('ecfInfo'), cfgGet('ciclos'), cfgGet('access')]);
    return { perfil, assets, ncf, ecf, ecfInfo, ciclos, access, rolesBase: ROLES_BASE };
  });

  app.put<{ Body: CfgPerfil }>('/perfil', sa, async (req, reply) => {
    const b = req.body ?? ({} as CfgPerfil);
    if (!b.nombre?.trim() || String(b.rnc ?? '').replace(/\D/g, '').length !== 9) return bad(reply, 'Razón social obligatoria y RNC de 9 dígitos');
    await cfgSet('perfil', { ...(await cfgGet('perfil')), nombre: b.nombre.trim(), rnc: b.rnc, tel: b.tel ?? '', dir: b.dir ?? '' });
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

  app.post<{ Body: { pref: string; desde: number; hasta: number } }>('/ncf', sa, async (req, reply) => {
    const { pref, desde, hasta } = req.body;
    if (!NCF_TIPO[pref]) return bad(reply, 'Prefijo inválido');
    if (!(desde >= 1) || !(hasta > desde)) return bad(reply, 'El rango debe ser válido: «hasta» mayor que «desde»');
    await cfgSet('ncf', [...(await cfgGet('ncf')), { pref, tipo: NCF_TIPO[pref], desde, hasta, umbral: 10 }]);
    await audit(req.user, 'Insert', { tabla: 'TenantConfig', id: 'NCF-' + pref, next: `${desde}–${hasta}`, ip: req.ip });
    return cfgGet('ncf');
  });

  app.put<{ Params: { i: string }; Body: { umbral: number } }>('/ncf/:i', sa, async (req, reply) => {
    const list = await cfgGet('ncf'), i = Number(req.params.i), v = Number(req.body?.umbral);
    if (!list[i]) return reply.code(404).send({ error: 'Secuencia no encontrada' });
    if (!(v >= 1 && v <= 50)) return bad(reply, 'El umbral debe estar entre 1 y 50 %');
    const prev = list[i].umbral;
    list[i] = { ...list[i], umbral: v };
    await cfgSet('ncf', list);
    await audit(req.user, 'Update', { tabla: 'TenantConfig', id: 'NCF-' + list[i].pref, prev: `umbral ${prev}%`, next: `umbral ${v}%`, ip: req.ip });
    return list;
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
    const n = String(req.body?.n ?? '').trim().replace('-', '–'), list = await cfgGet('ciclos');
    if (!/^\d{4}–\d{4}$/.test(n)) return bad(reply, 'Formato inválido. Usa 2027–2028');
    if (list.some(c => c.n === n)) return bad(reply, 'Ese ciclo ya existe');
    await cfgSet('ciclos', [...list, { n, estado: 'Planificado' }]);
    await audit(req.user, 'Insert', { tabla: 'CiclosLectivos', id: n, next: 'Planificado', ip: req.ip });
    return cfgGet('ciclos');
  });

  /** Cierre EOY: promueve alumnos activos, egresa 6to, cierra el ciclo y activa el siguiente planificado. */
  app.post<{ Params: { n: string }; Body: { code: string } }>('/ciclos/:n/eoy', sa, async (req, reply) => {
    const n = req.params.n, list = await cfgGet('ciclos'), cur = list.find(c => c.n === n), next = list.find(c => c.estado === 'Planificado');
    if (!cur || cur.estado !== 'Activo') return bad(reply, 'Solo se puede cerrar el ciclo activo');
    if (!next) return bad(reply, 'Crea primero el ciclo siguiente para poder cerrar este');
    if (req.body?.code !== 'CERRAR-' + n.replace('–', '-')) return bad(reply, 'El texto de confirmación no coincide');
    const alumnos = await prisma.alumno.findMany({ where: { estado: 'Activo' }, select: { id: true, grado: true } });
    const ops = [];
    let up = 0, eg = 0;
    for (const a of alumnos) {
      if (a.grado === '6to') { eg++; ops.push(prisma.alumno.update({ where: { id: a.id }, data: { estado: 'Egresado' } })); }
      else if (ORD.includes(a.grado)) { up++; ops.push(prisma.alumno.update({ where: { id: a.id }, data: { grado: ORD[ORD.indexOf(a.grado) + 1] } })); }
    }
    await prisma.$transaction(ops);
    await cfgSet('ciclos', list.map(c => (c.n === n ? { ...c, estado: 'Cerrado' as const } : c.n === next.n ? { ...c, estado: 'Activo' as const } : c)));
    await audit(req.user, 'Update', { tabla: 'CiclosLectivos', id: n, prev: 'Activo', next: 'Cerrado', ip: req.ip });
    return { ciclos: await cfgGet('ciclos'), promovidos: up, egresados: eg, activo: next.n };
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
