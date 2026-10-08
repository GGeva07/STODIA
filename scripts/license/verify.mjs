#!/usr/bin/env node
// Verificador autónomo (solo node:crypto, sin pnpm/tsx) que usan install.ps1 / install.sh.
// Uso: node scripts/license/verify.mjs <clave>   -> exit 0 válida | 2 firma/formato inválido | 3 vencida
import { createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const key = (process.argv[2] || '').trim();
const parts = key.split('.');
if (parts.length !== 3 || parts[0] !== 'STODIA1' || !parts.slice(1).every(p => /^[A-Za-z0-9_-]+$/.test(p))) { console.error('Formato inválido: debe ser STODIA1.<payload>.<firma>'); process.exit(2); }
const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../apps/api/src/lib/license-pubkey.ts'), 'utf8');
const pubB64 = /LICENSE_PUBLIC_KEY_B64 = '([^']+)'/.exec(src)?.[1];
let ok = false;
try {
  const sig = Buffer.from(parts[2], 'base64url');
  ok = sig.length === 64 && verify(null, Buffer.from(parts[1], 'base64url'), createPublicKey({ key: Buffer.from(pubB64, 'base64'), format: 'der', type: 'spki' }), sig);
} catch { ok = false; }
if (!ok) { console.error('Firma inválida: la clave está alterada o no fue emitida por STODIA'); process.exit(2); }
const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
if (typeof p.vence !== 'string' || p.vence < new Date().toISOString().slice(0, 10)) { console.error('La clave está vencida (' + p.vence + ')'); process.exit(3); }
console.log(`OK: ${p.cliente} · plan ${p.plan} · vence ${p.vence}`);
