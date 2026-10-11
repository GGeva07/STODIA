import bcrypt from 'bcryptjs';
import { config } from './config';
import { prisma } from './db';
import { seedMovil, seedMovilNotas, seedDemoModos } from './seed-movil';
import { seedEstructura } from './seed-estructura';
import { resolverSeccion } from './lib/catalogos-tipados';
import { seedOperacion } from './seed-operacion';
import { DIR0, SEED_USERS, norm } from './seed-data';
import { seedSupervisorPin } from './lib/supervisor';
import { asegurarIndices } from './lib/db-indices';
// Imports estaticos: el import() dinamico sin extension falla en la build CJS (Docker): Node lo resuelve como ESM.
import { seedFinanzasBase, seedFinanzasCartera } from './seed-finanzas';
import seedAcademico from './seed-academico';
import seedSistema from './seed-sistema';
import seedPersonas from './seed-personas';
import { seedInstalacion } from './seed-instalacion';
import { sembrarDemoGrande } from './seed-demo-grande';
import { seedCatalogos } from './seed-catalogos';
import { seedCiclosDemo, seedCicloAnterior } from './seed-ciclos';
import { reconciliarMatriculas } from './lib/matricula';
import { recalcularHistoricas } from './lib/fiscal';
import { reconciliarTutorAlumno } from './lib/tutor-alumno';

/** Idempotente: se puede ejecutar en cada arranque. No pisa datos de registros ya existentes. */
async function main() {
  await asegurarIndices();
  if (!config.seedDemo) {
    await seedInstalacion();
    await seedSupervisorPin(false);
    return;
  }
  if (!config.seedPassword) throw new Error('SEED_PASSWORD es obligatorio en producción');
  const passwordHash = await bcrypt.hash(config.seedPassword, 10);
  for (const u of SEED_USERS) {
    await prisma.user.upsert({ where: { usuario: u.usuario }, update: {}, create: { ...u, passwordHash } });
  }

  await seedCiclosDemo(); // ciclos lectivos y sus periodos: primero, todo lo "por ciclo" los referencia por FK

  // Catálogos TIPADOS (Fase 2A estructura académica + Fase 2B cajas, rutas, becas, medios de pago, dietas, alergias): antes que los alumnos, que los referencian por FK.
  await seedEstructura();

  // Tutores derivados de los alumnos (igual que el prototipo)
  const byTutor = new Map<string, string>(); // nombre -> tel
  for (const d of DIR0) if (!byTutor.has(d[7])) byTutor.set(d[7], d[12]);
  const tutorIdByName = new Map<string, string>();
  const usuarios = new Map((await prisma.user.findMany({ select: { id: true, usuario: true } })).map(u => [u.usuario, u.id]));
  let i = 0;
  for (const [nombre, tel] of byTutor) {
    const [first, second = ''] = nombre.split(' ');
    const id = 'u' + (i + 1);
    const femenino = /^(Ana|María|Carmen|Rosa|Laura|Patricia)/.test(nombre) || /de |a$/.test(first);
    await prisma.tutor.upsert({
      where: { id },
      update: {},
      create: {
        id,
        nombre,
        cedula: '001' + String(1504321 + i * 7919).padStart(7, '0') + (i % 9), // solo digitos (11), UNIQUE
        parentesco: femenino ? 'Madre' : 'Padre',
        tipo: 'Financiero y académico',
        tel,
        email: `${norm(first)}.${norm(second)}@correo.do`,
        // Cuenta del portal: solo si el usuario de login EXISTE (FK a User); los demas tutores quedan sin acceso (NULL), no con un nombre de usuario inexistente.
        userId: (i < 4 ? usuarios.get(`${norm(first)[0]}.${norm(second)}`) : undefined) ?? null,
      },
    });
    tutorIdByName.set(nombre, id);
    i++;
  }

  for (const r of DIR0) {
    // Los alumnos de muestra son de Primaria: '1ro'..'6to' existen también en Secundaria, así que se resuelve la sección prefiriendo ese nivel.
    const sec = await resolverSeccion(r[4], r[5], r[6], 'niv-primaria');
    if ('error' in sec) throw new Error(`Alumno ${r[0]}: ${sec.error}`);
    await prisma.alumno.upsert({
      where: { id: r[0] },
      update: {},
      create: {
        id: r[0], code: 'EST-2026-' + r[0], nombres: r[1], apellidos: r[2], fnac: r[3], seccionId: sec.id,
        cuenta: r[8], estado: r[9], dir: r[11], tel: r[12], tutorId: tutorIdByName.get(r[7])!,
      },
    });
    // Alergias (N:M con el catalogo Alergia): los nombres de DIR0 son los del catalogo base.
    for (const nombre of r[10].split(',').map(x => x.trim()).filter(Boolean)) {
      const al = await prisma.alergia.findUnique({ where: { nombre } });
      if (!al) throw new Error(`Alumno ${r[0]}: la alergia «${nombre}» no existe en el catalogo`);
      await prisma.alumnoAlergia.upsert({ where: { alumnoId_alergiaId: { alumnoId: r[0], alergiaId: al.id } }, update: {}, create: { alumnoId: r[0], alergiaId: al.id } });
    }
  }
  await seedMovil();
  await seedDemoModos();
  await seedOperacion();
  // Orden dictado por las FK: recibos y planes -> academico (actividades: ServicioAlumno las referencia) -> servicios y contratos del alumno -> cartera (cargos referencian servicios).
  await seedFinanzasBase();
  await seedAcademico();
  await seedPersonas();
  await seedFinanzasCartera();
  await seedSistema();
  await seedSupervisorPin(true);
  if (process.env.DEMO_SCALE === 'large') await sembrarDemoGrande(); // solo SEED_DEMO=true (este camino)
  await seedCatalogos(); // catálogos maestros de prueba (solo SEED_DEMO=true; aditivo e idempotente)
  await seedMovilNotas(); // notas del portal: necesitan las materias del catálogo (FK MobNota.materiaId)
  // Matricula del ciclo activo y vinculos tutor-alumno de todo alumno (fuente de verdad del historial y de los tutores), y luego el historial de los ciclos cerrados.
  console.log(`matrículas del ciclo activo: +${await reconciliarMatriculas()} · vínculos tutor-alumno: +${await reconciliarTutorAlumno()}`);
  await seedCicloAnterior();
  console.log('secuencias fiscales históricas (rango observado de los NCF sembrados):', JSON.stringify(await recalcularHistoricas()));
  console.log(`seed ok: ${SEED_USERS.length} usuarios, ${DIR0.length} alumnos, ${byTutor.size} tutores`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
