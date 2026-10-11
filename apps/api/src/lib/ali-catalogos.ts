import { prisma } from '../db';
import { asegurarCatalogosBase } from './catalogos-tipados';

/**
 * Catálogos de Alimentación sobre TABLAS TIPADAS (Comida, Dieta, Alergia; Fase 2B). Los planes (AliPlan) guardan sus comidas y dietas en las tablas
 * puente AliPlanComida / AliPlanDieta. La API de Alimentación conserva la forma histórica: meals / diets = banderas por POSICIÓN respecto de la lista de
 * comidas / dietas ACTIVAS ordenadas por id (la misma que devuelve `catalogos`); aquí se traducen de y hacia las filas puente.
 */
export type AliTipo = 'comidas' | 'dietas' | 'alergias';
export const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

/** Catálogos ACTIVOS (id + nombre) ordenados por id: el orden define la posición de cada bandera de meals / diets. */
export async function catalogosAliFilas() {
  await asegurarCatalogosBase();
  const where = { estado: 'Activo' }, orderBy = { id: 'asc' as const }, select = { id: true, nombre: true };
  const [comidas, dietas, alergias] = await Promise.all([prisma.comida.findMany({ where, orderBy, select }), prisma.dieta.findMany({ where, orderBy, select }), prisma.alergia.findMany({ where, orderBy, select })]);
  return { comidas, dietas, alergias };
}
export async function catalogosAli(): Promise<Record<AliTipo, string[]>> {
  const c = await catalogosAliFilas();
  return { comidas: c.comidas.map(x => x.nombre), dietas: c.dietas.map(x => x.nombre), alergias: c.alergias.map(x => x.nombre) };
}
/** Banderas posicionales (meals / diets) de cada plan a partir de sus filas puente y los catálogos activos. */
export function banderas(ids: string[], catalogo: { id: string }[]): boolean[] {
  const set = new Set(ids);
  return catalogo.map(c => set.has(c.id));
}
/** Escribe las comidas / dietas de un plan a partir de las banderas posicionales (solo toca las posiciones del catálogo ACTIVO; las inactivas se conservan). */
export async function guardarBanderasPlan(planId: string, meals: boolean[], diets: boolean[]): Promise<void> {
  const cat = await catalogosAliFilas();
  const [mActual, dActual] = await Promise.all([prisma.aliPlanComida.findMany({ where: { planId } }), prisma.aliPlanDieta.findMany({ where: { planId } })]);
  const wantM = new Set(cat.comidas.filter((_, i) => !!meals?.[i]).map(c => c.id)), wantD = new Set(cat.dietas.filter((_, i) => !!diets?.[i]).map(c => c.id));
  const activasM = new Set(cat.comidas.map(c => c.id)), activasD = new Set(cat.dietas.map(c => c.id));
  const quitarM = mActual.filter(x => activasM.has(x.comidaId) && !wantM.has(x.comidaId)).map(x => x.comidaId), quitarD = dActual.filter(x => activasD.has(x.dietaId) && !wantD.has(x.dietaId)).map(x => x.dietaId);
  const ponerM = [...wantM].filter(id => !mActual.some(x => x.comidaId === id)), ponerD = [...wantD].filter(id => !dActual.some(x => x.dietaId === id));
  if (quitarM.length) await prisma.aliPlanComida.deleteMany({ where: { planId, comidaId: { in: quitarM } } });
  if (quitarD.length) await prisma.aliPlanDieta.deleteMany({ where: { planId, dietaId: { in: quitarD } } });
  if (ponerM.length) await prisma.aliPlanComida.createMany({ data: ponerM.map(comidaId => ({ planId, comidaId })) });
  if (ponerD.length) await prisma.aliPlanDieta.createMany({ data: ponerD.map(dietaId => ({ planId, dietaId })) });
}
/** Garantiza las 5 filas del menú semanal (Lunes a Viernes); el plato queda vacío hasta que el encargado lo defina. */
export async function ensureMenuSemanal() {
  if ((await prisma.aliMenu.count()) >= DIAS_SEMANA.length) return;
  for (const [orden, dia] of DIAS_SEMANA.entries()) await prisma.aliMenu.upsert({ where: { orden }, update: {}, create: { orden, dia, plato: '' } });
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
