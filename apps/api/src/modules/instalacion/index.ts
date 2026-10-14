import type { FastifyPluginAsync } from 'fastify';
import type { CfgPerfil } from '@stodia/shared';
import { audit } from '../../lib/audit';
import { evalKey, getEval } from '../../lib/license';
import { codigoValido, estadoInstancia, marcarActiva, version } from '../../lib/instalacion';
import { rncValido } from '../../lib/rnc';
import { consultarDgii, soloDigitos } from '../../lib/rnc-lookup';
import { aplicarConfiguracion, fmtRnc } from '../../seed-instalacion';

/**
 * Primera configuración de un servidor instalado "vacío" (estado 'pendiente').
 * Sin sesión: lo protege el CÓDIGO DE ACTIVACIÓN de un solo uso que imprime el servidor al arrancar.
 * Tras activarse la ruta responde 409 para siempre. Contrato: .agent-sync/analisis-instalacion/CONTRATO.md
 */
interface ActivarBody {
  codigo: string;
  institucion: { nombre: string; rnc: string; direccion?: string; ciudad?: string; telefono?: string; email?: string };
  admin: { usuario?: string; nombre?: string; password: string };
  pin: string;
  licencia?: string;
  zonaHoraria?: string;
  moneda?: string;
}

const MAX_FALLOS = 5, VENTANA = 15 * 60_000;
const fallos = new Map<string, { n: number; hasta: number }>();
const str = (max: number) => ({ type: 'string', maxLength: max });

const plugin: FastifyPluginAsync = async app => {
  app.get('/estado', async () => ({ estado: await estadoInstancia(), version: version() }));

  app.post<{ Body: ActivarBody }>('/activar', {
    schema: {
      body: {
        type: 'object', required: ['codigo', 'institucion', 'admin', 'pin'],
        properties: {
          codigo: str(20), pin: str(8), licencia: str(4000), zonaHoraria: str(64), moneda: str(3),
          institucion: { type: 'object', required: ['nombre', 'rnc'], properties: { nombre: str(200), rnc: str(20), direccion: str(200), ciudad: str(100), telefono: str(20), email: str(200) } },
          admin: { type: 'object', required: ['password'], properties: { usuario: str(32), nombre: str(100), password: str(200) } },
        },
      },
    },
  }, async (req, reply) => {
    if ((await estadoInstancia()) === 'activa') return reply.code(409).send({ error: 'Este servidor ya está activado. Usa el modo «extensión» del instalador.' });

    const now = Date.now(), f = fallos.get(req.ip);
    if (f && f.hasta > now && f.n >= MAX_FALLOS) {
      reply.header('Retry-After', String(Math.ceil((f.hasta - now) / 1000)));
      return reply.code(429).send({ error: 'Demasiados intentos con un código incorrecto. Espera unos minutos.' });
    }
    if (!(await codigoValido(req.body.codigo))) {
      fallos.set(req.ip, f && f.hasta > now ? { n: f.n + 1, hasta: f.hasta } : { n: 1, hasta: now + VENTANA });
      return reply.code(403).send({ error: 'Código de activación incorrecto o vencido. Míralo en el log del servidor o en codigo-activacion.txt.' });
    }
    fallos.delete(req.ip);

    const b = req.body, i = b.institucion;
    const usuario = (b.admin.usuario ?? '').trim().toLowerCase() || 'admin';
    const zona = (b.zonaHoraria ?? '').trim() || 'America/Santo_Domingo', moneda = (b.moneda ?? '').trim().toUpperCase() || 'DOP';
    const err = (m: string) => reply.code(422).send({ error: m });
    if (!i.nombre.trim()) return err('El nombre de la institución es obligatorio');
    if (!rncValido(i.rnc)) return err('El RNC debe tener 9 dígitos (o 11 si es cédula)');
    if (!/^[a-z0-9._-]{3,32}$/.test(usuario)) return err('Usuario del administrador: 3 a 32 caracteres (minúsculas, números, punto, guion)');
    if (b.admin.password.length < 8) return err('La contraseña del administrador debe tener al menos 8 caracteres');
    if (b.pin.trim().length < 4 || b.pin.trim().length > 8) return err('El PIN de supervisor debe tener entre 4 y 8 caracteres');
    if (i.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(i.email)) return err('Correo de contacto inválido');
    if (!/^(UTC|[A-Za-z_]+\/[A-Za-z0-9_+-]+(\/[A-Za-z0-9_+-]+)?)$/.test(zona)) return err('Zona horaria inválida');
    if (!/^[A-Z]{3}$/.test(moneda)) return err('Moneda inválida (código de 3 letras, p. ej. DOP)');

    // Licencia: la enviada (verificada) o la que ya trae el servidor (LICENSE_KEY). Sin ninguna no se activa.
    const licencia = (b.licencia ?? '').trim();
    if (licencia) {
      const ev = evalKey(licencia);
      if (!ev.payload) return err('Licencia inválida: ' + (ev.detalle ?? 'formato'));
      if (ev.estado === 'vencida') return err('La licencia está vencida');
    } else if (!(await getEval()).payload) return err('Este servidor no tiene licencia: pega la clave STODIA1.* que te dio el proveedor');

    // RNC: lo verifica el SERVIDOR (no se confía en el cliente). Sin la API de RNC configurada queda «no verificado» y se confirma luego en Configuración.
    const rnc = soloDigitos(i.rnc);
    const dgii = await consultarDgii(rnc);
    const perfil: CfgPerfil = {
      nombre: i.nombre.trim(), rnc: fmtRnc(rnc), tel: (i.telefono ?? '').trim(),
      dir: [i.direccion, i.ciudad].map(x => (x ?? '').trim()).filter(Boolean).join(', '),
      email: (i.email ?? '').trim(), ciudad: (i.ciudad ?? '').trim(), moneda, zonaHoraria: zona,
      rncVerificado: dgii.tipo === 'ok' && dgii.activo,
    };
    if (dgii.tipo === 'ok') {
      perfil.razonSocial = dgii.razonSocial;
      if (dgii.nombreComercial) perfil.nombreComercial = dgii.nombreComercial;
      perfil.rncEstado = dgii.estado;
      if (dgii.activo) perfil.rncVerificadoAt = new Date().toISOString();
    }

    await aplicarConfiguracion({ admin: { usuario, nombre: (b.admin.nombre ?? '').trim() || 'Administrador', password: b.admin.password }, perfil, pin: b.pin.trim(), licencia: licencia || undefined });
    await marcarActiva(`activación remota desde ${req.ip}`);
    await audit('instalador', 'Insert', { tabla: 'Instalacion', id: 'activar', next: `${perfil.nombre} · admin ${usuario}`, ip: req.ip });
    req.log.info({ admin: usuario }, 'instancia activada');
    return reply.code(201).send({
      ok: true, admin: usuario,
      rnc: { verificado: !!perfil.rncVerificado, razonSocial: perfil.razonSocial, estado: dgii.tipo === 'ok' ? dgii.estado : dgii.tipo === 'no-encontrado' ? 'NO ENCONTRADO' : 'SIN VERIFICAR' },
    });
  });
};
export default plugin;
