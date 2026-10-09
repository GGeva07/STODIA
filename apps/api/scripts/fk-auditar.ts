/**
 * AUDITORIA DE INTEGRIDAD REFERENCIAL (SOLO LECTURA). Funciona igual en SQLite y SQL Server (el motor sale de DATABASE_URL).
 *
 *   pnpm --filter @stodia/api db:fk:auditar [--json]
 *
 * Lista, por relacion:
 *   A. Huerfanos de TODAS las FK declaradas en prisma/schema.prisma (las lee del modelo, asi que cubre las que se agreguen despues),
 *      valores vacios ('') usados como "sin valor" y NULL en columnas obligatorias (instancia sin migrar).
 *   B. Duplicados que impedirian una restriccion UNIQUE (cedula normalizada, NCF, cuenta de acceso, carnet, contrato...).
 *   C. Normalizacion pendiente (cedulas con guiones, centinelas).
 *   D. Referencias LOGICAS a la tabla Catalogo (hasta la Fase 2 son texto/id sin FK): seccion del alumno, alergias, metodos de pago,
 *      becas, materias, aulas, cajas, ciclos... y las claves heredadas que no existen.
 * Codigo de salida: 0 = sin hallazgos bloqueantes (FK/duplicados); 1 = hay huerfanos o duplicados; 2 = error.
 * Para corregir: scripts/fk-reparar.ts (muestra el plan; con --aplicar lo ejecuta). Nunca modifica ni borra datos.
 */
import { catalogo, columnas, cuenta, digitos, esSqlServer, filas, num, prisma, q, relaciones, sinAcento, tabla, tablaExiste, tbl, tieneCol } from './fk-comun';

export interface Hallazgo { seccion: string; ref: string; total: number; problemas: number; detalle: string }
const top = (n: number) => (esSqlServer ? `TOP ${n} ` : '');
const limit = (n: number) => (esSqlServer ? '' : ` LIMIT ${n}`);

/** A. FK declaradas en el schema. */
export async function auditarFk(): Promise<Hallazgo[]> {
  const out: Hallazgo[] = [];
  for (const r of relaciones) {
    const ref = `${r.hijo}.${r.col} -> ${r.padre}.${r.padreCol}`;
    if (!(await tieneCol(r.hijo, r.col)) || !(await tablaExiste(r.padre))) { out.push({ seccion: 'A-FK', ref, total: 0, problemas: 1, detalle: 'falta la columna/tabla (instancia sin migrar: ejecuta fk-reparar y prisma db push)' }); continue; }
    const H = tbl(r.hijo), P = tbl(r.padre), c = q(r.col);
    const total = await cuenta(`SELECT COUNT(*) AS n FROM ${H}`);
    const huerf = await cuenta(`SELECT COUNT(*) AS n FROM ${H} c WHERE c.${c} IS NOT NULL AND c.${c} <> '' AND NOT EXISTS (SELECT 1 FROM ${P} p WHERE p.${q(r.padreCol)} = c.${c})`);
    const vacios = await cuenta(`SELECT COUNT(*) AS n FROM ${H} WHERE ${c} = ''`);
    const nulos = r.opcional ? 0 : await cuenta(`SELECT COUNT(*) AS n FROM ${H} WHERE ${c} IS NULL`);
    const ej = huerf ? (await filas<{ v: string }>(`SELECT DISTINCT ${top(5)}c.${c} AS v FROM ${H} c WHERE c.${c} IS NOT NULL AND c.${c} <> '' AND NOT EXISTS (SELECT 1 FROM ${P} p WHERE p.${q(r.padreCol)} = c.${c})${limit(5)}`)).map(x => x.v).join(', ') : '';
    out.push({ seccion: 'A-FK', ref, total, problemas: huerf + vacios + nulos, detalle: [huerf && `${huerf} huerfano(s) [${ej}]`, vacios && `${vacios} vacio(s) '' (debe ser NULL)`, nulos && `${nulos} NULL en columna obligatoria`].filter(Boolean).join(' · ') });
  }
  return out;
}

