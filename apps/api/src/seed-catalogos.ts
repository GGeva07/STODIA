/**
 * SOLO DEMO (SEED_DEMO=true). Catálogos maestros de un colegio privado dominicano: niveles/grados completos, secciones, tandas, 36 materias del
 * currículo MINERD, rúbricas, 22 docentes + 9 empleados, aulas/laboratorios, cajas, rutas, becas, métodos de pago, comedor y conceptos cobrables.
 *
 * Idempotente y ADITIVO: ids con prefijo estable (mx*, dc*, sx-*, rb*, px*...), solo inserta lo que falta y NUNCA modifica un registro existente
 * (el escenario Rafael Almonte -> 5to A -> Matemáticas, las secciones s* / sg* de la demo grande y sus ids quedan intactos).
 * Todos los nombres, cédulas (prefijo 000, inválido), teléfonos (809-555-01xx) y correos (@example.do) son ficticios.
 * Ejecutar: pnpm --filter @stodia/api seed:catalogos   (también lo invoca seed.ts tras la demo grande).
 */
import { config } from './config';
import { prisma } from './db';
import { categoriaProductoId, guardarTipo, leerTipo, sincronizarPlan, type Row, type TipoTipado } from './lib/catalogos-tipados';
import { gradosDeRango, resolverRefs } from './lib/extras';

type Rec = { id: string; estado?: string } & Record<string, unknown>;
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Inserta solo los ids que faltan en la tabla TIPADA del tipo. Devuelve cuántos creó. */
async function addCat(tipo: TipoTipado, rows: Rec[]): Promise<number> {
  const hay = new Set((await leerTipo(tipo)).map(r => r.id));
  let n = 0;
  for (const r of rows) if (!hay.has(r.id)) { await guardarTipo(tipo, { ...r, estado: r.estado ?? 'Activo' } as Row, null); n++; }
  return n;
}
const leer = async (tipo: TipoTipado) => (await leerTipo(tipo)) as Rec[];

/**
 * Los usuarios de login deben ser unicos entre docentes y empleados (y frente a User): ambos comparten la tabla de usuarios (indices unicos filtrados).
 * Renombra SOLO los registros que este seed va a crear cuyo usuario choca con uno ya usado (los originales de la demo d1-d10 / e1-e4 conservan el suyo):
 * usr_<inicial><apellido>, con sufijo numerico si aun choca. Devuelve cuantos renombro.
 */
async function usuariosLibres(...listas: Rec[][]): Promise<number> {
  const usados = new Set([
    ...(await prisma.user.findMany({ select: { usuario: true } })).map(u => u.usuario),
    ...[...(await leerTipo('docentes')), ...(await leerTipo('staff'))].map(r => String(r.usuario ?? '')).filter(Boolean),
  ]);
  let n = 0;
  for (const r of listas.flat()) {
    let u = String(r.usuario ?? '');
    if (usados.has(u)) {
      const p = String(r.nombre).split(' '), base = 'usr_' + norm(p[0])[0] + norm(p[1]);
      u = base; for (let i = 2; usados.has(u); i++) u = base + i;
      r.usuario = u; n++;
    }
    usados.add(u);
  }
  return n;
}

