import { B, hoyDMY, type PDoc } from '../finanzas/print';
import { fmt, fmtDoc } from '../finanzas/fin';
import { perfilSync, ciudadTxt } from '../finanzas/perfil';

/**
 * Documento oficial «Contrato de servicios educativos e inscripción». Un solo generador para el cierre de la Inscripción (al emitir) y para
 * Expediente › Servicios y Contrato (reimpresión). Los datos entran ya resueltos (ver ContratoDatos); lo que falte simplemente no se imprime.
 */
const CARTA = 'Carta 8.5 × 11 in';

export interface ContratoTutorD { nombre: string; cedula: string; parentesco?: string; tel?: string; email?: string; rnc?: string; dir?: string }
export interface ContratoDatos {
  ciclo: string; ctr?: string; fecha?: string;
  alumno: { nombre: string; code: string; fnac: string; grado: string; sec: string; tanda: string; docs?: { n: string; ok: boolean }[]; dir?: string };
  legal: ContratoTutorD;
  /** null = el tutor financiero es el mismo que el legal. */
  financiero: ContratoTutorD | null;
  plan: { name: string; n: number; freq: number; desc: number; dia: number; gracia: number; mora: string; pronto?: number; prontoDias?: number; total?: number };
  calendario: { con: string; vence: string; monto: number; enFactura?: boolean }[];
  servicios: { n: string; price: number }[];
  /** Solo al inscribir: factura inicial emitida. */
  pago?: { inscripcion: number; inscripcionOrigen?: string; materiales?: number; beca?: string; factura: number; ncf?: string; recibo?: string; metodo?: string };
}

const dmy = (v: string) => (/^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10).split('-').reverse().join('/') : v);
export const edadDe = (fnac: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fnac) ?? /^(\d{2})\/(\d{2})\/(\d{4})/.exec(fnac);
  if (!m) return null;
  const [y, mo, d] = /^\d{4}/.test(fnac) ? [+m[1], +m[2], +m[3]] : [+m[3], +m[2], +m[1]];
  const n = new Date();
  let a = n.getFullYear() - y;
  if (n.getMonth() + 1 < mo || (n.getMonth() + 1 === mo && n.getDate() < d)) a--;
  return a >= 0 ? a : null;
};
const freqTxt = (f: number, n: number) => (n === 1 || f === 0 ? 'Pago único' : ({ 1: 'Mensual', 2: 'Bimestral', 3: 'Trimestral', 4: 'Cuatrimestral', 6: 'Semestral' } as Record<number, string>)[f] ?? `Cada ${f} meses`);
const mayus = (s: string) => s.toUpperCase();

/** Párrafo de apertura del contrato (el mismo que muestra el paso «Cierre y factura»). */
export function introContrato(d: { colegio: string; rnc: string; tutor: string; alumno: string; curso: string; plan: string; mora?: string; gracia?: number }) {
  return `Entre ${d.colegio} (RNC ${d.rnc}) y ${d.tutor || '—'}, en calidad de tutor financiero de ${d.alumno}, inscrito en ${d.curso}, bajo el plan ${d.plan || '—'}.${d.mora ? ` Las cuotas vencidas generan recargo ${d.mora}${d.gracia ? ` tras ${d.gracia} días de gracia` : ''}.` : ''}`;
}
/** Cláusulas vigentes del contrato (mismo texto que usaba la impresión desde Expediente). */
export function clausulasContrato(p: { dia: number; freq: number; gracia: number; mora: string }) {
  return `PRIMERO: EL TUTOR se obliga a pagar las cuotas el día ${p.dia} de ${p.freq === 1 ? 'cada mes' : 'cada vencimiento'}. SEGUNDO: ${p.mora ? `transcurridos ${p.gracia} días de gracia, las cuotas vencidas generan un recargo ${p.mora}` : 'las cuotas vencidas no generan recargo por mora'}. TERCERO: la inscripción no es reembolsable. CUARTO: EL TUTOR declara conocer el reglamento interno y autoriza el uso de los datos del estudiante para fines académicos y administrativos conforme a la ley.`;
}

const kvTutor = (t: ContratoTutorD, rol: string, resp: string): [string, string][] => [
  [rol, mayus(t.nombre)], ['Cédula / documento', t.cedula ? fmtDoc(t.cedula) : '—'], ['Responsabilidad', t.parentesco ? `${t.parentesco} · ${resp}` : resp],
  ['Teléfono', t.tel || '—'], ['Correo electrónico', t.email || '—'], ['Dirección', t.dir || 'No registrada'],
  ...(t.rnc ? [['RNC (factura con crédito fiscal)', fmtDoc(t.rnc)] as [string, string]] : []),
];

