/**
 * BACKFILL / NORMALIZACION de integridad referencial para INSTANCIAS YA EXISTENTES (SQLite o SQL Server). Idempotente.
 *
 *   pnpm --filter @stodia/api db:fk:reparar               -> solo MUESTRA el plan y cuantas filas tocaria cada paso (no escribe)
 *   pnpm --filter @stodia/api db:fk:reparar -- --aplicar  -> ejecuta (haz un respaldo ANTES: .bak / copia del .db)
 *   Opciones: --crear-secciones  crea en el catalogo las secciones (grado|letra|tanda) que tienen alumnos y no existen.
 *
 * NUNCA borra filas: no toca cargos, recibos, inscripciones, becas ni monederos salvo para COMPLETAR columnas nuevas (alumnoId, tutorId...)
 * o normalizar el formato de un valor (cedula con guiones -> digitos, '' -> NULL, 'Tarjeta' -> nombre del catalogo de metodos de pago).
 * Lo que no se puede resolver con certeza (nombre ambiguo, referencia inexistente) se informa y se deja intacto.
 *
 * PROCEDIMIENTO PARA UNA BASE ANTERIOR A LA FASE 1 (expandir -> rellenar -> contraer), con la API detenida:
 *   1. respaldo;  2. este script con --aplicar  (EXPANDE: agrega las columnas nuevas como NULLables y RELLENA desde las columnas viejas);
 *   3. pnpm db:fk:auditar (revisa que no queden huerfanos/duplicados);  4. pnpm db:push -- --accept-data-loss  (CONTRAE: crea FK/UNIQUE/NOT NULL y
 *   elimina las columnas heredadas, que ya estan copiadas);  5. este script con --aplicar otra vez (rellena las tablas nuevas, p. ej. Contrato);
 *   6. pnpm db:fk:auditar debe terminar en 0.
 */
import { asegurarIndices } from '../src/lib/db-indices';
import { alinearPlanesAli } from '../src/lib/ali-catalogos';
import { auditarTodo } from './fk-auditar';
import { catalogo, columnas, cuenta, digitos, ejecutar, esSqlServer, filas, modelos, num, prisma, q, relaciones, sinAcento, tablaExiste, tbl, tieneCol } from './fk-comun';

const auto = process.argv.includes('--auto'); // arranque del contenedor: silencioso, idempotente; sale con 10 si EXPANDIO una base anterior
const detectar = process.argv.includes('--detectar'); // solo lectura: sale con 10 si la base es anterior a la Fase 1
const aplicar = process.argv.includes('--aplicar') || auto;
const crearSecciones = process.argv.includes('--crear-secciones');
const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const informe: { paso: string; filas: number; estado: string }[] = [];

/** Ejecuta un paso: `contar` = filas a cambiar; `hacer` las cambia (solo con --aplicar). */
async function paso(nombre: string, contar: () => Promise<number>, hacer?: () => Promise<void>) {
  let n = 0;
  try { n = await contar(); } catch (e) { informe.push({ paso: nombre, filas: 0, estado: 'omitido: ' + (e as Error).message.slice(0, 70) }); return; }
  if (!n) { informe.push({ paso: nombre, filas: 0, estado: 'nada que hacer' }); return; }
  if (!aplicar || !hacer) { informe.push({ paso: nombre, filas: n, estado: aplicar ? 'solo informe' : 'pendiente (usa --aplicar)' }); return; }
  await hacer();
  informe.push({ paso: nombre, filas: n, estado: 'APLICADO' });
}
const trozos = <T>(l: T[], n = 400) => Array.from({ length: Math.ceil(l.length / n) }, (_, i) => l.slice(i * n, (i + 1) * n));
const marcas = (n: number) => Array.from({ length: n }, () => '?').join(',');

// Columnas nuevas de la Fase 1 que una base anterior no tiene (todas NULLables hasta que `db push` las endurece).
const NUEVAS: [string, string][] = [
  ['Tutor', 'userId'], ['Alumno', 'tutorLegalId'], ['FinCobroItem', 'alumnoId'], ['FinCobroItem', 'tutorId'], ['FinCobroItem', 'servicioId'],
  ['FinRecibo', 'tutorId'], ['FinRecibo', 'cajaId'], ['FinRecibo', 'cajeroId'], ['FinBeca', 'alumnoId'], ['PersServicio', 'reciboId'], ['PersInscripcion', 'planId'],
  ['ComCarnet', 'alumnoId'], ['ComCarnet', 'aliPlanId'], ['ComLectura', 'alumnoId'], ['MobPagoIntencion', 'tutorId'], ['CmnMensaje', 'tutorId'], ['CmnMensaje', 'userId'],
  ['FinMovimiento', 'productoId'], ['FinMovimiento', 'ventaId'],
];
const tipoNuevo = esSqlServer ? 'NVARCHAR(100) NULL' : 'TEXT';