// ---------------- Estructura ----------------
const GRADOS: Rec[] = [['g11', '4to', 11], ['g12', '5to', 12], ['g13', '6to', 13]].map(([id, grado, orden]) => ({ id: id as string, nivel: 'Secundaria', grado, orden }));
const TANDAS: Rec[] = [
  { id: 't5', nombre: 'Matutina Secundaria', ini: '07:00', fin: '13:00' },
  { id: 't6', nombre: 'Vespertina Secundaria', ini: '13:00', fin: '18:00' },
  { id: 't7', nombre: 'Sabatina', ini: '08:00', fin: '12:00' },
];
const AULAS: Rec[] = [
  ...Array.from({ length: 6 }, (_, i) => ({ id: `ax${pad(i + 1)}`, nombre: `Aula Inicial ${i + 1}`, tipo: 'Aula', edif: 'Edificio Inicial · Planta baja', pupitres: 24 })),
  ...Array.from({ length: 8 }, (_, i) => ({ id: `ax${pad(i + 7)}`, nombre: `Aula 10${i + 1}`, tipo: 'Aula', edif: 'Edificio D · 1er piso', pupitres: 36 })),
  ...Array.from({ length: 8 }, (_, i) => ({ id: `ax${pad(i + 15)}`, nombre: `Aula 20${i + 1}`, tipo: 'Aula', edif: 'Edificio D · 2do piso', pupitres: 36 })),
  ...Array.from({ length: 6 }, (_, i) => ({ id: `ax${pad(i + 23)}`, nombre: `Aula 30${i + 1}`, tipo: 'Aula', edif: 'Edificio E · 3er piso', pupitres: 36 })),
  { id: 'ax29', nombre: 'Laboratorio de Química', tipo: 'Laboratorio', edif: 'Edificio B · 2do piso', pupitres: 24 },
  { id: 'ax30', nombre: 'Laboratorio de Física', tipo: 'Laboratorio', edif: 'Edificio B · 2do piso', pupitres: 24 },
  { id: 'ax31', nombre: 'Laboratorio de Biología', tipo: 'Laboratorio', edif: 'Edificio B · 1er piso', pupitres: 24 },
  { id: 'ax32', nombre: 'Laboratorio de Informática 1', tipo: 'Laboratorio', edif: 'Edificio C · 1er piso', pupitres: 30 },
  { id: 'ax33', nombre: 'Laboratorio de Informática 2', tipo: 'Laboratorio', edif: 'Edificio C · 1er piso', pupitres: 30 },
  { id: 'ax34', nombre: 'Laboratorio STEM y Robótica', tipo: 'Laboratorio', edif: 'Edificio C · 2do piso', pupitres: 20 },
  { id: 'ax35', nombre: 'Laboratorio de Idiomas', tipo: 'Laboratorio', edif: 'Edificio C · 2do piso', pupitres: 28 },
  { id: 'ax36', nombre: 'Biblioteca Escolar', tipo: 'Salón especial', edif: 'Edificio A · 2do piso', pupitres: 40 },
  { id: 'ax37', nombre: 'Auditorio', tipo: 'Salón especial', edif: 'Edificio C · Planta baja', pupitres: 220 },
  { id: 'ax38', nombre: 'Salón de Música', tipo: 'Salón especial', edif: 'Edificio C · 1er piso', pupitres: 25 },
  { id: 'ax39', nombre: 'Salón de Arte', tipo: 'Salón especial', edif: 'Edificio C · 1er piso', pupitres: 24 },
  { id: 'ax40', nombre: 'Salón de Danza', tipo: 'Salón especial', edif: 'Área deportiva', pupitres: 30 },
  { id: 'ax41', nombre: 'Gimnasio Techado', tipo: 'Cancha', edif: 'Área deportiva', pupitres: 150 },
  { id: 'ax42', nombre: 'Cancha de Baloncesto', tipo: 'Cancha', edif: 'Área deportiva', pupitres: 60 },
  { id: 'ax43', nombre: 'Patio de Recreo Inicial', tipo: 'Cancha', edif: 'Edificio Inicial', pupitres: 60 },
];

