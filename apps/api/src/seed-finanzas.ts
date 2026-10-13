import { prisma } from './db';
import { cajaDe, lineasData, pagosData } from './lib/recibos';
import { cicloIdActivo } from './lib/ciclo';
import { datosSinTm, guardarTandasPlan } from './lib/planes';
import { categoriaProductoId, parseRegla } from './lib/catalogos-tipados';
import { asegurarCatalogoFiscal } from './lib/fiscal';

// Datos del mock del prototipo (POS0, PLANS0, becas, KPROD, recibos, kárdex). Idempotente.
//
// Se siembra en DOS fases porque las FK dictan el orden (ver seed.ts):
//   seedFinanzasBase    -> contadores, planes, productos, recibos, becas, config de la demo  (no dependen de servicios)
//   (seedPersonas)      -> expedientes, contratos, SERVICIOS del alumno (PersServicio.reciboId -> FinRecibo, Contrato.planId -> FinPlan)
//   seedFinanzasCartera -> cargos de cobro (FinCobroItem.servicioId -> PersServicio)

/** Alias que usaba el prototipo para los dos alumnos de la muestra -> Alumno.id reales. El dato guardado SIEMPRE es el id. */
const ALUMNO_DE: Record<string, string> = { juan: '0412', sofia: '0587' };
/** Cargo de la muestra -> servicio del alumno que lo origina (FinCobroItem.servicioId). */
const SERVICIO_DE: Record<string, string> = { k10: 'psv-com', f10: 'psv-fut', seg: 'pon-seg' };

const POS0: [string, string, string, string, string, number, string, string][] = [
  ['c09', 'Colegiatura Septiembre 2026', 'Juan · 5to A', 'juan', '01/09/2026', 8500, 'Vencida', 'col'],
  ['m09', 'Recargo por mora · Sep. (3%)', 'Juan · 5to A', 'juan', '06/09/2026', 255, 'Vencida', 'mora'],
  ['c10', 'Colegiatura Octubre 2026', 'Juan · 5to A', 'juan', '01/10/2026', 8500, 'Vencida', 'col'],
  ['k10', 'Plan Comedor · Octubre', 'Juan · 5to A', 'juan', '01/10/2026', 3200, 'Vencida', 'com'],
  ['f10', 'Academia de Fútbol · Octubre', 'Juan · 5to A', 'juan', '15/10/2026', 1500, 'Por vencer', 'srv'],
  ['seg', 'Seguro estudiantil contra accidentes', 'Juan · 5to A', 'juan', '15/10/2026', 1200, 'Por vencer', 'mat'],
  ['s10', 'Colegiatura Octubre 2026', 'Sofía · 2do B', 'sofia', '10/10/2026', 7020, 'Por vencer', 'col'],
  ['t10', 'Transporte Zona A · Octubre', 'Sofía · 2do B', 'sofia', '10/10/2026', 2800, 'Por vencer', 'tra'],
  ['c11', 'Colegiatura Noviembre 2026', 'Juan · 5to A', 'juan', '01/11/2026', 8500, 'Pendiente', 'col'],
];

// pays[].m = nombre EXACTO del catalogo metodosPago ('Tarjeta de Crédito', no 'Tarjeta').
const RECIBOS: { id: string; ncf: string; tutor: string; hora: string; monto: number; metodo: string; lineas: { con: string; monto: number }[] }[] = [
  { id: 'REC-0415', ncf: 'B0200001878', tutor: 'Altagracia Núñez', hora: '08:12', monto: 8500, metodo: 'Efectivo', lineas: [{ con: 'Colegiatura Septiembre 2026 · Gabriela', monto: 8500 }] },
  { id: 'REC-0416', ncf: 'B0200001879', tutor: 'Ramón Espinal', hora: '08:47', monto: 11700, metodo: 'Tarjeta de Crédito', lineas: [{ con: 'Colegiatura Septiembre 2026 · Camila', monto: 8500 }, { con: 'Plan Comedor · Septiembre · Camila', monto: 3200 }] },
  { id: 'REC-0417', ncf: 'B0200001880', tutor: 'Yolanda Guzmán', hora: '09:20', monto: 3200, metodo: 'Transferencia', lineas: [{ con: 'Plan Comedor · Septiembre · Yuleisy', monto: 3200 }] },
];

