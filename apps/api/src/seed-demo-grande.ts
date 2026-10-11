/**
 * SEED DE DEMOSTRACION GRANDE (solo SEED_DEMO=true; nunca en produccion ni en el seed de instalacion).
 *
 * Convierte la demo (16 alumnos de muestra) en un colegio de ~786 alumnos activos para presentaciones: ~772 alumnos adicionales con
 * tutores, planes de pago, cartera (FinCobroItem), recibos de los ultimos 6 meses, becas, comedor, asistencia, inscripciones del mes y
 * auditoria. NINGUNA cifra del Centro de Control se escribe a mano: el dashboard las calcula con sus formulas reales (lib/cxc.ts,
 * modules/dashboard). Este generador solo fija las ENTRADAS (cuantos alumnos, que tanda, quien debe, cuanto cobro cada mes) para que esas
 * formulas den cifras parecidas a las del prototipo (OBJ).
 *
 *  - Determinista: PRNG con semilla fija (mulberry32). Mismo resultado siempre (las fechas son relativas a "hoy").
 *  - Idempotente: si ya existe el manifiesto SisConfig 'demoGrande' no hace nada. Todo se escribe en UNA transaccion.
 *  - Reversible: `pnpm --filter @stodia/api seed:demo-grande:quitar` borra solo lo generado (ids reconocibles, ver MARCAS) y restaura
 *    las ventas historicas 'VTA-H*' que sustituye por recibos reales.
 *  - Datos ficticios: nombres de listas comunes, cedulas 999-XXXXXXX-X (999 no existe en la JCE), correos @example.do, tel. 809-555-01XX.
 *
 * Uso: `pnpm seed:demo-grande` (SEED_DEMO=true) o automatico desde seed.ts con DEMO_SCALE=large.
 */
import type { Prisma } from '@prisma/client';
import { config } from './config';
import { prisma } from './db';
import { cxcResumen, esVencido, hoyISO, partesEnZona, round2, venceISO, zonaHoraria } from './lib/cxc';
import { DOCS_DEFECTO, MNAME, anioDeMes, cicloActivo, cuotasDe, getFinanzas, mesesCiclo, mesesDe, planesPago, totalDe, vencDMY } from './lib/pers-fin';
import type { PlanRow } from './lib/pers-fin';
import { cajaDe, lineasData } from './lib/recibos';
import { idMatricula } from './lib/matricula';
import { leerTipo, sincronizarPlan } from './lib/catalogos-tipados';
import { DIR0, norm } from './seed-data';
import { limpiarCicloAnterior } from './seed-ciclos';

type Tx = Prisma.TransactionClient;

/** Metas de la demo/prototipo (entradas del generador; el dashboard las recalcula desde las tablas). */
export const OBJ = {
  matricula: 786,
  morosidad: 3_220_455,
  proyeccion: 62_400_000,
  inscripcionesMes: 14,
  becasTotal: 5,
  /** Recaudo por mes, del mas antiguo al mes actual (May 2.0M, Jun 1.2M, Jul 0.6M, Ago 4.1M, Sep 2.3M, Oct 2.0M). */
  recaudoMeses: [2_000_000, 1_200_000, 600_000, 4_100_000, 2_300_000, 2_015_700],
};

const CLAVE = 'demoGrande';
const CLAVE_VENTAS = 'demoGrandeVentas';
const ID0 = 1001; // ids de alumno 1001.. (los de la muestra llegan a 0587)
/**
 * Mezcla de Planes de Pago de las familias generadas (ENTRADA del generador: proporcion de 412 / 58 / 96). «Alumnos» de un plan ya no se guarda:
 * el Centro de Control lo cuenta desde Contrato, y tras repartir los planes el generador los AJUSTA (ajustarPlanes) para que la proyeccion
 * del ciclo calculada con esos conteos reales sea OBJ.proyeccion.
 */
const PESO_PLAN: Record<string, number> = { 'PLN-001': 412, 'PLN-002': 58, 'PLN-003': 96 };
/** Planes de alimentacion que asigna el comedor generado (suscripcion = Plan Almuerzo Completo, monedero = Monedero Cafeteria; los siembra seed-operacion). */
const ALI_PLAN = { sub: 'ALI-001', wal: 'ALI-004' } as const;
/** Metodos de pago del recibo generado (nombres EXACTOS del catalogo metodosPago) con su prefijo de referencia. */
const METODO_PAGO: readonly (readonly [string, number])[] = [['Efectivo', 35], ['Transferencia', 33], ['Tarjeta de Crédito', 27], ['Cheque', 5]];

// ---------------- PRNG ----------------
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260907);
const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const pick = <T,>(l: readonly T[]): T => l[Math.floor(rand() * l.length)];
const chance = (p: number) => rand() < p;
function shuffle<T>(l: T[]): T[] { for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } return l; }
function wpick<T>(items: readonly (readonly [T, number])[]): T {
  const tot = items.reduce((a, [, w]) => a + w, 0); let r = rand() * tot;
  for (const [v, w] of items) { r -= w; if (r <= 0) return v; }
  return items[items.length - 1][0];
}

// ---------------- Listas de nombres (comunes en RD; ninguna persona real) ----------------
const M = ['José', 'Juan', 'Luis', 'Carlos', 'Miguel', 'Pedro', 'Rafael', 'Francisco', 'Manuel', 'Ángel', 'Ramón', 'Jorge', 'Víctor', 'Franklin', 'Wilson', 'Starling', 'Yonatan', 'Ricardo', 'Daniel', 'Samuel', 'Andrés', 'Emmanuel', 'Julio', 'Santiago', 'Mateo', 'Gabriel', 'Kevin', 'Anthony', 'Jeison', 'Elvis', 'Rainer', 'Leonardo', 'Cristian', 'Josué', 'Alexander', 'Fernando', 'Domingo', 'Nelson', 'Hugo', 'Esteban', 'Adrián', 'Benjamín', 'Dylan', 'Ethan', 'Joel', 'Lucas', 'Oliver', 'Thiago'];
const F = ['María', 'Ana', 'Carmen', 'Rosa', 'Yocasta', 'Yudelka', 'Altagracia', 'Dulce', 'Rosanna', 'Massiel', 'Estefany', 'Yaneris', 'Johanna', 'Leidy', 'Mildred', 'Nathalie', 'Génesis', 'Luz', 'Milagros', 'Sandra', 'Yamilet', 'Cristal', 'Daniela', 'Valentina', 'Camila', 'Isabella', 'Gabriela', 'Mariana', 'Paola', 'Fiorella', 'Lorena', 'Esperanza', 'Marisol', 'Jocelyn', 'Katherine', 'Sheila', 'Rocío', 'Ámbar', 'Emily', 'Victoria', 'Alondra', 'Nicole', 'Zoe', 'Abril', 'Antonella', 'Samantha', 'Ximena', 'Lía'];
const SEG_M = ['Andrés', 'Miguel', 'Alejandro', 'Daniel', 'Rafael', 'José', 'David', 'Luis', 'Antonio', 'Manuel'];
const SEG_F = ['Sofía', 'Isabel', 'Paola', 'Valentina', 'Victoria', 'Alexandra', 'Fernanda', 'Carolina', 'Beatriz', 'Elena'];
const AP = ['Pérez', 'Rodríguez', 'Martínez', 'García', 'Sánchez', 'Díaz', 'Santos', 'Jiménez', 'Reyes', 'Cabrera', 'Ramírez', 'Gómez', 'Rosario', 'Mejía', 'Vásquez', 'Medina', 'Castillo', 'Peralta', 'Polanco', 'Almonte', 'Féliz', 'Encarnación', 'Ureña', 'Batista', 'Collado', 'Lantigua', 'Disla', 'Paulino', 'Montero', 'Tavárez', 'Núñez', 'Rivera', 'Arias', 'Brito', 'Cruz', 'Duarte', 'Espaillat', 'Frías', 'Guerrero', 'Henríquez', 'Infante', 'Lara', 'Matos', 'Nova', 'Ortega', 'Pimentel', 'Quiñones', 'Ramos', 'Soto', 'Valdez', 'Zapata', 'Sención', 'Báez', 'Cordero', 'Germán', 'Hidalgo', 'Lora', 'Marte', 'Minaya', 'Acosta', 'Beltré', 'Candelario', 'De León', 'Familia', 'Genao', 'Heredia', 'Javier', 'Luciano', 'Mercedes', 'Pichardo', 'Roque', 'Suero', 'Terrero', 'Upía', 'Vargas'];
const BARRIOS = ['Los Prados', 'Naco', 'Piantini', 'Ensanche Julieta', 'Bella Vista', 'Evaristo Morales', 'Gazcue', 'Arroyo Hondo', 'Los Ríos', 'Mirador Norte', 'Cacicazgo', 'Zona Universitaria', 'Villa Mella', 'Herrera', 'Los Alcarrizos', 'Ensanche Ozama', 'Alma Rosa', 'Ciudad Real', 'Honduras', 'Renacimiento', 'Serralles', 'La Esperilla'];
const CALLES = ['C/ Duarte', 'C/ Primera', 'C/ Las Flores', 'Av. Independencia', 'C/ El Vergel', 'Av. Núñez de Cáceres', 'C/ Los Robles', 'C/ José Contreras', 'C/ Central', 'Av. Winston Churchill', 'C/ Hermanas Mirabal', 'C/ Pedro Henríquez Ureña', 'C/ 5', 'C/ 12', 'Res. Las Palmas'];
const ALERGIAS = ['Maní', 'Lactosa', 'Gluten', 'Huevo', 'Mariscos', 'Penicilina', 'Frutos secos', 'Polen'];

