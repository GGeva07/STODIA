import { Prisma, PrismaClient } from '@prisma/client';

/**
 * SQLite: con varias peticiones escribiendo a la vez, una conexion que espera el candado de escritura falla en 5 s por defecto («database is locked»). `socket_timeout` (= busy_timeout de SQLite)
 * lo sube a 60 s para que las escrituras concurrentes (cobros, numeracion fiscal) se encolen en vez de fallar. Una URL que ya lo trae no se toca.
 */
const urlEntorno = process.env.DATABASE_URL ?? '';
const urlSqlite = /socket_timeout=/.test(urlEntorno) ? urlEntorno : urlEntorno + (urlEntorno.includes('?') ? '&' : '?') + 'socket_timeout=60';
const base = urlEntorno.startsWith('file:') ? new PrismaClient({ datasources: { db: { url: urlSqlite } } }) : new PrismaClient();

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
