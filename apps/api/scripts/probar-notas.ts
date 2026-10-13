/**
 * Pruebas de integracion de las NOTAS DE CREDITO / DEBITO contra una API EN MARCHA y su base (SOLO bases de prueba: emite cobros y notas).
 *
 *   DATABASE_URL=<base temporal con el seed demo> API_URL=http://localhost:3025 pnpm --filter @stodia/api exec tsx scripts/probar-notas.ts
 *
 * Se niega a correr contra una base cuyo nombre no termine en «test» o «temp» (nunca contra `stodia`).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const API = process.env.API_URL ?? 'http://localhost:3025';
const URL_DB = process.env.DATABASE_URL ?? '';
if (!/(test|temp)/i.test(URL_DB.split('database=')[1] ?? URL_DB)) { console.error('Esta prueba EMITE cobros y notas: usa una base de prueba (nombre con «test» o «temp»). Abortado.'); process.exit(2); }
const prisma = new PrismaClient();
const PWD = process.env.SEED_PASSWORD ?? 'stodia123';
const PIN = process.env.SUPERVISOR_PIN ?? '1234';
const r2 = (n: number) => Math.round(n * 100) / 100;

interface Resp { status: number; body: any } // eslint-disable-line @typescript-eslint/no-explicit-any
async function http(method: string, path: string, token: string | null, body?: unknown, headers: Record<string, string> = {}): Promise<Resp> {
  const res = await fetch(API + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const txt = await res.text();
  let b: unknown = txt; try { b = JSON.parse(txt); } catch { /* texto */ }
  return { status: res.status, body: b };
}
const login = async (u: string) => (await http('POST', '/auth/login', null, { usuario: u, password: PWD })).body.token as string;
const sup = async (t: string, pin = PIN) => (await http('POST', '/auth/supervisor', t, { pin })).body.token as string;

const filas: { n: number; prueba: string; esperado: string; real: string; ok: boolean }[] = [];
let n = 0;
function check(prueba: string, esperado: unknown, real: unknown, ok?: boolean) {
  const e = typeof esperado === 'number' ? String(r2(esperado)) : String(esperado), a = typeof real === 'number' ? String(r2(real)) : String(real);
  filas.push({ n: ++n, prueba, esperado: e, real: a, ok: ok ?? e === a });
}
const num = (v: unknown) => Number(v ?? 0);
const uniq = () => 'k-' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);

const pendiente = async (extra = '') => num((await prisma.$queryRawUnsafe<{ s: unknown }[]>(`SELECT COALESCE(SUM(monto),0) AS s FROM FinCobroItem WHERE paid = 0 ${extra}`))[0].s);
const secActual = async (id: string) => num((await prisma.secuenciaFiscal.findUniqueOrThrow({ where: { id } })).actual);

let tutoresUsados = new Set<string>();
/** Cobra N cargos de un tutor distinto en cada llamada; devuelve el recibo. */
async function cobrar(tok: string, nCargos: number, opt: { metodo?: string; soloTipos?: string[] } = {}) {
  const ciclo = (await prisma.ciclo.findFirstOrThrow({ where: { estado: 'Activo' } })).id;
  const rows = await prisma.$queryRawUnsafe<{ ced: string; k: unknown }[]>(`SELECT t.cedula AS ced, COUNT(*) AS k FROM FinCobroItem c JOIN Tutor t ON t.id = c.tutorId WHERE c.paid = 0 AND c.cicloId = '${ciclo}' GROUP BY t.cedula HAVING COUNT(*) >= ${nCargos} ORDER BY t.cedula`);
  const ced = rows.map(r => r.ced).find(c => !tutoresUsados.has(c));
  if (!ced) throw new Error('No quedan tutores con cargos suficientes para la prueba');
  tutoresUsados.add(ced);
  const cuenta = (await http('GET', '/cobros/cuenta?q=' + ced, tok)).body;
  const items = (cuenta.items as { id: string; monto: number; tipo: string }[]).filter(i => !opt.soloTipos || opt.soloTipos.includes(i.tipo)).slice(0, nCargos);
  const rec = await http('POST', '/cobros/procesar', tok, { ids: items.map(i => i.id), discount: 'none', pays: [{ m: opt.metodo ?? 'Efectivo', a: '', r: opt.metodo && opt.metodo !== 'Efectivo' ? 'REF-TEST-1' : '' }], cedula: cuenta.cedula, tipoComprobante: 'CONSUMO' });
  if (rec.status !== 200) throw new Error('cobro fallido: ' + JSON.stringify(rec.body));
  return { recibo: rec.body as { id: string; ncf: string; monto: number; items: { con: string; monto: number; cobroItemId?: string }[]; tipoComprobante: { codigo: string; modalidad: string } }, items, cedula: ced as string };
}
const credito = (tok: string, body: Record<string, unknown>) => http('POST', '/cobros/notas/credito', tok, body);
async function creditoTotal(tok: string, reciboId: string, monto: number, extra: Record<string, unknown> = {}, pinTok?: string, key = uniq()) {
  return credito(tok, { reciboId, motivo: '01', total: true, reabrirCargos: true, reembolsos: [{ metodo: 'Efectivo', monto }], pin: pinTok ?? (await sup(tok)), idempotencyKey: key, ...extra });
}