const base = { freq: '1', n: '10', anual: '85000', desc: '0', start: '8', dia: '1', gracia: '5', moraTipo: 'pct', moraVal: '3', pronto: '0', prontoDias: '0', estado: 'Activo' };
const PLANS: [string, Record<string, unknown>][] = [
  ['PLN-001', { ...base, porTanda: true, tm: { Matutina: '85000', Vespertina: '72000', Extendida: '98000', Nocturna: '60000' }, name: 'Plan Regular 10 Cuotas', pronto: '5', prontoDias: '0' }],
  ['PLN-002', { ...base, name: 'Pago Único Anual Contado', freq: '0', n: '1', desc: '10', dia: '15', gracia: '0', moraTipo: 'none', moraVal: '0' }],
  ['PLN-003', { ...base, name: 'Plan Trimestral', freq: '3', n: '4' }],
  ['PLN-004', { ...base, name: 'Plan 11 Cuotas (Ago–Jun)', n: '11', moraTipo: 'fijo', moraVal: '25', estado: 'Inactivo' }],
];

// [id, alumnoId, grado, tipo (nombre EXACTO del catalogo becas), regla, expediente, estado, aprobacion]
const BECAS: [string, string, string, string, string, string, string, string][] = [
  ['91', '0587', '2do B', 'Beca Plan Hermano', '10%', 'EXP-BEC-0091', 'Aprobada', 'C. Vidal · 12/08/2026'],
  ['104', '0433', '5to A', 'Beca Académica', '50%', 'EXP-BEC-0104', 'Pendiente', 'Esperando Director Financiero'],
  ['107', '0421', '5to A', 'Deportiva', 'RD$ 2,000.00', 'EXP-BEC-0107', 'Pendiente', 'Esperando Director Financiero'],
  ['88', '0447', '5to A', 'Hijo de Empleado', '100%', 'EXP-BEC-0088', 'Aprobada', 'C. Vidal · 05/08/2026'],
];

const KPROD: [string, string, string, string, number, boolean, number | null, string][] = [
  ['p1', '7501001', 'Camisa Polo Escolar', 'Uniformes', 850, true, 40, 'ph ph-t-shirt'], ['p2', '7501002', 'Pantalón Azul Marino', 'Uniformes', 1100, true, 32, 'ph ph-t-shirt'], ['p3', '7501003', 'Suéter con Escudo', 'Uniformes', 1650, true, 3, 'ph ph-t-shirt'],
  ['p4', '7502001', 'Libro Matemáticas 5to', 'Libros', 1450, false, 18, 'ph ph-book-open'], ['p5', '7502002', 'Libro Lengua Española 5to', 'Libros', 1380, false, 22, 'ph ph-book-open'], ['p6', '7502003', 'Reader Inglés 5to', 'Libros', 1200, false, 4, 'ph ph-book-open'],
  ['p7', '7503001', 'Cuaderno 100 hojas', 'Papelería', 95, true, 120, 'ph ph-notebook'], ['p8', '7503002', 'Kit de Geometría', 'Papelería', 230, true, 15, 'ph ph-ruler'],
  ['p9', '7504001', 'Certificación de Estudios', 'Servicios', 500, false, null, 'ph ph-certificate'], ['p10', '7504002', 'Récord de Notas', 'Servicios', 350, false, null, 'ph ph-certificate'],
  // Cargos únicos del expediente de Juan (ServicioAlumno exige un elemento del catálogo: ruta, plan de alimentación, actividad o producto).
  ['p11', '7502010', 'Paquete de libros de texto · 5to', 'Libros', 9800, false, null, 'ph ph-book-open'], ['p12', '7501010', 'Uniformes (2 juegos)', 'Uniformes', 4600, true, null, 'ph ph-t-shirt'],
  ['p13', '7504010', 'Seguro estudiantil contra accidentes', 'Servicios', 1200, false, null, 'ph ph-certificate'], ['p14', '7504011', 'Salida pedagógica · Museo de Historia Natural', 'Servicios', 850, false, null, 'ph ph-certificate'],
];

