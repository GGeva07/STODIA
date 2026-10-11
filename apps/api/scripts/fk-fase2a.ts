/**
 * FASE 2A para INSTANCIAS YA EXISTENTES (SQLite o SQL Server): migra el nucleo academico de la tabla generica Catalogo y del texto
 * (Alumno.grado/sec/tanda, AcadHorario.materia ...) a las TABLAS TIPADAS con FK. Lo invoca scripts/fk-reparar.ts con --fase2a (o --auto).
 * Idempotente y SIN BORRAR datos de negocio: nunca inventa. Lo ambiguo se informa y bloquea el `prisma db push` (que endurece NOT NULL/FK).
 *
 * Secuencia (expandir -> rellenar -> contraer):
 *   1. EXPANDIR: crea las tablas nuevas (solo columnas + PK; los indices/FK los crea `db push`) y agrega las columnas NULLables a las existentes.
 *   2. RELLENAR: copia Catalogo -> tablas tipadas con LOS MISMOS ids, enlaza docentes/empleados con su User, materializa las asignaciones que implica
 *      el perfil del docente, mueve las filas `_aula:` del horario a AcadAsignacion.aulaElegidaId, resuelve Alumno.seccionId (grado+letra+tanda por NOMBRE,
 *      creando las secciones que faltan cuando el grado/tanda no son ambiguos) y las FK de nomina, notas, horarios, extras y MobNota.
 *   3. CONTRAER: `prisma db push --accept-data-loss` (NOT NULL, FK, indices; elimina las columnas heredadas ya copiadas).
 *   4. RETIRAR: con las tablas ya contraidas, este mismo paso elimina de Catalogo los tipos academicos migrados (una sola fuente de verdad).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { catalogo, cuenta, ejecutar, esSqlServer, filas, prisma, q, sinAcento, tablaExiste, tbl, tieneCol } from './fk-comun';
import { conClaves, parseCrit, sincronizarAsignaciones, sincronizarPlan } from '../src/lib/catalogos-tipados';
import { gradosDeRango, resolverRefs } from '../src/lib/extras';

export type Paso = (nombre: string, contar: () => Promise<number>, hacer?: () => Promise<void>) => Promise<void>;
export type Informe = { paso: string; filas: number; estado: string }[];
const TIPOS_2A = ['grados', 'tandas', 'aulas', 'secciones', 'materias', 'rubricas', 'docentes', 'staff'];
const TABLAS_NUEVAS = ['Nivel', 'Grado', 'Tanda', 'Aula', 'Seccion', 'Rubrica', 'RubricaCriterio', 'Materia', 'MateriaGrado', 'SeccionMateria', 'Docente', 'Empleado', 'DocenteMateria', 'DocenteSeccion', 'AsignacionAula', 'AcadExtraGrado'];
/** [tabla, columna, tipo SQL Server, tipo SQLite] agregadas NULLables a tablas que ya existen. */
const COLUMNAS_NUEVAS: [string, string, string, string][] = [
  ['Alumno', 'seccionId', 'NVARCHAR(100) NULL', 'TEXT'], ['AcadRoster', 'seccionId', 'NVARCHAR(100) NULL', 'TEXT'], ['AcadNota', 'materiaId', 'NVARCHAR(100) NULL', 'TEXT'],
  ['AcadHorario', 'seccionId', 'NVARCHAR(100) NULL', 'TEXT'], ['AcadHorario', 'materiaId', 'NVARCHAR(100) NULL', 'TEXT'], ['AcadAsignacion', 'aulaElegidaId', 'NVARCHAR(100) NULL', 'TEXT'],
  ['AcadExtra', 'docenteId', 'NVARCHAR(100) NULL', 'TEXT'], ['AcadExtra', 'aulaId', 'NVARCHAR(100) NULL', 'TEXT'], ['MobNota', 'materiaId', 'NVARCHAR(100) NULL', 'TEXT'],
];
const trozos = <T>(l: T[], n = 100) => Array.from({ length: Math.ceil(l.length / n) }, (_, i) => l.slice(i * n, (i + 1) * n));
const orden = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

/** true si la base es anterior a la Fase 2A (existe Alumno y aun tiene el trio de texto o le faltan las tablas tipadas). */
export async function pendiente2a(): Promise<boolean> {
  if (!(await tablaExiste('Alumno'))) return false;
  return (await tieneCol('Alumno', 'grado')) || !(await tablaExiste('Grado'));
}

