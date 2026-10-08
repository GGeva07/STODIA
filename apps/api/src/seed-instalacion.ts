import bcrypt from 'bcryptjs';
import type { CfgPerfil } from '@stodia/shared';
import { prisma } from './db';
import { evalKey } from './lib/license';
import { LTIER } from './lib/license-core';

/**
 * Siembra de PRODUCCIÓN (SEED_DEMO != true). Idempotente: solo crea lo que falta y nunca pisa
 * lo que el cliente ya editó desde la app. Lee el entorno que deja install.ps1 / install.sh.
 * Crea: Super Admin real (bcrypt), perfil de la institución (SisConfig 'perfil') y clave de licencia (SisConfig 'licenciaClave').
 */
const env = (k: string) => (process.env[k] ?? '').trim();


function fmtRnc(v: string) {
  const d = v.replace(/\D/g, '');
  return d.length === 9 ? `${d[0]}-${d.slice(1, 3)}-${d.slice(3, 8)}-${d[8]}` : v;
}

export async function seedInstalacion() {
  // 1) Super Admin real
  const usuario = env('ADMIN_USER') || 'admin';
  const existente = await prisma.user.findUnique({ where: { usuario } });
  let adminCreado = false;
  if (!existente) {
    const pwd = process.env.ADMIN_PASSWORD ?? '';
    if (pwd.length < 8) throw new Error('ADMIN_PASSWORD (mínimo 8 caracteres) es obligatorio para crear el administrador inicial');
    const nombre = env('ADMIN_NAME') || 'Administrador';
    await prisma.user.create({ data: { usuario, nombre, rol: 'Super Admin', passwordHash: await bcrypt.hash(pwd, 10) } });
    adminCreado = true;
  }

  // 2) Perfil de la institución (solo si aún no existe)
  const hayPerfil = await prisma.sisConfig.findUnique({ where: { clave: 'perfil' } });
  if (!hayPerfil && env('INSTITUTION_NAME')) {
    const perfil: CfgPerfil = {
      nombre: env('INSTITUTION_NAME'),
      rnc: fmtRnc(env('TAX_ID')),
      tel: env('PHONE'),
      dir: [env('ADDRESS'), env('CITY')].filter(Boolean).join(', '),
      email: env('CONTACT_EMAIL'),
      ciudad: env('CITY'),
      moneda: env('CURRENCY') || 'DOP',
      zonaHoraria: env('TIMEZONE') || 'America/Santo_Domingo',
    };
    await prisma.sisConfig.create({ data: { clave: 'perfil', valor: JSON.stringify(perfil) } });
  }

  // 3) Licencia: la CLAVE FIRMADA es la única fuente (plan, módulos, cuotas y vencimiento salen de su payload verificado).
  const clave = env('LICENSE_KEY');
  const ev = evalKey(clave || null);
  if (!ev.payload) throw new Error('LICENSE_KEY inválida o ausente (' + (ev.detalle ?? 'sin clave') + '): pide una clave al proveedor');
  const hayClave = await prisma.sisConfig.findUnique({ where: { clave: 'licenciaClave' } });
  if (!hayClave) await prisma.sisConfig.create({ data: { clave: 'licenciaClave', valor: JSON.stringify(clave) } });
  if (!hayPerfil && !env('INSTITUTION_NAME')) await prisma.sisConfig.create({ data: { clave: 'perfil', valor: JSON.stringify({ nombre: ev.payload.cliente, rnc: fmtRnc(ev.payload.rnc ?? ''), tel: '', dir: '' } satisfies CfgPerfil) } });

  console.log(`seed producción ok: admin '${usuario}' ${adminCreado ? 'creado' : 'ya existía'}, perfil configurado, licencia ${ev.payload.id} plan ${ev.payload.plan} (nivel ${LTIER[ev.payload.plan]}) vence ${ev.payload.vence} [${ev.estado}]`);
}