async function main() {
  const SA = await login('usr_palmanzar'), CJ = await login('usr_arosario'), DOC = await login('usr_ralmonte'), DIR = await login('usr_cvidal'), COM = await login('usr_jtejada');
  const cicloAct = await prisma.ciclo.findFirstOrThrow({ where: { estado: 'Activo' } });
  for (const s of ['B02', 'B03', 'B04']) await prisma.secuenciaFiscal.update({ where: { id: `SF-DEMO-${s}-1` }, data: { hasta: 5000, estado: 'Activa' } }); // la demo trae B02 casi agotada: holgura para las pruebas
  await prisma.sisConfig.deleteMany({ where: { clave: 'finanzas' } }).catch(() => undefined);
  await prisma.sisConfig.create({ data: { clave: 'finanzas', valor: JSON.stringify({ matricula: 85000, inscripcion: 15000, itbis: 0.18, recargoMoraPct: 3, descuentoProntoPct: 5, diaCorte: 15 }) } });

  // ---------------------------------------------------------------- 1) NC TOTAL de un recibo de 2 cargos
  {
    const dash0 = (await http('GET', '/dashboard', SA)).body, turno0 = (await http('GET', '/cobros/turno', CJ)).body;
    const { recibo, items } = await cobrar(CJ, 2);
    const cxc0 = await pendiente(`AND cicloId = '${cicloAct.id}'`), b04_0 = await secActual('SF-DEMO-B04-1');
    const dashCobro = (await http('GET', '/dashboard', SA)).body;
    const disp = (await http('GET', `/cobros/recibos/${recibo.id}/notas-disponible`, CJ)).body;
    check('1 disponible antes: monto del recibo', recibo.monto, disp.disponible);
    const r = await creditoTotal(CJ, recibo.id, recibo.monto, { reembolsos: [{ metodo: 'Efectivo', monto: recibo.monto / 2 }, { metodo: 'Transferencia', monto: recibo.monto / 2, referencia: 'TRF-9001' }] });
    if (r.status !== 201) console.log('   NC total:', r.status, JSON.stringify(r.body));
    check('1 NC total: HTTP 201', 201, r.status);
    const nota = r.body;
    check('1 NC total: NCF B04 consecutivo', 'B04' + String(b04_0 + 1).padStart(8, '0'), nota.ncf);
    check('1 NC total: monto = recibo', recibo.monto, nota.monto);
    check('1 NC total: motivo 01 y documento anulado', '01|true', `${nota.motivo.codigo}|${nota.documentoAnulado}`);
    const rec = await prisma.finRecibo.findUniqueOrThrow({ where: { id: recibo.id } });
    check('1 recibo queda Anulado con nc = NCF de la nota', `Anulado|${nota.ncf}`, `${rec.est}|${rec.nc}`);
    const cxc1 = await pendiente(`AND cicloId = '${cicloAct.id}'`);
    check('1 CxC sube EXACTAMENTE el monto (cargos reabiertos)', cxc0 + recibo.monto, cxc1);
    const reab = await prisma.finCobroItem.findMany({ where: { id: { in: items.map(i => i.id) } } });
    check('1 los 2 cargos vuelven a pendiente con su ciclo original', `2|${cicloAct.id}`, `${reab.filter(c => !c.paid).length}|${reab[0].cicloId}`);
    check('1 reembolsos por método (2 filas, suman la nota)', `2|${recibo.monto}`, `${nota.reembolsos.length}|${r2(nota.reembolsos.reduce((a: number, x: { monto: number }) => a + x.monto, 0))}`);
    const turno1 = (await http('GET', '/cobros/turno', CJ)).body;
    check('1 cuadre: bruto sube por el recibo, devoluciones por la nota', `${r2(turno0.resumen.bruto + recibo.monto)}|${r2(turno0.resumen.devoluciones + recibo.monto)}`, `${turno1.resumen.bruto}|${turno1.resumen.devoluciones}`);
    check('1 cuadre: cobrado neto SIN CAMBIO (cobro y devolucion en el mismo turno)', turno0.resumen.netoActivo, turno1.resumen.netoActivo);
    check('1 cuadre: devolución por método Transferencia (delta)', recibo.monto / 2, (turno1.resumen.devolucionesPorMetodo?.Transferencia ?? 0) - (turno0.resumen.devolucionesPorMetodo?.Transferencia ?? 0));
    check('1 cuadre: la nota sale en la sección Notas del turno', true, (turno1.notas as { id: string }[]).some(x => x.id === nota.id));
    const dash1 = (await http('GET', '/dashboard', SA)).body;
    check('1 dashboard: el cobro suma al recaudo del mes', r2(dash0.recaudoEfectivo + dash0.recaudoBanco + recibo.monto), r2(dashCobro.recaudoEfectivo + dashCobro.recaudoBanco));
    check('1 dashboard: recaudo NETO (la nota compensa el recibo)', r2(dash0.recaudoEfectivo + dash0.recaudoBanco), r2(dash1.recaudoEfectivo + dash1.recaudoBanco));
    check('1 dashboard: la devolución por transferencia resta del recaudo banco', r2(dashCobro.recaudoBanco - recibo.monto / 2), r2(dash1.recaudoBanco));
    const dup = await creditoTotal(CJ, recibo.id, recibo.monto);
    check('1 segunda NC sobre un recibo anulado: 409', 409, dup.status);
    const lista = (await http('GET', '/cobros/recibos?q=' + recibo.id, CJ)).body;
    check('1 historial: el recibo muestra Anulado y acreditado', `Anulado|${recibo.monto}`, `${lista.rows[0].est}|${lista.rows[0].acreditado}`);
    check('1 GET nota por id = DTO de la emisión', nota.ncf, (await http('GET', '/cobros/notas/' + nota.id, CJ)).body.ncf);
  }

  // ---------------------------------------------------------------- 2) NC PARCIAL de una linea + acumulado
  let reciboP: { id: string; monto: number; items: { con: string; monto: number }[] };
  {
    const c = await cobrar(CJ, 2);
    reciboP = c.recibo;
    const disp = (await http('GET', `/cobros/recibos/${reciboP.id}/notas-disponible`, CJ)).body;
    const l0 = disp.lineas[0];
    const parcial = r2(l0.monto / 4);
    const k = uniq();
    const r = await credito(CJ, { reciboId: reciboP.id, motivo: '03', lineas: [{ id: l0.id, monto: parcial }], reembolsos: [{ metodo: 'Efectivo', monto: parcial }], pin: await sup(CJ), idempotencyKey: k });
    check('2 NC parcial (1/4 de una línea): 201', 201, r.status);
    check('2 NC parcial: efecto Ajuste, cargo SIGUE pagado', 'Ajuste|true', `${r.body.lineas[0].efecto}|${(await prisma.finCobroItem.findUniqueOrThrow({ where: { id: l0.cobroItemId } })).paid}`);
    const rec = await prisma.finRecibo.findUniqueOrThrow({ where: { id: reciboP.id } });
    check('2 recibo sigue Activo', 'Activo', rec.est);
    const d2 = (await http('GET', `/cobros/recibos/${reciboP.id}/notas-disponible`, CJ)).body;
    check('2 acreditado / disponible / neto', `${parcial}|${r2(reciboP.monto - parcial)}|${r2(reciboP.monto - parcial)}`, `${d2.acreditado}|${d2.disponible}|${d2.neto}`);
    // idempotencia: misma clave, otro PIN -> misma nota
    const again = await credito(CJ, { reciboId: reciboP.id, motivo: '03', lineas: [{ id: l0.id, monto: parcial }], reembolsos: [{ metodo: 'Efectivo', monto: parcial }], pin: 'svt_invalido', idempotencyKey: k });
    check('2 idempotencia: misma clave = misma nota (200)', `200|${r.body.id}`, `${again.status}|${again.body.id}`);
    check('2 idempotencia: UNA sola nota en la base', 1, await prisma.notaFiscal.count({ where: { idempotencyKey: k } }));
    // doble clic concurrente con la misma clave
    const k2 = uniq(), p1 = await sup(CJ), p2 = await sup(CJ);
    const [a, b] = await Promise.all([
      credito(CJ, { reciboId: reciboP.id, motivo: '03', lineas: [{ id: l0.id, monto: 100 }], reembolsos: [{ metodo: 'Efectivo', monto: 100 }], pin: p1, idempotencyKey: k2 }),
      credito(CJ, { reciboId: reciboP.id, motivo: '03', lineas: [{ id: l0.id, monto: 100 }], reembolsos: [{ metodo: 'Efectivo', monto: 100 }], pin: p2, idempotencyKey: k2 }),
    ]);
    check('2 doble clic concurrente: una sola nota creada', `1|true`, `${await prisma.notaFiscal.count({ where: { idempotencyKey: k2 } })}|${a.body.id === b.body.id}`);
    // exceder la linea
    const ex = await credito(CJ, { reciboId: reciboP.id, motivo: '03', lineas: [{ id: l0.id, monto: l0.monto }], reembolsos: [{ metodo: 'Efectivo', monto: l0.monto }], pin: await sup(CJ), idempotencyKey: uniq() });
    check('2 exceder lo restante de la línea: 400', 400, ex.status);
    // exceder el original en una sola nota
    const ex2 = await credito(CJ, { reciboId: reciboP.id, motivo: '03', lineas: [{ id: l0.id, monto: reciboP.monto * 2 }], reembolsos: [{ metodo: 'Efectivo', monto: reciboP.monto * 2 }], pin: await sup(CJ), idempotencyKey: uniq() });
    check('2 exceder el monto del recibo: 400', 400, ex2.status);
    // acumuladas: completar todo lo que queda de la linea 1 y luego pedir de nuevo la linea 0
    const d3 = (await http('GET', `/cobros/recibos/${reciboP.id}/notas-disponible`, CJ)).body;
    const resto = d3.lineas.map((l: { id: number; restante: number }) => ({ id: l.id, monto: l.restante }));
    const tot = r2(resto.reduce((a: number, l: { monto: number }) => a + l.monto, 0));
    const cierre = await credito(CJ, { reciboId: reciboP.id, motivo: '03', lineas: resto, reembolsos: [{ metodo: 'Efectivo', monto: tot }], pin: await sup(CJ), idempotencyKey: uniq() });
    check('2 NC que completa el recibo (acumulado = original): recibo Anulado', `201|Anulado`, `${cierre.status}|${(await prisma.finRecibo.findUniqueOrThrow({ where: { id: reciboP.id } })).est}`);
    const sobra = await credito(CJ, { reciboId: reciboP.id, motivo: '03', lineas: [{ id: l0.id, monto: 1 }], reembolsos: [{ metodo: 'Efectivo', monto: 1 }], pin: await sup(CJ), idempotencyKey: uniq() });
    check('2 dos NC acumuladas que superan el original: 409', 409, sobra.status);
    const sumaN = await prisma.notaFiscal.aggregate({ where: { reciboId: reciboP.id, clase: 'CREDITO' }, _sum: { monto: true } });
    check('2 suma de todas las NC del recibo = monto del recibo', reciboP.monto, sumaN._sum.monto ?? 0);
  }

  // ---------------------------------------------------------------- 3) kiosko: producto devuelto
  {
    const venta = await http('POST', '/kiosko/ventas', CJ, { items: [{ id: 'p4', q: 3 }, { id: 'p7', q: 2 }], doc: 'cf', rnc: '', razon: '', pay: 'Efectivo', recv: '100000' });
    check('3 venta kiosko creada', 200, venta.status);
    const vid = venta.body.id as string;
    const st0 = (await prisma.finProducto.findUniqueOrThrow({ where: { id: 'p4' } })).stock!;
    const d = (await http('GET', `/cobros/ventas/${vid}/notas-disponible`, CJ)).body;
    const l4 = d.lineas.find((l: { productoId: string }) => l.productoId === 'p4');
    check('3 disponible de la venta = total', venta.body.total, d.disponible);
    const sin = await credito(CJ, { ventaId: vid, motivo: 'OP01', lineas: [{ id: l4.id, cantidad: 4 }], reembolsos: [{ metodo: 'Efectivo', monto: 1 }], pin: await sup(CJ), idempotencyKey: uniq() });
    check('3 devolver más unidades de las vendidas: 400', 400, sin.status);
    const monto = r2(l4.precioUnit * 2);
    const r = await credito(CJ, { ventaId: vid, motivo: 'OP01', lineas: [{ id: l4.id, cantidad: 2 }], reembolsos: [{ metodo: 'Efectivo', monto }], pin: await sup(CJ), idempotencyKey: uniq() });
    check('3 NC de 2 unidades: 201 y monto = 2 × precio', `201|${monto}`, `${r.status}|${r.body.monto}`);
    const st1 = (await prisma.finProducto.findUniqueOrThrow({ where: { id: 'p4' } })).stock!;
    check('3 stock repuesto +2', st0 + 2, st1);
    const mov = await prisma.finMovimiento.findFirst({ where: { ref: r.body.id }, orderBy: { id: 'desc' } });
    check('3 FinMovimiento tipo Devolución +2 ligado a la venta', `Devolución|+2|${vid}`, `${mov?.tipo}|${mov?.q}|${mov?.ventaId}`);
    const r3 = await credito(CJ, { ventaId: vid, motivo: 'OP01', lineas: [{ id: l4.id, cantidad: 2 }], reembolsos: [{ metodo: 'Efectivo', monto: 1 }], pin: await sup(CJ), idempotencyKey: uniq() });
    check('3 devolver más de lo que queda (1 unidad): 400', 400, r3.status);
  }

  // ---------------------------------------------------------------- 4) permisos, PIN, plazo, secuencia
  {
    const { recibo } = await cobrar(CJ, 1);
    const body = (pin: string) => ({ reciboId: recibo.id, motivo: '01', total: true, reembolsos: [{ metodo: 'Efectivo', monto: recibo.monto }], pin, idempotencyKey: uniq() });
    check('4 sin PIN: 403', 403, (await credito(CJ, body(''))).status);
    check('4 PIN malo: 403', 403, (await credito(CJ, body('0000'))).status);
    check('4 Super Admin SIN PIN: 403 (siempre PIN)', 403, (await credito(SA, body(''))).status);
    check('4 Docente: 403', 403, (await credito(DOC, body(await sup(DOC)))).status);
    check('4 Director Académico: 403', 403, (await credito(DIR, body(await sup(DIR)))).status);
    check('4 Encargado de Comedor: 403', 403, (await credito(COM, body(await sup(COM)))).status);
    check('4 GET /cobros/notas Docente: 403', 403, (await http('GET', '/cobros/notas', DOC)).status);
    // token de un solo uso
    const t = await sup(CJ);
    const uno = await credito(CJ, { ...body(t), motivo: '03', total: false, lineas: [{ id: 0, monto: 1 }] }); // 400 por linea invalida: el token ya se pudo quemar
    void uno;
    // plazo vencido
    const viejo = await prisma.finRecibo.update({ where: { id: recibo.id }, data: { createdAt: new Date(Date.now() - 45 * 864e5) } });
    check('4 recibo de 45 días (plazo 30): sin motivo escrito → 400', 400, (await credito(CJ, { ...body(await sup(CJ)), motivo: '01' })).status);
    const fp = await credito(CJ, { ...body(await sup(CJ)), motivoTexto: 'Cliente pidió la anulación por duplicado' });
    check('4 recibo de 45 días con motivo + PIN: 201 y marcada fuera de plazo', '201|true', `${fp.status}|${fp.body.fueraDePlazo}`);
    void viejo;
    // sin secuencia
    const c2 = await cobrar(CJ, 1);
    await prisma.secuenciaFiscal.update({ where: { id: 'SF-DEMO-B04-1' }, data: { estado: 'Inactiva' } });
    const ss = await credito(CJ, { reciboId: c2.recibo.id, motivo: '01', total: true, reembolsos: [{ metodo: 'Efectivo', monto: c2.recibo.monto }], pin: await sup(CJ), idempotencyKey: uniq() });
    check('4 sin secuencia B04: 409 con enlace a Configuración › Fiscal', '409|SIN_SECUENCIA|true', `${ss.status}|${ss.body.code}|${String(ss.body.enlace ?? '').includes('fiscal')}`);
    check('4 sin secuencia: el recibo sigue Activo y no se consumió nada', 'Activo', (await prisma.finRecibo.findUniqueOrThrow({ where: { id: c2.recibo.id } })).est);
    await prisma.secuenciaFiscal.update({ where: { id: 'SF-DEMO-B04-1' }, data: { estado: 'Activa' } });
    // reembolso que no suma
    const rs = await credito(CJ, { reciboId: c2.recibo.id, motivo: '01', total: true, reembolsos: [{ metodo: 'Efectivo', monto: 1 }], pin: await sup(CJ), idempotencyKey: uniq() });
    check('4 reembolso ≠ monto de la nota: 400', 400, rs.status);
    const rm = await credito(CJ, { reciboId: c2.recibo.id, motivo: 'OP05', total: true, reembolsos: [{ metodo: 'Efectivo', monto: c2.recibo.monto }], pin: await sup(CJ), idempotencyKey: uniq() });
    check('4 motivo de débito en una NC: 400', 400, rm.status);
    const rr = await credito(CJ, { reciboId: c2.recibo.id, motivo: '01', total: true, reembolsos: [{ metodo: 'Transferencia', monto: c2.recibo.monto }], pin: await sup(CJ), idempotencyKey: uniq() });
    check('4 reembolso Transferencia sin referencia: 400', 400, rr.status);
  }

  // ---------------------------------------------------------------- 5) nota de debito
  {
    const { recibo, cedula } = await cobrar(CJ, 1);
    const cxc0 = await pendiente(`AND cicloId = '${cicloAct.id}'`), b03_0 = await secActual('SF-DEMO-B03-1');
    const mk = async (conceptos: unknown, extra: Record<string, unknown> = {}) => http('POST', '/cobros/notas/debito', CJ, { reciboId: recibo.id, motivo: 'OP05', motivoTexto: 'Mora', conceptos, pin: await sup(CJ), idempotencyKey: uniq(), ...extra });
    check('5 ND con monto negativo: 400 (no reduce deuda)', 400, (await mk([{ concepto: 'Descuento', monto: -500 }])).status);
    check('5 ND con monto 0: 400', 400, (await mk([{ concepto: 'Nada', monto: 0 }])).status);
    check('5 ND con motivo de crédito (01): 400', 400, (await mk([{ concepto: 'Mora', monto: 100 }], { motivo: '01' })).status);
    const k = uniq(), nd = await mk([{ concepto: 'Intereses por mora · mes anterior', monto: 1000 }], { idempotencyKey: k });
    check('5 ND RD$ 1,000 por mora: 201 y NCF B03 consecutivo', `201|B03${String(b03_0 + 1).padStart(8, '0')}`, `${nd.status}|${nd.body.ncf}`);
    check('5 ND: 1 cargo nuevo con notaDebitoId', `1|${nd.body.id}`, `${nd.body.cargos?.length}|${(await prisma.finCobroItem.findFirst({ where: { notaDebitoId: nd.body.id } }))?.notaDebitoId}`);
    check('5 ND: CxC sube exactamente RD$ 1,000', cxc0 + 1000, await pendiente(`AND cicloId = '${cicloAct.id}'`));
    const cuenta = (await http('GET', '/cobros/cuenta?q=' + cedula, CJ)).body;
    const itemNd = (cuenta.items as { id: string; nd?: string; monto: number }[]).find(i => i.nd === nd.body.id);
    check('5 ND: el cargo aparece en la cuenta del POS con etiqueta ND', '1000|' + nd.body.id, `${itemNd?.monto}|${itemNd?.nd}`);
    const dupND = await mk([{ concepto: 'Intereses por mora · mes anterior', monto: 1000 }], { idempotencyKey: k });
    check('5 ND idempotente: misma nota, no duplica el cargo', `200|${nd.body.id}|1`, `${dupND.status}|${dupND.body.id}|${await prisma.finCobroItem.count({ where: { notaDebitoId: nd.body.id } })}`);
    const cobro = await http('POST', '/cobros/procesar', CJ, { ids: [itemNd!.id], discount: 'none', pays: [{ m: 'Efectivo', a: '', r: '' }], cedula, tipoComprobante: 'CONSUMO' });
    check('5 ND: el cargo se cobra normalmente (200)', 200, cobro.status);
    check('5 ND: el recibo del cobro referencia la nota', nd.body.id, cobro.body.notasDebitoCobradas?.[0]?.id);
    check('5 ND: CxC vuelve al valor inicial', cxc0, await pendiente(`AND cicloId = '${cicloAct.id}'`));
    const ndRecibo = await credito(CJ, { reciboId: recibo.id, motivo: '03', total: true, reembolsos: [{ metodo: 'Efectivo', monto: recibo.monto }], pin: await sup(CJ), idempotencyKey: uniq() });
    check('5 NC sobre el recibo original con ND ya emitida: 201', 201, ndRecibo.status);
    const nd2 = await mk([{ concepto: 'Recargo', monto: 50 }]);
    check('5 ND sobre un recibo ANULADO: 409', 409, nd2.status);
  }

  // ---------------------------------------------------------------- 6) e-NCF: nota electronica
  {
    const ven = new Date(Date.now() + 300 * 864e5).toISOString().slice(0, 10);
    for (const [t, id] of [['E32', 'SF-T-E32'], ['E34', 'SF-T-E34'], ['E33', 'SF-T-E33']] as const)
      await prisma.secuenciaFiscal.upsert({ where: { id }, update: { estado: 'Activa' }, create: { id, tipoComprobanteId: t, modalidad: 'ELECTRONICA', prefijo: 'E', desde: 1, hasta: 100, actual: 0, vence: ven, estado: 'Activa', autorizacion: 'TEST electronica', creadaPor: 'prueba' } });
    const modOrig = await prisma.sisConfig.findUnique({ where: { clave: 'modalidadFiscal' } });
    await prisma.sisConfig.upsert({ where: { clave: 'modalidadFiscal' }, update: { valor: JSON.stringify({ CREDITO_FISCAL: 'FISICA', CONSUMO: 'ELECTRONICA', GUBERNAMENTAL: 'FISICA', REGIMEN_ESPECIAL: 'FISICA', NOTA_DEBITO: 'FISICA', NOTA_CREDITO: 'FISICA' }) }, create: { clave: 'modalidadFiscal', valor: JSON.stringify({ CREDITO_FISCAL: 'FISICA', CONSUMO: 'ELECTRONICA', GUBERNAMENTAL: 'FISICA', REGIMEN_ESPECIAL: 'FISICA', NOTA_DEBITO: 'FISICA', NOTA_CREDITO: 'FISICA' }) } });
    try {
      const { recibo } = await cobrar(CJ, 2);
      check('6 el recibo es electrónico (E32)', 'E32|ELECTRONICA', `${recibo.tipoComprobante.codigo}|${recibo.tipoComprobante.modalidad}`);
      const r = await credito(CJ, { reciboId: recibo.id, motivo: '01', total: true, reembolsos: [{ metodo: 'Efectivo', monto: recibo.monto }], pin: await sup(CJ), idempotencyKey: uniq() });
      check('6 nota sobre e-NCF: E34 electrónica, PendienteEnvio (aunque NOTA_CREDITO esté en FISICA)', 'E34|ELECTRONICA|PendienteEnvio|13', `${r.body.tipoComprobante?.codigo}|${r.body.tipoComprobante?.modalidad}|${r.body.estadoDgii}|${r.body.ncf?.length}`);
      const c2 = await cobrar(CJ, 1);
      const nd = await http('POST', '/cobros/notas/debito', CJ, { reciboId: c2.recibo.id, motivo: 'OP06', conceptos: [{ concepto: 'Recargo', monto: 200 }], pin: await sup(CJ), idempotencyKey: uniq() });
      check('6 ND sobre e-NCF: E33 electrónica', 'E33|PendienteEnvio', `${nd.body.tipoComprobante?.codigo}|${nd.body.estadoDgii}`);
    } finally {
      if (modOrig) await prisma.sisConfig.update({ where: { clave: 'modalidadFiscal' }, data: { valor: modOrig.valor } }); else await prisma.sisConfig.delete({ where: { clave: 'modalidadFiscal' } });
    }
  }

  // ---------------------------------------------------------------- 7) anular (endpoint existente) reabre cargos
  {
    const { recibo, items } = await cobrar(CJ, 3);
    const cxc0 = await pendiente(`AND cicloId = '${cicloAct.id}'`);
    const bad = await http('POST', `/cobros/recibos/${recibo.id}/anular`, CJ, { pin: '0000' });
    check('7 anular con PIN malo: 403', 403, bad.status);
    const r = await http('POST', `/cobros/recibos/${recibo.id}/anular`, CJ, { pin: await sup(CJ) });
    check('7 anular: 200, forma de respuesta de recibo (Anulado + nc)', 'Anulado|true', `${r.body.est}|${/^B04\d{8}$/.test(r.body.nc ?? '')}`);
    check('7 anular REABRE los cargos (CxC sube el monto)', cxc0 + recibo.monto, await pendiente(`AND cicloId = '${cicloAct.id}'`));
    check('7 anular: los 3 cargos pendientes', 3, await prisma.finCobroItem.count({ where: { id: { in: items.map(i => i.id) }, paid: false } }));
    const n = await prisma.notaFiscal.findFirstOrThrow({ where: { reciboId: recibo.id }, include: { reembolsos: true } });
    check('7 anular crea una NotaFiscal motivo 01 con el reembolso por el medio del cobro', `${n.ncf}|01|${recibo.monto}`, `${r.body.nc}|${(await prisma.motivoNota.findUniqueOrThrow({ where: { id: n.motivoId } })).codigo}|${r2(n.reembolsos.reduce((a, x) => a + x.monto, 0))}`);
    check('7 anular otra vez: 409', 409, (await http('POST', `/cobros/recibos/${recibo.id}/anular`, CJ, { pin: await sup(CJ) })).status);
  }

  // ---------------------------------------------------------------- 8) ciclo cerrado
  {
    const rc0 = await prisma.finRecibo.findFirst({ where: { ciclo: { estado: 'Cerrado' }, est: 'Activo' }, include: { ciclo: true } });
    const cerrado = rc0?.ciclo;
    if (cerrado && rc0) {
      const H = { 'x-ciclo': cerrado.nombre.replace(/[–—]/g, '-') };
      const rc = rc0;
      const e = await http('POST', '/cobros/notas/credito', CJ, { reciboId: rc.id, motivo: '01', total: true, reembolsos: [{ metodo: 'Efectivo', monto: rc.monto }], pin: await sup(CJ), idempotencyKey: uniq() }, H);
      check('8 ciclo cerrado (X-Ciclo): emisión 409', 409, e.status);
      const e2 = await credito(CJ, { reciboId: rc.id, motivo: '01', total: true, reembolsos: [{ metodo: 'Efectivo', monto: rc.monto }], pin: await sup(CJ), idempotencyKey: uniq() });
      check('8 recibo de un ciclo cerrado sin X-Ciclo: 409', 409, e2.status);
      check('8 ciclo cerrado: consulta del listado OK', 200, (await http('GET', '/cobros/notas', CJ, undefined, H)).status);
      const unaNota = await prisma.notaFiscal.findFirstOrThrow({});
      check('8 ciclo cerrado: reimprimir permitido', 200, (await http('POST', `/cobros/notas/${unaNota.id}/reimprimir`, CJ, {}, H)).status);
      check('8 ciclo cerrado: enviar por correo permitido (sin 409)', true, (await http('POST', `/cobros/notas/${unaNota.id}/enviar`, CJ, {}, H)).status !== 409);
    } else check('8 hay un ciclo cerrado en la base de prueba', true, false);
  }

  // ---------------------------------------------------------------- 9) 50 notas concurrentes
  {
    const recs: { id: string; monto: number }[] = [];
    for (let i = 0; i < 50; i++) { const c = await cobrar(CJ, 1); recs.push({ id: c.recibo.id, monto: c.recibo.monto }); }
    const antes = await secActual('SF-DEMO-B04-1');
    const toks = await Promise.all(recs.map(() => sup(CJ)));
    const t0 = Date.now();
    const rs = await Promise.all(recs.map((r, i) => credito(CJ, { reciboId: r.id, motivo: '01', total: true, reembolsos: [{ metodo: 'Efectivo', monto: r.monto }], pin: toks[i], idempotencyKey: uniq() })));
    const ms = Date.now() - t0;
    console.log('   estados:', [...new Set(rs.map(r => r.status + ' ' + (r.body.error ?? '').slice(0, 90)))]);
    const ok = rs.filter(r => r.status === 201), ncfs = ok.map(r => r.body.ncf as string).sort();
    const nums = ncfs.map(x => Number(x.slice(3)));
    check('9 50 notas concurrentes: todas 201', 50, ok.length);
    check('9 NCF únicos', 50, new Set(ncfs).size);
    check('9 NCF contiguos (sin huecos ni saltos)', `${antes + 1}-${antes + 50}`, `${nums[0]}-${nums[nums.length - 1]}|${nums.every((v, i) => v === nums[0] + i)}`.replace(/\|true$/, ''), nums.every((v, i) => v === nums[0] + i) && nums[0] === antes + 1);
    check('9 secuencia avanzó exactamente 50', antes + 50, await secActual('SF-DEMO-B04-1'));
    console.log(`   (50 notas concurrentes en ${ms} ms)`);
  }

  // ---------------------------------------------------------------- 10) rendimiento del listado con miles de notas
  {
    const base = await prisma.notaFiscal.findFirstOrThrow({ where: { clase: 'CREDITO' }, include: { lineas: true } });
    const recs = await prisma.finRecibo.findMany({ where: { est: 'Activo' }, take: 3000, select: { id: true, ncf: true, tutorId: true, monto: true } });
    const antes = await prisma.notaFiscal.count();
    let k = 0;
    const chunks: typeof recs[] = []; for (let i = 0; i < recs.length; i += 200) chunks.push(recs.slice(i, i + 200));
    for (const ch of chunks) await prisma.notaFiscal.createMany({ data: ch.map(r => ({ id: 'NC-9' + String(++k).padStart(5, '0'), clase: 'CREDITO', tipoComprobanteId: base.tipoComprobanteId, secuenciaFiscalId: base.secuenciaFiscalId, ncf: 'B04' + String(50_000_000 + k), modalidad: 'FISICA', estadoDgii: 'NoAplica', reciboId: r.id, ncfModificado: r.ncf, tutorId: r.tutorId, clienteNombre: 'Carga de prueba', cicloId: cicloAct.id, motivoId: base.motivoId, monto: 1, cajeroId: base.cajeroId, hora: '10:00', idempotencyKey: 'carga:' + k })) });
    const total = await prisma.notaFiscal.count();
    const medir = async (path: string) => { let best = 1e9, r!: Resp; for (let i = 0; i < 3; i++) { const t = Date.now(); r = await http('GET', path, CJ); best = Math.min(best, Date.now() - t); } return { ms: best, r }; }; // mejor de 3 (la primera llamada incluye el calentamiento del plan)
    await medir('/cobros/notas?size=25');
    const a = await medir('/cobros/notas?size=25'), b = await medir('/cobros/notas?size=25&page=40&tipo=credito'), c = await medir('/cobros/notas?q=Carga&size=25'), d = await medir(`/cobros/notas?q=${base.ncf}`);
    check(`10 listado con ${total} notas (+${total - antes}): primera página < 300 ms`, true, `${a.ms} ms`, a.ms < 300 && a.r.status === 200);
    check('10 página 40 filtrada por tipo < 300 ms', true, `${b.ms} ms`, b.ms < 300 && b.r.status === 200);
    check('10 búsqueda por texto < 300 ms', true, `${c.ms} ms`, c.ms < 300 && c.r.status === 200);
    check('10 búsqueda por NCF < 300 ms', true, `${d.ms} ms`, d.ms < 300 && d.r.status === 200);
    check('10 total y suma neta coherentes', true, `total ${a.r.body.total} · crédito ${a.r.body.suma.credito}`, a.r.body.total === total && a.r.body.suma.credito > 0);
    await prisma.notaFiscal.deleteMany({ where: { idempotencyKey: { startsWith: 'carga:' } } });
  }

  console.log('\n== Resultado de las pruebas de notas ==');
  console.table(filas.map(f => ({ '#': f.n, prueba: f.prueba, esperado: f.esperado, real: f.real, ok: f.ok ? 'OK' : 'FALLA' })));
  const malas = filas.filter(f => !f.ok);
  console.log(malas.length ? `\n${malas.length} FALLA(S) de ${filas.length}` : `\nTodas OK (${filas.length}).`);
  process.exitCode = malas.length ? 1 : 0;
}
main().catch(e => { console.error(e); process.exitCode = 2; }).finally(() => prisma.$disconnect());
