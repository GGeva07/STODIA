/**
 * Herramienta del PROVEEDOR para claves de licencia STODIA (Ed25519). No se incluye en la imagen Docker.
 *   keygen [--force] [--out <ruta.pem>]
 *   issue --cliente "Nombre" --plan Basico|Intermedio|Avanzado --vence AAAA-MM-DD [--rnc 131556782]
 *         [--features +id,-id,id] [--cuotas alumnos=900,usuarios=12,campus=1] [--id LIC-...] [--key <ruta.pem>]
 *   inspect <clave> [--pub <base64 spki>]
 * Se ejecuta con `pnpm license:<cmd> -- ...` (tsx desde apps/api).
 */
import { generateKeyPairSync } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { LicPlan } from '@stodia/shared';
import { FEATURE_IDS, LFEAT, LQ, LTIER, privFromPem, pubToB64, signKey, verifyKey, type LicPayload } from '../../apps/api/src/lib/license-core';

const PUBKEY_FILE = resolve(__dirname, '../../apps/api/src/lib/license-pubkey.ts');
const DEFAULT_PRIV = join(homedir(), '.stodia', 'license-private.pem');
const PLANES: Record<string, LicPlan> = { basico: 'Básico', 'básico': 'Básico', intermedio: 'Intermedio', avanzado: 'Avanzado' };

function parse(argv: string[]) {
  const flags: Record<string, string> = {}, pos: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') continue;
    if (a.startsWith('--')) {
      const k = a.slice(2), n = argv[i + 1];
      if (n === undefined || n.startsWith('--')) flags[k] = 'true'; else { flags[k] = n; i++; }
    } else pos.push(a);
  }
  return { flags, pos };
}
const die = (m: string): never => { console.error('Error: ' + m); process.exit(1); };

function lockDown(file: string) {
  if (process.platform === 'win32') {
    const user = process.env.USERNAME || '';
    execFileSync('icacls', [file, '/inheritance:r', '/grant:r', `${user}:F`], { stdio: 'ignore' });
  } else chmodSync(file, 0o600);
}

function keygen(flags: Record<string, string>) {
  const out = resolve(flags.out || DEFAULT_PRIV);
  if (existsSync(out) && flags.force !== 'true') die(`Ya existe ${out}. Reemplazarla invalida TODAS las claves emitidas; usa --force solo si es intencional.`);
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 });
  lockDown(out);
  const b64 = pubToB64(publicKey);
  const src = readFileSync(PUBKEY_FILE, 'utf8');
  if (!/LICENSE_PUBLIC_KEY_B64 = '[^']*'/.test(src)) die('No se encontró LICENSE_PUBLIC_KEY_B64 en ' + PUBKEY_FILE);
  writeFileSync(PUBKEY_FILE, src.replace(/LICENSE_PUBLIC_KEY_B64 = '[^']*'/, `LICENSE_PUBLIC_KEY_B64 = '${b64}'`));
  console.log('Par Ed25519 generado. La clave privada NO se muestra.');
  console.log('Privada (guárdala y respáldala fuera del repo): ' + out);
  console.log('Pública embebida en: ' + PUBKEY_FILE);
  console.log('Recuerda reemitir las claves existentes con la nueva privada.');
}

function issue(flags: Record<string, string>) {
  const plan = PLANES[(flags.plan || '').toLowerCase()] ?? die('--plan debe ser Basico | Intermedio | Avanzado');
  const cliente = (flags.cliente || '').trim() || die('--cliente es obligatorio');
  const vence = flags.vence || die('--vence es obligatorio (AAAA-MM-DD)');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vence) || Number.isNaN(Date.parse(vence))) die('--vence inválido: usa AAAA-MM-DD');
  const set = new Set(LFEAT.filter(f => f[3] <= LTIER[plan]).map(f => f[0]));
  for (const t of (flags.features || '').split(',').map(s => s.trim()).filter(Boolean)) {
    const id = t.replace(/^[+-]/, '');
    if (!FEATURE_IDS.includes(id)) die(`Módulo desconocido: ${id}. Válidos: ${FEATURE_IDS.join(', ')}`);
    if (t.startsWith('-')) set.delete(id); else set.add(id);
  }
  const cuotas = { ...LQ[plan] };
  for (const t of (flags.cuotas || '').split(',').map(s => s.trim()).filter(Boolean)) {
    const [k, v] = t.split('=');
    if (!(k in cuotas) || !/^\d+$/.test(v ?? '')) die(`--cuotas inválido: ${t} (usa alumnos=N,usuarios=N,campus=N)`);
    cuotas[k as keyof typeof cuotas] = v;
  }
  const emitida = new Date().toISOString().slice(0, 10);
  const payload: LicPayload = {
    v: 1, cliente, ...(flags.rnc ? { rnc: flags.rnc } : {}), plan,
    features: FEATURE_IDS.filter(f => set.has(f)), cuotas, emitida, vence,
    id: flags.id || `LIC-${emitida.replace(/-/g, '')}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
  };
  const keyFile = resolve(flags.key || DEFAULT_PRIV);
  if (!existsSync(keyFile)) die(`No existe la clave privada ${keyFile}. Ejecuta license:keygen primero.`);
  console.log(signKey(payload, privFromPem(readFileSync(keyFile, 'utf8'))));
}

function inspect(pos: string[], flags: Record<string, string>) {
  const key = pos[0] || die('Uso: inspect <clave>');
  const pub = flags.pub || readPub();
  const r = verifyKey(key, pub);
  if (!r.ok) { console.error('INVÁLIDA (' + r.reason + ')'); process.exit(2); }
  const p = r.payload, dias = Math.round((Date.parse(p.vence) - Date.parse(new Date().toISOString().slice(0, 10))) / 864e5);
  console.log(`Firma: VÁLIDA\nId: ${p.id}\nCliente: ${p.cliente}${p.rnc ? ' (RNC ' + p.rnc + ')' : ''}\nPlan: ${p.plan}\nEmitida: ${p.emitida}\nVence: ${p.vence} (${dias < 0 ? 'VENCIDA hace ' + -dias : dias} días${dias < 0 ? '' : ' restantes'})`);
  console.log(`Cuotas: alumnos=${p.cuotas.alumnos} usuarios=${p.cuotas.usuarios} campus=${p.cuotas.campus}\nMódulos (${p.features.length}): ${p.features.join(', ')}`);
  if (dias < 0) process.exit(3);
}
const readPub = () => /LICENSE_PUBLIC_KEY_B64 = '([^']*)'/.exec(readFileSync(PUBKEY_FILE, 'utf8'))?.[1] ?? die('Sin clave pública');

const [cmd, ...rest] = process.argv.slice(2);
const { flags, pos } = parse(rest);
if (cmd === 'keygen') keygen(flags);
else if (cmd === 'issue') issue(flags);
else if (cmd === 'inspect') inspect(pos, flags);
else die('Comandos: keygen | issue | inspect <clave>');