// ---------- DDL de las tablas nuevas, leido de prisma/schema.prisma ----------
interface Col { nombre: string; sql: string; nulo: boolean; defecto: string | null; autoinc: boolean }
export function leerTabla(modelo: string): { cols: Col[]; pk: string[] } {
  const src = readFileSync(resolve(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8').replace(/\r\n/g, '\n');
  const m = new RegExp(`model ${modelo} \\{([\\s\\S]*?)\\n\\}`).exec(src);
  if (!m) throw new Error(`modelo ${modelo} no encontrado en prisma/schema.prisma`);
  const modelos = new Set([...src.matchAll(/^model (\w+) \{/gm)].map(x => x[1]));
  const cols: Col[] = []; let pk: string[] = [];
  for (const raw of m[1].split('\n')) {
    const l = raw.replace(/\/\/.*$/, '').trim();
    if (!l) continue;
    if (l.startsWith('@@id')) { pk = /\[([^\]]+)\]/.exec(l)![1].split(',').map(s => s.trim()); continue; }
    if (l.startsWith('@@')) continue;
    const t = /^(\w+)\s+(\w+)(\?|\[\])?\s*(.*)$/.exec(l);
    if (!t || t[3] === '[]' || modelos.has(t[2])) continue;
    const [, nombre, tipo, opc, resto] = t;
    const db = /@db\.(\w+)(?:\(([^)]*)\))?/.exec(resto);
    const def = /@default\(("([^"]*)"|[\w.()-]+)\)/.exec(resto);
    let sql: string;
    if (esSqlServer) sql = tipo === 'Int' ? 'INT' : tipo === 'Float' ? 'FLOAT(53)' : tipo === 'Boolean' ? 'BIT' : tipo === 'DateTime' ? 'DATETIME2(3)' : db ? `${db[1].toUpperCase()}${db[2] ? `(${db[2]})` : ''}` : 'NVARCHAR(1000)';
    else sql = tipo === 'Int' ? 'INTEGER' : tipo === 'Float' ? 'REAL' : tipo === 'Boolean' ? 'BOOLEAN' : tipo === 'DateTime' ? 'DATETIME' : 'TEXT';
    let defecto: string | null = null;
    if (def) { if (def[2] !== undefined) defecto = `'${def[2].replace(/'/g, "''")}'`; else if (/^-?\d+(\.\d+)?$/.test(def[1])) defecto = def[1]; else if (def[1] === 'true' || def[1] === 'false') defecto = def[1] === 'true' ? '1' : '0'; }
    if (/@id\b/.test(resto)) pk = [nombre];
    cols.push({ nombre, sql, nulo: opc === '?', defecto, autoinc: /@default\(autoincrement\(\)\)/.test(resto) });
  }
  return { cols, pk };
}
export async function crearTabla(modelo: string) {
  const { cols, pk } = leerTabla(modelo);
  const def = cols.map(c => c.autoinc && esSqlServer ? `${q(c.nombre)} INT IDENTITY(1,1) NOT NULL` : `${q(c.nombre)} ${c.sql} ${c.nulo ? 'NULL' : 'NOT NULL'}${c.defecto !== null ? (esSqlServer ? ` CONSTRAINT ${q(`${modelo}_${c.nombre}_df`)} DEFAULT ${c.defecto}` : ` DEFAULT ${c.defecto}`) : ''}`);
  const k = `CONSTRAINT ${q(`${modelo}_pkey`)} PRIMARY KEY (${pk.map(q).join(', ')})`;
  await ejecutar(`CREATE TABLE ${tbl(modelo)} (${[...def, k].join(', ')})`);
}

export async function expandir2a(paso: Paso) {
  for (const t of TABLAS_NUEVAS) await paso(`FASE 2A ESTRUCTURA: tabla ${t} (nueva)`, async () => ((await tablaExiste(t)) ? 0 : 1), async () => { await crearTabla(t); });
  for (const [t, c, ss, sl] of COLUMNAS_NUEVAS) {
    await paso(`FASE 2A ESTRUCTURA: ${t}.${c} (columna nueva NULLable)`, async () => ((await tablaExiste(t)) && !(await tieneCol(t, c)) ? 1 : 0), async () => {
      await ejecutar(`ALTER TABLE ${tbl(t)} ADD ${esSqlServer ? '' : 'COLUMN '}${q(c)} ${esSqlServer ? ss : sl}`);
    });
  }
  await paso('FASE 2A ESTRUCTURA: AcadAsignacion.heredada (columna nueva, 0 = explicita)', async () => ((await tablaExiste('AcadAsignacion')) && !(await tieneCol('AcadAsignacion', 'heredada')) ? 1 : 0), async () => {
    await ejecutar(esSqlServer ? `ALTER TABLE ${tbl('AcadAsignacion')} ADD ${q('heredada')} BIT NOT NULL CONSTRAINT ${q('AcadAsignacion_heredada_df')} DEFAULT 0` : `ALTER TABLE ${tbl('AcadAsignacion')} ADD COLUMN ${q('heredada')} BOOLEAN NOT NULL DEFAULT 0`);
  });
}

// ---------- RELLENAR ----------
export async function rellenar2a(paso: Paso, informe: Informe, opc: { aplicar: boolean; descartarMobNota: boolean; nivelDefecto?: string }) {
  const info = (p: string, n: number, e = 'informativo') => informe.push({ paso: p, filas: n, estado: e });
  if (!(await tablaExiste('Grado'))) { info('FASE 2A: tablas tipadas aun no existen (ejecuta con --aplicar para expandir)', 0, 'pendiente'); return; }
  const [cg, ct, ca, cs, cm, cr, cd, ce] = await Promise.all(['grados', 'tandas', 'aulas', 'secciones', 'materias', 'rubricas', 'docentes', 'staff'].map(catalogo));

  // --- niveles / grados / tandas / aulas ---
  const NIV = ['Inicial', 'Primaria', 'Secundaria'], nivId = (n: string) => `niv-${sinAcento(n)}`;
  await paso('Nivel: sembrar Inicial / Primaria / Secundaria', async () => 3 - (await cuenta(`SELECT COUNT(*) AS n FROM ${tbl('Nivel')}`)), async () => {
    for (const [i, n] of NIV.entries()) await prisma.nivel.upsert({ where: { id: nivId(n) }, update: {}, create: { id: nivId(n), nombre: n, orden: i + 1 } });
  });
  const ids = async (t: string) => new Set((await filas<{ id: string }>(`SELECT id FROM ${tbl(t)}`)).map(r => r.id));
  const malos: string[] = [];
  {
    const hayG = await ids('Grado'), vistoOrden = new Set((await filas<{ orden: unknown }>(`SELECT orden FROM ${tbl('Grado')}`)).map(r => Number(r.orden))), vistoNom = new Set<string>();
    const filasG = cg.filter(g => !hayG.has(g.cid)).flatMap(g => {
      const nivel = String(g.d.nivel ?? ''), orden = Number(g.d.orden);
      if (!NIV.includes(nivel)) { malos.push(`grado ${g.cid}: nivel «${nivel}» no es Inicial/Primaria/Secundaria`); return []; }
      if (vistoOrden.has(orden) || vistoNom.has(`${nivel}|${g.d.grado}`)) { malos.push(`grado ${g.cid}: orden o (nivel, grado) repetido`); return []; }
      vistoOrden.add(orden); vistoNom.add(`${nivel}|${g.d.grado}`);
      return [{ id: g.cid, nivelId: nivId(nivel), nombre: String(g.d.grado), orden, estado: g.estado }];
    });
    await paso('Grado <- Catalogo grados (mismos ids)', async () => filasG.length, async () => { await prisma.grado.createMany({ data: filasG }); });
    const hayT = await ids('Tanda'), tn = new Set<string>();
    const filasT = ct.filter(t => !hayT.has(t.cid)).flatMap(t => { if (tn.has(sinAcento(String(t.d.nombre)))) { malos.push(`tanda ${t.cid}: nombre repetido`); return []; } tn.add(sinAcento(String(t.d.nombre))); return [{ id: t.cid, nombre: String(t.d.nombre), ini: String(t.d.ini ?? '07:30'), fin: String(t.d.fin ?? '12:30'), estado: t.estado }]; });
    await paso('Tanda <- Catalogo tandas', async () => filasT.length, async () => { await prisma.tanda.createMany({ data: filasT }); });
    const hayA = await ids('Aula'), an = new Set<string>();
    const filasA = ca.filter(a => !hayA.has(a.cid)).flatMap(a => { if (an.has(sinAcento(String(a.d.nombre)))) { malos.push(`aula ${a.cid}: nombre repetido`); return []; } an.add(sinAcento(String(a.d.nombre))); return [{ id: a.cid, nombre: String(a.d.nombre), tipo: String(a.d.tipo ?? 'Aula'), edificio: String(a.d.edif ?? ''), pupitres: Number(a.d.pupitres) || 0, estado: a.estado }]; });
    await paso('Aula <- Catalogo aulas', async () => filasA.length, async () => { await prisma.aula.createMany({ data: filasA }); });
  }
  // --- secciones ---
  const gIds = new Set([...(await ids('Grado')), ...(opc.aplicar ? [] : cg.map(g => g.cid))]), tIds = new Set([...(await ids('Tanda')), ...(opc.aplicar ? [] : ct.map(t => t.cid))]), aIds = new Set([...(await ids('Aula')), ...(opc.aplicar ? [] : ca.map(a => a.cid))]);
  {
    const hayS = await ids('Seccion'), vistas = new Set((await filas<{ g: string; l: string; t: string }>(`SELECT ${q('gradoId')} AS g, letra AS l, ${q('tandaId')} AS t FROM ${tbl('Seccion')}`)).map(r => `${r.g}|${r.l.toUpperCase()}|${r.t}`));
    const filasS = cs.filter(s => !hayS.has(s.cid)).flatMap(s => {
      const k = `${s.d.grado}|${String(s.d.seccion).toUpperCase()}|${s.d.tanda}`;
      if (!gIds.has(String(s.d.grado)) || !tIds.has(String(s.d.tanda))) { malos.push(`seccion ${s.cid}: grado o tanda inexistente`); return []; }
      if (vistas.has(k)) { malos.push(`seccion ${s.cid}: (grado, letra, tanda) repetida`); return []; }
      vistas.add(k);
      return [{ id: s.cid, gradoId: String(s.d.grado), letra: String(s.d.seccion), tandaId: String(s.d.tanda), aulaBaseId: s.d.aula && aIds.has(String(s.d.aula)) ? String(s.d.aula) : null, cap: Number(s.d.cap) || 30, estado: s.estado }];
    });
    await paso('Seccion <- Catalogo secciones (mismos ids)', async () => filasS.length, async () => { for (const c of trozos(filasS)) await prisma.seccion.createMany({ data: c }); });
  }
  // --- alumnos: seccion por NOMBRE (grado + letra + tanda); se crean las secciones que faltan si grado y tanda son inequivocos ---
  if (await tieneCol('Alumno', 'grado')) {
    const grs = await prisma.grado.findMany(), tds = await prisma.tanda.findMany(), secs = await prisma.seccion.findMany();
    const clave = (g: string, l: string, t: string) => `${g}|${l.toUpperCase()}|${t}`;
    const secDe = new Map<string, string[]>();
    for (const s of secs) { const k = clave(grs.find(g => g.id === s.gradoId)!.nombre, s.letra, tds.find(t => t.id === s.tandaId)!.nombre); secDe.set(k, [...(secDe.get(k) ?? []), s.id]); }
    const als = await filas<{ id: string; grado: string; sec: string; tanda: string; seccionId: string | null }>(`SELECT id, grado, sec, tanda, ${q('seccionId')} AS ${q('seccionId')} FROM ${tbl('Alumno')}`);
    const faltan = new Map<string, { g: string; l: string; t: string }>();
    const ambiguas = new Set<string>();
    for (const a of als.filter(x => !x.seccionId)) {
      const k = clave(a.grado, a.sec, a.tanda);
      let c = secDe.get(k) ?? [];
      // Decision EXPLICITA del operador (--nivel-por-defecto=Primaria): desambigua un nombre de grado que existe en varios niveles.
      if (c.length > 1 && opc.nivelDefecto) { const pref = c.filter(id => grs.find(g => g.id === secs.find(s => s.id === id)!.gradoId)?.nivelId === nivId(opc.nivelDefecto!)); if (pref.length === 1) c = pref; }
      if (c.length === 1) { if ((secDe.get(k) ?? []).length > 1) secDe.set(k, c); continue; }
      if (c.length > 1) { ambiguas.add(`${a.grado} ${a.sec} · ${a.tanda}`); continue; }
      let gg = grs.filter(g => g.nombre === a.grado);
      if (gg.length > 1 && opc.nivelDefecto) gg = gg.filter(g => g.nivelId === nivId(opc.nivelDefecto!));
      const tt = tds.filter(t => t.nombre === a.tanda);
      if (gg.length === 1 && tt.length === 1) faltan.set(k, { g: gg[0].id, l: a.sec, t: tt[0].id }); else ambiguas.add(`${a.grado} ${a.sec} · ${a.tanda}`);
    }
    await paso(`Seccion: crear las ${faltan.size} que tienen alumnos y no existian (${[...faltan.keys()].slice(0, 3).join(', ')})`, async () => faltan.size, async () => {
      for (const v of faltan.values()) { const id = `sx-${v.g}-${v.l}-${v.t}`; await prisma.seccion.create({ data: { id, gradoId: v.g, letra: v.l, tandaId: v.t, cap: 30, estado: 'Activo' } }); }
    });
    if (opc.aplicar) for (const s of await prisma.seccion.findMany()) { const k = clave(grs.find(g => g.id === s.gradoId)!.nombre, s.letra, tds.find(t => t.id === s.tandaId)!.nombre); secDe.set(k, [...new Set([...(secDe.get(k) ?? []), s.id])]); }
    const res = als.filter(a => !a.seccionId && (secDe.get(clave(a.grado, a.sec, a.tanda)) ?? []).length === 1);
    await paso('Alumno.seccionId <- seccion por (grado, letra, tanda)', async () => res.length, async () => {
      for (const a of res) await ejecutar(`UPDATE ${tbl('Alumno')} SET ${q('seccionId')} = ? WHERE id = ?`, secDe.get(clave(a.grado, a.sec, a.tanda))![0], a.id);
    });
    if (ambiguas.size) info(`Alumno con seccion AMBIGUA (el grado/tanda existe en varios niveles o la seccion se repite): ${[...ambiguas].slice(0, 4).join(', ')} -> BLOQUEA db push, resuelve a mano`, ambiguas.size, 'BLOQUEANTE');
  }
  // --- materias / rubricas ---
  const mIds = await ids('Materia');
  {
    const cod = new Set((await filas<{ c: string }>(`SELECT codigo AS c FROM ${tbl('Materia')}`)).map(r => sinAcento(r.c)));
    const nuevas = cm.filter(m => !mIds.has(m.cid)).flatMap(m => { const c = sinAcento(String(m.d.codigo)); if (cod.has(c)) { malos.push(`materia ${m.cid}: codigo repetido`); return []; } cod.add(c); return [{ id: m.cid, codigo: String(m.d.codigo), nombre: String(m.d.nombre), horas: Number(m.d.horas) || 0, estado: m.estado }]; });
    await paso('Materia <- Catalogo materias', async () => nuevas.length, async () => { await prisma.materia.createMany({ data: nuevas }); });
    const mg = new Set((await filas<{ m: string; g: string }>(`SELECT ${q('materiaId')} AS m, ${q('gradoId')} AS g FROM ${tbl('MateriaGrado')}`)).map(r => `${r.m}|${r.g}`));
    const lm = new Set([...mIds, ...nuevas.map(n => n.id)]);
    const puentes = cm.flatMap(m => ((m.d.grados ?? []) as string[]).filter(g => gIds.has(g) && (lm.has(m.cid) || opc.aplicar) && !mg.has(`${m.cid}|${g}`)).map(g => ({ materiaId: m.cid, gradoId: g })));
    await paso('MateriaGrado <- materias.grados[]', async () => puentes.length, async () => { await prisma.materiaGrado.createMany({ data: puentes }); });
    const rIds = await ids('Rubrica'), rn = new Set((await filas<{ n: string }>(`SELECT nombre AS n FROM ${tbl('Rubrica')}`)).map(r => sinAcento(r.n)));
    const rs = cr.filter(r => !rIds.has(r.cid)).flatMap(r => { if (rn.has(sinAcento(String(r.d.nombre)))) { malos.push(`rubrica ${r.cid}: nombre repetido`); return []; } rn.add(sinAcento(String(r.d.nombre))); return [r]; });
    await paso('Rubrica / RubricaCriterio <- Catalogo rubricas (criterios parseados, claves C1-C4/EX)', async () => rs.length, async () => {
      for (const r of rs) {
        await prisma.rubrica.create({ data: { id: r.cid, nombre: String(r.d.nombre), escala: String(r.d.escala ?? ''), minimo: Number(r.d.minimo) || 70, estado: r.estado } });
        const cs2 = parseCrit(String(r.d.crit ?? ''));
        if (cs2) await prisma.rubricaCriterio.createMany({ data: conClaves(cs2).map(c => ({ rubricaId: r.cid, ...c })) }); else malos.push(`rubrica ${r.cid}: criterios no interpretables («${r.d.crit}»)`);
      }
    });
    // Materia.rubricaId: la primera rubrica ACTIVA que la cubre (misma regla de rubricaDe); las demas coincidencias se informan.
    const lista = (await prisma.materia.findMany({ select: { id: true, rubricaId: true } })).filter(m => !m.rubricaId);
    const asignar = new Map<string, string>(), choques: string[] = [];
    for (const r of [...cr].sort((a, b) => orden(a.cid, b.cid))) for (const mid of (r.d.materias ?? []) as string[]) {
      if (!lista.some(m => m.id === mid)) continue;
      if (r.estado !== 'Activo') continue;
      if (asignar.has(mid)) choques.push(`${mid}: ${asignar.get(mid)} y ${r.cid}`); else asignar.set(mid, r.cid);
    }
    await paso('Materia.rubricaId <- rubricas.materias[] (primera rubrica activa)', async () => asignar.size, async () => { for (const [m, r] of asignar) await prisma.materia.update({ where: { id: m }, data: { rubricaId: r } }); });
    if (choques.length) info(`Materias cubiertas por MAS de una rubrica activa (se uso la primera): ${choques.slice(0, 3).join('; ')}`, choques.length);
  }
  // --- docentes / empleados ---
  {
    const users = await filas<{ id: string; usuario: string; nombre: string; rol: string }>(`SELECT id, usuario, nombre, rol FROM ${tbl('User')}`);
    const dueno = new Set<string>([...(await filas<{ u: string }>(`SELECT ${q('userId')} AS u FROM ${tbl('Docente')} WHERE ${q('userId')} IS NOT NULL`)), ...(await filas<{ u: string }>(`SELECT ${q('userId')} AS u FROM ${tbl('Empleado')} WHERE ${q('userId')} IS NOT NULL`))].map(r => r.u));
    const enlazar = (r: { d: Record<string, any> }) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const u = users.find(x => !dueno.has(x.id) && x.usuario === r.d.usuario) ?? users.find(x => !dueno.has(x.id) && x.rol !== 'Tutor' && sinAcento(x.nombre) === sinAcento(String(r.d.nombre)));
      if (u) dueno.add(u.id);
      return u ?? null;
    };
    const dIds = await ids('Docente'), ced = new Set((await filas<{ c: string }>(`SELECT cedula AS c FROM ${tbl('Docente')}`)).map(r => r.c));
    const usados = new Set<string>();
    const nd = cd.filter(d => !dIds.has(d.cid)).flatMap(d => {
      if (ced.has(String(d.d.cedula))) { malos.push(`docente ${d.cid}: cedula repetida`); return []; }
      ced.add(String(d.d.cedula));
      const u = enlazar(d); let usuario: string | null = u ? null : String(d.d.usuario ?? '') || null;
      if (usuario && usados.has(usuario)) { malos.push(`docente ${d.cid}: usuario propuesto repetido (queda sin usuario)`); usuario = null; }
      if (usuario) usados.add(usuario);
      return [{ id: d.cid, nombre: String(d.d.nombre), cedula: String(d.d.cedula), esp: String(d.d.esp ?? ''), email: String(d.d.email ?? ''), tel: String(d.d.tel ?? ''), usuario, rol: u?.rol ?? String(d.d.rol ?? 'Docente'), userId: u?.id ?? null, estado: d.estado }];
    });
    await paso('Docente <- Catalogo docentes (cuenta enlazada por usuario o nombre)', async () => nd.length, async () => { await prisma.docente.createMany({ data: nd }); });
    const eIds = await ids('Empleado');
    const ne = ce.filter(e => !eIds.has(e.cid)).flatMap(e => {
      const u = enlazar(e); let usuario: string | null = u ? null : String(e.d.usuario ?? '') || null;
      if (usuario && usados.has(usuario)) { malos.push(`empleado ${e.cid}: usuario propuesto repetido`); usuario = null; }
      if (usuario) usados.add(usuario);
      return [{ id: e.cid, nombre: String(e.d.nombre), cargo: String(e.d.cargo ?? ''), usuario, rol: u?.rol ?? String(e.d.rol ?? 'Cajero'), userId: u?.id ?? null, cajaId: e.d.caja ? String(e.d.caja) : null, tel: String(e.d.tel ?? ''), email: String(e.d.email ?? ''), estado: e.estado }];
    });
    await paso('Empleado <- Catalogo staff', async () => ne.length, async () => { await prisma.empleado.createMany({ data: ne }); });
    const lm = new Set((await prisma.materia.findMany({ select: { id: true } })).map(m => m.id)), ls = new Set((await prisma.seccion.findMany({ select: { id: true } })).map(s => s.id));
    const dm = new Set((await filas<{ d: string; m: string }>(`SELECT ${q('docenteId')} AS d, ${q('materiaId')} AS m FROM ${tbl('DocenteMateria')}`)).map(r => `${r.d}|${r.m}`));
    const ds = new Set((await filas<{ d: string; s: string }>(`SELECT ${q('docenteId')} AS d, ${q('seccionId')} AS s FROM ${tbl('DocenteSeccion')}`)).map(r => `${r.d}|${r.s}`));
    const losDocentes = new Set([...(await ids('Docente')), ...(opc.aplicar ? nd.map(d => d.id) : [])]);
    const pm = cd.filter(d => losDocentes.has(d.cid)).flatMap(d => ((d.d.materias ?? []) as string[]).filter(m => lm.has(m) && !dm.has(`${d.cid}|${m}`)).map(m => ({ docenteId: d.cid, materiaId: m })));
    const ps = cd.filter(d => losDocentes.has(d.cid)).flatMap(d => ((d.d.secciones ?? []) as string[]).filter(s => ls.has(s) && !ds.has(`${d.cid}|${s}`)).map(s => ({ docenteId: d.cid, seccionId: s })));
    await paso('DocenteMateria / DocenteSeccion <- docentes.materias[] / secciones[]', async () => pm.length + ps.length, async () => { await prisma.docenteMateria.createMany({ data: pm }); await prisma.docenteSeccion.createMany({ data: ps }); });
    const sobran = cd.flatMap(d => [...((d.d.materias ?? []) as string[]).filter(m => !lm.has(m)).map(m => `${d.cid}:${m}`), ...((d.d.secciones ?? []) as string[]).filter(s => !ls.has(s)).map(s => `${d.cid}:${s}`)]);
    if (sobran.length) info(`Referencias de docentes a materias/secciones inexistentes (se omiten): ${sobran.slice(0, 4).join(', ')}`, sobran.length);
  }
  // --- asignaciones, horarios, nomina, notas ---
  if (await tieneCol('AcadAsignacion', 'aulas')) {
    const asg = await filas<{ id: string; aulas: string }>(`SELECT id, aulas FROM ${tbl('AcadAsignacion')}`);
    const hay = new Set((await filas<{ a: string }>(`SELECT DISTINCT ${q('asignacionId')} AS a FROM ${tbl('AsignacionAula')}`)).map(r => r.a));
    const nuevas = asg.filter(a => !hay.has(a.id)).flatMap(a => { try { return (JSON.parse(a.aulas) as string[]).filter((x, i, l) => aIds.has(x) && l.indexOf(x) === i).map((aulaId, o) => ({ asignacionId: a.id, aulaId, orden: o })); } catch { return []; } });
    await paso('AsignacionAula <- AcadAsignacion.aulas (JSON)', async () => nuevas.length, async () => { for (const c of trozos(nuevas)) await prisma.asignacionAula.createMany({ data: c }); });
  }
  if (await tieneCol('AcadHorario', 'materia')) {
    const el = await filas<{ id: string; seccion: string; slot: string; materia: string }>(`SELECT id, seccion, slot, materia FROM ${tbl('AcadHorario')} WHERE slot LIKE '!_aula:%' ESCAPE '!'`);
    await paso('AcadAsignacion.aulaElegidaId <- filas `_aula:` del horario (las filas se eliminan)', async () => el.length, async () => {
      for (const f of el) {
        const mid = f.slot.slice('_aula:'.length);
        if (aIds.has(f.materia)) await ejecutar(`UPDATE ${tbl('AcadAsignacion')} SET ${q('aulaElegidaId')} = ? WHERE ${q('seccionId')} = ? AND ${q('materiaId')} = ? AND ${q('aulaElegidaId')} IS NULL`, f.materia, f.seccion, mid);
        await ejecutar(`DELETE FROM ${tbl('AcadHorario')} WHERE id = ?`, f.id);
      }
    });
    await paso('AcadHorario.seccionId / materiaId <- seccion / materia', () => cuenta(`SELECT COUNT(*) AS n FROM ${tbl('AcadHorario')} WHERE ${q('seccionId')} IS NULL OR ${q('materiaId')} IS NULL`), async () => {
      await ejecutar(`UPDATE ${tbl('AcadHorario')} SET ${q('seccionId')} = seccion, ${q('materiaId')} = materia WHERE ${q('seccionId')} IS NULL OR ${q('materiaId')} IS NULL`);
    });
  }
  if (await tieneCol('AcadRoster', 'seccion')) await paso('AcadRoster.seccionId <- seccion', () => cuenta(`SELECT COUNT(*) AS n FROM ${tbl('AcadRoster')} WHERE ${q('seccionId')} IS NULL`), async () => { await ejecutar(`UPDATE ${tbl('AcadRoster')} SET ${q('seccionId')} = seccion WHERE ${q('seccionId')} IS NULL`); });
  if (await tieneCol('AcadNota', 'materia')) await paso('AcadNota.materiaId <- materia', () => cuenta(`SELECT COUNT(*) AS n FROM ${tbl('AcadNota')} WHERE ${q('materiaId')} IS NULL`), async () => { await ejecutar(`UPDATE ${tbl('AcadNota')} SET ${q('materiaId')} = materia WHERE ${q('materiaId')} IS NULL`); });
  // asignaciones implicitas del perfil del docente -> filas heredadas (solo la primera vez: si ya hay filas heredadas se asume hecho)
  await paso('AcadAsignacion: materializar las asignaciones del perfil del docente (heredada = 1; requiere la Fase 2C expandida: ciclo activo)', async () => !(await tablaExiste('Ciclo')) ? 0 : (await cuenta(`SELECT COUNT(*) AS n FROM ${tbl('AcadAsignacion')} WHERE ${q('heredada')} = 1`)) ? 0 : await cuenta(`SELECT COUNT(*) AS n FROM ${tbl('DocenteSeccion')}`), async () => {
    // La columna heredada `aulas` es NOT NULL sin DEFAULT en SQL Server: se le pone un DEFAULT temporal mientras el cliente nuevo inserta filas sin ella.
    const tmp = esSqlServer && (await tieneCol('AcadAsignacion', 'aulas')) && !(await filas(`SELECT 1 AS x FROM sys.default_constraints dc JOIN sys.columns c ON c.default_object_id = dc.object_id WHERE dc.parent_object_id = OBJECT_ID('dbo.AcadAsignacion') AND c.name = 'aulas'`)).length;
    if (tmp) await ejecutar(`ALTER TABLE ${tbl('AcadAsignacion')} ADD CONSTRAINT ${q('AcadAsignacion_aulas_tmp')} DEFAULT '[]' FOR ${q('aulas')}`);
    try { for (const d of (await prisma.docente.findMany({ select: { id: true }, orderBy: { id: 'asc' } }))) await sincronizarAsignaciones(prisma, d.id); }
    finally { if (tmp) await ejecutar(`ALTER TABLE ${tbl('AcadAsignacion')} DROP CONSTRAINT ${q('AcadAsignacion_aulas_tmp')}`); }
  });
  await paso('SeccionMateria <- plan de estudios (materias por grado de cada seccion)', async () => (await cuenta(`SELECT COUNT(*) AS n FROM ${tbl('SeccionMateria')}`)) ? 0 : 1, async () => { await sincronizarPlan(prisma); });
  // --- extracurriculares ---
  if (await tieneCol('AcadExtra', 'grados')) {
    const ex = await filas<{ id: string; instructor: string; lugar: string; grados: string; docenteId: string | null; aulaId: string | null }>(`SELECT id, instructor, lugar, grados, ${q('docenteId')} AS ${q('docenteId')}, ${q('aulaId')} AS ${q('aulaId')} FROM ${tbl('AcadExtra')}`);
    const conG = new Set((await filas<{ e: string }>(`SELECT DISTINCT ${q('extraId')} AS e FROM ${tbl('AcadExtraGrado')}`)).map(r => r.e));
    await paso('AcadExtra.docenteId / aulaId <- instructor / lugar (solo si coinciden con UN docente / aula)', async () => ex.filter(e => !e.docenteId && !e.aulaId).length, async () => {
      for (const e of ex.filter(x => !x.docenteId && !x.aulaId)) { const r = await resolverRefs(prisma, e.instructor, e.lugar); await ejecutar(`UPDATE ${tbl('AcadExtra')} SET ${q('docenteId')} = ?, ${q('aulaId')} = ? WHERE id = ?`, r.docenteId, r.aulaId, e.id); }
    });
    let sin = 0;
    const nuevos: { extraId: string; gradoId: string }[] = [];
    for (const e of ex.filter(x => !conG.has(x.id))) { const g = await gradosDeRango(prisma, e.grados); if (g) nuevos.push(...g.map(gradoId => ({ extraId: e.id, gradoId }))); else sin++; }
    await paso('AcadExtraGrado <- AcadExtra.grados ("4to – 6to", "1ro – 3ro Sec.")', async () => nuevos.length, async () => { await prisma.acadExtraGrado.createMany({ data: nuevos }); });
    if (sin) info('Actividades extracurriculares con grados no interpretables (quedan sin grados; editalas en Extracurriculares)', sin);
  }
  // --- MobNota (materia por NOMBRE) ---
  if (await tieneCol('MobNota', 'materia')) {
    const ms = await prisma.materia.findMany({ select: { id: true, nombre: true } });
    const ns = await filas<{ id: string; materia: string }>(`SELECT id, materia FROM ${tbl('MobNota')} WHERE ${q('materiaId')} IS NULL`);
    const un = (n: string) => { const c = ms.filter(m => sinAcento(m.nombre) === sinAcento(n)); return c.length === 1 ? c[0].id : null; };
    await paso('MobNota.materiaId <- materia por nombre exacto y unico', async () => ns.filter(n => un(n.materia)).length, async () => { for (const n of ns.filter(x => un(x.materia))) await ejecutar(`UPDATE ${tbl('MobNota')} SET ${q('materiaId')} = ? WHERE id = ?`, un(n.materia), n.id); });
    const sinRes = ns.filter(n => !un(n.materia));
    if (sinRes.length && opc.descartarMobNota) await paso(`MobNota: descartar ${sinRes.length} nota(s) demostrativas del portal sin materia resoluble (${[...new Set(sinRes.map(n => n.materia))].join(', ')})`, async () => sinRes.length, async () => { for (const n of sinRes) await ejecutar(`DELETE FROM ${tbl('MobNota')} WHERE id = ?`, n.id); });
    else if (sinRes.length) info(`MobNota sin materia resoluble (${[...new Set(sinRes.map(n => n.materia))].join(', ')}) -> BLOQUEA db push; usa --descartar-mobnota (son notas demostrativas del portal) o corrige el nombre`, sinRes.length, 'BLOQUEANTE');
  }
  if (malos.length) info(`Filas de Catalogo NO migradas por datos invalidos: ${malos.slice(0, 4).join(' | ')}`, malos.length, 'BLOQUEANTE');

  // --- bloqueantes del contraer ---
  for (const [t, c] of [['Alumno', 'seccionId'], ['AcadRoster', 'seccionId'], ['AcadNota', 'materiaId'], ['AcadHorario', 'seccionId'], ['AcadHorario', 'materiaId'], ['MobNota', 'materiaId']] as const) {
    if (!(await tieneCol(t, c))) continue;
    const n = await cuenta(`SELECT COUNT(*) AS n FROM ${tbl(t)} WHERE ${q(c)} IS NULL`);
    if (n) info(`${t}.${c} NULL: no se pudo resolver -> BLOQUEA db push (NOT NULL)`, n, 'BLOQUEANTE');
  }
  for (const [t, c, p] of [['AcadRoster', 'seccionId', 'Seccion'], ['AcadNota', 'materiaId', 'Materia'], ['AcadHorario', 'seccionId', 'Seccion'], ['AcadHorario', 'materiaId', 'Materia'], ['AcadAsignacion', 'docenteId', 'Docente'], ['AcadAsignacion', 'seccionId', 'Seccion'], ['AcadAsignacion', 'materiaId', 'Materia']] as const) {
    if (!(await tieneCol(t, c))) continue;
    const n = await cuenta(`SELECT COUNT(*) AS n FROM ${tbl(t)} c WHERE c.${q(c)} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${tbl(p)} p WHERE p.id = c.${q(c)})`);
    if (n) info(`${t}.${c} apunta a ${p} inexistente (huerfano) -> BLOQUEA db push (FK)`, n, 'BLOQUEANTE');
  }
}