// grado (nombre en Alumno.grado), nivel del catalogo, cantidad de alumnos activos, edad tipica al inicio del ciclo
const GRADOS: { g: string; nivel: string; n: number; edad: number }[] = [
  { g: 'Pre-primario', nivel: 'Inicial', n: 105, edad: 5 }, { g: '1ro', nivel: 'Primaria', n: 120, edad: 6 }, { g: '2do', nivel: 'Primaria', n: 118, edad: 7 },
  { g: '3ro', nivel: 'Primaria', n: 116, edad: 8 }, { g: '4to', nivel: 'Primaria', n: 112, edad: 9 }, { g: '5to', nivel: 'Primaria', n: 100, edad: 10 },
  { g: '6to', nivel: 'Primaria', n: 101, edad: 11 },
];
const SEC_TARGET = 28; // alumnos por seccion (cap 30)
const p2 = (n: number) => String(n).padStart(2, '0');
const isoT = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');

interface Plan { row: PlanRow; w: number }
interface Item { id: string; alumnoId: string; tutorId: string; servicioId: string | null; cicloId: string; con: string; al: string; vence: string; monto: number; est: string; tipo: string; paid: boolean; orden: number; ym: number }
interface Kid {
  id: string; code: string; nombres: string; apellidos: string; fnac: string; grado: string; edad: number; tanda: string; tandaId: string; sec: string; secId: string;
  estado: 'Activo' | 'Inactivo' | 'Retirado'; sexo: 'M' | 'F'; alg: string; fam: Fam; comedor: 'sub' | 'wal' | ''; nuevo: boolean; beca: boolean; mora: number; comMora: boolean;
}
interface Fam { id: string; tutorId: string; nombre: string; cedula: string; tel: string; email: string; dir: string; parentesco: string; plan: Plan; kids: Kid[]; apellidos: string }

/** Instante UTC dentro del mes (y, m) en horario diurno local (UTC-4 => 13..21 UTC); en el mes actual nunca en el futuro. */
function fechaEn(y: number, m: number, cur: { y: number; m: number; d: number }, ahora: Date, sesgo = 1.3): Date {
  const actual = y === cur.y && m === cur.m;
  const d = 1 + Math.floor(Math.pow(rand(), sesgo) * (actual ? cur.d : 28));
  let t = Date.UTC(y, m - 1, d, 13 + int(0, 8), int(0, 59), int(0, 59));
  if (t > ahora.getTime() - 60_000) t = ahora.getTime() - int(2, 400) * 60_000;
  return new Date(t);
}

async function bulk<T>(rows: T[], fn: (chunk: T[]) => Promise<unknown>, n = 100) { for (let i = 0; i < rows.length; i += n) await fn(rows.slice(i, i + n)); }

/** Proyeccion del ciclo = misma formula del dashboard (promedio ponderado por alumnos inscritos en cada plan activo). */
function proyeccionPorTanda(planes: Plan[]): (tanda: string) => number {
  const wTot = planes.reduce((a, p) => a + p.w, 0);
  const anual = (p: PlanRow, t: string) => (p.porTanda && p.tm[t] !== undefined ? p.tm[t] : p.anual) * (1 - p.desc / 100);
  return t => (wTot > 0 ? planes.reduce((s, p) => s + anual(p.row, t) * p.w, 0) / wTot : planes.reduce((s, p) => s + anual(p.row, t), 0) / Math.max(1, planes.length));
}

/**
 * Reparte los planes de las familias para que la PROYECCION DEL CICLO que calcula el Centro de Control (promedio ponderado por alumnos activos
 * con contrato en cada plan activo = COUNT(Contrato)) sea la meta. Con P = sum(w_p * S_p) / W (W constante: solo se mueven alumnos entre planes
 * activos), cada traslado de una familia de n alumnos del plan p al q cambia P en n*(S_q - S_p)/W; se aplican los traslados que mas acercan a la meta.
 * Determinista (usa solo el orden de las familias, no el PRNG). Devuelve la proyeccion resultante.
 */
function ajustarPlanes(planes: Plan[], fams: Fam[], tandasBase: string[], contratosBase: Map<string, number>, meta: number, tol = 1500): number {
  const anual = (p: PlanRow, t: string) => (p.porTanda && p.tm[t] !== undefined ? p.tm[t] : p.anual) * (1 - p.desc / 100);
  const act = [...tandasBase, ...fams.flatMap(f => f.kids.filter(k => k.estado === 'Activo').map(k => k.tanda))];
  const S = new Map(planes.map(p => [p.row.id, act.reduce((s, t) => s + anual(p.row, t), 0)]));
  const w = new Map(planes.map(p => [p.row.id, contratosBase.get(p.row.id) ?? 0]));
  const nAct = (f: Fam) => f.kids.filter(k => k.estado === 'Activo').length;
  for (const f of fams) w.set(f.plan.row.id, (w.get(f.plan.row.id) ?? 0) + nAct(f));
  const W = [...w.values()].reduce((a, b) => a + b, 0);
  const num = () => planes.reduce((a, p) => a + (w.get(p.row.id) ?? 0) * (S.get(p.row.id) ?? 0), 0);
  let cur = num();
  for (let it = 0; it < 400 && Math.abs(cur / W - meta) > tol; it++) {
    let mejor: { f: Fam; q: Plan; d: number } | null = null, mejorErr = Math.abs(cur / W - meta);
    for (const f of fams) {
      const n = nAct(f); if (!n) continue;
      for (const q of planes) {
        if (q.row.id === f.plan.row.id) continue;
        const d = n * ((S.get(q.row.id) ?? 0) - (S.get(f.plan.row.id) ?? 0)), err = Math.abs((cur + d) / W - meta);
        if (err < mejorErr) { mejorErr = err; mejor = { f, q, d }; }
      }
    }
    if (!mejor) break;
    const n = nAct(mejor.f);
    w.set(mejor.f.plan.row.id, (w.get(mejor.f.plan.row.id) ?? 0) - n); w.set(mejor.q.row.id, (w.get(mejor.q.row.id) ?? 0) + n);
    mejor.f.plan = mejor.q; cur += mejor.d;
  }
  return round2(cur / W);
}

