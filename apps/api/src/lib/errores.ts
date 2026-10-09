/**
 * Errores de integridad referencial traducidos a mensajes en español (HTTP 409).
 * Prisma: P2003 = violacion de FK (SQL Server 547 / SQLite FOREIGN KEY), P2002 = violacion de UNIQUE.
 */
export function mensajeIntegridad(e: unknown): { status: number; error: string } | null {
  const err = e as { code?: string; meta?: { field_name?: string; target?: unknown; modelName?: string } };
  if (err?.code === 'P2003') return { status: 409, error: 'No se puede completar la operación: otros registros dependen de este (historial de cobros, notas, recibos u otros). Desactívalo (estado Inactivo/Retirado) en lugar de eliminarlo.' };
  if (err?.code === 'P2002') return { status: 409, error: 'Ya existe un registro con ese valor único (cédula, NCF, código o cuenta de acceso).' };
  return null;
}
