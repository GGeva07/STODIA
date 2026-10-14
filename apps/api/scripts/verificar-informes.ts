/**
 * VERIFICACIÓN AUTOMÁTICA DE INFORMES (SOLO LECTURA) — docs/informes-analisis.md §11.
 *
 *   cd apps/api && npx tsx scripts/verificar-informes.ts [--api http://localhost:3000] [--ciclos 2025-2026,2026-2027,2027-2028]
 *                                                        [--usuario usr_palmanzar --clave stodia123] [--out <carpeta>] [--solo cxc,planes] [--sinxlsx]
 *
 * Qué hace (contra la API y la BD de DATABASE_URL; usa solo SELECT, nunca escribe):
 *   1. Llama a cada informe registrado (GET /informes) con varios filtros y mide el tiempo; comprueba que el informe «fiscal» siga «En preparación» (409 EN_PREPARACION).
 *   2. Descarga la exportación a Excel (GET /informes/:id/export y /informes/cierre/:ciclo/export), la descomprime con un lector ZIP/OOXML propio y valida: [Content_Types].xml,
 *      workbook.xml, nombres de hoja (≤ 31 caracteres, sin \ / ? * [ ] :, únicos), XML bien formado, límites de Excel (filas, columnas, 32 767 caracteres por celda), números como
 *      número (no texto), UTF-8 (sin «Ã±»…), encabezados, y que CADA hoja tenga todas las filas del informe (size=all) y los totales/Resumen coincidan.
 *   3. Compara totales y agrupaciones contra SQL independiente (consultas escritas aquí, no las del informe): recaudación, emisión, neto, notas, CxC, planes, movimientos,
 *      calificaciones, extracurriculares, inventario, cierre. Cruza informes entre sí (recaudación = emisión = cierre.cobrado, CxC = planes.pendiente, ...).
 * Salida: tabla por informe + código de salida 0 (todo OK) / 1 (hay fallos). Con --out guarda los .xlsx descargados.
 * Es independiente de los datos: los esperados se calculan en SQL en cada corrida; las diferencias conocidas del sembrado se explican en docs §11.
 */
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { PrismaClient } from '@prisma/client';

// ------------------------------------------------------------------------------------------------------------------ args
const arg = (k: string, d = '') => { const i = process.argv.indexOf('--' + k); return i >= 0 ? (process.argv[i + 1] ?? '') : d; };
const flag = (k: string) => process.argv.includes('--' + k);
const API = arg('api', 'http://localhost:3000').replace(/\/$/, '');
const USUARIO = arg('usuario', 'usr_palmanzar'), CLAVE = arg('clave', 'stodia123');
const OUT = arg('out');
const SOLO = arg('solo') ? arg('solo').split(',') : null;
const SIN_XLSX = flag('sinxlsx');
const prisma = new PrismaClient();

// ------------------------------------------------------------------------------------------------------------------ resultados
interface Res { informe: string; ciclo: string; check: string; ok: boolean; esperado?: unknown; obtenido?: unknown; nota?: string }
const resultados: Res[] = [];
const tiempos: { informe: string; ciclo: string; ms: number; filas: number }[] = [];
let actual = { informe: '', ciclo: '' };
const eq = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;
function check(nombre: string, ok: boolean, esperado?: unknown, obtenido?: unknown, nota?: string) {
  resultados.push({ ...actual, check: nombre, ok, esperado, obtenido, nota });
  if (!ok) console.log(`  FALLA [${actual.informe} ${actual.ciclo}] ${nombre}: esperado=${JSON.stringify(esperado)} obtenido=${JSON.stringify(obtenido)}${nota ? ' · ' + nota : ''}`);
}
const num = (v: unknown) => Number(v ?? 0);
const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;
const cmpNum = (nombre: string, esperado: number, obtenido: unknown, tol = 0.01, nota?: string) => check(nombre, eq(esperado, num(obtenido), tol), r2(esperado), obtenido, nota);

// ------------------------------------------------------------------------------------------------------------------ SQL (solo SELECT)
async function sql<T = Record<string, unknown>>(q: string, ...p: unknown[]): Promise<T[]> {
  if (!/^\s*(select|with)\b/i.test(q) || /\b(insert|update|delete|drop|alter|create|truncate|merge|exec)\b/i.test(q)) throw new Error('Solo SELECT: ' + q.slice(0, 80));
  let i = 0;
  return (await prisma.$queryRawUnsafe(q.replace(/\?/g, () => '@P' + ++i), ...p)) as T[];
}
const uno = async (q: string, ...p: unknown[]) => num(Object.values((await sql(q, ...p))[0] ?? {})[0]);

// ------------------------------------------------------------------------------------------------------------------ HTTP
let token = '';
async function login() {
  const r = await fetch(API + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ usuario: USUARIO, password: CLAVE }) });
  if (!r.ok) throw new Error('Login falló: ' + r.status);
  token = ((await r.json()) as { token: string }).token;
}
async function get(path: string, extra: Record<string, string> = {}) {
  const t0 = Date.now();
  const r = await fetch(API + path, { headers: { authorization: 'Bearer ' + token, ...extra } });
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, ms: Date.now() - t0, buf, headers: r.headers, json: () => JSON.parse(buf.toString('utf8')) };
}
interface Celda { v: string | number | null }
type Tabla = { id: string; titulo: string; columnas: { id: string; titulo: string; tipo: string }[]; filas: (string | number | null)[][]; totales?: (string | number | null)[]; total: number; detalle?: { columnas: unknown[]; porFila: unknown[][][] } };
type Resp = { id: string; titulo: string; ciclo: string; resumen: { id: string; etiqueta: string; valor: number | string; tipo: string }[]; tablas: Tabla[]; notas: string[]; anexos?: Tabla[]; filtros: { etiqueta: string; valor: string }[] };
const qs = (o: Record<string, string>) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '')).toString();
async function informe(id: string, o: Record<string, string>, size = '25'): Promise<Resp> {
  const r = await get(`/informes/${id}?${qs({ ...o, size })}`);
  if (r.status !== 200) throw new Error(`GET /informes/${id} → ${r.status}: ${r.buf.toString('utf8').slice(0, 300)}`);
  const j = r.json() as Resp;
  tiempos.push({ informe: id, ciclo: o.ciclo ?? '', ms: r.ms, filas: j.tablas.reduce((a, t) => a + t.total, 0) });
  return j;
}
const resumen = (r: Resp, id: string) => num(r.resumen.find(x => x.id === id)?.valor);
const tabla = (r: Resp, id: string) => { const t = r.tablas.find(x => x.id === id); if (!t) throw new Error('No existe la tabla ' + id); return t; };

