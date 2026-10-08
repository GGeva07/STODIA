import { prisma } from './db';
import type { ExpFicha } from '@stodia/shared';

/** Semilla del grupo Personas (Expediente 360 de Juan Mendoza, cupos de Inscripción). Idempotente. */
const JUAN: ExpFicha = {
  carnet: '7 501234 004128', ingreso: 'Agosto 2021 · 1ro A', geo: '18.4925° N, −69.9443° O',
  medico: {
    sangre: 'O+', seguro: 'ARS Humano · Plan Max', poliza: '30-188-442917', condiciones: 'Asma leve · inhalador en enfermería',
    planAlim: 'Suscripción completa · Almuerzo', planAlimExtra: '+ Monedero virtual · límite RD$ 300.00/día',
    emergenciaNombre: 'María Fernández (madre)', emergenciaTel: '809-555-0142',
    alertaDetalle: 'Reacción anafiláctica documentada (maní). Epinefrina autoinyectable en enfermería, gaveta 3.',
  },
  conducta: {
    obs: [
      { icon: 'ph-medal', tone: 'ok', txt: 'Participación destacada en la olimpiada interna de matemáticas.', fecha: '18/09/2026 · Prof. R. Almonte' },
      { icon: 'ph-clock-countdown', tone: 'warn', txt: 'Tardanzas reiteradas (3 en el mes). Notificado a tutor legal.', fecha: '03/05/2026 · Coordinación' },
    ],
    record: 'Excelente (3 ciclos)',
  },
  hist: [
    { c: '2026–2027', g: '5to A', prom: '83.5 *', l: 'B', btn: 'Parcial' },
    { c: '2025–2026', g: '4to A', prom: '89.4', l: 'B', btn: 'Boletín' },
    { c: '2024–2025', g: '3ro A', prom: '91.2', l: 'A', btn: 'Boletín' },
    { c: '2023–2024', g: '2do A', prom: '87.8', l: 'B', btn: 'Boletín' },
  ],
  tutorLegalId: 'ul1',
  contrato: { ciclo: '2026–2027', plan: 'PLN-001', beca: 'none', ctr: 'CTR-2026-0412', firmado: '02/08/2026' },
};

const SERV = [
  { id: 'psv-com', kind: 'rec', catKey: 'com', name: 'Plan Almuerzo Completo', icon: 'ph ph-fork-knife', spec: 'Lunes a Viernes 12:30 PM', cost: 3200, corte: 'Día 01 de cada mes', alert: 'Sin Maní / Lactosa' },
  { id: 'psv-fut', kind: 'rec', catKey: 'fut', name: 'Academia de Fútbol', icon: 'ph ph-soccer-ball', spec: 'Martes y Jueves 3:00 PM · Cancha', cost: 1500, corte: 'Día 15 de cada mes', alert: '' },
  { id: 'pon-lib', kind: 'once', catKey: 'lib', name: 'Paquete de libros de texto · 5to', fecha: '05/08/2026', cost: 9800, st: 'cobrado', recibo: 'REC-0389' },
  { id: 'pon-uni', kind: 'once', catKey: 'uni0', name: 'Uniformes (2 juegos)', fecha: '05/08/2026', cost: 4600, st: 'cobrado', recibo: 'REC-0389' },
  { id: 'pon-seg', kind: 'once', catKey: 'seg', name: 'Seguro estudiantil contra accidentes', fecha: '15/10/2026', cost: 1200, st: 'cargado' },
  { id: 'pon-sal', kind: 'once', catKey: 'sal', name: 'Salida pedagógica · Museo de Historia Natural', fecha: '05/11/2026', cost: 850, st: 'prog', mes: 'Noviembre' },
];

const DOCS = [
  ['Acta de nacimiento', 'acta_nacimiento_jmf.pdf', 'Validado'], ['Registro de vacunación', 'tarjeta_vacunas.pdf', 'Validado'],
  ['Fotos 2×2', 'Sin archivo', 'Pendiente'], ['Récord de conducta anterior', 'record_conducta_2025.pdf', 'En revisión'],
];

