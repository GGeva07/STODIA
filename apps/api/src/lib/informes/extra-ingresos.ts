import type { InformeCelda, InformeResp } from '@stodia/shared';
import { prisma } from '../../db';
import { round2, venceISO } from '../cxc';
import { col, etiquetaMes, etiquetasFiltros, hoy as hoyDMY, mesDe, tablaMem, trozos, type Filtros } from './comun';
import { serviciosExtra } from './extra-datos';

/**
 * INFORME 9 · Extracurriculares: ingresos por disciplina/taller (inf-estudiantes). Servicios de ServicioAlumno.extraId del ciclo (ServicioAlumno.cicloId o, sin backfill, el ciclo de sus cargos).
 * Mismas definiciones del cierre del año y del informe de planes (por cargo srv del servicio, ciclo = el del filtro):
 *   Pendiente = Σ cargos sin pagar · Facturado = Σ monto bruto de las líneas de recibos vigentes que los cobraron + Pendiente · Descuentos = Σ descuento de esas líneas
 *   Cobrado = Facturado − Descuentos − Pendiente (= Σ líneas netas) · % cobranza = Cobrado / (Facturado − Descuentos).
 * Por mes: facturado y pendiente por mes de VENCIMIENTO del cargo; cobrado por mes del RECIBO (zona horaria de la institución).
 */
interface Acum { fact: number; desc: number; pend: number; cobr: number }
const nuevo = (): Acum => ({ fact: 0, desc: 0, pend: 0, cobr: 0 });
const cobranza = (a: Acum) => { const n = a.fact - a.desc; return n > 0 ? round2((a.cobr / n) * 100) : 0; };

