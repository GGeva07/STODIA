import type { InformeCelda, InformeResp } from '@stodia/shared';
import { prisma } from '../../db';
import { round2 } from '../cxc';
import { col, etiquetasFiltros, hoy as hoyDMY, tablaMem, trozos, type Filtros } from './comun';
import { serviciosExtra, type SvcExtra } from './extra-datos';

/**
 * INFORME 10 · Extracurriculares: retención y proyección de continuidad (inf-estudiantes). Cada servicio (ServicioAlumno con extraId) pertenece a UN ciclo; la continuidad se mide entre ciclos
 * consecutivos de la lista de ciclos por fecha. Para el ciclo N del filtro y su ciclo anterior P, por disciplina:
 *   Inscritos(C)   = alumnos distintos con un servicio de la disciplina en el ciclo C.
 *   Base(P)        = inscritos de P que seguían activos al cierre de P (sin baja, o con baja posterior al fin de P).
 *   Continúan      = Base(P) ∩ Inscritos(N).  Retención = Continúan / Base(P).   No continuaron = Base(P) − Continúan.
 *   Altas(N)       = Inscritos(N) − Base(P)  (nuevos y reingresos).   Bajas(N) = inscritos de N con baja registrada.   Neto = Altas − Bajas.   Activos(N) = Inscritos(N) − Bajas(N).
 *   PROYECCIÓN de N+1 = ESTIMACIÓN: Activos(N) × tasa de retención HISTÓRICA de la disciplina (Σ Continúan / Σ Base de todos los pares de ciclos consecutivos hasta N). Con menos de
 *   2 ciclos de datos para la disciplina (ningún par), no se estima: se indica «sin datos suficientes».
 */
const dia = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '');
const pct = (n: number, d: number) => (d > 0 ? round2((n / d) * 100) : null);

interface PorCiclo { insc: Set<string>; base: Set<string>; bajas: Set<string> }

