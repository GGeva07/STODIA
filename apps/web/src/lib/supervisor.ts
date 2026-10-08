import { api } from './api';

/**
 * Canjea la clave de supervisor tipeada por un token de un solo uso (60 s) emitido por el servidor.
 * El navegador NUNCA conoce ni compara el PIN: el servidor valida, limita intentos y audita.
 * El token se envía en el campo `pin` de la acción protegida. Lanza ApiError (403 clave inválida, 429 bloqueo).
 */
export async function autorizarSupervisor(pin: string, accion?: string): Promise<string> {
  const r = await api.post<{ token: string; expiresIn: number }>('/auth/supervisor', { pin, accion });
  return r.token;
}
