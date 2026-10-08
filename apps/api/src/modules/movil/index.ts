import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { MarcaAsistencia, MobHijo, MobListaData, MobListaSave, MobTutorData, EstadoCargo } from '@stodia/shared';
import { prisma } from '../../db';
import { ahora, bloqueActual, bloquesDe, bloqueTexto, elegirAsig, guardarAsistencia, loadCat, marcasDelDia, nomina, norm, optDe, periodoDe, rubricaDe } from '../../lib/academico';
import { config } from '../../config';

const MENU: MobTutorData['menu'] = [
  { dia: 'Lunes', plato: 'Pollo guisado, arroz blanco, habichuelas, ensalada verde' },
  { dia: 'Martes', plato: 'Pescado al horno, puré de batata, vegetales' },
  { dia: 'Miércoles', plato: 'Pollo en salsa de maní, moro de guandules', alergeno: 'maní' },
  { dia: 'Jueves', plato: 'Pasta boloñesa, ensalada, flan de leche', alergeno: 'lactosa' },
  { dia: 'Viernes', plato: 'Res guisada, arroz, aguacate, fruta' },
];
const MARCAS = ['P', 'T', 'AJ', 'AI'];

const plugin: FastifyPluginAsync = async app => {
  /** Tutor autenticado (Super Admin ve al tutor demo para previsualizar). */
  const tutorDe = async (req: FastifyRequest) => {
    const usuario = req.user.rol === 'Tutor' ? req.user.usuario : req.user.rol === 'Super Admin' && config.seedDemo ? 'c.mendoza' : null;
    return usuario ? prisma.tutor.findFirst({ where: { usuario }, include: { alumnos: true } }) : null;
  };

  app.get('/tutor', { onRequest: [app.authenticate] }, async (req, reply) => {
    const t = await tutorDe(req);
    // Super Admin sin cuenta demo (producción): estado vacío en lugar de datos de otra persona.
    if (!t && req.user.rol === 'Super Admin') { const vacio: MobTutorData = { tutor: req.user.nombre, hijos: [], menu: MENU }; return vacio; }
    if (!t) return reply.code(403).send({ error: 'Sin permiso' });
    const hijos: MobHijo[] = [];
    const [cat, hoy] = await Promise.all([loadCat(), ahora()]);
    const periodo = periodoDe(hoy.fecha);
    for (const a of t.alumnos) {
      const [cargos, notas, w, accesos, asisMob, ros] = await Promise.all([
        prisma.mobCargo.findMany({ where: { alumnoId: a.id, pagado: false }, orderBy: { id: 'asc' } }),
        prisma.mobNota.findMany({ where: { alumnoId: a.id }, orderBy: { id: 'asc' } }),
        prisma.mobWallet.findUnique({ where: { alumnoId: a.id } }),
        prisma.mobAcceso.findMany({ where: { alumnoId: a.id }, orderBy: { creado: 'desc' }, take: 10 }),
        prisma.mobAsistencia.findMany({ where: { alumnoId: a.id }, orderBy: { fecha: 'desc' }, take: 10 }),
        prisma.acadRoster.findUnique({
          where: { alumnoId: a.id },
          include: { asistencias: { orderBy: { fecha: 'desc' }, take: 10 }, notas: { where: { periodo } } },
        }),
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
        cargos: cargos.map(c => ({ id: c.id, concepto: c.concepto, vence: c.vence, monto: c.monto, estado: c.estado as EstadoCargo })),
        notas: notasH,
        wallet: { saldo: w?.saldo ?? 0, limite: w?.limite ?? 0 },
        accesos: accesos.map(x => ({ hora: x.hora, resultado: x.resultado as 'ok' | 'alert' | 'no' })),
        asistencia: asis.map(x => ({ fecha: x.fecha, estado: x.estado as MarcaAsistencia })),
      });
    }
    const res: MobTutorData = { tutor: t.nombre, hijos, menu: MENU };
    return res;
  });

  /** Paga las cuotas exigibles (Vencida / Por vencer) del hijo. Pasarela simulada. */
  app.post<{ Body: { alumnoId: string } }>('/tutor/pagar', { onRequest: [app.authenticate] }, async (req, reply) => {
    const t = await tutorDe(req);
    if (!t?.alumnos.some(a => a.id === req.body.alumnoId)) return reply.code(403).send({ error: 'Sin permiso' });
    const r = await prisma.mobCargo.updateMany({ where: { alumnoId: req.body.alumnoId, pagado: false, estado: { not: 'Pendiente' } }, data: { pagado: true } });
    return { pagados: r.count };
  });

  app.put<{ Params: { alumnoId: string }; Body: { recarga?: number; limite?: number } }>('/tutor/wallet/:alumnoId', { onRequest: [app.authenticate] }, async (req, reply) => {
    const t = await tutorDe(req);
    const { alumnoId } = req.params;
    if (!t?.alumnos.some(a => a.id === alumnoId)) return reply.code(403).send({ error: 'Sin permiso' });
    const { recarga, limite } = req.body;
    const w = await prisma.mobWallet.upsert({ where: { alumnoId }, update: {}, create: { alumnoId, saldo: 0, limite: 200 } });
    const up = await prisma.mobWallet.update({
      where: { alumnoId },
      data: {
        saldo: recarga && recarga > 0 ? w.saldo + recarga : w.saldo,
        limite: limite !== undefined && limite >= 0 ? limite : w.limite,
      },
    });
    return { saldo: up.saldo, limite: up.limite };
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
