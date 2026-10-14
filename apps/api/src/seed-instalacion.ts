import bcrypt from 'bcryptjs';
import type { CfgPerfil } from '@stodia/shared';
import { prisma } from './db';
import { evalKey, getEval, setClave } from './lib/license';
import { LTIER } from './lib/license-core';
import { asegurarCodigo, estadoInstancia, marcarActiva } from './lib/instalacion';
import { setPin } from './lib/supervisor';

/**
 * Siembra de PRODUCCIÓN (SEED_DEMO != true). Idempotente: solo crea lo que falta y nunca pisa
 * lo que el cliente ya editó desde la app.
 * Dos caminos:
 *  - Con ADMIN_PASSWORD en el entorno (install.sh / install.ps1 de siempre): crea Super Admin, perfil y licencia como antes y marca la instancia 'activa'.
 *  - Sin admin ni ADMIN_PASSWORD (servidor instalado "vacío"): queda 'pendiente' y genera el CÓDIGO DE ACTIVACIÓN de un solo uso;
 *    la primera PC lo configura con POST /instalacion/activar (modules/instalacion), que usa aplicarConfiguracion().
 */
const env = (k: string) => (process.env[k] ?? '').trim();

export function fmtRnc(v: string) {
  const d = v.replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 10)}-${d[10]}`; // persona física (cédula)
  return d.length === 9 ? `${d[0]}-${d.slice(1, 3)}-${d.slice(3, 8)}-${d[8]}` : v;
}

export interface DatosConfiguracion {
  /** Sin admin = no se crea ninguno (instancia que ya tiene su Super Admin). */
  admin?: { usuario: string; nombre: string; password: string };
  perfil?: CfgPerfil;
  pin?: string;
  licencia?: string;
}

/** Crea lo que falte (admin, perfil, PIN, licencia) sin pisar nada existente. La usa el seed y la activación remota. */
export async function aplicarConfiguracion(d: DatosConfiguracion): Promise<{ adminCreado: boolean }> {
  let adminCreado = false;
  if (d.admin && !(await prisma.user.findUnique({ where: { usuario: d.admin.usuario } }))) {
    if (d.admin.password.length < 8) throw new Error('La contraseña del administrador debe tener al menos 8 caracteres');
    await prisma.user.create({ data: { usuario: d.admin.usuario, nombre: d.admin.nombre, rol: 'Super Admin', passwordHash: await bcrypt.hash(d.admin.password, 10) } });
    adminCreado = true;
  }
  if (d.perfil && !(await prisma.sisConfig.findUnique({ where: { clave: 'perfil' } }))) {
    await prisma.sisConfig.create({ data: { clave: 'perfil', valor: JSON.stringify(d.perfil) } });
  }
  if (d.licencia && !(await prisma.sisConfig.findUnique({ where: { clave: 'licenciaClave' } }))) await setClave(d.licencia);
  if (d.pin && !(await prisma.sisConfig.findUnique({ where: { clave: 'supervisor' } }))) await setPin(d.pin);
  return { adminCreado };
}

export async function seedInstalacion() {
  const usuario = env('ADMIN_USER') || 'admin';
  const hayAdmin = (await prisma.user.count({ where: { rol: 'Super Admin' } })) > 0;

  // Servidor "vacío": sin administrador y sin contraseña inicial -> espera la activación desde la primera PC.
  if (!hayAdmin && !process.env.ADMIN_PASSWORD && (await estadoInstancia()) === 'pendiente') {
    const clave = env('LICENSE_KEY');
    if (clave) {
      const ev = evalKey(clave);
      if (!ev.payload) throw new Error('LICENSE_KEY inválida (' + (ev.detalle ?? 'sin clave') + '): corrígela o déjala vacía y envíala en la activación');
      if (!(await prisma.sisConfig.findUnique({ where: { clave: 'licenciaClave' } }))) await setClave(clave);
    }
    const c = await asegurarCodigo();
    const linea = '='.repeat(60);
    console.log(`\n${linea}\n STODIA: servidor PENDIENTE DE ACTIVACIÓN\n Código de activación: ${c.codigo}   (vence ${c.vence.slice(0, 16).replace('T', ' ')} UTC)\n Úsalo en el instalador del cliente (modo "instalación nueva").\n También está en codigo-activacion.txt dentro del volumen de datos.\n${linea}\n`);
    return;
  }

  // 1) Camino clásico (variables del instalador del servidor)
  const pwd = process.env.ADMIN_PASSWORD ?? '';
  if (!hayAdmin && !(await prisma.user.findUnique({ where: { usuario } })) && pwd.length < 8) {
    throw new Error('ADMIN_PASSWORD (mínimo 8 caracteres) es obligatorio para crear el administrador inicial');
  }
  let perfil: CfgPerfil | undefined;
  if (env('INSTITUTION_NAME')) {
    perfil = {
      nombre: env('INSTITUTION_NAME'),
      rnc: fmtRnc(env('TAX_ID')),
      tel: env('PHONE'),
      dir: [env('ADDRESS'), env('CITY')].filter(Boolean).join(', '),
      email: env('CONTACT_EMAIL'),
      ciudad: env('CITY'),
      moneda: env('CURRENCY') || 'DOP',
      zonaHoraria: env('TIMEZONE') || 'America/Santo_Domingo',
    };
    // Verificación del RNC en la DGII hecha por el instalador (RNC_*). Instalaciones antiguas: sin variables, no se añade nada.
    const rv = env('RNC_VERIFICADO').toLowerCase();
    if (rv === 'true' || rv === 'false') {
      perfil.rncVerificado = rv === 'true';
      if (env('RNC_RAZON_SOCIAL')) perfil.razonSocial = env('RNC_RAZON_SOCIAL');
      if (env('RNC_NOMBRE_COMERCIAL')) perfil.nombreComercial = env('RNC_NOMBRE_COMERCIAL');
      if (env('RNC_ESTADO')) perfil.rncEstado = env('RNC_ESTADO');
      if (perfil.rncVerificado && env('RNC_VERIFICADO_AT') && !Number.isNaN(Date.parse(env('RNC_VERIFICADO_AT')))) perfil.rncVerificadoAt = env('RNC_VERIFICADO_AT');
    }
  }
  const hayPerfil = !!(await prisma.sisConfig.findUnique({ where: { clave: 'perfil' } }));
  // Ya hay un Super Admin (p. ej. creado en la activación con otro usuario) y no viene contraseña nueva: no se crea otro.
  const admin = hayAdmin && pwd.length < 8 ? undefined : { usuario, nombre: env('ADMIN_NAME') || 'Administrador', password: pwd };
  const { adminCreado } = await aplicarConfiguracion({ admin, perfil });

  // 2) Licencia: la CLAVE FIRMADA es la única fuente (plan, módulos, cuotas y vencimiento salen de su payload verificado).
  // Instancia activada desde la PC (POST /instalacion/activar): la clave ya vive en la BD y el .env puede no traerla.
  const clave = env('LICENSE_KEY');
  const ev = clave ? evalKey(clave) : await getEval();
  if (!ev.payload) throw new Error('LICENSE_KEY inválida o ausente (' + (ev.detalle ?? 'sin clave') + '): pide una clave al proveedor');
  if (clave && !(await prisma.sisConfig.findUnique({ where: { clave: 'licenciaClave' } }))) await setClave(clave);
  if (!hayPerfil && !perfil) await prisma.sisConfig.create({ data: { clave: 'perfil', valor: JSON.stringify({ nombre: ev.payload.cliente, rnc: fmtRnc(ev.payload.rnc ?? ''), tel: '', dir: '' } satisfies CfgPerfil) } });
  await marcarActiva('instalador');

  // 3) Comprobantes fiscales: el catalogo de tipos (B01..B17, E31..E47) lo siembra asegurarIndices(); las SECUENCIAS quedan vacias a proposito: son autorizaciones de la DGII de ESTE cliente.
  console.log('Comprobantes fiscales: sin secuencias NCF/e-NCF. Registra tus autorizaciones DGII en Configuración › Fiscal antes de cobrar (sin secuencia disponible no se emite ningún comprobante).');
  console.log(`seed producción ok: admin ${adminCreado ? `'${usuario}' creado` : 'ya existía'}, perfil configurado, licencia ${ev.payload.id} plan ${ev.payload.plan} (nivel ${LTIER[ev.payload.plan]}) vence ${ev.payload.vence} [${ev.estado}]`);
}
