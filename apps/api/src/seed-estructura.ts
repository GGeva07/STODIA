/**
 * SOLO DEMO (SEED_DEMO=true). Estructura académica base de la demo en las tablas TIPADAS (Fase 2A): grados, tandas, aulas, materias, secciones,
 * rúbricas, docentes y empleados del prototipo (CAT_SEED) con los ajustes que usa la grilla de horarios (antes parches de seed-academico) y, desde la
 * Fase 2B, los demás catálogos tipados (cajas, rutas, tipos y conceptos de beca, medios de pago, dietas, alergias): todos son FK de tablas posteriores.
 * Debe ejecutarse ANTES de sembrar alumnos: Alumno.seccionId es una FK a Seccion. Idempotente y ADITIVO (solo crea los ids que faltan).
 */
import { prisma } from './db';
import { CAT_SEED, norm, type CatRow } from './seed-data';
import { guardarTipo, leerTipo, sincronizarPlan, type Row, type TipoTipado } from './lib/catalogos-tipados';
import { ALERGIAS, BECAS as BECAS_DEMO, CAJAS, CONCEPTOS_BECA, DIETAS, METODOS, RUTAS } from './seed-catalogos';

const PRIM = ['g2', 'g3', 'g4', 'g5', 'g6', 'g7'];
const copia = (rows: CatRow[]): Row[] => rows.map(r => ({ estado: 'Activo', ...r }) as Row);
const parche = (rows: Row[], id: string, p: Record<string, unknown>) => { const r = rows.find(x => x.id === id); if (r) Object.assign(r, p); };

// Secciones de la demo que usa la grilla de horarios y el Directorio de muestra: [id, grado, letra, tanda, aula].
//  s11 (3ro B Matutina) y s12 (4to C Matutina): sus alumnos (0398/0566 y 0558) pertenecen a ellas.
//  s13 (1ro Primaria A Extendida): la alumna 0501 (6 años) estaba enlazada por TEXTO a «1ro A Extendida» de SECUNDARIA (s5); '1ro' existe en dos niveles.
const SEC: [string, string, string, string, string][] = [
  ['s6', 'g7', 'B', 't2', 'a4'], ['s7', 'g5', 'B', 't1', 'a4'], ['s8', 'g4', 'A', 't2', 'a4'], ['s9', 'g3', 'A', 't3', 'a4'], ['s10', 'g3', 'B', 't1', 'a4'],
  ['s11', 'g4', 'B', 't1', 'a3'], ['s12', 'g5', 'C', 't1', 'a3'], ['s13', 'g2', 'A', 't3', 'a1'],
];
// Tipos de beca de la demo con porcentaje fijo (antes los sembraba seed-personas); b1 «Deportiva» (monto fijo) viene de CAT_SEED.
const BECAS_PCT: [string, string, number, boolean][] = [['hermano', 'Beca Plan Hermano', 10, false], ['academica', 'Beca Académica', 25, true], ['empleado', 'Hijo de Empleado', 50, true]];
// Medios de pago base (antes los sembraba seed-finanzas).
const METODOS_BASE: [string, string, string | null][] = [['m1', 'Efectivo', null], ['m2', 'Tarjeta de Crédito', 'Autorización'], ['m3', 'Tarjeta de Débito', 'Autorización'], ['m4', 'Transferencia', 'Ref. bancaria'], ['m5', 'Cheque', 'No. cheque']];
const DOC: [string, string, string, string, string][] = [
  ['d5', 'Carmen Vidal', 'Lengua Española', 'usr_cvidal', 'Director Académico'], ['d6', 'Kevin Smith', 'Inglés', 'usr_smith', 'Docente'], ['d7', 'Luisa Batista', 'Ciencias Naturales', 'usr_batista', 'Docente'],
  ['d8', 'Juan Marte', 'Ciencias Sociales', 'usr_marte', 'Docente'], ['d9', 'José Cruz', 'Educación Física', 'usr_cruz', 'Docente'], ['d10', 'Mariana Rosario', 'Educación Artística', 'usr_mrosario', 'Docente'],
];

