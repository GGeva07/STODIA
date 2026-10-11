/**
 * Semilla del grupo académico (mock del prototipo: STU_ATT, G0, X0, SCHED0). Idempotente: no pisa registros existentes.
 * Los catálogos (aulas, materias, rúbrica, docentes, secciones) los siembra seed-estructura.ts en tablas tipadas; aquí van las asignaciones,
 * la nómina heredada de 5to A, las notas, los horarios y las actividades extracurriculares.
 */
import { prisma } from './db';
import { gradosDeRango, resolverRefs } from './lib/extras';
import { cicloIdActivo, periodoId } from './lib/ciclo';

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
/** Aula elegida entre las posibles (antes la fila `_aula:` del horario de 5to A): Ed. Artística de s1 en la Sala Audiovisual. */
const ELEGIDAS: Record<string, string> = { 's1|m7': 'a7' };

export default async function seedAcademico() {
  const cicloId = await cicloIdActivo(), periodo1 = (await periodoId(cicloId, '1'))!;
  // ---- Asignaciones docente x sección x materia (Rafael Almonte -> 5to A, 5to B y 6to A -> Matemáticas, etc.) ----
  // Pueden existir ya como «heredadas» del perfil del docente (seed-estructura): aquí pasan a ser explícitas. Si ya son explícitas no se tocan.
  for (const [seccionId, materiaId, docenteId, aulas] of ASIG) {
    const cur = await prisma.acadAsignacion.findUnique({ where: { cicloId_seccionId_materiaId: { cicloId, seccionId, materiaId } }, include: { aulas: true } });
    const a = !cur
      ? await prisma.acadAsignacion.create({ data: { cicloId, docenteId, seccionId, materiaId, heredada: false }, include: { aulas: true } })
      : cur.heredada ? await prisma.acadAsignacion.update({ where: { id: cur.id }, data: { docenteId, heredada: false }, include: { aulas: true } }) : cur;
    if (!a.aulas.length && aulas.length) await prisma.asignacionAula.createMany({ data: aulas.map((aulaId, orden) => ({ asignacionId: a.id, aulaId, orden })) });
    const el = ELEGIDAS[`${seccionId}|${materiaId}`];
    if (el && !a.aulaElegidaId) await prisma.acadAsignacion.update({ where: { id: a.id }, data: { aulaElegidaId: el } });
  }

  // ---- Nómina heredada de 5to A (la demo la lista aunque no esté en el Directorio); los enlazados salen de Alumno ----
  for (const [i, nombre] of STU_ATT.entries()) {
    const id = 'r5a-' + String(i + 1).padStart(2, '0');
    await prisma.acadRoster.upsert({ where: { id }, update: {}, create: { id, seccionId: 's1', orden: i + 1, nombre } });
    if (i < G0.length) {
      const [c1, c2, c3, c4, ex] = G0[i].map(v => (v === '' ? null : Number(v)));
      await prisma.acadNota.upsert({
        where: { rosterId_materiaId_periodoId: { rosterId: id, materiaId: 'm1', periodoId: periodo1 } },
        update: {}, create: { rosterId: id, materiaId: 'm1', periodoId: periodo1, c1, c2, c3, c4, ex },
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
  ];
  for (const [seccionId, slot, materiaId] of horarios) {
    await prisma.acadHorario.upsert({ where: { cicloId_seccionId_slot: { cicloId, seccionId, slot } }, update: {}, create: { cicloId, seccionId, slot, materiaId } });
  }
  for (const [i, r] of X0.entries()) {
    const id = 'EXT-' + String(i + 1).padStart(3, '0');
    const cupo = r[8] as number, inscritos = r[9] as number;
    if (await prisma.acadExtra.findUnique({ where: { id } })) continue;
    const refs = await resolverRefs(prisma, r[3] as string, r[4] as string), gs = await gradosDeRango(prisma, r[7] as string);
    if (!gs) throw new Error('Grados de la actividad no reconocidos: ' + r[7]);
    await prisma.acadExtra.create({
      data: { id, name: r[0] as string, cat: r[1] as string, kind: r[2] as string, instructor: r[3] as string, docenteId: refs.docenteId, lugar: r[4] as string, aulaId: refs.aulaId, dias: r[5] as string, hora: r[6] as string, cupo, inscritos, costo: r[10] as number, ini: (r[11] as string) || '', sem: (r[12] as number) || 0, estado: inscritos >= cupo ? 'Cupo lleno' : 'Abierta', grados: { create: gs.map(gradoId => ({ gradoId })) } },
    });
  }
  console.log('seed académico ok');
}
