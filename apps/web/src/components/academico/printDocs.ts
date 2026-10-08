import { B, type PDoc } from '../finanzas/print';

/**
 * Documentos imprimibles del grupo académico (sábana, boletines, lista de contingencia, auditoría).
 * Réplica de docSabana / docBoletines / docLista / docAudit del prototipo (misma estructura de bloques,
 * columnas, anchos, firmas y textos); los datos salen de la API y la institución, del perfil (print.tsx).
 */
const CARTA = 'Carta 8.5 × 11 in';

export interface NotaFila { nombre: string; g: string[]; prom: number | null; fin: number | null; L: string; base: number | null }

const f1 = (v: number | null) => (v != null ? v.toFixed(1) : '—');

/** docSabana: tabla #, Estudiante, competencias, Prom, Final, Letra + promedio de sección y aprobados. */
export function docSabana(m: { materia: string; seccion: string; nivel: string; periodoLabel: string; minimo: number; comps: { k: string }[] }, rows: NotaFila[]): PDoc {
  const bases = rows.map(r => r.base).filter((v): v is number => v != null);
  const n = m.comps.length;
  return {
    kind: 'carta', name: `Sábana del grado · ${m.seccion}`, format: CARTA, sign: ['Docente', 'Dirección académica'],
    pages: [{
      title: 'Sábana de calificaciones', sub: `${m.materia} · ${m.seccion} · ${m.nivel} · ${m.periodoLabel}`,
      blocks: [
        B.table(['#', 'Estudiante', ...m.comps.map(c => c.k), 'Prom', 'Final', 'Letra'],
          rows.map((r, i) => [String(i + 1), r.nombre, ...r.g.map(v => v || '—'), f1(r.prom), f1(r.fin), r.L]),
          ['22px', '1fr', ...Array(n).fill('30px'), '40px', '42px', '34px'], ['left', 'left', ...Array(n).fill('right'), 'right', 'right', 'center']),
        B.total([['Promedio de sección', bases.length ? (bases.reduce((a, b) => a + b, 0) / bases.length).toFixed(1) : '—', true], [`Aprobados (≥ ${m.minimo})`, bases.filter(v => v >= m.minimo).length + ' / ' + rows.length]]),
      ],
    }],
  };
}

/** docBoletines: una página por estudiante de la sección. */
export function docBoletines(m: { materia: string; seccion: string; tanda?: string; periodoLabel: string; docente: string; comps: { k: string; n: string }[] }, rows: NotaFila[]): PDoc {
  const cc = m.comps.filter(c => c.k !== 'EX');
  const rango = cc.length > 1 ? `${cc[0].k}–${cc[cc.length - 1].k}` : cc[0]?.k ?? '';
  return {
    kind: 'carta', name: `Boletines individuales · ${m.seccion}`, format: CARTA, sign: ['Docente', 'Firma del tutor'],
    pages: rows.map(r => ({
      title: 'Boletín de calificaciones', sub: `${m.materia} · ${m.seccion} · ${m.periodoLabel}`,
      blocks: [
        B.kv([['Estudiante', r.nombre], ['Sección', m.seccion + (m.tanda ? ' · ' + m.tanda : '')], ['Docente', m.docente]]),
        B.table(['Competencia', 'Nombre', 'Nota'], m.comps.map((k, j) => [k.k, k.n, r.g[j] || '—']), ['60px', '1fr', '70px'], ['left', 'left', 'right']),
        B.total([[`Promedio ${rango}`, f1(r.prom)], ['Nota final', r.fin != null ? f1(r.fin) : 'Pendiente de examen', true], ['Calificación', r.L]]),
      ],
    })),
  };
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** «5 al 9 de octubre de 2026» (lunes a viernes de la semana de `iso`). */
export function semanaTxt(iso: string) {
  const d = new Date(iso + 'T12:00:00'), dow = d.getDay() || 7;
  const lun = new Date(d); lun.setDate(d.getDate() - dow + 1);
  const vie = new Date(lun); vie.setDate(lun.getDate() + 4);
  if (lun.getMonth() === vie.getMonth()) return `${lun.getDate()} al ${vie.getDate()} de ${MESES[vie.getMonth()]} de ${vie.getFullYear()}`;
  return `${lun.getDate()} de ${MESES[lun.getMonth()]} al ${vie.getDate()} de ${MESES[vie.getMonth()]} de ${vie.getFullYear()}`;
}

/** docLista: lista de asistencia de contingencia (semana, casillas en blanco). */
export function docLista(d: { seccion: string; tanda?: string | null; fecha: string }, nombres: string[]): PDoc {
  return {
    kind: 'carta', name: 'Lista de asistencia de contingencia', format: CARTA, sign: ['Docente', 'Coordinación'],
    pages: [{
      title: 'Lista de asistencia', sub: `${d.seccion.replace('-', ' ')}${d.tanda ? ' · ' + d.tanda : ''} · Semana del ${semanaTxt(d.fecha)}`,
      blocks: [
        B.table(['#', 'Estudiante', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie'], nombres.map((n, i) => [String(i + 1), n, '☐', '☐', '☐', '☐', '☐']),
          ['24px', '1fr', '44px', '44px', '44px', '44px', '44px'], ['left', 'left', 'center', 'center', 'center', 'center', 'center']),
        B.text('Marcar: P presente · T tardanza · AJ ausencia justificada · AI ausencia injustificada.'),
      ],
    }],
  };
}

/** docAudit: primeras 60 filas del registro filtrado. */
export function docAudit(rows: { t: string; usr: string; a: string; tabla: string; registro: string; prev: string; next: string }[]): PDoc {
  return {
    kind: 'carta', name: 'Auditoría global', format: CARTA, sign: ['Auditoría interna', 'Dirección'],
    pages: [{
      title: 'Registro de auditoría', sub: `${rows.length} eventos · Hora UTC · Documento de solo lectura`,
      blocks: [B.table(['Fecha UTC', 'Usuario', 'Acción', 'Tabla', 'Registro', 'Anterior → Nuevo'],
        rows.slice(0, 60).map(l => [l.t, l.usr, l.a, l.tabla, l.registro, l.prev + ' → ' + l.next]),
        ['112px', '88px', '48px', '84px', '88px', '1fr'], ['left', 'left', 'left', 'left', 'left', 'left'])],
    }],
  };
}
