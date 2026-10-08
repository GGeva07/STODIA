import { prisma } from './db';

/** AUD0 del prototipo. Idempotente (ids fijos). */
const AUD0: string[][] = [
  ['2026-10-06 14:32:08', 'usr_arosario', 'Insert', 'Recibos', 'REC-0417', '—', 'RD$ 3,200.00 · B0200001880', '10.0.4.31'],
  ['2026-10-06 14:11:40', 'usr_ralmonte', 'Update', 'Calificaciones', 'Báez Rosario/C2', '72', '78', '10.0.4.22'],
  ['2026-10-06 13:58:02', 'usr_palmanzar', 'Update', 'Roles', 'Cajero/becas', 'sin acceso', 'acceso', '10.0.4.5'],
  ['2026-10-06 12:20:15', 'usr_cvidal', 'Update', 'Becas', 'EXP-BEC-0091', 'Pendiente', 'Aprobada', '10.0.4.12'],
  ['2026-10-06 11:47:59', 'usr_arosario', 'Delete', 'Recibos', 'REC-0409', 'RD$ 8,500.00', 'Anulado · B0400000231', '10.0.4.31'],
  ['2026-10-06 10:05:33', 'usr_palmanzar', 'Insert', 'PlanesPago', 'PLN-004', '—', 'Plan 11 Cuotas (Ago–Jun)', '10.0.4.5'],
  ['2026-10-05 17:42:10', 'usr_arosario', 'Update', 'CierreCaja', 'CAJA-01', 'Abierta', 'Conciliada', '10.0.4.31'],
  ['2026-10-05 16:03:51', 'usr_ralmonte', 'Update', 'Asistencia', '5to A/2026-10-05', 'sin marcar', '16 presentes', '10.0.4.22'],
  ['2026-10-05 09:30:27', 'usr_palmanzar', 'Update', 'TenantConfig', 'NCF-B02', 'umbral 15%', 'umbral 10%', '10.0.4.5'],
  ['2026-10-04 15:12:04', 'usr_cvidal', 'Insert', 'Becas', 'EXP-BEC-0107', '—', 'Deportiva 2,000.00', '10.0.4.12'],
  ['2026-10-03 08:55:19', 'usr_jtejada', 'Update', 'MenuSemanal', 'Miércoles 7', 'Pollo guisado', 'Pollo en salsa de maní', '10.0.4.40'],
  ['2026-10-02 18:21:44', 'usr_palmanzar', 'Update', 'Estudiantes', 'EST-2026-0530', 'Activo', 'Inactivo', '10.0.4.5'],
];

export default async function seedSistema() {
  for (const [i, r] of AUD0.entries()) {
    await prisma.sisAudit.upsert({
      where: { id: 'aud-seed-' + (i + 1) },
      update: {},
      create: { id: 'aud-seed-' + (i + 1), t: r[0], usr: r[1], accion: r[2], tabla: r[3], registro: r[4], prev: r[5], next: r[6], ip: r[7] },
    });
  }
}
