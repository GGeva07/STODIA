import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type { MarcaAsistencia, MobHijo, MobListaData, MobListaSave, MobTutorData, MobPagoIntencionDto, MobPasarelaCfg, EstadoCargo } from '@stodia/shared';
import { prisma } from '../../db';
import { ahora, bloqueActual, bloquesDe, bloqueTexto, elegirAsig, guardarAsistencia, loadCat, marcasDelDia, nomina, norm, optDe, periodoDe, rubricaDe } from '../../lib/academico';
import { config } from '../../config';
import { estadoCuota, hoyISO, round2, venceISO, zonaHoraria } from '../../lib/cxc';
import { digits, kidOf } from '../../lib/personas';
import { cfgGet, cfgSet } from '../../lib/sisconfig';
import { audit } from '../../lib/audit';
import { PASARELAS_IMPLEMENTADAS, comedorGet, comedorSet, pasarelaGet, pasarelaSet } from '../../lib/canales';

const MARCAS = ['P', 'T', 'AJ', 'AI'];
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 19).replace('T', ' ') : null);
const instruccionesPago = async () => ((await cfgGet('perfil')).instruccionesPago ?? '').trim();

/** Menú semanal del portal: sale de AliMenu (los días sin plato definido no se publican). */
async function menuTutor(): Promise<MobTutorData['menu']> {
  const rows = await prisma.aliMenu.findMany({ orderBy: { orden: 'asc' } });
  return rows.filter(r => r.plato.trim()).map(r => ({ dia: r.dia.replace(/\s*\d+\s*$/, ''), plato: r.plato, algs: JSON.parse(r.algs) as string[] }));
}

