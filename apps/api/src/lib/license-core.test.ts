import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { signKey, verifyKey, pubToB64, LQ, type LicPayload } from './license-core';

const pair = () => { const k = generateKeyPairSync('ed25519'); return { priv: k.privateKey, pub: pubToB64(k.publicKey) }; };
const base: LicPayload = { v: 1, cliente: 'Colegio X', plan: 'Intermedio', features: ['pos', 'planes'], cuotas: { ...LQ['Intermedio'] }, emitida: '2026-01-01', vence: '2030-01-01', id: 'LIC-T-1' };
const swap = (key: string, mut: (p: Record<string, unknown>) => void) => {
  const [a, b, c] = key.split('.');
  const p = JSON.parse(Buffer.from(b, 'base64url').toString()); mut(p);
  return [a, Buffer.from(JSON.stringify(p)).toString('base64url'), c].join('.');
};

test('firma válida', () => {
  const { priv, pub } = pair();
  const r = verifyKey(signKey(base, priv), pub);
  assert.ok(r.ok);
  if (r.ok) { assert.equal(r.payload.cliente, 'Colegio X'); assert.deepEqual(r.payload.features, ['pos', 'planes']); }
});
test('payload alterado (plan/features/vence) se rechaza', () => {
  const { priv, pub } = pair();
  const k = signKey(base, priv);
  for (const mut of [(p: Record<string, unknown>) => { p.plan = 'Avanzado'; }, (p: Record<string, unknown>) => { p.vence = '2099-01-01'; }, (p: Record<string, unknown>) => { (p.features as string[]).push('ecf'); }]) {
    const r = verifyKey(swap(k, mut), pub);
    assert.ok(!r.ok && r.reason === 'firma');
  }
});
test('payload sin firma o con firma vacía se rechaza', () => {
  const { priv, pub } = pair();
  const [a, b] = signKey(base, priv).split('.');
  assert.ok(!verifyKey(`${a}.${b}.`, pub).ok);
  assert.ok(!verifyKey(`${a}.${b}`, pub).ok);
  assert.ok(!verifyKey(`${a}.${b}.${Buffer.alloc(64).toString('base64url')}`, pub).ok);
});
test('clave basura', () => {
  const { pub } = pair();
  for (const k of ['', 'hola', 'STODIA1.x.y', 'STODIA2.aaa.bbb', 'STODIA1..', 'STODIA1.a.b.c', '{"v":1}']) assert.ok(!verifyKey(k, pub).ok, k);
});
test('clave de otro par (otro emisor) se rechaza', () => {
  const a = pair(), b = pair();
  const r = verifyKey(signKey(base, a.priv), b.pub);
  assert.ok(!r.ok && r.reason === 'firma');
});
test('firma correcta pero payload mal formado se rechaza', () => {
  const { priv, pub } = pair();
  const r = verifyKey(signKey({ ...base, plan: 'Gratis' as never }, priv), pub);
  assert.ok(!r.ok && r.reason === 'payload');
});
test('vencida: firma válida, la fecha la evalúa la API', () => {
  const { priv, pub } = pair();
  const r = verifyKey(signKey({ ...base, vence: '2020-01-01' }, priv), pub);
  assert.ok(r.ok && r.payload.vence < new Date().toISOString().slice(0, 10));
});