export async function seedFinanzasBase() {
  for (const [key, value] of Object.entries({ rec: 418, vta: 89, ent: 32, pln: 5 })) {
    await prisma.finCounter.upsert({ where: { key }, update: {}, create: { key, value } });
  }
  for (const [id, data] of PLANS) {
    const hay = await prisma.finPlan.findUnique({ where: { id } });
    await prisma.finPlan.upsert({ where: { id }, update: {}, create: { id, name: String(data.name), estado: String(data.estado), data: datosSinTm(data) } });
    if (!hay) await guardarTandasPlan(prisma, id, data.tm as Record<string, string> | undefined); // importe anual por tanda (FinPlanTanda)
  }
  for (const p of KPROD) {
    await prisma.finProducto.upsert({
      where: { id: p[0] }, update: {},
      create: { id: p[0], code: p[1], name: p[2], categoriaId: await categoriaProductoId(p[3]), price: p[4], tax: p[5], stock: p[6], icon: p[7] },
    });
  }
  await seedDemoConfig(); // config fiscal/financiera y recaudo histórico (los medios de pago los siembra seed-estructura)

  // Recibos: tutor por FK (id) + nombre como instantánea del comprobante; cajero = Ana Rosario (usr_arosario) y su caja.
  const tutores = new Map((await prisma.tutor.findMany({ select: { id: true, nombre: true } })).map(t => [t.nombre, t.id]));
  const cajero = await prisma.user.findUnique({ where: { usuario: 'usr_arosario' } });
  const cajaId = cajero ? await cajaDe({ usuario: cajero.usuario, nombre: cajero.nombre }) : null;
  const refs: Record<string, string> = { Efectivo: '', 'Tarjeta de Crédito': 'AUT-', Transferencia: 'TRF-' };
  const metodoId = new Map((await prisma.metodoPago.findMany({ select: { id: true, nombre: true } })).map(m => [m.nombre, m.id]));
  const cicloId = await cicloIdActivo();
  /** Recibo con sus lineas (FinReciboItem) y pagos (FinReciboPago); idempotente (solo si el recibo no existe). */
  const recibo = async (data: Parameters<typeof prisma.finRecibo.create>[0]['data'], lineas: { con: string; monto: number }[], pays: { m: string; r: string; amt: number }[]) => {
    const id = data.id as string;
    if (await prisma.finRecibo.findUnique({ where: { id } })) return;
    await prisma.finRecibo.create({ data });
    await prisma.finReciboItem.createMany({ data: lineasData(id, lineas) });
    await prisma.finReciboPago.createMany({ data: await pagosData(id, pays) });
  };
  for (const [i, r] of RECIBOS.entries()) {
    await recibo(
      { id: r.id, ncf: r.ncf, tutor: r.tutor, tutorId: tutores.get(r.tutor) ?? null, cajaId, cicloId, metodoPagoId: metodoId.get(r.metodo) ?? null, cajeroId: cajero?.id ?? null, hora: r.hora, monto: r.monto },
      r.lineas, [{ m: r.metodo, r: refs[r.metodo] ? refs[r.metodo] + (710000 + i) : '', amt: r.monto }],
    );
  }
  // Recibo histórico de Juan (agosto): libros + uniformes; lo referencian los cargos únicos «cobrado» de su expediente (PersServicio.reciboId).
  await recibo(
    { id: 'REC-0389', ncf: 'B0200001850', tutor: 'Carlos Mendoza Pérez', tutorId: tutores.get('Carlos Mendoza Pérez') ?? null, cajaId, cicloId, metodoPagoId: metodoId.get('Transferencia') ?? null, cajeroId: cajero?.id ?? null, hora: '09:15', monto: 14400, createdAt: new Date(Date.UTC(2026, 7, 5, 13, 15)) },
    [{ con: 'Paquete de libros de texto · 5to', monto: 9800 }, { con: 'Uniformes (2 juegos)', monto: 4600 }], [{ m: 'Transferencia', r: 'TRF-698803', amt: 14400 }],
  );
  // Becas: alumno por FK; `est` conserva el nombre completo como instantánea.
  for (const b of BECAS) {
    const a = await prisma.alumno.findUnique({ where: { id: b[1] } });
    if (!a) continue;
    const tipo = await prisma.tipoBeca.findUniqueOrThrow({ where: { nombre: b[3] } }), regla = parseRegla(b[4]);
    if (!regla) throw new Error(`Beca ${b[0]}: regla «${b[4]}» no interpretable`);
    const conceptos = (b[0] === '88' ? ['Colegiatura', 'Inscripción'] : ['Colegiatura']).map((nombre, orden) => ({ nombre, orden }));
    const cids = await Promise.all(conceptos.map(async c => ({ conceptoId: (await prisma.conceptoBeca.findUniqueOrThrow({ where: { nombre: c.nombre } })).id, orden: c.orden })));
    await prisma.finBeca.upsert({
      where: { id: b[0] }, update: {},
      create: { id: b[0], cicloId, alumnoId: a.id, est: `${a.nombres} ${a.apellidos}`, grado: b[2], tipoBecaId: tipo.id, modo: regla.modo, valor: regla.valor, conceptos: { create: cids }, exp: b[5], estado: b[6], aprob: b[7] },
    });
  }
  if ((await prisma.finMovimiento.count()) === 0) {
    const prod = async (name: string) => prisma.finProducto.findFirstOrThrow({ where: { name } });
    // La salida VTA-0088 es anterior al registro de líneas de venta: ventaId NULL (la referencia visible se conserva en `ref`).
    await prisma.finMovimiento.create({ data: { t: '08:40', tipo: 'Salida', productoId: (await prod('Libro Matemáticas 5to')).id, name: 'Libro Matemáticas 5to', q: '−2', ref: 'VTA-0088' } });
    await prisma.finMovimiento.create({ data: { t: '09:12', tipo: 'Entrada', productoId: (await prod('Suéter con Escudo')).id, name: 'Suéter con Escudo', q: '+12', ref: 'ENT-0031' } });
  }
}

