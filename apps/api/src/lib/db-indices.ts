import { prisma } from '../db';
import { asegurarCatalogosBase, asegurarNiveles } from './catalogos-tipados';
import { asegurarCicloActivo } from './ciclo';
import { asegurarCatalogoFiscal } from './fiscal';
import { asegurarMotivosNota } from './notas-motivos';

/**
 * Restricciones que Prisma no modela, creadas de forma idempotente al arrancar la API, en los seeds, en la migracion de datos y en scripts/fk-reparar.ts.
 *
 * 1) Indices unicos FILTRADOS (unicidad solo sobre filas que cumplen `donde`). En SQL Server un UNIQUE normal sobre una columna NULLable admite UN solo NULL,
 *    asi que las columnas opcionales que deben ser unicas no llevan @unique en el schema y la unicidad se garantiza aqui.
 *  - AcadRoster.alumnoId: un Alumno tiene a lo sumo una nomina enlazada.
 *  - Tutor.userId / Docente.userId / Empleado.userId: una cuenta de login pertenece a lo sumo a un tutor, un docente y un empleado
 *    (la API ademas impide que sea de dos tipos a la vez).
 *  - Docente.usuario / Empleado.usuario: usuario PROPUESTO (aun sin cuenta) unico dentro de su tabla.
 *  - Ciclo(estado) donde estado = 'Activo': UN solo ciclo activo.
 *  - TutorAlumno(alumnoId) donde rol = 'Financiero' y hasta IS NULL: UN solo tutor financiero VIGENTE por alumno (idem Legal).
 *
 * 2) CHECK de dominio / de "exactamente una FK" (SQL Server: ALTER TABLE ... CHECK; SQLite no admite ADD CONSTRAINT: se emulan con triggers que abortan).
 */
export const INDICES_FILTRADOS: { nombre: string; tabla: string; columna: string; donde?: string }[] = [
  { nombre: 'UX_AcadRoster_alumnoId', tabla: 'AcadRoster', columna: 'alumnoId' },
  { nombre: 'UX_Tutor_userId', tabla: 'Tutor', columna: 'userId' },
  { nombre: 'UX_Docente_userId', tabla: 'Docente', columna: 'userId' },
  { nombre: 'UX_Empleado_userId', tabla: 'Empleado', columna: 'userId' },
  { nombre: 'UX_Docente_usuario', tabla: 'Docente', columna: 'usuario' },
  { nombre: 'UX_Empleado_usuario', tabla: 'Empleado', columna: 'usuario' },
  { nombre: 'UX_Ciclo_activo', tabla: 'Ciclo', columna: 'estado', donde: "estado = 'Activo'" },
  { nombre: 'UX_TutorAlumno_financiero', tabla: 'TutorAlumno', columna: 'alumnoId', donde: "rol = 'Financiero' AND hasta IS NULL" },
  { nombre: 'UX_TutorAlumno_legal', tabla: 'TutorAlumno', columna: 'alumnoId', donde: "rol = 'Legal' AND hasta IS NULL" },
];

