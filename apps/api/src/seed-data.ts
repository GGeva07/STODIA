/** Datos mock mínimos tomados del prototipo (DIR0, CAT_SEED). */
import type { Rol } from '@stodia/shared';

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** USERS del prototipo (rol -> nombre) con su usuario de login. */
export const SEED_USERS: { usuario: string; nombre: string; rol: Rol }[] = [
  { usuario: 'usr_palmanzar', nombre: 'Pedro Almánzar', rol: 'Super Admin' },
  { usuario: 'usr_cvidal', nombre: 'Carmen Vidal', rol: 'Director Académico' },
  { usuario: 'usr_ralmonte', nombre: 'Rafael Almonte', rol: 'Docente' },
  { usuario: 'usr_arosario', nombre: 'Ana Rosario', rol: 'Cajero' },
  { usuario: 'usr_jtejada', nombre: 'Julio Tejada', rol: 'Encargado Comedor' },
  { usuario: 'c.mendoza', nombre: 'Carlos Mendoza', rol: 'Tutor' },
];

// id, nombres, apellidos, fnac, grado, sec, tanda, tutor, cuenta, estado, alergias, dir, tel
export const DIR0: string[][] = [
  ['0412', 'Juan Andrés', 'Mendoza Fernández', '2016-03-14', '5to', 'A', 'Matutina', 'Carlos Mendoza Pérez', 'mora', 'Activo', 'Maní, frutos secos, lactosa', 'C/ Los Robles #14, Arroyo Hondo', '809-555-0142'],
  ['0587', 'Sofía', 'Mendoza Fernández', '2019-07-02', '2do', 'B', 'Matutina', 'Carlos Mendoza Pérez', 'ok', 'Activo', '', 'C/ Los Robles #14, Arroyo Hondo', '809-555-0142'],
  ['0398', 'Valeria', 'Ortiz Brito', '2017-11-21', '3ro', 'B', 'Matutina', 'Ana Brito de Ortiz', 'ok', 'Activo', '', 'Av. Independencia #220, Gazcue', '809-555-0310'],
  ['0455', 'Luis', 'Peña Durán', '2015-01-09', '6to', 'A', 'Matutina', 'Ramón Peña', 'mora', 'Activo', '', 'C/ 5 #8, Los Prados', '829-555-0921'],
  ['0501', 'Andrea', 'Quezada Mejía', '2020-05-30', '1ro', 'A', 'Extendida', 'Patricia Mejía', 'ok', 'Activo', 'Gluten', 'Res. Las Palmas, Bella Vista', '809-555-0777'],
  ['0433', 'Gabriela', 'Núñez Almonte', '2016-08-17', '5to', 'A', 'Matutina', 'Altagracia Núñez', 'ok', 'Activo', '', 'C/ Rafael Augusto Sánchez #40', '809-555-0188'],
  ['0421', 'Tomás', 'Fernández Gil', '2016-02-03', '5to', 'A', 'Matutina', 'José Fernández', 'ok', 'Activo', '', 'Av. Núñez de Cáceres #12', '809-555-0456'],
  ['0447', 'Elena', 'Rodríguez Sosa', '2016-10-28', '5to', 'A', 'Matutina', 'Marta Sosa (empleada)', 'ok', 'Activo', '', 'C/ El Vergel #3', '809-555-0632'],
  ['0461', 'Camila', 'Espinal Ortiz', '2016-06-11', '5to', 'A', 'Matutina', 'Ramón Espinal', 'ok', 'Activo', '', 'C/ Gustavo Mejía Ricart #77', '809-555-0275'],
  ['0472', 'Héctor', 'De la Cruz', '2016-12-01', '5to', 'A', 'Matutina', 'Ana de la Cruz', 'mora', 'Activo', 'Penicilina', 'C/ Duarte #102, Villa Mella', '829-555-0119'],
  ['0519', 'Yuleisy', 'Guzmán Reyes', '2018-04-14', '3ro', 'A', 'Vespertina', 'Yolanda Guzmán', 'ok', 'Activo', '', 'C/ Primera #9, Herrera', '809-555-0840'],
  ['0530', 'Marcos', 'Taveras Lora', '2014-09-25', '6to', 'B', 'Vespertina', 'Félix Taveras', 'mora', 'Inactivo', '', 'Av. Charles de Gaulle #500', '829-555-0377'],
  ['0544', 'Isabella', 'Castillo Peña', '2019-01-19', '2do', 'A', 'Extendida', 'Rosa Peña', 'ok', 'Activo', 'Huevo', 'C/ Las Flores #21, Naco', '809-555-0590'],
  ['0352', 'Diego', 'Santana Vólquez', '2015-03-07', '6to', 'A', 'Matutina', 'Luis Santana', 'ok', 'Retirado', '', 'C/ Central #6, Alma Rosa', '809-555-0213'],
  ['0558', 'Ana Lucía', 'Báez Rosario', '2017-07-23', '4to', 'C', 'Matutina', 'Miguel Báez', 'ok', 'Activo', '', 'C/ José Contreras #55', '809-555-0664'],
  ['0566', 'Samuel', 'Ortiz Brito', '2018-12-12', '3ro', 'B', 'Matutina', 'Ana Brito de Ortiz', 'ok', 'Activo', '', 'Av. Independencia #220, Gazcue', '809-555-0310'],
];

