import type { FastifyPluginAsync } from 'fastify';
import type { CierreInforme, InformeCatalogos, InformeCierreFila, InformeMeta, InformeResp, InformeTabla, ScreenId } from '@stodia/shared';
import { prisma } from '../../db';
import { pantallaPermitida } from '../../lib/acceso-nuevas';
import { CicloError, listarCiclos, nombreCiclo } from '../../lib/ciclo';
import { zonaHoraria } from '../../lib/cxc';
import { cfgGet } from '../../lib/sisconfig';
import { CATEGORIAS } from '../../lib/categorias';
import { leerFiltros } from '../../lib/informes/comun';
import { RESULTADOS_MOV } from '../../lib/informes/movimientos';
import { listaCierres } from '../../lib/informes/cierre';
import { cierreTabla, hojasCierre, informeCierreDetalle, validarTabla } from '../../lib/informes/cierre-detalle';
import { INFORMES, informePorId, meta } from '../../lib/informes/registro';
import { hojasDeInforme, xlsxBuffer } from '../../lib/informes/xlsx';

/**
 * /informes — capa común de la sección «Informes» (docs/informes-analisis.md). SOLO LECTURA (nunca escribe ni audita).
 *   GET /informes                       catálogo de informes que el usuario puede ver (filtrado por los ScreenId inf-* de su rol)
 *   GET /informes/catalogos             listas para los filtros (ciclos, grados, secciones, métodos, cajeros, planes, motivos)
 *   GET /informes/cierres               ciclos Cerrados con fecha y usuario del cierre              [inf-cierre]
 *   GET /informes/cierre/:ciclo         CierreInforme: resumen guardado + detalle (desgloses, cuadre) · con ?tabla=cargos|recibos|notas|descuentos|ventas|deudores&page=&size=&q=&alumno=&categoria=&estado=&metodo=&orden=fecha|monto → listado paginado  [inf-cierre]
 *   GET /informes/cierre/:ciclo/export  Excel multihoja del cierre completo (resumen, facturado, cobrado, notas, descuentos, ventas rápidas, deudores, desgloses)  [inf-cierre]
 *   GET /informes/:id                   datos del informe: ?ciclo= &desde= &hasta= &grado= &seccion= &tutor= &soloVencidos= &metodo= &cajero= &plan= &tipo= &motivo=
 *                                       &tabla= &page= &size= (size=all = todas las filas). Los totales siempre son del conjunto completo.
 *   GET /informes/:id/export?formato=xlsx   TODAS las filas (varias hojas: resumen + tablas + detalle)
 * El permiso es por grupo (requireScreen del ScreenId del informe). Un ciclo Cerrado se lee sin problema: el hook CICLO_CERRADO de app.ts solo mira escrituras.
 */
