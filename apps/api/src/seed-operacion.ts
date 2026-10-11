import { prisma } from './db';
import { asegurarCatalogosBase } from './lib/catalogos-tipados';

/** Semilla del grupo Operación (comedor, alimentación, comunicaciones). Idempotente: no pisa datos existentes. */
// comidas / dietas = NOMBRES del catalogo (tablas puente AliPlanComida / AliPlanDieta; antes banderas posicionales).
const ALI0 = [
  { id: 'ALI-001', name: 'Plan Almuerzo Completo', modelo: 'sub', comidas: ['Almuerzo'], precio: 3200, freq: 'Mensual', dias: 'Lunes a Viernes', mora: true, dietas: ['Sin gluten', 'Sin lácteos', 'Sin maní / frutos secos'] },
  { id: 'ALI-002', name: 'Almuerzo + Meriendas', modelo: 'sub', comidas: ['Merienda AM', 'Almuerzo', 'Merienda PM'], precio: 4600, freq: 'Mensual', dias: 'Lunes a Viernes', mora: true, dietas: ['Sin gluten', 'Sin lácteos', 'Sin maní / frutos secos', 'Vegetariano'] },
  { id: 'ALI-003', name: 'Jornada Extendida (Desayuno + Almuerzo)', modelo: 'sub', comidas: ['Desayuno', 'Almuerzo'], precio: 5100, freq: 'Semestral', dias: 'Lunes a Viernes', mora: true, dietas: ['Sin gluten', 'Sin maní / frutos secos'] },
  { id: 'ALI-004', name: 'Monedero Cafetería', modelo: 'wal', comidas: [] as string[], recarga: 500, limite: 300, freq: 'Mensual', dias: 'Lunes a Viernes', mora: false, dietas: [] as string[] },
];
const MENU0 = [
  { dia: 'Lunes', plato: 'Pollo guisado, arroz blanco, habichuelas rojas, ensalada verde', algs: [] },
  { dia: 'Martes', plato: 'Pescado al horno, puré de batata, vegetales salteados', algs: ['Mariscos'] },
  { dia: 'Miércoles', plato: 'Pollo en salsa de maní, moro de guandules, tostones', algs: ['Maní'] },
  { dia: 'Jueves', plato: 'Pasta boloñesa, ensalada, flan de leche', algs: ['Gluten', 'Lactosa', 'Huevo'] },
  { dia: 'Viernes', plato: 'Res guisada, arroz, aguacate, fruta de temporada', algs: [] },
];
// alumnoId = Alumno.id; el carnet usa el code REAL del alumno (EST-2026-<id>). Las alergias del carnet son las del alumno (AlumnoAlergia). aliPlanId = plan de alimentacion vigente.
const CARNETS = [
  { alumnoId: '0412', aliPlanId: 'ALI-001', name: 'Juan Mendoza Fernández', grado: '5to A · Matutina', plan: 'Suscripción completa · Almuerzo', ok: true, allergies: ['Maní', 'Frutos secos', 'Lactosa'], restr: 'Sin lácteos: sustituir el flan del día por fruta. Revisar salsa del pollo (contiene maní).', limit: 300, wallet: 850, spent: 0 },
  { alumnoId: '0398', aliPlanId: 'ALI-001', name: 'Valeria Ortiz Brito', grado: '3ro B · Matutina', plan: 'Suscripción completa · Almuerzo', ok: true, allergies: [], restr: 'Ninguna registrada.', limit: 400, wallet: 1200, spent: 150 },
  { alumnoId: '0455', aliPlanId: null, name: 'Luis Peña Durán', grado: '6to A · Matutina', plan: 'Sin plan activo', ok: false, allergies: [], restr: 'Ninguna registrada.', limit: 200, motivo: 'Almuerzo de octubre no pagado · Referir a caja', wallet: 40, spent: 0 },
  { alumnoId: '0501', aliPlanId: 'ALI-004', name: 'Andrea Quezada Mejía', grado: '1ro A · Extendida', plan: 'Monedero virtual', ok: true, allergies: ['Gluten'], restr: 'Celíaca: menú sin gluten (bandeja verde).', limit: 250, wallet: 610, spent: 220 },
];
const LOG0 = [['12:04:51', 'Juan Mendoza Fernández', 'alert'], ['12:04:32', 'Paula Jiménez Taveras', 'ok'], ['12:04:10', 'Iván Hernández Polanco', 'ok']];
const OUT0: [number, string, string, string, string, string, string][] = [
  [1, '2026-10-06 08:00:12', 'Carlos Mendoza Pérez', 'Correo', 'Aviso de vencimiento de cuota', 'Entregado', 'usr_sistema'], [2, '2026-10-06 08:00:13', 'Carlos Mendoza Pérez', 'SMS', 'Aviso de vencimiento de cuota', 'Entregado', 'usr_sistema'],
  [7, '2026-10-06 08:00:15', 'Carlos Mendoza Pérez', 'WhatsApp', 'Aviso de vencimiento de cuota', 'Entregado', 'usr_sistema'], [3, '2026-10-06 08:00:14', 'Ramón Peña', 'Correo', 'Aviso de vencimiento de cuota', 'Fallido', 'usr_sistema'], [4, '2026-10-05 16:04:02', 'Altagracia Núñez', 'Push', 'Ausencia injustificada de Gabriela', 'Entregado', 'usr_ralmonte'],
  [5, '2026-10-03 10:15:40', 'Yolanda Guzmán', 'Correo', 'Circular: Feria científica', 'Entregado', 'usr_cvidal'], [6, '2026-10-03 10:15:41', 'Félix Taveras', 'Correo', 'Circular: Feria científica', 'Fallido', 'usr_cvidal'],
];

