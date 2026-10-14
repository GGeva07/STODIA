/**
 * BACKFILL DE LA ETAPA 3 DE INFORMES (docs/informes-analisis.md §10). IDEMPOTENTE: solo rellena lo que está en NULL; ejecutarlo dos veces no cambia nada la segunda vez.
 * Requiere haber aplicado el esquema (`pnpm --filter @stodia/api db:push`). Ejecutar con la API DETENIDA:
 *     pnpm --filter @stodia/api exec tsx scripts/backfill-informes.ts            (aplica)
 *     pnpm --filter @stodia/api exec tsx scripts/backfill-informes.ts --dry      (solo cuenta lo que haría)
 * Qué rellena (nunca reescribe conceptos ni montos existentes):
 *   1) FinCobroItem.categoria  ← lib/categorias.categoriaCargo(tipo, concepto); un cargo `srv` de un ServicioAlumno con productoId es 'articulo'.
 *   2) FinReciboItem.categoria ← la de su cargo (cobroItemId); las líneas sin cargo, categoriaPorConcepto(concepto).
 *   3) FinVenta.cicloId        ← ciclo cuyo rango de fechas (fechaInicio–fechaFin, en la zona horaria de la institución) contiene la venta; fuera de todo rango queda NULL.
 *   4) ServicioAlumno.cicloId / fechaAlta / fechaBaja ← ciclo con más cargos del servicio (si no tiene cargos, el ciclo que contiene su fecha o el activo); fechaAlta = vencimiento
 *      más antiguo de sus cargos (ServicioAlumno no guarda fecha de creación; sin cargos, inicio del ciclo); fechaBaja ← «Baja · dd/mm/aaaa» de `est`.
 *   5) FinMovimiento.cantidad (parseando `q`, signo Unicode «−») y stockResultante (reconstruido hacia atrás desde FinProducto.stock actual; solo productos con stock).
 *   6) Matricula.motivoRetiro ← motivo escrito en la auditoría («Retirado (baja lógica) · motivo: …») si la matrícula del ciclo activo no tiene motivo.
 * No toca MatriculaResultado ni CierreNota: el informe 2 reconstruye con Matricula N vs N+1 (marcado «reconstruido») y el informe 3 calcula en vivo los ciclos sin foto.
 */
import 'dotenv/config';
import { prisma } from '../src/db';
import { categoriaCargo, categoriaPorConcepto } from '../src/lib/categorias';
import { zonaHoraria } from '../src/lib/cxc';

const DRY = process.argv.includes('--dry');
const trozos = <T>(l: T[], n = 500) => Array.from({ length: Math.ceil(l.length / n) }, (_, i) => l.slice(i * n, (i + 1) * n));
const log = (m: string) => console.log(m);
const iso = (dmy: string) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dmy ?? ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