/** B. Duplicados que impedirian un UNIQUE. */
export async function auditarDuplicados(): Promise<Hallazgo[]> {
  const out: Hallazgo[] = [];
  const ced = `REPLACE(REPLACE(${q('cedula')}, '-', ''), ' ', '')`;
  const claves: { ref: string; tabla: string; exprs: string[]; donde?: string }[] = [
    { ref: 'Tutor.cedula (solo digitos)', tabla: 'Tutor', exprs: [ced] },
    { ref: 'Tutor.userId (no nulo)', tabla: 'Tutor', exprs: [q('userId')], donde: `${q('userId')} IS NOT NULL` },
    { ref: 'Alumno.code', tabla: 'Alumno', exprs: [q('code')] },
    { ref: 'AcadRoster.alumnoId (no nulo)', tabla: 'AcadRoster', exprs: [q('alumnoId')], donde: `${q('alumnoId')} IS NOT NULL` },
    { ref: 'ComCarnet.alumnoId', tabla: 'ComCarnet', exprs: [q('alumnoId')], donde: `${q('alumnoId')} IS NOT NULL` },
    { ref: 'FinRecibo.ncf', tabla: 'FinRecibo', exprs: [q('ncf')] },
    { ref: 'PersInscripcion.ncf', tabla: 'PersInscripcion', exprs: [q('ncf')] },
    { ref: 'FinProducto.code', tabla: 'FinProducto', exprs: [q('code')] },
    { ref: 'Contrato (alumnoId, ciclo)', tabla: 'Contrato', exprs: [q('alumnoId'), q('ciclo')] },
  ];
  for (const k of claves) {
    if (!(await tablaExiste(k.tabla))) continue;
    try {
      const sel = k.exprs.map((e, i) => `${e} AS ${q('c' + i)}`).join(', '), grp = k.exprs.join(', ');
      const d = await filas<Record<string, unknown>>(`SELECT ${sel}, COUNT(*) AS n FROM ${tbl(k.tabla)}${k.donde ? ' WHERE ' + k.donde : ''} GROUP BY ${grp} HAVING COUNT(*) > 1`);
      out.push({ seccion: 'B-Duplicados', ref: k.ref, total: await cuenta(`SELECT COUNT(*) AS n FROM ${tbl(k.tabla)}`), problemas: d.length, detalle: d.slice(0, 5).map(x => `${k.exprs.map((_, i) => x['c' + i]).join('|')} x${num(x.n)}`).join(', ') });
    } catch (e) { out.push({ seccion: 'B-Duplicados', ref: k.ref, total: 0, problemas: 1, detalle: 'no evaluable: ' + (e as Error).message.slice(0, 80) }); }
  }
  return out;
}

/** C. Normalizacion pendiente. */
export async function auditarNormalizacion(): Promise<Hallazgo[]> {
  const out: Hallazgo[] = [];
  if (await tablaExiste('Tutor')) {
    const cols = (await columnas('Tutor')).map(c => c.name);
    const total = await cuenta(`SELECT COUNT(*) AS n FROM ${tbl('Tutor')}`);
    const guiones = await cuenta(`SELECT COUNT(*) AS n FROM ${tbl('Tutor')} WHERE ${q('cedula')} LIKE '%-%' OR ${q('cedula')} LIKE '% %'`);
    out.push({ seccion: 'C-Normaliza', ref: 'Tutor.cedula con guiones/espacios (debe guardarse solo digitos)', total, problemas: guiones, detalle: '' });
    const largos = (await filas<{ c: string }>(`SELECT ${q('cedula')} AS c FROM ${tbl('Tutor')}`)).filter(r => digitos(r.c).length !== 11).length;
    out.push({ seccion: 'C-Normaliza', ref: 'Tutor.cedula que no tiene 11 digitos', total, problemas: largos, detalle: '' });
    if (cols.includes('usuario')) out.push({ seccion: 'C-Normaliza', ref: 'Tutor.usuario (columna heredada, ahora Tutor.userId)', total, problemas: await cuenta(`SELECT COUNT(*) AS n FROM ${tbl('Tutor')} WHERE ${q('usuario')} IS NOT NULL`), detalle: 'pendiente de backfill a userId' });
  }
  for (const [t, c, nota] of [['FinCobroItem', 'kid', 'alumnoId (Alumno.id real)'], ['FinCobroItem', 'tutorCed', 'tutorId'], ['FinRecibo', 'metodo', 'derivado de pays'], ['PersServicio', 'recibo', 'reciboId'], ['PersInscripcion', 'plan', 'planId'], ['MobPagoIntencion', 'tutor', 'tutorId'], ['FinMovimiento', 'name', 'productoId (name queda como instantanea)']] as const) {
    if (await tieneCol(t, c)) out.push({ seccion: 'C-Normaliza', ref: `${t}.${c} (columna heredada)`, total: await cuenta(`SELECT COUNT(*) AS n FROM ${tbl(t)}`), problemas: t === 'FinMovimiento' || t === 'FinRecibo' ? 0 : 1, detalle: `reemplazada por ${nota}` });
  }
  return out;
}

