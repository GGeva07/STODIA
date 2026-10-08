/** Semilla del grupo académico (mock del prototipo: STU_ATT, G0, X0, SCHED0). Idempotente: no pisa registros existentes. */
import { prisma } from './db';

const STU_ATT = ['Abreu Castillo, Daniela', 'Báez Rosario, Miguel', 'Castillo Peña, Amanda', 'De la Cruz, Héctor', 'Espinal Ortiz, Camila', 'Fernández Gil, Tomás', 'Guzmán Reyes, Laura', 'Hernández Polanco, Iván', 'Jiménez Taveras, Paula', 'Mendoza Fernández, Juan', 'Núñez Almonte, Gabriela', 'Ortiz Brito, Samuel', 'Peña Durán, Lucía', 'Quezada Mejía, Andrés', 'Rodríguez Sosa, Elena', 'Santana Vólquez, Diego'];
const G0 = [['92', '88', '95', '90', ''], ['78', '81', '74', '80', ''], ['85', '90', '87', '', ''], ['65', '70', '68', '72', ''], ['95', '97', '93', '96', '94'], ['72', '75', '80', '', ''], ['88', '84', '91', '86', ''], ['58', '66', '61', '64', ''], ['90', '86', '89', '92', ''], ['82', '79', '85', '88', ''], ['98', '96', '99', '97', '100'], ['74', '69', '77', '', '']];
const SCHED0: Record<string, string> = { '0-0': 'mat', '0-1': 'len', '0-3': 'soc', '1-0': 'mat', '1-1': 'ing', '1-3': 'len', '2-1': 'mat', '2-2': 'cie', '2-3': 'len', '3-0': 'ing', '3-1': 'len', '3-4': 'efi', '4-0': 'mat', '4-2': 'ing' };
// nombre, cat, kind, instructor, lugar, dias, hora, grados, cupo, inscritos, costo, ini, sem
const X0: (string | number)[][] = [
  ['Academia de Fútbol', 'Deportes', 'act', 'Prof. José Cruz', 'Cancha principal', 'Mar y Jue', '3:00 – 4:30 PM', '4to – 6to', 30, 26, 1500],
  ['Baloncesto Mixto', 'Deportes', 'act', 'Prof. Ernesto Lugo', 'Polideportivo', 'Lun y Mié', '3:00 – 4:30 PM', '4to – 6to', 24, 24, 1500],
  ['Natación Inicial', 'Deportes', 'act', 'Prof. Laura Bisonó', 'Piscina semiolímpica', 'Viernes', '2:30 – 4:00 PM', '1ro – 3ro', 16, 11, 2200],
  ['Ballet Clásico', 'Danza', 'act', 'Mtra. Elena Ricart', 'Salón de danza', 'Lun y Mié', '2:30 – 4:00 PM', '1ro – 6to', 20, 18, 1800],
  ['Danza Folclórica', 'Danza', 'act', 'Mtro. Manuel Pujols', 'Salón de danza', 'Viernes', '3:00 – 4:30 PM', '4to – 6to', 25, 12, 1200],
  ['Pintura y Acuarela', 'Arte', 'curso', 'Mtra. Mariana Rosario', 'Sala Audiovisual', 'Mar y Jue', '2:30 – 4:00 PM', '1ro – 6to', 18, 15, 3500, '06/10/2026', 10],
  ['Teatro Infantil', 'Arte', 'curso', 'Mtro. Iván Encarnación', 'Auditorio', 'Sábado', '9:00 – 11:00 AM', '4to – 6to', 22, 9, 4200, '17/10/2026', 12],
  ['Guitarra Básica', 'Música', 'curso', 'Mtro. Rafael Sosa', 'Aula de música', 'Lun y Mié', '3:00 – 4:00 PM', '4to – 6to', 12, 12, 2800, '05/10/2026', 8],
  ['Club de Robótica', 'Académico', 'act', 'Ing. Claudia Peña', 'Laboratorio STEM', 'Viernes', '2:30 – 4:00 PM', '4to – 6to', 16, 14, 1900],
  ['Ajedrez', 'Académico', 'act', 'Prof. Andrés Mota', 'Biblioteca', 'Mar y Jue', '2:30 – 3:30 PM', '1ro – 6to', 20, 0, 0],
];

