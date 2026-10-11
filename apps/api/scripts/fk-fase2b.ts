/**
 * FASE 2B para INSTANCIAS YA EXISTENTES (SQLite o SQL Server): migra el RESTO de los catalogos de la tabla generica Catalogo (cajas, rutas, becas,
 * conceptosBeca, metodosPago, comidas, dietas, alergias) a TABLAS TIPADAS con los MISMOS ids, y convierte las listas en texto / JSON / banderas
 * posicionales en tablas puente con FK. Lo invoca scripts/fk-reparar.ts con --fase2b (o --auto). Idempotente y SIN BORRAR datos de negocio.
 * Lo ambiguo (nombre de beca sin catalogo, regla ilegible, caja inexistente...) se informa como BLOQUEANTE (exit 3 en --auto): nunca se inventa.
 *
 * Secuencia (expandir -> rellenar -> contraer -> retirar), igual que la Fase 2A:
 *   1. EXPANDIR: crea las tablas nuevas y agrega las columnas NULLables a las existentes (FinRecibo.metodoPagoId, FinBeca.tipoBecaId/modo/valor...).
 *   2. RELLENAR: Catalogo -> tablas tipadas; Alumno.alg / ComCarnet.allergies / AliMenu.algs -> AlumnoAlergia / AliMenuAlergia (las alergias usadas que
 *      el catalogo no tiene se dan de alta); AliPlan.meals/diets (banderas por posicion del catalogo ACTIVO ordenado por id) -> AliPlanComida/Dieta;
 *      FinBeca.tipo/regla/conceptos -> tipoBecaId + modo/valor + FinBecaConcepto; Contrato.beca -> tipoBecaId; FinRecibo.metodoPagoId (pago de UN medio);
 *      FinVenta.metodoPagoId; PersServicio.rutaId (catKey 'rt:<id>'); FinProducto.cat -> CategoriaProducto.
 *   3. CONTRAER: `prisma db push --accept-data-loss` (NOT NULL, FK, indices; elimina las columnas heredadas ya copiadas).
 *   4. RETIRAR: con las tablas contraidas, se eliminan de Catalogo los 8 tipos migrados (la tabla queda vacia; se elimina en la Fase 2C).
 */
import { catalogo, cuenta, ejecutar, esSqlServer, filas, q, sinAcento, tablaExiste, tbl, tieneCol } from './fk-comun';
import { prisma } from '../src/db';
import { crearTabla, type Informe, type Paso } from './fk-fase2a';
import { parseRegla } from '../src/lib/catalogos-tipados';

const TABLAS_NUEVAS = ['Caja', 'RutaTransporte', 'TipoBeca', 'ConceptoBeca', 'MetodoPago', 'Comida', 'Dieta', 'Alergia', 'CategoriaProducto', 'FinBecaConcepto', 'AliPlanComida', 'AliPlanDieta', 'AlumnoAlergia', 'AliMenuAlergia'];
/** [tabla, columna, tipo SQL Server, tipo SQLite] agregadas NULLables a tablas que ya existen. */
const COLUMNAS_NUEVAS: [string, string, string, string][] = [
  ['FinRecibo', 'metodoPagoId', 'NVARCHAR(100) NULL', 'TEXT'], ['FinVenta', 'metodoPagoId', 'NVARCHAR(100) NULL', 'TEXT'], ['FinBeca', 'tipoBecaId', 'NVARCHAR(100) NULL', 'TEXT'],
  ['FinBeca', 'modo', 'NVARCHAR(10) NULL', 'TEXT'], ['FinBeca', 'valor', 'FLOAT(53) NULL', 'REAL'], ['Contrato', 'tipoBecaId', 'NVARCHAR(100) NULL', 'TEXT'],
  ['PersServicio', 'rutaId', 'NVARCHAR(100) NULL', 'TEXT'], ['FinProducto', 'categoriaId', 'NVARCHAR(100) NULL', 'TEXT'],
];
const TIPOS_2B = ['cajas', 'rutas', 'becas', 'conceptosBeca', 'metodosPago', 'comidas', 'dietas', 'alergias'];
const TABLA_DE: Record<string, string> = { cajas: 'Caja', rutas: 'RutaTransporte', becas: 'TipoBeca', conceptosBeca: 'ConceptoBeca', metodosPago: 'MetodoPago', comidas: 'Comida', dietas: 'Dieta', alergias: 'Alergia' };
const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** true si la base es anterior a la Fase 2B (aun existen las tablas del catalogo generico sin migrar o las columnas heredadas). */
export async function pendiente2b(): Promise<boolean> {
  if (!(await tablaExiste('Alumno'))) return false;
  return (await tieneCol('Alumno', 'alg')) || !(await tablaExiste('Caja'));
}