async function estructura() {
  for (const [t, c] of NUEVAS) {
    await paso(`ESTRUCTURA: ${t}.${c} (columna nueva NULLable)`, async () => ((await tablaExiste(t)) && !(await tieneCol(t, c)) ? 1 : 0), async () => {
      await ejecutar(`ALTER TABLE ${tbl(t)} ADD ${esSqlServer ? '' : 'COLUMN '}${q(c)} ${tipoNuevo}`);
    });
  }
  // MobPagoIntencion.reciboId / resueltoPor eran NOT NULL con '' como "sin valor": se renombran a *_legacy (db push las elimina) y se crean NULLables.
  for (const c of ['reciboId', 'resueltoPor']) {
    await paso(`ESTRUCTURA: MobPagoIntencion.${c} NOT NULL -> NULLable (la vieja pasa a ${c}_legacy)`, async () => {
      if (!(await tablaExiste('MobPagoIntencion'))) return 0;
      const col = (await columnas('MobPagoIntencion')).find(x => x.name === c);
      return col?.notNull ? 1 : 0;
    }, async () => {
      if (esSqlServer) await ejecutar(`EXEC sp_rename 'dbo.MobPagoIntencion.${c}', '${c}_legacy', 'COLUMN'`);
      else await ejecutar(`ALTER TABLE ${q('MobPagoIntencion')} RENAME COLUMN ${q(c)} TO ${q(c + '_legacy')}`);
      await ejecutar(`ALTER TABLE ${tbl('MobPagoIntencion')} ADD ${esSqlServer ? '' : 'COLUMN '}${q(c)} ${tipoNuevo}`);
    });
  }
  // SQL Server: `prisma db push` falla al eliminar una columna que tiene un DEFAULT («The object ..._df is dependent on column ...»).
  // Las columnas obsoletas (heredadas de la version anterior o *_legacy) pierden su DEFAULT aqui; los datos ya estan copiados a las nuevas.
  if (esSqlServer) {
    for (const m of modelos) {
      if (!(await tablaExiste(m.name))) continue;
      const vigentes = new Set(m.fields.filter(f => f.kind !== 'object').map(f => f.name));
      for (const c of await columnas(m.name)) {
        if (vigentes.has(c.name)) continue;
        const defecto = async () => (await filas<{ n: string }>(`SELECT dc.name AS n FROM sys.default_constraints dc JOIN sys.columns c ON c.default_object_id = dc.object_id WHERE dc.parent_object_id = OBJECT_ID('dbo.${m.name}') AND c.name = '${c.name}'`))[0]?.n;
        await paso(`ESTRUCTURA: quitar el DEFAULT de ${m.name}.${c.name} (columna obsoleta; db push no puede eliminarla con DEFAULT)`, async () => ((await defecto()) ? 1 : 0), async () => {
          await ejecutar(`ALTER TABLE ${tbl(m.name)} DROP CONSTRAINT ${q((await defecto())!)}`);
        });
      }
    }
  }
}