/** Lee/crea/parchea una fila de catálogo (Catalogo tipo:id). Los parches de la demo se reaplican siempre para reproducir el escenario del prototipo. */
async function setCat(tipo: string, id: string, patch: Record<string, unknown>, crear?: Record<string, unknown>) {
  const key = `${tipo}:${id}`, cur = await prisma.catalogo.findUnique({ where: { id: key } });
  if (!cur && !crear) return;
  const data = { ...(cur ? JSON.parse(cur.data) : { id, estado: 'Activo', ...crear }), ...patch, id };
  const estado = cur?.estado ?? (data.estado as string) ?? 'Activo';
  await prisma.catalogo.upsert({ where: { id: key }, update: { data: JSON.stringify({ ...data, estado }) }, create: { id: key, tipo, data: JSON.stringify(data), estado } });
}
const PRIM = ['g2', 'g3', 'g4', 'g5', 'g6', 'g7'];
const MID: Record<string, string> = { mat: 'm1', len: 'm2', cie: 'm3', soc: 'm4', ing: 'm5', efi: 'm6', art: 'm7' };
// sección -> [slot, materia (clave del prototipo)] de las OTRAS secciones del prototipo (TBUSY/ABUSY), ahora como horarios reales guardados.
const OTROS: Record<string, [string, string][]> = {
  s2: [['0-1', 'mat'], ['3-3', 'mat'], ['1-2', 'len']], s4: [['2-0', 'mat'], ['0-2', 'cie'], ['4-4', 'efi']], s3: [['1-0', 'ing'], ['1-3', 'cie']],
  s6: [['3-2', 'ing'], ['3-1', 'cie']], s7: [['4-1', 'cie']], s8: [['2-4', 'efi']], s9: [['0-5', 'art']], s10: [['0-4', 'efi']],
};
// sección, materia, docente, aulas posibles (ids de aula; vacío = aula base de la sección)
const ASIG: [string, string, string, string[]][] = [
  ['s1', 'm1', 'd1', []], ['s1', 'm2', 'd5', []], ['s1', 'm5', 'd6', []], ['s1', 'm3', 'd7', ['a5']], ['s1', 'm4', 'd8', []], ['s1', 'm6', 'd9', ['a6']], ['s1', 'm7', 'd10', ['a7', 'a2']],
  ['s2', 'm1', 'd1', []], ['s2', 'm2', 'd5', []],
  ['s4', 'm1', 'd1', []], ['s4', 'm3', 'd7', ['a5']], ['s4', 'm6', 'd9', ['a6']],
  ['s3', 'm5', 'd6', []], ['s3', 'm3', 'd7', ['a5']],
  ['s6', 'm5', 'd6', []], ['s6', 'm3', 'd7', ['a5']], ['s7', 'm3', 'd7', ['a5']], ['s8', 'm6', 'd9', ['a6']], ['s9', 'm7', 'd10', ['a7', 'a2']],
  ['s10', 'm2', 'd5', []], ['s10', 'm6', 'd9', ['a6']],
];