export async function seedEstructura(): Promise<void> {
  const t0 = Date.now();
  const grados = copia(CAT_SEED.grados), tandas = copia(CAT_SEED.tandas), aulas = copia(CAT_SEED.aulas), materias = copia(CAT_SEED.materias);
  const secciones = copia(CAT_SEED.secciones), rubricas = copia(CAT_SEED.rubricas), docentes = copia(CAT_SEED.docentes), staff = copia(CAT_SEED.staff);

  parche(aulas, 'a2', { nombre: 'Aula 14', pupitres: 32 }); parche(aulas, 'a5', { nombre: 'Lab. Ciencias', pupitres: 30 });
  parche(aulas, 'a6', { nombre: 'Cancha', pupitres: 80 }); parche(aulas, 'a7', { nombre: 'Sala Audiovisual', pupitres: 25 });
  parche(materias, 'm1', { grados: PRIM, horas: 5 }); parche(materias, 'm2', { grados: PRIM, horas: 5 }); parche(materias, 'm3', { nombre: 'Ciencias Naturales', grados: PRIM, horas: 3 });
  parche(materias, 'm4', { grados: PRIM, horas: 3 }); parche(materias, 'm5', { grados: [...PRIM, 'g8'], horas: 4 }); parche(materias, 'm6', { grados: PRIM, horas: 2 });
  materias.push({ id: 'm7', estado: 'Activo', codigo: 'ART-01', nombre: 'Ed. Artística', grados: PRIM, horas: 2 });
  parche(rubricas, 'r1', { materias: ['m1', 'm2', 'm3', 'm4', 'm5', 'm7'], crit: 'Razonamiento 17.5%, Comunicación 17.5%, Modelación 17.5%, Resolución 17.5%, Examen 30%' });
  parche(secciones, 's2', { aula: 'a3' });
  for (const [id, grado, seccion, tanda, aula] of SEC) secciones.push({ id, estado: 'Activo', grado, seccion, tanda, aula, cap: 30 });
  DOC.forEach(([id, nombre, esp, usuario, rol], i) => docentes.push({
    id, estado: 'Activo', nombre, cedula: '001-' + String(5678901 + i * 1117).padStart(7, '0') + '-' + (i % 9), esp, email: usuario.replace('usr_', '') + '@lospinos.edu.do', usuario, rol, materias: [], secciones: [],
  }));

  // Cuentas de login ya sembradas (SEED_USERS): se enlazan al docente/empleado por usuario o, si no, por nombre (cada cuenta a lo sumo a un registro).
  const users = await prisma.user.findMany(), dueno = new Set<string>();
  const enlazar = (r: Row) => {
    const u = users.find(x => !dueno.has(x.id) && x.usuario === r.usuario) ?? users.find(x => !dueno.has(x.id) && x.rol !== 'Tutor' && norm(x.nombre) === norm(String(r.nombre)));
    if (u) { dueno.add(u.id); r.userId = u.id; r.usuario = u.usuario; r.rol = u.rol; }
  };
  docentes.forEach(enlazar); staff.forEach(enlazar);

  // Fase 2B: catálogos referenciados por FK (cajas antes que el personal; todos antes que alumnos, recibos y becas).
  const cajas = copia([...CAT_SEED.cajas, ...(CAJAS as CatRow[])]), conceptos = copia([...CAT_SEED.conceptosBeca, ...(CONCEPTOS_BECA as CatRow[])]);
  const rutas = copia([...CAT_SEED.rutas, ...(RUTAS as CatRow[])]);
  parche(rutas, 'r1', { tarifa: 2800 }); parche(rutas, 'r2', { tarifa: 3100 }); // tarifas del prototipo
  const becas = copia([...CAT_SEED.becas, ...BECAS_PCT.map(([id, nombre, pct, aprobacion]) => ({ id, nombre, pct, aprobacion })), ...(BECAS_DEMO as CatRow[])]);
  const metodos = copia([...METODOS_BASE.map(([id, nombre, ref]) => ({ id, nombre, ref })), ...(METODOS as CatRow[])]);
  const orden: [TipoTipado, Row[]][] = [['cajas', cajas], ['rutas', rutas], ['becas', becas], ['conceptosBeca', conceptos], ['metodosPago', metodos], ['dietas', copia(DIETAS as CatRow[])], ['alergias', copia(ALERGIAS as CatRow[])],
    ['grados', grados], ['tandas', tandas], ['aulas', aulas], ['materias', materias], ['secciones', secciones], ['rubricas', rubricas], ['docentes', docentes], ['staff', staff]];
  const rep: Record<string, number> = {};
  for (const [tipo, rows] of orden) {
    const hay = new Set((await leerTipo(tipo)).map(r => r.id));
    let n = 0;
    for (const r of rows) if (!hay.has(r.id)) { await guardarTipo(tipo, r, null); n++; }
    rep[tipo] = n;
  }
  await sincronizarPlan(prisma);
  console.log(`seed estructura ok en ${((Date.now() - t0) / 1000).toFixed(1)}s · nuevos:`, rep);
}