const una = (...cols: string[]) => `(${cols.map(c => `(CASE WHEN ${c} IS NULL THEN 0 ELSE 1 END)`).join(' + ')}) = 1`;
/** `expr` es SQL portable que referencia las columnas sin prefijo (en SQLite se evalua sobre NEW.*). */
/** `marca`: texto que la definicion VIGENTE del CHECK debe contener; si una base ya tiene la version anterior (sin la marca) se reemplaza (DROP + ADD) de forma idempotente. */
export const CHECKS: { nombre: string; tabla: string; columnas: string[]; expr: string; msg: string; marca?: string }[] = [
  { nombre: 'CK_ServicioAlumno_catalogo', tabla: 'ServicioAlumno', columnas: ['rutaId', 'aliPlanId', 'extraId', 'productoId'], expr: una('rutaId', 'aliPlanId', 'extraId', 'productoId'), msg: 'Un servicio del alumno referencia exactamente UN elemento del catalogo (ruta, plan de alimentacion, actividad o producto)' },
  { nombre: 'CK_Ciclo_estado', tabla: 'Ciclo', columnas: ['estado'], expr: "estado IN ('Planificado', 'Activo', 'Cerrado')", msg: 'Estado de ciclo invalido' },
  { nombre: 'CK_Ciclo_fechas', tabla: 'Ciclo', columnas: ['fechaInicio', 'fechaFin'], expr: 'fechaFin > fechaInicio', msg: 'La fecha fin del ciclo debe ser posterior al inicio' },
  { nombre: 'CK_Matricula_estado', tabla: 'Matricula', columnas: ['estado'], expr: "estado IN ('Activo', 'Retirado', 'Promovido', 'Repitente', 'Graduado', 'Reservado', 'Liberada')", msg: 'Estado de matricula invalido', marca: 'Liberada' },
  { nombre: 'CK_TutorAlumno_rol', tabla: 'TutorAlumno', columnas: ['rol'], expr: "rol IN ('Financiero', 'Legal', 'Academico')", msg: 'Rol de tutor invalido' },
  { nombre: 'CK_TutorAlumno_vigencia', tabla: 'TutorAlumno', columnas: ['desde', 'hasta'], expr: 'hasta IS NULL OR hasta >= desde', msg: 'La vigencia del vinculo termina antes de empezar' },
  { nombre: 'CK_MonederoMovimiento_tipo', tabla: 'MonederoMovimiento', columnas: ['tipo'], expr: "tipo IN ('Recarga', 'Consumo', 'Ajuste')", msg: 'Tipo de movimiento invalido' },
  { nombre: 'CK_NotaFiscal_documento', tabla: 'NotaFiscal', columnas: ['reciboId', 'ventaId'], expr: una('reciboId', 'ventaId'), msg: 'Una nota afecta exactamente UN comprobante: un recibo o una venta del kiosko' },
  { nombre: 'CK_NotaFiscal_clase', tabla: 'NotaFiscal', columnas: ['clase', 'monto'], expr: "clase IN ('CREDITO', 'DEBITO') AND monto > 0", msg: 'Clase de nota invalida o monto no positivo' },
  { nombre: 'CK_NotaFiscalLinea_efecto', tabla: 'NotaFiscalLinea', columnas: ['efecto'], expr: "efecto IN ('ReabreCargo', 'Devolucion', 'Ajuste', 'NuevoCargo')", msg: 'Efecto de linea de nota invalido' },
  { nombre: 'CK_NotaFiscalReembolso_monto', tabla: 'NotaFiscalReembolso', columnas: ['monto'], expr: 'monto > 0', msg: 'El reembolso debe ser mayor que cero' },
  { nombre: 'CK_CierreCicloDetalle_tipo', tabla: 'CierreCicloDetalle', columnas: ['tipo'], expr: "tipo IN ('cargo', 'recibo', 'nota', 'descuento', 'venta')", msg: 'Tipo de detalle de cierre invalido' },
  { nombre: 'CK_MatriculaResultado_resultado', tabla: 'MatriculaResultado', columnas: ['resultado'], expr: "resultado IN ('Aprobado', 'Reprobado', 'Pendiente', 'Graduado', 'Retirado')", msg: 'Resultado de matricula invalido' },
  { nombre: 'CK_MatriculaResultado_fuente', tabla: 'MatriculaResultado', columnas: ['fuente'], expr: "fuente IN ('promocion', 'cierre')", msg: 'Fuente de resultado invalida' },
  { nombre: 'CK_FinReciboPago_monto', tabla: 'FinReciboPago', columnas: ['monto'], expr: 'monto >= 0', msg: 'El monto del pago no puede ser negativo' },
];

