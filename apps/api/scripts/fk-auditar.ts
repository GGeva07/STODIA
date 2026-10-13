/**
 * AUDITORIA DE INTEGRIDAD REFERENCIAL (SOLO LECTURA). Funciona igual en SQLite y SQL Server (el motor sale de DATABASE_URL).
 *
 *   pnpm --filter @stodia/api db:fk:auditar [--json]
 *
 * Lista, por relacion:
 *   A. Huerfanos de TODAS las FK declaradas en prisma/schema.prisma (las lee del modelo, asi que cubre las que se agreguen despues),
 *      valores vacios ('') usados como "sin valor" y NULL en columnas obligatorias (instancia sin migrar).
 *   B. Duplicados que impedirian una restriccion UNIQUE (cedula normalizada, NCF, cuenta de acceso, carnet, contrato por ciclo...).
 *   C. Normalizacion pendiente: columnas heredadas que una base sin migrar todavia tiene (Fases 1, 2A, 2B y 2C).
 *   D. Coherencia de lo que las FK no expresan (Fase 2C): Alumno.seccionId = Matricula del ciclo activo, tutores vigentes = columnas del alumno, lineas y pagos del
 *      recibo = su monto, un solo ciclo activo, cicloId de los cargos segun su vencimiento, monedero, CHECK de ServicioAlumno...
 * Codigo de salida: 0 = sin hallazgos bloqueantes (FK/duplicados/coherencia); 1 = hay huerfanos o duplicados; 2 = error.
 * Para corregir: scripts/fk-reparar.ts (muestra el plan; con --aplicar lo ejecuta). Nunca modifica ni borra datos.
 */