const plugin: FastifyPluginAsync = async app => {
  const auth = { onRequest: [app.authenticate] };
  const sinPermiso = (reply: { code: (n: number) => { send: (b: unknown) => unknown } }) => reply.code(403).send({ error: 'Sin permiso' });

  app.get('/', auth, async (req): Promise<InformeMeta[]> => {
    const m = (await cfgGet('access')) as Record<string, ScreenId[]>;
    return INFORMES.filter(i => pantallaPermitida(m, req.user.rol, i.grupo)).map(meta);
  });

  app.get('/catalogos', auth, async (req, reply): Promise<InformeCatalogos | unknown> => {
    const m = (await cfgGet('access')) as Record<string, ScreenId[]>;
    if (!INFORMES.some(i => pantallaPermitida(m, req.user.rol, i.grupo))) return sinPermiso(reply);
    const [ciclos, grados, secciones, metodos, cajeros, planes, motivos, materias, periodos, disciplinas, catProd, comprobantes] = await Promise.all([
      listarCiclos(),
      prisma.grado.findMany({ orderBy: { orden: 'asc' }, select: { id: true, nombre: true, nivel: { select: { nombre: true } } } }),
      prisma.seccion.findMany({ select: { id: true, gradoId: true, letra: true, grado: { select: { nombre: true, orden: true, nivel: { select: { nombre: true } } } } } }),
      prisma.metodoPago.findMany({ orderBy: { nombre: 'asc' }, select: { id: true, nombre: true } }),
      prisma.user.findMany({ where: { OR: [{ recibos: { some: {} } }, { ventas: { some: {} } }, { notas: { some: {} } }] }, orderBy: { nombre: 'asc' }, select: { id: true, nombre: true } }),
      prisma.finPlan.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      prisma.motivoNota.findMany({ orderBy: { orden: 'asc' }, select: { id: true, nombre: true } }),
      prisma.materia.findMany({ orderBy: { nombre: 'asc' }, select: { id: true, nombre: true } }),
      prisma.periodoAcademico.findMany({ orderBy: { orden: 'asc' }, distinct: ['orden'], select: { orden: true, nombre: true } }),
      prisma.acadExtra.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      prisma.categoriaProducto.findMany({ orderBy: { nombre: 'asc' }, select: { id: true, nombre: true } }),
      prisma.tipoComprobante.findMany({ where: { uso: { in: ['Ventas', 'Ingresos'] } }, orderBy: { orden: 'asc' }, select: { id: true, codigo: true, nombre: true } }),
    ]);
    const secs = secciones.sort((a, b) => a.grado.orden - b.grado.orden || a.letra.localeCompare(b.letra));
    return {
      ciclos: ciclos.map(c => ({ n: c.n, estado: c.estado })), grados: grados.map(g => ({ id: g.id, nombre: `${g.nivel.nombre} · ${g.nombre}` })),
      secciones: secs.map(s => ({ id: s.id, gradoId: s.gradoId, nombre: `${s.grado.nivel.nombre} · ${s.grado.nombre} ${s.letra}` })),
      metodos, cajeros, planes: planes.map(p => ({ id: p.id, nombre: p.name })), motivos,
      materias, periodos, disciplinas: disciplinas.map(d => ({ id: d.id, nombre: d.name })), categoriasProducto: catProd, categoriasCargo: CATEGORIAS.map(c => ({ id: c.id, nombre: c.nombre })),
      comprobantes: comprobantes.map(t => ({ id: t.id, nombre: `${t.codigo} · ${t.nombre}` })),
      resultados: RESULTADOS_MOV.map(r => ({ id: r, nombre: r })),
    } satisfies InformeCatalogos;
  });

  const cierre = { onRequest: [app.authenticate, app.requireScreen('inf-cierre')] };
  app.get('/cierres', cierre, async (): Promise<InformeCierreFila[]> => listaCierres(await zonaHoraria()));
  /** Ciclo Cerrado (404 si no existe, 409 si no está cerrado) → nombre normalizado. */
  const cerrado = async (param: string) => {
    const nombre = nombreCiclo(param);
    const c = await prisma.ciclo.findUnique({ where: { nombre }, select: { estado: true } });
    if (!c) throw new CicloError(`El ciclo lectivo «${nombre}» no existe`, 404);
    if (c.estado !== 'Cerrado') throw new CicloError(`El ciclo ${nombre} no está cerrado`, 409);
    return nombre;
  };
  const q1 = (v: unknown) => { const s = String(Array.isArray(v) ? v[0] : v ?? '').trim(); return s || undefined; };
  /**
   * ETAPA 2: resumen guardado + detalle del cierre. Sin `?tabla=` → CierreInforme (resumen + desgloses + cuadre, o detalleDisponible:false en cierres anteriores).
   * Con `?tabla=cargos|recibos|notas|descuentos|ventas|deudores&page=&size=&q=&alumno=&categoria=&estado=&metodo=&orden=fecha|monto` → InformeTabla paginada (size=all = todas) con totales del conjunto filtrado.
   */
  app.get<{ Params: { ciclo: string }; Querystring: Record<string, string> }>('/cierre/:ciclo', cierre, async (req, reply): Promise<CierreInforme | InformeTabla | unknown> => {
    let nombre: string;
    try { nombre = await cerrado(req.params.ciclo); } catch (e) { if (e instanceof CicloError) return reply.code(e.status).send({ error: e.message }); throw e; }
    const tz = await zonaHoraria(), q = req.query ?? {};
    try {
      if (q1(q.tabla)) {
        const sizeRaw = q1(q.size);
        return await cierreTabla(nombre, tz, {
          tabla: validarTabla(q1(q.tabla)), page: Math.max(1, parseInt(q1(q.page) ?? '1', 10) || 1), size: sizeRaw === 'all' ? 0 : Math.min(500, Math.max(1, parseInt(sizeRaw ?? '25', 10) || 25)),
          q: q1(q.q), alumno: q1(q.alumno), categoria: q1(q.categoria), estado: q1(q.estado), metodo: q1(q.metodo), orden: q1(q.orden) === 'monto' ? 'monto' : 'fecha',
        });
      }
      return await informeCierreDetalle(nombre, tz);
    } catch (e) { if (e instanceof CicloError) return reply.code(e.status).send({ error: e.message }); throw e; }
  });
  /** Excel del cierre completo (varias hojas): Resumen, Facturado, Cobrado, Notas, Descuentos, Ventas rápidas, Deudores + desgloses. Todas las filas. */
  app.get<{ Params: { ciclo: string } }>('/cierre/:ciclo/export', cierre, async (req, reply) => {
    let nombre: string;
    try { nombre = await cerrado(req.params.ciclo); } catch (e) { if (e instanceof CicloError) return reply.code(e.status).send({ error: e.message }); throw e; }
    const buf = xlsxBuffer(await hojasCierre(nombre, await zonaHoraria()));
    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="informe_cierre_${nombre.replace(/[^0-9A-Za-z]+/g, '-')}_${new Date().toISOString().slice(0, 10)}.xlsx"`)
      .send(buf);
  });

  // Una ruta por informe, protegida con el ScreenId de su grupo.
  for (const def of INFORMES) {
    const opts = { onRequest: [app.authenticate, app.requireScreen(def.grupo)] };
    if (!def.run) {
      app.get(`/${def.id}`, opts, async (_req, reply) => reply.code(409).send({ error: `«${def.titulo}» está en preparación`, code: 'EN_PREPARACION' }));
      continue;
    }
    const run = def.run;
    app.get(`/${def.id}`, opts, async (req): Promise<InformeResp> => run(await leerFiltros(req)));
    app.get<{ Querystring: { formato?: string } }>(`/${def.id}/export`, opts, async (req, reply) => {
      const formato = String(req.query.formato ?? 'xlsx').toLowerCase();
      if (formato !== 'xlsx' && formato !== 'json') return reply.code(400).send({ error: 'Formato no soportado: usa formato=xlsx' });
      const f = await leerFiltros(req);
      const r = await run({ ...f, size: 0 });
      if (formato === 'json') return r;
      const nombre = `informe_${def.id}_${r.ciclo.replace(/[^0-9A-Za-z]+/g, '-')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      return reply
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('Content-Disposition', `attachment; filename="${nombre}"`)
        .send(xlsxBuffer(hojasDeInforme(r)));
    });
  }
};
export default plugin;
