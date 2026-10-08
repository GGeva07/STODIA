import { prisma } from './db';

// Datos del mock del prototipo (POS0, PLANS0, becas, KPROD, recibos, kárdex). Idempotente.
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

const RECIBOS = [
  { id: 'REC-0415', ncf: 'B0200001878', tutor: 'Altagracia Núñez', hora: '08:12', monto: 8500, metodo: 'Efectivo' },
  { id: 'REC-0416', ncf: 'B0200001879', tutor: 'Ramón Espinal', hora: '08:47', monto: 11700, metodo: 'Tarjeta' },
  { id: 'REC-0417', ncf: 'B0200001880', tutor: 'Yolanda Guzmán', hora: '09:20', monto: 3200, metodo: 'Transferencia' },
];

const base = { freq: '1', n: '10', anual: '85000', desc: '0', start: '8', dia: '1', gracia: '5', moraTipo: 'pct', moraVal: '3', pronto: '0', prontoDia: '0', estado: 'Activo' };
const PLANS: [string, number, Record<string, unknown>][] = [
  ['PLN-001', 412, { ...base, porTanda: true, tm: { Matutina: '85000', Vespertina: '72000', Extendida: '98000', Nocturna: '60000' }, name: 'Plan Regular 10 Cuotas', pronto: '5', prontoDia: '3' }],
  ['PLN-002', 58, { ...base, name: 'Pago Único Anual Contado', freq: '0', n: '1', desc: '10', dia: '15', gracia: '0', moraTipo: 'none', moraVal: '0' }],
  ['PLN-003', 96, { ...base, name: 'Plan Trimestral', freq: '3', n: '4' }],
  ['PLN-004', 0, { ...base, name: 'Plan 11 Cuotas (Ago–Jun)', n: '11', moraTipo: 'fijo', moraVal: '25', estado: 'Inactivo' }],
];

const BECAS: [string, string, string, string, string, string, string, string][] = [
  ['91', 'Sofía Mendoza Fernández', '2do B', 'Plan Hermano', '10%', 'EXP-BEC-0091', 'Aprobada', 'C. Vidal · 12/08/2026'],
  ['104', 'Gabriela Núñez Almonte', '5to A', 'Académica', '50%', 'EXP-BEC-0104', 'Pendiente', 'Esperando Director Financiero'],
  ['107', 'Tomás Fernández Gil', '5to A', 'Deportiva', 'RD$ 2,000.00', 'EXP-BEC-0107', 'Pendiente', 'Esperando Director Financiero'],
  ['88', 'Elena Rodríguez Sosa', '5to A', 'Hijo de Empleado', '100%', 'EXP-BEC-0088', 'Aprobada', 'C. Vidal · 05/08/2026'],
];

const KPROD: [string, string, string, string, number, boolean, number | null, string][] = [
  ['p1', '7501001', 'Camisa Polo Escolar', 'Uniformes', 850, true, 40, 'ph ph-t-shirt'], ['p2', '7501002', 'Pantalón Azul Marino', 'Uniformes', 1100, true, 32, 'ph ph-t-shirt'], ['p3', '7501003', 'Suéter con Escudo', 'Uniformes', 1650, true, 3, 'ph ph-t-shirt'],
  ['p4', '7502001', 'Libro Matemáticas 5to', 'Libros', 1450, false, 18, 'ph ph-book-open'], ['p5', '7502002', 'Libro Lengua Española 5to', 'Libros', 1380, false, 22, 'ph ph-book-open'], ['p6', '7502003', 'Reader Inglés 5to', 'Libros', 1200, false, 4, 'ph ph-book-open'],
  ['p7', '7503001', 'Cuaderno 100 hojas', 'Papelería', 95, true, 120, 'ph ph-notebook'], ['p8', '7503002', 'Kit de Geometría', 'Papelería', 230, true, 15, 'ph ph-ruler'],
  ['p9', '7504001', 'Certificación de Estudios', 'Servicios', 500, false, null, 'ph ph-certificate'], ['p10', '7504002', 'Récord de Notas', 'Servicios', 350, false, null, 'ph ph-certificate'],
];