export default async function seedAcademico() {
  // ---- Catálogos del colegio demo alineados con el prototipo (aulas, materias, rúbrica, docentes y secciones que usa la grilla de horarios) ----
  await setCat('aulas', 'a2', { nombre: 'Aula 14', pupitres: 32 });
  await setCat('aulas', 'a5', { nombre: 'Lab. Ciencias', pupitres: 30 });
  await setCat('aulas', 'a6', { nombre: 'Cancha', pupitres: 80 });
  await setCat('aulas', 'a7', { nombre: 'Sala Audiovisual', pupitres: 25 });
  await setCat('materias', 'm1', { grados: PRIM, horas: 5 });
  await setCat('materias', 'm2', { grados: PRIM, horas: 5 });
  await setCat('materias', 'm3', { nombre: 'Ciencias Naturales', grados: PRIM, horas: 3 });
  await setCat('materias', 'm4', { grados: PRIM, horas: 3 });
  await setCat('materias', 'm5', { grados: [...PRIM, 'g8'], horas: 4 });
  await setCat('materias', 'm6', { grados: PRIM, horas: 2 });
  await setCat('materias', 'm7', { codigo: 'ART-01', nombre: 'Ed. Artística', grados: PRIM, horas: 2 }, {});
  await setCat('rubricas', 'r1', { materias: ['m1', 'm2', 'm3', 'm4', 'm5', 'm7'], crit: 'Razonamiento 17.5%, Comunicación 17.5%, Modelación 17.5%, Resolución 17.5%, Examen 30%' });
  const DOC: [string, string, string, string, string][] = [
    ['d5', 'Carmen Vidal', 'Lengua Española', 'usr_cvidal', 'Director Académico'], ['d6', 'Kevin Smith', 'Inglés', 'usr_smith', 'Docente'], ['d7', 'Luisa Batista', 'Ciencias Naturales', 'usr_batista', 'Docente'],
    ['d8', 'Juan Marte', 'Ciencias Sociales', 'usr_marte', 'Docente'], ['d9', 'José Cruz', 'Educación Física', 'usr_cruz', 'Docente'], ['d10', 'Mariana Rosario', 'Educación Artística', 'usr_mrosario', 'Docente'],
  ];
  for (const [i, [id, nombre, esp, usuario, rol]] of DOC.entries()) {
    await setCat('docentes', id, {}, { nombre, cedula: '001-' + String(5678901 + i * 1117).padStart(7, '0') + '-' + (i % 9), esp, email: usuario.replace('usr_', '') + '@lospinos.edu.do', usuario, rol, materias: [], secciones: [] });
  }
  await setCat('secciones', 's2', { aula: 'a3' });
  const SEC: [string, string, string, string, string][] = [['s6', 'g7', 'B', 't2', 'a4'], ['s7', 'g5', 'B', 't1', 'a4'], ['s8', 'g4', 'A', 't2', 'a4'], ['s9', 'g3', 'A', 't3', 'a4'], ['s10', 'g3', 'B', 't1', 'a4']];
  for (const [id, grado, seccion, tanda, aula] of SEC) await setCat('secciones', id, {}, { grado, seccion, tanda, aula, cap: 30, insc: 0 });

  // ---- Asignaciones docente x sección x materia (Rafael Almonte -> 5to A -> Matemáticas, etc.) ----
  for (const [seccionId, materiaId, docenteId, aulas] of ASIG) {
    await prisma.acadAsignacion.upsert({ where: { seccionId_materiaId: { seccionId, materiaId } }, update: {}, create: { seccionId, materiaId, docenteId, aulas: JSON.stringify(aulas) } });
  }

  // ---- Nómina heredada de 5to A (la demo la lista aunque no esté en el Directorio); los enlazados salen de Alumno ----
  await prisma.acadRoster.updateMany({ where: { seccion: '5to A' }, data: { seccion: 's1' } });
  await prisma.acadNota.updateMany({ where: { materia: 'Matemáticas' }, data: { materia: 'm1' } });
  for (const [i, nombre] of STU_ATT.entries()) {
    const id = 'r5a-' + String(i + 1).padStart(2, '0');
    await prisma.acadRoster.upsert({ where: { id }, update: {}, create: { id, seccion: 's1', orden: i + 1, nombre } });
    if (i < G0.length) {
      const [c1, c2, c3, c4, ex] = G0[i].map(v => (v === '' ? null : Number(v)));
      await prisma.acadNota.upsert({
        where: { rosterId_materia_periodo: { rosterId: id, materia: 'm1', periodo: '1' } },
        update: {}, create: { rosterId: id, materia: 'm1', periodo: '1', c1, c2, c3, c4, ex },
      });
    }
  }
  // Una sola fuente de verdad: los estudiantes de la nómina que el DIR0 del prototipo también tiene en 5to A se enlazan a Alumno (mismo id/carnet y nombre).
  // El resto (Abreu, Báez, Castillo, Guzmán, Hernández, Jiménez, Ortiz, Peña, Quezada, Santana) está en STU/STU_ATT pero no en DIR0 (o con otro
  // grado/nombre): discrepancia de la propia demo; se dejan solo en la nómina para no alterar matrícula ni directorio.
  const LINK: Record<string, string> = { 'r5a-10': '0412', 'r5a-11': '0433', 'r5a-06': '0421', 'r5a-15': '0447', 'r5a-05': '0461', 'r5a-04': '0472' };
  for (const [rid, aid] of Object.entries(LINK)) {
    const a = await prisma.alumno.findUnique({ where: { id: aid } });
    if (a) await prisma.acadRoster.update({ where: { id: rid }, data: { alumnoId: a.id, nombre: `${a.apellidos}, ${a.nombres}` } });
  }
  // ---- Horarios guardados: 5to A (SCHED0) y los de las demás secciones (de ahí salen los choques de docente y aula) ----
  const horarios: [string, string, string][] = [
    ...Object.entries(SCHED0).map(([slot, m]) => ['s1', slot, MID[m]] as [string, string, string]),
    ...Object.entries(OTROS).flatMap(([sec, l]) => l.map(([slot, m]) => [sec, slot, MID[m]] as [string, string, string])),
    ['s1', '_aula:m7', 'a7'],
  ];
  for (const [seccion, slot, materia] of horarios) {
    await prisma.acadHorario.upsert({ where: { seccion_slot: { seccion, slot } }, update: {}, create: { seccion, slot, materia } });
  }
  for (const [i, r] of X0.entries()) {
    const id = 'EXT-' + String(i + 1).padStart(3, '0');
    const cupo = r[8] as number, inscritos = r[9] as number;
    await prisma.acadExtra.upsert({
      where: { id }, update: {},
      create: { id, name: r[0] as string, cat: r[1] as string, kind: r[2] as string, instructor: r[3] as string, lugar: r[4] as string, dias: r[5] as string, hora: r[6] as string, grados: r[7] as string, cupo, inscritos, costo: r[10] as number, ini: (r[11] as string) || '', sem: (r[12] as number) || 0, estado: inscritos >= cupo ? 'Cupo lleno' : 'Abierta' },
    });
  }
  console.log('seed académico ok');
}