export async function informeExtraRetencion(f: Filtros): Promise<InformeResp> {
  const [ciclos, todos, extras] = await Promise.all([
    prisma.ciclo.findMany({ orderBy: { fechaInicio: 'asc' }, select: { id: true, nombre: true, fechaInicio: true, fechaFin: true } }),
    serviciosExtra({ disciplina: f.disciplina }),
    prisma.acadExtra.findMany({ select: { id: true, name: true, cat: true } }),
  ]);
  const nombreExtra = new Map(extras.map(e => [e.id, e.name]));
  const idx = ciclos.findIndex(c => c.id === f.ciclo.id);
  const N = ciclos[idx], P = idx > 0 ? ciclos[idx - 1] : null, S = idx + 1 < ciclos.length ? ciclos[idx + 1] : null;

  // (disciplina, ciclo) → conjuntos
  const datos = new Map<string, PorCiclo>();
  const get = (d: string, c: string) => { const k = `${d}|${c}`; let e = datos.get(k); if (!e) { e = { insc: new Set(), base: new Set(), bajas: new Set() }; datos.set(k, e); } return e; };
  const finDe = new Map(ciclos.map(c => [c.id, c.fechaFin]));
  const svcPor = new Map<string, SvcExtra[]>();
  for (const s of todos) {
    if (!s.cicloId) continue;
    const e = get(s.extraId, s.cicloId);
    e.insc.add(s.alumnoId);
    if (s.baja) e.bajas.add(s.alumnoId);
    if (!s.baja || s.baja > (finDe.get(s.cicloId) ?? '9999')) e.base.add(s.alumnoId);
    svcPor.set(`${s.extraId}|${s.cicloId}|${s.alumnoId}`, [...(svcPor.get(`${s.extraId}|${s.cicloId}|${s.alumnoId}`) ?? []), s]);
  }
  const discs = [...new Set(todos.filter(s => s.cicloId).map(s => s.extraId))].sort((a, b) => (nombreExtra.get(a) ?? '').localeCompare(nombreExtra.get(b) ?? '', 'es'));
  const vacio = () => ({ insc: new Set<string>(), base: new Set<string>(), bajas: new Set<string>() });
  const dN = (d: string) => datos.get(`${d}|${N.id}`) ?? vacio(), dP = (d: string) => (P ? datos.get(`${d}|${P.id}`) ?? vacio() : vacio());
  // Pares históricos (hasta N) de la disciplina con base > 0
  const pares = (d: string) => {
    const out: { de: string; a: string; base: number; cont: number }[] = [];
    for (let i = 1; i <= idx; i++) {
      const p = datos.get(`${d}|${ciclos[i - 1].id}`), c = datos.get(`${d}|${ciclos[i].id}`);
      if (!p || !c || !p.base.size) continue;
      out.push({ de: ciclos[i - 1].nombre, a: ciclos[i].nombre, base: p.base.size, cont: [...p.base].filter(x => c.insc.has(x)).length });
    }
    return out;
  };

  interface R { d: string; inscP: number; base: number; cont: number; noCont: number; inscN: number; altas: number; bajas: number; activos: number; tasa: number | null; proy: number | null; pares: ReturnType<typeof pares> }
  const filasR: R[] = discs.filter(d => dN(d).insc.size || dP(d).insc.size).map(d => {
    const n = dN(d), p = dP(d), cont = [...p.base].filter(x => n.insc.has(x)).length, altas = [...n.insc].filter(x => !p.base.has(x)).length;
    const ps = pares(d), sb = ps.reduce((a, x) => a + x.base, 0), sc = ps.reduce((a, x) => a + x.cont, 0);
    const activos = n.insc.size - n.bajas.size, tasa = sb > 0 ? sc / sb : null;
    return { d, inscP: p.insc.size, base: p.base.size, cont, noCont: p.base.size - cont, inscN: n.insc.size, altas, bajas: n.bajas.size, activos, tasa: tasa == null ? null : Math.round(tasa * 10000) / 100, proy: tasa == null ? null : Math.round(activos * tasa), pares: ps };
  });
  const T = filasR.reduce((t, r) => ({ inscP: t.inscP + r.inscP, base: t.base + r.base, cont: t.cont + r.cont, noCont: t.noCont + r.noCont, inscN: t.inscN + r.inscN, altas: t.altas + r.altas, bajas: t.bajas + r.bajas, activos: t.activos + r.activos, proy: t.proy + (r.proy ?? 0), conProy: t.conProy + (r.proy != null ? 1 : 0) }), { inscP: 0, base: 0, cont: 0, noCont: 0, inscN: 0, altas: 0, bajas: 0, activos: 0, proy: 0, conProy: 0 });
  const hayPar = filasR.some(r => r.pares.length > 0);

  const tRet = tablaMem(f, 'retencion', 'Retención, altas y bajas por disciplina', [col('d', 'Disciplina'), col('inscP', `Inscritos ${P?.nombre ?? 'ciclo anterior'}`, 'entero'), col('base', 'Activos al cierre (base)', 'entero'), col('cont', 'Continúan', 'entero'), col('noc', 'No continuaron', 'entero'), col('ret', 'Retención', 'porcentaje'), col('inscN', `Inscritos ${N.nombre}`, 'entero'), col('altas', 'Altas', 'entero'), col('bajas', 'Bajas', 'entero'), col('neto', 'Neto (altas − bajas)', 'entero'), col('act', 'Activos', 'entero')],
    filasR.map(r => [nombreExtra.get(r.d) ?? r.d, r.inscP, r.base, r.cont, r.noCont, pct(r.cont, r.base), r.inscN, r.altas, r.bajas, r.altas - r.bajas, r.activos] as InformeCelda[]),
    { totales: ['TOTAL', T.inscP, T.base, T.cont, T.noCont, pct(T.cont, T.base), T.inscN, T.altas, T.bajas, T.altas - T.bajas, T.activos], vacio: 'No hay servicios extracurriculares en este ciclo ni en el anterior.' });

  const tProy = tablaMem(f, 'proyeccion', `ESTIMACIÓN de continuidad para el ciclo siguiente${S ? ' (' + S.nombre + ')' : ''}`, [col('d', 'Disciplina'), col('pares', 'Pares de ciclos usados'), col('base', 'Base acumulada', 'entero'), col('cont', 'Continuaron', 'entero'), col('tasa', 'Tasa histórica', 'porcentaje'), col('act', `Activos ${N.nombre}`, 'entero'), col('proy', 'Proyección (estimada)', 'entero'), col('obs', 'Observación')],
    filasR.map(r => [nombreExtra.get(r.d) ?? r.d, r.pares.map(x => `${x.de} → ${x.a}`).join(' · ') || '—', r.pares.reduce((a, x) => a + x.base, 0), r.pares.reduce((a, x) => a + x.cont, 0), r.tasa, r.activos, r.proy, r.pares.length ? 'ESTIMACIÓN: activos × tasa histórica' : 'Sin datos suficientes: se necesitan al menos 2 ciclos con la disciplina'] as InformeCelda[]),
    { totales: ['TOTAL (solo disciplinas con estimación)', '', filasR.reduce((a, r) => a + r.pares.reduce((b, x) => b + x.base, 0), 0), filasR.reduce((a, r) => a + r.pares.reduce((b, x) => b + x.cont, 0), 0), pct(filasR.reduce((a, r) => a + r.pares.reduce((b, x) => b + x.cont, 0), 0), filasR.reduce((a, r) => a + r.pares.reduce((b, x) => b + x.base, 0), 0)), T.activos, T.conProy ? T.proy : null, T.conProy ? 'Suma de las estimaciones' : 'Sin datos suficientes'], vacio: 'No hay disciplinas con alumnos.' });

  // Detalle por alumno
  type Sit = 'Continúa' | 'No continuó' | 'Alta nueva' | 'Reingreso';
  const filasAl: { d: string; al: string; sit: Sit; enP: string; enN: string; bajaN: string }[] = [];
  for (const d of discs) {
    const n = dN(d), p = dP(d);
    for (const al of new Set([...p.base, ...n.insc])) {
      const enP = p.base.has(al), enN = n.insc.has(al);
      const sit: Sit = enP && enN ? 'Continúa' : enP ? 'No continuó' : p.insc.has(al) ? 'Reingreso' : 'Alta nueva';
      const bajaN = (svcPor.get(`${d}|${N.id}|${al}`) ?? []).map(s => s.baja).find(Boolean) ?? null;
      filasAl.push({ d, al, sit, enP: enP ? 'Activo' : p.insc.has(al) ? 'Baja' : '—', enN: enN ? (bajaN ? 'Baja' : 'Activo') : '—', bajaN: dia(bajaN) });
    }
  }
  const info = new Map<string, { code: string; nombre: string; orden: string }>();
  for (const ch of trozos([...new Set(filasAl.map(x => x.al))])) for (const a of await prisma.alumno.findMany({ where: { id: { in: ch } }, select: { id: true, code: true, nombres: true, apellidos: true } })) info.set(a.id, { code: a.code, nombre: `${a.nombres} ${a.apellidos}`.trim(), orden: `${a.apellidos} ${a.nombres}`.toLowerCase() });
  filasAl.sort((a, b) => (nombreExtra.get(a.d) ?? '').localeCompare(nombreExtra.get(b.d) ?? '', 'es') || a.sit.localeCompare(b.sit, 'es') || (info.get(a.al)?.orden ?? '').localeCompare(info.get(b.al)?.orden ?? '', 'es'));
  const tAl = { ...tablaMem(f, 'alumnos', 'Detalle por alumno', [col('code', 'Código'), col('alumno', 'Alumno'), col('d', 'Disciplina'), col('sit', 'Situación'), col('p', `En ${P?.nombre ?? 'ciclo anterior'}`), col('n', `En ${N.nombre}`), col('baja', 'Fecha de baja')],
    filasAl.map(x => [info.get(x.al)?.code ?? '', info.get(x.al)?.nombre ?? '', nombreExtra.get(x.d) ?? x.d, x.sit, x.enP, x.enN, x.bajaN] as InformeCelda[]), { paginable: true, vacio: 'No hay alumnos con estos filtros.' }), pdfMax: 75 };

  const ciclosConDatos = new Set(todos.filter(s => s.cicloId).map(s => s.cicloId)).size;
  return {
    id: 'extra-retencion', titulo: 'Extracurriculares: retención y proyección', grupo: 'inf-estudiantes', ciclo: f.ciclo.nombre, generado: hoyDMY(f.tz),
    filtros: await etiquetasFiltros(f, ['ciclo', 'disciplina']),
    resumen: [
      { id: 'base', etiqueta: `Activos al cierre de ${P?.nombre ?? 'ciclo anterior'}`, valor: P ? T.base : 'Sin ciclo anterior', tipo: 'entero' },
      { id: 'cont', etiqueta: 'Continúan en el ciclo', valor: P ? T.cont : 'Sin ciclo anterior', tipo: 'entero', tono: 'ok' },
      { id: 'ret', etiqueta: 'Retención', valor: P && T.base ? pct(T.cont, T.base)! : 'Sin base de comparación', tipo: 'porcentaje', tono: 'info' },
      { id: 'altas', etiqueta: 'Altas del ciclo', valor: T.altas, tipo: 'entero' },
      { id: 'bajas', etiqueta: 'Bajas del ciclo', valor: T.bajas, tipo: 'entero', tono: T.bajas ? 'warn' : undefined },
      { id: 'neto', etiqueta: 'Neto (altas − bajas)', valor: T.altas - T.bajas, tipo: 'entero' },
      { id: 'act', etiqueta: 'Alumnos activos', valor: T.activos, tipo: 'entero' },
      { id: 'proy', etiqueta: 'Proyección (ESTIMACIÓN)', valor: hayPar && T.conProy ? T.proy : 'Sin datos suficientes', tipo: 'entero', tono: 'info' },
    ],
    tablas: [tRet, tProy, tAl],
    notas: [
      'Cómo se calcula: cada servicio extracurricular pertenece al ciclo en que se contrató. Base = alumnos de la disciplina en el ciclo anterior que seguían activos al cerrarlo; Continúan = los de la base que tienen la disciplina en este ciclo; Retención = Continúan / Base. Altas = inscritos del ciclo que no estaban en la base (nuevos y reingresos); Bajas = servicios dados de baja en el ciclo; Neto = altas − bajas.',
      `PROYECCIÓN = ESTIMACIÓN, no un dato: activos del ciclo × tasa de retención histórica de la disciplina (Σ continuaron / Σ base de todos los pares de ciclos consecutivos con datos hasta ${N.nombre}). La base de cálculo (pares de ciclos, base acumulada y tasa) está en la tabla de estimación. No se inventa nada si no hay histórico.`,
      ciclosConDatos < 2 ? `Hay datos de ${ciclosConDatos} ciclo(s) con servicios extracurriculares: se necesitan al menos 2 ciclos consecutivos para medir retención y estimar la continuidad. Los servicios de ciclos anteriores sin ciclo registrado se completan con el script de backfill (apps/api/scripts/backfill-informes.ts).` : 'Hay datos de varios ciclos: la estimación usa todos los pares consecutivos disponibles.',
      'Los servicios recurrentes no se trasladan solos al ciclo siguiente: un alumno que continúa se vuelve a inscribir (nuevo servicio en el ciclo nuevo); si no se registra, figura como «No continuó».',
    ],
  };
}
