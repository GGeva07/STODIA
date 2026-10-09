import { Prisma, PrismaClient } from '@prisma/client';

const base = new PrismaClient();

/** true cuando DATABASE_URL apunta a SQL Server (schema generado para ese motor). */
export const esSqlServer = (process.env.DATABASE_URL ?? '').startsWith('sqlserver:');

/**
 * SQLite devuelve las filas sin ORDER BY en orden de insercion; SQL Server no garantiza ningun orden.
 * En SQL Server, todo findMany sin orderBy explicito se ordena por la clave primaria del modelo (resultado determinista).
 * Los campos "Json" del dominio ya son String en el schema (no hay columnas Json), asi que no hace falta serializar nada
 * y el codigo de los modulos es identico en ambos motores.
 */
const pk = new Map(Prisma.dmmf.datamodel.models.map(m => [m.name, m.fields.find(f => f.isId)?.name] as const));

export const prisma: PrismaClient = esSqlServer
  ? (base.$extends({
      name: 'orden-determinista',
      query: {
        $allModels: {
          findMany({ model, args, query }) {
            const id = pk.get(model);
            if (id && args.orderBy === undefined) args = { ...args, orderBy: { [id]: 'asc' } };
            return query(args);
          },
        },
      },
    }) as unknown as PrismaClient)
  : base;