export async function expandir2b(paso: Paso) {
  for (const t of TABLAS_NUEVAS) await paso(`FASE 2B ESTRUCTURA: tabla ${t} (nueva)`, async () => ((await tablaExiste(t)) ? 0 : 1), async () => { await crearTabla(t); });
  for (const [t, c, ss, sl] of COLUMNAS_NUEVAS) {
    await paso(`FASE 2B ESTRUCTURA: ${t}.${c} (columna nueva NULLable)`, async () => ((await tablaExiste(t)) && !(await tieneCol(t, c)) ? 1 : 0), async () => {
      await ejecutar(`ALTER TABLE ${tbl(t)} ADD ${esSqlServer ? '' : 'COLUMN '}${q(c)} ${esSqlServer ? ss : sl}`);
    });
  }
}

export async function rellenar2b(paso: Paso, informe: Informe, opc: { aplicar: boolean }) {
  const info = (p: string, n: number, e = 'informativo') => informe.push({ paso: p, filas: n, estado: e });
  if (!(await tablaExiste('Caja'))) { info('FASE 2B: tablas tipadas aun no existen (ejecuta con --aplicar para expandir)', 0, 'pendiente'); return; }
  const malos: string[] = [];
  const ids = async (t: string) => new Set((await filas<{ id: string }>(`SELECT id FROM ${tbl(t)}`)).map(r => r.id));
  const nombresDe = async (t: string) => new Set((await filas<{ n: string }>(`SELECT nombre AS n FROM ${tbl(t)}`)).map(r => sinAcento(r.n)));

  // ---- Catalogo -> tablas tipadas (mismos ids) ----
  const cat = Object.fromEntries(await Promise.all(TIPOS_2B.map(async t => [t, await catalogo(t)]))) as Record<string, Awaited<ReturnType<typeof catalogo>>>;
  const nuevos = async <T extends { id: string }>(tipo: string, mapa: (r: (typeof cat)[string][number]) => T & Record<string, unknown>, unico: (x: T & Record<string, unknown>) => string[]): Promise<(T & Record<string, unknown>)[]> => {
    const hay = await ids(TABLA_DE[tipo]);
    const vistos = new Set<string>();
    for (const clave of unico.length ? [] : []) vistos.add(clave);
    const out: (T & Record<string, unknown>)[] = [];
    for (const r of cat[tipo].filter(x => !hay.has(x.cid))) {
      const f = mapa(r), claves = unico(f).map(k => sinAcento(k));
      if (claves.some(k => vistos.has(k))) { malos.push(`${tipo} ${r.cid}: nombre/codigo repetido`); continue; }
      claves.forEach(k => vistos.add(k)); out.push(f);
    }
    return out;
  };
  const existentes = async (t: string, col: string) => new Set((await filas<{ v: string }>(`SELECT ${q(col)} AS v FROM ${tbl(t)}`)).map(r => sinAcento(r.v)));
  {
    const hayC = await existentes('Caja', 'codigo');
    const cajas = (await nuevos('cajas', r => ({ id: r.cid, codigo: String(r.d.codigo), ubic: String(r.d.ubic ?? ''), ncf: String(r.d.ncf ?? 'B02 · Consumo'), estado: r.estado }), x => [String(x.codigo)])).filter(x => !hayC.has(sinAcento(String(x.codigo))));
    await paso('Caja <- Catalogo cajas (mismos ids)', async () => cajas.length, async () => { await prisma.caja.createMany({ data: cajas as never }); });
    const hayR = await existentes('RutaTransporte', 'nombre'), hayF = await existentes('RutaTransporte', 'ficha');
    const rutas = (await nuevos('rutas', r => ({ id: r.cid, nombre: String(r.d.nombre), sectores: String(r.d.sectores ?? ''), chofer: String(r.d.chofer ?? ''), ficha: String(r.d.ficha), asientos: Number(r.d.asientos) || 0, tarifa: Number(r.d.tarifa) || 0, estado: r.estado }), x => [String(x.nombre)]))
      .filter(x => !hayR.has(sinAcento(String(x.nombre))) && !hayF.has(sinAcento(String(x.ficha))));
    await paso('RutaTransporte <- Catalogo rutas', async () => rutas.length, async () => { await prisma.rutaTransporte.createMany({ data: rutas as never }); });
    const hayB = await nombresDe('TipoBeca');
    const becas = (await nuevos('becas', r => { const raw = Number(r.d.pct ?? r.d.porcentaje ?? 0) || 0; return { id: r.cid, nombre: String(r.d.nombre ?? r.d.name ?? r.d.tipo ?? '').trim(), pct: raw > 0 && raw <= 1 ? raw * 100 : raw, requiereAprobacion: r.d.aprobacion === true || r.d.requiereAprobacion === true, estado: r.estado }; }, x => [String(x.nombre)])).filter(x => !hayB.has(sinAcento(String(x.nombre))));
    await paso('TipoBeca <- Catalogo becas (pct en %, aprobacion -> requiereAprobacion)', async () => becas.length, async () => { await prisma.tipoBeca.createMany({ data: becas as never }); });
    for (const [tipo, tabla, modelo] of [['conceptosBeca', 'ConceptoBeca', 'conceptoBeca'], ['comidas', 'Comida', 'comida'], ['dietas', 'Dieta', 'dieta'], ['alergias', 'Alergia', 'alergia']] as const) {
      const hay = await nombresDe(tabla);
      const filasN = (await nuevos(tipo, r => ({ id: r.cid, nombre: String(r.d.nombre).trim(), estado: r.estado }), x => [String(x.nombre)])).filter(x => !hay.has(sinAcento(String(x.nombre))));
      await paso(`${tabla} <- Catalogo ${tipo}`, async () => filasN.length, async () => { await (prisma[modelo] as unknown as { createMany: (a: unknown) => Promise<unknown> }).createMany({ data: filasN }); });
    }
    const hayM = await nombresDe('MetodoPago');
    const metodos = (await nuevos('metodosPago', r => ({ id: r.cid, nombre: String(r.d.nombre).trim(), ref: r.d.ref ? String(r.d.ref) : null, estado: r.estado }), x => [String(x.nombre)])).filter(x => !hayM.has(sinAcento(String(x.nombre))));
    await paso('MetodoPago <- Catalogo metodosPago', async () => metodos.length, async () => { await prisma.metodoPago.createMany({ data: metodos as never }); });
  }
  // Efectivo siempre existe (sin el no se puede cobrar): solo si la base no tenia ningun medio de pago.
  await paso("MetodoPago: sembrar 'Efectivo' (la base no tenia medios de pago)", async () => ((await cuenta(`SELECT COUNT(*) AS n FROM ${tbl('MetodoPago')}`)) ? 0 : 1), async () => { await prisma.metodoPago.create({ data: { id: 'm1', nombre: 'Efectivo', ref: null } }); });

  // ---- Alergias: las usadas por alumnos / carnets / menu que el catalogo no tiene se dan de alta ----
  const tieneAlg = await tieneCol('Alumno', 'alg'), tieneAll = await tieneCol('ComCarnet', 'allergies'), tieneAlgs = await tieneCol('AliMenu', 'algs');
  const alumnosAlg = tieneAlg ? await filas<{ id: string; alg: string }>(`SELECT id, alg FROM ${tbl('Alumno')} WHERE alg <> ''`) : [];
  const carnets = tieneAll ? await filas<{ alumnoId: string | null; allergies: string }>(`SELECT ${q('alumnoId')} AS ${q('alumnoId')}, allergies FROM ${tbl('ComCarnet')}`) : [];
  const menus = tieneAlgs ? await filas<{ orden: unknown; algs: string }>(`SELECT ${q('orden')} AS orden, algs FROM ${tbl('AliMenu')}`) : [];
  const lista = (csv: string) => csv.split(',').map(s => s.trim()).filter(Boolean);
  const json = (j: string): string[] => { try { const l = JSON.parse(j); return Array.isArray(l) ? l.map(String) : []; } catch { return []; } };
  {
    const usadas = new Map<string, string>(); // sinAcento -> grafia
    const alta = (x: string) => { if (!usadas.has(sinAcento(x))) usadas.set(sinAcento(x), x[0].toUpperCase() + x.slice(1).toLowerCase()); };
    alumnosAlg.forEach(a => lista(a.alg).forEach(alta)); carnets.forEach(c => json(c.allergies).forEach(alta)); menus.forEach(m => json(m.algs).forEach(alta));
    const hay = await nombresDe('Alergia');
    const faltan = [...usadas].filter(([k]) => !hay.has(k));
    await paso(`Alergia: alta de las ${faltan.length} usadas por alumnos/carnets/menu que el catalogo no tiene (${faltan.map(f => f[1]).slice(0, 5).join(', ')})`, async () => faltan.length, async () => {
      const maxId = Math.max(0, ...[...(await ids('Alergia'))].map(x => Number(x) || 0));
      await prisma.alergia.createMany({ data: faltan.map(([, nombre], i) => ({ id: pad(maxId + i + 1), nombre, estado: 'Activo' })) });
    });
  }
  const alergias = await prisma.alergia.findMany({ select: { id: true, nombre: true } });
  const alId = (n: string) => alergias.find(a => sinAcento(a.nombre) === sinAcento(n))?.id;
  {
    const hay = new Set((await filas<{ k: string }>(`SELECT ${q('alumnoId')} + '|' + ${q('alergiaId')} AS k FROM ${tbl('AlumnoAlergia')}`.replace(/\+/g, esSqlServer ? '+' : '||'))).map(r => r.k));
    const alumnoIds = await ids('Alumno');
    const pares = new Map<string, { alumnoId: string; alergiaId: string }>();
    const poner = (alumnoId: string | null, nombre: string) => { const alergiaId = alId(nombre); if (alumnoId && alumnoIds.has(alumnoId) && alergiaId && !hay.has(`${alumnoId}|${alergiaId}`)) pares.set(`${alumnoId}|${alergiaId}`, { alumnoId, alergiaId }); };
    alumnosAlg.forEach(a => lista(a.alg).forEach(n => poner(a.id, n)));
    const soloCarnet = new Set<string>();
    carnets.forEach(c => json(c.allergies).forEach(n => { const k = `${c.alumnoId}|${alId(n)}`; if (!pares.has(k) && !hay.has(k)) soloCarnet.add(k); poner(c.alumnoId, n); }));
    await paso('AlumnoAlergia <- Alumno.alg (CSV) y ComCarnet.allergies (union: la alergia de un carnet no se pierde)', async () => pares.size, async () => {
      const l = [...pares.values()];
      for (let i = 0; i < l.length; i += 200) await prisma.alumnoAlergia.createMany({ data: l.slice(i, i + 200) });
    });
    if (soloCarnet.size) info('Alergias que estaban SOLO en el carnet (no en Alumno.alg): se agregaron al alumno', soloCarnet.size);
    const hayM = new Set((await filas<{ k: string }>(`SELECT CAST(${q('menuOrden')} AS VARCHAR(10)) AS k FROM ${tbl('AliMenuAlergia')}`.replace('VARCHAR(10)', esSqlServer ? 'VARCHAR(10)' : 'TEXT'))).map(r => r.k));
    const mp = menus.filter(m => !hayM.has(String(Number(m.orden)))).flatMap(m => [...new Set(json(m.algs).map(alId).filter(Boolean) as string[])].map(alergiaId => ({ menuOrden: Number(m.orden), alergiaId })));
    await paso('AliMenuAlergia <- AliMenu.algs (JSON de nombres)', async () => mp.length, async () => { await prisma.aliMenuAlergia.createMany({ data: mp }); });
  }

  // ---- Planes de alimentacion: banderas POSICIONALES -> puentes (posicion i = i-esimo elemento ACTIVO del catalogo ordenado por id; faltantes = false) ----
  if (await tieneCol('AliPlan', 'meals')) {
    const [com, die] = await Promise.all([prisma.comida.findMany({ where: { estado: 'Activo' }, orderBy: { id: 'asc' } }), prisma.dieta.findMany({ where: { estado: 'Activo' }, orderBy: { id: 'asc' } })]);
    const planes = await filas<{ id: string; meals: string; diets: string }>(`SELECT id, meals, diets FROM ${tbl('AliPlan')}`);
    const conPuente = new Set((await filas<{ p: string }>(`SELECT DISTINCT ${q('planId')} AS p FROM ${tbl('AliPlanComida')} UNION SELECT DISTINCT ${q('planId')} FROM ${tbl('AliPlanDieta')}`)).map(r => r.p));
    const pend = planes.filter(p => !conPuente.has(p.id));
    const bool = (j: string) => { try { return (JSON.parse(j) as unknown[]).map(Boolean); } catch { return []; } };
    const sobrantes = pend.filter(p => bool(p.meals).length > com.length || bool(p.diets).length > die.length).length;
    await paso('AliPlanComida / AliPlanDieta <- AliPlan.meals / diets (posicion i = elemento activo i del catalogo; largo menor = false)', async () => pend.length, async () => {
      for (const p of pend) {
        const m = bool(p.meals), d = bool(p.diets);
        await prisma.aliPlanComida.createMany({ data: com.filter((_, i) => m[i]).map(c => ({ planId: p.id, comidaId: c.id })) });
        await prisma.aliPlanDieta.createMany({ data: die.filter((_, i) => d[i]).map(c => ({ planId: p.id, dietaId: c.id })) });
      }
    });
    if (sobrantes) info('Planes con mas banderas que elementos activos en el catalogo (las sobrantes se ignoran)', sobrantes);
    const desalineados = planes.filter(p => bool(p.diets).length !== die.length).length;
    if (desalineados) info(`Planes de alimentacion con banderas desalineadas del catalogo de dietas (${die.length}): se asumio posicion i = dieta i; revisalos en Alimentacion`, desalineados);
  }

  // ---- Finanzas: becas ----
  if (await tieneCol('FinBeca', 'tipo')) {
    const tipos = await prisma.tipoBeca.findMany(), conceptos = await prisma.conceptoBeca.findMany();
    const bs = await filas<{ id: string; tipo: string; regla: string; conceptos: string; tipoBecaId: string | null }>(`SELECT id, tipo, regla, conceptos, ${q('tipoBecaId')} AS ${q('tipoBecaId')} FROM ${tbl('FinBeca')}`);
    const tipoDe = (t: string) => tipos.find(x => sinAcento(x.nombre) === sinAcento(t))?.id ?? tipos.find(x => sinAcento(x.nombre) === sinAcento('Beca ' + t))?.id;
    const concDe = (c: string) => conceptos.find(x => sinAcento(x.nombre) === sinAcento(c))?.id ?? (/^solo\s+colegiatura$/i.test(c.trim()) ? conceptos.find(x => sinAcento(x.nombre) === 'colegiatura')?.id : undefined);
    const pend = bs.filter(b => !b.tipoBecaId);
    const ilegibles = pend.filter(b => !tipoDe(b.tipo) || !parseRegla(b.regla) || b.conceptos.split('·').map(s => s.trim()).filter(Boolean).some(c => !concDe(c)));
    await paso('FinBeca.tipoBecaId / modo / valor <- tipo (nombre), regla («50%», «RD$ 2,000.00»)', async () => pend.length - ilegibles.length, async () => {
      for (const b of pend.filter(x => !ilegibles.includes(x))) { const r = parseRegla(b.regla)!; await ejecutar(`UPDATE ${tbl('FinBeca')} SET ${q('tipoBecaId')} = ?, modo = ?, valor = ? WHERE id = ?`, tipoDe(b.tipo), r.modo, r.valor, b.id); }
    });
    const hayC = new Set((await filas<{ b: string }>(`SELECT DISTINCT ${q('becaId')} AS b FROM ${tbl('FinBecaConcepto')}`)).map(r => r.b));
    const cp = bs.filter(b => !hayC.has(b.id) && !ilegibles.includes(b)).flatMap(b => [...new Set(b.conceptos.split('·').map(s => s.trim()).filter(Boolean).map(concDe) as string[])].map((conceptoId, orden) => ({ becaId: b.id, conceptoId, orden })));
    await paso('FinBecaConcepto <- FinBeca.conceptos (texto separado por « · »)', async () => cp.length, async () => { await prisma.finBecaConcepto.createMany({ data: cp }); });
    if (ilegibles.length) info(`FinBeca con tipo/regla/concepto que no existe en el catalogo o no se interpreta (${ilegibles.slice(0, 3).map(b => `${b.id}:${b.tipo}|${b.regla}`).join(', ')}) -> BLOQUEA db push`, ilegibles.length, 'BLOQUEANTE');
  }
  if (await tieneCol('Contrato', 'beca')) {
    await paso('Contrato.tipoBecaId <- Contrato.beca (id del tipo de beca)', () => cuenta(`SELECT COUNT(*) AS n FROM ${tbl('Contrato')} WHERE ${q('tipoBecaId')} IS NULL AND beca IS NOT NULL AND beca <> '' AND beca IN (SELECT id FROM ${tbl('TipoBeca')})`), async () => {
      await ejecutar(`UPDATE ${tbl('Contrato')} SET ${q('tipoBecaId')} = beca WHERE ${q('tipoBecaId')} IS NULL AND beca IS NOT NULL AND beca <> '' AND beca IN (SELECT id FROM ${tbl('TipoBeca')})`);
    });
    const rotos = await cuenta(`SELECT COUNT(*) AS n FROM ${tbl('Contrato')} WHERE ${q('tipoBecaId')} IS NULL AND beca IS NOT NULL AND beca <> '' AND beca NOT IN (SELECT id FROM ${tbl('TipoBeca')})`);
    if (rotos) info('Contrato.beca apunta a un tipo de beca inexistente -> BLOQUEA (decide: crear el tipo o dejar sin beca)', rotos, 'BLOQUEANTE');
  }

  // ---- Medios de pago: recibos (un solo medio) y ventas ----
  {
    const metodos = await prisma.metodoPago.findMany();
    const porNombre = (n: string) => metodos.find(m => sinAcento(m.nombre) === sinAcento(n))?.id ?? (sinAcento(n) === 'tarjeta' ? metodos.find(m => sinAcento(m.nombre).startsWith('tarjeta de credito'))?.id : undefined);
    const recs = await filas<{ id: string; pays: string; metodoPagoId: string | null }>(`SELECT id, pays, ${q('metodoPagoId')} AS ${q('metodoPagoId')} FROM ${tbl('FinRecibo')}`);
    const pagos = (j: string) => { try { return [...new Set((JSON.parse(j) as { m: string }[]).map(p => p.m))]; } catch { return []; } };
    const unM = recs.filter(r => !r.metodoPagoId && pagos(r.pays).length === 1);
    const res = unM.filter(r => porNombre(pagos(r.pays)[0]));
    await paso('FinRecibo.metodoPagoId <- pays (recibos cobrados con UN solo medio; los mixtos quedan NULL hasta FinReciboPago en la Fase 2C)', async () => res.length, async () => {
      for (const r of res) await ejecutar(`UPDATE ${tbl('FinRecibo')} SET ${q('metodoPagoId')} = ? WHERE id = ?`, porNombre(pagos(r.pays)[0]), r.id);
    });
    const sinMetodo = unM.filter(r => !porNombre(pagos(r.pays)[0]));
    if (sinMetodo.length) info(`FinRecibo con un medio de pago que no existe en el catalogo (${[...new Set(sinMetodo.map(r => pagos(r.pays)[0]))].slice(0, 3).join(', ')}) -> BLOQUEA`, sinMetodo.length, 'BLOQUEANTE');
    const ventas = await filas<{ id: string; metodo: string }>(`SELECT id, metodo FROM ${tbl('FinVenta')} WHERE ${q('metodoPagoId')} IS NULL`);
    const rv = ventas.filter(v => porNombre(v.metodo));
    await paso('FinVenta.metodoPagoId <- metodo (nombre)', async () => rv.length, async () => { for (const v of rv) await ejecutar(`UPDATE ${tbl('FinVenta')} SET ${q('metodoPagoId')} = ? WHERE id = ?`, porNombre(v.metodo), v.id); });
    if (ventas.length > rv.length) info(`FinVenta con un medio de pago que no existe en el catalogo (${ventas.filter(v => !porNombre(v.metodo)).slice(0, 3).map(v => v.metodo).join(', ')}) -> BLOQUEA`, ventas.length - rv.length, 'BLOQUEANTE');
  }

  // ---- Rutas de transporte y categorias de producto ----
  {
    const rutasIds = await ids('RutaTransporte');
    const sv = await filas<{ id: string; catKey: string }>(`SELECT id, ${q('catKey')} AS ${q('catKey')} FROM ${tbl('PersServicio')} WHERE ${q('rutaId')} IS NULL AND ${q('catKey')} LIKE 'rt:%'`);
    const ok = sv.filter(s => rutasIds.has(s.catKey.slice(3)));
    await paso("PersServicio.rutaId <- catKey 'rt:<id>'", async () => ok.length, async () => { for (const s of ok) await ejecutar(`UPDATE ${tbl('PersServicio')} SET ${q('rutaId')} = ? WHERE id = ?`, s.catKey.slice(3), s.id); });
    if (sv.length > ok.length) info("PersServicio con catKey 'rt:' hacia una ruta inexistente -> BLOQUEA", sv.length - ok.length, 'BLOQUEANTE');
  }
  if (await tieneCol('FinProducto', 'cat')) {
    const prods = await filas<{ id: string; cat: string; categoriaId: string | null }>(`SELECT id, cat, ${q('categoriaId')} AS ${q('categoriaId')} FROM ${tbl('FinProducto')}`);
    const cats = [...new Set(prods.map(p => p.cat.trim()).filter(Boolean))];
    const hay = await nombresDe('CategoriaProducto');
    const slug = (n: string) => `cat-${sinAcento(n).replace(/[^a-z0-9]+/g, '-')}`;
    await paso(`CategoriaProducto <- FinProducto.cat (${cats.join(', ')})`, async () => cats.filter(c => !hay.has(sinAcento(c))).length, async () => {
      await prisma.categoriaProducto.createMany({ data: cats.filter(c => !hay.has(sinAcento(c))).map(nombre => ({ id: slug(nombre), nombre })) });
    });
    const sinCat = prods.filter(p => !p.categoriaId && p.cat.trim());
    await paso('FinProducto.categoriaId <- cat', async () => sinCat.length, async () => { for (const p of sinCat) await ejecutar(`UPDATE ${tbl('FinProducto')} SET ${q('categoriaId')} = ? WHERE id = ?`, slug(p.cat.trim()), p.id); });
  }

  // ---- bloqueantes del contraer ----
  if (malos.length) info(`Filas de Catalogo NO migradas por datos invalidos: ${malos.slice(0, 4).join(' | ')}`, malos.length, 'BLOQUEANTE');
  for (const [t, c] of [['FinBeca', 'tipoBecaId'], ['FinBeca', 'modo'], ['FinBeca', 'valor'], ['FinProducto', 'categoriaId'], ['FinVenta', 'metodoPagoId']] as const) {
    if (!(await tieneCol(t, c))) continue;
    const n = await cuenta(`SELECT COUNT(*) AS n FROM ${tbl(t)} WHERE ${q(c)} IS NULL`);
    if (n) info(`${t}.${c} NULL: no se pudo resolver -> BLOQUEA db push (NOT NULL)`, n, 'BLOQUEANTE');
  }
  for (const [t, c, p] of [['Empleado', 'cajaId', 'Caja'], ['FinRecibo', 'cajaId', 'Caja'], ['FinRecibo', 'metodoPagoId', 'MetodoPago'], ['Contrato', 'tipoBecaId', 'TipoBeca'], ['PersServicio', 'rutaId', 'RutaTransporte']] as const) {
    if (!(await tieneCol(t, c))) continue;
    const n = await cuenta(`SELECT COUNT(*) AS n FROM ${tbl(t)} c WHERE c.${q(c)} IS NOT NULL AND c.${q(c)} <> '' AND NOT EXISTS (SELECT 1 FROM ${tbl(p)} p WHERE p.id = c.${q(c)})`);
    if (n) info(`${t}.${c} apunta a ${p} inexistente (huerfano) -> BLOQUEA db push (FK)`, n, 'BLOQUEANTE');
  }
  void opc;
}

