/**
 * POST /api/solicitar-demo — función serverless de Vercel (Node.js) que envía por SMTP la solicitud de demo.
 * Sin dependencias de @vercel/node: usa los tipos estándar de Node (IncomingMessage/ServerResponse), de modo que la
 * MISMA función se monta en el dev de Vite (vite-api.mjs). Todo en un solo archivo (sin imports relativos).
 * Variables de entorno: ver README.md › «Formulario de demo». Nunca se registran contraseñas ni el cuerpo completo.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import nodemailer from 'nodemailer';

const MAX_BODY_BYTES = 8 * 1024;
const MIN_FILL_MS = 3000;
const PER_IP_LIMIT = 5;
const GLOBAL_LIMIT = 30;
const WINDOW_MS = 60 * 60 * 1000;
const SMTP_TIMEOUT_MS = 10_000;
const DEFAULT_SITE_URL = 'https://stodia.vercel.app';
const TZ = 'America/Santo_Domingo';

type Req = IncomingMessage & { body?: unknown };
type Res = ServerResponse;

/* ───────────── utilidades de respuesta ───────────── */

function send(res: Res, status: number, body: Record<string, unknown>, extra: Record<string, string> = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

const log = (level: 'info' | 'warn' | 'error', msg: string, data: Record<string, unknown> = {}) =>
  console[level](`[solicitar-demo] ${msg}`, Object.keys(data).length ? JSON.stringify(data) : '');

const header = (req: Req, name: string): string => {
  const v = req.headers[name];
  return (Array.isArray(v) ? v[0] : v) ?? '';
};

/* ───────────── configuración ───────────── */

const isProd = () => process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
const siteUrl = () => (process.env.VITE_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, '');
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const isEmail = (s: string) => s.length <= 254 && EMAIL_RE.test(s);
const list = (s: string | undefined) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);

function allowedOrigins(): string[] {
  const fromEnv = list(process.env.ALLOWED_ORIGINS);
  const base = fromEnv.length ? fromEnv : [DEFAULT_SITE_URL, siteUrl()];
  const out = new Set(base.map((o) => o.replace(/\/+$/, '')));
  if (!isProd()) ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174', 'http://localhost:3000'].forEach((o) => out.add(o));
  return [...out];
}

interface MailConfig {
  dryRun: boolean;
  host: string; port: number; secure: boolean; user: string; pass: string;
  from: string; to: string[]; bcc: string[]; confirm: boolean;
}

/** Devuelve la configuración o la lista de variables que faltan/son inválidas (solo para el log del servidor). */
function readConfig(): { ok: true; cfg: MailConfig } | { ok: false; problems: string[] } {
  const e = process.env;
  const dryRun = e.SMTP_DRY_RUN === 'true' && !isProd();
  const problems: string[] = [];
  const to = list(e.DEMO_MAIL_TO);
  const bcc = list(e.DEMO_MAIL_BCC);
  const from = (e.DEMO_MAIL_FROM ?? '').trim();
  const port = Number(e.SMTP_PORT);
  if (!dryRun) {
    if (!e.SMTP_HOST) problems.push('SMTP_HOST');
    if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push('SMTP_PORT');
    if (!e.SMTP_USER) problems.push('SMTP_USER');
    if (!e.SMTP_PASS) problems.push('SMTP_PASS');
    if (!from) problems.push('DEMO_MAIL_FROM');
    if (!to.length) problems.push('DEMO_MAIL_TO');
  }
  // Rechaza saltos de línea en valores que acaban en cabeceras y direcciones mal formadas.
  const bad = (v: string) => /[\r\n\0]/.test(v);
  if (bad(from) || (from && !/^(?:[^<>\r\n]*<)?[^<>\s@]+@[^<>\s@]+(?:>)?$/.test(from))) problems.push('DEMO_MAIL_FROM (formato)');
  if (to.some((x) => !isEmail(x))) problems.push('DEMO_MAIL_TO (formato)');
  if (bcc.some((x) => !isEmail(x))) problems.push('DEMO_MAIL_BCC (formato)');
  if (problems.length) return { ok: false, problems };
  const secure = e.SMTP_SECURE ? e.SMTP_SECURE.toLowerCase() === 'true' : port === 465;
  return {
    ok: true,
    cfg: { dryRun, host: e.SMTP_HOST ?? '', port, secure, user: e.SMTP_USER ?? '', pass: e.SMTP_PASS ?? '', from, to, bcc, confirm: e.DEMO_SEND_CONFIRMATION === 'true' },
  };
}