/** Cartera de la muestra (necesita alumnos, tutores y los servicios que siembra seedPersonas). */
export async function seedFinanzasCartera() {
  const cicloId = await cicloIdActivo();
  const als = new Map((await prisma.alumno.findMany({ select: { id: true, tutorId: true } })).map(a => [a.id, a.tutorId]));
  for (const [i, r] of POS0.entries()) {
    const alumnoId = ALUMNO_DE[r[3]] ?? r[3];
    await prisma.finCobroItem.upsert({
      where: { id: r[0] }, update: {},
      create: { id: r[0], cicloId, con: r[1], al: r[2], alumnoId, tutorId: als.get(alumnoId) ?? null, servicioId: SERVICIO_DE[r[0]] ?? null, vence: r[4], monto: r[5], est: r[6], tipo: r[7], orden: i },
    });
  }
  // Cartera vencida de los otros alumnos en mora (antes DEBT_X del prototipo): 0455 = 11,700, 0472 = 8,500, 0530 = 17,000.
  const MORA: [string, string, [string, string, number, string][]][] = [
    ['0455', 'Luis · 6to A', [['Colegiatura Septiembre 2026', '01/09/2026', 8500, 'col'], ['Plan Comedor · Septiembre', '01/09/2026', 3200, 'com']]],
    ['0472', 'Héctor · 5to A', [['Colegiatura Septiembre 2026', '01/09/2026', 8500, 'col']]],
    ['0530', 'Marcos · 6to B', [['Colegiatura Agosto 2026', '01/08/2026', 8500, 'col'], ['Colegiatura Septiembre 2026', '01/09/2026', 8500, 'col']]],
  ];
  for (const [aid, al, items] of MORA) {
    const tutorId = als.get(aid);
    if (!tutorId) continue;
    for (const [n, [con, vence, monto, tipo]] of items.entries()) {
      await prisma.finCobroItem.upsert({
        where: { id: `mx-${aid}-${n}` }, update: {},
        create: { id: `mx-${aid}-${n}`, cicloId, alumnoId: aid, tutorId, con, al, vence, monto, est: 'Vencida', tipo, orden: 500 + n },
      });
    }
  }
}

