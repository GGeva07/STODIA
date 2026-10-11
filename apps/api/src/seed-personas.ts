import { prisma } from './db';
import type { ExpFicha } from '@stodia/shared';
import { cicloIdActivo } from './lib/ciclo';
import { fkDeCatKey, type FkCatalogo } from './lib/servicios';

/**
 * Semilla del grupo Personas (Expediente 360 de Juan Mendoza). Idempotente.
 * La ficha JSON NO lleva contrato ni tutor legal: son Contrato (FK a FinPlan) y Alumno.tutorLegalId (FK a Tutor).
 */
type FichaJson = Omit<ExpFicha, 'contrato' | 'tutorLegalId' | 'hist'>; // el historial académico sale de Matricula + AcadNota (lib/matricula.historialAcademico)
const JUAN: FichaJson = {
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
};

// reciboId = recibo que cobró el cargo único (FK a FinRecibo; REC-0389 lo siembra seedFinanzasBase).
/** catKey = elemento del catálogo al que apunta (ServicioAlumno: ali:/ext:/prd: -> FK real). */
const SERV: { id: string; kind: string; catKey: string; name: string; icon?: string; spec?: string; cost: number; corte?: string; alert?: string; fecha?: string; st?: string; mes?: string; reciboId?: string }[] = [
  { id: 'psv-com', kind: 'rec', catKey: 'ali:ALI-001', name: 'Plan Almuerzo Completo', icon: 'ph ph-fork-knife', spec: 'Lunes a Viernes 12:30 PM', cost: 3200, corte: 'Día 01 de cada mes', alert: 'Sin Maní / Lactosa' },
  { id: 'psv-fut', kind: 'rec', catKey: 'ext:EXT-001', name: 'Academia de Fútbol', icon: 'ph ph-soccer-ball', spec: 'Martes y Jueves 3:00 PM · Cancha', cost: 1500, corte: 'Día 15 de cada mes', alert: '' },
  { id: 'pon-lib', kind: 'once', catKey: 'prd:p11', name: 'Paquete de libros de texto · 5to', fecha: '05/08/2026', cost: 9800, st: 'cobrado', reciboId: 'REC-0389' },
  { id: 'pon-uni', kind: 'once', catKey: 'prd:p12', name: 'Uniformes (2 juegos)', fecha: '05/08/2026', cost: 4600, st: 'cobrado', reciboId: 'REC-0389' },
  { id: 'pon-seg', kind: 'once', catKey: 'prd:p13', name: 'Seguro estudiantil contra accidentes', fecha: '15/10/2026', cost: 1200, st: 'cargado' },
  { id: 'pon-sal', kind: 'once', catKey: 'prd:p14', name: 'Salida pedagógica · Museo de Historia Natural', fecha: '05/11/2026', cost: 850, st: 'prog', mes: 'Noviembre' },
];

const DOCS = [
  ['Acta de nacimiento', 'acta_nacimiento_jmf.pdf', 'Validado'], ['Registro de vacunación', 'tarjeta_vacunas.pdf', 'Validado'],
  ['Fotos 2×2', 'Sin archivo', 'Pendiente'], ['Récord de conducta anterior', 'record_conducta_2025.pdf', 'En revisión'],
];

// Los tipos de beca de la demo (TipoBeca) y las tarifas de transporte los siembra seed-estructura (son FK de contratos y becas).

export default async function seedPersonas() {
  const cicloId = await cicloIdActivo();
  const ciclo = await prisma.ciclo.findUniqueOrThrow({ where: { id: cicloId } });
  const y0 = ciclo.nombre.slice(0, 4);
  // Tutor financiero de Juan con la cédula de la demo del wizard + tutor legal (madre).
  await prisma.tutor.updateMany({ where: { nombre: 'Carlos Mendoza Pérez' }, data: { cedula: '00100239401', tel: '809-555-0177', parentesco: 'Padre' } });
  await prisma.tutor.upsert({
    where: { id: 'ul1' }, update: {},
    create: { id: 'ul1', nombre: 'María Fernández de Mendoza', cedula: '00201188772', parentesco: 'Madre', tipo: 'Académico', tel: '809-555-0142', email: 'maria.fernandez@correo.do' },
  });
  // Tutor legal de Juan y Sofía = la madre (Alumno.tutorLegalId); el financiero sigue siendo Carlos (Alumno.tutorId).
  await prisma.alumno.updateMany({ where: { id: { in: ['0412', '0587'] } }, data: { tutorLegalId: 'ul1' } });

  const juan = await prisma.alumno.findUnique({ where: { id: '0412' } });
  if (juan) {
    await prisma.persExpediente.upsert({ where: { alumnoId: '0412' }, update: {}, create: { alumnoId: '0412', data: JSON.stringify(JUAN) } });
    await prisma.contrato.upsert({ where: { alumnoId_cicloId: { alumnoId: '0412', cicloId } }, update: {}, create: { id: `ctr-0412-${y0}`, alumnoId: '0412', cicloId, planId: 'PLN-001', tipoBecaId: null, ctr: `CTR-${y0}-0412`, firmado: `02/08/${y0}` } });
    const tipos = new Map((await prisma.tipoDocumento.findMany()).map(t => [t.nombre, t.id]));
    for (const [i, d] of DOCS.entries()) {
      await prisma.persDocumento.upsert({ where: { id: `pdoc-0412-${i}` }, update: {}, create: { id: `pdoc-0412-${i}`, alumnoId: '0412', tipoId: tipos.get(d[0])!, f: d[1], est: d[2], orden: i } });
    }
    for (const { catKey, ...s } of SERV) {
      const fk: FkCatalogo = fkDeCatKey(catKey)!;
      await prisma.servicioAlumno.upsert({
        where: { id: s.id }, update: {},
        create: { alumnoId: '0412', est: 'Activo', icon: '', spec: '', corte: '', alert: '', fecha: '', st: '', mes: '', reciboId: null, ...fk, ...s },
      });
    }
  }
  const sofia = await prisma.alumno.findUnique({ where: { id: '0587' } });
  if (sofia) {
    const f: FichaJson = { ...JUAN, carnet: '', ingreso: 'Agosto 2024 · Pre-primario', geo: '', conducta: { obs: [], record: 'Sin observaciones' },
      medico: { sangre: '', seguro: '', poliza: '', condiciones: '', planAlim: '', planAlimExtra: '', emergenciaNombre: 'María Fernández (madre)', emergenciaTel: '809-555-0142', alertaDetalle: '' } };
    await prisma.persExpediente.upsert({ where: { alumnoId: '0587' }, update: {}, create: { alumnoId: '0587', data: JSON.stringify(f) } });
    await prisma.contrato.upsert({ where: { alumnoId_cicloId: { alumnoId: '0587', cicloId } }, update: {}, create: { id: `ctr-0587-${y0}`, alumnoId: '0587', cicloId, planId: 'PLN-001', tipoBecaId: 'hermano', ctr: `CTR-${y0}-0587`, firmado: `02/08/${y0}` } });
  }

  // La config financiera (diaCorte 15, recargo, pronto pago, matrícula…) la siembra únicamente seed-finanzas.
}