export default async function seedFinanzas() {
  for (const [key, value] of Object.entries({ rec: 418, ncf: 1881, b01: 214, nc: 213, vta: 1, ent: 32, pln: 5 })) {
    await prisma.finCounter.upsert({ where: { key }, update: {}, create: { key, value } });
  }
  for (const [i, r] of POS0.entries()) {
    await prisma.finCobroItem.upsert({
      where: { id: r[0] }, update: {},
      create: { id: r[0], con: r[1], al: r[2], kid: r[3], vence: r[4], monto: r[5], est: r[6], tipo: r[7], orden: i },
    });
  }
  for (const r of RECIBOS) {
    await prisma.finRecibo.upsert({
      where: { id: r.id }, update: {},
      create: { ...r, items: '[]', pays: JSON.stringify([{ m: r.metodo, r: '', amt: r.monto }]) },
    });
  }
  for (const [id, alumnos, data] of PLANS) {
    await prisma.finPlan.upsert({ where: { id }, update: {}, create: { id, name: String(data.name), estado: String(data.estado), alumnos, data: JSON.stringify(data) } });
  }
  for (const b of BECAS) {
    await prisma.finBeca.upsert({
      where: { id: b[0] }, update: {},
      create: { id: b[0], periodo: '2026–2027', est: b[1], grado: b[2], tipo: b[3], regla: b[4], conceptos: b[0] === '88' ? 'Colegiatura · Inscripción' : 'Solo colegiatura', exp: b[5], estado: b[6], aprob: b[7] },
    });
  }
  for (const p of KPROD) {
    await prisma.finProducto.upsert({
      where: { id: p[0] }, update: {},
      create: { id: p[0], code: p[1], name: p[2], cat: p[3], price: p[4], tax: p[5], stock: p[6], icon: p[7] },
    });
  }
  await seedDemoDashboard();
  if ((await prisma.finMovimiento.count()) === 0) {
    await prisma.finMovimiento.create({ data: { t: '08:40', tipo: 'Salida', name: 'Libro Matemáticas 5to', q: '−2', ref: 'VTA-0088' } });
    await prisma.finMovimiento.create({ data: { t: '09:12', tipo: 'Entrada', name: 'Suéter con Escudo', q: '+12', ref: 'ENT-0031' } });
  }
}

/**
 * SOLO DEMO: configuración del cliente de ejemplo (secuencias NCF, certificado e-CF, ciclos) y datos para que el Centro de Control
 * tenga forma (recaudo de los meses anteriores y cartera vencida de los alumnos en mora). Una instalación real (seed-instalacion)
 * no ejecuta nada de esto y el dashboard arranca en ceros. Idempotente: no pisa lo que ya exista.
 */
async function seedDemoDashboard() {
  const cfg: Record<string, unknown> = {
    ncf: [
      { pref: 'B02', tipo: 'Consumo', desde: 1, hasta: 1900, umbral: 10, act: 1881 },
      { pref: 'B01', tipo: 'Crédito fiscal', desde: 1, hasta: 500, umbral: 10, act: 214 },
      { pref: 'B04', tipo: 'Nota de crédito', desde: 1, hasta: 300, umbral: 15, act: 232 },
    ],
    ecf: true,
    ecfInfo: { archivo: 'stodia_colegio.p12', vence: '15/03/2027' },
    ciclos: [{ n: '2025–2026', estado: 'Cerrado' }, { n: '2026–2027', estado: 'Activo' }],
  };
  for (const [clave, v] of Object.entries(cfg)) await prisma.sisConfig.upsert({ where: { clave }, update: {}, create: { clave, valor: JSON.stringify(v) } });

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
      const metodo = efectivo ? 'Efectivo' : j === 2 ? 'Tarjeta' : 'Transferencia';
      const createdAt = new Date(Math.min(base + (back === 0 ? j : 9 + j * 4) * 864e5, ahora.getTime() - 6e4));
      await prisma.finVenta.upsert({
        where: { id: `VTA-H${mes}${j + 1}` }, update: {},
        create: { id: `VTA-H${mes}${j + 1}`, ncf: `B02${String(1000 + ++k).padStart(8, '0')}`, total: monto, metodo, doc: 'Consumo', createdAt },
      });

    }
  }

  // Cartera vencida de los otros alumnos en mora (antes DEBT_X del prototipo): 0455 = 11,700, 0472 = 8,500, 0530 = 17,000.
  const MORA: [string, string, [string, string, number, string][]][] = [
    ['0455', 'Luis · 6to A', [['Colegiatura Septiembre 2026', '01/09/2026', 8500, 'col'], ['Plan Comedor · Septiembre', '01/09/2026', 3200, 'com']]],
    ['0472', 'Héctor · 5to A', [['Colegiatura Septiembre 2026', '01/09/2026', 8500, 'col']]],
    ['0530', 'Marcos · 6to B', [['Colegiatura Agosto 2026', '01/08/2026', 8500, 'col'], ['Colegiatura Septiembre 2026', '01/09/2026', 8500, 'col']]],
  ];
  for (const [aid, al, items] of MORA) {
    const a = await prisma.alumno.findUnique({ where: { id: aid }, include: { tutor: true } });
    if (!a) continue;
    for (const [n, [con, vence, monto, tipo]] of items.entries()) {
      await prisma.finCobroItem.upsert({
        where: { id: `mx-${aid}-${n}` }, update: {},
        create: { id: `mx-${aid}-${n}`, kid: aid, con, al, vence, monto, est: 'Vencida', tipo, orden: 500 + n, ...(a.tutor?.cedula ? { tutorCed: a.tutor.cedula.replace(/\D/g, '') } : {}) },
      });
    }
  }
}