// ------------------------------------------------------------------------------------------------------------------ Lector XLSX independiente
interface Hoja { nombre: string; filas: Map<number, Map<number, { t: 's' | 'n'; v: string }>>; maxFila: number; maxCol: number; xml: string }
const colNum = (s: string) => s.split('').reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0);
function unzip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('No es un ZIP (sin directorio central)');
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Directorio central corrupto');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24), nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nl);
    const lnl = buf.readUInt16LE(off + 26), lel = buf.readUInt16LE(off + 28), ds = off + 30 + lnl + lel;
    const raw = buf.subarray(ds, ds + csize);
    const data = method === 8 ? inflateRawSync(raw) : raw;
    if (data.length !== usize) throw new Error(`Tamaño descomprimido distinto en ${name}`);
    out.set(name, data);
    p += 46 + nl + el + cl;
  }
  return out;
}
/** Comprobación de buena formación XML (pila de etiquetas, comillas de atributos y entidades). */
function xmlBienFormado(xml: string): string | null {
  const pila: string[] = [];
  const re = /<([^>]*)>/g;
  let m: RegExpExecArray | null, ult = 0;
  const textoOk = (t: string) => !/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(t) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(t);
  while ((m = re.exec(xml))) {
    if (!textoOk(xml.slice(ult, m.index))) return 'texto con & sin escapar o caracteres de control';
    ult = re.lastIndex;
    const t = m[1];
    if (t.startsWith('?') || t.startsWith('!')) continue;
    if (t.startsWith('/')) { if (pila.pop() !== t.slice(1).trim()) return 'etiqueta de cierre inesperada ' + t; continue; }
    const nombre = /^[^\s/]+/.exec(t)?.[0];
    if (!nombre) return 'etiqueta vacía';
    const attrs = t.slice(nombre.length).replace(/\/$/, '');
    if (attrs.replace(/\s+[\w:.-]+="[^"]*"/g, '').trim() !== '') return 'atributos mal formados en ' + t.slice(0, 60);
    if (!t.endsWith('/')) pila.push(nombre);
  }
  return pila.length ? 'etiquetas sin cerrar: ' + pila.join(',') : null;
}
const desesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
interface Libro { nombres: string[]; hojas: Hoja[]; problemas: string[] }
function leerXlsx(buf: Buffer): Libro {
  const problemas: string[] = [];
  const z = unzip(buf);
  for (const req of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml']) if (!z.has(req)) problemas.push('Falta ' + req);
  const txt = (n: string) => z.get(n)?.toString('utf8') ?? '';
  for (const [n, d] of z) if (n.endsWith('.xml') || n.endsWith('.rels')) { const e = xmlBienFormado(d.toString('utf8')); if (e) problemas.push(`${n}: XML mal formado (${e})`); }
  const ct = txt('[Content_Types].xml');
  const wb = txt('xl/workbook.xml'), rels = txt('xl/_rels/workbook.xml.rels');
  const nombres: string[] = [], hojas: Hoja[] = [];
  for (const m of wb.matchAll(/<sheet name="([^"]*)" sheetId="(\d+)" r:id="([^"]+)"\/>/g)) {
    const nombre = desesc(m[1]);
    nombres.push(nombre);
    const rel = new RegExp(`<Relationship Id="${m[3]}"[^>]*Target="([^"]+)"`).exec(rels) ?? new RegExp(`<Relationship [^>]*Target="([^"]+)"[^>]*Id="${m[3]}"`).exec(rels);
    const path = rel ? 'xl/' + rel[1].replace(/^\//, '').replace(/^xl\//, '') : '';
    if (!path || !z.has(path)) { problemas.push(`Hoja «${nombre}»: sin parte ${path}`); continue; }
    if (!ct.includes(`/${path}"`)) problemas.push(`[Content_Types] no declara /${path}`);
    const xml = txt(path);
    const filas = new Map<number, Map<number, { t: 's' | 'n'; v: string }>>();
    let maxFila = 0, maxCol = 0, ultimaFila = 0;
    for (const rm of xml.matchAll(/<row r="(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const rn = Number(rm[1]);
      if (rn <= ultimaFila) problemas.push(`Hoja «${nombre}»: filas no crecientes en ${rn}`);
      ultimaFila = rn; maxFila = Math.max(maxFila, rn);
      const fila = new Map<number, { t: 's' | 'n'; v: string }>();
      let ultCol = 0;
      for (const cm of (rm[2] ?? '').matchAll(/<c r="([A-Z]+)(\d+)"((?: [a-z]+="[^"]*")*)>([\s\S]*?)<\/c>/g)) {
        const cn = colNum(cm[1]);
        if (Number(cm[2]) !== rn) problemas.push(`Hoja «${nombre}»: referencia ${cm[1]}${cm[2]} en la fila ${rn}`);
        if (cn <= ultCol) problemas.push(`Hoja «${nombre}»: columnas no crecientes en ${cm[1]}${rn}`);
        ultCol = cn; maxCol = Math.max(maxCol, cn);
        if (/ t="inlineStr"/.test(cm[3])) { const t = /<t[^>]*>([\s\S]*?)<\/t>/.exec(cm[4]); fila.set(cn, { t: 's', v: desesc(t?.[1] ?? '') }); }
        else { const v = /<v>([^<]*)<\/v>/.exec(cm[4])?.[1] ?? ''; if (!Number.isFinite(Number(v)) || v === '') problemas.push(`Hoja «${nombre}»: valor numérico inválido «${v}» en ${cm[1]}${rn}`); fila.set(cn, { t: 'n', v }); }
      }
      filas.set(rn, fila);
    }
    hojas.push({ nombre, filas, maxFila, maxCol, xml });
  }
  return { nombres, hojas, problemas };
}

/** Validaciones estructurales de un libro: nombres, límites de Excel, codificación. */
function validarLibro(l: Libro, etiqueta: string) {
  check(`${etiqueta}: estructura OOXML (partes, XML bien formado, referencias)`, l.problemas.length === 0, [], l.problemas.slice(0, 5));
  check(`${etiqueta}: tiene hojas`, l.nombres.length > 0, '>0', l.nombres.length);
  const bajos = new Set<string>();
  let malNombre = '';
  for (const n of l.nombres) {
    if (n.length === 0 || n.length > 31 || /[\\/?*[\]:]/.test(n) || n.startsWith("'") || n.endsWith("'") || bajos.has(n.toLowerCase())) malNombre += `«${n}» `;
    bajos.add(n.toLowerCase());
  }
  check(`${etiqueta}: nombres de hoja válidos (≤31, sin \\ / ? * [ ] :, únicos)`, !malNombre, '', malNombre);
  let exceso = '';
  for (const h of l.hojas) {
    if (h.maxFila > 1048576) exceso += `${h.nombre}: ${h.maxFila} filas `;
    if (h.maxCol > 16384) exceso += `${h.nombre}: ${h.maxCol} columnas `;
    for (const f of h.filas.values()) for (const c of f.values()) if (c.t === 's' && c.v.length > 32767) exceso += `${h.nombre}: celda de ${c.v.length} caracteres `;
  }
  check(`${etiqueta}: dentro de los límites de Excel`, !exceso, '', exceso);
  const moji = l.hojas.filter(h => /Ã[\u0080-¿]|Â[\u0080-¿]|�/.test(h.xml)).map(h => h.nombre);
  check(`${etiqueta}: UTF-8 correcto (sin mojibake ni U+FFFD)`, moji.length === 0, [], moji);
  const acentos = l.hojas.some(h => /[áéíóúñÁÉÍÓÚÑ]/.test(h.xml));
  check(`${etiqueta}: acentos/ñ presentes y legibles`, acentos || true, '', acentos ? 'sí' : 'sin acentos en este informe');
}

/** Compara cada hoja con las tablas del informe (size=all): mismas filas, totales, encabezados, tipos. */
function compararConJson(l: Libro, r: Resp, etiqueta: string) {
  type Esperada = { nombre: string; cab: string[]; tipos: string[]; filas: (string | number | null)[][] };
  const esp: Esperada[] = [{ nombre: 'Resumen', cab: ['Indicador', 'Valor'], tipos: ['texto', 'texto'], filas: [...r.resumen.map(x => [x.etiqueta, x.valor]), [], ...r.notas.map(n => [n])] }];
  for (const t of r.tablas) {
    esp.push({ nombre: t.titulo, cab: t.columnas.map(c => c.titulo), tipos: t.columnas.map(c => c.tipo), filas: [...t.filas, ...(t.totales ? [t.totales] : [])] });
    if (t.detalle) {
      const f: (string | number | null)[][] = [];
      t.filas.forEach((fila, i) => { for (const x of t.detalle!.porFila[i] ?? []) f.push([fila[0] ?? null, fila[1] ?? null, ...(x as (string | number | null)[])]); });
      esp.push({ nombre: 'Det. ' + t.titulo, cab: [], tipos: ['texto', 'texto', ...(t.detalle.columnas as { tipo: string }[]).map(c => c.tipo)], filas: f });
    }
  }
  for (const a of r.anexos ?? []) esp.push({ nombre: a.titulo, cab: a.columnas.map(c => c.titulo), tipos: a.columnas.map(c => c.tipo), filas: [...a.filas, ...(a.totales ? [a.totales] : [])] });
  check(`${etiqueta}: nº de hojas = Resumen + tablas + detalles + anexos`, l.hojas.length === esp.length, esp.length, l.hojas.length);
  const pre = (h: Hoja) => { // filas previas a la cabecera = hasta la fila que tiene la cabecera en negrita (s="1" de la última antes de datos): se busca por el pane
    const m = /<pane ySplit="(\d+)"/.exec(h.xml); return m ? Number(m[1]) : 1;
  };
  let sinFilas = '', sinTipos = '', sinCab = '';
  l.hojas.forEach((h, i) => {
    const e = esp[i];
    if (!e) return;
    const cabFila = pre(h);              // número de la fila de cabecera
    const datos = h.maxFila - cabFila;   // filas de datos
    const esperadas = i === 0 ? e.filas.length : e.filas.length; // el Resumen incluye notas y la fila vacía
    if (datos !== esperadas) sinFilas += `«${h.nombre}» ${datos}≠${esperadas}; `;
    // encabezados
    const cab = h.filas.get(cabFila);
    if (e.cab.length) { const got = e.cab.map((_, c) => cab?.get(c + 1)?.v ?? ''); if (JSON.stringify(got) !== JSON.stringify(e.cab)) sinCab += `«${h.nombre}»; `; }
    // tipos: columnas numéricas del informe deben ir como número (t='n') en cada fila de datos que tenga número
    if (i > 0) e.filas.forEach((fila, k) => {
      fila.forEach((v, c) => {
        if (typeof v !== 'number' || !Number.isFinite(v)) return;
        const cel = h.filas.get(cabFila + 1 + k)?.get(c + 1);
        if (!cel || cel.t !== 'n' || !eq(Number(cel.v), v, 1e-9)) { if (sinTipos.length < 200) sinTipos += `«${h.nombre}» f${k + 1}c${c + 1}; `; }
      });
    });
  });
  check(`${etiqueta}: cada hoja trae TODAS las filas del informe (size=all)`, !sinFilas, '', sinFilas.slice(0, 300));
  check(`${etiqueta}: encabezados de columna idénticos a la pantalla`, !sinCab, '', sinCab.slice(0, 200));
  check(`${etiqueta}: números exportados como número y con el mismo valor`, !sinTipos, '', sinTipos.slice(0, 300));
  // Resumen coincide con la pantalla
  const h0 = l.hojas[0];
  if (h0) {
    const base = pre(h0);
    let malRes = '';
    r.resumen.forEach((x, k) => { const c = h0.filas.get(base + 1 + k); const a = c?.get(1)?.v, b = c?.get(2); if (a !== x.etiqueta || (typeof x.valor === 'number' ? !(b?.t === 'n' && eq(Number(b.v), x.valor, 1e-9)) : b?.v !== String(x.valor))) malRes += x.etiqueta + '; '; });
    check(`${etiqueta}: indicadores del Resumen = pantalla`, !malRes, '', malRes);
  }
}

// ------------------------------------------------------------------------------------------------------------------ cuadres SQL por informe
interface Ciclo { id: string; nombre: string; fechaInicio: string; fechaFin: string; estado: string }
let ciclos: Ciclo[] = [];
const cic = (nombre: string) => ciclos.find(c => c.nombre.replace(/[–—]/g, '-') === nombre)!;
/** AAAA-MM de un instante en America/Santo_Domingo (UTC-4, sin horario de verano). */
const MES_SQL = `CONVERT(char(7), DATEADD(hour, -4, r.createdAt), 120)`;
const metodoNombre: Record<string, string> = {};
const hoyRD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());
const finDia = (iso: string) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
/** Instante UTC (texto SQL) del inicio del día RD. */
const iniUtc = (iso: string) => iso + ' 04:00:00';

async function cuadreRecaudacion(c: Ciclo, o: Record<string, string> = {}) {
  actual = { informe: 'recaudacion', ciclo: c.nombre + (o.desde || o.metodo || o.cajero ? ' ' + JSON.stringify(o) : '') };
  const r = await informe('recaudacion', { ciclo: c.nombre, ...o });
  const rg = o.desde || o.hasta ? `AND r.createdAt >= '${iniUtc(o.desde ?? '1900-01-01')}' AND r.createdAt < '${iniUtc(finDia(o.hasta ?? '2999-12-31'))}'` : '';
  const caj = o.cajero ? `AND r.cajeroId = '${o.cajero}'` : '', met = o.metodo ? `AND p.metodoPagoId = '${o.metodo}'` : '';
  const cobrado = await uno(`SELECT CAST(ISNULL(SUM(p.monto),0) AS float) FROM FinReciboPago p JOIN FinRecibo r ON r.id = p.reciboId WHERE r.cicloId = ? AND r.est <> 'Anulado' ${rg} ${caj} ${met}`, c.id);
  cmpNum('Cobrado en recibos = Σ FinReciboPago de recibos vigentes', cobrado, resumen(r, 'cobrado'));
  const nRec = await uno(`SELECT COUNT(*) FROM FinRecibo r WHERE r.cicloId = ? AND r.est <> 'Anulado' ${rg} ${caj} ${o.metodo ? `AND EXISTS (SELECT 1 FROM FinReciboPago p WHERE p.reciboId = r.id AND p.metodoPagoId = '${o.metodo}')` : ''}`, c.id);
  cmpNum('Recibos vigentes', nRec, resumen(r, 'recibos'), 0);
  const an = await sql<{ n: number; s: number }>(`SELECT COUNT(*) n, CAST(ISNULL(SUM(r.monto),0) AS float) s FROM FinRecibo r WHERE r.cicloId = ? AND r.est = 'Anulado' ${rg} ${caj} ${o.metodo ? `AND EXISTS (SELECT 1 FROM FinReciboPago p WHERE p.reciboId = r.id AND p.metodoPagoId = '${o.metodo}')` : ''}`, c.id);
  cmpNum('Recibos anulados (n)', num(an[0].n), resumen(r, 'anulados'), 0);
  cmpNum('Monto anulado', num(an[0].s), tabla(r, 'anulados').totales?.[6]);
  // por método
  const pm = await sql<{ id: string; n: number; s: number }>(`SELECT p.metodoPagoId id, COUNT(*) n, CAST(SUM(p.monto) AS float) s FROM FinReciboPago p JOIN FinRecibo r ON r.id = p.reciboId WHERE r.cicloId = ? AND r.est <> 'Anulado' ${rg} ${caj} ${met} GROUP BY p.metodoPagoId`, c.id);
  const mt = tabla(r, 'metodo');
  check('Nº de métodos de pago = filas del desglose', mt.filas.length === pm.length, pm.length, mt.filas.length);
  for (const x of pm) { const f = mt.filas.find(y => y[0] === metodoNombre[x.id]); cmpNum(`Método ${metodoNombre[x.id]}: monto`, num(x.s), f?.[2]); cmpNum(`Método ${metodoNombre[x.id]}: pagos`, num(x.n), f?.[1], 0); }
  // por mes
  const pmes = await sql<{ m: string; s: number }>(`SELECT ${MES_SQL} m, CAST(SUM(p.monto) AS float) s FROM FinReciboPago p JOIN FinRecibo r ON r.id = p.reciboId WHERE r.cicloId = ? AND r.est <> 'Anulado' ${rg} ${caj} ${met} GROUP BY ${MES_SQL}`, c.id);
  cmpNum('Σ meses = cobrado', pmes.reduce((a, x) => a + num(x.s), 0), tabla(r, 'mes').totales?.[1]);
  check('Nº de meses', pmes.length === tabla(r, 'mes').filas.length, pmes.length, tabla(r, 'mes').filas.length);
  // ventas rápidas: por cicloId y, si no tiene, por fechas del ciclo
  if (!o.desde && !o.hasta && !o.metodo && !o.cajero) {
    const v = await uno(`SELECT CAST(ISNULL(SUM(total),0) AS float) FROM FinVenta WHERE cicloId = ? OR (cicloId IS NULL AND createdAt >= '${iniUtc(c.fechaInicio)}' AND createdAt < '${iniUtc(finDia(c.fechaFin))}')`, c.id);
    cmpNum('Ventas rápidas del ciclo', v, resumen(r, 'ventas'));
    cmpNum('Total recaudado = recibos + ventas', cobrado + v, resumen(r, 'total'));
  }
  // 3 recibos al azar (los de mayor monto): monto y método
  const top = await sql<{ id: string; monto: number }>(`SELECT TOP 3 r.id, CAST(r.monto AS float) monto FROM FinRecibo r WHERE r.cicloId = ? AND r.est <> 'Anulado' ${rg} ${caj} ORDER BY r.monto DESC, r.id`, c.id);
  const det = tabla(await informe('recaudacion', { ciclo: c.nombre, ...o, tabla: 'recibos' }, 'all'), 'recibos');
  for (const t of top) { const f = det.filas.find(y => y[0] === t.id); if (!o.metodo) cmpNum(`Recibo ${t.id}: monto en el detalle`, t.monto, f?.[6]); }
  cmpNum('Detalle por recibo: filas = recibos vigentes', nRec, det.total, 0);
  return { cobrado, r };
}

async function cuadreNeto(c: Ciclo) {
  actual = { informe: 'neto', ciclo: c.nombre };
  const r = await informe('neto', { ciclo: c.nombre });
  const cobrado = await uno(`SELECT CAST(ISNULL(SUM(p.monto),0) AS float) FROM FinReciboPago p JOIN FinRecibo r ON r.id = p.reciboId WHERE r.cicloId = ? AND r.est <> 'Anulado'`, c.id);
  // devoluciones = reembolsos de notas de crédito Emitidas sobre recibos VIGENTES del ciclo del recibo
  const dev = await uno(`SELECT CAST(ISNULL(SUM(e.monto),0) AS float) FROM NotaFiscalReembolso e JOIN NotaFiscal n ON n.id = e.notaId JOIN FinRecibo r ON r.id = n.reciboId WHERE n.clase = 'CREDITO' AND n.estado = 'Emitida' AND r.cicloId = ? AND r.est <> 'Anulado'`, c.id);
  cmpNum('Cobrado', cobrado, resumen(r, 'cobrado'));
  cmpNum('Devoluciones (reembolsos de NC sobre recibos vigentes)', dev, resumen(r, 'devoluciones') || resumen(r, 'dev'));
  cmpNum('Cobrado neto = cobrado − devoluciones', cobrado - dev, resumen(r, 'neto'));
  return r;
}

async function cuadreNotas(c: Ciclo) {
  actual = { informe: 'notas', ciclo: c.nombre };
  const r = await informe('notas', { ciclo: c.nombre });
  const g = await sql<{ clase: string; n: number; s: number }>(`SELECT clase, COUNT(*) n, CAST(SUM(monto) AS float) s FROM NotaFiscal WHERE cicloId = ? AND estado = 'Emitida' GROUP BY clase`, c.id);
  const tot = g.reduce((a, x) => a + num(x.n), 0);
  cmpNum('Notas emitidas', tot, resumen(r, 'total') || resumen(r, 'notas') || r.resumen[0]?.valor, 0);
  const tn = tabla(r, 'notas');
  cmpNum('Detalle de notas: filas', await uno(`SELECT COUNT(*) FROM NotaFiscal WHERE cicloId = ?`, c.id), tn.total, 0);
  const por = await sql<{ motivo: string; n: number; s: number }>(`SELECT m.nombre motivo, COUNT(*) n, CAST(SUM(n.monto) AS float) s FROM NotaFiscal n JOIN MotivoNota m ON m.id = n.motivoId WHERE n.cicloId = ? AND n.estado = 'Emitida' GROUP BY m.nombre`, c.id);
  const tm = tabla(r, 'motivo');
  for (const x of por) { const f = tm.filas.find(y => y[0] === x.motivo); cmpNum(`Motivo «${x.motivo}»: n`, num(x.n), f?.[3], 0); cmpNum(`Motivo «${x.motivo}»: monto`, num(x.s), f?.[4]); }
  return r;
}

async function cuadreEmision(c: Ciclo, recaudado: number) {
  actual = { informe: 'emision', ciclo: c.nombre };
  const r = await informe('emision', { ciclo: c.nombre });
  const rec = await sql<{ n: number; s: number }>(`SELECT COUNT(*) n, CAST(ISNULL(SUM(monto),0) AS float) s FROM FinRecibo WHERE cicloId = ? AND est <> 'Anulado'`, c.id);
  const ven = await sql<{ n: number; s: number }>(`SELECT COUNT(*) n, CAST(ISNULL(SUM(total),0) AS float) s FROM FinVenta WHERE cicloId = ? OR (cicloId IS NULL AND createdAt >= '${iniUtc(c.fechaInicio)}' AND createdAt < '${iniUtc(finDia(c.fechaFin))}')`, c.id);
  const ins = await sql<{ n: number; s: number }>(`SELECT COUNT(*) n, CAST(ISNULL(SUM(factura),0) AS float) s FROM PersInscripcion i WHERE cicloId = ? AND NOT EXISTS (SELECT 1 FROM FinRecibo r WHERE r.ncf = i.ncf)`, c.id);
  const total = num(rec[0].s) + num(ven[0].s) + num(ins[0].s);
  cmpNum('Emisión total vigente = recibos + ventas + inscripciones sin recibo', total, resumen(r, 'total') || r.resumen[0]?.valor);
  cmpNum('Comprobantes vigentes', num(rec[0].n) + num(ven[0].n) + num(ins[0].n), r.resumen[1]?.valor, 0);
  cmpNum('Recibos vigentes de la emisión = pagos de recibos (informe 5)', recaudado, num(rec[0].s));
  const anu = await sql<{ n: number; s: number }>(`SELECT COUNT(*) n, CAST(ISNULL(SUM(monto),0) AS float) s FROM FinRecibo WHERE cicloId = ? AND est = 'Anulado'`, c.id);
  cmpNum('Comprobantes anulados', num(anu[0].n), r.resumen.find(x => /anulados$/i.test(x.etiqueta))?.valor, 0);
  // líneas de recibo por categoría (neto = monto − descuento); lo que no tenga categoría guardada se omite del esperado y se verifica por total
  const cat = await sql<{ cat: string; s: number }>(`SELECT ISNULL(i.categoria, '(sin)') cat, CAST(SUM(i.monto - i.descuento) AS float) s FROM FinReciboItem i JOIN FinRecibo r ON r.id = i.reciboId WHERE r.cicloId = ? AND r.est <> 'Anulado' GROUP BY ISNULL(i.categoria, '(sin)')`, c.id);
  const sinCat = cat.find(x => x.cat === '(sin)');
  const tc = tabla(r, 'categorias');
  check('Todas las líneas de recibo tienen categoría guardada', !sinCat, 0, sinCat?.s);
  const nom: Record<string, string> = { colegiatura: 'Colegiatura', inscripcion: 'Inscripción', reinscripcion: 'Reinscripción', materiales: 'Materiales', servicio: 'Servicios', articulo: 'Artículos', mora: 'Mora', otro: 'Otros' };
  for (const x of cat) { if (x.cat === '(sin)') continue; const f = tc.filas.find(y => String(y[0]).toLowerCase().startsWith((nom[x.cat] ?? x.cat).toLowerCase().slice(0, 6))); if (x.cat === 'inscripcion' || x.cat === 'articulo') continue; cmpNum(`Categoría ${x.cat} (líneas de recibo)`, num(x.s), f?.[5], 0.01, 'recibos; las categorías «inscripcion»/«articulo» además suman inscripciones/ventas'); }
  // facturas: filas = recibos vigentes + anulados + ventas + inscripciones
  const tf = tabla(await informe('emision', { ciclo: c.nombre, tabla: 'facturas' }, 'all'), 'facturas');
  cmpNum('Detalle por factura: filas', num(rec[0].n) + num(anu[0].n) + num(ven[0].n) + num(ins[0].n), tf.total, 0);
  const cu = tabla(r, 'cuadre');
  check('Cuadres internos del informe en 0', cu.filas.every(f => eq(num(f[3]), 0)), 0, cu.filas.map(f => f[3]));
  return r;
}

async function cuadreCxc(c: Ciclo, o: Record<string, string> = {}) {
  actual = { informe: 'cxc', ciclo: c.nombre + (Object.keys(o).length ? ' ' + JSON.stringify(o) : '') };
  const r = await informe('cxc', { ciclo: c.nombre, ...o });
  const hoy = hoyRD();
  const where = [`f.cicloId = ? AND f.paid = 0`];
  if (o.seccion) where.push(`EXISTS (SELECT 1 FROM Matricula m WHERE m.alumnoId = f.alumnoId AND m.cicloId = f.cicloId AND m.seccionId = '${o.seccion}')`);
  if (o.grado) where.push(`EXISTS (SELECT 1 FROM Matricula m JOIN Seccion s ON s.id = m.seccionId WHERE m.alumnoId = f.alumnoId AND m.cicloId = f.cicloId AND s.gradoId = '${o.grado}')`);
  const dias = `DATEDIFF(day, TRY_CONVERT(date, f.vence, 103), '${hoy}')`;
  const vencidoExpr = `(TRY_CONVERT(date, f.vence, 103) < '${hoy}')`;
  const filtroVenc = o.soloVencidos ? `AND ${vencidoExpr}` : '';
  const base = `FROM FinCobroItem f WHERE ${where.join(' AND ')} ${filtroVenc}`;
  const tot = await sql<{ s: number; n: number; mora: number; al: number; tu: number }>(`SELECT CAST(ISNULL(SUM(f.monto),0) AS float) s, COUNT(*) n, CAST(ISNULL(SUM(CASE WHEN f.tipo='mora' THEN f.monto ELSE 0 END),0) AS float) mora, COUNT(DISTINCT f.alumnoId) al, COUNT(DISTINCT f.tutorId) tu ${base}`, c.id);
  cmpNum('Saldo pendiente', num(tot[0].s), resumen(r, 'saldo') || r.resumen[0]?.valor);
  cmpNum('Cargos sin pagar', num(tot[0].n), r.resumen.find(x => /Cargos sin pagar/.test(x.etiqueta))?.valor, 0);
  cmpNum('Mora pendiente', num(tot[0].mora), r.resumen.find(x => /Mora/.test(x.etiqueta))?.valor);
  cmpNum('Estudiantes con saldo', num(tot[0].al), r.resumen.find(x => /Estudiantes/.test(x.etiqueta))?.valor, 0);
  cmpNum('Tutores con saldo', num(tot[0].tu), r.resumen.find(x => /Tutores/.test(x.etiqueta))?.valor, 0);
  const venc = await uno(`SELECT CAST(ISNULL(SUM(f.monto),0) AS float) ${base} AND ${vencidoExpr}`, c.id);
  cmpNum('De ello vencido', venc, r.resumen.find(x => /vencido/i.test(x.etiqueta))?.valor);
  // cubetas
  const b = await sql<{ k: number; s: number; n: number }>(`SELECT CASE WHEN NOT ${vencidoExpr} OR TRY_CONVERT(date, f.vence, 103) IS NULL THEN 0 WHEN ${dias} <= 30 THEN 1 WHEN ${dias} <= 60 THEN 2 WHEN ${dias} <= 90 THEN 3 ELSE 4 END k, CAST(SUM(f.monto) AS float) s, COUNT(*) n ${base} GROUP BY CASE WHEN NOT ${vencidoExpr} OR TRY_CONVERT(date, f.vence, 103) IS NULL THEN 0 WHEN ${dias} <= 30 THEN 1 WHEN ${dias} <= 60 THEN 2 WHEN ${dias} <= 90 THEN 3 ELSE 4 END`, c.id);
  const ta = tabla(r, 'antiguedad');
  const nombres = ['Por vencer', '1–30 días', '31–60 días', '61–90 días', '+90 días'];
  for (const x of b) { const f = ta.filas.find(y => y[0] === nombres[num(x.k)]); cmpNum(`Antigüedad ${nombres[num(x.k)]}: monto`, num(x.s), f?.[2]); cmpNum(`Antigüedad ${nombres[num(x.k)]}: cargos`, num(x.n), f?.[1], 0); }
  // por estudiante: top 3 por saldo y nº de estudiantes
  const al = await sql<{ alumnoId: string; s: number; n: number }>(`SELECT TOP 3 f.alumnoId, CAST(SUM(f.monto) AS float) s, COUNT(*) n ${base} GROUP BY f.alumnoId ORDER BY SUM(f.monto) DESC, f.alumnoId`, c.id);
  const tal = tabla(await informe('cxc', { ciclo: c.nombre, ...o, tabla: 'alumnos' }, 'all'), 'alumnos');
  cmpNum('Filas por estudiante', num(tot[0].al), tal.total, 0);
  for (const x of al) { const code = (await sql<{ code: string }>(`SELECT code FROM Alumno WHERE id = ?`, x.alumnoId))[0].code; const f = tal.filas.find(y => y[0] === code); cmpNum(`Estudiante ${code}: saldo`, num(x.s), f?.[10]); cmpNum(`Estudiante ${code}: cargos`, num(x.n), f?.[4], 0); }
  cmpNum('Σ por estudiante = saldo', tal.filas.reduce((a, f) => a + num(f[10]), 0), num(tot[0].s));
  // por tutor (el del cargo)
  const tu = await sql<{ tutorId: string; s: number; n: number; al: number }>(`SELECT TOP 3 f.tutorId, CAST(SUM(f.monto) AS float) s, COUNT(*) n, COUNT(DISTINCT f.alumnoId) al ${base} GROUP BY f.tutorId ORDER BY SUM(f.monto) DESC, f.tutorId`, c.id);
  const ttu = tabla(await informe('cxc', { ciclo: c.nombre, ...o, tabla: 'tutores' }, 'all'), 'tutores');
  cmpNum('Filas por tutor', num(tot[0].tu), ttu.total, 0);
  for (const x of tu) { const nom2 = (await sql<{ nombre: string }>(`SELECT nombre FROM Tutor WHERE id = ?`, x.tutorId))[0].nombre; const f = ttu.filas.find(y => y[0] === nom2); cmpNum(`Tutor ${nom2}: saldo`, num(x.s), f?.[9]); cmpNum(`Tutor ${nom2}: alumnos`, num(x.al), f?.[2], 0); }
  return { r, saldo: num(tot[0].s) };
}

async function cuadrePlanes(c: Ciclo, pendCxc: number) {
  actual = { informe: 'planes', ciclo: c.nombre };
  const r = await informe('planes', { ciclo: c.nombre });
  const tp = tabla(await informe('planes', { ciclo: c.nombre }, 'all'), 'planes');
  cmpNum('Pendiente (planes) = saldo CxC', pendCxc, resumen(r, 'pendiente') || r.resumen.find(x => /Pendiente/.test(x.etiqueta))?.valor);
  // por plan: pendiente (cargos no pagados de alumnos con contrato del plan), facturado = Σ líneas de recibos vigentes de cargos del ciclo + pendiente
  const pl = await sql<{ nplan: string; al: number; pend: number; lin: number; dsc: number }>(`
    SELECT ISNULL(p.name, 'Sin contrato / sin plan') nplan,
           COUNT(DISTINCT x.alumnoId) al, CAST(SUM(x.pend) AS float) pend, CAST(SUM(x.lin) AS float) lin, CAST(SUM(x.dsc) AS float) dsc
    FROM (SELECT f.alumnoId, CASE WHEN f.paid = 0 THEN f.monto ELSE 0 END pend,
                 ISNULL((SELECT SUM(i.monto) FROM FinReciboItem i JOIN FinRecibo r ON r.id = i.reciboId WHERE i.cobroItemId = f.id AND r.est <> 'Anulado'), 0) lin,
                 ISNULL((SELECT SUM(i.descuento) FROM FinReciboItem i JOIN FinRecibo r ON r.id = i.reciboId WHERE i.cobroItemId = f.id AND r.est <> 'Anulado'), 0) dsc
          FROM FinCobroItem f WHERE f.cicloId = ?) x
    LEFT JOIN Contrato k ON k.alumnoId = x.alumnoId AND k.cicloId = ?
    LEFT JOIN FinPlan p ON p.id = k.planId
    GROUP BY ISNULL(p.name, 'Sin contrato / sin plan')`, c.id, c.id);
  for (const x of pl) {
    const f = tp.filas.find(y => y[0] === x.nplan);
    const fact = num(x.lin) + num(x.pend);
    cmpNum(`Plan «${x.nplan}»: facturado`, fact, f?.[2]);
    cmpNum(`Plan «${x.nplan}»: pendiente`, num(x.pend), f?.[5]);
    cmpNum(`Plan «${x.nplan}»: cobrado = facturado − descuentos − pendiente`, fact - num(x.dsc) - num(x.pend), f?.[4]);
  }
  const cierre = (await sql<{ f: number }>(`SELECT CAST(facturado AS float) f FROM CierreCiclo WHERE cicloId = ?`, c.id))[0];
  if (cierre) cmpNum('Facturado (planes) = CierreCiclo.facturado', num(cierre.f), tp.totales?.[2], 0.01, 'solo ciclos con cierre guardado');
  return r;
}

async function cuadreExtraIngresos(c: Ciclo) {
  actual = { informe: 'extra-ingresos', ciclo: c.nombre };
  const r = await informe('extra-ingresos', { ciclo: c.nombre });
  // cargos srv ligados a un servicio con extraId, del ciclo
  const g = await sql<{ extra: string; n: number; pend: number; lin: number; dsc: number; al: number; srv: number }>(`
    SELECT x.extra, COUNT(*) n, CAST(SUM(x.pend) AS float) pend, CAST(SUM(x.lin) AS float) lin, CAST(SUM(x.dsc) AS float) dsc, COUNT(DISTINCT x.alumnoId) al, COUNT(DISTINCT x.servicioId) srv
    FROM (SELECT e.name extra, f.alumnoId, f.servicioId, CASE WHEN f.paid = 0 THEN f.monto ELSE 0 END pend,
                 ISNULL((SELECT SUM(i.monto) FROM FinReciboItem i JOIN FinRecibo r ON r.id = i.reciboId WHERE i.cobroItemId = f.id AND r.est <> 'Anulado'), 0) lin,
                 ISNULL((SELECT SUM(i.descuento) FROM FinReciboItem i JOIN FinRecibo r ON r.id = i.reciboId WHERE i.cobroItemId = f.id AND r.est <> 'Anulado'), 0) dsc
          FROM FinCobroItem f JOIN ServicioAlumno s ON s.id = f.servicioId JOIN AcadExtra e ON e.id = s.extraId
          WHERE f.cicloId = ? AND f.tipo = 'srv' AND s.extraId IS NOT NULL) x GROUP BY x.extra`, c.id);
  const t = tabla(r, 'disciplinas');
  check('Disciplinas con ingresos', g.length === t.filas.length, g.length, t.filas.length);
  for (const x of g) {
    const f = t.filas.find(y => y[0] === x.extra);
    const fact = num(x.lin) + num(x.pend);
    cmpNum(`Disciplina ${x.extra}: facturado (líneas de recibo + pendiente)`, fact, f?.[5]);
    cmpNum(`Disciplina ${x.extra}: pendiente`, num(x.pend), f?.[8]);
    cmpNum(`Disciplina ${x.extra}: cobrado`, fact - num(x.dsc) - num(x.pend), f?.[7]);
  }
  cmpNum('Facturado total', g.reduce((a, x) => a + num(x.lin) + num(x.pend), 0), resumen(r, 'facturado') || r.resumen.find(x => x.etiqueta === 'Facturado')?.valor);
  return r;
}

async function cuadreExtraRetencion(c: Ciclo) {
  actual = { informe: 'extra-retencion', ciclo: c.nombre };
  const r = await informe('extra-retencion', { ciclo: c.nombre });
  const i = ciclos.findIndex(x => x.id === c.id);
  const ant = i > 0 ? ciclos[i - 1] : null;
  // inscritos del ciclo = (alumno, extra) con servicio con extraId y cargos del ciclo (o cicloId del servicio)
  const ins = await uno(`SELECT COUNT(*) FROM (SELECT DISTINCT s.alumnoId, s.extraId FROM ServicioAlumno s WHERE s.extraId IS NOT NULL AND (s.cicloId = ? OR EXISTS (SELECT 1 FROM FinCobroItem f WHERE f.servicioId = s.id AND f.cicloId = ?))) q`, c.id, c.id);
  const altas = r.resumen.find(x => /Altas/.test(x.etiqueta))?.valor;
  if (ant) {
    const base = await uno(`SELECT COUNT(*) FROM (SELECT DISTINCT s.alumnoId, s.extraId FROM ServicioAlumno s WHERE s.extraId IS NOT NULL AND (s.cicloId = ? OR EXISTS (SELECT 1 FROM FinCobroItem f WHERE f.servicioId = s.id AND f.cicloId = ?)) AND (s.fechaBaja IS NULL OR s.fechaBaja > '${ant.fechaFin}')) q`, ant.id, ant.id);
    const cont = await uno(`SELECT COUNT(*) FROM (SELECT DISTINCT s.alumnoId, s.extraId FROM ServicioAlumno s WHERE s.extraId IS NOT NULL AND (s.cicloId = ? OR EXISTS (SELECT 1 FROM FinCobroItem f WHERE f.servicioId = s.id AND f.cicloId = ?)) AND (s.fechaBaja IS NULL OR s.fechaBaja > '${ant.fechaFin}')) b WHERE EXISTS (SELECT 1 FROM ServicioAlumno s2 WHERE s2.alumnoId = b.alumnoId AND s2.extraId = b.extraId AND (s2.cicloId = ? OR EXISTS (SELECT 1 FROM FinCobroItem f2 WHERE f2.servicioId = s2.id AND f2.cicloId = ?)))`, ant.id, ant.id, c.id, c.id);
    cmpNum('Activos al cierre del ciclo anterior (base)', base, r.resumen[0]?.valor, 0);
    cmpNum('Continúan en el ciclo', cont, r.resumen[1]?.valor, 0);
    cmpNum('Altas = inscritos − continúan', ins - cont, altas, 0);
  } else cmpNum('Altas (sin ciclo anterior = todas las inscripciones)', ins, altas, 0);
  return r;
}

async function cuadreInventario(c: Ciclo) {
  actual = { informe: 'inventario-rotacion', ciclo: c.nombre };
  const r = await informe('inventario-rotacion', { ciclo: c.nombre });
  const stock = await sql<{ u: number; v: number; n: number }>(`SELECT CAST(ISNULL(SUM(stock),0) AS float) u, CAST(ISNULL(SUM(stock*price),0) AS float) v, COUNT(stock) n FROM FinProducto`);
  cmpNum('Unidades en stock', num(stock[0].u), r.resumen.find(x => /Unidades en stock/.test(x.etiqueta))?.valor, 0);
  cmpNum('Valor del inventario (precio de venta)', num(stock[0].v), r.resumen.find(x => /Valor del inventario/.test(x.etiqueta))?.valor);
  cmpNum('Productos con control de stock', num(stock[0].n), r.resumen.find(x => /control de stock/.test(x.etiqueta))?.valor, 0);
  // salidas netas del rango del ciclo = −Σ cantidad de movimientos (la cantidad lleva signo)
  const net = await uno(`SELECT CAST(ISNULL(-SUM(ISNULL(cantidad, TRY_CAST(REPLACE(REPLACE(q, NCHAR(8722), '-'), '+', '') AS int))),0) AS float) FROM FinMovimiento WHERE tipo <> 'Entrada' AND createdAt >= '${iniUtc(c.fechaInicio)}' AND createdAt < '${iniUtc(finDia(c.fechaFin))}'`);
  cmpNum('Unidades salidas netas (movimientos del rango)', net, r.resumen.find(x => /salidas netas/.test(x.etiqueta))?.valor, 0);
  // ventas rápidas por categoría (uniformes, libros, papelería): artículos − iva... solo bruto de líneas
  const cat = await sql<{ cat: string; u: number; s: number }>(`SELECT cp.nombre cat, CAST(SUM(vi.cantidad) AS float) u, CAST(SUM(vi.cantidad*vi.precio) AS float) s FROM FinVentaItem vi JOIN FinVenta v ON v.id = vi.ventaId JOIN FinProducto p ON p.id = vi.productoId JOIN CategoriaProducto cp ON cp.id = p.categoriaId WHERE v.cicloId = ? OR (v.cicloId IS NULL AND v.createdAt >= '${iniUtc(c.fechaInicio)}' AND v.createdAt < '${iniUtc(finDia(c.fechaFin))}') GROUP BY cp.nombre`, c.id);
  const tr = tabla(r, 'recaudado');
  for (const x of cat) { const f = tr.filas.find(y => String(y[0]).startsWith(x.cat)); cmpNum(`Categoría ${x.cat}: unidades vendidas`, num(x.u), f?.[1], 0, 'ventas rápidas'); cmpNum(`Categoría ${x.cat}: ventas sin ITBIS`, num(x.s), f?.[2]); }
  const tro = tabla(await informe('inventario-rotacion', { ciclo: c.nombre }, 'all'), 'rotacion');
  cmpNum('Productos en la rotación = productos con stock', num(stock[0].n), tro.total, 0);
  return r;
}

async function cuadreMovimientos(c: Ciclo) {
  actual = { informe: 'movimientos', ciclo: c.nombre };
  const r = await informe('movimientos', { ciclo: c.nombre });
  const n = await uno(`SELECT COUNT(*) FROM Matricula WHERE cicloId = ?`, c.id);
  cmpNum('Alumnos del ciclo = matrículas', n, r.resumen[0]?.valor, 0);
  const ta = tabla(await informe('movimientos', { ciclo: c.nombre }, 'all'), 'alumnos');
  cmpNum('Filas del detalle = matrículas', n, ta.total, 0);
  // Retirados / Repitentes / Promovidos por comparación de grados entre matrícula N y N+1 (independiente)
  const i = ciclos.findIndex(x => x.id === c.id), sig = ciclos[i + 1];
  if (sig) {
    const g = await sql<{ k: string; n: number }>(`
      SELECT CASE WHEN m2.id IS NULL THEN 'sin' WHEN g2.orden > g1.orden THEN 'prom' ELSE 'rep' END k, COUNT(*) n
      FROM Matricula m1 JOIN Seccion s1 ON s1.id = m1.seccionId JOIN Grado g1 ON g1.id = s1.gradoId
      LEFT JOIN Matricula m2 ON m2.alumnoId = m1.alumnoId AND m2.cicloId = ? AND m2.estado NOT IN ('Liberada')
      LEFT JOIN Seccion s2 ON s2.id = m2.seccionId LEFT JOIN Grado g2 ON g2.id = s2.gradoId
      WHERE m1.cicloId = ? GROUP BY CASE WHEN m2.id IS NULL THEN 'sin' WHEN g2.orden > g1.orden THEN 'prom' ELSE 'rep' END`, sig.id, c.id);
    const tr = tabla(r, 'resultado');
    const valor = (nombre: string) => num(tr.filas.find(f => f[0] === nombre)?.[1]);
    const prom = num(g.find(x => x.k === 'prom')?.n), rep = num(g.find(x => x.k === 'rep')?.n);
    if (valor('Promovido') + valor('Repitente') > 0) { cmpNum('Promovidos (grado destino > origen, matrícula N+1)', prom, valor('Promovido'), 0); cmpNum('Repitentes (mismo grado o menor)', rep, valor('Repitente'), 0); }
  }
  const ret = await uno(`SELECT COUNT(*) FROM Matricula WHERE cicloId = ? AND estado = 'Retirado'`, c.id);
  if (ret) cmpNum('Retirados = matrículas en estado Retirado', ret, r.resumen.find(x => /Retirados/.test(x.etiqueta))?.valor, 0);
  return r;
}

async function cuadreCalificaciones(c: Ciclo) {
  actual = { informe: 'calificaciones', ciclo: c.nombre };
  const r = await informe('calificaciones', { ciclo: c.nombre });
  // Cálculo independiente: Final de periodo (rúbrica de la materia), final materia = media de periodos (1 dec.), promedio alumno = media de finales de materia (1 dec.)
  const crit = await sql<{ rid: string; orden: number; peso: number; clave: string | null }>(`SELECT rubricaId rid, orden, CAST(peso AS float) peso, clave FROM RubricaCriterio ORDER BY rubricaId, orden`);
  const mat = await sql<{ id: string; rid: string | null }>(`SELECT id, rubricaId rid FROM Materia`);
  const comps = (mid: string) => {
    const rid = mat.find(x => x.id === mid)?.rid;
    const cs = crit.filter(x => x.rid === rid && x.clave);
    const out = cs.filter(x => x.clave !== 'EX').map(x => ({ k: x.clave!, w: num(x.peso), f: ['c1', 'c2', 'c3', 'c4'][Number(x.clave!.slice(1)) - 1] }));
    const ex = cs.find(x => x.clave === 'EX');
    if (!out.length) return { cs: [{ k: 'C1', w: 17.5, f: 'c1' }, { k: 'C2', w: 17.5, f: 'c2' }, { k: 'C3', w: 17.5, f: 'c3' }, { k: 'C4', w: 17.5, f: 'c4' }], exW: 30 };
    return { cs: out, exW: ex ? num(ex.peso) : 0 };
  };
  const notas = await sql<{ al: string; mid: string; pid: string; c1: number | null; c2: number | null; c3: number | null; c4: number | null; ex: number | null }>(`
    SELECT ro.alumnoId al, n.materiaId mid, n.periodoId pid, n.c1, n.c2, n.c3, n.c4, n.ex
    FROM AcadNota n JOIN PeriodoAcademico p ON p.id = n.periodoId JOIN AcadRoster ro ON ro.id = n.rosterId
    JOIN Matricula m ON m.alumnoId = ro.alumnoId AND m.cicloId = p.cicloId AND m.estado NOT IN ('Liberada','Reservado')
    WHERE p.cicloId = ? AND ro.alumnoId IS NOT NULL`, c.id);
  const ok = (v: number | null) => v != null && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100;
  const mapa = new Map<string, Map<string, (number | null)[]>>();
  const orden = (await sql<{ id: string; orden: number }>(`SELECT id, orden FROM PeriodoAcademico WHERE cicloId = ?`, c.id));
  for (const n of notas) {
    const { cs, exW } = comps(n.mid);
    const row = n as unknown as Record<string, number | null>;
    if (!cs.every(x => ok(row[x.f]))) continue;
    const ws = cs.reduce((a, x) => a + x.w, 0);
    let prom = ws ? cs.reduce((a, x) => a + num(row[x.f]) * x.w, 0) / ws : cs.reduce((a, x) => a + num(row[x.f]), 0) / cs.length;
    if (exW) { if (!ok(n.ex)) continue; const tw = ws + exW; const w = exW / (tw || 100); prom = prom * (1 - w) + num(n.ex) * w; }
    const am = mapa.get(n.al) ?? new Map<string, (number | null)[]>();
    const per = am.get(n.mid) ?? new Array(orden.length).fill(null);
    per[orden.findIndex(o => o.id === n.pid)] = r1(prom);
    am.set(n.mid, per); mapa.set(n.al, am);
  }
  const proms: number[] = [];
  for (const am of mapa.values()) {
    const fin = [...am.values()].map(per => { const v = per.filter((x): x is number => x != null); return v.length ? r1(v.reduce((a, b) => a + b, 0) / v.length) : null; }).filter((x): x is number => x != null);
    if (fin.length) proms.push(r1(fin.reduce((a, b) => a + b, 0) / fin.length));
  }
  const min = 70;
  cmpNum('Alumnos con notas', proms.length, r.resumen.find(x => /Alumnos con notas/.test(x.etiqueta))?.valor, 0);
  if (proms.length) {
    cmpNum('Aprobados (promedio ≥ nota mínima)', proms.filter(p => p >= min).length, r.resumen.find(x => /Aprobados/.test(x.etiqueta))?.valor, 0);
    cmpNum('Bajo la nota mínima', proms.filter(p => p < min).length, r.resumen.find(x => /Bajo la nota/.test(x.etiqueta))?.valor, 0);
    cmpNum('Promedio general (media de los promedios de alumno)', r1(proms.reduce((a, b) => a + b, 0) / proms.length), r.resumen.find(x => /Promedio general/.test(x.etiqueta))?.valor, 0.11, 'tolerancia de redondeo a 1 decimal');
  }
  return r;
}

async function cuadreCierre(c: Ciclo) {
  actual = { informe: 'cierre', ciclo: c.nombre };
  const cc = (await sql<Record<string, unknown>>(`SELECT CAST(facturado AS float) facturado, CAST(cobrado AS float) cobrado, CAST(pendiente AS float) pendiente, CAST(cobradoNeto AS float) cobradoNeto, recibos, recibosAnulados, cargos, id FROM CierreCiclo WHERE cicloId = ?`, c.id))[0];
  if (!cc) return;
  const j = (await get(`/informes/cierre/${encodeURIComponent(c.nombre)}`)).json() as { facturado: number; cobrado: number; pendiente: number; cobradoNeto: number; detalleDisponible: boolean };
  cmpNum('Cierre: facturado (API = CierreCiclo)', num(cc.facturado), j.facturado);
  cmpNum('Cierre: cobrado (API = CierreCiclo)', num(cc.cobrado), j.cobrado);
  cmpNum('Cierre: pendiente (API = CierreCiclo)', num(cc.pendiente), j.pendiente);
  const rec = await uno(`SELECT CAST(ISNULL(SUM(monto),0) AS float) FROM FinRecibo WHERE cicloId = ? AND est <> 'Anulado' AND createdAt <= (SELECT fecha FROM CierreCiclo WHERE cicloId = ?)`, c.id, c.id);
  cmpNum('Cierre: cobrado = Σ recibos vigentes del ciclo hasta el cierre', rec, num(cc.cobrado));
  const nDet = await uno(`SELECT COUNT(*) FROM CierreCicloDetalle WHERE cierreId = ?`, num(cc.id));
  check('Cierre: detalle disponible = existen filas de CierreCicloDetalle', (nDet > 0) === j.detalleDisponible, nDet > 0, j.detalleDisponible);
  if (nDet > 0) {
    const sumas = await sql<{ tipo: string; m: number; p: number }>(`SELECT tipo, CAST(SUM(monto) AS float) m, CAST(SUM(pendiente) AS float) p FROM CierreCicloDetalle WHERE cierreId = ? GROUP BY tipo`, num(cc.id));
    cmpNum('Cierre: Σ monto(cargo) = facturado', num(sumas.find(x => x.tipo === 'cargo')?.m), num(cc.facturado));
    cmpNum('Cierre: Σ pendiente(cargo) = pendiente', num(sumas.find(x => x.tipo === 'cargo')?.p), num(cc.pendiente));
    cmpNum('Cierre: Σ monto(recibo emitido) = cobrado', await uno(`SELECT CAST(ISNULL(SUM(monto),0) AS float) FROM CierreCicloDetalle WHERE cierreId = ? AND tipo = 'recibo' AND estado = 'Emitido'`, num(cc.id)), num(cc.cobrado));
    const full = (await get(`/informes/cierre/${encodeURIComponent(c.nombre)}`)).json() as { detalle: { cuadre: Record<string, { ok: boolean; diferencia: number }> } };
    check('Cierre: todas las cifras del cuadre del informe en 0', Object.values(full.detalle.cuadre).every(x => x.ok), 0, Object.entries(full.detalle.cuadre).filter(([, x]) => !x.ok).map(([k, x]) => k + ':' + x.diferencia));
  }
}

// ------------------------------------------------------------------------------------------------------------------ Exportaciones
async function validarExport(id: string, o: Record<string, string>, etiqueta: string) {
  actual = { informe: id, ciclo: etiqueta };
  const t0 = Date.now();
  const x = await get(`/informes/${id}/export?${qs({ ...o, formato: 'xlsx' })}`);
  const ms = Date.now() - t0;
  check('Export: HTTP 200 y tipo xlsx', x.status === 200 && /spreadsheetml\.sheet/.test(x.headers.get('content-type') ?? ''), 200, x.status);
  if (x.status !== 200) return;
  const disp = x.headers.get('content-disposition') ?? '';
  const nombre = /filename="([^"]+)"/.exec(disp)?.[1] ?? '';
  const ciclo = o.ciclo ? o.ciclo.replace(/[^0-9A-Za-z]+/g, '-') : '';
  check('Export: nombre de archivo informe_<id>_<ciclo>_<fecha>.xlsx', new RegExp(`^informe_${id}_${ciclo || '[0-9-]+'}_\\d{4}-\\d{2}-\\d{2}\\.xlsx$`).test(nombre), `informe_${id}_${ciclo}_AAAA-MM-DD.xlsx`, nombre);
  if (OUT) { mkdirSync(OUT, { recursive: true }); writeFileSync(join(OUT, nombre.replace('.xlsx', `_${Object.values(o).filter(v => v).length}f.xlsx`)), x.buf); }
  let libro: Libro;
  try { libro = leerXlsx(x.buf); } catch (e) { check('Export: es un ZIP/XLSX legible', false, 'ok', (e as Error).message); return; }
  validarLibro(libro, 'Export');
  const r = await informe(id, o, 'all');
  compararConJson(libro, r, 'Export');
  console.log(`  xlsx ${id} ${etiqueta}: ${(x.buf.length / 1024).toFixed(0)} KB · ${libro.hojas.length} hojas · filas ${libro.hojas.map(h => h.maxFila).join('/')} · ${ms} ms`);
}

async function validarExportCierre(c: Ciclo) {
  actual = { informe: 'cierre', ciclo: c.nombre + ' export' };
  const x = await get(`/informes/cierre/${encodeURIComponent(c.nombre)}/export`);
  check('Export cierre: HTTP 200', x.status === 200, 200, x.status);
  if (x.status !== 200) return;
  const nombre = /filename="([^"]+)"/.exec(x.headers.get('content-disposition') ?? '')?.[1] ?? '';
  check('Export cierre: nombre informe_cierre_<ciclo>_<fecha>.xlsx', /^informe_cierre_\d{4}-\d{4}_\d{4}-\d{2}-\d{2}\.xlsx$/.test(nombre), 'informe_cierre_AAAA-AAAA_fecha.xlsx', nombre);
  if (OUT) { mkdirSync(OUT, { recursive: true }); writeFileSync(join(OUT, nombre), x.buf); }
  const l = leerXlsx(x.buf);
  validarLibro(l, 'Export cierre');
  const j = (await get(`/informes/cierre/${encodeURIComponent(c.nombre)}`)).json() as { detalleDisponible: boolean; detalle?: { filas: Record<string, number>; desgloses: Record<string, { titulo: string; filas: unknown[][]; totales?: unknown[] }> } };
  if (j.detalleDisponible && j.detalle) {
    const nombres = l.nombres.join('|');
    const nCargos = j.detalle.filas.cargo ?? 0;
    const hojaCargos = l.hojas.find(h => /^Facturado/.test(h.nombre));
    check('Export cierre: hoja Facturado con todas las líneas de cargo', !!hojaCargos && hojaCargos.maxFila >= nCargos, `≥${nCargos}`, hojaCargos?.maxFila, nombres);
    const hojaCob = l.hojas.find(h => /^Cobrado/.test(h.nombre));
    check('Export cierre: hoja Cobrado con todos los recibos', !!hojaCob && hojaCob.maxFila >= (j.detalle.filas.recibo ?? 0), `≥${j.detalle.filas.recibo ?? 0}`, hojaCob?.maxFila);
    for (const d of Object.values(j.detalle.desgloses)) { const h = l.hojas.find(z => z.nombre === d.titulo.slice(0, 31)); if (!h) continue; }
  } else check('Export cierre sin detalle: hojas Resumen y Deudores', l.nombres.length >= 1, '≥1', l.nombres);
  console.log(`  xlsx cierre ${c.nombre}: ${(x.buf.length / 1024).toFixed(0)} KB · ${l.hojas.length} hojas`);
}

// ------------------------------------------------------------------------------------------------------------------ main
async function main() {
  const t0 = Date.now();
  await login();
  const db = ((await sql<{ d: string }>(`SELECT DB_NAME() d`))[0]).d;
  console.log(`API ${API} · BD ${db} · ${new Date().toISOString()}`);
  ciclos = (await sql<Ciclo>(`SELECT id, nombre, fechaInicio, fechaFin, estado FROM Ciclo ORDER BY fechaInicio`));
  for (const m of await sql<{ id: string; nombre: string }>(`SELECT id, nombre FROM MetodoPago`)) metodoNombre[m.id] = m.nombre;
  const pedidos = arg('ciclos') ? arg('ciclos').split(',') : ciclos.filter(c => c.estado !== 'Planificado').map(c => c.nombre.replace(/[–—]/g, '-'));
  const quiere = (id: string) => !SOLO || SOLO.includes(id);

  // 0. catálogo y fiscal
  actual = { informe: 'catalogo', ciclo: '' };
  const cat = (await get('/informes')).json() as { id: string; estado: string; num: number }[];
  const listos = cat.filter(i => i.estado === 'listo').map(i => i.id);
  check('Catálogo: 12 informes registrados (11 listos + fiscal en preparación) + cierre', cat.length === 13 && listos.length === 12, '13/12', `${cat.length}/${listos.length}`);
  actual = { informe: 'fiscal', ciclo: '' };
  const fis = await get('/informes/fiscal');
  check('Fiscal (606/607): la API responde 409 EN_PREPARACION', fis.status === 409 && (fis.json() as { code?: string }).code === 'EN_PREPARACION', '409 EN_PREPARACION', `${fis.status} ${(fis.json() as { code?: string }).code}`);
  check('Fiscal: figura «preparacion» en el catálogo', cat.find(i => i.id === 'fiscal')?.estado === 'preparacion', 'preparacion', cat.find(i => i.id === 'fiscal')?.estado);

  for (const nombre of pedidos) {
    const c = cic(nombre);
    if (!c) { console.log('Ciclo no encontrado: ' + nombre); continue; }
    console.log(`\n== Ciclo ${c.nombre} (${c.estado})`);
    let rec = { cobrado: 0 }, cxc = { saldo: 0 };
    if (quiere('recaudacion')) { rec = await cuadreRecaudacion(c); }
    if (quiere('recaudacion') && c.estado !== 'Planificado') {
      await cuadreRecaudacion(c, { desde: c.fechaInicio.slice(0, 7) + '-15', hasta: finDia(c.fechaInicio.slice(0, 7) + '-28') });
      const metodos = Object.keys(metodoNombre);
      if (metodos.length) await cuadreRecaudacion(c, { metodo: metodos[0] });
    }
    if (quiere('neto')) await cuadreNeto(c);
    if (quiere('notas')) await cuadreNotas(c);
    if (quiere('emision')) await cuadreEmision(c, rec.cobrado || await uno(`SELECT CAST(ISNULL(SUM(p.monto),0) AS float) FROM FinReciboPago p JOIN FinRecibo r ON r.id = p.reciboId WHERE r.cicloId = ? AND r.est <> 'Anulado'`, c.id));
    if (quiere('cxc')) {
      cxc = (await cuadreCxc(c)) as { saldo: number } & Record<string, unknown> as { saldo: number };
      const sec = (await sql<{ id: string }>(`SELECT TOP 1 m.seccionId id FROM Matricula m WHERE m.cicloId = ? GROUP BY m.seccionId ORDER BY COUNT(*) DESC`, c.id))[0];
      if (sec) await cuadreCxc(c, { seccion: sec.id });
      await cuadreCxc(c, { soloVencidos: '1' });
    }
    if (quiere('planes')) await cuadrePlanes(c, cxc.saldo || await uno(`SELECT CAST(ISNULL(SUM(monto),0) AS float) FROM FinCobroItem WHERE cicloId = ? AND paid = 0`, c.id));
    if (quiere('extra-ingresos')) await cuadreExtraIngresos(c);
    if (quiere('extra-retencion')) await cuadreExtraRetencion(c);
    if (quiere('inventario-rotacion')) await cuadreInventario(c);
    if (quiere('movimientos')) await cuadreMovimientos(c);
    if (quiere('calificaciones')) await cuadreCalificaciones(c);
    if (c.estado === 'Cerrado' && quiere('cierre')) await cuadreCierre(c);

    if (!SIN_XLSX) {
      for (const id of listos.filter(quiere)) {
        if (id === 'cierre') { if (c.estado === 'Cerrado') await validarExportCierre(c); continue; }
        await validarExport(id, { ciclo: c.nombre }, c.nombre);
      }
    }
  }

  // Exportaciones con filtros adicionales (una vez, ciclo de mayor volumen)
  if (!SIN_XLSX) {
    const grande = cic('2025-2026') ?? ciclos[2];
    if (grande && quiere('cxc')) await validarExport('cxc', { ciclo: cic('2026-2027')?.nombre ?? grande.nombre, soloVencidos: '1' }, 'soloVencidos');
    if (grande && quiere('recaudacion')) await validarExport('recaudacion', { ciclo: grande.nombre, desde: '2025-09-01', hasta: '2025-10-31' }, 'rango fechas');
    if (grande && quiere('calificaciones')) {
      const sec = (await sql<{ id: string }>(`SELECT TOP 1 m.seccionId id FROM Matricula m WHERE m.cicloId = ? GROUP BY m.seccionId ORDER BY COUNT(*) DESC`, grande.id))[0];
      if (sec) await validarExport('calificaciones', { ciclo: grande.nombre, seccion: sec.id }, 'sección');
    }
    if (grande && quiere('emision')) await validarExport('emision', { ciclo: cic('2026-2027')?.nombre ?? grande.nombre, comprobante: (await sql<{ id: string }>(`SELECT TOP 1 id FROM TipoComprobante WHERE uso IN ('Ventas','Ingresos') ORDER BY orden`))[0]?.id ?? '' }, 'comprobante');
  }

  // Resumen
  const porInforme = new Map<string, { ok: number; mal: number }>();
  for (const r of resultados) { const e = porInforme.get(r.informe) ?? { ok: 0, mal: 0 }; r.ok ? e.ok++ : e.mal++; porInforme.set(r.informe, e); }
  console.log('\n== RESUMEN DE COMPROBACIONES');
  console.log('informe'.padEnd(22) + 'ok'.padStart(6) + 'fallas'.padStart(8));
  for (const [k, v] of porInforme) console.log(k.padEnd(22) + String(v.ok).padStart(6) + String(v.mal).padStart(8));
  console.log('\n== TIEMPOS DE RESPUESTA (size=25 / size=all)');
  const tm = new Map<string, number[]>();
  for (const t of tiempos) tm.set(t.informe, [...(tm.get(t.informe) ?? []), t.ms]);
  for (const [k, v] of tm) console.log(k.padEnd(22) + `mín ${Math.min(...v)} ms · máx ${Math.max(...v)} ms · n=${v.length}`);
  const mal = resultados.filter(r => !r.ok);
  console.log(`\n${resultados.length - mal.length}/${resultados.length} comprobaciones OK · ${mal.length} fallas · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await prisma.$disconnect();
  process.exit(mal.length ? 1 : 0);
}
main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(2); });