async function backfill() {
  // ---- Tutor.cedula -> solo digitos (UNIQUE) ----
  const tutores = (await tablaExiste('Tutor')) ? await filas<{ id: string; nombre: string; cedula: string }>(`SELECT id, nombre, cedula FROM ${tbl('Tutor')}`) : [];
  const porDig = new Map<string, string[]>();
  for (const t of tutores) porDig.set(digitos(t.cedula), [...(porDig.get(digitos(t.cedula)) ?? []), t.id]);
  const chocan = new Set([...porDig.values()].filter(l => l.length > 1).flat());
  await paso('Tutor.cedula con guiones/espacios -> solo digitos', async () => tutores.filter(t => digitos(t.cedula) !== t.cedula && !chocan.has(t.id)).length, async () => {
    for (const t of tutores.filter(x => digitos(x.cedula) !== x.cedula && !chocan.has(x.id))) await ejecutar(`UPDATE ${tbl('Tutor')} SET ${q('cedula')} = ? WHERE id = ?`, digitos(t.cedula), t.id);
  });
  if (chocan.size) informe.push({ paso: 'Tutor.cedula duplicada tras normalizar (resolver a mano: fusionar tutores)', filas: chocan.size, estado: [...chocan].slice(0, 6).join(', ') });

  // ---- Tutor.userId <- Tutor.usuario (heredada) ----
  if (await tieneCol('Tutor', 'usuario')) {
    await paso('Tutor.userId <- User por Tutor.usuario', () => cuenta(`SELECT COUNT(*) AS n FROM ${tbl('Tutor')} t WHERE t.${q('userId')} IS NULL AND t.usuario IS NOT NULL AND EXISTS (SELECT 1 FROM ${tbl('User')} u WHERE u.usuario = t.usuario)`), async () => {
      await ejecutar(`UPDATE ${tbl('Tutor')} SET ${q('userId')} = (SELECT MIN(u.id) FROM ${tbl('User')} u WHERE u.usuario = ${tbl('Tutor')}.usuario) WHERE ${q('userId')} IS NULL AND usuario IS NOT NULL AND EXISTS (SELECT 1 FROM ${tbl('User')} u WHERE u.usuario = ${tbl('Tutor')}.usuario)`);
    });
    informe.push({ paso: 'Tutor.usuario sin User correspondiente (queda sin acceso al portal)', filas: await cuenta(`SELECT COUNT(*) AS n FROM ${tbl('Tutor')} t WHERE t.usuario IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${tbl('User')} u WHERE u.usuario = t.usuario)`), estado: 'informativo' });
  }

  // ---- Alumno.tutorLegalId <- PersExpediente.data.tutorLegalId ----
  const exps = (await tablaExiste('PersExpediente')) ? await filas<{ alumnoId: string; data: string }>(`SELECT ${q('alumnoId')}, data FROM ${tbl('PersExpediente')}`) : [];
  const tutorIds = new Set(tutores.map(t => t.id));
  const legales = exps.flatMap(e => { try { const l = (JSON.parse(e.data) as { tutorLegalId?: string }).tutorLegalId; return l && tutorIds.has(l) ? [[e.alumnoId, l] as const] : []; } catch { return []; } });
  const sinLegal = new Set((await filas<{ id: string }>(`SELECT id FROM ${tbl('Alumno')} WHERE ${q('tutorLegalId')} IS NULL`)).map(r => r.id));
  await paso('Alumno.tutorLegalId <- ficha.tutorLegalId', async () => legales.filter(([a]) => sinLegal.has(a)).length, async () => {
    for (const [a, l] of legales.filter(([x]) => sinLegal.has(x))) await ejecutar(`UPDATE ${tbl('Alumno')} SET ${q('tutorLegalId')} = ? WHERE id = ?`, l, a);
  });
  informe.push({ paso: 'Alumno sin tutor financiero (Alumno.tutorId NULL: asignalo a mano antes del db push)', filas: await cuenta(`SELECT COUNT(*) AS n FROM ${tbl('Alumno')} WHERE ${q('tutorId')} IS NULL OR ${q('tutorId')} = ''`), estado: 'informativo' });

  // ---- FinCobroItem: alumnoId (kid), tutorId (tutorCed / tutor del alumno), servicioId (prefijo del id) ----
  if (await tieneCol('FinCobroItem', 'kid')) {
    await paso('FinCobroItem.alumnoId <- kid (id real)', () => cuenta(`SELECT COUNT(*) AS n FROM ${tbl('FinCobroItem')} WHERE ${q('alumnoId')} IS NULL AND kid IN (SELECT id FROM ${tbl('Alumno')})`), async () => {
      await ejecutar(`UPDATE ${tbl('FinCobroItem')} SET ${q('alumnoId')} = kid WHERE ${q('alumnoId')} IS NULL AND kid IN (SELECT id FROM ${tbl('Alumno')})`);
    });
    for (const [alias, id] of [['juan', '0412'], ['sofia', '0587']] as const) {
      await paso(`FinCobroItem.kid '${alias}' (alias del prototipo) -> alumno ${id}`, () => cuenta(`SELECT COUNT(*) AS n FROM ${tbl('FinCobroItem')} WHERE ${q('alumnoId')} IS NULL AND kid = ? AND NOT EXISTS (SELECT 1 FROM ${tbl('Alumno')} WHERE id = ?) AND EXISTS (SELECT 1 FROM ${tbl('Alumno')} WHERE id = ?)`, alias, alias, id), async () => {
        await ejecutar(`UPDATE ${tbl('FinCobroItem')} SET ${q('alumnoId')} = ? WHERE ${q('alumnoId')} IS NULL AND kid = ?`, id, alias);
      });
    }
    informe.push({ paso: 'FinCobroItem sin alumno resoluble (kid desconocido: NO se toca; corrige a mano)', filas: await cuenta(`SELECT COUNT(*) AS n FROM ${tbl('FinCobroItem')} WHERE ${q('alumnoId')} IS NULL`), estado: 'informativo' });
  }
  if (await tieneCol('FinCobroItem', 'tutorCed')) {
    await paso('FinCobroItem.tutorId <- Tutor por tutorCed', () => cuenta(`SELECT COUNT(*) AS n FROM ${tbl('FinCobroItem')} WHERE ${q('tutorId')} IS NULL AND ${q('tutorCed')} IS NOT NULL AND ${q('tutorCed')} <> ''`), async () => {
      await ejecutar(`UPDATE ${tbl('FinCobroItem')} SET ${q('tutorId')} = (SELECT MIN(t.id) FROM ${tbl('Tutor')} t WHERE REPLACE(REPLACE(t.cedula, '-', ''), ' ', '') = ${tbl('FinCobroItem')}.${q('tutorCed')}) WHERE ${q('tutorId')} IS NULL AND ${q('tutorCed')} IS NOT NULL AND ${q('tutorCed')} <> ''`);
    });
  }
  await paso('FinCobroItem.tutorId <- tutor financiero del alumno (los que quedan NULL)', () => cuenta(`SELECT COUNT(*) AS n FROM ${tbl('FinCobroItem')} WHERE ${q('tutorId')} IS NULL AND ${q('alumnoId')} IS NOT NULL`), async () => {
    await ejecutar(`UPDATE ${tbl('FinCobroItem')} SET ${q('tutorId')} = (SELECT a.${q('tutorId')} FROM ${tbl('Alumno')} a WHERE a.id = ${tbl('FinCobroItem')}.${q('alumnoId')}) WHERE ${q('tutorId')} IS NULL AND ${q('alumnoId')} IS NOT NULL`);
  });
  if (await tablaExiste('PersServicio')) {
    const servs = new Set((await filas<{ id: string }>(`SELECT id FROM ${tbl('PersServicio')}`)).map(s => s.id));
    const cand = (await filas<{ id: string }>(`SELECT id FROM ${tbl('FinCobroItem')} WHERE ${q('servicioId')} IS NULL AND id LIKE 'psv-%'`)).map(r => ({ id: r.id, s: r.id.slice(0, r.id.lastIndexOf('-')) })).filter(x => servs.has(x.s));
    await paso('FinCobroItem.servicioId <- PersServicio por prefijo del id (psv-...-mes)', async () => cand.length, async () => {
      const por = new Map<string, string[]>();
      for (const c of cand) por.set(c.s, [...(por.get(c.s) ?? []), c.id]);
      for (const [s, ids] of por) for (const ch of trozos(ids)) await ejecutar(`UPDATE ${tbl('FinCobroItem')} SET ${q('servicioId')} = ? WHERE id IN (${marcas(ch.length)})`, s, ...ch);
    });
  }

  // ---- FinRecibo: tutorId por nombre unico; pays[].m al nombre del catalogo ----
  const nombreUnico = new Map<string, string | null>();
  for (const t of tutores) nombreUnico.set(t.nombre, nombreUnico.has(t.nombre) ? null : t.id);
  if (await tablaExiste('FinRecibo')) {
    const recs = await filas<{ id: string; tutor: string; tutorId: string | null; pays: string }>(`SELECT id, tutor, ${q('tutorId')}, pays FROM ${tbl('FinRecibo')}`);
    const sinTutor = recs.filter(r => !r.tutorId && nombreUnico.get(r.tutor));
    await paso('FinRecibo.tutorId <- Tutor por nombre exacto y unico', async () => sinTutor.length, async () => {
      for (const r of sinTutor) await ejecutar(`UPDATE ${tbl('FinRecibo')} SET ${q('tutorId')} = ? WHERE id = ?`, nombreUnico.get(r.tutor), r.id);
    });
    informe.push({ paso: "FinRecibo con tutor que no es un Tutor unico ('Consumidor final' o nombre ambiguo): tutorId queda NULL", filas: recs.filter(r => !r.tutorId && !nombreUnico.get(r.tutor)).length, estado: 'informativo' });
    const metodos = (await catalogo('metodosPago')).map(m => String(m.d.nombre));
    const mapa = (m: string) => (metodos.includes(m) ? m : metodos.find(x => sinAcento(x).startsWith(sinAcento(m))) ?? m);
    const malos = recs.filter(r => (JSON.parse(r.pays) as { m: string }[]).some(p => mapa(p.m) !== p.m));
    await paso("FinRecibo.pays[].m -> nombre exacto del catalogo metodosPago ('Tarjeta' -> 'Tarjeta de Crédito')", async () => malos.length, async () => {
      for (const r of malos) await ejecutar(`UPDATE ${tbl('FinRecibo')} SET pays = ? WHERE id = ?`, JSON.stringify((JSON.parse(r.pays) as { m: string }[]).map(p => ({ ...p, m: mapa(p.m) }))), r.id);
    });
  }

  // ---- PersServicio.reciboId <- recibo ; PersInscripcion.planId <- plan ----
  if (await tieneCol('PersServicio', 'recibo')) {
    await paso('PersServicio.reciboId <- recibo (solo si el recibo existe; el resto queda NULL)', () => cuenta(`SELECT COUNT(*) AS n FROM ${tbl('PersServicio')} WHERE ${q('reciboId')} IS NULL AND recibo IN (SELECT id FROM ${tbl('FinRecibo')})`), async () => {
      await ejecutar(`UPDATE ${tbl('PersServicio')} SET ${q('reciboId')} = recibo WHERE ${q('reciboId')} IS NULL AND recibo IN (SELECT id FROM ${tbl('FinRecibo')})`);
    });
    informe.push({ paso: 'PersServicio.recibo apunta a un recibo inexistente (queda NULL, texto heredado se elimina con db push)', filas: await cuenta(`SELECT COUNT(*) AS n FROM ${tbl('PersServicio')} WHERE recibo <> '' AND recibo NOT IN (SELECT id FROM ${tbl('FinRecibo')})`), estado: 'informativo' });
  }
  if (await tieneCol('PersInscripcion', 'plan')) {
    await paso('PersInscripcion.planId <- plan', () => cuenta(`SELECT COUNT(*) AS n FROM ${tbl('PersInscripcion')} WHERE ${q('planId')} IS NULL AND ${q('plan')} IN (SELECT id FROM ${tbl('FinPlan')})`), async () => {
      await ejecutar(`UPDATE ${tbl('PersInscripcion')} SET ${q('planId')} = ${q('plan')} WHERE ${q('planId')} IS NULL AND ${q('plan')} IN (SELECT id FROM ${tbl('FinPlan')})`);
    });
  }

  // ---- FinBeca: alumnoId por nombre completo (unico); tipo/conceptos al nombre del catalogo ----
  const alumnos = await filas<{ id: string; code: string; nombres: string; apellidos: string; estado: string }>(`SELECT id, code, nombres, apellidos, estado FROM ${tbl('Alumno')}`);
  if (await tablaExiste('FinBeca')) {
    const bs = await filas<{ id: string; est: string; alumnoId: string | null; tipo: string; conceptos: string }>(`SELECT id, est, ${q('alumnoId')}, tipo, conceptos FROM ${tbl('FinBeca')}`);
    const unico = (nombre: string) => { const c = alumnos.filter(a => `${a.nombres} ${a.apellidos}` === nombre); return c.length === 1 ? c[0].id : null; };
    const res = bs.filter(b => !b.alumnoId && unico(b.est));
    await paso('FinBeca.alumnoId <- Alumno por nombre completo (solo si es unico)', async () => res.length, async () => {
      for (const b of res) await ejecutar(`UPDATE ${tbl('FinBeca')} SET ${q('alumnoId')} = ? WHERE id = ?`, unico(b.est), b.id);
    });
    informe.push({ paso: 'FinBeca sin alumno unico (nombre ambiguo o inexistente): corrige a mano', filas: bs.filter(b => !b.alumnoId && !unico(b.est)).length, estado: 'informativo' });
    const tipos = (await catalogo('becas')).map(t => String(t.d.nombre)), conc = (await catalogo('conceptosBeca')).map(t => String(t.d.nombre));
    const mTipo = (t: string) => (tipos.includes(t) ? t : tipos.find(x => sinAcento(x) === sinAcento('Beca ' + t)) ?? t);
    const mConc = (c: string) => (conc.includes(c) ? c : /colegiatura/i.test(c) && conc.includes('Colegiatura') ? 'Colegiatura' : c);
    const fix = bs.filter(b => mTipo(b.tipo) !== b.tipo || b.conceptos.split('·').map(s => s.trim()).map(mConc).join(' · ') !== b.conceptos);
    await paso("FinBeca.tipo / conceptos -> nombres exactos del catalogo ('Académica' -> 'Beca Académica', 'Solo colegiatura' -> 'Colegiatura')", async () => fix.length, async () => {
      for (const b of fix) await ejecutar(`UPDATE ${tbl('FinBeca')} SET tipo = ?, conceptos = ? WHERE id = ?`, mTipo(b.tipo), b.conceptos.split('·').map(s => s.trim()).map(mConc).join(' · '), b.id);
    });
  }

  // ---- Alergias: nombres canonicos del catalogo (Alumno.alg, ComCarnet.allergies) y alta de las que faltan ----
  const aler = await catalogo('alergias');
  const canon = new Map(aler.map(a => [sinAcento(String(a.d.nombre)), String(a.d.nombre)]));
  const usadas = new Map<string, string>(); // sinAcento -> primera grafia vista
  for (const a of await filas<{ id: string; alg: string }>(`SELECT id, alg FROM ${tbl('Alumno')}`)) for (const x of a.alg.split(',').map(s => s.trim()).filter(Boolean)) if (!usadas.has(sinAcento(x))) usadas.set(sinAcento(x), x[0].toUpperCase() + x.slice(1).toLowerCase());
  const faltan = [...usadas].filter(([k]) => !canon.has(k));
  await paso(`Catalogo alergias: alta de las ${faltan.length} usadas por los alumnos que no existen (${faltan.map(f => f[1]).slice(0, 5).join(', ')})`, async () => faltan.length, async () => {
    const maxId = Math.max(0, ...aler.map(a => Number(a.cid) || 0));
    for (const [i, [k, nombre]] of faltan.entries()) {
      const id = pad(maxId + i + 1);
      await ejecutar(`INSERT INTO ${tbl('Catalogo')} (id, tipo, data, estado) VALUES (?, 'alergias', ?, 'Activo')`, `alergias:${id}`, JSON.stringify({ id, nombre, estado: 'Activo' }));
      canon.set(k, nombre);
    }
  });
  if (aplicar) for (const [k, nombre] of faltan) canon.set(k, nombre);
  const canonizar = (x: string) => canon.get(sinAcento(x)) ?? x;
  const alAlg = (await filas<{ id: string; alg: string }>(`SELECT id, alg FROM ${tbl('Alumno')}`)).filter(a => a.alg && a.alg.split(',').map(s => s.trim()).filter(Boolean).map(canonizar).join(', ') !== a.alg);
  await paso('Alumno.alg: mayusculas/acentos al nombre canonico del catalogo', async () => alAlg.length, async () => {
    for (const a of alAlg) await ejecutar(`UPDATE ${tbl('Alumno')} SET alg = ? WHERE id = ?`, a.alg.split(',').map(s => s.trim()).filter(Boolean).map(canonizar).join(', '), a.id);
  });

  // ---- ComCarnet: alumnoId, code = Alumno.code, aliPlanId, alergias canonicas ----
  if (await tablaExiste('ComCarnet')) {
    const cs = await filas<{ code: string; alumnoId: string | null; plan: string; allergies: string; aliPlanId: string | null }>(`SELECT code, ${q('alumnoId')}, ${q('plan')}, allergies, ${q('aliPlanId')} FROM ${tbl('ComCarnet')}`);
    const alDeCodigo = (code: string) => alumnos.find(a => a.code === code) ?? alumnos.find(a => a.id === code.replace(/^EST-/, ''));
    const sinAl = cs.filter(c => !c.alumnoId && alDeCodigo(c.code));
    await paso('ComCarnet.alumnoId <- Alumno por code (EST-2026-nnnn) o EST-<id>', async () => sinAl.length, async () => {
      for (const c of sinAl) await ejecutar(`UPDATE ${tbl('ComCarnet')} SET ${q('alumnoId')} = ? WHERE code = ?`, alDeCodigo(c.code)!.id, c.code);
    });
    informe.push({ paso: 'ComCarnet sin alumno resoluble (carnet huerfano: revisa o elimina a mano)', filas: cs.filter(c => !c.alumnoId && !alDeCodigo(c.code)).length, estado: 'informativo' });
    const usados = new Set(cs.map(c => c.code));
    const recode = cs.map(c => ({ c, a: c.alumnoId ? alumnos.find(x => x.id === c.alumnoId) : alDeCodigo(c.code) })).filter(x => x.a && x.a.code !== x.c.code && !usados.has(x.a.code));
    await paso('ComCarnet.code -> Alumno.code (convencion unica; EST-<id> ya no es el codigo)', async () => recode.length, async () => {
      for (const { c, a } of recode) await ejecutar(`UPDATE ${tbl('ComCarnet')} SET code = ? WHERE code = ?`, a!.code, c.code);
    });
    // Tras el cambio de code (arriba) las filas se identifican con el code NUEVO.
    const codeAhora = (c: { code: string }) => (aplicar ? recode.find(r => r.c.code === c.code)?.a!.code : undefined) ?? c.code;
    const planes = await filas<{ id: string; name: string; modelo: string; estado: string }>(`SELECT id, name, modelo, estado FROM ${tbl('AliPlan')} ORDER BY id`);
    const planDe = (label: string) => planes.find(p => p.name === label)?.id ?? (/^suscrip/i.test(label) ? planes.find(p => p.modelo === 'sub' && p.estado === 'Activo')?.id : /^monedero/i.test(label) ? planes.find(p => p.modelo === 'wal' && p.estado === 'Activo')?.id : undefined) ?? null;
    const sinPlan = cs.filter(c => !c.aliPlanId && planDe(c.plan));
    await paso("ComCarnet.aliPlanId <- plan de alimentacion segun la etiqueta ('Suscripción...' -> plan sub, 'Monedero...' -> plan wal)", async () => sinPlan.length, async () => {
      for (const c of sinPlan) await ejecutar(`UPDATE ${tbl('ComCarnet')} SET ${q('aliPlanId')} = ? WHERE code = ?`, planDe(c.plan), codeAhora(c));
    });
    const allg = cs.filter(c => (JSON.parse(c.allergies) as string[]).some(x => canonizar(x) !== x));
    await paso('ComCarnet.allergies: MAYUSCULAS -> nombre canonico del catalogo (el DTO las muestra en mayusculas)', async () => allg.length, async () => {
      for (const c of allg) await ejecutar(`UPDATE ${tbl('ComCarnet')} SET allergies = ? WHERE code = ?`, JSON.stringify((JSON.parse(c.allergies) as string[]).map(canonizar)), codeAhora(c));
    });
  }
  if (await tablaExiste('ComLectura')) {
    const ls = await filas<{ id: string; n: string; alumnoId: string | null }>(`SELECT id, n, ${q('alumnoId')} FROM ${tbl('ComLectura')}`);
    const res = ls.filter(l => !l.alumnoId && alumnos.filter(a => `${a.nombres} ${a.apellidos}` === l.n).length === 1);
    await paso('ComLectura.alumnoId <- Alumno por nombre completo unico', async () => res.length, async () => {
      for (const l of res) await ejecutar(`UPDATE ${tbl('ComLectura')} SET ${q('alumnoId')} = ? WHERE id = ?`, alumnos.find(a => `${a.nombres} ${a.apellidos}` === l.n)!.id, l.id);
    });
  }

  // ---- MobPagoIntencion / CmnMensaje / FinMovimiento ----
  if (await tieneCol('MobPagoIntencion', 'tutor')) {
    const ps = await filas<{ id: string; tutor: string }>(`SELECT id, tutor FROM ${tbl('MobPagoIntencion')} WHERE ${q('tutorId')} IS NULL`);
    const res = ps.filter(p => nombreUnico.get(p.tutor));
    await paso('MobPagoIntencion.tutorId <- Tutor por nombre unico', async () => res.length, async () => {
      for (const p of res) await ejecutar(`UPDATE ${tbl('MobPagoIntencion')} SET ${q('tutorId')} = ? WHERE id = ?`, nombreUnico.get(p.tutor), p.id);
    });
  }
  for (const [nuevo, extra] of [['reciboId', ` AND ${q('reciboId_legacy')} IN (SELECT id FROM ${tbl('FinRecibo')})`], ['resueltoPor', '']] as const) {
    if (await tieneCol('MobPagoIntencion', nuevo + '_legacy')) {
      await paso(`MobPagoIntencion.${nuevo} <- ${nuevo}_legacy ('' -> NULL)`, () => cuenta(`SELECT COUNT(*) AS n FROM ${tbl('MobPagoIntencion')} WHERE ${q(nuevo)} IS NULL AND ${q(nuevo + '_legacy')} IS NOT NULL AND ${q(nuevo + '_legacy')} <> ''${extra}`), async () => {
        await ejecutar(`UPDATE ${tbl('MobPagoIntencion')} SET ${q(nuevo)} = ${q(nuevo + '_legacy')} WHERE ${q(nuevo)} IS NULL AND ${q(nuevo + '_legacy')} IS NOT NULL AND ${q(nuevo + '_legacy')} <> ''${extra}`);
      });
    }
  }
  if (await tablaExiste('CmnMensaje')) {
    const ms = await filas<{ id: unknown; to: string; by: string; tutorId: string | null; userId: string | null }>(`SELECT id, ${q('to')}, ${q('by')}, ${q('tutorId')}, ${q('userId')} FROM ${tbl('CmnMensaje')}`);
    const users = new Map((await filas<{ id: string; usuario: string }>(`SELECT id, usuario FROM ${tbl('User')}`)).map(u => [u.usuario, u.id]));
    const res = ms.filter(m => (!m.tutorId && nombreUnico.get(m.to)) || (!m.userId && users.has(m.by)));
    await paso('CmnMensaje.tutorId / userId <- Tutor por nombre unico / User por usuario (usr_sistema -> NULL)', async () => res.length, async () => {
      for (const m of res) await ejecutar(`UPDATE ${tbl('CmnMensaje')} SET ${q('tutorId')} = ?, ${q('userId')} = ? WHERE id = ?`, m.tutorId ?? nombreUnico.get(m.to) ?? null, m.userId ?? users.get(m.by) ?? null, num(m.id));
    });
  }
  if (await tablaExiste('FinMovimiento')) {
    const mv = await filas<{ id: unknown; name: string; ref: string; productoId: string | null; ventaId: string | null }>(`SELECT id, name, ref, ${q('productoId')}, ${q('ventaId')} FROM ${tbl('FinMovimiento')}`);
    const prods = await filas<{ id: string; name: string }>(`SELECT id, name FROM ${tbl('FinProducto')}`), ventas = new Set((await filas<{ id: string }>(`SELECT id FROM ${tbl('FinVenta')}`)).map(v => v.id));
    const pu = (n: string) => { const c = prods.filter(p => p.name === n); return c.length === 1 ? c[0].id : null; };
    const res = mv.filter(m => (!m.productoId && pu(m.name)) || (!m.ventaId && ventas.has(m.ref)));
    await paso('FinMovimiento.productoId / ventaId <- FinProducto por nombre unico / FinVenta por ref', async () => res.length, async () => {
      for (const m of res) await ejecutar(`UPDATE ${tbl('FinMovimiento')} SET ${q('productoId')} = ?, ${q('ventaId')} = ? WHERE id = ?`, m.productoId ?? pu(m.name), m.ventaId ?? (ventas.has(m.ref) ? m.ref : null), num(m.id));
    });
    informe.push({ paso: 'FinMovimiento sin producto unico (nombre cambiado o repetido): productoId NULL -> db push fallara hasta corregirlo', filas: mv.filter(m => !m.productoId && !pu(m.name)).length, estado: 'informativo' });
  }

  // ---- Contrato <- PersExpediente.data.contrato (tabla nueva: se rellena DESPUES del db push) ----
  if (await tablaExiste('Contrato')) {
    const cfg = await filas<{ valor: string }>(`SELECT valor FROM ${tbl('SisConfig')} WHERE clave = 'ciclos'`);
    const activo = (cfg[0] ? (JSON.parse(cfg[0].valor) as { n: string; estado: string }[]) : []).find(c => c.estado === 'Activo')?.n ?? '';
    const planes = new Set((await filas<{ id: string }>(`SELECT id FROM ${tbl('FinPlan')}`)).map(p => p.id));
    const becas = new Set((await catalogo('becas')).map(b => b.cid));
    const existen = new Set((await filas<{ alumnoId: string; ciclo: string }>(`SELECT ${q('alumnoId')}, ciclo FROM ${tbl('Contrato')}`)).map(c => `${c.alumnoId}|${c.ciclo}`));
    const nuevos = exps.flatMap(e => {
      try {
        const c = (JSON.parse(e.data) as { contrato?: { ciclo?: string; plan?: string; beca?: string; ctr?: string; firmado?: string } }).contrato;
        if (!c?.plan || !planes.has(c.plan)) return [];
        const ciclo = c.ciclo || activo;
        if (!ciclo || existen.has(`${e.alumnoId}|${ciclo}`)) return [];
        return [{ id: `ctr-${e.alumnoId}-${/(\d{4})/.exec(ciclo)?.[1] ?? 'x'}`, alumnoId: e.alumnoId, ciclo, planId: c.plan, beca: c.beca && c.beca !== 'none' && becas.has(c.beca) ? c.beca : null, ctr: c.ctr ?? '', firmado: c.firmado ?? '' }];
      } catch { return []; }
    });
    await paso('Contrato <- PersExpediente.data.contrato (plan con FK, beca del catalogo, ciclo)', async () => nuevos.length, async () => {
      for (const c of nuevos) await ejecutar(`INSERT INTO ${tbl('Contrato')} (id, ${q('alumnoId')}, ciclo, ${q('planId')}, beca, ctr, firmado) VALUES (?, ?, ?, ?, ?, ?, ?)`, c.id, c.alumnoId, c.ciclo, c.planId, c.beca, c.ctr, c.firmado);
    });
    informe.push({ paso: 'Expedientes con plan de contrato no resoluble (clave heredada o plan inexistente): sin Contrato', filas: exps.filter(e => { try { const p = (JSON.parse(e.data) as { contrato?: { plan?: string } }).contrato?.plan; return !!p && !planes.has(p); } catch { return false; } }).length, estado: 'informativo' });
  } else informe.push({ paso: 'Contrato (tabla nueva)', filas: 0, estado: 'aun no existe: ejecuta prisma db push y vuelve a correr este script' });

  // ---- Centinelas '' -> NULL en TODA FK opcional ya NULLable ----
  for (const r of relaciones.filter(x => x.opcional)) {
    if (!(await tieneCol(r.hijo, r.col))) continue;
    const info = (await columnas(r.hijo)).find(c => c.name === r.col);
    if (info?.notNull) continue;
    await paso(`${r.hijo}.${r.col}: '' -> NULL`, () => cuenta(`SELECT COUNT(*) AS n FROM ${tbl(r.hijo)} WHERE ${q(r.col)} = ''`), async () => {
      await ejecutar(`UPDATE ${tbl(r.hijo)} SET ${q(r.col)} = NULL WHERE ${q(r.col)} = ''`);
    });
  }

  // ---- Contadores desnormalizados que ya no se guardan / banderas posicionales ----
  const secs = await catalogo('secciones');
  const conInsc = secs.filter(s => 'insc' in s.d);
  await paso("Catalogo secciones: quitar el contador 'insc' del JSON (ahora se calcula desde Alumno)", async () => conInsc.length, async () => {
    for (const s of conInsc) { const { insc: _i, ...resto } = s.d; await ejecutar(`UPDATE ${tbl('Catalogo')} SET data = ? WHERE id = ?`, JSON.stringify(resto), s.id); }
  });
  await paso('AliPlan.meals/diets: alinear la longitud con los catalogos comidas/dietas', async () => {
    const [com, die] = [(await catalogo('comidas')).filter(c => c.estado === 'Activo').length, (await catalogo('dietas')).filter(c => c.estado === 'Activo').length];
    return (await filas<{ meals: string; diets: string }>(`SELECT meals, diets FROM ${tbl('AliPlan')}`)).filter(p => (JSON.parse(p.meals) as unknown[]).length !== com || (JSON.parse(p.diets) as unknown[]).length !== die).length;
  }, async () => { await alinearPlanesAli(); });

  // ---- Secciones faltantes (informe; --crear-secciones las crea) ----
  const grados = await catalogo('grados'), tandas = await catalogo('tandas');
  const existentes = new Set(secs.map(s => `${grados.find(g => g.cid === s.d.grado)?.d.grado}|${s.d.seccion}|${tandas.find(t => t.cid === s.d.tanda)?.d.nombre}`));
  const claves = new Map<string, number>();
  for (const a of await filas<{ grado: string; sec: string; tanda: string }>(`SELECT grado, sec, tanda FROM ${tbl('Alumno')}`)) { const k = `${a.grado}|${a.sec}|${a.tanda}`; if (!existentes.has(k)) claves.set(k, (claves.get(k) ?? 0) + 1); }
  await paso(`Secciones con alumnos que NO existen en el catalogo (${[...claves.keys()].slice(0, 4).join(', ')})`, async () => claves.size, crearSecciones ? async () => {
    for (const k of claves.keys()) {
      const [g, letra, t] = k.split('|'), gs = grados.filter(x => x.d.grado === g && x.estado === 'Activo'), ts = tandas.filter(x => x.d.nombre === t);
      if (gs.length !== 1 || ts.length !== 1) { console.warn(`   no se crea ${k}: grado/tanda ambiguo o inexistente`); continue; }
      const id = `sx-${gs[0].cid}-${letra}-${ts[0].cid}`;
      await ejecutar(`INSERT INTO ${tbl('Catalogo')} (id, tipo, data, estado) VALUES (?, 'secciones', ?, 'Activo')`, `secciones:${id}`, JSON.stringify({ id, estado: 'Activo', grado: gs[0].cid, seccion: letra, tanda: ts[0].cid, aula: '', cap: 30 }));
    }
  } : undefined);
}

