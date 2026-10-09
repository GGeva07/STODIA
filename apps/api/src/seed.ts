import bcrypt from 'bcryptjs';
import { config } from './config';
import { prisma } from './db';
import { seedMovil, seedDemoModos } from './seed-movil';
import { seedOperacion } from './seed-operacion';
import { CAT_SEED, DIR0, SEED_USERS, norm } from './seed-data';
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
import { alinearPlanesAli } from './lib/ali-catalogos';

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

  for (const [tipo, rows] of Object.entries(CAT_SEED)) {
    for (const r of rows) {
      const id = `${tipo}:${r.id}`;
      await prisma.catalogo.upsert({
        where: { id },
        update: {},
        create: { id, tipo, data: JSON.stringify(r), estado: r.estado ?? 'Activo' },
      });
    }
  }

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
    await prisma.alumno.upsert({
      where: { id: r[0] },
      update: {},
      create: {
        id: r[0], code: 'EST-2026-' + r[0], nombres: r[1], apellidos: r[2], fnac: r[3], grado: r[4], sec: r[5],
        tanda: r[6], cuenta: r[8], estado: r[9], alg: r[10], dir: r[11], tel: r[12], tutorId: tutorIdByName.get(r[7])!,
      },
    });
  }
  await seedMovil();
  await seedDemoModos();
  await seedOperacion();
  // Orden dictado por las FK: recibos y planes -> servicios y contratos del alumno -> cartera (cargos referencian servicios) -> academico.
  await seedFinanzasBase();
  await seedPersonas();
  await seedFinanzasCartera();
  await seedAcademico();
  await seedSistema();
  await seedSupervisorPin(true);
  if (process.env.DEMO_SCALE === 'large') await sembrarDemoGrande(); // solo SEED_DEMO=true (este camino)
  await seedCatalogos(); // catálogos maestros de prueba (solo SEED_DEMO=true; aditivo e idempotente)
  await alinearPlanesAli(); // banderas posicionales de los planes de alimentación = longitud de los catálogos finales
  console.log(`seed ok: ${SEED_USERS.length} usuarios, ${DIR0.length} alumnos, ${byTutor.size} tutores`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