/* ───────────── límite de tasa (best-effort, por instancia) ───────────── */

const perIp = new Map<string, number[]>();
let globalHits: number[] = [];

function prune(arr: number[], now: number) {
  while (arr.length && now - arr[0] >= WINDOW_MS) arr.shift();
}

/** Devuelve segundos de Retry-After si está limitado; si no, registra el envío y devuelve 0. */
function rateLimit(ip: string, now = Date.now()): number {
  prune(globalHits, now);
  const hits = perIp.get(ip) ?? [];
  prune(hits, now);
  if (hits.length >= PER_IP_LIMIT) return Math.max(1, Math.ceil((hits[0] + WINDOW_MS - now) / 1000));
  if (globalHits.length >= GLOBAL_LIMIT) return Math.max(1, Math.ceil((globalHits[0] + WINDOW_MS - now) / 1000));
  hits.push(now);
  globalHits.push(now);
  perIp.set(ip, hits);
  if (perIp.size > 5000) for (const [k, v] of perIp) { prune(v, now); if (!v.length) perIp.delete(k); }
  return 0;
}

/** Solo pruebas. */
export function __resetRateLimit() { perIp.clear(); globalHits = []; }

function clientIp(req: Req): string {
  const real = header(req, 'x-real-ip').trim();
  if (real) return real;
  const xff = header(req, 'x-forwarded-for').split(',')[0]?.trim();
  return xff || req.socket?.remoteAddress || 'unknown';
}

/** Oculta el último octeto (IPv4) o trunca a los 3 primeros grupos (IPv6). */
export function maskIp(ip: string): string {
  const v4 = ip.replace(/^::ffff:/, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v4)) return v4.replace(/\.\d{1,3}$/, '.x');
  if (ip.includes(':')) return ip.split(':').slice(0, 3).join(':') + ':…';
  return 'desconocida';
}

/* ───────────── lectura del cuerpo ───────────── */

class TooLarge extends Error {}

