import type { InformeCelda, InformeCierreFila, InformeResp } from '@stodia/shared';
import { prisma } from '../../db';
import { resumenCierre } from '../ciclo-cierre';
import { CicloError } from '../ciclo';
import { round2 } from '../cxc';
import { col, fechaDMY, hoy as hoyDMY, paginar, type Filtros } from './comun';

/**
 * Informes de cierre de año (inf-cierre): lista de ciclos Cerrados y RESUMEN guardado de cada cierre (CierreCiclo: totales + deuda por alumno al cerrar).
 * Los totales y deudores son los mismos que mostraba Configuración › Ciclos lectivos (lib/ciclo-cierre.resumenCierre). Un ciclo cerrado antes de existir el
 * registro de cierres se calcula al abrirlo. ETAPA 2: el detalle por cifra vive en cierre-detalle.ts (GET /informes/cierre/:ciclo); este informe genérico devuelve tablas
 * y resumen por separado para ampliarse sin cambiar el contrato.
 */
export async function listaCierres(tz: string): Promise<InformeCierreFila[]> {
  const cs = await prisma.ciclo.findMany({ where: { estado: 'Cerrado' }, orderBy: [{ fechaInicio: 'desc' }], include: { cierre: true } });
  return cs.map(c => ({
    ciclo: c.nombre, estado: c.estado, fecha: c.cierre ? fechaDMY(c.cierre.fecha, tz) : null, usuario: c.cierre ? c.cierre.usuarioNombre || c.cierre.usuario : null,
    facturado: c.cierre?.facturado ?? null, cobrado: c.cierre?.cobrado ?? null, pendiente: c.cierre?.pendiente ?? null,
  }));
}

export async function informeCierre(f: Filtros): Promise<InformeResp> {
  if (f.ciclo.estado !== 'Cerrado') throw new CicloError(`El ciclo ${f.ciclo.nombre} no está cerrado: el informe de cierre solo existe para ciclos cerrados.`, 409);
  const r = await resumenCierre(f.ciclo.nombre, 1_000_000);
  const pd = paginar(f, 'deudores', r.deudaAlumnos);
  const filas = pd.filas.map(d => [d.code, d.nombre, d.seccion, d.cargos, round2(d.pendiente), round2(d.vencido)] as InformeCelda[]);
  const totPend = round2(r.deudaAlumnos.reduce((a, d) => a + d.pendiente, 0)), totVenc = round2(r.deudaAlumnos.reduce((a, d) => a + d.vencido, 0));
  return {
    id: 'cierre', titulo: `Cierre del año escolar ${f.ciclo.nombre}`, grupo: 'inf-cierre', ciclo: f.ciclo.nombre, generado: hoyDMY(f.tz),
    filtros: [{ etiqueta: 'Ciclo', valor: f.ciclo.nombre }, ...(r.cerrado ? [{ etiqueta: 'Cerrado el', valor: `${fechaDMY(new Date(r.cerrado.fecha), f.tz)} por ${r.cerrado.usuarioNombre || r.cerrado.usuario}` }] : [])],
    resumen: [
      { id: 'facturado', etiqueta: 'Facturado (cargos del ciclo)', valor: r.facturado, tipo: 'moneda' },
      { id: 'cobrado', etiqueta: 'Cobrado (recibos del ciclo)', valor: r.cobrado, tipo: 'moneda', tono: 'ok' },
      { id: 'nc', etiqueta: 'Notas de crédito', valor: r.notasCredito, tipo: 'moneda' },
      { id: 'nd', etiqueta: 'Notas de débito', valor: r.notasDebito, tipo: 'moneda' },
      { id: 'neto', etiqueta: 'Cobrado neto', valor: r.cobradoNeto, tipo: 'moneda', tono: 'ok' },
      { id: 'desc', etiqueta: 'Descuentos aplicados', valor: r.descuentos, tipo: 'moneda' },
      { id: 'pend', etiqueta: 'Pendiente por cobrar', valor: r.pendiente, tipo: 'moneda', tono: 'warn' },
      { id: 'venc', etiqueta: 'De ello vencido', valor: r.vencido, tipo: 'moneda', tono: 'bad' },
      { id: 'mora', etiqueta: 'Recargos por mora', valor: r.mora, tipo: 'moneda' },
      { id: 'morap', etiqueta: 'Mora pendiente', valor: r.moraPendiente, tipo: 'moneda' },
      { id: 'recibos', etiqueta: `Recibos${r.recibosAnulados ? ` (+${r.recibosAnulados} anulados)` : ''}`, valor: r.recibos, tipo: 'entero' },
      { id: 'cargos', etiqueta: 'Cargos / sin pagar', valor: `${r.cargos} / ${r.cargosPendientes}`, tipo: 'texto' },
      { id: 'deudores', etiqueta: 'Alumnos con deuda', valor: r.alumnosConDeuda, tipo: 'entero', tono: r.alumnosConDeuda ? 'warn' : undefined },
      { id: 'matriculas', etiqueta: 'Matrículas en el ciclo', valor: r.matriculas, tipo: 'entero' },
    ],
    tablas: [{
      id: 'deudores', titulo: 'Deuda por alumno al cierre', paginable: true,
      columnas: [col('code', 'Código'), col('alumno', 'Alumno'), col('seccion', 'Grado / sección'), col('cargos', 'Cargos', 'entero'), col('pend', 'Pendiente', 'moneda'), col('venc', 'Vencido', 'moneda')],
      filas, total: pd.total, page: pd.page, size: pd.size, totales: ['', 'TOTAL', '', r.deudaAlumnos.reduce((a, d) => a + d.cargos, 0), totPend, totVenc],
      vacio: 'Ningún alumno tenía deuda al cerrar el ciclo.',
    }],
    notas: [
      r.cerrado
        ? 'Foto contable guardada al cerrar el año escolar (solo lectura): los importes no cambian aunque después se cobre la deuda.'
        : 'Ciclo cerrado antes de existir el registro de cierres: los totales se calculan ahora con los datos del ciclo (solo lectura).',
      'Definiciones: facturado = cobrado de cargos del ciclo + pendiente; cobrado = recibos vigentes emitidos en el ciclo; cobrado neto = cobrado − notas de crédito sobre esos recibos. La deuda pendiente sigue cobrable desde el ciclo activo.',
      'El detalle por cifra (facturado, cobrado, notas, descuentos, pendiente) está en GET /informes/cierre/:ciclo (Etapa 2: tabla CierreCicloDetalle).',
    ],
  };
}
