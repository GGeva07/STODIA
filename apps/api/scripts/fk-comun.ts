/**
 * Utilidades comunes de scripts/fk-auditar.ts y scripts/fk-reparar.ts (motor-agnosticas: SQLite y SQL Server).
 * Todo el acceso es por Prisma ($queryRawUnsafe / $executeRawUnsafe); el motor se deduce de DATABASE_URL.
 */
import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
export const esSqlServer = (process.env.DATABASE_URL ?? '').startsWith('sqlserver:');
/** Identificador entrecomillado segun el motor. */
export const q = (id: string) => (esSqlServer ? `[${id.replace(/]/g, ']]')}]` : `"${id.replace(/"/g, '""')}"`);
/** Tabla con esquema (SQL Server) o sin el (SQLite). */
export const tbl = (t: string) => (esSqlServer ? `[dbo].${q(t)}` : q(t));

/** Todo valor numerico que devuelve el motor (bigint en SQLite, number en SQL Server) como number. */
export const num = (v: unknown) => Number(v ?? 0);
/** Escribe los parametros como «?» y los traduce al motor (SQL Server usa @P1, @P2...). No usar «?» dentro de literales de texto. */
const adaptar = (sql: string) => { if (!esSqlServer) return sql; let i = 0; return sql.split('?').reduce((acc, parte, k) => (k === 0 ? parte : acc + '@P' + k + parte), ''); };
export async function filas<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
  return (await prisma.$queryRawUnsafe(adaptar(sql), ...params)) as T[];
}
export async function cuenta(sql: string, ...params: unknown[]): Promise<number> {
  const r = await filas<{ n: unknown }>(sql, ...params);
  return num(r[0]?.n);
}
export const ejecutar = (sql: string, ...params: unknown[]) => prisma.$executeRawUnsafe(adaptar(sql), ...params);

/** Modelos y relaciones del schema vigente (fuente unica: lo que Prisma sabe de las FK). */
export const modelos = Prisma.dmmf.datamodel.models;
export interface Relacion { hijo: string; col: string; padre: string; padreCol: string; opcional: boolean; onDelete: string }
export const relaciones: Relacion[] = modelos.flatMap(m =>
  m.fields.filter(f => f.kind === 'object' && f.relationFromFields?.length).map(f => {
    const col = f.relationFromFields![0];
    const campo = m.fields.find(x => x.name === col)!;
    return { hijo: m.name, col, padre: f.type, padreCol: f.relationToFields![0], opcional: !campo.isRequired, onDelete: String((f as unknown as { relationOnDelete?: string }).relationOnDelete ?? 'NoAction') };
  }));

export async function tablaExiste(t: string): Promise<boolean> {
  return esSqlServer
    ? (await cuenta(`SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = '${t}'`)) > 0
    : (await cuenta(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='${t}'`)) > 0;
}
export interface InfoCol { name: string; notNull: boolean }
export async function columnas(t: string): Promise<InfoCol[]> {
  if (esSqlServer) return (await filas<{ c: string; nulo: string }>(`SELECT COLUMN_NAME AS c, IS_NULLABLE AS nulo FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${t}'`)).map(r => ({ name: r.c, notNull: r.nulo === 'NO' }));
  return (await filas<{ name: string; notnull: unknown }>(`PRAGMA table_info(${q(t)})`)).map(r => ({ name: r.name, notNull: num(r.notnull) === 1 }));
}
export async function tieneCol(t: string, c: string): Promise<boolean> {
  return (await tablaExiste(t)) && (await columnas(t)).some(x => x.name === c);
}

/** Cedula normalizada (solo digitos), igual que lib/personas.digits. */
export const digitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
export const sinAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Catalogo (tabla generica) por tipo: filas con su JSON ya interpretado. */
export async function catalogo(tipo: string): Promise<{ id: string; cid: string; estado: string; d: Record<string, any> }[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!(await tablaExiste('Catalogo'))) return [];
  const r = await filas<{ id: string; estado: string; data: string }>(`SELECT id, estado, data FROM ${tbl('Catalogo')} WHERE tipo = '${tipo}'`);
  return r.map(x => ({ id: x.id, cid: x.id.slice(x.id.indexOf(':') + 1), estado: x.estado, d: JSON.parse(x.data) }));
}

export function tabla(titulo: string, rows: Record<string, unknown>[]) {
  console.log(`\n== ${titulo} ==`);
  if (rows.length) console.table(rows); else console.log('(sin hallazgos)');
}