/** D. Referencias logicas a Catalogo / JSON (hasta la Fase 2). */
export async function auditarLogicas(): Promise<Hallazgo[]> {
  const out: Hallazgo[] = [];
  const add = (ref: string, total: number, malos: string[]) => out.push({ seccion: 'D-Logica', ref, total, problemas: malos.length, detalle: [...new Set(malos)].slice(0, 5).join(', ') });
  const [grados, tandas, secciones, materias, aulas, docentes, cajas, becas, conceptos, metodos, alergias, comidas, dietas, rutas] = await Promise.all(
    ['grados', 'tandas', 'secciones', 'materias', 'aulas', 'docentes', 'cajas', 'becas', 'conceptosBeca', 'metodosPago', 'alergias', 'comidas', 'dietas', 'rutas'].map(catalogo));
  if (!grados.length) return out;
  const ids = (l: { cid: string }[]) => new Set(l.map(x => x.cid));
  const nombres = (l: { d: Record<string, unknown> }[], k = 'nombre') => new Set(l.map(x => String(x.d[k])));
  const secKeys = new Set(secciones.map(s => `${grados.find(g => g.cid === s.d.grado)?.d.grado}|${s.d.seccion}|${tandas.find(t => t.cid === s.d.tanda)?.d.nombre}`));

  // Alumno -> seccion (grado|sec|tanda) y alergias
  const als = await filas<{ id: string; grado: string; sec: string; tanda: string; alg: string }>(`SELECT id, grado, sec, tanda, alg FROM ${tbl('Alumno')}`);
  add('Alumno (grado|sec|tanda) -> secciones del catalogo', als.length, als.filter(a => !secKeys.has(`${a.grado}|${a.sec}|${a.tanda}`)).map(a => `${a.id}:${a.grado}|${a.sec}|${a.tanda}`));
  add('Alumno.grado (texto) -> grados.grado', als.length, als.filter(a => !grados.some(g => g.d.grado === a.grado)).map(a => a.grado));
  add('Alumno.tanda (texto) -> tandas.nombre', als.length, als.filter(a => !tandas.some(t => t.d.nombre === a.tanda)).map(a => a.tanda));
  const nomAlerg = nombres(alergias);
  const algs = als.flatMap(a => a.alg.split(',').map(s => s.trim()).filter(Boolean));
  add('Alumno.alg (CSV) -> alergias.nombre (exacto)', algs.length, algs.filter(x => !nomAlerg.has(x)));
  if (await tablaExiste('ComCarnet')) {
    const cc = (await filas<{ allergies: string }>(`SELECT allergies FROM ${tbl('ComCarnet')}`)).flatMap(r => JSON.parse(r.allergies) as string[]);
    add('ComCarnet.allergies[] -> alergias.nombre (exacto)', cc.length, cc.filter(x => !nomAlerg.has(x)));
  }
  const menu = (await filas<{ algs: string }>(`SELECT algs FROM ${tbl('AliMenu')}`)).flatMap(r => JSON.parse(r.algs) as string[]);
  add('AliMenu.algs[] -> alergias.nombre', menu.length, menu.filter(x => !nomAlerg.has(x)));

  // Finanzas
  const recs = await filas<{ pays: string; items: string; cajaId?: string | null }>(`SELECT pays, items${(await tieneCol('FinRecibo', 'cajaId')) ? ', cajaId' : ''} FROM ${tbl('FinRecibo')}`);
  const nomMetodo = nombres(metodos);
  const pays = recs.flatMap(r => JSON.parse(r.pays) as { m: string }[]);
  add('FinRecibo.pays[].m -> metodosPago.nombre (exacto)', pays.length, pays.map(p => p.m).filter(m => !nomMetodo.has(m)));
  const lineas = recs.flatMap(r => JSON.parse(r.items) as { cobroItemId?: string }[]);
  out.push({ seccion: 'D-Logica', ref: 'FinRecibo.items[] sin cobroItemId (lineas historicas sin cargo en cartera: informativo)', total: lineas.length, problemas: lineas.filter(l => !l.cobroItemId).length, detalle: 'informativo, no bloquea' });
  if (recs.some(r => r.cajaId)) add('FinRecibo.cajaId -> cajas.id', recs.length, recs.filter(r => r.cajaId && !ids(cajas).has(r.cajaId)).map(r => r.cajaId!));
  if (await tablaExiste('FinBeca')) {
    const bs = await filas<{ tipo: string; conceptos: string }>(`SELECT tipo, conceptos FROM ${tbl('FinBeca')}`);
    add('FinBeca.tipo -> becas.nombre', bs.length, bs.filter(b => !nombres(becas).has(b.tipo)).map(b => b.tipo));
    const cs = bs.flatMap(b => b.conceptos.split('·').map(s => s.trim()).filter(Boolean));
    add('FinBeca.conceptos (" · ") -> conceptosBeca.nombre', cs.length, cs.filter(c => !nombres(conceptos).has(c)));
  }
  if (await tablaExiste('Contrato')) {
    const ct = await filas<{ beca: string | null; ciclo: string }>(`SELECT beca, ciclo FROM ${tbl('Contrato')}`);
    add('Contrato.beca -> becas.id (NULL = sin beca)', ct.length, ct.filter(c => c.beca && !ids(becas).has(c.beca)).map(c => c.beca!));
    const cfg = await filas<{ valor: string }>(`SELECT valor FROM ${tbl('SisConfig')} WHERE clave = 'ciclos'`);
    const ciclos = new Set((cfg[0] ? (JSON.parse(cfg[0].valor) as { n: string }[]) : []).map(c => c.n));
    if (ciclos.size) add('Contrato.ciclo -> SisConfig ciclos', ct.length, ct.filter(c => !ciclos.has(c.ciclo)).map(c => c.ciclo));
  }
  const mov = await tieneCol('PersServicio', 'catKey') ? await filas<{ catKey: string }>(`SELECT ${q('catKey')} FROM ${tbl('PersServicio')}`) : [];
  const catKeys = new Set([...rutas.map(r => `rt:${r.cid}`), ...(await filas<{ id: string }>(`SELECT id FROM ${tbl('AliPlan')}`)).map(a => `ali:${a.id}`), ...(await filas<{ id: string }>(`SELECT id FROM ${tbl('AcadExtra')}`)).map(a => `ext:${a.id}`), ...(await filas<{ id: string }>(`SELECT id FROM ${tbl('FinProducto')}`)).map(a => `prd:${a.id}`)]);
  add('PersServicio.catKey (rt:/ali:/ext:/prd:) -> servicio vigente [Fase 2: ServicioAlumno]', mov.length, mov.map(m => m.catKey).filter(k => !catKeys.has(k)));

  // Academico
  const rost = await filas<{ seccion: string }>(`SELECT seccion FROM ${tbl('AcadRoster')}`);
  add('AcadRoster.seccion -> secciones.id', rost.length, rost.map(r => r.seccion).filter(s => !ids(secciones).has(s)));
  const nt = await filas<{ materia: string }>(`SELECT materia FROM ${tbl('AcadNota')}`);
  add('AcadNota.materia -> materias.id', nt.length, nt.map(r => r.materia).filter(m => !ids(materias).has(m)));
  const asg = await filas<{ docenteId: string; seccionId: string; materiaId: string; aulas: string }>(`SELECT ${q('docenteId')}, ${q('seccionId')}, ${q('materiaId')}, aulas FROM ${tbl('AcadAsignacion')}`);
  add('AcadAsignacion (docente, seccion, materia, aulas[]) -> catalogos', asg.length, asg.flatMap(a => [!ids(docentes).has(a.docenteId) && `docente ${a.docenteId}`, !ids(secciones).has(a.seccionId) && `seccion ${a.seccionId}`, !ids(materias).has(a.materiaId) && `materia ${a.materiaId}`, ...(JSON.parse(a.aulas) as string[]).filter(x => !ids(aulas).has(x)).map(x => `aula ${x}`)]).filter(Boolean) as string[]);
  const hor = await filas<{ seccion: string; slot: string; materia: string }>(`SELECT seccion, slot, materia FROM ${tbl('AcadHorario')}`);
  add('AcadHorario (seccion, materia/aula) -> catalogos', hor.length, hor.flatMap(h => [!ids(secciones).has(h.seccion) && `seccion ${h.seccion}`, h.slot.startsWith('_aula:') ? !ids(aulas).has(h.materia) && `aula ${h.materia}` : !ids(materias).has(h.materia) && `materia ${h.materia}`]).filter(Boolean) as string[]);
  const mn = await filas<{ materia: string }>(`SELECT materia FROM ${tbl('MobNota')}`);
  add('MobNota.materia (nombre) -> materias.nombre', mn.length, mn.map(r => r.materia).filter(m => !nombres(materias).has(m)));

  // Catalogo -> Catalogo
  add('secciones.grado/tanda/aula -> grados/tandas/aulas', secciones.length * 3, secciones.flatMap(s => [!ids(grados).has(String(s.d.grado)) && `grado ${s.d.grado}`, !ids(tandas).has(String(s.d.tanda)) && `tanda ${s.d.tanda}`, s.d.aula && !ids(aulas).has(String(s.d.aula)) && `aula ${s.d.aula}`]).filter(Boolean) as string[]);
  add('docentes.materias[]/secciones[] -> materias/secciones', docentes.length, docentes.flatMap(d => [...((d.d.materias ?? []) as string[]).filter(m => !ids(materias).has(m)).map(m => `materia ${m}`), ...((d.d.secciones ?? []) as string[]).filter(s => !ids(secciones).has(s)).map(s => `seccion ${s}`)]));
  add('staff.caja -> cajas.id', 0, (await catalogo('staff')).filter(s => s.d.caja && !ids(cajas).has(String(s.d.caja))).map(s => `${s.cid}:${s.d.caja}`));

  // Comedor: banderas posicionales de los planes
  const pl = await filas<{ id: string; meals: string; diets: string }>(`SELECT id, meals, diets FROM ${tbl('AliPlan')}`);
  add('AliPlan.meals/diets (posicionales) con el largo del catalogo comidas/dietas', pl.length, pl.flatMap(p => [(JSON.parse(p.meals) as unknown[]).length !== comidas.filter(c => c.estado === 'Activo').length && `${p.id}.meals`, (JSON.parse(p.diets) as unknown[]).length !== dietas.filter(c => c.estado === 'Activo').length && `${p.id}.diets`]).filter(Boolean) as string[]);
  void sinAcento;
  return out;
}