async function readBody(req: Req): Promise<string> {
  const declared = Number(header(req, 'content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new TooLarge();
  if (!req.readableEnded && req.readable !== false) {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += b.length;
      if (size > MAX_BODY_BYTES) throw new TooLarge();
      chunks.push(b);
    }
    if (size > 0) return Buffer.concat(chunks).toString('utf8');
  }
  // El runtime pudo haber consumido el flujo y entregado req.body ya parseado.
  const b = req.body;
  const text = typeof b === 'string' ? b : Buffer.isBuffer(b) ? b.toString('utf8') : b && typeof b === 'object' ? JSON.stringify(b) : '';
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new TooLarge();
  return text;
}

/* ───────────── validación ───────────── */

interface Demo {
  nombre: string; colegio: string; correo: string; telefono: string;
  cargo: string; ciudad: string; estudiantes: string; mensaje: string;
}
type FieldErrors = Record<string, string>;

const CTRL_SINGLE = /[\u0000-\u001f\u007f\u2028\u2029]/; // incluye \r y \n
const CTRL_MULTI = /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/g; // permite \n y \r\n (se normaliza)

function validate(raw: unknown): { ok: true; data: Demo } | { ok: false; errors: FieldErrors; message: string } {
  const errors: FieldErrors = {};
  const o = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;

  const single = (key: string, label: string, max: number, required: boolean): string => {
    const v = o[key];
    if (v === undefined || v === null || v === '') {
      if (required) errors[key] = `${label} es obligatorio.`;
      return '';
    }
    if (typeof v !== 'string') { errors[key] = `${label} no es válido.`; return ''; }
    if (CTRL_SINGLE.test(v)) { errors[key] = `${label} contiene caracteres no permitidos.`; return ''; }
    const t = v.trim();
    if (required && !t) { errors[key] = `${label} es obligatorio.`; return ''; }
    if (t.length > max) { errors[key] = `${label} es demasiado largo (máximo ${max} caracteres).`; return ''; }
    return t;
  };

  const nombre = single('nombre', 'El nombre', 100, true);
  const colegio = single('colegio', 'El colegio', 150, true);
  const correo = single('correo', 'El correo', 254, true);
  if (correo && !errors.correo && !isEmail(correo)) errors.correo = 'Escribe un correo válido, por ejemplo nombre@colegio.edu.do.';
  const telefono = single('telefono', 'El teléfono', 25, false);
  if (telefono && !errors.telefono && !(/^[+0-9()\-.\s]+$/.test(telefono) && telefono.replace(/\D/g, '').length >= 7 && telefono.replace(/\D/g, '').length <= 15)) {
    errors.telefono = 'Escribe un teléfono válido (7 a 15 dígitos).';
  }
  const cargo = single('cargo', 'El cargo', 100, false);
  const ciudad = single('ciudad', 'La ciudad', 100, false);
  let estudiantes = '';
  if (o.estudiantes !== undefined && o.estudiantes !== null && o.estudiantes !== '') {
    const n = typeof o.estudiantes === 'number' ? o.estudiantes : Number(String(o.estudiantes).trim());
    if (!Number.isInteger(n) || n < 1 || n > 100000) errors.estudiantes = 'El número de estudiantes debe ser un entero entre 1 y 100000.';
    else estudiantes = String(n);
  }

  let mensaje = '';
  if (o.mensaje !== undefined && o.mensaje !== null && o.mensaje !== '') {
    if (typeof o.mensaje !== 'string') errors.mensaje = 'El mensaje no es válido.';
    else {
      mensaje = o.mensaje.replace(/\r\n?/g, '\n').replace(CTRL_MULTI, '').trim();
      if (mensaje.length > 2000) { errors.mensaje = 'El mensaje es demasiado largo (máximo 2000 caracteres).'; mensaje = ''; }
    }
  }

  if (o.consentimiento !== true) errors.consentimiento = 'Debes aceptar el tratamiento de tus datos para poder enviar la solicitud.';

  if (Object.keys(errors).length) return { ok: false, errors, message: 'Revisa los campos marcados e inténtalo de nuevo.' };
  return { ok: true, data: { nombre, colegio, correo, telefono, cargo, ciudad, estudiantes, mensaje } };
}

/* ───────────── construcción de mensajes ───────────── */

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const stamp = () =>
  new Intl.DateTimeFormat('es-DO', { timeZone: TZ, dateStyle: 'full', timeStyle: 'medium' }).format(new Date()) + ` (${TZ})`;

export function buildTeamMail(d: Demo, meta: { ip: string; origin: string }) {
  const rows: [string, string][] = [
    ['Nombre', d.nombre], ['Colegio', d.colegio], ['Correo', d.correo],
    ['Teléfono', d.telefono || '(no indicado)'],
    ...(d.cargo ? [['Cargo', d.cargo] as [string, string]] : []),
    ...(d.ciudad ? [['Ciudad', d.ciudad] as [string, string]] : []),
    ...(d.estudiantes ? [['Nº de estudiantes', d.estudiantes] as [string, string]] : []),
  ];
  const when = stamp();
  const ipMasked = maskIp(meta.ip);
  const origin = meta.origin.slice(0, 200).replace(/[\u0000-\u001f\u007f]/g, '');
  const text = [
    'Nueva solicitud de demo de STODIA', '',
    ...rows.map(([k, v]) => `${k}: ${v}`), '',
    'Mensaje:', d.mensaje || '(sin mensaje adicional)', '',
    '—', `Recibida: ${when}`, `IP: ${ipMasked}`, `Origen: ${origin}`,
    'Consentimiento de privacidad: aceptado por el solicitante.',
  ].join('\n');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#0f172a;max-width:600px">
<h2 style="margin:0 0 12px">Nueva solicitud de demo de STODIA</h2>
<table role="presentation" cellpadding="6" style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="color:#475569;vertical-align:top"><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('')}</table>
<p style="margin:16px 0 4px"><b>Mensaje</b></p>
<div style="white-space:pre-wrap;border-left:3px solid #cbd5e1;padding:4px 12px">${esc(d.mensaje || '(sin mensaje adicional)')}</div>
<p style="margin-top:20px;color:#64748b;font-size:13px">Recibida: ${esc(when)}<br>IP: ${esc(ipMasked)}<br>Origen: ${esc(origin)}<br>Consentimiento de privacidad: aceptado por el solicitante.</p></div>`;
  return { subject: `Solicitud de demo STODIA · ${d.colegio}`, text, html };
}

export function buildConfirmMail(d: Demo) {
  const privacy = `${siteUrl()}/privacidad`;
  const text = `Hola ${d.nombre},\n\nRecibimos tu solicitud de demo de STODIA para ${d.colegio}. Revisaremos tu mensaje y te escribiremos pronto a este correo.\n\nUsamos tus datos solo para responder esta solicitud. Más información: ${privacy}\n\nSi no hiciste esta solicitud, ignora este mensaje.\n\nEquipo STODIA`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#0f172a;max-width:560px"><p>Hola ${esc(d.nombre)},</p><p>Recibimos tu solicitud de demo de STODIA para <b>${esc(d.colegio)}</b>. Revisaremos tu mensaje y te escribiremos pronto a este correo.</p><p>Usamos tus datos solo para responder esta solicitud. Más información en nuestra <a href="${esc(privacy)}">política de privacidad</a>.</p><p style="color:#64748b;font-size:13px">Si no hiciste esta solicitud, ignora este mensaje.</p><p>Equipo STODIA</p></div>`;
  return { subject: 'Recibimos tu solicitud de demo de STODIA', text, html };
}