import { columnas, cuenta, digitos, esSqlServer, filas, num, prisma, q, relaciones, tabla, tablaExiste, tbl, tieneCol } from './fk-comun';

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
  const nn = (c: string) => `${q(c)} IS NOT NULL`;
  const claves: { ref: string; tabla: string; exprs: string[]; donde?: string }[] = [
    { ref: 'Tutor.cedula (solo digitos)', tabla: 'Tutor', exprs: [ced] },
    { ref: 'Tutor.userId (no nulo)', tabla: 'Tutor', exprs: [q('userId')], donde: nn('userId') },
    { ref: 'Alumno.code', tabla: 'Alumno', exprs: [q('code')] },
    { ref: 'AcadRoster.alumnoId (no nulo)', tabla: 'AcadRoster', exprs: [q('alumnoId')], donde: nn('alumnoId') },
    { ref: 'ComCarnet.alumnoId', tabla: 'ComCarnet', exprs: [q('alumnoId')], donde: nn('alumnoId') },
    { ref: 'FinRecibo.ncf', tabla: 'FinRecibo', exprs: [q('ncf')] },
    { ref: 'PersInscripcion.ncf', tabla: 'PersInscripcion', exprs: [q('ncf')] },
    { ref: 'PersInscripcion (alumnoId, cicloId)', tabla: 'PersInscripcion', exprs: [q('alumnoId'), q('cicloId')] },
    { ref: 'FinProducto.code', tabla: 'FinProducto', exprs: [q('code')] },
    { ref: 'Contrato (alumnoId, cicloId)', tabla: 'Contrato', exprs: [q('alumnoId'), q('cicloId')] },
    { ref: 'Matricula (alumnoId, cicloId)', tabla: 'Matricula', exprs: [q('alumnoId'), q('cicloId')] },
    { ref: 'Ciclo.nombre', tabla: 'Ciclo', exprs: [q('nombre')] },
    { ref: 'Ciclo ACTIVO (debe haber uno solo)', tabla: 'Ciclo', exprs: [q('estado')], donde: `${q('estado')} = 'Activo'` },
    { ref: 'PeriodoAcademico (cicloId, orden)', tabla: 'PeriodoAcademico', exprs: [q('cicloId'), q('orden')] },
    { ref: 'TutorAlumno Financiero VIGENTE por alumno', tabla: 'TutorAlumno', exprs: [q('alumnoId')], donde: `${q('rol')} = 'Financiero' AND ${q('hasta')} IS NULL` },
    { ref: 'TutorAlumno Legal VIGENTE por alumno', tabla: 'TutorAlumno', exprs: [q('alumnoId')], donde: `${q('rol')} = 'Legal' AND ${q('hasta')} IS NULL` },
    { ref: 'TutorAlumno (alumnoId, tutorId, rol, desde)', tabla: 'TutorAlumno', exprs: [q('alumnoId'), q('tutorId'), q('rol'), q('desde')] },
    { ref: 'FinReciboItem (reciboId, orden)', tabla: 'FinReciboItem', exprs: [q('reciboId'), q('orden')] },
    { ref: 'FinReciboPago (reciboId, orden)', tabla: 'FinReciboPago', exprs: [q('reciboId'), q('orden')] },
    { ref: 'PersDocumento (alumnoId, tipoId)', tabla: 'PersDocumento', exprs: [q('alumnoId'), q('tipoId')] },
    { ref: 'TipoDocumento.nombre', tabla: 'TipoDocumento', exprs: [q('nombre')] },
    { ref: 'AcadNota (rosterId, materiaId, periodoId)', tabla: 'AcadNota', exprs: [q('rosterId'), q('materiaId'), q('periodoId')] },
    { ref: 'AcadHorario (cicloId, seccionId, slot)', tabla: 'AcadHorario', exprs: [q('cicloId'), q('seccionId'), q('slot')] },
    { ref: 'Seccion (gradoId, letra, tandaId)', tabla: 'Seccion', exprs: [q('gradoId'), q('letra'), q('tandaId')] },
    { ref: 'Grado (nivelId, nombre)', tabla: 'Grado', exprs: [q('nivelId'), q('nombre')] },
    { ref: 'Grado.orden', tabla: 'Grado', exprs: [q('orden')] },
    { ref: 'Tanda.nombre', tabla: 'Tanda', exprs: [q('nombre')] },
    { ref: 'Aula.nombre', tabla: 'Aula', exprs: [q('nombre')] },
    { ref: 'Materia.codigo', tabla: 'Materia', exprs: [q('codigo')] },
    { ref: 'Rubrica.nombre', tabla: 'Rubrica', exprs: [q('nombre')] },
    { ref: 'Docente.cedula', tabla: 'Docente', exprs: [q('cedula')] },
    { ref: 'Docente.userId (no nulo)', tabla: 'Docente', exprs: [q('userId')], donde: nn('userId') },
    { ref: 'Empleado.userId (no nulo)', tabla: 'Empleado', exprs: [q('userId')], donde: nn('userId') },
    { ref: 'AcadAsignacion (cicloId, seccionId, materiaId)', tabla: 'AcadAsignacion', exprs: [q('cicloId'), q('seccionId'), q('materiaId')] },
    { ref: 'Caja.codigo', tabla: 'Caja', exprs: [q('codigo')] },
    { ref: 'RutaTransporte.nombre', tabla: 'RutaTransporte', exprs: [q('nombre')] },
    { ref: 'RutaTransporte.ficha', tabla: 'RutaTransporte', exprs: [q('ficha')] },
    { ref: 'TipoBeca.nombre', tabla: 'TipoBeca', exprs: [q('nombre')] },
    { ref: 'ConceptoBeca.nombre', tabla: 'ConceptoBeca', exprs: [q('nombre')] },
    { ref: 'MetodoPago.nombre', tabla: 'MetodoPago', exprs: [q('nombre')] },
    { ref: 'Comida.nombre', tabla: 'Comida', exprs: [q('nombre')] },
    { ref: 'Dieta.nombre', tabla: 'Dieta', exprs: [q('nombre')] },
    { ref: 'Alergia.nombre', tabla: 'Alergia', exprs: [q('nombre')] },
    { ref: 'CategoriaProducto.nombre', tabla: 'CategoriaProducto', exprs: [q('nombre')] },
  ];
  for (const k of claves) {
    if (!(await tablaExiste(k.tabla))) continue;
    try {
      const sel = k.exprs.map((e, i) => `${e} AS ${q('c' + i)}`).join(', '), grp = k.exprs.join(', ');
      const d = await filas<Record<string, unknown>>(`SELECT ${sel}, COUNT(*) AS n FROM ${tbl(k.tabla)}${k.donde ? ' WHERE ' + k.donde : ''} GROUP BY ${grp} HAVING COUNT(*) > 1`);
      out.push({ seccion: 'B-Duplicados', ref: k.ref, total: await cuenta(`SELECT COUNT(*) AS n FROM ${tbl(k.tabla)}`), problemas: d.length, detalle: d.slice(0, 5).map(x => `${k.exprs.map((_, i) => x['c' + i]).join('|')} x${num(x.n)}`).join(', ') });
    } catch (e) { out.push({ seccion: 'B-Duplicados', ref: k.ref, total: 0, problemas: 1, detalle: 'no evaluable (base sin migrar): ' + (e as Error).message.slice(0, 80) }); }
  }
  return out;
}

