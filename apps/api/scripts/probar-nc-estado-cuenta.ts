/**
 * Prueba E2E: las notas de credito en el estado de cuenta (Expediente + /cobros/cuenta). SOLO base de prueba (nombre con «test»/«temp»).
 *   DATABASE_URL=<base test> API_URL=http://localhost:3041 pnpm --filter @stodia/api exec tsx scripts/probar-nc-estado-cuenta.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { generarMoras } from '../src/lib/mora';

const API = process.env.API_URL ?? 'http://localhost:3041';
if (!/(test|temp)/i.test((process.env.DATABASE_URL ?? '').split('database=')[1] ?? '')) { console.error('Usa una base de prueba. Abortado.'); process.exit(2); }
const prisma = new PrismaClient();
const PWD = process.env.SEED_PASSWORD ?? 'stodia123', PIN = process.env.SUPERVISOR_PIN ?? '1234';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function http(method: string, path: string, token: string | null, body?: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(API + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await res.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* texto */ }
  return { status: res.status, body: b };
}
const login = async (u: string) => (await http('POST', '/auth/login', null, { usuario: u, password: PWD })).body.token as string;
const sup = async (t: string) => (await http('POST', '/auth/supervisor', t, { pin: PIN })).body.token as string;
let fallos = 0;
const check = (p: string, esperado: unknown, real: unknown) => { const ok = String(esperado) === String(real); if (!ok) fallos++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${p} | esperado=${esperado} real=${real}`); };
const uniq = () => 'k-' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
const used = new Set<string>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cobrar(tok: string) {
  const ciclo = (await prisma.ciclo.findFirstOrThrow({ where: { estado: 'Activo' } })).id;
  const rows = await prisma.$queryRawUnsafe<{ ced: string }[]>(`SELECT t.cedula AS ced FROM FinCobroItem c JOIN Tutor t ON t.id = c.tutorId WHERE c.paid = 0 AND c.cicloId = '${ciclo}' AND c.tipo IN ('col','srv') GROUP BY t.cedula HAVING COUNT(*) >= 1 ORDER BY t.cedula`);
  let ced = '', cuenta: any, items: { id: string; kid: string; tipo: string }[] = [];
  for (const r of rows) { const b = (await http('GET', '/cobros/cuenta?q=' + r.ced, tok)).body; const its = ((b?.items ?? []) as { id: string; kid: string; tipo: string }[]).filter(i => (i.tipo === 'col' || i.tipo === 'srv') && !used.has(i.id)); if (its.length >= 1) { ced = r.ced; cuenta = b; items = its.slice(0, 2); items.forEach(i => used.add(i.id)); break; } }
  if (!ced) throw new Error('sin tutores con 2 cargos');
  const rec = await http('POST', '/cobros/procesar', tok, { ids: items.map(i => i.id), discount: 'none', pays: [{ m: 'Efectivo', a: '', r: '' }], cedula: cuenta.cedula, tipoComprobante: 'CONSUMO' });
  if (rec.status !== 200) throw new Error('cobro fallido ' + JSON.stringify(rec.body));
  return { recibo: rec.body as { id: string; monto: number }, ids: items.map(i => i.id), kids: [...new Set(items.map(i => i.kid))], ced: cuenta.cedula as string };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cuentaDe = async (tok: string, kids: string[]) => { const out: any[] = []; let notas: any[] = []; for (const k of kids) { const b = (await http('GET', '/expediente/' + k, tok)).body; out.push(...b.cuenta); notas = notas.concat(b.notas ?? []); } return { cuenta: out, notas }; };

async function main() {
  const SA = await login('usr_palmanzar'), CJ = await login('usr_arosario');
  for (const s of ['B02', 'B03', 'B04']) await prisma.secuenciaFiscal.update({ where: { id: `SF-DEMO-${s}-1` }, data: { hasta: 5000, estado: 'Activa' } });

  // ---- 1) NC TOTAL con «volver a cobrar»
  {
    const c = await cobrar(CJ);
    const antes = await cuentaDe(SA, c.kids);
    check('1 antes: cargos pagados', 'true,true', c.ids.map(id => antes.cuenta.find(x => x.id === id).paid).join(','));
    const r = await http('POST', '/cobros/notas/credito', CJ, { reciboId: c.recibo.id, motivo: '01', total: true, reabrirCargos: true, reembolsos: [{ metodo: 'Efectivo', monto: c.recibo.monto }], pin: await sup(CJ), idempotencyKey: uniq() });
    check('1 NC total HTTP', 201, r.status);
    const ex = await cuentaDe(SA, c.kids);
    for (const id of c.ids) {
      const it = ex.cuenta.find(x => x.id === id);
      check(`1 expediente ${id}: paid=false, nc.reabierto, recibo`, 'false|true|' + c.recibo.id, `${it.paid}|${it.nc?.reabierto}|${it.nc?.recibo}`);
      check(`1 expediente ${id}: estado derivado (no Pagado)`, true, ['Vencida', 'Por vencer', 'Pendiente'].includes(it.est));
    }
    check('1 expediente: movimiento de nota', 'Nota de crédito · pendiente de cobro', ex.notas[0]?.efecto);
    const cu = (await http('GET', '/cobros/cuenta?q=' + c.ced, CJ)).body;
    check('1 /cobros/cuenta lista los cargos como pendientes', c.ids.length, c.ids.filter(id => cu.items.some((x: { id: string }) => x.id === id)).length);
    const sim = await generarMoras({ alumnoIds: c.kids, simular: true });
    const venc = (await prisma.finCobroItem.findMany({ where: { id: { in: c.ids } }, select: { vence: true } })).map(x => x.vence);
    console.log('   vence original:', JSON.stringify(venc), '| mora simulada sobre ellos:', JSON.stringify(sim.detalle.filter(d => c.ids.includes(d.cuotaId))));
  }

  // ---- 2) NC PARCIAL (una linea) con reabrir: solo esa linea vuelve
  {
    const c = await cobrar(CJ);
    const disp = (await http('GET', `/cobros/recibos/${c.recibo.id}/notas-disponible`, CJ)).body;
    const l1 = disp.lineas[0];
    const r = await http('POST', '/cobros/notas/credito', CJ, { reciboId: c.recibo.id, motivo: '03', motivoTexto: 'Corrección de montos de prueba', lineas: [{ id: l1.id, reabrir: true }], reembolsos: [{ metodo: 'Efectivo', monto: l1.restante }], pin: await sup(CJ), idempotencyKey: uniq() });
    if (r.status !== 201) console.log('   ', JSON.stringify(r.body));
    check('2 NC parcial HTTP', 201, r.status);
    const ex = await cuentaDe(SA, c.kids);
    const mios = ex.cuenta.filter(x => c.ids.includes(x.id));
    const abiertos = mios.filter(x => x.nc?.reabierto && !x.paid).length, pagados = mios.filter(x => x.paid && !x.nc).length;
    check('2 parcial: 1 cargo pendiente de cobro y 1 sigue pagado sin nota', '1|1', `${abiertos}|${pagados}`);
  }

  // ---- 3) NC SIN reabrir (devolucion definitiva)
  {
    const c = await cobrar(CJ);
    const r = await http('POST', '/cobros/notas/credito', CJ, { reciboId: c.recibo.id, motivo: '01', total: true, reabrirCargos: false, reembolsos: [{ metodo: 'Efectivo', monto: c.recibo.monto }], pin: await sup(CJ), idempotencyKey: uniq() });
    if (r.status !== 201) console.log('   ', JSON.stringify(r.body));
    check('3 NC total sin reabrir HTTP', 201, r.status);
    const ex = await cuentaDe(SA, c.kids);
    for (const id of c.ids) {
      const it = ex.cuenta.find(x => x.id === id);
      check(`3 ${id}: sigue pagado, acreditado, NO reabierto`, 'true|true|false', `${it.paid}|${it.nc?.acreditado}|${it.nc?.reabierto}`);
    }
    check('3 expediente: movimiento', 'Nota de crédito · acreditado (devolución definitiva)', ex.notas[0]?.efecto);
    const cu = (await http('GET', '/cobros/cuenta?q=' + c.ced, CJ)).body;
    check('3 /cobros/cuenta NO lista los cargos', 0, c.ids.filter(id => cu.items.some((x: { id: string }) => x.id === id)).length);
  }
  console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO OK');
  await prisma.$disconnect();
  process.exit(fallos ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