export async function asegurarIndices(): Promise<void> {
  await asegurarNiveles().catch(e => console.error('[db] no se pudieron sembrar los niveles:', (e as Error).message)); // tabla de referencia fija (Inicial/Primaria/Secundaria)
  await asegurarCatalogosBase().catch(e => console.error('[db] no se pudieron sembrar los catalogos base (Efectivo, comidas, dietas, alergias, documentos):', (e as Error).message));
  await asegurarCicloActivo().catch(e => console.error('[db] no se pudo asegurar el ciclo lectivo inicial:', (e as Error).message)); // toda base tiene un ciclo
  await asegurarMotivosNota().catch(e => console.error('[db] no se pudo sembrar el catalogo de motivos de nota (credito/debito):', (e as Error).message)); // tabla de referencia
  await asegurarCatalogoFiscal().catch(e => console.error('[db] no se pudo sembrar el catalogo de comprobantes fiscales (tipos B/E y secuencia historica B02):', (e as Error).message)); // tabla de referencia fija
  const sqlserver = (process.env.DATABASE_URL ?? '').startsWith('sqlserver:');
  for (const ix of INDICES_FILTRADOS) {
    const donde = ix.donde ?? `${ix.columna} IS NOT NULL`;
    try {
      if (sqlserver) {
        await prisma.$executeRawUnsafe(
          `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = '${ix.nombre}' AND object_id = OBJECT_ID('dbo.${ix.tabla}'))
             CREATE UNIQUE INDEX ${ix.nombre} ON dbo.${ix.tabla}(${ix.columna}) WHERE ${donde}`,
        );
      } else {
        await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "${ix.nombre}" ON "${ix.tabla}"("${ix.columna}") WHERE ${donde}`);
      }
    } catch (e) {
      console.error(`[db] no se pudo asegurar el indice unico filtrado ${ix.nombre}:`, (e as Error).message);
    }
  }
  for (const ck of CHECKS) {
    try {
      if (sqlserver) {
        // Version anterior sin la marca (p. ej. CK_Matricula_estado sin 'Reservado' / 'Liberada'): se reemplaza dentro de UN lote (drop + add), idempotente.
        if (ck.marca) await prisma.$executeRawUnsafe(`IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = '${ck.nombre}' AND parent_object_id = OBJECT_ID('dbo.${ck.tabla}') AND definition NOT LIKE '%${ck.marca}%') ALTER TABLE dbo.${ck.tabla} DROP CONSTRAINT ${ck.nombre}`);
        await prisma.$executeRawUnsafe(`IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = '${ck.nombre}' AND parent_object_id = OBJECT_ID('dbo.${ck.tabla}')) ALTER TABLE dbo.${ck.tabla} ADD CONSTRAINT ${ck.nombre} CHECK (${ck.expr})`);
      } else {
        if (ck.marca) for (const s of ['_i', '_u']) await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${ck.nombre}${s}"`); // SQLite: se recrean con la definicion vigente
        // SQLite no admite ADD CONSTRAINT: dos triggers (insert / update de las columnas implicadas) abortan la fila que no cumple.
        const nueva = ck.expr.replace(new RegExp(`\\b(${ck.columnas.join('|')})\\b`, 'g'), 'NEW.$1');
        const msg = ck.msg.replace(/'/g, "''");
        await prisma.$executeRawUnsafe(`CREATE TRIGGER IF NOT EXISTS "${ck.nombre}_i" BEFORE INSERT ON "${ck.tabla}" WHEN NOT (${nueva}) BEGIN SELECT RAISE(ABORT, '${ck.nombre}: ${msg}'); END`);
        await prisma.$executeRawUnsafe(`CREATE TRIGGER IF NOT EXISTS "${ck.nombre}_u" BEFORE UPDATE OF ${ck.columnas.map(c => `"${c}"`).join(', ')} ON "${ck.tabla}" WHEN NOT (${nueva}) BEGIN SELECT RAISE(ABORT, '${ck.nombre}: ${msg}'); END`);
      }
    } catch (e) {
      console.error(`[db] no se pudo asegurar el CHECK ${ck.nombre}:`, (e as Error).message);
    }
  }
}