/** C. Normalizacion pendiente: columnas / tablas heredadas que una base sin migrar todavia conserva. */
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
  const heredadas: [string, string, string][] = [
    ['FinCobroItem', 'kid', 'alumnoId'], ['FinCobroItem', 'tutorCed', 'tutorId'], ['FinRecibo', 'metodo', 'derivado de FinReciboPago'], ['FinRecibo', 'items', 'FinReciboItem'], ['FinRecibo', 'pays', 'FinReciboPago'],
    ['PersServicio', 'catKey', 'ServicioAlumno (FK de catalogo)'], ['PersInscripcion', 'plan', 'planId'], ['MobPagoIntencion', 'tutor', 'tutorId'], ['MobPagoIntencion', 'detalle', 'MobPagoIntencionCargo'],
    ['MobPagoIntencion', 'resueltoPor', 'resueltoPorId'], ['FinMovimiento', 'name', 'productoId (name queda como instantanea)'], ['Alumno', 'alg', 'AlumnoAlergia'], ['ComCarnet', 'allergies', 'AlumnoAlergia'],
    ['ComCarnet', 'wallet', 'Monedero.saldo'], ['ComCarnet', 'limit', 'Monedero.limite'], ['ComCarnet', 'spent', 'MonederoMovimiento (consumo del dia)'], ['AliPlan', 'meals', 'AliPlanComida'], ['AliPlan', 'diets', 'AliPlanDieta'],
    ['AliMenu', 'algs', 'AliMenuAlergia'], ['FinBeca', 'tipo', 'FinBeca.tipoBecaId'], ['FinBeca', 'conceptos', 'FinBecaConcepto'], ['FinBeca', 'periodo', 'FinBeca.cicloId'], ['Contrato', 'ciclo', 'Contrato.cicloId'],
    ['AcadNota', 'periodo', 'AcadNota.periodoId'], ['PersDocumento', 'n', 'PersDocumento.tipoId (TipoDocumento)'], ['FinProducto', 'cat', 'FinProducto.categoriaId'], ['Alumno', 'grado', 'Alumno.seccionId'],
  ];
  for (const [t, c, nota] of heredadas) {
    if (await tieneCol(t, c)) out.push({ seccion: 'C-Normaliza', ref: `${t}.${c} (columna heredada)`, total: await cuenta(`SELECT COUNT(*) AS n FROM ${tbl(t)}`), problemas: t === 'FinMovimiento' ? 0 : 1, detalle: `reemplazada por ${nota}` });
  }
  for (const t of ['Catalogo', 'PersServicio', 'MobWallet']) if (await tablaExiste(t)) out.push({ seccion: 'C-Normaliza', ref: `Tabla heredada ${t} (ya no existe en el schema)`, total: await cuenta(`SELECT COUNT(*) AS n FROM ${tbl(t)}`), problemas: 1, detalle: 'se elimina con prisma db push --accept-data-loss tras fk-reparar' });
  return out;
}