export type CatRow = { id: string; estado?: string } & Record<string, unknown>;

const withIds = (prefix: string, rows: Record<string, unknown>[]): CatRow[] =>
  rows.map((r, i) => ({ id: prefix + (i + 1), estado: 'Activo', ...r }));

const GRADOS: [string, string][] = [['Inicial', 'Pre-primario'], ['Primaria', '1ro'], ['Primaria', '2do'], ['Primaria', '3ro'], ['Primaria', '4to'], ['Primaria', '5to'], ['Primaria', '6to'], ['Secundaria', '1ro'], ['Secundaria', '2do'], ['Secundaria', '3ro']];
const AULAS: [string, string, string, number][] = [['Aula 12', 'Aula', 'Edificio A · 1er piso', 30], ['Aula 14', 'Aula', 'Edificio A · 1er piso', 30], ['Aula 15', 'Aula', 'Edificio A · 2do piso', 28], ['Aula 21', 'Aula', 'Edificio B · 2do piso', 32], ['Laboratorio de Ciencias', 'Laboratorio', 'Edificio B · 1er piso', 24], ['Cancha techada', 'Cancha', 'Área deportiva', 120], ['Salón de Arte', 'Salón especial', 'Edificio C', 20]];
const SECCIONES: [string, string, string, string, number, number][] = [['g6', 'A', 't1', 'a1', 30, 28], ['g6', 'B', 't2', 'a2', 30, 30], ['g5', 'A', 't1', 'a3', 28, 22], ['g7', 'A', 't1', 'a4', 32, 31], ['g8', 'A', 't3', 'a2', 30, 12]];
const MATERIAS: [string, string, string[], number][] = [['MAT-05', 'Matemáticas', ['g6', 'g7'], 5], ['LEN-05', 'Lengua Española', ['g6', 'g7'], 5], ['CN-05', 'Ciencias de la Naturaleza', ['g5', 'g6', 'g7'], 4], ['CS-05', 'Ciencias Sociales', ['g5', 'g6'], 3], ['ING-05', 'Inglés', ['g5', 'g6', 'g7', 'g8'], 3], ['EF-01', 'Educación Física', ['g2', 'g3', 'g4', 'g5', 'g6', 'g7'], 2]];
const DOCENTES: [string, string, string, string[], string[]][] = [['Rafael Almonte', '001-1234567-8', 'Matemáticas', ['m1'], ['s1', 's2', 's4']], ['Laura Peña', '001-2345678-9', 'Lengua y Literatura', ['m2'], ['s1', 's3']], ['Miguel Taveras', '402-3456789-0', 'Ciencias Naturales', ['m3'], ['s1', 's2']], ['Carolina Reyes', '001-4567890-1', 'Inglés', ['m5'], ['s1', 's3', 's5']]];