async function main() {
  if (!(await tablaExiste('Alumno'))) { console.log('Base nueva (sin tablas): nada que migrar.'); return; }
  if (detectar) {
    await estructura();
    const vieja = informe.some(i => i.paso.startsWith('ESTRUCTURA') && i.estado.startsWith('pendiente'));
    console.log(vieja ? 'Base ANTERIOR a la Fase 1 (integridad referencial): requiere fk-reparar --aplicar + prisma db push --accept-data-loss.' : 'Base ya en el esquema de la Fase 1.');
    process.exitCode = vieja ? 10 : 0;
    return;
  }
  if (!auto) console.log(`Motor: ${esSqlServer ? 'SQL Server' : 'SQLite'} · modo: ${aplicar ? 'APLICAR (escribe)' : 'solo informe (agrega --aplicar para escribir)'}`);
  if (aplicar && !auto) console.log('Recuerda: respaldo previo hecho y API detenida.');
  await estructura();
  if (!aplicar && informe.some(i => i.paso.startsWith('ESTRUCTURA') && i.estado.startsWith('pendiente'))) {
    console.table(informe.filter(i => i.estado.startsWith('pendiente')));
    console.log('La base es anterior a la Fase 1: faltan columnas. Ejecuta con --aplicar para EXPANDIR (agrega las columnas NULLables) y rellenar; el informe de relleno se calcula despues de crearlas.');
    return;
  }
  await backfill();
  if (aplicar) await asegurarIndices();
  const hechos = informe.filter(i => i.estado === 'APLICADO');
  if (auto) {
    console.log(hechos.length ? `fk-reparar --auto: ${hechos.length} paso(s) aplicados:\n  - ${hechos.map(h => `${h.paso} (${h.filas})`).join('\n  - ')}` : 'fk-reparar --auto: la base ya cumple la Fase 1 (nada que reparar).');
    process.exitCode = informe.some(i => i.paso.startsWith('ESTRUCTURA') && i.estado === 'APLICADO') ? 10 : 0;
    return;
  }
  console.log('\n== Plan / resultado ==');
  const activos = informe.filter(i => i.filas > 0 || !i.estado.startsWith('nada'));
  console.table(process.argv.includes('--todo') ? informe : activos);
  console.log(`(${informe.length - activos.length} paso(s) sin cambios ocultos; --todo los muestra)`);
  if (aplicar) {
    const r = await auditarTodo();
    const malos = [...r.A, ...r.B].filter(h => h.problemas > 0);
    console.log(malos.length ? `\nQuedan ${malos.length} relacion(es)/clave(s) con problemas (normal ANTES de prisma db push):\n  - ` + malos.map(h => `${h.ref}: ${h.detalle}`).join('\n  - ') : '\nAuditoria final: 0 huerfanos y 0 duplicados en las FK.');
  } else console.log('\nNada se modifico. Ejecuta con --aplicar para aplicar los pasos marcados como pendientes.');
}

main().catch(e => { console.error(e); process.exitCode = 2; }).finally(() => prisma.$disconnect());
