import { prisma } from './db';

const CARGOS = [
  ['c09', '0412', 'Colegiatura Septiembre 2026', '01/09/2026', 8500, 'Vencida'],
  ['m09', '0412', 'Recargo por mora · Sep. (3%)', '06/09/2026', 255, 'Vencida'],
  ['c10', '0412', 'Colegiatura Octubre 2026', '01/10/2026', 8500, 'Vencida'],
  ['k10', '0412', 'Plan Comedor · Octubre', '01/10/2026', 3200, 'Vencida'],
  ['f10', '0412', 'Academia de Fútbol · Octubre', '15/10/2026', 1500, 'Por vencer'],
  ['seg', '0412', 'Seguro estudiantil contra accidentes', '15/10/2026', 1200, 'Por vencer'],
  ['s10', '0587', 'Colegiatura Octubre 2026', '10/10/2026', 7020, 'Por vencer'],
  ['t10', '0587', 'Transporte Zona A · Octubre', '10/10/2026', 2800, 'Por vencer'],
  ['c11', '0412', 'Colegiatura Noviembre 2026', '01/11/2026', 8500, 'Pendiente'],
] as const;

const NOTAS: Record<string, [string, number][]> = {
  '0412': [['Matemáticas', 82], ['Lengua Española', 86.5], ['Inglés', 91], ['Ciencias Naturales', 84], ['Ciencias Sociales', 88.5]],
  '0587': [['Lectoescritura', 93], ['Matemáticas', 90.5], ['Inglés', 95], ['Ciencias', 88]],
};

/** Idempotente (upsert con update vacío). Requiere que los alumnos ya estén sembrados. */
export async function seedMovil() {
  for (const [id, alumnoId, concepto, vence, monto, estado] of CARGOS)
    await prisma.mobCargo.upsert({ where: { id }, update: {}, create: { id, alumnoId, concepto, vence, monto, estado } });
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