/** D. Coherencia de lo que las FK no expresan (esquema de la Fase 2C). Todo debe dar 0. */
export async function auditarCoherencia(): Promise<Hallazgo[]> {
  const out: Hallazgo[] = [];
  if (!(await tablaExiste('Ciclo')) || !(await tablaExiste('Matricula'))) return out;
  const add = async (ref: string, totalSql: string, malosSql: string, informativo = false) => {
    try {
      const m = /^([\s\S]*?) AS k FROM ([\s\S]*)$/.exec(malosSql)!;
      const malos = await filas<{ k: string }>(`SELECT ${top(6)}${m[1]} AS k FROM ${m[2]}${limit(6)}`);
      const n = await cuenta(`SELECT COUNT(*) AS n FROM ${m[2]}`);
      out.push({ seccion: 'D-Coherencia', ref, total: await cuenta(totalSql), problemas: informativo ? 0 : n, detalle: malos.map(x => x.k).join(', ') + (informativo && n ? ` (informativo: ${n})` : '') });
    } catch (e) { out.push({ seccion: 'D-Coherencia', ref, total: 0, problemas: 1, detalle: 'no evaluable: ' + (e as Error).message.slice(0, 90) }); }
  };
  const A = tbl('Alumno'), M = tbl('Matricula'), C = tbl('Ciclo'), T = tbl('TutorAlumno');
  await add('Alumno (ni Egresado ni Retirado de un ciclo anterior) sin Matricula del ciclo ACTIVO', `SELECT COUNT(*) AS n FROM ${A}`, `a.id AS k FROM ${A} a WHERE a.estado NOT IN ('Egresado', 'Retirado', 'Preinscrito') AND NOT EXISTS (SELECT 1 FROM ${M} m JOIN ${C} c ON c.id = m.${q('cicloId')} AND c.estado = 'Activo' WHERE m.${q('alumnoId')} = a.id)`);
  await add('Alumno.seccionId distinta de la seccion de su Matricula del ciclo activo', `SELECT COUNT(*) AS n FROM ${A}`, `a.id AS k FROM ${A} a JOIN ${M} m ON m.${q('alumnoId')} = a.id JOIN ${C} c ON c.id = m.${q('cicloId')} AND c.estado = 'Activo' WHERE m.${q('seccionId')} <> a.${q('seccionId')}`);
  await add('Alumno Retirado con matricula activa distinta de Retirado (o al reves)', `SELECT COUNT(*) AS n FROM ${A}`, `a.id AS k FROM ${A} a JOIN ${M} m ON m.${q('alumnoId')} = a.id JOIN ${C} c ON c.id = m.${q('cicloId')} AND c.estado = 'Activo' WHERE (a.estado = 'Retirado' AND m.estado <> 'Retirado') OR (a.estado <> 'Retirado' AND m.estado = 'Retirado')`);
  await add('Matricula en un ciclo CERRADO con estado Activo (debe ser Promovido/Repitente/Graduado/Retirado)', `SELECT COUNT(*) AS n FROM ${M}`, `m.id AS k FROM ${M} m JOIN ${C} c ON c.id = m.${q('cicloId')} WHERE c.estado = 'Cerrado' AND m.estado = 'Activo'`);
  await add('Alumno.tutorId sin vinculo Financiero vigente en TutorAlumno (o distinto)', `SELECT COUNT(*) AS n FROM ${A}`, `a.id AS k FROM ${A} a WHERE NOT EXISTS (SELECT 1 FROM ${T} t WHERE t.${q('alumnoId')} = a.id AND t.${q('rol')} = 'Financiero' AND t.${q('hasta')} IS NULL AND t.${q('tutorId')} = a.${q('tutorId')})`);
  await add('Alumno.tutorLegalId sin vinculo Legal vigente en TutorAlumno (o distinto)', `SELECT COUNT(*) AS n FROM ${A}`, `a.id AS k FROM ${A} a WHERE a.${q('tutorLegalId')} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${T} t WHERE t.${q('alumnoId')} = a.id AND t.${q('rol')} = 'Legal' AND t.${q('hasta')} IS NULL AND t.${q('tutorId')} = a.${q('tutorLegalId')})`);
  await add('Vinculo Legal vigente cuando el alumno ya no tiene tutorLegalId', `SELECT COUNT(*) AS n FROM ${T}`, `t.${q('alumnoId')} AS k FROM ${T} t JOIN ${A} a ON a.id = t.${q('alumnoId')} WHERE t.${q('rol')} = 'Legal' AND t.${q('hasta')} IS NULL AND (a.${q('tutorLegalId')} IS NULL OR a.${q('tutorLegalId')} <> t.${q('tutorId')})`);
  await add('FinRecibo cuyas lineas no suman su monto (solo recibos CON lineas)', `SELECT COUNT(*) AS n FROM ${tbl('FinRecibo')}`, `r.id AS k FROM ${tbl('FinRecibo')} r WHERE EXISTS (SELECT 1 FROM ${tbl('FinReciboItem')} i WHERE i.${q('reciboId')} = r.id) AND ABS(r.monto - (SELECT SUM(i.monto) FROM ${tbl('FinReciboItem')} i WHERE i.${q('reciboId')} = r.id)) > 0.01`);
  if (await tieneCol('FinRecibo', 'tipoComprobanteId')) {
    await add('FinRecibo cuyo NCF no empieza por el codigo de su tipo de comprobante', `SELECT COUNT(*) AS n FROM ${tbl('FinRecibo')}`, `r.id AS k FROM ${tbl('FinRecibo')} r WHERE SUBSTR(r.${q('ncf')}, 1, 3) <> r.${q('tipoComprobanteId')}`.replace('SUBSTR(', esSqlServer ? 'SUBSTRING(' : 'SUBSTR('));
    await add('FinRecibo (no historico) cuyo NCF cae fuera del rango de su secuencia fiscal', `SELECT COUNT(*) AS n FROM ${tbl('FinRecibo')} r JOIN ${tbl('SecuenciaFiscal')} s ON s.id = r.${q('secuenciaFiscalId')} WHERE s.${q('historica')} = 0`, `r.id AS k FROM ${tbl('FinRecibo')} r JOIN ${tbl('SecuenciaFiscal')} s ON s.id = r.${q('secuenciaFiscalId')} WHERE s.${q('historica')} = 0 AND (CAST(${esSqlServer ? 'SUBSTRING' : 'SUBSTR'}(r.${q('ncf')}, 4, 20) AS FLOAT) < s.${q('desde')} OR CAST(${esSqlServer ? 'SUBSTRING' : 'SUBSTR'}(r.${q('ncf')}, 4, 20) AS FLOAT) > s.${q('actual')})`);
  }
  if (await tablaExiste('NotaFiscal')) {
    const N = tbl('NotaFiscal');
    await add('NotaFiscal cuyo monto no es la suma de sus lineas', `SELECT COUNT(*) AS n FROM ${N}`, `n.id AS k FROM ${N} n WHERE ABS(n.monto - COALESCE((SELECT SUM(l.monto) FROM ${tbl('NotaFiscalLinea')} l WHERE l.${q('notaId')} = n.id), 0)) > 0.01`);
    await add('NotaFiscal de credito cuyos reembolsos no suman su monto (las migradas de anulaciones historicas sin pagos quedan fuera)', `SELECT COUNT(*) AS n FROM ${N} WHERE clase = 'CREDITO'`, `n.id AS k FROM ${N} n WHERE n.clase = 'CREDITO' AND EXISTS (SELECT 1 FROM ${tbl('NotaFiscalReembolso')} r WHERE r.${q('notaId')} = n.id) AND ABS(n.monto - (SELECT SUM(r.monto) FROM ${tbl('NotaFiscalReembolso')} r WHERE r.${q('notaId')} = n.id)) > 0.01`);
    await add('FinRecibo con notas de credito que suman MAS que su monto', `SELECT COUNT(*) AS n FROM ${tbl('FinRecibo')}`, `r.id AS k FROM ${tbl('FinRecibo')} r WHERE (SELECT COALESCE(SUM(n.monto), 0) FROM ${N} n WHERE n.${q('reciboId')} = r.id AND n.clase = 'CREDITO') > r.monto + 0.01`);
    await add('FinRecibo Anulado sin nota de credito', `SELECT COUNT(*) AS n FROM ${tbl('FinRecibo')} WHERE est = 'Anulado'`, `r.id AS k FROM ${tbl('FinRecibo')} r WHERE r.est = 'Anulado' AND NOT EXISTS (SELECT 1 FROM ${N} n WHERE n.${q('reciboId')} = r.id AND n.clase = 'CREDITO')`);
    await add('NotaFiscal cuyo NCF no empieza por el codigo de su tipo de comprobante', `SELECT COUNT(*) AS n FROM ${N}`, `n.id AS k FROM ${N} n WHERE SUBSTR(n.${q('ncf')}, 1, 3) <> n.${q('tipoComprobanteId')}`.replace('SUBSTR(', esSqlServer ? 'SUBSTRING(' : 'SUBSTR(').replace(', 1, 3)', ', 1, 3)'));
    await add('NotaFiscal (no historica) cuyo NCF cae fuera del rango de su secuencia fiscal', `SELECT COUNT(*) AS n FROM ${N} n JOIN ${tbl('SecuenciaFiscal')} s ON s.id = n.${q('secuenciaFiscalId')} WHERE s.${q('historica')} = 0`, `n.id AS k FROM ${N} n JOIN ${tbl('SecuenciaFiscal')} s ON s.id = n.${q('secuenciaFiscalId')} WHERE s.${q('historica')} = 0 AND (CAST(${esSqlServer ? 'SUBSTRING' : 'SUBSTR'}(n.${q('ncf')}, 4, 20) AS FLOAT) < s.${q('desde')} OR CAST(${esSqlServer ? 'SUBSTRING' : 'SUBSTR'}(n.${q('ncf')}, 4, 20) AS FLOAT) > s.${q('actual')})`);
    await add('FinCobroItem con notaDebitoId cuya nota no es de debito', `SELECT COUNT(*) AS n FROM ${tbl('FinCobroItem')}`, `c.id AS k FROM ${tbl('FinCobroItem')} c JOIN ${N} n ON n.id = c.${q('notaDebitoId')} WHERE n.clase <> 'DEBITO'`);
  }
  await add('FinRecibo sin ningun pago (FinReciboPago)', `SELECT COUNT(*) AS n FROM ${tbl('FinRecibo')}`, `r.id AS k FROM ${tbl('FinRecibo')} r WHERE NOT EXISTS (SELECT 1 FROM ${tbl('FinReciboPago')} p WHERE p.${q('reciboId')} = r.id)`);
  await add('FinRecibo cuyos pagos suman MENOS que su monto', `SELECT COUNT(*) AS n FROM ${tbl('FinRecibo')}`, `r.id AS k FROM ${tbl('FinRecibo')} r WHERE (SELECT SUM(p.monto) FROM ${tbl('FinReciboPago')} p WHERE p.${q('reciboId')} = r.id) < r.monto - 0.01`);
  await add('FinRecibo.metodoPagoId distinto del medio de su unico pago (o con valor siendo pago mixto)', `SELECT COUNT(*) AS n FROM ${tbl('FinRecibo')}`, `r.id AS k FROM ${tbl('FinRecibo')} r WHERE ((SELECT COUNT(DISTINCT p.${q('metodoPagoId')}) FROM ${tbl('FinReciboPago')} p WHERE p.${q('reciboId')} = r.id) = 1 AND r.${q('metodoPagoId')} IS NOT NULL AND r.${q('metodoPagoId')} <> (SELECT MIN(p.${q('metodoPagoId')}) FROM ${tbl('FinReciboPago')} p WHERE p.${q('reciboId')} = r.id)) OR ((SELECT COUNT(DISTINCT p.${q('metodoPagoId')}) FROM ${tbl('FinReciboPago')} p WHERE p.${q('reciboId')} = r.id) > 1 AND r.${q('metodoPagoId')} IS NOT NULL)`);
  await add('FinReciboItem sin cargo de cartera (cobroItemId NULL: lineas historicas permitidas)', `SELECT COUNT(*) AS n FROM ${tbl('FinReciboItem')}`, `i.id AS k FROM ${tbl('FinReciboItem')} i WHERE i.${q('cobroItemId')} IS NULL`, true);
  await add('FinReciboItem cuyo cargo es de OTRO alumno que el tutor del recibo (informativo)', `SELECT COUNT(*) AS n FROM ${tbl('FinReciboItem')}`, `i.id AS k FROM ${tbl('FinReciboItem')} i JOIN ${tbl('FinCobroItem')} c ON c.id = i.${q('cobroItemId')} JOIN ${tbl('FinRecibo')} r ON r.id = i.${q('reciboId')} WHERE c.${q('cicloId')} <> r.${q('cicloId')}`, true);
  await add('FinCobroItem pagado en un recibo cuyo ciclo es distinto del ciclo del cargo (informativo)', `SELECT COUNT(*) AS n FROM ${tbl('FinCobroItem')}`, `c.id AS k FROM ${tbl('FinCobroItem')} c JOIN ${tbl('FinReciboItem')} i ON i.${q('cobroItemId')} = c.id JOIN ${tbl('FinRecibo')} r ON r.id = i.${q('reciboId')} WHERE c.${q('cicloId')} <> r.${q('cicloId')}`, true);
  await add('Ciclo ACTIVO: debe existir exactamente uno', `SELECT COUNT(*) AS n FROM ${C}`, `'activos' AS k FROM (SELECT COUNT(*) AS n FROM ${C} WHERE estado = 'Activo') z WHERE z.n <> 1`);
  await add('Ciclo sin sus periodos academicos', `SELECT COUNT(*) AS n FROM ${C}`, `c.id AS k FROM ${C} c WHERE NOT EXISTS (SELECT 1 FROM ${tbl('PeriodoAcademico')} p WHERE p.${q('cicloId')} = c.id)`);
  await add('ServicioAlumno sin EXACTAMENTE una FK de catalogo', `SELECT COUNT(*) AS n FROM ${tbl('ServicioAlumno')}`, `s.id AS k FROM ${tbl('ServicioAlumno')} s WHERE (CASE WHEN s.${q('rutaId')} IS NULL THEN 0 ELSE 1 END) + (CASE WHEN s.${q('aliPlanId')} IS NULL THEN 0 ELSE 1 END) + (CASE WHEN s.${q('extraId')} IS NULL THEN 0 ELSE 1 END) + (CASE WHEN s.${q('productoId')} IS NULL THEN 0 ELSE 1 END) <> 1`);
  await add('Alumno con carnet de comedor y sin Monedero', `SELECT COUNT(*) AS n FROM ${tbl('ComCarnet')}`, `c.${q('alumnoId')} AS k FROM ${tbl('ComCarnet')} c WHERE NOT EXISTS (SELECT 1 FROM ${tbl('Monedero')} m WHERE m.${q('alumnoId')} = c.${q('alumnoId')})`);
  await add('Monedero con saldo negativo', `SELECT COUNT(*) AS n FROM ${tbl('Monedero')}`, `m.${q('alumnoId')} AS k FROM ${tbl('Monedero')} m WHERE m.saldo < 0`);
  await add('AcadNota con periodo de un ciclo en el que el alumno no tiene Matricula (informativo)', `SELECT COUNT(*) AS n FROM ${tbl('AcadNota')}`, `n.id AS k FROM ${tbl('AcadNota')} n JOIN ${tbl('AcadRoster')} r ON r.id = n.${q('rosterId')} JOIN ${tbl('PeriodoAcademico')} p ON p.id = n.${q('periodoId')} WHERE r.${q('alumnoId')} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${M} m WHERE m.${q('alumnoId')} = r.${q('alumnoId')} AND m.${q('cicloId')} = p.${q('cicloId')})`, true);
  const sub = esSqlServer ? 'SUBSTRING' : 'SUBSTR', cat = (...p: string[]) => (esSqlServer ? p.join(' + ') : p.join(' || '));
  await add('FinCobroItem con cicloId distinto del ciclo que contiene su vencimiento (informativo)', `SELECT COUNT(*) AS n FROM ${tbl('FinCobroItem')}`, `c.id AS k FROM ${tbl('FinCobroItem')} c JOIN ${C} y ON y.id = c.${q('cicloId')} WHERE c.vence LIKE '__/__/____' AND ${cat(sub + '(c.vence, 7, 4)', "'-'", sub + '(c.vence, 4, 2)', "'-'", sub + '(c.vence, 1, 2)')} NOT BETWEEN y.${q('fechaInicio')} AND y.${q('fechaFin')}`, true);
  return out;
}

