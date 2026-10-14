import type { InformeMeta, InformeResp } from '@stodia/shared';
import { informeCalificaciones } from './calificaciones';
import { informeCierre } from './cierre';
import type { Filtros } from './comun';
import { informeCxc } from './cxc';
import { informeEmision } from './emision';
import { informeExtraIngresos } from './extra-ingresos';
import { informeExtraRetencion } from './extra-retencion';
import { informeInventario } from './inventario';
import { informeMovimientos } from './movimientos';
import { informeNotas } from './notas';
import { informePlanes } from './planes';
import { informeNeto, informeRecaudacion } from './recaudacion';

/**
 * REGISTRO DE INFORMES (docs/informes-analisis.md §5): cada informe = metadatos (id, título, ScreenId del grupo, descripción, filtros soportados) + función
 * `(filtros) → InformeResp`. Los de `estado: 'preparacion'` no tienen `run`: se listan deshabilitados («En preparación») y NO devuelven datos.
 * Para añadir un informe: crear lib/informes/<x>.ts, registrarlo aquí; la ruta, el permiso por grupo, la paginación y la exportación son comunes.
 */
export interface InformeDef extends InformeMeta { run?: (f: Filtros) => Promise<InformeResp> }

export const INFORMES: InformeDef[] = [
  // ---- Cierre de año ----
  { num: 0, id: 'cierre', grupo: 'inf-cierre', estado: 'listo', titulo: 'Resumen del cierre del año escolar', descripcion: 'Totales contables guardados al cerrar cada año (facturado, cobrado, notas, pendiente, mora) y deuda por alumno al cierre.', filtros: ['ciclo'], run: informeCierre },
  { num: 2, id: 'movimientos', grupo: 'inf-cierre', estado: 'listo', titulo: 'Movimientos del alumnado', descripcion: 'Promovidos, repitentes, retirados, egresados e inactivos por ciclo, con grado y sección de origen, destino, promedio y motivo de retiro; resumen por resultado y por grado.', filtros: ['ciclo', 'grado', 'seccion', 'resultado'], run: informeMovimientos },
  { num: 3, id: 'calificaciones', grupo: 'inf-cierre', estado: 'listo', titulo: 'Calificaciones consolidadas por sección', descripcion: 'Promedio por sección, materia y período, matriz alumno × materia con los finales y rankings (mejores promedios y alumnos bajo la nota mínima). Notas congeladas al cierre o en vivo.', filtros: ['ciclo', 'grado', 'seccion', 'materia', 'periodo'], run: informeCalificaciones },
  // ---- Facturación ----
  { num: 4, id: 'emision', grupo: 'inf-facturacion', estado: 'listo', titulo: 'Emisión total de facturas por concepto', descripcion: 'Comprobantes con NCF (recibos, ventas rápidas e inscripciones) por categoría, mes y tipo de comprobante, con el detalle de cada factura y su cuadre con Recaudación.', filtros: ['ciclo', 'desde', 'hasta', 'comprobante', 'categoria'], run: informeEmision },
  { num: 5, id: 'recaudacion', grupo: 'inf-facturacion', estado: 'listo', titulo: 'Recaudación por método de pago', descripcion: 'Cobrado por método de pago y por mes, detalle por recibo, recibos anulados aparte y ventas rápidas como línea separada.', filtros: ['ciclo', 'desde', 'hasta', 'cajero', 'metodo'], run: informeRecaudacion },
  { num: 6, id: 'neto', grupo: 'inf-facturacion', estado: 'listo', titulo: 'Cobrado neto tras devoluciones', descripcion: 'Cobrado menos devoluciones (notas de crédito) por método de pago y por mes, con la lista de devoluciones.', filtros: ['ciclo', 'desde', 'hasta', 'cajero', 'metodo'], run: informeNeto },
  { num: 7, id: 'notas', grupo: 'inf-facturacion', estado: 'listo', titulo: 'Notas de crédito y débito', descripcion: 'Notas fiscales con NCF, documento de origen, motivo, líneas, monto y estado; resumen por motivo y por tipo.', filtros: ['ciclo', 'desde', 'hasta', 'tipo', 'motivo', 'cajero'], run: informeNotas },
  { num: 8, id: 'fiscal', grupo: 'inf-facturacion', estado: 'preparacion', titulo: 'Consolidado de compras (606) y ventas (607)', descripcion: 'Reporte fiscal anual para auditoría interna del ciclo.', filtros: ['ciclo'] },
  // ---- Estudiantes ----
  { num: 9, id: 'extra-ingresos', grupo: 'inf-estudiantes', estado: 'listo', titulo: 'Extracurriculares: ingresos por disciplina', descripcion: 'Facturado, cobrado y pendiente por disciplina o taller, alumnos inscritos, ingreso por mes y detalle por alumno.', filtros: ['ciclo', 'disciplina'], run: informeExtraIngresos },
  { num: 10, id: 'extra-retencion', grupo: 'inf-estudiantes', estado: 'listo', titulo: 'Extracurriculares: retención y proyección', descripcion: 'Alumnos que continúan en cada disciplina de un ciclo al siguiente, altas, bajas y neto, y una estimación de continuidad basada en la retención histórica.', filtros: ['ciclo', 'disciplina'], run: informeExtraRetencion },
  // ---- Inventario ----
  { num: 12, id: 'inventario-rotacion', grupo: 'inf-inventario', estado: 'listo', titulo: 'Inventario y tienda: rotación y recaudado', descripcion: 'Rotación de stock, alta y baja demanda, productos sin movimiento, total recaudado en uniformes, libros y papelería/útiles, stock actual y valor del inventario.', filtros: ['ciclo', 'desde', 'hasta', 'categoria'], run: informeInventario },
  // ---- CxC ----
  { num: 1, id: 'cxc', grupo: 'inf-cxc', estado: 'listo', titulo: 'Cuentas por cobrar', descripcion: 'Saldo pendiente por estudiante, por tutor y por antigüedad (por vencer, 1–30, 31–60, 61–90 y +90 días), con el detalle de los cargos.', filtros: ['ciclo', 'grado', 'seccion', 'tutor', 'soloVencidos'], run: informeCxc },
  { num: 11, id: 'planes', grupo: 'inf-cxc', estado: 'listo', titulo: 'Planes de pago: facturado vs cobrado', descripcion: 'Alumnos, facturado, cobrado, pendiente y % de cobranza por plan de pago del contrato, con detalle por alumno.', filtros: ['ciclo', 'plan'], run: informePlanes },
];

export const informePorId = (id: string) => INFORMES.find(i => i.id === id);
/** Metadatos sin la función (lo que viaja al cliente). */
export const meta = ({ run: _r, ...m }: InformeDef): InformeMeta => m;
