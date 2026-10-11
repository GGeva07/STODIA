// Prueba de humo de la tirilla del POS: docTirilla() + render de <Paper> con DTOs de cada tipo de comprobante; no debe lanzar ni dejar campos vacios.
// Uso: pnpm --filter @stodia/web exec node scripts/test-print-docs.mjs   (usa vite ssrLoadModule; no necesita navegador ni API)
import { createServer } from 'vite';
import React from 'react';
import { renderToString } from 'react-dom/server';

// stubs minimos del navegador para los modulos que leen storage al importarse
const mem = new Map();
globalThis.localStorage = globalThis.sessionStorage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), clear: () => mem.clear() };

const base = { id: 'REC-0001', ncf: 'B0200000001', tutor: 'Luis Hidalgo', hora: '10:15', monto: 17000, items: [{ con: 'Colegiatura Septiembre 2026', monto: 8500 }, { con: 'Colegiatura Octubre 2026', monto: 8500 }], pays: [{ m: 'Efectivo', amt: 17000 }], change: 0, fecha: '10/10/2026', cajero: 'Ana Rosario', caja: 'Caja 02', sucursal: 'Principal', est: 'Vigente' };
const tc = (codigo, nombre, modalidad = 'FISICA') => ({ codigo, nombre, modalidad });
const variantes = {
  'Consumo B02 efectivo': { ...base, tipoComprobante: tc('B02', 'Consumo') },
  'Consumo mixto efectivo+tarjeta con referencia': { ...base, tipoComprobante: tc('B02', 'Consumo'), pays: [{ m: 'Efectivo', amt: 10000 }, { m: 'Tarjeta de Crédito', r: 'AUT123', amt: 7000 }] },
  'Credito Fiscal B01 con RNC y razon social': { ...base, ncf: 'B0100000215', tipoComprobante: tc('B01', 'Crédito Fiscal'), clienteRnc: '131556782', clienteNombre: 'Empresa Prueba SRL' },
  'Gubernamental B15': { ...base, ncf: 'B1500000001', tipoComprobante: tc('B15', 'Gubernamental'), clienteRnc: '401007788', clienteNombre: 'Ministerio de Educación' },
  'Regimen Especial B14': { ...base, ncf: 'B1400000001', tipoComprobante: tc('B14', 'Régimen especial'), clienteRnc: '131556782', clienteNombre: 'Zona Franca SA', regimenEspecial: 'RE-2024-001' },
  'e-CF E31 pendiente DGII': { ...base, ncf: 'E310000000001', tipoComprobante: tc('E31', 'Crédito Fiscal electrónico', 'ELECTRONICA'), clienteRnc: '131556782', clienteNombre: 'Empresa Prueba SRL', estadoDgii: 'PendienteEnvio' },
  'e-CF E32 pendiente DGII': { ...base, ncf: 'E320000000001', tipoComprobante: tc('E32', 'Consumo electrónico', 'ELECTRONICA'), estadoDgii: 'PendienteEnvio' },
  'Abono con saldo': { ...base, abono: true, saldo: 200, monto: 3000, items: [{ con: 'Plan Comedor · Diciembre (abono)', monto: 3000 }], pays: [{ m: 'Efectivo', amt: 3000 }], tipoComprobante: tc('B02', 'Consumo') },
  'Con cambio a devolver': { ...base, pays: [{ m: 'Efectivo', amt: 20000 }], change: 3000, tipoComprobante: tc('B02', 'Consumo') },
  'Descuento pronto pago (monto reducido)': { ...base, monto: 11275, items: [{ con: 'Colegiatura Mayo 2027', monto: 8500 }, { con: 'Plan Comedor · Noviembre', monto: 3200 }], pays: [{ m: 'Efectivo', amt: 20000 }], change: 8725, tipoComprobante: tc('B02', 'Consumo') },
  'Anulado con NC': { ...base, est: 'Anulado', nc: 'B0400000001', tipoComprobante: tc('B02', 'Consumo') },
  'DTO minimo (Venta Rapida, sin campos fiscales ni de sesion)': { id: 'REC-9', ncf: 'B0200000009', tutor: 'Cliente', hora: '09:00', monto: 50, items: [{ con: 'Cuaderno', monto: 50 }], pays: [{ m: 'Efectivo', amt: 50 }], change: 0 },
  'DTO degradado (items/pays ausentes)': { id: 'REC-8', ncf: '', tutor: '', hora: '', monto: 0, change: 0 },
};

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', root: new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
let fallos = 0;
try {
  const { docTirilla, Paper } = await vite.ssrLoadModule('/src/components/finanzas/print.tsx');
  for (const [nombre, dto] of Object.entries(variantes)) {
    try {
      const doc = docTirilla(dto);
      if (doc.kind !== 'tirilla' || !doc.pages?.length || !doc.file) throw new Error('doc mal formado');
      const html = renderToString(React.createElement(Paper, { doc, pi: 0 }));
      if (dto.id && !html.includes(dto.id)) throw new Error('el HTML no contiene el id del recibo');
      if (dto.est === 'Anulado' && !html.includes('ANULADO') && !/anulado/i.test(html)) throw new Error('falta la marca de anulado');
      if (dto.tipoComprobante?.modalidad === 'ELECTRONICA' && !html.includes('e-NCF')) throw new Error('falta la etiqueta e-NCF');
      console.log('OK   ', nombre);
    } catch (e) { fallos++; console.log('FALLO', nombre, '->', e instanceof Error ? e.message : e); }
  }
} finally { await vite.close(); }
console.log(fallos ? `\n${fallos} variante(s) con fallo` : '\nTodas las variantes generan la tirilla sin excepciones');
process.exit(fallos ? 1 : 0);