const plugin: FastifyPluginAsync = async app => {
  /** Tutor autenticado: se resuelve SIEMPRE por la cuenta de la sesión (Tutor.usuario = usuario del login), nunca por parámetros ni por un usuario fijo. Cuenta o tutor inactivos = sin acceso. */
  const tutorDe = async (req: FastifyRequest) => {
    if (req.user.rol !== 'Tutor') return null;
    const [t, u] = await Promise.all([prisma.tutor.findFirst({ where: { usuario: req.user.usuario }, include: { alumnos: true } }), prisma.user.findUnique({ where: { usuario: req.user.usuario } })]);
    return t && t.estado === 'Activo' && u?.estado === 'Activo' ? t : null;
  };
  /** Consulta del personal (Super Admin / Director / Cajero): ve el portal de un tutor por su cédula, solo lectura. */
  const STAFF_PORTAL = ['Super Admin', 'Director Académico', 'Cajero'];
  const consultaDe = async (req: FastifyRequest<{ Querystring: { cedula?: string } }>) => {
    if (req.user.rol === 'Tutor') return tutorDe(req);
    const d = digits(String(req.query?.cedula ?? ''));
    if (!STAFF_PORTAL.includes(req.user.rol) || d.length < 11) return null;
    return (await prisma.tutor.findMany({ include: { alumnos: true } })).find(t => digits(t.cedula) === d) ?? null;
  };

  /** Cargos exigibles del alumno (CxC): FinCobroItem sin pagar, el mismo origen que usan el POS/Cobros. */
  const cargosDe = async (alumnoId: string) => {
    const rows = await prisma.finCobroItem.findMany({ where: { kid: kidOf(alumnoId), paid: false }, orderBy: { orden: 'asc' } });
    // Ordenados por vencimiento (más antiguo primero); a igual fecha, el orden de la cartera.
    return rows.sort((p, q) => (venceISO(p.vence) ?? '9999').localeCompare(venceISO(q.vence) ?? '9999') || p.orden - q.orden);
  };

  /**
   * Portal del tutor. El Tutor autenticado solo ve lo suyo (se resuelve por su sesión; `?cedula=` se ignora).
   * Super Admin / Director / Cajero pueden consultar a un tutor con `?cedula=` (solo lectura); sin cédula reciben el portal vacío.
   */
  app.get<{ Querystring: { cedula?: string } }>('/tutor', { onRequest: [app.authenticate] }, async (req, reply) => {
    const [pas, instr, com, menu] = await Promise.all([pasarelaGet(), instruccionesPago(), comedorGet(), menuTutor()]);
    const pago: NonNullable<MobTutorData['pago']> = { modo: pas.demo ? 'demo' : pas.activa ? 'pasarela' : 'manual', instrucciones: instr };
    const staff = STAFF_PORTAL.includes(req.user.rol);
    if (staff && !digits(String(req.query?.cedula ?? ''))) { const vacio: MobTutorData = { tutor: '', hijos: [], menu, pago, recargas: com.recargas }; return vacio; }
    const t = await consultaDe(req);
    if (!t) return staff ? reply.code(404).send({ error: 'No hay un tutor con esa cédula' }) : reply.code(403).send({ error: 'Sin permiso' });
    const hijos: MobHijo[] = [];
    const [cat, hoy, tz] = await Promise.all([loadCat(), ahora(), zonaHoraria()]);
    const hoyIso = hoyISO(tz);
    const periodo = periodoDe(hoy.fecha);
    for (const a of t.alumnos) {
      const [cargos, notas, w, accesos, asisMob, ros, pend] = await Promise.all([
        cargosDe(a.id),
        prisma.mobNota.findMany({ where: { alumnoId: a.id }, orderBy: { id: 'asc' } }),
        prisma.mobWallet.findUnique({ where: { alumnoId: a.id } }),
        prisma.mobAcceso.findMany({ where: { alumnoId: a.id }, orderBy: { creado: 'desc' }, take: 10 }),
        prisma.mobAsistencia.findMany({ where: { alumnoId: a.id }, orderBy: { fecha: 'desc' }, take: 10 }),
        prisma.acadRoster.findUnique({
          where: { alumnoId: a.id },
          include: { asistencias: { orderBy: { fecha: 'desc' }, take: 10 }, notas: { where: { periodo } } },
        }),
        prisma.mobPagoIntencion.findMany({ where: { alumnoId: a.id, estado: 'pendiente' }, orderBy: { creado: 'asc' } }),
      ]);
      // Fuente única: la nómina académica (AcadRoster) manda sobre MobNota. Por cada materia con notas en el período vigente, el valor es el promedio de
      // sus competencias (no examen), con los nombres y la rúbrica del catálogo; las materias sin matriz siguen saliendo de MobNota.
      const notasH = notas.map(n => ({ materia: n.materia, valor: n.valor }));
      for (const n of ros?.notas ?? []) {
        const m = cat.materias.get(n.materia);
        if (!m) continue;
        const campos = rubricaDe(cat, n.materia).comps.filter(c => c.field !== 'ex').map(c => n[c.field]);
        const cs = campos.filter((v): v is number => v != null);
        if (!cs.length) continue;
        const valor = Math.round((cs.reduce((x, y) => x + y, 0) / cs.length) * 10) / 10;
        const i = notasH.findIndex(x => norm(x.materia) === norm(m.nombre));
        if (i >= 0) notasH[i] = { materia: notasH[i].materia, valor }; else notasH.unshift({ materia: m.nombre as string, valor });
      }
      const porFecha = new Map<string, string>(asisMob.map(x => [x.fecha, x.estado]));
      for (const x of ros?.asistencias ?? []) porFecha.set(x.fecha, x.estado);
      const asis = [...porFecha].map(([fecha, estado]) => ({ fecha, estado })).sort((p, q) => (p.fecha < q.fecha ? 1 : -1)).slice(0, 10);
      hijos.push({
        id: a.id, nombre: `${a.nombres} ${a.apellidos}`, grado: a.grado, sec: a.sec, alergias: a.alg,
        cargos: cargos.map(c => ({ id: c.id, concepto: c.con, vence: c.vence, monto: c.monto, estado: estadoCuota(c, hoyIso) as EstadoCargo })),
        pagosPendientes: pend.map(p => ({ id: p.id, tipo: p.tipo as 'cargos' | 'recarga', monto: p.monto, creado: iso(p.creado)! })),
        notas: notasH,
        wallet: w ? { saldo: w.saldo, limite: w.limite } : null,
        accesos: accesos.map(x => ({ hora: x.hora, resultado: x.resultado as 'ok' | 'alert' | 'no' })),
        asistencia: asis.map(x => ({ fecha: x.fecha, estado: x.estado as MarcaAsistencia })),
      });
    }
    const res: MobTutorData = { tutor: t.nombre, hijos, menu, pago, recargas: com.recargas };
    return res;
  });

  /**
   * Pagar cuotas exigibles (Vencida / Por vencer) del hijo desde el portal.
   *  - Demo (SEED_DEMO + pasarela.demo): pago simulado inmediato, solo para presentaciones.
   *  - Pasarela activa: requiere proveedor implementado (ninguno aún) -> 501; nunca se declara pagado sin cobro.
   *  - Sin pasarela (instalación real): crea/actualiza una intención de pago 'pendiente' que el cajero verifica y confirma desde Cobros.
   */
  app.post<{ Body: { alumnoId: string } }>('/tutor/pagar', { onRequest: [app.authenticate] }, async (req, reply) => {
    const t = await tutorDe(req);
    const alumnoId = req.body?.alumnoId;
    if (!t?.alumnos.some(a => a.id === alumnoId)) return reply.code(403).send({ error: 'Sin permiso' });
    const pas = await pasarelaGet();
    const hoyIso = hoyISO(await zonaHoraria());
    const items = (await cargosDe(alumnoId)).filter(c => estadoCuota(c, hoyIso) !== 'Pendiente');
    if (!items.length) return { modo: pas.demo ? 'demo' : 'manual', pagados: 0 };
    if (pas.demo) {
      const r = await prisma.finCobroItem.updateMany({ where: { id: { in: items.map(i => i.id) } }, data: { paid: true } });
      return { modo: 'demo', pagados: r.count };
    }
    if (pas.activa) return reply.code(501).send({ error: `La pasarela «${pas.proveedor ?? 'sin proveedor'}» no está disponible. Registra tu pago en administración.` });
    const monto = round2(items.reduce((a, c) => a + c.monto, 0));
    const detalle = JSON.stringify(items.map(i => i.id));
    const previa = await prisma.mobPagoIntencion.findFirst({ where: { alumnoId, tipo: 'cargos', estado: 'pendiente' } });
    const it = previa
      ? await prisma.mobPagoIntencion.update({ where: { id: previa.id }, data: { monto, detalle } })
      : await prisma.mobPagoIntencion.create({ data: { alumnoId, tutor: t.nombre, tipo: 'cargos', monto, detalle } });
    return { modo: 'manual', intencion: it.id, monto, instrucciones: await instruccionesPago() };
  });

  app.put<{ Params: { alumnoId: string }; Body: { recarga?: number; limite?: number } }>('/tutor/wallet/:alumnoId', { onRequest: [app.authenticate] }, async (req, reply) => {
    const t = await tutorDe(req);
    const { alumnoId } = req.params;
    if (!t?.alumnos.some(a => a.id === alumnoId)) return reply.code(403).send({ error: 'Sin permiso' });
    const { recarga, limite } = req.body;
    const [pas, com] = await Promise.all([pasarelaGet(), comedorGet()]);
    if (recarga !== undefined && recarga > 0 && !com.recargas.includes(recarga)) return reply.code(400).send({ error: 'Monto de recarga no permitido' });
    const w = await prisma.mobWallet.upsert({ where: { alumnoId }, update: {}, create: { alumnoId, saldo: 0, limite: 200 } });
    let intencion: string | undefined;
    let saldo = w.saldo;
    if (recarga && recarga > 0) {
      if (pas.demo) saldo = w.saldo + recarga;
      else if (pas.activa) return reply.code(501).send({ error: `La pasarela «${pas.proveedor ?? 'sin proveedor'}» no está disponible. Recarga en administración.` });
      else intencion = (await prisma.mobPagoIntencion.create({ data: { alumnoId, tutor: t.nombre, tipo: 'recarga', monto: recarga } })).id;
    }
    const up = await prisma.mobWallet.update({
      where: { alumnoId },
      data: { saldo, limite: limite !== undefined && limite >= 0 ? limite : w.limite },
    });
    return { saldo: up.saldo, limite: up.limite, ...(intencion ? { intencion, instrucciones: await instruccionesPago() } : {}) };
  });

  // ---- Intenciones de pago (para el cajero / POS) ----
  // GET  /movil/pagos/intenciones?estado=pendiente|confirmada|rechazada|todas  -> MobPagoIntencionDto[]  (Super Admin, Cajero)
  // POST /movil/pagos/intenciones/:id/confirmar  { reciboId?, nota? }  -> el cajero ya cobró (p. ej. en Cobros con recibo): marca 'confirmada'; si es 'recarga', acredita el monedero.
  //      Para tipo 'cargos' NO salda FinCobroItem: eso lo hace el cobro normal del POS; aquí solo se cierra la intención (reciboId opcional para trazabilidad).
  // POST /movil/pagos/intenciones/:id/rechazar   { nota }  -> no se recibió el pago (nota obligatoria).
  const cajero = { onRequest: [app.authenticate, app.requireRole('Super Admin', 'Cajero')] };
  app.get<{ Querystring: { estado?: string } }>('/pagos/intenciones', cajero, async req => {
    const estado = req.query.estado ?? 'pendiente';
    const rows = await prisma.mobPagoIntencion.findMany({ where: estado === 'todas' ? {} : { estado }, orderBy: { creado: 'desc' }, take: 200 });
    const als = await prisma.alumno.findMany({ where: { id: { in: [...new Set(rows.map(r => r.alumnoId))] } }, select: { id: true, nombres: true, apellidos: true } });
    const ids = [...new Set(rows.flatMap(r => JSON.parse(r.detalle) as string[]))];
    const items = new Map((await prisma.finCobroItem.findMany({ where: { id: { in: ids } } })).map(i => [i.id, i]));
    return rows.map((r): MobPagoIntencionDto => {
      const a = als.find(x => x.id === r.alumnoId);
      return {
        id: r.id, alumnoId: r.alumnoId, alumno: a ? `${a.nombres} ${a.apellidos}` : r.alumnoId, tutor: r.tutor, tipo: r.tipo as 'cargos' | 'recarga', monto: r.monto,
        estado: r.estado as MobPagoIntencionDto['estado'], creado: iso(r.creado)!, resuelto: iso(r.resuelto), resueltoPor: r.resueltoPor, nota: r.nota, reciboId: r.reciboId,
        detalle: (JSON.parse(r.detalle) as string[]).map(id => items.get(id)).filter((i): i is NonNullable<typeof i> => !!i).map(i => ({ id: i.id, con: i.con, monto: i.monto })),
      };
    });
  });
  type ResolverReq = FastifyRequest<{ Params: { id: string }; Body: { reciboId?: string; nota?: string } }>;
  const resolver = (accion: 'confirmada' | 'rechazada') => async (req: ResolverReq, reply: FastifyReply) => {
    const r = await prisma.mobPagoIntencion.findUnique({ where: { id: req.params.id } });
    if (!r) return reply.code(404).send({ error: 'Intención de pago no encontrada' });
    if (r.estado !== 'pendiente') return reply.code(409).send({ error: `Ya estaba ${r.estado}` });
    const nota = String(req.body?.nota ?? '').trim().slice(0, 300), reciboId = String(req.body?.reciboId ?? '').trim().slice(0, 40);
    if (accion === 'rechazada' && !nota) return reply.code(400).send({ error: 'Indica el motivo del rechazo' });
    // Reclamo atómico: solo una resolución gana si dos cajeros actúan a la vez.
    const ok = await prisma.mobPagoIntencion.updateMany({ where: { id: r.id, estado: 'pendiente' }, data: { estado: accion, resuelto: new Date(), resueltoPor: req.user.usuario, nota, reciboId } });
    if (!ok.count) return reply.code(409).send({ error: 'Ya fue resuelta por otro usuario' });
    if (accion === 'confirmada' && r.tipo === 'recarga')
      await prisma.mobWallet.upsert({ where: { alumnoId: r.alumnoId }, update: { saldo: { increment: r.monto } }, create: { alumnoId: r.alumnoId, saldo: r.monto, limite: 200 } });
    await audit(req.user, 'Update', { tabla: 'MobPagoIntencion', id: r.id, prev: 'pendiente', next: `${accion} · ${r.tipo} ${r.monto}${reciboId ? ' · ' + reciboId : ''}`, ip: req.ip });
    return { ok: true, estado: accion };
  };
  app.post<{ Params: { id: string }; Body: { reciboId?: string; nota?: string } }>('/pagos/intenciones/:id/confirmar', cajero, resolver('confirmada'));
  app.post<{ Params: { id: string }; Body: { reciboId?: string; nota?: string } }>('/pagos/intenciones/:id/rechazar', cajero, resolver('rechazada'));

  // ---- Configuración de pasarela / instrucciones de pago / recargas (Super Admin) ----
  const sa = { onRequest: [app.authenticate, app.requireRole('Super Admin')] };
  const cfgPasarela = async (): Promise<MobPasarelaCfg> => {
    const [p, instr, com] = await Promise.all([pasarelaGet(), instruccionesPago(), comedorGet()]);
    return { activa: p.activa, proveedor: p.proveedor, demo: p.demo, instruccionesPago: instr, recargas: com.recargas, demoDisponible: config.seedDemo };
  };
  app.get('/pasarela', sa, cfgPasarela);
  app.put<{ Body: Partial<Pick<MobPasarelaCfg, 'activa' | 'proveedor' | 'demo' | 'instruccionesPago' | 'recargas'>> }>('/pasarela', sa, async (req, reply) => {
    const b = req.body ?? {};
    const cur = await pasarelaGet();
    const next = { activa: b.activa ?? cur.activa, proveedor: b.proveedor === undefined ? cur.proveedor : b.proveedor || null, demo: b.demo ?? cur.demo };
    if (next.demo && !config.seedDemo) return reply.code(400).send({ error: 'El modo demo solo existe en instalaciones de demostración' });
    if (next.activa && !PASARELAS_IMPLEMENTADAS.includes(next.proveedor ?? '')) return reply.code(400).send({ error: 'Ningún proveedor de pasarela está implementado en esta versión: el portal registrará el pago para verificación en caja' });
    let rs: number[] | null = null;
    if (b.recargas !== undefined) {
      rs = [...new Set((b.recargas ?? []).map(Number))].filter(n => Number.isFinite(n) && n > 0 && n <= 1_000_000).sort((x, y) => x - y);
      if (!rs.length || rs.length > 6) return reply.code(400).send({ error: 'Indica de 1 a 6 montos de recarga mayores que cero' });
    }
    await pasarelaSet(next);
    if (b.instruccionesPago !== undefined) await cfgSet('perfil', { ...(await cfgGet('perfil')), instruccionesPago: String(b.instruccionesPago).trim().slice(0, 1000) });
    if (rs) await comedorSet({ ...(await comedorGet()), recargas: rs });
    await audit(req.user, 'Update', { tabla: 'TenantConfig', id: 'pasarela', next: `activa=${next.activa} demo=${next.demo}`, ip: req.ip });
    return cfgPasarela();
  });

  const docente = [app.authenticate, app.requireRole('Docente', 'Director Académico', 'Super Admin')];

  /** Pase de lista de la asignación elegida (`asig`, por defecto la primera del usuario). Misma nómina y marcas que el Pase de Lista de escritorio; fecha = hoy del colegio. */
  app.get<{ Querystring: { asig?: string; fecha?: string } }>('/lista', { onRequest: docente }, async (req, reply) => {
    const t = await ahora();
    const fecha = req.query.fecha || t.fecha;
    const cat = await loadCat();
    const { lista, sel, prohibida } = await elegirAsig(cat, req.user, req.query.asig);
    if (prohibida) return reply.code(403).send({ error: 'Sin permiso sobre esa asignación' });
    const asignaciones = lista.map(optDe);
    if (!sel) return { seccion: '', fecha, alumnos: [], asignaciones, asigId: '' } satisfies MobListaData;
    const bloques = bloquesDe(cat, cat.secciones.get(sel.seccionId)!.tanda);
    const slots = (await prisma.acadHorario.findMany({ where: { seccion: sel.seccionId, materia: sel.materiaId, NOT: { slot: { startsWith: '_' } } } })).map(r => r.slot);
    const nom = await nomina(cat, sel.seccionId);
    const marcas = await marcasDelDia(nom, fecha);
    const res: MobListaData = {
      seccion: sel.seccion, fecha, tanda: sel.tanda, bloque: bloqueTexto(bloques, bloqueActual(bloques, t.min, t.dow, slots)), asigId: sel.id, asignaciones,
      alumnos: nom.map(n => { const m = n.rosterId ? marcas.get(n.rosterId) : undefined; return { id: n.key, nombre: n.nombre, estado: (m?.estado as MarcaAsistencia | undefined) ?? null, notificar: m?.notificar ?? true }; }),
    };
    return res;
  });

  app.put<{ Body: MobListaSave }>('/lista', { onRequest: docente }, async (req, reply) => {
    const { fecha, asig, marcas } = req.body;
    if (!fecha || !Array.isArray(marcas) || marcas.some(x => !MARCAS.includes(x.estado))) return reply.code(400).send({ error: 'Datos inválidos' });
    const cat = await loadCat();
    const { sel, prohibida } = await elegirAsig(cat, req.user, asig);
    if (!sel || prohibida) return reply.code(403).send({ error: 'Sin permiso sobre esa asignación' });
    const r = await guardarAsistencia(cat, sel.seccionId, fecha, marcas.map(x => ({ rosterId: x.alumnoId, estado: x.estado, notificar: x.notificar })));
    if (!r) return reply.code(400).send({ error: 'Hay estudiantes que no pertenecen a esta sección' });
    return r;
  });
};
export default plugin;
