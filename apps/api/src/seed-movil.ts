import { prisma } from './db';


const NOTAS: Record<string, [string, number][]> = {
  '0412': [['Matemáticas', 82], ['Lengua Española', 86.5], ['Inglés', 91], ['Ciencias Naturales', 84], ['Ciencias Sociales', 88.5]],
  // Nombres EXACTOS del catálogo de materias (MobNota.materia se cruza por nombre hasta la Fase 2).
  '0587': [['Taller de Lectoescritura', 93], ['Matemáticas', 90.5], ['Inglés', 95], ['Ciencias Naturales', 88]],
};

/** Idempotente (upsert con update vacío). Requiere que los alumnos ya estén sembrados. */
export async function seedMovil() {
  for (const [alumnoId, rows] of Object.entries(NOTAS))
    for (const [i, [materia, valor]] of rows.entries())
      await prisma.mobNota.upsert({ where: { id: `${alumnoId}-${i}` }, update: {}, create: { id: `${alumnoId}-${i}`, alumnoId, materia, valor } });
  await prisma.mobWallet.upsert({ where: { alumnoId: '0412' }, update: {}, create: { alumnoId: '0412', saldo: 850, limite: 300 } });
  await prisma.mobWallet.upsert({ where: { alumnoId: '0587' }, update: {}, create: { alumnoId: '0587', saldo: 320, limite: 200 } });
  if ((await prisma.mobAcceso.count()) === 0)
    await prisma.mobAcceso.createMany({ data: [
      { alumnoId: '0412', hora: '12:04:51', resultado: 'alert' },
      { alumnoId: '0412', hora: '07:41:10', resultado: 'ok' },
      { alumnoId: '0587', hora: '12:02:33', resultado: 'ok' },
      { alumnoId: '0587', hora: '07:44:02', resultado: 'ok' },
    ] });
}

/** Solo demo (SEED_DEMO=true): activa los modos simulados para presentaciones y siembra los datos de ejemplo del comedor. No pisa lo que ya exista. */
export async function seedDemoModos() {
  const put = async (clave: string, v: unknown) => { if (!(await prisma.sisConfig.findUnique({ where: { clave } }))) await prisma.sisConfig.create({ data: { clave, valor: JSON.stringify(v) } }); };
  await put('pasarela', { activa: false, proveedor: null, demo: true });
  await put('canales', { demo: true });
  await put('comedor', {
    recargas: [500, 1000, 2000], encabezado: 'Comedor Central · Turno almuerzo 12:00–13:30 · Escáner QR / NFC conectado',
    consumos: [{ l: 'Merienda', p: 120 }, { l: 'Jugo natural', p: 80 }, { l: 'Sándwich', p: 175 }],
  });
}