export function docContratoInscripcion(d: ContratoDatos): PDoc {
  const perfil = perfilSync();
  const colegio = (perfil?.nombre ?? '').toUpperCase(), rnc = perfil?.rnc ?? '', ciudad = ciudadTxt(perfil);
  const fecha = d.fecha ? dmy(d.fecha) : hoyDMY();
  const a = d.alumno, p = d.plan, fin = d.financiero ?? d.legal, mismo = !d.financiero;
  const edad = edadDe(a.fnac);
  const nombreAl = mayus(a.nombre);
  const curso = `${a.grado} ${a.sec}`.trim();
  const recibidos = (a.docs ?? []).filter(x => x.ok).map(x => x.n), pend = (a.docs ?? []).filter(x => !x.ok).map(x => x.n);
  const cuotasTot = d.calendario.reduce((t, c) => t + c.monto, 0);
  const unico = p.n === 1 || p.freq === 0;
  const blocks = [
    B.text(introContrato({ colegio, rnc, tutor: `${mayus(fin.nombre)}${fin.cedula ? `, cédula ${fmtDoc(fin.cedula)}` : ''}`, alumno: nombreAl, curso: `${curso}, tanda ${a.tanda.toLowerCase()}`, plan: p.name, mora: p.mora, gracia: p.gracia })),

    B.text('1. Datos del estudiante', true),
    B.kv([['Nombre completo', nombreAl], ['Código / matrícula', a.code], ['Fecha de nacimiento', dmy(a.fnac) + (edad != null ? ` (${edad} años)` : '')], ['Grado y sección', curso || '—'], ['Tanda', a.tanda || '—'], ['Ciclo lectivo', d.ciclo || '—'],
      ...(recibidos.length || pend.length ? [['Documentos recibidos', recibidos.join(' · ') || 'Ninguno'] as [string, string], ['Documentos pendientes', pend.join(' · ') || 'Ninguno'] as [string, string]] : [])]),

    B.text('2. Tutores', true),
    B.kv(kvTutor(d.legal, 'Tutor legal', mismo ? 'legal, financiero y académico' : 'legal y académico')),
    ...(mismo ? [B.text('El tutor legal es también el tutor financiero (titular del contrato y de las facturas).')] : [B.kv(kvTutor(d.financiero!, 'Tutor financiero', 'titular del contrato y de las facturas (NCF a su nombre)'))]),

    B.text('3. Plan de pago contratado', true),
    B.kv([['Plan', p.name], ['Frecuencia', freqTxt(p.freq, p.n)], ['Número de cuotas', String(p.n)], ...(d.calendario.length && p.n > 0 ? [['Monto por cuota', fmt(d.calendario[0].monto)] as [string, string]] : []),
      ...(p.total != null ? [['Total del plan', fmt(p.total)] as [string, string]] : []), ['Descuento del plan', p.desc > 0 ? `${p.desc}%` : 'Ninguno'], ['Día de vencimiento', `Día ${p.dia}${p.freq === 1 ? ' de cada mes' : ''}`],
      ['Recargo por mora', p.mora ? `${p.mora}${p.gracia ? ` · ${p.gracia} día${p.gracia === 1 ? '' : 's'} de gracia` : ''}` : 'No aplica'],
      ['Pronto pago', (p.pronto ?? 0) > 0 && (p.prontoDias ?? 0) > 0 ? `${p.pronto}% de descuento si se paga con ${p.prontoDias} día${p.prontoDias === 1 ? '' : 's'} o más de anticipación` : 'No aplica']]),
    ...(d.calendario.length ? [
      B.text('Calendario de cuotas', true),
      B.table(['#', 'Concepto', 'Vence', 'Monto'], d.calendario.map((c, i) => [String(i + 1), c.con + (c.enFactura ? ' (incluida en la factura inicial)' : ''), c.vence, fmt(c.monto)]), ['26px', '1fr', '84px', '100px'], ['left', 'left', 'left', 'right']),
      B.total([['Total del calendario', fmt(cuotasTot), true]]),
    ] : []),

    B.text('4. Servicios recurrentes contratados', true),
    ...(d.servicios.length
      ? [B.table(['Servicio', 'Monto mensual'], d.servicios.map(s => [s.n, fmt(s.price)]), ['1fr', '120px'], ['left', 'right']), B.total([['Total mensual de servicios', fmt(d.servicios.reduce((t, s) => t + s.price, 0)), true]])]
      : [B.text('Ninguno')]),

    ...(d.pago ? [
      B.text('5. Información de pago', true),
      B.kv([['Cuota de inscripción', fmt(d.pago.inscripcion) + (d.pago.inscripcionOrigen ? ` (${d.pago.inscripcionOrigen})` : '')],
        ...(d.pago.materiales ? [['Cuota de materiales (cargo aparte)', fmt(d.pago.materiales)] as [string, string]] : []),
        ...(d.pago.beca ? [['Beca / convenio solicitado', `${d.pago.beca} · Pendiente de aprobación (no descuenta hasta aprobarse)`] as [string, string]] : []),
        ...(d.pago.ncf ? [['Comprobante fiscal (NCF / e-NCF)', d.pago.ncf] as [string, string]] : []),
        ...(d.pago.recibo ? [['Recibo', d.pago.recibo] as [string, string]] : []),
        ['Método de pago', d.pago.metodo ?? 'Por definir en caja']]),
      B.total([['TOTAL FACTURA INICIAL', fmt(d.pago.factura), true]]),
      ...(unico ? [] : [B.text('El saldo de las cuotas del plan se factura en cada vencimiento según el calendario anterior.')]),
    ] : []),

    B.text(d.pago ? '6. Cláusulas del contrato' : '5. Cláusulas del contrato', true),
    B.text(clausulasContrato(p)),
    B.text(`Dado en ${ciudad || '____________'}, a ${fecha}.`),
  ];
  const sign = [`Tutor legal: ${mayus(d.legal.nombre)}${d.legal.cedula ? ` · Céd. ${fmtDoc(d.legal.cedula)}` : ''}`,
    ...(mismo ? [] : [`Tutor financiero: ${mayus(fin.nombre)}${fin.cedula ? ` · Céd. ${fmtDoc(fin.cedula)}` : ''}`]), 'Dirección del colegio'];
  return {
    kind: 'carta', name: `Contrato de servicios educativos e inscripción · ${a.nombre}`, format: CARTA, sign, file: `contrato_inscripcion_${a.code}.pdf`, folioTipo: 'CON',
    pages: [{ title: 'Contrato de servicios educativos e inscripción', sub: `Ciclo lectivo ${d.ciclo}${d.ctr ? ` · ${d.ctr}` : ''} · ${a.code} · ${fecha}`, blocks }],
  };
}