// Materias: [código, nombre, grados, horas]. Grados: g1 Pre-primario, g2..g7 Primaria 1ro-6to, g8..g13 Secundaria 1ro-6to.
const G = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => `g${a + i}`);
const MATERIAS_RAW: [string, string, string[], number][] = [
  ['INI-DPS', 'Desarrollo Personal y Social', G(1, 1), 4], ['INI-COM', 'Comunicación y Lenguaje (Inicial)', G(1, 1), 5], ['INI-LOG', 'Pensamiento Lógico-Matemático (Inicial)', G(1, 1), 4],
  ['INI-EXP', 'Exploración del Entorno Natural y Social', G(1, 1), 3], ['INI-PSI', 'Psicomotricidad y Expresión Artística', G(1, 1), 3],
  ['FIHR-P', 'Formación Integral Humana y Religiosa (Primaria)', G(2, 7), 2], ['INF-P', 'Informática (Primaria)', G(2, 7), 2], ['FRA-P', 'Francés (Primaria)', G(5, 7), 2],
  ['LEC-P', 'Taller de Lectoescritura', G(2, 4), 2], ['MUS-P', 'Educación Musical', G(2, 7), 1], ['ROB-P', 'Robótica y Pensamiento Computacional', G(5, 7), 1],
  ['MAT-S', 'Matemática (Secundaria)', G(8, 13), 5], ['LEN-S', 'Lengua Española (Secundaria)', G(8, 13), 5], ['CS-S', 'Ciencias Sociales (Secundaria)', G(8, 13), 3],
  ['CN-S', 'Ciencias de la Naturaleza (Secundaria)', G(8, 10), 4], ['ING-S', 'Inglés (Secundaria)', G(9, 13), 4], ['FRA-S', 'Francés (Secundaria)', G(8, 13), 2],
  ['ART-S', 'Educación Artística (Secundaria)', G(8, 10), 2], ['EF-S', 'Educación Física (Secundaria)', G(8, 13), 2], ['FIHR-S', 'Formación Integral Humana y Religiosa (Secundaria)', G(8, 13), 2],
  ['INF-S', 'Informática (Secundaria)', G(8, 13), 2], ['FIS-S', 'Física', G(11, 13), 4], ['QUI-S', 'Química', G(11, 13), 4], ['BIO-S', 'Biología', G(11, 13), 4],
  ['GEO-S', 'Geografía e Historia Dominicana', G(8, 10), 2], ['HIS-S', 'Historia Universal', G(11, 13), 2], ['FIL-S', 'Filosofía', G(12, 13), 2],
  ['LIT-S', 'Literatura Hispanoamericana', G(11, 13), 2], ['ECO-S', 'Economía y Emprendimiento', G(12, 13), 2], ['ORI-S', 'Orientación y Proyecto de Vida', G(8, 13), 1],
  ['CIV-S', 'Educación Cívica y Ciudadana', G(8, 10), 1], ['CON-S', 'Contabilidad Básica', G(12, 13), 2], ['TEC-S', 'Tecnología y Programación', G(11, 13), 2],
  ['TIE-S', 'Ciencias de la Tierra y el Universo', G(13, 13), 2], ['EST-S', 'Estadística y Probabilidad', G(12, 13), 2],
];
const MID = (codigo: string) => `mx${pad(MATERIAS_RAW.findIndex(m => m[0] === codigo) + 1)}`;
const MATERIAS: Rec[] = MATERIAS_RAW.map(([codigo, nombre, grados, horas], i) => ({ id: `mx${pad(i + 1)}`, codigo, nombre, grados, horas }));
const ids = (...codes: string[]) => codes.map(MID);

const RUBRICAS: Rec[] = [
  { id: 'rb01', nombre: 'Evaluación de Nivel Inicial', materias: ids('INI-DPS', 'INI-COM', 'INI-LOG', 'INI-EXP', 'INI-PSI'), escala: 'Descriptiva (Logrado / En proceso)', crit: 'Participación 30%, Destrezas 40%, Actitud 30%', minimo: 60 },
  { id: 'rb02', nombre: 'Evaluación de Primaria (áreas complementarias)', materias: ids('FIHR-P', 'INF-P', 'FRA-P', 'LEC-P', 'MUS-P', 'ROB-P'), escala: 'Numérica 0–100', crit: 'Tareas 25%, Participación 15%, Proyectos 25%, Examen 35%', minimo: 70 },
  { id: 'rb03', nombre: 'Evaluación de Secundaria · Lengua, Matemática e idiomas', materias: ids('MAT-S', 'LEN-S', 'ING-S', 'FRA-S', 'LIT-S', 'EST-S'), escala: 'Numérica 0–100', crit: 'Comunicación 20%, Pensamiento lógico 20%, Resolución de problemas 20%, Ética y ciudadanía 10%, Examen 30%', minimo: 70 },
  { id: 'rb04', nombre: 'Evaluación de Secundaria · Ciencias', materias: ids('CN-S', 'FIS-S', 'QUI-S', 'BIO-S', 'TIE-S'), escala: 'Numérica 0–100', crit: 'Indagación 20%, Laboratorio 20%, Tareas 10%, Proyecto 20%, Examen 30%', minimo: 70 },
  { id: 'rb05', nombre: 'Evaluación de Secundaria · Humanidades y economía', materias: ids('CS-S', 'GEO-S', 'HIS-S', 'FIL-S', 'ECO-S', 'CIV-S', 'CON-S'), escala: 'Numérica 0–100', crit: 'Análisis 25%, Participación 15%, Proyectos 20%, Examen 40%', minimo: 70 },
  { id: 'rb06', nombre: 'Evaluación de Secundaria · Áreas prácticas', materias: ids('ART-S', 'EF-S', 'FIHR-S', 'INF-S', 'ORI-S', 'TEC-S'), escala: 'Numérica 0–100', crit: 'Práctica 40%, Participación 20%, Proyecto 40%', minimo: 65 },
];