export async function seedOperacion() {
  await asegurarCatalogosBase();
  const porNombre = async (tabla: 'comida' | 'dieta' | 'alergia', nombres: string[]) => Promise.all(nombres.map(async n => {
    const r = await (prisma[tabla] as unknown as { findUnique: (a: { where: { nombre: string } }) => Promise<{ id: string } | null> }).findUnique({ where: { nombre: n } });
    if (!r) throw new Error(`${tabla} «${n}» inexistente en el catalogo`);
    return r.id;
  }));
  for (const { comidas, dietas, ...p } of ALI0) {
    const ex = await prisma.aliPlan.findUnique({ where: { id: p.id } });
    if (ex) continue; // idempotente: no pisa lo que el cliente edito
    await prisma.aliPlan.create({ data: { canal: 'Portal y Caja', saldo: 'Se transfiere', estado: 'Activo', precio: null, recarga: null, limite: null, ...p } });
    await prisma.aliPlanComida.createMany({ data: (await porNombre('comida', comidas)).map(comidaId => ({ planId: p.id, comidaId })) });
    await prisma.aliPlanDieta.createMany({ data: (await porNombre('dieta', dietas)).map(dietaId => ({ planId: p.id, dietaId })) });
  }
  for (const [i, { algs, ...d }] of MENU0.entries()) {
    await prisma.aliMenu.upsert({ where: { orden: i }, update: {}, create: { orden: i, ...d } });
    if (!(await prisma.aliMenuAlergia.count({ where: { menuOrden: i } }))) await prisma.aliMenuAlergia.createMany({ data: (await porNombre('alergia', algs)).map(alergiaId => ({ menuOrden: i, alergiaId })) });
  }
  for (const { allergies: _alergias, wallet, limit, spent, ...c } of CARNETS) {
    const a = await prisma.alumno.findUniqueOrThrow({ where: { id: c.alumnoId } });
    await prisma.comCarnet.upsert({ where: { code: a.code }, update: {}, create: { motivo: '', ...c, code: a.code } });
    // Monedero UNICO del alumno (saldo + limite diario); el consumo de hoy es un movimiento. Si ya existe (p. ej. el de la demo del portal) no se pisa.
    if (!(await prisma.monedero.findUnique({ where: { alumnoId: c.alumnoId } }))) {
      await prisma.monedero.create({ data: { alumnoId: c.alumnoId, saldo: wallet, limite: limit } });
      if (spent > 0) await prisma.monederoMovimiento.create({ data: { alumnoId: c.alumnoId, tipo: 'Consumo', monto: -spent, saldoDespues: wallet, concepto: 'Consumo en comedor' } });
    }
  }
  if ((await prisma.comLectura.count()) === 0) {
    // alumnoId solo cuando el nombre leido es un alumno real (los demas nombres del log de la demo no existen en Alumno).
    const als = new Map((await prisma.alumno.findMany({ select: { id: true, nombres: true, apellidos: true } })).map(a => [`${a.nombres} ${a.apellidos}`, a.id]));
    for (const [t, n, s] of LOG0.reverse()) await prisma.comLectura.create({ data: { t, n, alumnoId: als.get(n) ?? null, s } });
  }
  if ((await prisma.cmnMensaje.count()) === 0) {
    const tutores = new Map((await prisma.tutor.findMany({ select: { id: true, nombre: true } })).map(t => [t.nombre, t.id]));
    const users = new Map((await prisma.user.findMany({ select: { id: true, usuario: true } })).map(u => [u.usuario, u.id]));
    // by = usuario emisor (instantanea); userId solo si ese usuario existe (usr_sistema = avisos automaticos -> NULL).
    for (const [, t, to, canal, asunto, estado, by] of [...OUT0].sort((a, b) => Number(a[0]) - Number(b[0]))) await prisma.cmnMensaje.create({ data: { t, to, tutorId: tutores.get(to) ?? null, canal, asunto, estado, by, userId: users.get(by) ?? null } });
  }
}
