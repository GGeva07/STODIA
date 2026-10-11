import type { Prisma } from '@prisma/client';
import { prisma } from '../db';

type Db = typeof prisma | Prisma.TransactionClient;

/**
 * CATALOGO de motivos de nota de credito / debito (tabla MotivoNota). Los codigos 01..05 son los «codigos de modificacion» de la DGII para notas de credito y debito
 * (el equipo no tiene certeza de su redaccion exacta ni de su alcance por tipo: A VALIDAR con contador / DGII, ver docs/fiscal-ncf.md §11). Los OPxx son motivos operativos
 * del colegio; cada uno informa el `codigoDgii` mas cercano (hoy 03 «Corrección de montos»; A VALIDAR).
 */
export interface MotivoSeed { codigo: string; nombre: string; origen: 'DGII' | 'Operativo'; aplica: 'CREDITO' | 'DEBITO' | 'AMBAS'; codigoDgii: string }
export const MOTIVOS_NOTA: MotivoSeed[] = [
  { codigo: '01', nombre: 'Anulación del NCF modificado', origen: 'DGII', aplica: 'CREDITO', codigoDgii: '01' },
  { codigo: '02', nombre: 'Corrección de texto del comprobante', origen: 'DGII', aplica: 'AMBAS', codigoDgii: '02' },
  { codigo: '03', nombre: 'Corrección de montos', origen: 'DGII', aplica: 'AMBAS', codigoDgii: '03' },
  { codigo: '04', nombre: 'Reemplazo de NCF emitido en contingencia', origen: 'DGII', aplica: 'AMBAS', codigoDgii: '04' },
  { codigo: '05', nombre: 'Referencia de Factura de Consumo Electrónica', origen: 'DGII', aplica: 'AMBAS', codigoDgii: '05' },
  { codigo: 'OP01', nombre: 'Devolución de producto', origen: 'Operativo', aplica: 'CREDITO', codigoDgii: '03' },
  { codigo: 'OP02', nombre: 'Servicio no prestado', origen: 'Operativo', aplica: 'CREDITO', codigoDgii: '03' },
  { codigo: 'OP03', nombre: 'Error de cobro', origen: 'Operativo', aplica: 'CREDITO', codigoDgii: '03' },
  { codigo: 'OP04', nombre: 'Descuento o beca posterior', origen: 'Operativo', aplica: 'CREDITO', codigoDgii: '03' },
  { codigo: 'OP05', nombre: 'Intereses por mora', origen: 'Operativo', aplica: 'DEBITO', codigoDgii: '03' },
  { codigo: 'OP06', nombre: 'Recargo', origen: 'Operativo', aplica: 'DEBITO', codigoDgii: '03' },
  { codigo: 'OP07', nombre: 'Ajuste de monto', origen: 'Operativo', aplica: 'AMBAS', codigoDgii: '03' },
  { codigo: 'OP08', nombre: 'Gastos adicionales', origen: 'Operativo', aplica: 'DEBITO', codigoDgii: '03' },
];
export const idMotivo = (codigo: string) => `MN-${codigo}`;
/** Motivo de la anulacion total de un recibo. */
export const MOTIVO_ANULACION = '01';

/** Siembra (idempotente) el catalogo de motivos. No pisa el `estado` que el administrador haya cambiado. */
export async function asegurarMotivosNota(db: Db = prisma): Promise<void> {
  for (const [i, m] of MOTIVOS_NOTA.entries()) {
    const data = { codigo: m.codigo, nombre: m.nombre, origen: m.origen, aplica: m.aplica, codigoDgii: m.codigoDgii, orden: i + 1 };
    await db.motivoNota.upsert({ where: { id: idMotivo(m.codigo) }, update: data, create: { id: idMotivo(m.codigo), ...data } });
  }
}
