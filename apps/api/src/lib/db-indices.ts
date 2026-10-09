import { prisma } from '../db';

/**
 * Indices unicos FILTRADOS (unicidad solo sobre filas con valor). Prisma no los modela: en SQL Server un UNIQUE normal sobre una columna
 * NULLable admite UN solo NULL, asi que las columnas opcionales que deben ser unicas no llevan @unique en el schema y la unicidad se
 * garantiza aqui. Idempotente y valido en SQLite y SQL Server; se invoca al arrancar la API, en los seeds, en la migracion de datos y
 * en scripts/fk-reparar.ts.
 *
 *  - AcadRoster.alumnoId: un Alumno tiene a lo sumo una nomina enlazada.
 *  - Tutor.userId: una cuenta de login pertenece a lo sumo a un tutor.
 */
export const INDICES_FILTRADOS: { nombre: string; tabla: string; columna: string }[] = [
  { nombre: 'UX_AcadRoster_alumnoId', tabla: 'AcadRoster', columna: 'alumnoId' },
  { nombre: 'UX_Tutor_userId', tabla: 'Tutor', columna: 'userId' },
];

export async function asegurarIndices(): Promise<void> {
  const sqlserver = (process.env.DATABASE_URL ?? '').startsWith('sqlserver:');
  for (const ix of INDICES_FILTRADOS) {
    try {
      if (sqlserver) {
        await prisma.$executeRawUnsafe(
          `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = '${ix.nombre}' AND object_id = OBJECT_ID('dbo.${ix.tabla}'))
             CREATE UNIQUE INDEX ${ix.nombre} ON dbo.${ix.tabla}(${ix.columna}) WHERE ${ix.columna} IS NOT NULL`,
        );
      } else {
        await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "${ix.nombre}" ON "${ix.tabla}"("${ix.columna}") WHERE "${ix.columna}" IS NOT NULL`);
      }
    } catch (e) {
      console.error(`[db] no se pudo asegurar el indice unico filtrado ${ix.nombre}:`, (e as Error).message);
    }
  }
}