export async function sembrarDemoGrande(): Promise<void> {
  if (!config.seedDemo) throw new Error('El seed de demostración grande solo se ejecuta con SEED_DEMO=true');
  if (await prisma.sisConfig.findUnique({ where: { clave: CLAVE } })) { console.log('seed demo grande: ya existe (usa seed:demo-grande:quitar para rehacerlo)'); return; }
  const t0 = Date.now();

  const tz = await zonaHoraria(), ahora = new Date(), hoy = hoyISO(tz, ahora), cur = partesEnZona(tz, ahora);
  const [ciclo, fin, planesAll, ctrExist, cat, activos, existentes, cxc0, becasN, insMes0] = await Promise.all([
    cicloActivo(), getFinanzas(), planesPago(), prisma.contrato.groupBy({ by: ['planId'], where: { alumno: { estado: 'Activo' } }, _count: { _all: true } }),
    Promise.all([leerTipo('grados'), leerTipo('tandas'), leerTipo('secciones')]),
    prisma.alumno.findMany({ where: { estado: 'Activo' }, select: { seccion: { select: { tanda: { select: { nombre: true } } } } } }).then(l => l.map(a => ({ tanda: a.seccion.tanda.nombre }))),
    prisma.alumno.findMany({ select: { seccion: { select: { letra: true, grado: { select: { nombre: true } } } } } }).then(l => l.map(a => ({ grado: a.seccion.grado.nombre, sec: a.seccion.letra }))),
    cxcResumen(undefined, tz), prisma.finBeca.count(), prisma.persInscripcion.count(),
  ]);
  if (!planesAll.some(p => p.estado === 'Activo')) throw new Error('No hay Planes de Pago activos: siembra primero seed-finanzas');
  const planes: Plan[] = planesAll.filter(p => p.estado === 'Activo').map(row => ({ row, w: PESO_PLAN[row.id] ?? 0 }));
  const meses = mesesCiclo(planesAll), idxHoy = Math.max(0, meses.indexOf(cur.m));
  const y0 = ciclo.y0;
  const diaCorte = fin.diaCorte > 0 ? fin.diaCorte : 1;
  const ymCur = cur.y * 12 + cur.m - 1;

  // ---- Catalogos: grados, tandas, secciones ----
  const [gradosCat, tandasCat, seccCat] = cat; // filas con la forma historica de Catalogo (leerTipo)
  const gradoId = (g: string, nivel: string) => String(gradosCat.find(x => x.grado === g && x.nivel === nivel)?.id ?? '');
  const TANDAS = ['Matutina', 'Vespertina', 'Extendida'].filter(n => tandasCat.some(t => t.nombre === n && t.estado !== 'Inactivo'));
  if (!TANDAS.length) throw new Error('Faltan tandas en el catálogo');
  const tandaId = (n: string) => String(tandasCat.find(t => t.nombre === n)?.id ?? '');

  // ---- Cuantos por tanda: la proyeccion del ciclo del dashboard debe quedar ~OBJ.proyeccion ----
  const nGen = Math.max(0, OBJ.matricula - activos.length);
  const val = proyeccionPorTanda(planes);
  const base = activos.reduce((s, a) => s + val(a.tanda), 0);
  const ideal = TANDAS.length === 3 ? [0.42, 0.51, 0.07] : TANDAS.map(() => 1 / TANDAS.length);
  let mejor: number[] = TANDAS.map((_, i) => Math.round(nGen * ideal[i])); let mejorPen = Infinity;
  if (TANDAS.length === 3) {
    for (let e = 0; e <= nGen * 0.25; e++) for (let v = 0; v + e <= nGen; v++) {
      const c = [nGen - v - e, v, e], diff = Math.abs(base + c[0] * val(TANDAS[0]) + c[1] * val(TANDAS[1]) + c[2] * val(TANDAS[2]) - OBJ.proyeccion);
      const pen = (diff > 15_000 ? diff : 0) * 1000 + c.reduce((s, x, i) => s + Math.abs(x / nGen - ideal[i]), 0);
      if (pen < mejorPen) { mejorPen = pen; mejor = c; }
    }
  }
  const tandaList = shuffle(TANDAS.flatMap((t, i) => Array<string>(mejor[i]).fill(t)));
  while (tandaList.length < nGen) tandaList.push(TANDAS[0]);

  // ---- Alumnos (esqueleto): por grado, tanda aleatoria segun cupos ----
  const escala = nGen / GRADOS.reduce((s, g) => s + g.n, 0);
  const porGrado = GRADOS.map(g => ({ ...g, n: Math.round(g.n * escala) }));
  porGrado[porGrado.length - 1].n += nGen - porGrado.reduce((s, g) => s + g.n, 0);
  const letrasUsadas = (g: string, gid: string) => new Set<string>([...seccCat.filter(s => s.grado === gid).map(s => String(s.seccion)), ...existentes.filter(a => a.grado === g).map(a => a.sec)]);
  interface Cel { g: (typeof GRADOS)[number]; tanda: string; n: number }
  const celdas = new Map<string, Cel>();
  const kids: Kid[] = []; let tIdx = 0;
  const esq = (g: (typeof GRADOS)[number], tanda: string, estado: Kid['estado']): Kid => {
    const sexo: 'M' | 'F' = chance(0.5) ? 'M' : 'F';
    const nom = (sexo === 'M' ? pick(M) : pick(F)) + (chance(0.22) ? ' ' + (sexo === 'M' ? pick(SEG_M) : pick(SEG_F)) : '');
    const anio = ciclo.y0 - g.edad, mes = int(1, 12), dia = int(1, 28);
    return { id: '', code: '', nombres: nom, apellidos: '', fnac: `${anio}-${p2(mes)}-${p2(dia)}`, grado: g.g, edad: g.edad, tanda, tandaId: tandaId(tanda), sec: '', secId: '', estado, sexo, alg: chance(0.12) ? [...new Set([pick(ALERGIAS), chance(0.3) ? pick(ALERGIAS) : ''])].filter(Boolean).join(', ') : '', fam: null as unknown as Fam, comedor: '', nuevo: false, beca: false, mora: 0, comMora: false };
  };
  for (const g of porGrado) for (let i = 0; i < g.n; i++) {
    const k = esq(g, tandaList[tIdx++], 'Activo'); kids.push(k);
    const key = g.g + '|' + k.tanda; const c = celdas.get(key) ?? { g, tanda: k.tanda, n: 0 }; c.n++; celdas.set(key, c);
  }

  // ---- Secciones nuevas en el catalogo (cap 30), letras que no choquen con las existentes ----
  const secRows: { id: string; gradoId: string; letra: string; tandaId: string; aulaBaseId: string; cap: number; estado: string }[] = [];
  const secDe = new Map<string, { id: string; letra: string }[]>(); let nSec = 0;
  const letrasGrado = new Map<string, Set<string>>();
  for (const [key, c] of [...celdas.entries()].sort()) {
    const gid = gradoId(c.g.g, c.g.nivel); if (!gid) throw new Error('Grado no encontrado en el catálogo: ' + c.g.g);
    const usadas = letrasGrado.get(c.g.g) ?? letrasUsadas(c.g.g, gid); letrasGrado.set(c.g.g, usadas);
    const ns = Math.ceil(c.n / SEC_TARGET), lista: { id: string; letra: string }[] = [];
    for (let i = 0; i < ns; i++) {
      let L = 65; while (usadas.has(String.fromCharCode(L))) L++;
      const letra = String.fromCharCode(L); usadas.add(letra); nSec++;
      const id = 'sg' + nSec; lista.push({ id, letra });
      secRows.push({ id, estado: 'Activo', gradoId: gid, letra, tandaId: tandaId(c.tanda), aulaBaseId: 'a' + (1 + (nSec % 4)), cap: 30 });
    }
    secDe.set(key, lista);
  }
  // reparto de los alumnos en las secciones de su celda
  const cuenta = new Map<string, number>();
  const porCelda = new Map<string, Kid[]>();
  for (const k of kids) { const key = k.grado + '|' + k.tanda; (porCelda.get(key) ?? porCelda.set(key, []).get(key)!).push(k); }
  for (const [key, ks] of porCelda) {
    const l = secDe.get(key)!;
    ks.forEach((k, i) => { const s = l[i % l.length]; k.sec = s.letra; k.secId = s.id; cuenta.set(s.id, (cuenta.get(s.id) ?? 0) + 1); });
  }
  // Inactivos y retirados (no cuentan en la matricula): en secciones ya creadas
  const extra: Kid[] = [];
  const gx = (n: number, estado: Kid['estado']) => { for (let i = 0; i < n; i++) { const dest = pick(kids); const g = GRADOS.find(x => x.g === dest.grado)!; const k = esq(g, dest.tanda, estado); k.sec = dest.sec; k.secId = dest.secId; extra.push(k); if (estado === 'Inactivo') cuenta.set(dest.secId, (cuenta.get(dest.secId) ?? 0) + 1); } };
  gx(14, 'Retirado'); gx(8, 'Inactivo');
  // «Inscritos» no se guarda en el catalogo (se calcula desde Alumno); aqui solo se valida el cupo.
  for (const r of secRows) { if ((cuenta.get(r.id) ?? 0) > r.cap) throw new Error('Sección sobre su cupo'); }

  // ---- Familias (1-2 hijos de grados distintos y misma tanda), tutores ----
  const todos = [...kids, ...extra];
  const sinFam = new Set(todos);
  const fams: Fam[] = []; const cedUsadas = new Set<string>(); const nombresUsados = new Set<string>(); const telMuestra = new Set(DIR0.map(r => r[12]));
  const orden = shuffle([...todos]);
  const cedulaNueva = () => { for (;;) { const d = String(int(0, 9_999_999)).padStart(7, '0'); const c = `999${d}${int(0, 9)}`; if (!cedUsadas.has(c)) { cedUsadas.add(c); return c; } } };
  const telNuevo = () => { for (;;) { const t = `809-555-01${p2(int(0, 99))}`; if (!telMuestra.has(t)) return t; } };
  const planDe = () => wpick(planes.map(p => [p, Math.max(1, p.w)] as const));
  const prob2 = 0.46;
  for (const k of orden) {
    if (!sinFam.has(k)) continue;
    sinFam.delete(k);
    const hijos = [k];
    if (k.estado === 'Activo' && chance(prob2)) {
      const hermano = orden.find(x => sinFam.has(x) && x.estado === 'Activo' && x.tanda === k.tanda && x.grado !== k.grado && Math.abs(x.edad - k.edad) <= 6);
      if (hermano) { sinFam.delete(hermano); hijos.push(hermano); }
    }
    const madre = chance(0.62), ap1 = pick(AP), ap2 = pick(AP);
    let nombre = '', t = 0;
    do { nombre = `${madre ? pick(F) : pick(M)} ${madre ? ap2 : ap1}`; t++; } while (nombresUsados.has(nombre) && t < 20);
    nombresUsados.add(nombre);
    const n = fams.length + 1, calle = `${pick(CALLES)} #${int(1, 180)}, ${pick(BARRIOS)}`;
    const ced = cedulaNueva();
    const fam: Fam = {
      id: 'tg' + n, tutorId: 'tg' + n, nombre, cedula: ced, tel: telNuevo(),
      email: `${norm(nombre.split(' ')[0])}.${norm(nombre.split(' ')[1]).replace(/\s/g, '')}${n}@example.do`,
      dir: calle, parentesco: madre ? 'Madre' : 'Padre', plan: planDe(), kids: hijos, apellidos: `${ap1} ${ap2}`,
    };
    for (const h of hijos) h.fam = fam;
    fams.push(fam);
  }
  // ids correlativos por grado y apellido (aspecto de matricula real)
  [...todos].sort((a, b) => GRADOS.findIndex(g => g.g === a.grado) - GRADOS.findIndex(g => g.g === b.grado) || a.fam.apellidos.localeCompare(b.fam.apellidos)).forEach((k, i) => {
    k.id = String(ID0 + i); k.code = `EST-${y0}-${k.id}`; k.apellidos = k.fam.apellidos;
  });
  const idHasta = ID0 + todos.length - 1;
  const activosGen = todos.filter(k => k.estado === 'Activo');
  // La proyeccion del ciclo se calcula con los CONTEOS REALES de contratos por plan: se ajusta el reparto de planes a la meta.
  const proyeccion = ajustarPlanes(planes, fams, activos.map(a => a.tanda), new Map(ctrExist.map(g => [g.planId, g._count._all])), OBJ.proyeccion);

  // ---- Inscripciones de este mes (nuevos) ----
  const nuevos = shuffle([...activosGen.filter(k => k.fam.plan.row.freq === 1)]).slice(0, Math.max(0, OBJ.inscripcionesMes - insMes0));
  for (const k of nuevos) k.nuevo = true;

  // ---- Comedor: 36% suscripcion, 30% monedero ----
  for (const k of activosGen) k.comedor = wpick([['sub', 36], ['wal', 30], ['', 34]] as const) as Kid['comedor'];

  // ---- Cartera por alumno (cuotas del plan del ciclo + comedor desde el mes actual) ----
  const items: Item[] = []; let orden0 = 5000;
  const itemsDe = new Map<string, Item[]>();
  const alDe = (k: Kid) => `${k.nombres.split(' ')[0]} · ${k.grado} ${k.sec}`;
  const bec = activosGen.find(k => k.fam.kids.length > 1 && k.fam.kids[1] === k && !k.nuevo);
  const nBecas = Math.max(0, OBJ.becasTotal - becasN);
  if (nBecas > 0 && bec) bec.beca = true;
  for (const k of activosGen) {
    const p = k.fam.plan.row, montos = cuotasDe(p, k.tanda), vencs = mesesDe(p, y0), lista: Item[] = [];
    vencs.forEach((v, i) => {
      const ym = v.y * 12 + v.m - 1;
      if (k.nuevo && ym < ymCur) return; // se inscribio este mes: no tiene cuotas anteriores
      const monto = k.beca ? round2(montos[i] * 0.9) : montos[i];
      lista.push({ id: `g-${k.id}-c${v.y}${p2(v.m)}`, alumnoId: k.id, tutorId: k.fam.tutorId, servicioId: null, cicloId: ciclo.id!, con: `Colegiatura ${MNAME[v.m]} ${v.y}`, al: alDe(k), vence: vencDMY(p.dia, v.m, v.y), monto, est: 'Pendiente', tipo: 'col', paid: false, orden: orden0++, ym });
    });
    if (k.comedor === 'sub') for (const m of meses.slice(idxHoy)) {
      const y = anioDeMes(meses, y0, m);
      lista.push({ id: `g-${k.id}-k${y}${p2(m)}`, alumnoId: k.id, tutorId: k.fam.tutorId, servicioId: `psv-com-${k.id}`, cicloId: ciclo.id!, con: `Plan Comedor · ${MNAME[m]}`, al: alDe(k), vence: vencDMY(diaCorte, m, y), monto: 3200, est: 'Pendiente', tipo: 'com', paid: false, orden: orden0++, ym: y * 12 + m - 1 });
    }
    for (const it of lista) {
      const v = venceISO(it.vence)!;
      it.paid = v < hoy ? true : it.ym === ymCur ? chance(0.3) : false;
      it.est = it.paid ? 'Pendiente' : v < hoy ? 'Vencida' : Date.parse(v) - Date.parse(hoy) <= 20 * 864e5 ? 'Por vencer' : 'Pendiente';
    }
    itemsDe.set(k.id, lista); items.push(...lista);
  }

  // ---- Morosidad: tutores que no pagaron los ultimos 1-3 meses vencidos, hasta ~OBJ.morosidad (menos lo que ya hay en la muestra) ----
  const metaMora = Math.max(0, OBJ.morosidad - cxc0.vencido);
  const elegibles = shuffle(fams.filter(f => f.plan.row.freq === 1 && f.kids.every(k => k.estado === 'Activo' && !k.nuevo)));
  const mesesVencidos = (k: Kid) => [...new Set((itemsDe.get(k.id) ?? []).filter(i => esVencido(i, hoy) && i.paid && i.tipo !== 'mora').map(i => i.ym))].sort((a, b) => b - a);
  const morasNuevas: Item[] = []; let S = 0; const morosos: Fam[] = [];
  const deudaDe = (f: Fam, kmes: number) => {
    const sel: Item[] = [];
    for (const k of f.kids) { const ms = mesesVencidos(k).slice(0, kmes); for (const i of itemsDe.get(k.id)!) if (ms.includes(i.ym) && i.paid && esVencido(i, hoy)) sel.push(i); }
    return sel;
  };
  const recargo = (it: Item, k: Kid): Item | null => {
    const m = (it.ym % 12) + 1, y = Math.floor(it.ym / 12), d = Math.min(28, (parseInt(it.vence.slice(0, 2), 10) || 1) + 6);
    const vence = vencDMY(d, m, y), v = venceISO(vence)!;
    if (v >= hoy) return null;
    return { id: `g-${k.id}-m${y}${p2(m)}`, alumnoId: k.id, tutorId: k.fam.tutorId, servicioId: null, cicloId: ciclo.id!, con: `Recargo por mora · ${MNAME[m].slice(0, 3)}. (3%)`, al: alDe(k), vence, monto: round2(it.monto * 0.03), est: 'Vencida', tipo: 'mora', paid: false, orden: orden0++, ym: it.ym };
  };
  for (const f of elegibles) {
    if (metaMora - S < 600) break;
    for (let kmes = wpick([[1, 35], [2, 35], [3, 30]] as const); kmes >= 1; kmes--) {
      const sel = deudaDe(f, kmes); if (!sel.length) continue;
      const rec: Item[] = [];
      if (chance(0.4)) for (const k of f.kids) { const col = sel.filter(i => i.alumnoId === k.id && i.tipo === 'col').sort((a, b) => a.ym - b.ym)[0]; const r = col && recargo(col, k); if (r) rec.push(r); }
      const deuda = sel.reduce((a, i) => a + i.monto, 0) + rec.reduce((a, i) => a + i.monto, 0);
      if (S + deuda > metaMora) continue;
      for (const i of sel) { i.paid = false; i.est = 'Vencida'; }
      morasNuevas.push(...rec); S += deuda; morosos.push(f);
      for (const k of f.kids) { k.mora = 1; if (sel.some(i => i.alumnoId === k.id && i.tipo === 'com')) k.comMora = true; }
      break;
    }
  }
  // remanente (< unos cientos de pesos): un ultimo recargo por mora al ultimo moroso
  const resto = round2(metaMora - S);
  if (resto >= 1 && morosos.length) {
    const f = morosos[morosos.length - 1], k = f.kids[0];
    morasNuevas.push({ id: `g-${k.id}-mx`, alumnoId: k.id, tutorId: k.fam.tutorId, servicioId: null, cicloId: ciclo.id!, con: `Recargo por mora · ${MNAME[((ymCur - 1) % 12) + 1].slice(0, 3)}. (3%)`, al: alDe(k), vence: vencDMY(Math.max(1, cur.d - 2), cur.m, cur.y), monto: resto, est: 'Vencida', tipo: 'mora', paid: false, orden: orden0++, ym: ymCur });
    S += resto;
  }
  items.push(...morasNuevas);

  // ---- Recibos: recaudo por mes = meta del mes - lo que ya existe (sin contar las ventas historicas VTA-H*, que se reemplazan) ----
  const mesesN = Array.from({ length: 6 }, (_, i) => { const t = cur.y * 12 + (cur.m - 1) - (5 - i); return { y: Math.floor(t / 12), m: (t % 12) + 1 }; });
  const desde = new Date(Date.UTC(mesesN[0].y, mesesN[0].m - 1, 1) - 864e5);
  const [recExist, ventExist, ventasH] = await Promise.all([
    prisma.finRecibo.findMany({ where: { est: 'Activo', createdAt: { gte: desde } }, select: { monto: true, createdAt: true } }),
    prisma.finVenta.findMany({ where: { createdAt: { gte: desde }, NOT: { id: { startsWith: 'VTA-H' } } }, select: { total: true, createdAt: true } }),
    prisma.finVenta.findMany({ where: { id: { startsWith: 'VTA-H' } } }),
  ]);
  const keyOf = (d: Date) => { const p = partesEnZona(tz, d); return p.y * 12 + p.m - 1; };
  const yaMes = new Map<number, number>();
  for (const r of recExist) yaMes.set(keyOf(r.createdAt), (yaMes.get(keyOf(r.createdAt)) ?? 0) + r.monto);
  for (const v of ventExist) yaMes.set(keyOf(v.createdAt), (yaMes.get(keyOf(v.createdAt)) ?? 0) + v.total);

  interface Linea { con: string; monto: number; cobroItemId?: string }
  interface Rec { id: string; ncf: string; tutor: string; tutorId: string; cajaId: string | null; cajeroId: string | null; cicloId: string; hora: string; monto: number; abono: boolean; saldo: number; lineas: Linea[]; pagos: { m: string; r: string; amt: number }[]; createdAt: Date; usuario: string; metodo: string }
  // Ciclo de cada recibo = el que contiene su fecha (los recaudos de meses anteriores al ciclo activo son del ciclo cerrado inmediato; sin ciclo que lo contenga, el activo).
  const ciclosRows = await prisma.ciclo.findMany();
  const cicloDe = (d: Date) => { const f = d.toISOString().slice(0, 10); return ciclosRows.find(c => c.fechaInicio <= f && f <= c.fechaFin)?.id ?? ciclo.id!; };
  // Cajeros del generador (usuarios de la demo) -> User.id y su caja del catalogo staff.
  const cajeros = await Promise.all((await prisma.user.findMany({ where: { usuario: { in: ['usr_arosario', 'usr_palmanzar'] } } })).map(async u => [u.usuario, { id: u.id, caja: await cajaDe({ usuario: u.usuario, nombre: u.nombre }) }] as const));
  const cajero = new Map(cajeros);
  const recibos: Rec[] = [];
  const hm = (d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  const famsPago = fams.filter(f => f.kids.some(k => k.estado === 'Activo'));
  mesesN.forEach(({ y, m }, idx) => {
    const ym = y * 12 + m - 1, enCiclo = ym >= y0 * 12 + (meses[0] - 1);
    let falta = round2(OBJ.recaudoMeses[idx] - (yaMes.get(ym) ?? 0)); if (falta < 1) return;
    const crear = (f: Fam): Linea[] => {
      const out: Linea[] = [];
      for (const k of f.kids.filter(x => x.estado === 'Activo')) {
        if (enCiclo) {
          const it = (itemsDe.get(k.id) ?? []).find(i => i.ym === ym && i.tipo === 'col'); if (!it || !it.paid) continue;
          out.push({ con: `${it.con} · ${k.nombres.split(' ')[0]}`, monto: it.monto, cobroItemId: it.id });
          if (m === meses[0] && chance(0.7)) out.push({ con: `Reinscripción ${ciclo.nombre} · ${k.nombres.split(' ')[0]}`, monto: fin.inscripcion });
          if (m === meses[0] && chance(0.35)) out.push({ con: `Paquete de libros de texto · ${k.nombres.split(' ')[0]}`, monto: pick([6800, 8200, 9800]) });
          const com = (itemsDe.get(k.id) ?? []).find(i => i.ym === ym && i.tipo === 'com'); if (com && chance(0.8)) out.push({ con: `${com.con} · ${k.nombres.split(' ')[0]}`, monto: com.monto, cobroItemId: com.id });
        } else if (f.plan.row.freq === 1) {
          out.push({ con: `Colegiatura ${MNAME[m]} ${y} · ${k.nombres.split(' ')[0]}`, monto: cuotasDe(f.plan.row, k.tanda)[0] });
          if (k.comedor === 'sub' && chance(0.6)) out.push({ con: `Plan Comedor · ${MNAME[m]} · ${k.nombres.split(' ')[0]}`, monto: 3200 });
        }
      }
      return out;
    };
    const emitir = (f: Fam, its: Linea[], abono: boolean, saldo: number) => {
      const monto = round2(its.reduce((a, i) => a + i.monto, 0)), createdAt = fechaEn(y, m, cur, ahora, 1.1);
      const metodo = wpick(METODO_PAGO); // nombre EXACTO del catalogo metodosPago
      const ref = metodo === 'Efectivo' ? '' : metodo === 'Transferencia' ? 'TRF-' + int(100000, 999999) : metodo.startsWith('Tarjeta') ? 'AUT-' + int(100000, 999999) : 'CHQ-' + int(1000, 9999);
      const usuario = chance(0.8) ? 'usr_arosario' : 'usr_palmanzar', cj = cajero.get(usuario);
      recibos.push({ id: '', ncf: '', tutor: f.nombre, tutorId: f.tutorId, cajaId: cj?.caja ?? null, cajeroId: cj?.id ?? null, cicloId: cicloDe(createdAt), hora: hm(createdAt), monto, abono, saldo, lineas: its, pagos: [{ m: metodo, r: ref, amt: monto }], createdAt, usuario, metodo });
      falta = round2(falta - monto);
    };
    const cola = shuffle([...famsPago]); let guard = 0;
    while (falta > 30_000 && guard++ < 5000) {
      const f = cola[guard % cola.length], its = crear(f); if (!its.length) continue;
      const tot = its.reduce((a, i) => a + i.monto, 0); if (tot > falta) continue;
      emitir(f, its, false, 0);
    }
    if (falta >= 1) { const f = cola[0]; emitir(f, [{ con: `Colegiatura ${MNAME[m]} ${y} (abono)`, monto: falta }], true, round2(int(500, 4000))); }
  });
  recibos.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).forEach((r, i) => { r.id = 'REC-G' + String(i + 1).padStart(5, '0'); r.ncf = 'B02' + String(90_000_000 + i + 1); });

  // ---- Inscripciones del mes ----
  const inscripciones = nuevos.map(k => {
    const createdAt = fechaEn(cur.y, cur.m, cur, ahora, 1);
    const unico = k.fam.plan.row.n === 1;
    return { k, createdAt, cicloId: ciclo.id!, ncf: 'B02' + String(95_000_000 + Number(k.id)), factura: fin.inscripcion + (unico ? totalDe(k.fam.plan.row, k.tanda) : 0), cuotas: mesesDe(k.fam.plan.row, y0).length };
  });

  // ---- Documentos de expediente ----
  const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const expedientes = todos.map(k => {
    const ing = k.nuevo ? { y: cur.y, m: cur.m } : { y: y0 - int(0, Math.max(0, k.edad - 5)), m: 8 };
    const ficha = {
      carnet: '', ingreso: `${MESES_L[ing.m - 1][0].toUpperCase()}${MESES_L[ing.m - 1].slice(1)} ${ing.y} · ${k.grado} ${k.sec}`, geo: '',
      medico: { sangre: pick(['O+', 'O+', 'A+', 'B+', 'O-', 'A-']), seguro: pick(['ARS Humano', 'ARS Universal', 'Senasa', 'ARS Palic', '']), poliza: '', condiciones: k.alg ? 'Alergia: ' + k.alg : '', planAlim: k.comedor === 'sub' ? 'Suscripción completa · Almuerzo' : k.comedor === 'wal' ? 'Monedero virtual' : '', planAlimExtra: '', emergenciaNombre: `${k.fam.nombre} (${k.fam.parentesco.toLowerCase()})`, emergenciaTel: k.fam.tel, alertaDetalle: k.alg ? 'Alergia registrada: ' + k.alg : '' },
      conducta: { obs: [], record: 'Sin observaciones' }, hist: [], // contrato y tutor legal NO van en el JSON: son Contrato y Alumno.tutorLegalId
    };
    return { alumnoId: k.id, data: JSON.stringify(ficha) };
  });
  const contratos = todos.map(k => ({ id: `ctr-${k.id}-${y0}`, alumnoId: k.id, cicloId: ciclo.id!, planId: k.fam.plan.row.id, tipoBecaId: k.beca ? 'hermano' : null, ctr: `CTR-${y0}-${k.id}`, firmado: `${p2(int(1, 28))}/07/${y0}` }));
  const tiposDoc = await prisma.tipoDocumento.findMany({ where: { requerido: true, estado: 'Activo' }, orderBy: [{ orden: 'asc' }, { id: 'asc' }] });
  const docs = todos.flatMap(k => tiposDoc.map((t, i) => {
    const n = t.nombre, ok = !k.nuevo && chance(0.93);
    return { id: `pdoc-${k.id}-${i}`, alumnoId: k.id, tipoId: t.id, f: ok ? `${norm(n).replace(/\W+/g, '_')}_${k.id}.pdf` : 'Sin archivo', est: ok ? 'Validado' : k.nuevo && chance(0.5) ? 'En revisión' : 'Pendiente', orden: i };
  }));
  const servicios = activosGen.filter(k => k.comedor === 'sub').map(k => ({ id: `psv-com-${k.id}`, alumnoId: k.id, kind: 'rec', aliPlanId: ALI_PLAN.sub, name: 'Plan Almuerzo Completo', icon: 'ph ph-fork-knife', spec: 'Lunes a Viernes 12:30 PM', cost: 3200, corte: `Día ${p2(diaCorte)} de cada mes`, est: 'Activo', alert: k.alg ? 'Ver alergias' : '', fecha: '', st: '', mes: '', reciboId: null }));

  // ---- Comedor ----
  const carnets = activosGen.filter(k => k.comedor).map(k => {
    const alg = k.alg ? k.alg.split(',').map(s => s.trim()) : [], sub = k.comedor === 'sub'; // nombres canonicos del catalogo alergias (las alergias viven en AlumnoAlergia)
    return {
      code: k.code, alumnoId: k.id, aliPlanId: ALI_PLAN[sub ? 'sub' : 'wal'], name: `${k.nombres} ${k.apellidos}`, grado: `${k.grado} ${k.sec} · ${k.tanda}`, plan: sub ? 'Suscripción completa · Almuerzo' : 'Monedero virtual', ok: !(sub && k.comMora),
      restr: alg.length ? 'Alergias registradas: ' + k.alg : 'Ninguna registrada.',
      motivo: sub && k.comMora ? `Almuerzo de ${MNAME[cur.m].toLowerCase()} no pagado · Referir a caja` : '',
    };
  });
  // Monedero UNICO por alumno (antes MobWallet + ComCarnet.wallet/limit/spent): todo carnet tiene su monedero; el consumo de hoy es un movimiento.
  const tienenWallet = new Set(activosGen.filter(k => k.comedor === 'wal' || (k.comedor === 'sub' && chance(0.25))).map(k => k.id));
  const wallets = activosGen.filter(k => k.comedor).map(k => {
    const saldoCarnet = int(0, 1400), limCarnet = pick([200, 250, 300, 400]), gastoHoy = chance(0.5) ? int(0, 250) : 0;
    const propio = tienenWallet.has(k.id), saldoW = int(0, 1500) + (chance(0.5) ? 0.5 : 0), limW = pick([200, 250, 300, 400]);
    return { alumnoId: k.id, saldo: propio ? saldoW : saldoCarnet, limite: propio ? limW : limCarnet, gastoHoy };
  });

  // ---- Asistencia de los ultimos 5 dias lectivos (2 secciones sin marcar hoy) ----
  const rosters = activosGen.map((k, i) => ({ id: 'rg-' + k.id, seccionId: k.secId, orden: i + 1, nombre: `${k.apellidos}, ${k.nombres}`, alumnoId: k.id }));
  const dias: string[] = [];
  for (let d = 0; dias.length < 5 && d < 14; d++) {
    const dt = new Date(Date.UTC(cur.y, cur.m - 1, cur.d - d, 12)); const wd = dt.getUTCDay();
    if (wd !== 0 && wd !== 6) dias.push(dt.toISOString().slice(0, 10));
  }
  const sinMarcar = new Set(shuffle([...cuenta.keys()]).slice(0, 2));
  const asist = rosters.flatMap(r => dias.filter(f => !(f === hoy && sinMarcar.has(r.seccionId))).map(f => ({ rosterId: r.id, fecha: f, estado: wpick([['P', 93], ['T', 3], ['AJ', 2], ['AI', 2]] as const), notificar: true })));

  // ---- Becas ----
  const becas = nBecas > 0 && bec ? [{ id: 'G' + bec.id, cicloId: ciclo.id!, alumnoId: bec.id, est: `${bec.nombres} ${bec.apellidos}`, grado: `${bec.grado} ${bec.sec}`, tipoBecaId: 'hermano', modo: 'pct', valor: 10, exp: 'EXP-BEC-G' + bec.id, estado: 'Aprobada', aprob: `C. Vidal · ${p2(int(1, 6))}/09/${cur.y}` }] : [];

  // ---- Auditoria verosimil (ultimos 30 dias) ----
  const hace30 = ahora.getTime() - 30 * 864e5;
  const audit: { id: string; t: string; usr: string; accion: string; tabla: string; registro: string; prev: string; next: string; ip: string }[] = [];
  const ip = () => `10.0.4.${int(10, 60)}`;
  for (const r of recibos.filter(x => x.createdAt.getTime() >= hace30)) audit.push({ id: '', t: isoT(r.createdAt), usr: r.usuario, accion: 'Insert', tabla: 'Recibos', registro: r.id, prev: '—', next: `${r.ncf} · ${r.metodo} · $${r.monto}${r.abono ? ' (abono)' : ''}`, ip: ip() });
  for (const i of inscripciones) audit.push({ id: '', t: isoT(i.createdAt), usr: chance(0.7) ? 'usr_arosario' : 'usr_palmanzar', accion: 'Insert', tabla: 'Inscripciones', registro: i.k.code, prev: '—', next: `${i.ncf} · ${i.factura}`, ip: ip() });
  for (let i = 0; i < 70; i++) {
    const k = pick(activosGen), campo = pick(['tel', 'dir', 'tanda']);
    audit.push({ id: '', t: isoT(new Date(hace30 + rand() * (ahora.getTime() - hace30 - 60_000))), usr: pick(['usr_palmanzar', 'usr_cvidal']), accion: 'Update', tabla: 'Alumnos', registro: `${k.code}/${campo}`, prev: campo === 'tel' ? telNuevo() : campo === 'dir' ? `${pick(CALLES)} #${int(1, 99)}` : k.tanda, next: campo === 'tel' ? k.fam.tel : campo === 'dir' ? k.fam.dir : k.tanda, ip: ip() });
  }
  for (const b of becas) audit.push({ id: '', t: isoT(new Date(ahora.getTime() - 5 * 864e5)), usr: 'usr_cvidal', accion: 'Update', tabla: 'Becas', registro: b.exp, prev: 'Pendiente', next: 'Aprobada', ip: ip() });
  audit.sort((a, b) => a.t.localeCompare(b.t)).forEach((a, i) => { a.id = 'ag-' + String(i + 1).padStart(6, '0'); });

  // ================= Escritura (una transaccion) =================
  const tutoresRows = fams.map(f => ({ id: f.tutorId, nombre: f.nombre, cedula: f.cedula, parentesco: f.parentesco, tipo: 'Financiero y académico', tel: f.tel, email: f.email }));
  // Alergias (N:M): nombres canonicos del catalogo Alergia (lo siembra seed-estructura antes que los alumnos).
  const alergiaPorNombre = new Map((await prisma.alergia.findMany({ select: { id: true, nombre: true } })).map(a => [a.nombre, a.id]));
  const alergiasRows = todos.flatMap(k => (k.alg ? k.alg.split(',').map(x => x.trim()).filter(Boolean) : []).map(n => {
    const alergiaId = alergiaPorNombre.get(n); if (!alergiaId) throw new Error(`Alergia «${n}» inexistente en el catalogo (alumno ${k.id})`);
    return { alumnoId: k.id, alergiaId };
  }));
  // Medio de pago de cada recibo (un solo medio): FK a MetodoPago por el nombre EXACTO del catalogo.
  const metodoPorNombre = new Map((await prisma.metodoPago.findMany({ select: { id: true, nombre: true } })).map(m => [m.nombre, m.id]));
  const alumnosRows = todos.map(k => ({ id: k.id, code: k.code, nombres: k.nombres, apellidos: k.apellidos, fnac: k.fnac, seccionId: k.secId, cuenta: k.mora ? 'mora' : 'ok', estado: k.estado, dir: k.fam.dir, tel: k.fam.tel, tutorId: k.fam.tutorId, tutorLegalId: k.fam.tutorId }));
  await prisma.$transaction(async (tx: Tx) => {
    // El recaudo de los meses pasa a ser recibos reales: se respaldan y retiran las ventas historicas agregadas de seed-finanzas.
    if (ventasH.length) {
      await tx.sisConfig.upsert({ where: { clave: CLAVE_VENTAS }, update: { valor: JSON.stringify(ventasH) }, create: { clave: CLAVE_VENTAS, valor: JSON.stringify(ventasH) } });
      await tx.finVenta.deleteMany({ where: { id: { startsWith: 'VTA-H' } } });
    }
    await tx.seccion.createMany({ data: secRows });
    await bulk(tutoresRows, d => tx.tutor.createMany({ data: d }));
    await bulk(alumnosRows, d => tx.alumno.createMany({ data: d }));
    await bulk(alergiasRows, d => tx.alumnoAlergia.createMany({ data: d }));
    // Orden dictado por las FK: alumno -> (expediente, documentos, contrato) -> recibos -> servicios -> cargos (referencian alumno, tutor y servicio) -> resto.
    await bulk(expedientes, d => tx.persExpediente.createMany({ data: d }));
    await bulk(docs, d => tx.persDocumento.createMany({ data: d }));
    await bulk(contratos, d => tx.contrato.createMany({ data: d }));
    await bulk(recibos, d => tx.finRecibo.createMany({ data: d.map(({ usuario: _u, metodo, lineas: _l, pagos: _p, ...r }) => ({ ...r, metodoPagoId: metodoPorNombre.get(metodo) ?? null })) }));
    await bulk(servicios, d => tx.servicioAlumno.createMany({ data: d }));
    await bulk(items, d => tx.finCobroItem.createMany({ data: d.map(({ ym: _ym, ...r }) => r) }));
    // Lineas y pagos del recibo (FinReciboItem / FinReciboPago): despues de los cargos que las lineas referencian.
    await bulk(recibos.flatMap(r => lineasData(r.id, r.lineas)), d => tx.finReciboItem.createMany({ data: d }), 400);
    await bulk(recibos.flatMap(r => r.pagos.map((p, orden) => ({ reciboId: r.id, orden, metodoPagoId: metodoPorNombre.get(p.m)!, monto: p.amt, referencia: p.r }))), d => tx.finReciboPago.createMany({ data: d }), 400);
    await bulk(becas, d => tx.finBeca.createMany({ data: d }));
    await bulk(becas, d => tx.finBecaConcepto.createMany({ data: d.map(b => ({ becaId: b.id, conceptoId: 'cb1', orden: 0 })) })); // «Colegiatura»
    await bulk(inscripciones, d => tx.persInscripcion.createMany({ data: d.map(i => ({ id: 'ins-' + i.k.id, alumnoId: i.k.id, ncf: i.ncf, factura: i.factura, cicloId: i.cicloId, planId: i.k.fam.plan.row.id, cuotas: i.cuotas, firma: chance(0.75) ? 'digital' : 'fisica', createdAt: i.createdAt })) }));
    await bulk(carnets, d => tx.comCarnet.createMany({ data: d }));
    await bulk(wallets, d => tx.monedero.createMany({ data: d.map(({ gastoHoy: _g, ...w }) => w) }));
    await bulk(wallets.filter(w => w.gastoHoy > 0), d => tx.monederoMovimiento.createMany({ data: d.map(w => ({ alumnoId: w.alumnoId, tipo: 'Consumo', monto: -w.gastoHoy, saldoDespues: w.saldo, concepto: 'Consumo en comedor' })) }));
    await bulk(rosters, d => tx.acadRoster.createMany({ data: d }));
    await bulk(asist, d => tx.acadAsistencia.createMany({ data: d }), 200);
    await bulk(audit, d => tx.sisAudit.createMany({ data: d }));
    await tx.sisConfig.create({ data: { clave: CLAVE, valor: JSON.stringify({ version: 1, creado: ahora.toISOString(), alumnoDesde: ID0, alumnoHasta: idHasta, alumnos: todos.length, activos: activosGen.length, tutores: fams.length, recibos: recibos.length, cobroItems: items.length, secciones: secRows.length, proyeccion }) } });
  }, { timeout: 300_000, maxWait: 60_000 });

  await sincronizarPlan(prisma); // plan de estudios (SeccionMateria) de las secciones nuevas
  console.log(`seed demo grande ok en ${((Date.now() - t0) / 1000).toFixed(1)}s: ${activosGen.length} activos (+${todos.length - activosGen.length} inactivos/retirados), ${fams.length} tutores, ${secRows.length} secciones, ${items.length} cargos, ${recibos.length} recibos, ${inscripciones.length} inscripciones del mes, mora generada RD$ ${S.toFixed(2)}`);
}