export const CAT_SEED: Record<string, CatRow[]> = {
  grados: withIds('g', GRADOS.map(([nivel, grado], i) => ({ nivel, grado, orden: i + 1 }))),
  tandas: [
    { id: 't1', nombre: 'Matutina', ini: '07:30', fin: '12:30', estado: 'Activo' },
    { id: 't2', nombre: 'Vespertina', ini: '13:30', fin: '17:30', estado: 'Activo' },
    { id: 't3', nombre: 'Extendida', ini: '07:30', fin: '16:00', estado: 'Activo' },
    { id: 't4', nombre: 'Nocturna', ini: '18:00', fin: '21:30', estado: 'Inactivo' },
  ],
  aulas: withIds('a', AULAS.map(([nombre, tipo, edif, pupitres]) => ({ nombre, tipo, edif, pupitres }))),
  secciones: withIds('s', SECCIONES.map(([grado, seccion, tanda, aula, cap, insc]) => ({ grado, seccion, tanda, aula, cap, insc }))),
  materias: withIds('m', MATERIAS.map(([codigo, nombre, grados, horas]) => ({ codigo, nombre, grados, horas }))),
  rubricas: [
    { id: 'r1', nombre: 'Evaluación estándar de Primaria', materias: ['m1', 'm2'], escala: 'Numérica 0–100', crit: 'Tareas 20%, Participación 10%, Proyectos 20%, Exámenes 50%', minimo: 70, estado: 'Activo' },
    { id: 'r2', nombre: 'Evaluación de Educación Física', materias: ['m6'], escala: 'Descriptiva (Logrado / En proceso)', crit: 'Participación 40%, Actitud 30%, Destrezas 30%', minimo: 60, estado: 'Activo' },
  ],
  docentes: withIds('d', DOCENTES.map(([nombre, cedula, esp, materias, secciones], i) => ({
    nombre, cedula, esp, materias, secciones,
    email: nombre.split(' ')[0].toLowerCase()[0] + '.' + norm(nombre.split(' ')[1]) + '@lospinos.edu.do',
    usuario: 'usr_' + norm(nombre.split(' ')[1]),
    rol: i === 0 ? 'Director Académico' : 'Docente',
  }))),
  cajas: [
    { id: 'c1', codigo: 'Caja 01', ubic: 'Recepción principal', ncf: 'B02 · Consumo', estado: 'Activa' },
    { id: 'c2', codigo: 'Caja 02', ubic: 'Recepción principal', ncf: 'B02 · Consumo', estado: 'Activa' },
    { id: 'c3', codigo: 'Caja 03', ubic: 'Librería / Venta rápida', ncf: 'B02 · Consumo', estado: 'Activa' },
  ],
  staff: [
    { id: 'e1', nombre: 'Ana Rosario', cargo: 'Cajera', usuario: 'usr_rosario', rol: 'Cajero', caja: 'c2', estado: 'Activo' },
    { id: 'e2', nombre: 'Pedro Guzmán', cargo: 'Cajero', usuario: 'usr_guzman', rol: 'Cajero', caja: 'c1', estado: 'Activo' },
    { id: 'e3', nombre: 'Julia Ventura', cargo: 'Coordinadora financiera', usuario: 'usr_ventura', rol: 'Super Admin', caja: '', estado: 'Activo' },
    { id: 'e4', nombre: 'Héctor Lora', cargo: 'Encargado de comedor', usuario: 'usr_lora', rol: 'Encargado Comedor', caja: '', estado: 'Activo' },
  ],
  // Tipos de beca de la demo sin porcentaje fijo (monto fijo); los de porcentaje los siembra seed-personas en este mismo Catalogo 'becas'.
  becas: [{ id: 'b1', nombre: 'Deportiva', estado: 'Activo' }],
  conceptosBeca: ['Colegiatura', 'Inscripción', 'Transporte', 'Comedor'].map((nombre, i) => ({ id: 'cb' + (i + 1), nombre, estado: 'Activo' })),
  rutas: [
    { id: 'r1', nombre: 'Zona A', sectores: 'Naco · Piantini · Evaristo Morales', chofer: 'José Martínez', ficha: 'AB-0231', asientos: 30, tarifa: 2500, estado: 'Activo' },
    { id: 'r2', nombre: 'Zona B', sectores: 'Bella Vista · Mirador Sur', chofer: 'Ramón Peralta', ficha: 'AB-0244', asientos: 30, tarifa: 2500, estado: 'Activo' },
    { id: 'r3', nombre: 'Zona C', sectores: 'Arroyo Hondo · Los Ríos', chofer: 'Félix Santos', ficha: 'AB-0260', asientos: 24, tarifa: 3000, estado: 'Activo' },
  ],
};