/** Fecha AAAA-MM-DD de un instante en la zona horaria dada. */
function fechaEnZona(d: Date, tz: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  const bd = /database=([^;]+)/i.exec(url)?.[1] ?? url.split('?')[0];
  log(`Backfill de informes (etapa 3) sobre «${bd}»${DRY ? ' · SIMULACRO (no escribe)' : ''}`);
  const tz = await zonaHoraria();
  const res: Record<string, number> = {};

  // ---- 1) FinCobroItem.categoria
  {
    const grupos = await prisma.$queryRaw<{ tipo: string; con: string; prod: number; n: number }[]>`
      SELECT c.tipo AS tipo, c.con AS con, CASE WHEN s.productoId IS NULL THEN 0 ELSE 1 END AS prod, COUNT(*) AS n
      FROM dbo.FinCobroItem c LEFT JOIN dbo.ServicioAlumno s ON s.id = c.servicioId
      WHERE c.categoria IS NULL GROUP BY c.tipo, c.con, CASE WHEN s.productoId IS NULL THEN 0 ELSE 1 END`;
    let n = 0;
    // Tipos cuya categoría no depende del texto: una sola sentencia por tipo.
    const fijos = new Map<string, string>();
    for (const t of new Set(grupos.map(g => g.tipo))) {
      if (['mat', 'srv'].includes(t)) continue;
      fijos.set(t, categoriaCargo(t, ''));
    }
    for (const [tipo, cat] of fijos) {
      const total = grupos.filter(g => g.tipo === tipo).reduce((a, g) => a + Number(g.n), 0);
      n += total;
      if (!DRY) await prisma.$executeRaw`UPDATE dbo.FinCobroItem SET categoria = ${cat} WHERE categoria IS NULL AND tipo = ${tipo}`;
    }
    // 'mat' (inscripción / reinscripción / materiales) y 'srv' (artículo / servicio): por concepto distinto.
    for (const g of grupos.filter(g => ['mat', 'srv'].includes(g.tipo))) {
      const cat = g.tipo === 'srv' && Number(g.prod) === 1 ? 'articulo' : categoriaCargo(g.tipo, g.con);
      n += Number(g.n);
      if (!DRY) {
        if (g.tipo === 'srv' && Number(g.prod) === 1) await prisma.$executeRaw`UPDATE c SET c.categoria = ${cat} FROM dbo.FinCobroItem c JOIN dbo.ServicioAlumno s ON s.id = c.servicioId WHERE c.categoria IS NULL AND c.tipo = ${g.tipo} AND c.con = ${g.con} AND s.productoId IS NOT NULL`;
        else if (g.tipo === 'mat') await prisma.$executeRaw`UPDATE dbo.FinCobroItem SET categoria = ${cat} WHERE categoria IS NULL AND tipo = 'mat' AND con = ${g.con}`; // inscripción / reinscripción / materiales: solo el texto manda
        else await prisma.$executeRaw`UPDATE c SET c.categoria = ${cat} FROM dbo.FinCobroItem c LEFT JOIN dbo.ServicioAlumno s ON s.id = c.servicioId WHERE c.categoria IS NULL AND c.tipo = ${g.tipo} AND c.con = ${g.con} AND s.productoId IS NULL`;
      }
    }
    res['FinCobroItem.categoria'] = n;
  }

  // ---- 2) FinReciboItem.categoria
  {
    const conCargo = Number(((await prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(*) AS n FROM dbo.FinReciboItem r JOIN dbo.FinCobroItem c ON c.id = r.cobroItemId WHERE r.categoria IS NULL AND c.categoria IS NOT NULL`)[0]?.n) ?? 0);
    if (!DRY) await prisma.$executeRaw`UPDATE r SET r.categoria = c.categoria FROM dbo.FinReciboItem r JOIN dbo.FinCobroItem c ON c.id = r.cobroItemId WHERE r.categoria IS NULL AND c.categoria IS NOT NULL`;
    const sinCargo = await prisma.$queryRaw<{ concepto: string; n: number }[]>`SELECT concepto, COUNT(*) AS n FROM dbo.FinReciboItem WHERE categoria IS NULL AND cobroItemId IS NULL GROUP BY concepto`;
    let n2 = 0;
    for (const g of sinCargo) {
      n2 += Number(g.n);
      const cat = categoriaPorConcepto(g.concepto);
      if (!DRY) await prisma.$executeRaw`UPDATE dbo.FinReciboItem SET categoria = ${cat} WHERE categoria IS NULL AND cobroItemId IS NULL AND concepto = ${g.concepto}`;
    }
    res['FinReciboItem.categoria (con cargo)'] = conCargo;
    res['FinReciboItem.categoria (sin cargo, por concepto)'] = n2;
  }

  // ---- 3) FinVenta.cicloId
  const ciclos = await prisma.ciclo.findMany({ select: { id: true, nombre: true, fechaInicio: true, fechaFin: true, estado: true }, orderBy: { fechaInicio: 'asc' } });
  {
    const ventas = await prisma.finVenta.findMany({ where: { cicloId: null }, select: { id: true, createdAt: true } });
    const porCiclo = new Map<string, string[]>();
    let sin = 0;
    for (const v of ventas) {
      const f = fechaEnZona(v.createdAt, tz), c = ciclos.find(x => f >= x.fechaInicio && f <= x.fechaFin);
      if (!c) { sin++; continue; }
      porCiclo.set(c.id, [...(porCiclo.get(c.id) ?? []), v.id]);
    }
    let n = 0;
    for (const [cid, ids] of porCiclo) { n += ids.length; if (!DRY) for (const ch of trozos(ids)) await prisma.finVenta.updateMany({ where: { id: { in: ch }, cicloId: null }, data: { cicloId: cid } }); }
    res['FinVenta.cicloId'] = n;
    if (sin) log(`  · ${sin} venta(s) fuera del rango de todo ciclo: quedan sin ciclo`);
  }

  // ---- 4) ServicioAlumno.cicloId / fechaAlta / fechaBaja
  {
    const servicios = await prisma.servicioAlumno.findMany({ where: { OR: [{ cicloId: null }, { fechaAlta: null }, { fechaBaja: null, est: { startsWith: 'Baja' } }] }, select: { id: true, est: true, cicloId: true, fechaAlta: true, fechaBaja: true, fecha: true } });
    const cargos = servicios.length ? await prisma.finCobroItem.findMany({ where: { servicioId: { in: servicios.map(s => s.id) } }, select: { servicioId: true, cicloId: true, vence: true } }) : [];
    const porSvc = new Map<string, { cicloId: string; vence: string }[]>();
    for (const c of cargos) porSvc.set(c.servicioId!, [...(porSvc.get(c.servicioId!) ?? []), { cicloId: c.cicloId, vence: c.vence }]);
    const activo = ciclos.find(c => c.estado === 'Activo');
    let n = 0;
    for (const s of servicios) {
      const cs = porSvc.get(s.id) ?? [];
      const cuenta = new Map<string, number>();
      for (const c of cs) cuenta.set(c.cicloId, (cuenta.get(c.cicloId) ?? 0) + 1);
      const topCiclo = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const fechaSvc = iso(s.fecha);
      const cicloId = s.cicloId ?? topCiclo ?? (fechaSvc ? ciclos.find(c => fechaSvc >= c.fechaInicio && fechaSvc <= c.fechaFin)?.id : undefined) ?? activo?.id ?? null;
      const ciclo = ciclos.find(c => c.id === cicloId);
      const vences = cs.filter(c => c.cicloId === cicloId).map(c => iso(c.vence)).filter((x): x is string => !!x).sort();
      const fechaAlta = s.fechaAlta ?? vences[0] ?? ciclo?.fechaInicio ?? null;
      const baja = /^Baja · (\d{2}\/\d{2}\/\d{4})/.exec(s.est ?? '');
      const fechaBaja = s.fechaBaja ?? (baja ? iso(baja[1]) : null);
      const data: { cicloId?: string; fechaAlta?: string; fechaBaja?: string } = {};
      if (!s.cicloId && cicloId) data.cicloId = cicloId;
      if (!s.fechaAlta && fechaAlta) data.fechaAlta = fechaAlta;
      if (!s.fechaBaja && fechaBaja) data.fechaBaja = fechaBaja;
      if (!Object.keys(data).length) continue;
      n++;
      if (!DRY) await prisma.servicioAlumno.update({ where: { id: s.id }, data });
    }
    res['ServicioAlumno (ciclo/alta/baja)'] = n;
  }

  // ---- 5) FinMovimiento.cantidad / stockResultante
  {
    const movs = await prisma.finMovimiento.findMany({ select: { id: true, productoId: true, q: true, tipo: true, cantidad: true, stockResultante: true, createdAt: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    const stock = new Map((await prisma.finProducto.findMany({ select: { id: true, stock: true } })).map(p => [p.id, p.stock]));
    const porProd = new Map<string, typeof movs>();
    for (const m of movs) porProd.set(m.productoId, [...(porProd.get(m.productoId) ?? []), m]);
    const cant = (q: string, tipo: string) => {
      const n = parseInt(String(q).replace(/[−–—]/g, '-').replace('+', '').trim(), 10);
      if (!Number.isFinite(n)) return null;
      return tipo === 'Salida' ? -Math.abs(n) : n; // Salida siempre negativa; Entrada y Devolución, positivas (el signo de q ya lo dice)
    };
    let nc = 0, ns = 0, sinParse = 0;
    for (const [pid, lista] of porProd) {
      const vals = lista.map(m => m.cantidad ?? cant(m.q, m.tipo));
      let despues = stock.get(pid) ?? null; // stock tras el ÚLTIMO movimiento = el actual (todo cambio de stock pasa por un movimiento)
      for (let i = lista.length - 1; i >= 0; i--) {
        const m = lista[i], c = vals[i];
        const upd: { cantidad?: number; stockResultante?: number } = {};
        if (m.cantidad == null && c != null) { upd.cantidad = c; nc++; }
        if (c == null) sinParse++;
        if (m.stockResultante == null && despues != null) { upd.stockResultante = despues; ns++; }
        if (!DRY && Object.keys(upd).length) await prisma.finMovimiento.update({ where: { id: m.id }, data: upd });
        despues = despues != null && c != null ? despues - c : null;
      }
    }
    res['FinMovimiento.cantidad'] = nc; res['FinMovimiento.stockResultante'] = ns;
    if (sinParse) log(`  · ${sinParse} movimiento(s) con «q» no interpretable`);
  }

  // ---- 6) Matricula.motivoRetiro desde la auditoría
  {
    const activo = ciclos.find(c => c.estado === 'Activo');
    const aud = await prisma.sisAudit.findMany({ where: { tabla: 'Alumnos', registro: { endsWith: '/estado' }, next: { contains: ' · motivo: ' } }, orderBy: { t: 'asc' }, select: { registro: true, next: true } });
    const porCodigo = new Map<string, string>();
    for (const a of aud) { const m = / · motivo: (.+)$/s.exec(a.next); if (m) porCodigo.set(a.registro.replace(/\/estado$/, ''), m[1].trim().slice(0, 300)); }
    let n = 0;
    if (activo) for (const [code, motivo] of porCodigo) {
      const al = await prisma.alumno.findUnique({ where: { code }, select: { id: true, estado: true } });
      if (!al || al.estado === 'Activo') continue;
      const c = await prisma.matricula.count({ where: { alumnoId: al.id, cicloId: activo.id, motivoRetiro: null } });
      if (!c) continue;
      n++;
      if (!DRY) await prisma.matricula.updateMany({ where: { alumnoId: al.id, cicloId: activo.id, motivoRetiro: null }, data: { motivoRetiro: motivo } });
    }
    res['Matricula.motivoRetiro (desde auditoría)'] = n;
  }

  log('\nFilas ' + (DRY ? 'que se rellenarían' : 'rellenadas') + ':');
  for (const [k, v] of Object.entries(res)) log(`  ${k.padEnd(52)} ${v}`);
}

main().then(() => prisma.$disconnect()).catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