/* ───────────── handler ───────────── */

export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    if (req.method !== 'POST') {
      return send(res, 405, { error: 'method_not_allowed', message: 'Método no permitido.' }, { Allow: 'POST' });
    }

    // Origin / Referer contra la lista permitida (los navegadores siempre envían Origin en POST fetch).
    const allowed = allowedOrigins();
    let origin = header(req, 'origin');
    if (!origin) {
      try { origin = new URL(header(req, 'referer')).origin; } catch { origin = ''; }
    }
    if (!origin || !allowed.includes(origin.replace(/\/+$/, ''))) {
      log('warn', 'origen rechazado', { origin: origin.slice(0, 100) });
      return send(res, 403, { error: 'forbidden', message: 'Solicitud no permitida desde este origen.' });
    }

    const conf = readConfig();
    if (!conf.ok) {
      log('error', 'configuración incompleta o inválida', { problems: conf.problems });
      return send(res, 503, { error: 'not_configured', message: 'El envío de solicitudes no está disponible en este momento.' });
    }
    const cfg = conf.cfg;

    if (!/^application\/json(\s*;|$)/i.test(header(req, 'content-type').trim())) {
      return send(res, 415, { error: 'unsupported_media_type', message: 'Formato de solicitud no admitido.' });
    }

    let rawText: string;
    try { rawText = await readBody(req); } catch (e) {
      if (e instanceof TooLarge) return send(res, 413, { error: 'payload_too_large', message: 'La solicitud es demasiado grande.' });
      throw e;
    }
    if (Buffer.byteLength(rawText) > MAX_BODY_BYTES) return send(res, 413, { error: 'payload_too_large', message: 'La solicitud es demasiado grande.' });

    let parsed: unknown;
    try { parsed = JSON.parse(rawText); } catch {
      return send(res, 400, { error: 'invalid_json', message: 'No pudimos leer la solicitud. Inténtalo de nuevo.' });
    }
    const body = (parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}) as Record<string, unknown>;

    // Honeypot: si viene lleno, responde éxito sin enviar ni avisar al bot.
    if (typeof body.website === 'string' ? body.website.trim() !== '' : body.website != null && body.website !== false) {
      log('info', 'honeypot activado; descartado');
      return send(res, 200, { ok: true });
    }

    // Tiempo de llenado (ambas marcas son del reloj del cliente, así que no depende del desfase con el servidor).
    const r = Number(body.renderedAt), s = Number(body.submittedAt);
    if (!Number.isFinite(r) || !Number.isFinite(s) || s - r < MIN_FILL_MS) {
      return send(res, 400, { error: 'too_fast', message: 'Enviaste el formulario demasiado rápido. Espera unos segundos e inténtalo de nuevo.' });
    }

    const v = validate(body);
    if (!v.ok) return send(res, 400, { error: 'validation', message: v.message, fields: v.errors });

    const ip = clientIp(req);
    const retry = rateLimit(ip);
    if (retry > 0) {
      log('warn', 'límite de tasa excedido', { ip: maskIp(ip) });
      return send(res, 429, { error: 'rate_limited', message: 'Hemos recibido muchas solicitudes. Inténtalo de nuevo más tarde.' }, { 'Retry-After': String(retry) });
    }

    const team = buildTeamMail(v.data, { ip, origin });

    if (cfg.dryRun) {
      // Sin datos sensibles: solo metadatos (nunca nombre, correo, teléfono ni mensaje).
      log('info', 'DRY RUN: mensaje preparado, no enviado', { subjectLength: team.subject.length, textBytes: Buffer.byteLength(team.text), to: cfg.to.length, bcc: cfg.bcc.length, confirm: cfg.confirm, ip: maskIp(ip) });
      return send(res, 200, { ok: true, dryRun: true });
    }

    const transporter = nodemailer.createTransport({
      host: cfg.host, port: cfg.port, secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
      pool: false,
      connectionTimeout: SMTP_TIMEOUT_MS, greetingTimeout: SMTP_TIMEOUT_MS, socketTimeout: SMTP_TIMEOUT_MS,
      tls: { minVersion: 'TLSv1.2' },
    });

    try {
      await transporter.sendMail({
        from: cfg.from, to: cfg.to, ...(cfg.bcc.length ? { bcc: cfg.bcc } : {}),
        replyTo: v.data.correo, // validado: sin CR/LF
        subject: team.subject, text: team.text, html: team.html,
        attachments: [], disableFileAccess: true, disableUrlAccess: true,
      });
    } catch (err) {
      const e = err as { code?: string; responseCode?: number; command?: string };
      log('error', 'fallo al enviar por SMTP', { code: e.code, responseCode: e.responseCode, command: e.command });
      return send(res, 500, { error: 'send_failed', message: 'No pudimos enviar tu solicitud. Inténtalo de nuevo en unos minutos o escríbenos por correo.' });
    }

    if (cfg.confirm) {
      try {
        const c = buildConfirmMail(v.data);
        await transporter.sendMail({ from: cfg.from, to: v.data.correo, subject: c.subject, text: c.text, html: c.html, disableFileAccess: true, disableUrlAccess: true });
      } catch (err) {
        const e = err as { code?: string; responseCode?: number };
        log('warn', 'no se pudo enviar el acuse de recibo', { code: e.code, responseCode: e.responseCode });
      }
    }
    transporter.close();
    log('info', 'solicitud enviada', { ip: maskIp(ip) });
    return send(res, 200, { ok: true });
  } catch (err) {
    log('error', 'error inesperado', { name: (err as Error)?.name });
    return send(res, 500, { error: 'internal', message: 'Ocurrió un error inesperado. Inténtalo de nuevo más tarde.' });
  }
}