// Docentes: [nombre, especialidad, materias(códigos), grados, partición [k,n]]
type Dsp = [string, string, string[], string[], [number, number]];
const DOCENTES_RAW: Dsp[] = [
  ['Yanira Cabrera Núñez', 'Educación Inicial', ['INI-DPS', 'INI-COM', 'INI-LOG'], G(1, 1), [0, 2]],
  ['Daniela Peguero Santos', 'Educación Inicial', ['INI-DPS', 'INI-COM', 'INI-LOG'], G(1, 1), [1, 2]],
  ['Lissette Mejía Rosario', 'Psicomotricidad y Arte Infantil', ['INI-EXP', 'INI-PSI'], G(1, 1), [0, 1]],
  ['Odalis Ramírez Féliz', 'Lengua y Lectoescritura', ['LEC-P'], G(2, 4), [0, 1]],
  ['Wilkin Santana Duarte', 'Educación Musical', ['MUS-P'], G(2, 7), [0, 1]],
  ['Ingrid Taveras Polanco', 'Informática Educativa', ['INF-P'], G(2, 7), [0, 1]],
  ['Rosa Elena Féliz Cuevas', 'Formación Humana y Religiosa', ['FIHR-P', 'FIHR-S'], G(2, 13), [0, 1]],
  ['Frantz Delva Pierre', 'Lengua Francesa', ['FRA-P', 'FRA-S'], G(5, 13), [0, 1]],
  ['Pavel Núñez Hidalgo', 'Robótica y Tecnología', ['ROB-P', 'TEC-S'], [...G(5, 7), ...G(11, 13)], [0, 1]],
  ['Marisol Sención Batista', 'Matemática', ['MAT-S'], G(8, 13), [0, 2]],
  ['Rubén Castro Aybar', 'Matemática', ['MAT-S'], G(8, 13), [1, 2]],
  ['Teodoro Pimentel Soto', 'Estadística, Economía y Contabilidad', ['EST-S', 'ECO-S', 'CON-S'], G(12, 13), [0, 1]],
  ['Altagracia Lora Mena', 'Lengua y Literatura', ['LEN-S', 'LIT-S'], G(8, 13), [0, 2]],
  ['Yohanny Burgos Ferreras', 'Lengua y Literatura', ['LEN-S', 'LIT-S'], G(8, 13), [1, 2]],
  ['Kelvin Polanco Ureña', 'Ciencias Sociales e Historia', ['CS-S', 'GEO-S', 'HIS-S', 'FIL-S', 'CIV-S'], G(8, 13), [0, 1]],
  ['Estefany Ureña Gómez', 'Lengua Inglesa', ['ING-S'], G(9, 13), [0, 1]],
  ['Ramón Disla Medina', 'Física y Ciencias de la Tierra', ['FIS-S', 'TIE-S'], G(11, 13), [0, 1]],
  ['Luz Divina Matos Pérez', 'Química', ['QUI-S'], G(11, 13), [0, 1]],
  ['Gregory Rosario Alcántara', 'Biología y Ciencias Naturales', ['BIO-S', 'CN-S'], G(8, 13), [0, 1]],
  ['Nathalie Bautista Colón', 'Artes y Orientación', ['ART-S', 'ORI-S'], G(8, 13), [0, 1]],
  ['Cristian Báez Lantigua', 'Educación Física', ['EF-S'], G(8, 13), [0, 1]],
  ['Amauris Jiménez Rivas', 'Informática', ['INF-S'], G(8, 13), [0, 1]],
];