/**
 * SOLO DEMO: configuración del cliente de ejemplo (secuencias NCF, certificado e-CF; los ciclos son la tabla Ciclo: seed-ciclos) y datos para que el Centro de Control
 * tenga forma (recaudo de los meses anteriores). Una instalación real (seed-instalacion)
 * no ejecuta nada de esto y el dashboard arranca en ceros. Idempotente: no pisa lo que ya exista.
 */
async function seedDemoConfig() {
  const cfg: Record<string, unknown> = {
    ecf: true,
    ecfInfo: { archivo: 'stodia_colegio.p12', vence: '15/03/2027' },
    finanzas: { matricula: 85000, inscripcion: 15000, itbis: 0.18, recargoMoraPct: 3, descuentoProntoPct: 5, diaCorte: 15 }, // UNICA fuente de la config financiera de la demo (seed-personas ya no la siembra)
  };
  for (const [clave, v] of Object.entries(cfg)) await prisma.sisConfig.upsert({ where: { clave }, update: {}, create: { clave, valor: JSON.stringify(v) } });

  // Secuencias fiscales de la demo (autorizaciones DGII de ejemplo). Mismas cifras que la antigua config: B02 1–1900 con 19 libres («por agotar»), B01 1–500, B04 1–300 y B03 1–300 (notas de débito).
  // `actual` = ULTIMO numero usado. Vencen a ~14 meses de hoy. Una instalacion real (seed-instalacion) no siembra ninguna: se registran en Configuración › Fiscal.
  await asegurarCatalogoFiscal();
  const vence = new Date(Date.now() + 425 * 864e5).toISOString().slice(0, 10);
  for (const [tipo, desde, hasta, actual, umbralPct] of [['B02', 1, 1900, 1881, 10], ['B01', 1, 500, 214, 10], ['B04', 1, 300, 213, 15], ['B03', 1, 300, 0, 15]] as const) {
    await prisma.secuenciaFiscal.upsert({
      where: { id: `SF-DEMO-${tipo}-1` }, update: {},
      create: { id: `SF-DEMO-${tipo}-1`, tipoComprobanteId: tipo, modalidad: 'FISICA', prefijo: 'B', desde, hasta, actual, vence, umbralPct, estado: 'Activa', autorizacion: `DEMO-${tipo}-0001 (autorización de ejemplo)`, creadaPor: 'seed demo' },
    });
  }

  // Recaudo histórico (ventas rápidas; no aparecen en el POS) (efectivo, banco) por mes, de hace 5 meses al actual; el actual completa los 3 recibos de arriba hasta ~RD$ 2.0 M.
  const HIST: [number, number][] = [[0.8e6, 1.2e6], [0.5e6, 0.7e6], [0.25e6, 0.35e6], [1.6e6, 2.5e6], [0.9e6, 1.4e6], [833800, 1135100]];
  const ahora = new Date();
  let k = 0;
  for (const [i, [efe, ban]] of HIST.entries()) {
    const back = HIST.length - 1 - i;
    const base = Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - back, 1, 15, 0, 0);
    const mes = new Date(base).toISOString().slice(0, 7).replace('-', '');
    for (let j = 0; j < 4; j++) {
      const efectivo = j < 2, monto = Math.round((efectivo ? efe : ban) / 2);
      const metodo = efectivo ? 'Efectivo' : j === 2 ? 'Tarjeta de Crédito' : 'Transferencia';
      const createdAt = new Date(Math.min(base + (back === 0 ? j : 9 + j * 4) * 864e5, ahora.getTime() - 6e4));
      await prisma.finVenta.upsert({
        where: { id: `VTA-H${mes}${j + 1}` }, update: {},
        create: { id: `VTA-H${mes}${j + 1}`, ncf: `B02${String(1000 + ++k).padStart(8, '0')}`, total: monto, metodo, metodoPagoId: (await prisma.metodoPago.findUniqueOrThrow({ where: { nombre: metodo } })).id, doc: 'Consumo', createdAt },
      });
    }
  }
}