/** Tipos de beca/convenio de la demo (Catalogo 'becas'; pct en %, aprobacion = requiere visto bueno del Director Financiero). Una instalación real los crea desde cero. */
const BECAS: [string, string, number, boolean][] = [['hermano', 'Beca Plan Hermano', 10, false], ['academica', 'Beca Académica', 25, true], ['empleado', 'Hijo de Empleado', 50, true]];

export default async function seedPersonas() {
  // Tutor financiero de Juan con la cédula de la demo del wizard + tutor legal (madre).
  await prisma.tutor.updateMany({ where: { nombre: 'Carlos Mendoza Pérez' }, data: { cedula: '001-0023940-1', tel: '809-555-0177', parentesco: 'Padre' } });
  await prisma.tutor.upsert({
    where: { id: 'ul1' }, update: {},
    create: { id: 'ul1', nombre: 'María Fernández de Mendoza', cedula: '002-0118877-2', parentesco: 'Madre', tipo: 'Académico', tel: '809-555-0142', email: 'maria.fernandez@correo.do' },
  });

  const juan = await prisma.alumno.findUnique({ where: { id: '0412' } });
  if (juan) {
    await prisma.persExpediente.upsert({ where: { alumnoId: '0412' }, update: {}, create: { alumnoId: '0412', data: JSON.stringify(JUAN) } });
    for (const [i, d] of DOCS.entries()) {
      await prisma.persDocumento.upsert({ where: { id: `pdoc-0412-${i}` }, update: {}, create: { id: `pdoc-0412-${i}`, alumnoId: '0412', n: d[0], f: d[1], est: d[2], orden: i } });
    }
    for (const s of SERV) {
      await prisma.persServicio.upsert({
        where: { id: s.id }, update: {},
        create: { alumnoId: '0412', est: 'Activo', icon: '', spec: '', corte: '', alert: '', fecha: '', st: '', mes: '', recibo: '', ...s },
      });
    }
  }
  const sofia = await prisma.alumno.findUnique({ where: { id: '0587' } });
  if (sofia) {
    const f: ExpFicha = { ...JUAN, carnet: '', ingreso: 'Agosto 2024 · Pre-primario', geo: '', hist: [], conducta: { obs: [], record: 'Sin observaciones' },
      medico: { sangre: '', seguro: '', poliza: '', condiciones: '', planAlim: '', planAlimExtra: '', emergenciaNombre: 'María Fernández (madre)', emergenciaTel: '809-555-0142', alertaDetalle: '' },
      contrato: { ciclo: '2026–2027', plan: 'PLN-001', beca: 'hermano', ctr: 'CTR-2026-0587', firmado: '02/08/2026' } };
    await prisma.persExpediente.upsert({ where: { alumnoId: '0587' }, update: {}, create: { alumnoId: '0587', data: JSON.stringify(f) } });
  }

  for (const [id, nombre, pct, aprobacion] of BECAS) {
    await prisma.catalogo.upsert({ where: { id: 'becas:' + id }, update: {}, create: { id: 'becas:' + id, tipo: 'becas', estado: 'Activo', data: JSON.stringify({ id, nombre, pct, aprobacion, estado: 'Activo' }) } });
  }
  // Tarifas de transporte del prototipo (Zona A 2,800 / Zona B 3,100): solo si siguen en el valor sembrado por defecto.
  for (const [id, de, a] of [['r1', 2500, 2800], ['r2', 2500, 3100]] as const) {
    const r = await prisma.catalogo.findUnique({ where: { id: 'rutas:' + id } });
    const d = r ? (JSON.parse(r.data) as Record<string, unknown>) : null;
    if (r && d && d.tarifa === de) await prisma.catalogo.update({ where: { id: r.id }, data: { data: JSON.stringify({ ...d, tarifa: a }) } });
  }
  // La config financiera (diaCorte 15, recargo, pronto pago, matrícula…) la siembra únicamente seed-finanzas.
}