const STAFF: Rec[] = [
  ['e5', 'Dilenny Marte Beltré', 'Cajera', 'Cajero', 'c4'], ['e6', 'Wander Pichardo Vargas', 'Cajero (turno vespertino)', 'Cajero', 'c5'],
  ['e7', 'Yesenia Cuevas Tejeda', 'Auxiliar de tesorería', 'Cajero', 'c7'], ['e8', 'Roxana Beltré Cabral', 'Coordinadora académica de Primaria', 'Director Académico', ''],
  ['e9', 'Franklin Medina Guerrero', 'Coordinador académico de Secundaria', 'Director Académico', ''], ['e10', 'Marisela Ogando Reyes', 'Psicóloga y orientadora', 'Docente', ''],
  ['e11', 'Ismael Valdez Ortega', 'Bibliotecario', 'Docente', ''], ['e12', 'Nelsy Paulino Encarnación', 'Nutricionista del comedor', 'Encargado Comedor', ''],
  ['e13', 'Cristina Almánzar Peña', 'Secretaria de admisiones', 'Cajero', ''],
].map(([id, nombre, cargo, rol, caja]) => ({ id: id as string, nombre, cargo, usuario: 'usr_' + norm((nombre as string).split(' ')[1]), rol, caja }));

export const CAJAS: Rec[] = [
  { id: 'c4', codigo: 'Caja 04', ubic: 'Secretaría de admisiones', ncf: 'B02 · Consumo', estado: 'Activa' },
  { id: 'c5', codigo: 'Caja 05', ubic: 'Cafetería y comedor', ncf: 'B02 · Consumo', estado: 'Activa' },
  { id: 'c6', codigo: 'Caja 06', ubic: 'Tesorería · facturación a empresas', ncf: 'B01 · Crédito fiscal', estado: 'Activa' },
  { id: 'c7', codigo: 'Caja 07', ubic: 'Librería y uniformes', ncf: 'B02 · Consumo', estado: 'Activa' },
  { id: 'c8', codigo: 'Caja 08', ubic: 'Eventos y actividades (temporal)', ncf: 'B02 · Consumo', estado: 'Inactiva' },
];
export const RUTAS: Rec[] = [
  ['r4', 'Zona D', 'Los Prados · Cacicazgos · Paraíso', 'Domingo Ventura', 'AB-0272', 28, 3200], ['r5', 'Zona E', 'Herrera · Las Palmas · Manoguayabo', 'Eddy Montero', 'AB-0285', 30, 3400],
  ['r6', 'Zona F', 'Los Alcarrizos · Pantoja', 'Nelson Báez', 'AB-0291', 30, 3800], ['r7', 'Zona G', 'Villa Mella · Sabana Perdida', 'Santo Guzmán', 'AB-0307', 24, 4000],
  ['r8', 'Zona H', 'Autopista San Isidro · Ciudad Juan Bosch', 'Pedro Luciano', 'AB-0318', 24, 4200],
].map(([id, nombre, sectores, chofer, ficha, asientos, tarifa]) => ({ id: id as string, nombre, sectores, chofer, ficha, asientos, tarifa }));

export const BECAS: Rec[] = [
  ['excelencia', 'Beca Excelencia Académica (Cuadro de Honor)', 30, true], ['deportista', 'Beca Mérito Deportivo', 20, true], ['socioeconomica', 'Beca Socioeconómica', 35, true],
  ['orfandad', 'Beca Orfandad', 50, true], ['hermanos3', 'Plan Tres Hermanos', 15, false], ['convenio', 'Convenio Institucional', 10, false], ['pastoral', 'Beca Pastoral', 25, true],
].map(([id, nombre, pct, aprobacion]) => ({ id: id as string, nombre, pct, aprobacion }));
export const CONCEPTOS_BECA: Rec[] = ['Materiales', 'Uniformes', 'Actividades extracurriculares', 'Certificaciones'].map((nombre, i) => ({ id: `cb${i + 5}`, nombre }));
export const METODOS: Rec[] = [
  { id: 'm6', nombre: 'Depósito bancario', ref: 'Ref. depósito' }, { id: 'm7', nombre: 'Pago móvil / billetera', ref: 'Ref. transacción' }, { id: 'm8', nombre: 'Convenio empresarial', ref: 'No. convenio' },
];
export const DIETAS: Rec[] = ['Sin huevo', 'Sin mariscos', 'Baja en azúcar (diabético)', 'Hipocalórica'].map((nombre, i) => ({ id: pad(i + 5), nombre }));
// Penicilina y Polen las usan los alumnos de la demo (Alumno.alg): el catalogo debe tenerlas para que la referencia por nombre sea valida.
export const ALERGIAS: Rec[] = ['Penicilina', 'Polen', 'Soya', 'Pescado', 'Trigo', 'Fresas', 'Chocolate', 'Sulfitos'].map((nombre, i) => ({ id: pad(i + 7), nombre }));

