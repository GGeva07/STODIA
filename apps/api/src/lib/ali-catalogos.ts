import { prisma } from '../db';

/**
 * Catálogos de Alimentación sobre la tabla genérica Catalogo (id = '<tipo>:<NN>', data = {id, nombre}).
 * Se siembran con los valores base (los de la demo) solo si el tipo no tiene filas; después el cliente es dueño de ellos.
 * Los planes (AliPlan.meals / AliPlan.diets) guardan banderas por POSICIÓN del catálogo (orden por id).
 */
export const ALI_TIPOS = ['comidas', 'dietas', 'alergias'] as const;
export type AliTipo = (typeof ALI_TIPOS)[number];
const BASE: Record<AliTipo, string[]> = {
  comidas: ['Desayuno', 'Merienda AM', 'Almuerzo', 'Merienda PM'],
  dietas: ['Sin gluten', 'Sin lácteos', 'Sin maní / frutos secos', 'Vegetariano'],
  alergias: ['Maní', 'Frutos secos', 'Lactosa', 'Gluten', 'Huevo', 'Mariscos'],
};
export const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

export async function ensureCatalogosAli() {
  for (const tipo of ALI_TIPOS) {
    if (await prisma.catalogo.count({ where: { tipo } })) continue;
    for (const [i, nombre] of BASE[tipo].entries()) {
      const id = String(i + 1).padStart(2, '0');
      await prisma.catalogo.upsert({ where: { id: `${tipo}:${id}` }, update: {}, create: { id: `${tipo}:${id}`, tipo, data: JSON.stringify({ id, nombre, estado: 'Activo' }), estado: 'Activo' } });
    }
  }
}
export async function catalogosAli(): Promise<Record<AliTipo, string[]>> {
  await ensureCatalogosAli();
  const rows = await prisma.catalogo.findMany({ where: { tipo: { in: [...ALI_TIPOS] }, estado: 'Activo' }, orderBy: { id: 'asc' } });
  const out: Record<AliTipo, string[]> = { comidas: [], dietas: [], alergias: [] };
  for (const r of rows) out[r.tipo as AliTipo].push(String(JSON.parse(r.data).nombre));
  return out;
}
/**
 * Las banderas de AliPlan.meals / AliPlan.diets son POSICIONALES respecto de los catálogos comidas y dietas (orden por id). Esta función las
 * deja con EXACTAMENTE la longitud del catálogo vigente (completa con false o recorta): sin esto un plan desalineado marca dietas equivocadas.
 * Idempotente; la usan los seeds y scripts/fk-reparar.ts.
 */
export async function alinearPlanesAli(): Promise<number> {
  const [cat, planes] = await Promise.all([catalogosAli(), prisma.aliPlan.findMany()]);
  const ajusta = (json: string, n: number) => { const a = JSON.parse(json) as boolean[]; return Array.from({ length: n }, (_, i) => !!a[i]); };
  let cambios = 0;
  for (const p of planes) {
    const meals = JSON.stringify(ajusta(p.meals, cat.comidas.length)), diets = JSON.stringify(ajusta(p.diets, cat.dietas.length));
    if (meals !== p.meals || diets !== p.diets) { await prisma.aliPlan.update({ where: { id: p.id }, data: { meals, diets } }); cambios++; }
  }
  return cambios;
}
/** Garantiza las 5 filas del menú semanal (Lunes a Viernes); el plato queda vacío hasta que el encargado lo defina. */
export async function ensureMenuSemanal() {
  if ((await prisma.aliMenu.count()) >= DIAS_SEMANA.length) return;
  for (const [orden, dia] of DIAS_SEMANA.entries()) await prisma.aliMenu.upsert({ where: { orden }, update: {}, create: { orden, dia, plato: '', algs: '[]' } });
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** Lunes a viernes de la semana de `hoy` (sábado/domingo muestran la semana siguiente). `hoy` = {y,m,d} en la zona del colegio. */
export function semanaDe(hoy: { y: number; m: number; d: number }) {
  const t = new Date(Date.UTC(hoy.y, hoy.m - 1, hoy.d));
  const dow = t.getUTCDay(); // 0 dom .. 6 sáb
  const lunes = new Date(t.getTime() + (dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow) * 86400000);
  const dias = DIAS_SEMANA.map((_, i) => new Date(lunes.getTime() + i * 86400000));
  const [a, b] = [dias[0], dias[4]];
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const mismoMes = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();
  const label = mismoMes
    ? `Semana del ${a.getUTCDate()} al ${b.getUTCDate()} de ${MESES[b.getUTCMonth()]} de ${b.getUTCFullYear()}`
    : a.getUTCFullYear() === b.getUTCFullYear()
      ? `Semana del ${a.getUTCDate()} de ${MESES[a.getUTCMonth()]} al ${b.getUTCDate()} de ${MESES[b.getUTCMonth()]} de ${b.getUTCFullYear()}`
      : `Semana del ${a.getUTCDate()} de ${MESES[a.getUTCMonth()]} de ${a.getUTCFullYear()} al ${b.getUTCDate()} de ${MESES[b.getUTCMonth()]} de ${b.getUTCFullYear()}`;
  return { desde: iso(a), hasta: iso(b), label, diaMes: dias.map(x => x.getUTCDate()) };
}