export async function auditarTodo() {
  const A = await auditarFk(), B = await auditarDuplicados(), C = await auditarNormalizacion(), D = await auditarLogicas();
  return { A, B, C, D, bloqueantes: [...A, ...B, ...C.filter(c => c.problemas && !c.detalle.startsWith('reemplazada'))].filter(h => h.problemas > 0).length };
}

async function main() {
  const json = process.argv.includes('--json');
  const r = await auditarTodo();
  if (json) { console.log(JSON.stringify(r, null, 1)); } else {
    console.log(`Motor: ${esSqlServer ? 'SQL Server' : 'SQLite'}  ·  FK declaradas en el schema: ${relaciones.length}`);
    const fmt = (l: Hallazgo[]) => l.map(h => ({ ref: h.ref, filas: h.total, problemas: h.problemas, detalle: h.detalle }));
    tabla('A. Huerfanos por FK (problemas debe ser 0)', fmt(r.A));
    tabla('B. Duplicados que impedirian un UNIQUE', fmt(r.B.filter(h => h.problemas)));
    tabla('C. Normalizacion pendiente', fmt(r.C.filter(h => h.problemas)));
    tabla('D. Referencias logicas a catalogos/JSON (Fase 2 las convertira en FK)', fmt(r.D.filter(h => h.problemas)));
    const tot = (l: Hallazgo[]) => l.reduce((a, h) => a + h.problemas, 0);
    console.log(`\nResumen: FK con problemas=${r.A.filter(h => h.problemas).length}/${r.A.length} (${tot(r.A)} filas) · duplicados=${tot(r.B)} · normalizacion=${tot(r.C)} · referencias logicas con hallazgos=${r.D.filter(h => h.problemas).length}/${r.D.length} (${tot(r.D)} valores)`);
    console.log(r.bloqueantes ? `RESULTADO: ${r.bloqueantes} hallazgo(s) bloqueante(s): corrige con scripts/fk-reparar.ts` : 'RESULTADO: sin huerfanos ni duplicados en las FK.');
  }
  process.exitCode = r.bloqueantes ? 1 : 0;
}

if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 2; }).finally(() => prisma.$disconnect());
