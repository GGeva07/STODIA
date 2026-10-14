import { Prisma, PrismaClient } from '@prisma/client';
import { categoriaCargo } from './lib/categorias';

/**
 * SQLite: con varias peticiones escribiendo a la vez, una conexion que espera el candado de escritura falla en 5 s por defecto («database is locked»). `socket_timeout` (= busy_timeout de SQLite)
 * lo sube a 60 s para que las escrituras concurrentes (cobros, numeracion fiscal) se encolen en vez de fallar. Una URL que ya lo trae no se toca.
 */
const urlEntorno = process.env.DATABASE_URL ?? '';
const urlSqlite = /socket_timeout=/.test(urlEntorno) ? urlEntorno : urlEntorno + (urlEntorno.includes('?') ? '&' : '?') + 'socket_timeout=60';
const crudo = urlEntorno.startsWith('file:') ? new PrismaClient({ datasources: { db: { url: urlSqlite } } }) : new PrismaClient();

/**
 * CATEGORIA DEL CARGO (Informes etapa 3): todo FinCobroItem que se crea (create / createMany / upsert, tambien dentro de transacciones y desde los seeds) sale con
 * `categoria` calculada con lib/categorias.categoriaCargo(tipo, concepto) si quien lo crea no la fijo. Es puro (sin consultas), asi que no puede bloquear dentro de una transaccion.
 * Los sitios que conocen mejor la categoria (cargos de articulos de tienda en el expediente) la pasan explicitamente.
 */
type CargoIn = { tipo?: string; con?: string; categoria?: string | null };
const conCategoria = <T extends CargoIn>(d: T): T => (d.categoria === undefined && typeof d.tipo === 'string' ? { ...d, categoria: categoriaCargo(d.tipo, d.con ?? '') } : d);
const base = crudo.$extends({
  name: 'categoria-cargo',
  query: {
    finCobroItem: {
      create({ args, query }) { return query({ ...args, data: conCategoria(args.data as CargoIn) as typeof args.data }); },
      createMany({ args, query }) { const d = args.data; return query({ ...args, data: (Array.isArray(d) ? d.map(x => conCategoria(x as CargoIn)) : conCategoria(d as CargoIn)) as typeof d }); },
      upsert({ args, query }) { return query({ ...args, create: conCategoria(args.create as CargoIn) as typeof args.create }); },
    },
  },
}) as unknown as PrismaClient;

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