/** Borra SOLO lo generado y restaura las ventas historicas VTA-H*. */
export async function quitarDemoGrande(): Promise<void> {
  const man = await prisma.sisConfig.findUnique({ where: { clave: CLAVE } });
  if (!man) { console.log('seed demo grande: no hay nada que quitar'); return; }
  const m = JSON.parse(man.valor) as { alumnoDesde: number; alumnoHasta: number };
  const ids = Array.from({ length: m.alumnoHasta - m.alumnoDesde + 1 }, (_, i) => String(m.alumnoDesde + i));
  const ventas = await prisma.sisConfig.findUnique({ where: { clave: CLAVE_VENTAS } });
  await prisma.$transaction(async (tx: Tx) => {
    // Orden INVERSO de las FK (hijos antes que padres): notas y asistencia ya no caen en cascada con la nomina (NoAction).
    const rosters = (await tx.acadRoster.findMany({ where: { id: { startsWith: 'rg-' } }, select: { id: true } })).map(r => r.id);
    await tx.acadAsistencia.deleteMany({ where: { rosterId: { in: rosters } } });
    await tx.acadNota.deleteMany({ where: { rosterId: { in: rosters } } });
    await tx.acadRoster.deleteMany({ where: { id: { in: rosters } } });
    await tx.sisAudit.deleteMany({ where: { id: { startsWith: 'ag-' } } });
    await limpiarCicloAnterior(tx, ids);
    await tx.finReciboItem.deleteMany({ where: { reciboId: { startsWith: 'REC-G' } } });
    await tx.finReciboPago.deleteMany({ where: { reciboId: { startsWith: 'REC-G' } } });
    await tx.mobPagoIntencionCargo.deleteMany({ where: { cobroItemId: { startsWith: 'g-' } } });
    await tx.finCobroItem.deleteMany({ where: { id: { startsWith: 'g-' } } });
    await tx.finRecibo.deleteMany({ where: { id: { startsWith: 'REC-G' } } });
    await tx.finBecaConcepto.deleteMany({ where: { becaId: { startsWith: 'G' } } });
    await tx.finBeca.deleteMany({ where: { id: { startsWith: 'G' } } });
    await tx.persInscripcion.deleteMany({ where: { alumnoId: { in: ids } } });
    await tx.servicioAlumno.deleteMany({ where: { alumnoId: { in: ids } } });
    await tx.contrato.deleteMany({ where: { alumnoId: { in: ids } } });
    await tx.persDocumento.deleteMany({ where: { alumnoId: { in: ids } } });
    await tx.persExpediente.deleteMany({ where: { alumnoId: { in: ids } } });
    await tx.comCarnet.deleteMany({ where: { alumnoId: { in: ids } } });
    await tx.monederoMovimiento.deleteMany({ where: { alumnoId: { in: ids } } });
    await tx.monedero.deleteMany({ where: { alumnoId: { in: ids } } });
    await tx.alumnoAlergia.deleteMany({ where: { alumnoId: { in: ids } } });
    await tx.tutorAlumno.deleteMany({ where: { alumnoId: { in: ids } } });
    await tx.matricula.deleteMany({ where: { alumnoId: { in: ids } } });
    await tx.alumno.deleteMany({ where: { id: { in: ids } } });
    await tx.tutor.deleteMany({ where: { id: { startsWith: 'tg' } } });
    // Las secciones generadas (sg*) pueden tener asignaciones, horario y docentes (seed-catalogos): se retiran en orden inverso de FK.
    await tx.asistenciaResumen.deleteMany({ where: { matricula: { seccionId: { startsWith: 'sg' } } } });
    await tx.matricula.deleteMany({ where: { seccionId: { startsWith: 'sg' } } });
    await tx.acadAsignacion.deleteMany({ where: { seccionId: { startsWith: 'sg' } } }); // AsignacionAula en cascada
    await tx.acadHorario.deleteMany({ where: { seccionId: { startsWith: 'sg' } } });
    await tx.docenteSeccion.deleteMany({ where: { seccionId: { startsWith: 'sg' } } });
    await tx.seccionMateria.deleteMany({ where: { seccionId: { startsWith: 'sg' } } });
    await tx.seccion.deleteMany({ where: { id: { startsWith: 'sg' } } });
    if (ventas) {
      const metodos = new Map((await tx.metodoPago.findMany({ select: { id: true, nombre: true } })).map(m => [m.nombre, m.id]));
      for (const v of JSON.parse(ventas.valor) as { id: string; ncf: string; total: number; metodo: string; metodoPagoId?: string; doc: string; createdAt: string }[]) {
        const metodoPagoId = v.metodoPagoId ?? metodos.get(v.metodo);
        if (!metodoPagoId) throw new Error(`Venta ${v.id}: medio de pago «${v.metodo}» inexistente`);
        await tx.finVenta.upsert({ where: { id: v.id }, update: {}, create: { ...v, metodoPagoId, createdAt: new Date(v.createdAt) } });
      }
      await tx.sisConfig.delete({ where: { clave: CLAVE_VENTAS } });
    }
    await tx.sisConfig.delete({ where: { clave: CLAVE } });
  }, { timeout: 120_000, maxWait: 60_000 });
  console.log(`seed demo grande quitado: ${ids.length} alumnos y sus datos eliminados; ventas históricas restauradas`);
}

if (/seed-demo-grande\.(ts|js)$/.test(process.argv[1] ?? '')) {
  (process.argv.includes('--quitar') ? quitarDemoGrande() : sembrarDemoGrande())
    .catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