/** Tras `db push`: quita de Catalogo los 8 tipos de la Fase 2B ya migrados (solo si cada fila existe en su tabla tipada). */
export async function retirarCatalogo2b(paso: Paso, informe: Informe) {
  if (!(await tablaExiste('Catalogo')) || !(await tablaExiste('Caja')) || (await tieneCol('Alumno', 'alg'))) return;
  for (const t of TIPOS_2B) {
    const filasC = await catalogo(t);
    if (!filasC.length) continue;
    const ids = new Set((await filas<{ id: string }>(`SELECT id FROM ${tbl(TABLA_DE[t])}`)).map(r => r.id));
    const faltan = filasC.filter(f => !ids.has(f.cid));
    if (faltan.length) { informe.push({ paso: `Catalogo ${t}: NO se retira (${faltan.length} fila(s) sin copiar a ${TABLA_DE[t]}: ${faltan.slice(0, 3).map(f => f.cid).join(', ')})`, filas: faltan.length, estado: 'BLOQUEANTE' }); continue; }
    await paso(`Catalogo ${t}: retirar (ya migrado a ${TABLA_DE[t]})`, async () => filasC.length, async () => { await ejecutar(`DELETE FROM ${tbl('Catalogo')} WHERE tipo = ?`, t); });
  }
}