// Conceptos cobrables (FinProducto: [id, código, nombre, categoría, precio, ITBIS, stock, icono]).
const PRODUCTOS: [string, string, string, string, number, boolean, number | null, string][] = [
  ['px01', '7501101', 'Falda Escolar', 'Uniformes', 950, true, 30, 'ph ph-t-shirt'], ['px02', '7501102', 'Short Deportivo', 'Uniformes', 600, true, 40, 'ph ph-t-shirt'],
  ['px03', '7501103', 'Camiseta de Educación Física', 'Uniformes', 550, true, 45, 'ph ph-t-shirt'], ['px04', '7501104', 'Corbata Escolar', 'Uniformes', 300, true, 25, 'ph ph-t-shirt'],
  ['px05', '7501105', 'Bata de Laboratorio', 'Uniformes', 850, true, 20, 'ph ph-t-shirt'], ['px06', '7502101', 'Libro Matemáticas 1ro', 'Libros', 1350, false, 20, 'ph ph-book-open'],
  ['px07', '7502102', 'Libro Lengua Española 1ro', 'Libros', 1300, false, 20, 'ph ph-book-open'], ['px08', '7502103', 'Libro Ciencias Naturales 3ro', 'Libros', 1400, false, 18, 'ph ph-book-open'],
  ['px09', '7502104', 'Reader Inglés 1ro Secundaria', 'Libros', 1250, false, 15, 'ph ph-book-open'], ['px10', '7502105', 'Cuaderno de Francés', 'Libros', 480, false, 25, 'ph ph-book-open'],
  ['px11', '7503101', 'Kit Escolar Nivel Inicial', 'Papelería', 1800, true, 30, 'ph ph-backpack'], ['px12', '7503102', 'Kit de Arte', 'Papelería', 650, true, 22, 'ph ph-palette'],
  ['px13', '7503103', 'Lápices de Colores x24', 'Papelería', 280, true, 60, 'ph ph-pencil'], ['px14', '7503104', 'Calculadora Científica', 'Papelería', 1100, true, 12, 'ph ph-calculator'],
  ['px15', '7504101', 'Constancia de Estudios', 'Servicios', 250, false, null, 'ph ph-certificate'], ['px16', '7504102', 'Certificación de Notas', 'Servicios', 400, false, null, 'ph ph-certificate'],
  ['px17', '7504103', 'Duplicado de Carnet Escolar', 'Servicios', 200, false, null, 'ph ph-identification-card'], ['px18', '7504104', 'Legalización MINERD', 'Servicios', 1200, false, null, 'ph ph-stamp'],
  ['px19', '7504105', 'Duplicado de Boletín', 'Servicios', 150, false, null, 'ph ph-certificate'], ['px20', '7504106', 'Examen de Reposición', 'Servicios', 350, false, null, 'ph ph-certificate'],
  ['px21', '7505101', 'Excursión Educativa', 'Actividades', 1500, false, null, 'ph ph-bus'], ['px22', '7505102', 'Graduación (6to)', 'Actividades', 4500, false, null, 'ph ph-graduation-cap'],
  ['px23', '7505103', 'Día de Campo', 'Actividades', 700, false, null, 'ph ph-tent'], ['px24', '7505104', 'Semana Cultural', 'Actividades', 500, false, null, 'ph ph-confetti'],
];
// Actividades extracurriculares (AcadExtra): [nombre, cat, kind, instructor, lugar, dias, hora, grados, cupo, inscritos, costo, ini, sem]
const EXTRAS: (string | number)[][] = [
  ['Karate-Do', 'Deportes', 'act', 'Sensei Alexis Paulino', 'Gimnasio Techado', 'Mar y Jue', '3:00 – 4:00 PM', '1ro – 6to', 25, 12, 1400],
  ['Voleibol Juvenil', 'Deportes', 'act', 'Prof. Cristian Báez', 'Cancha de Baloncesto', 'Lun y Mié', '3:30 – 5:00 PM', '1ro – 6to Sec.', 20, 9, 1300],
  ['Coro Escolar', 'Música', 'act', 'Mtro. Wilkin Santana', 'Salón de Música', 'Viernes', '2:30 – 4:00 PM', '2do – 6to', 30, 15, 900],
  ['Inglés Conversacional', 'Idiomas', 'curso', 'Prof. Estefany Ureña', 'Laboratorio de Idiomas', 'Mar y Jue', '3:00 – 4:30 PM', '1ro – 6to Sec.', 18, 6, 3800, '03/11/2026', 10],
  ['Programación con Scratch', 'Académico', 'curso', 'Prof. Amauris Jiménez', 'Laboratorio de Informática 1', 'Sábado', '9:00 – 11:00 AM', '4to – 6to', 20, 8, 3200, '07/11/2026', 8],
  ['Club de Lectura', 'Académico', 'act', 'Lic. Ismael Valdez', 'Biblioteca Escolar', 'Miércoles', '2:30 – 3:30 PM', '3ro – 6to', 20, 10, 0],
  ['Club de Ciencias', 'Académico', 'act', 'Prof. Gregory Rosario', 'Laboratorio de Biología', 'Viernes', '2:30 – 4:00 PM', '1ro – 3ro Sec.', 16, 7, 1600],
];