/** Tras `db push`: quita de Catalogo los tipos academicos ya migrados (solo si cada fila existe en su tabla tipada). */
export async function retirarCatalogo2a(paso: Paso, informe: Informe) {
  if (!(await tablaExiste('Catalogo')) || !(await tablaExiste('Grado')) || (await tieneCol('Alumno', 'grado'))) return;
  const tabla: Record<string, string> = { grados: 'Grado', tandas: 'Tanda', aulas: 'Aula', secciones: 'Seccion', materias: 'Materia', rubricas: 'Rubrica', docentes: 'Docente', staff: 'Empleado' };
  for (const t of TIPOS_2A) {
    const filasC = await catalogo(t);
    if (!filasC.length) continue;
    const ids = new Set((await filas<{ id: string }>(`SELECT id FROM ${tbl(tabla[t])}`)).map(r => r.id));
    const faltan = filasC.filter(f => !ids.has(f.cid));
    if (faltan.length) { informe.push({ paso: `Catalogo ${t}: NO se retira (${faltan.length} fila(s) sin copiar a ${tabla[t]}: ${faltan.slice(0, 3).map(f => f.cid).join(', ')})`, filas: faltan.length, estado: 'BLOQUEANTE' }); continue; }
    await paso(`Catalogo ${t}: retirar (ya migrado a ${tabla[t]})`, async () => filasC.length, async () => { await ejecutar(`DELETE FROM ${tbl('Catalogo')} WHERE tipo = ?`, t); });
  }
}