export async function auditarTodo() {
  const A = await auditarFk(), B = await auditarDuplicados(), C = await auditarNormalizacion(), D = await auditarCoherencia();
  return { A, B, C, D, bloqueantes: [...A, ...B, ...C.filter(c => c.problemas && !c.detalle.startsWith('reemplazada')), ...D].filter(h => h.problemas > 0).length };
}

async function main() {
  const json = process.argv.includes('--json');
  const r = await auditarTodo();
  if (json) { console.log(JSON.stringify(r, null, 1)); } else {
    console.log(`Motor: ${esSqlServer ? 'SQL Server' : 'SQLite'}  ·  FK declaradas en el schema: ${relaciones.length}`);
    const fmt = (l: Hallazgo[]) => l.map(h => ({ ref: h.ref, filas: h.total, problemas: h.problemas, detalle: h.detalle }));
    tabla('A. Huerfanos por FK (problemas debe ser 0)', fmt(r.A));
    tabla('B. Duplicados que impedirian un UNIQUE', fmt(r.B.filter(h => h.problemas)));
    tabla('C. Normalizacion pendiente (columnas/tablas heredadas)', fmt(r.C.filter(h => h.problemas)));
    tabla('D. Coherencia (Fase 2C): matricula, tutores, recibos, ciclo activo, servicios, monedero', fmt(r.D));
    const tot = (l: Hallazgo[]) => l.reduce((a, h) => a + h.problemas, 0);
    console.log(`\nResumen: FK con problemas=${r.A.filter(h => h.problemas).length}/${r.A.length} (${tot(r.A)} filas) · duplicados=${tot(r.B)} · normalizacion=${tot(r.C)} · coherencia=${tot(r.D)}`);
    console.log(r.bloqueantes ? `RESULTADO: ${r.bloqueantes} hallazgo(s) bloqueante(s): corrige con scripts/fk-reparar.ts` : 'RESULTADO: sin huerfanos, duplicados ni incoherencias.');
  }
  process.exitCode = r.bloqueantes ? 1 : 0;
}

if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 2; }).finally(() => prisma.$disconnect());