export async function seedCatalogos(): Promise<void> {
  if (!config.seedDemo) { console.log('seed catálogos: omitido (solo con SEED_DEMO=true).'); return; }
  const t0 = Date.now(), rep: Record<string, number> = {};
  rep.grados = await addCat('grados', GRADOS);
  rep.tandas = await addCat('tandas', TANDAS);
  rep.aulas = await addCat('aulas', AULAS);
  rep.materias = await addCat('materias', MATERIAS);
  rep.rubricas = await addCat('rubricas', RUBRICAS.map(r => ({ ...r, estado: 'Activo' })));

  // Secciones: A/B/C por grado y tanda. Se omite cualquier combinación (grado, letra, tanda) que ya exista como sección (los alumnos apuntan a su sección por FK).
  const grados = new Map((await leer('grados')).map(g => [g.id, g]));
  const tandas = new Map((await leer('tandas')).map(t => [t.id, t]));
  const secExist = await leer('secciones');
  const ocupadas = new Set(secExist.map(s => `${s.grado}|${String(s.seccion).toUpperCase()}|${s.tanda}`));
  const nuevasSec: Rec[] = [];
  const aulasInicial = AULAS.slice(0, 6).map(a => a.id), aulasGrandes = AULAS.slice(6, 28).map(a => a.id);
  let ai = 0, ag = 0;
  for (let n = 1; n <= 13; n++) {
    const gid = `g${n}`;
    const combos: [string, string][] = n <= 7 ? [...['A', 'B', 'C'].map(l => [l, 't1'] as [string, string]), ...['A', 'B'].map(l => [l, 't2'] as [string, string])] : [...['A', 'B', 'C'].map(l => [l, 't5'] as [string, string]), ...['A', 'B'].map(l => [l, 't6'] as [string, string])];
    for (const [letra, tanda] of combos) {
      if (ocupadas.has(`${gid}|${letra}|${tanda}`)) continue;
      nuevasSec.push({ id: `sx-${gid}-${letra}-${tanda}`, grado: gid, seccion: letra, tanda, aula: n === 1 ? aulasInicial[ai++ % aulasInicial.length] : aulasGrandes[ag++ % aulasGrandes.length], cap: n === 1 ? 22 : n <= 7 ? 30 : 32 });
    }
  }
  rep.secciones = await addCat('secciones', nuevasSec);

  // Docentes: reparten SUS materias entre las secciones (existentes y nuevas) de su ámbito, sin solaparse entre sí (verificado abajo).
  const secs = (await leer('secciones')).filter(s => s.estado === 'Activo').sort((a, b) => a.id.localeCompare(b.id));
  const matByCode = new Map(MATERIAS.map(m => [m.codigo as string, m]));
  const par = new Map<string, string>(); // seccion|materia -> docente
  const docs: Rec[] = DOCENTES_RAW.map(([nombre, esp, codigos, gr, [k, n]], i) => {
    const id = `dc${pad(i + 1)}`, partes = nombre.split(' ');
    const mine = secs.filter(s => gr.includes(String(s.grado))).filter((_, idx) => idx % n === k);
    const materias = codigos.map(c => matByCode.get(c)!.id as string);
    for (const s of mine) for (const c of codigos) {
      const m = matByCode.get(c)!;
      if (!(m.grados as string[]).includes(String(s.grado))) continue;
      const key = `${s.id}|${m.id}`;
      if (par.has(key)) throw new Error(`Conflicto de asignación ${key}: ${par.get(key)} y ${id}`);
      par.set(key, id);
    }
    return {
      id, nombre, cedula: `000-91${pad(i + 1, 5)}-${(i * 7) % 10}`, esp, email: `${norm(partes[0])}.${norm(partes[1])}@example.do`, tel: `809-555-01${pad(10 + i * 3)}`,
      usuario: `usr_${norm(partes[1])}`, rol: 'Docente', materias, secciones: mine.map(s => s.id as string),
    };
  });
  const staffRows: Rec[] = STAFF.map((s, i) => ({ ...s, tel: `809-555-01${pad(60 + i * 3)}`, email: `${norm(String(s.nombre).split(' ')[0])}.${norm(String(s.nombre).split(' ')[1])}@example.do` }));
  rep.usuariosRenombrados = await usuariosLibres(docs, staffRows);
  rep.docentes = await addCat('docentes', docs);
  rep.staff = await addCat('staff', staffRows);
  // cajas, rutas, becas, conceptos, medios de pago, dietas y alergias de la demo los siembra seed-estructura (antes que los alumnos: son FK).

  const hayProd = new Set((await prisma.finProducto.findMany({ select: { id: true, code: true } })).flatMap(p => [p.id, p.code]));
  const prods = [];
  for (const [id, code, name, cat, price, tax, stock, icon] of PRODUCTOS.filter(p => !hayProd.has(p[0]) && !hayProd.has(p[1]))) prods.push({ id, code, name, categoriaId: await categoriaProductoId(cat), price, tax, stock, icon });
  if (prods.length) await prisma.finProducto.createMany({ data: prods });
  rep.conceptosCobrables = prods.length;
  const hayExt = new Set((await prisma.acadExtra.findMany({ select: { id: true, name: true } })).flatMap(e => [e.id, norm(e.name)]));
  const ult = Math.max(0, ...(await prisma.acadExtra.findMany({ select: { id: true } })).map(e => Number(e.id.replace('EXT-', '')) || 0));
  const ext = EXTRAS.filter(e => !hayExt.has(norm(String(e[0])))).map((e, i) => ({
    id: `EXT-${pad(ult + i + 1, 3)}`, name: String(e[0]), cat: String(e[1]), kind: String(e[2]), instructor: String(e[3]), lugar: String(e[4]), dias: String(e[5]), hora: String(e[6]), grados: String(e[7]),
    cupo: Number(e[8]), inscritos: Number(e[9]), costo: Number(e[10]), ini: String(e[11] ?? ''), sem: Number(e[12] ?? 0), estado: 'Abierta',
  }));
  for (const { grados: rango, instructor, lugar, ...x } of ext) {
    const gs = await gradosDeRango(prisma, rango), refs = await resolverRefs(prisma, instructor, lugar);
    if (!gs) throw new Error('Grados de la actividad no reconocidos: ' + rango);
    await prisma.acadExtra.create({ data: { ...x, instructor, lugar, docenteId: refs.docenteId, aulaId: refs.aulaId, grados: { create: gs.map(gradoId => ({ gradoId })) } } });
  }
  rep.actividades = ext.length;
  await sincronizarPlan(prisma);
  console.log(`seed catálogos ok en ${((Date.now() - t0) / 1000).toFixed(1)}s · nuevos registros:`, rep, `· asignaciones nuevas: ${par.size}`);
}

if (require.main === module) {
  seedCatalogos().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
}