export async function informeExtraIngresos(f: Filtros): Promise<InformeResp> {
  const cicloId = f.ciclo.id;
  const todos = await serviciosExtra({ disciplina: f.disciplina });
  const svcs = todos.filter(s => s.cicloId === cicloId);
  const ids = svcs.map(s => s.id);
  const extras = new Map((await prisma.acadExtra.findMany({ select: { id: true, name: true, cat: true } })).map(e => [e.id, e]));
  const svcDe = new Map(svcs.map(s => [s.id, s]));

  const cargos: { id: string; servicioId: string; monto: number; paid: boolean; vence: string; alumnoId: string }[] = [];
  const lineas: { monto: number; descuento: number; cobroItemId: string; mes: string }[] = [];
  for (const ch of trozos(ids, 500)) {
    cargos.push(...(await prisma.finCobroItem.findMany({ where: { servicioId: { in: ch }, cicloId }, select: { id: true, servicioId: true, monto: true, paid: true, vence: true, alumnoId: true } })).map(c => ({ ...c, servicioId: c.servicioId! })));
    for (const l of await prisma.finReciboItem.findMany({
      where: { recibo: { is: { est: { not: 'Anulado' } } }, cobroItem: { is: { servicioId: { in: ch }, cicloId } } },
      select: { monto: true, descuento: true, cobroItemId: true, recibo: { select: { createdAt: true } } },
    })) lineas.push({ monto: l.monto, descuento: l.descuento ?? 0, cobroItemId: l.cobroItemId!, mes: mesDe(l.recibo.createdAt, f.tz) });
  }
  const cargoDe = new Map(cargos.map(c => [c.id, c]));
  const lineasPorCargo = new Set(lineas.map(l => l.cobroItemId));
  const pagadosSinRecibo = cargos.filter(c => c.paid && !lineasPorCargo.has(c.id));

  const porSvc = new Map<string, Acum>(), porDisc = new Map<string, Acum>(), porMes = new Map<string, Acum>(), porDiscMes = new Map<string, Map<string, Acum>>();
  const acum = (m: Map<string, Acum>, k: string) => { let a = m.get(k); if (!a) { a = nuevo(); m.set(k, a); } return a; };
  const sumar = (a: Acum, fact: number, desc: number, pend: number, cobr: number) => { a.fact += fact; a.desc += desc; a.pend += pend; a.cobr += cobr; };
  const aplicar = (svcId: string, mes: string | null, fact: number, desc: number, pend: number, cobr: number) => {
    const s = svcDe.get(svcId)!;
    sumar(acum(porSvc, svcId), fact, desc, pend, cobr);
    sumar(acum(porDisc, s.extraId), fact, desc, pend, cobr);
    if (mes) {
      sumar(acum(porMes, mes), fact, desc, pend, cobr);
      let dm = porDiscMes.get(s.extraId); if (!dm) { dm = new Map(); porDiscMes.set(s.extraId, dm); }
      sumar(acum(dm, mes), fact, desc, pend, cobr);
    }
  };
  for (const c of cargos) if (!c.paid) { const v = venceISO(c.vence); aplicar(c.servicioId, v ? v.slice(0, 7) : null, c.monto, 0, c.monto, 0); }
  for (const l of lineas) { const c = cargoDe.get(l.cobroItemId)!; aplicar(c.servicioId, l.mes, l.monto, l.descuento, 0, round2(l.monto - l.descuento)); }
  // Mes del facturado cobrado: el del vencimiento sería más intuitivo, pero el cobrado va por fecha del recibo; el facturado de lo cobrado se asigna al mes del recibo (mismo criterio).

  // Alumnos
  const alIds = [...new Set(svcs.map(s => s.alumnoId))];
  const alumnos = new Map<string, { code: string; nombre: string; orden: string; seccion: string }>();
  for (const ch of trozos(alIds)) {
    for (const a of await prisma.alumno.findMany({
      where: { id: { in: ch } },
      select: { id: true, code: true, nombres: true, apellidos: true, seccion: { select: { letra: true, grado: { select: { nombre: true } } } }, matriculas: { where: { cicloId }, select: { seccion: { select: { letra: true, grado: { select: { nombre: true } } } } } } },
    })) { const s = a.matriculas[0]?.seccion ?? a.seccion; alumnos.set(a.id, { code: a.code, nombre: `${a.nombres} ${a.apellidos}`.trim(), orden: `${a.apellidos} ${a.nombres}`.toLowerCase(), seccion: `${s.grado.nombre} ${s.letra}` }); }
  }

  const tot = [...porDisc.values()].reduce((t, a) => { sumar(t, a.fact, a.desc, a.pend, a.cobr); return t; }, nuevo());
  const discOrden = [...new Set(svcs.map(s => s.extraId))].sort((a, b) => (porDisc.get(b)?.cobr ?? 0) - (porDisc.get(a)?.cobr ?? 0) || (extras.get(a)?.name ?? '').localeCompare(extras.get(b)?.name ?? '', 'es'));
  const insc = (d: string) => new Set(svcs.filter(s => s.extraId === d).map(s => s.alumnoId)).size;
  const bajas = (d: string) => new Set(svcs.filter(s => s.extraId === d && s.baja).map(s => s.alumnoId)).size;
  const filaAcum = (a: Acum) => [round2(a.fact), round2(a.desc), round2(a.cobr), round2(a.pend), cobranza(a)] as InformeCelda[];
  const filasDisc = discOrden.map(d => { const a = porDisc.get(d) ?? nuevo(); return [extras.get(d)?.name ?? d, extras.get(d)?.cat ?? '', insc(d), insc(d) - bajas(d), bajas(d), ...filaAcum(a)] as InformeCelda[]; });
  const colsMes = [col('mes', 'Mes'), col('fact', 'Facturado', 'moneda'), col('desc', 'Descuentos', 'moneda'), col('cobr', 'Cobrado', 'moneda'), col('pend', 'Pendiente', 'moneda')];
  const filasMesDe = (m: Map<string, Acum>) => [...m.entries()].sort().map(([k, a]) => [etiquetaMes(k), round2(a.fact), round2(a.desc), round2(a.cobr), round2(a.pend)] as InformeCelda[]);
  const detDisc = discOrden.map(d => filasMesDe(porDiscMes.get(d) ?? new Map()));

  const filasAl = svcs.slice().sort((a, b) => (extras.get(a.extraId)?.name ?? '').localeCompare(extras.get(b.extraId)?.name ?? '', 'es') || (alumnos.get(a.alumnoId)?.orden ?? '').localeCompare(alumnos.get(b.alumnoId)?.orden ?? '', 'es'))
    .map(s => { const a = porSvc.get(s.id) ?? nuevo(), al = alumnos.get(s.alumnoId); return [al?.code ?? '', al?.nombre ?? '', al?.seccion ?? '', extras.get(s.extraId)?.name ?? s.extraId, s.baja ? 'Baja' : 'Activo', s.alta ? s.alta.split('-').reverse().join('/') : '', s.baja ? s.baja.split('-').reverse().join('/') : '', round2(a.fact), round2(a.cobr), round2(a.pend)] as InformeCelda[]; });

  const alumnosDistintos = new Set(svcs.map(s => s.alumnoId)).size;
  return {
    id: 'extra-ingresos', titulo: 'Extracurriculares: ingresos por disciplina', grupo: 'inf-estudiantes', ciclo: f.ciclo.nombre, generado: hoyDMY(f.tz),
    filtros: await etiquetasFiltros(f, ['ciclo', 'disciplina']),
    resumen: [
      { id: 'disc', etiqueta: 'Disciplinas con alumnos', valor: discOrden.length, tipo: 'entero' },
      { id: 'insc', etiqueta: 'Alumnos inscritos', valor: alumnosDistintos, tipo: 'entero' },
      { id: 'serv', etiqueta: 'Inscripciones (servicios)', valor: svcs.length, tipo: 'entero' },
      { id: 'fact', etiqueta: 'Facturado', valor: round2(tot.fact), tipo: 'moneda' },
      { id: 'cobr', etiqueta: 'Cobrado', valor: round2(tot.cobr), tipo: 'moneda', tono: 'ok' },
      { id: 'pend', etiqueta: 'Pendiente', valor: round2(tot.pend), tipo: 'moneda', tono: tot.pend ? 'warn' : undefined },
      { id: 'pct', etiqueta: '% de cobranza', valor: cobranza(tot), tipo: 'porcentaje' },
    ],
    tablas: [
      tablaMem(f, 'disciplinas', 'Ingresos por disciplina / taller', [col('disc', 'Disciplina'), col('cat', 'Categoría'), col('insc', 'Inscritos', 'entero'), col('act', 'Activos', 'entero'), col('baj', 'Bajas', 'entero'), col('fact', 'Facturado', 'moneda'), col('desc', 'Descuentos', 'moneda'), col('cobr', 'Cobrado', 'moneda'), col('pend', 'Pendiente', 'moneda'), col('pct', '% cobranza', 'porcentaje')], filasDisc,
        { totales: ['TOTAL', '', alumnosDistintos, alumnosDistintos - new Set(svcs.filter(s => s.baja).map(s => s.alumnoId)).size, new Set(svcs.filter(s => s.baja).map(s => s.alumnoId)).size, ...filaAcum(tot)], vacio: 'No hay servicios extracurriculares en este ciclo.',
          detalle: { titulo: 'Ingreso por mes de la disciplina', columnas: colsMes, porFila: detDisc } }),
      tablaMem(f, 'mes', 'Ingreso por mes (todas las disciplinas)', colsMes, filasMesDe(porMes), { totales: ['TOTAL', round2(tot.fact), round2(tot.desc), round2(tot.cobr), round2(tot.pend)], vacio: 'No hay ingresos con estos filtros.' }),
      { ...tablaMem(f, 'alumnos', 'Detalle por alumno', [col('code', 'Código'), col('alumno', 'Alumno'), col('seccion', 'Grado / sección'), col('disc', 'Disciplina'), col('estado', 'Estado'), col('alta', 'Alta'), col('baja', 'Baja'), col('fact', 'Facturado', 'moneda'), col('cobr', 'Cobrado', 'moneda'), col('pend', 'Pendiente', 'moneda')], filasAl,
        { paginable: true, vacio: 'No hay alumnos inscritos con estos filtros.', totales: ['', 'TOTAL', '', '', '', '', '', round2(tot.fact), round2(tot.cobr), round2(tot.pend)] }), pdfMax: 75 },
    ],
    notas: [
      'Cómo se calcula: se toman los servicios de actividades extracurriculares (Expediente › Servicios) contratados en el ciclo. Pendiente = cargos de esos servicios sin pagar; Facturado = lo cobrado (monto bruto de las líneas de recibos vigentes) + lo pendiente; Descuentos = descuentos de esas líneas; Cobrado = Facturado − Descuentos − Pendiente. Es la misma definición del cierre del año y del informe de planes de pago.',
      'Por mes: el pendiente se ubica en el mes de vencimiento del cargo y lo cobrado en el mes del recibo. «Inscritos» cuenta alumnos distintos con un servicio de la disciplina en el ciclo; «Bajas» los dados de baja (fecha efectiva de la baja).',
      'El ciclo del servicio es el de su contratación (ServicioAlumno.cicloId; en datos anteriores, el ciclo de sus cargos). El contador manual de inscritos de la ficha de la actividad no se usa. Un servicio de pago único cancelado antes de cobrarse se elimina con sus cargos y no figura aquí.',
      pagadosSinRecibo.length ? `Hay ${pagadosSinRecibo.length} cargo(s) marcados como pagados sin línea de recibo (datos importados) por RD$ ${round2(pagadosSinRecibo.reduce((a, c) => a + c.monto, 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}: no tienen importe cobrado registrado y no suman al facturado ni al cobrado, igual que en el cierre del año.` : 'Todos los cargos pagados de estos servicios tienen su línea de recibo.',
    ],
  };
}
