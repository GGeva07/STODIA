// Pruebas unitarias (sin BD) del pronto pago por DIAS DE ANTICIPACION: lib/descuentos.ts + compatibilidad prontoDia → prontoDias. Ejecutar: npx tsx scripts/probar-pronto.ts
import { calificaPronto, descuentoLinea, limiteProntoPago, prontoDePlan } from '../src/lib/descuentos';
import { prontoDiasDe } from '../src/lib/planes';

const p10 = prontoDePlan({ pronto: 5, prontoDias: 10 }); // 5 % pagando con >= 10 dias de anticipacion
const col = (vence: string, tipo = 'col') => ({ tipo, monto: 10000, vence });
let fallos = 0;
const t = (nombre: string, ok: boolean) => { console.log((ok ? 'OK    ' : 'FALLA ') + nombre); if (!ok) fallos++; };
const q = (vence: string, hoy: string, p = p10, tipo = 'col') => calificaPronto(col(vence, tipo), p, hoy) !== null;

t('vence el 20, N=10: pago el 10 (limite exacto) SI', q('20/11/2026', '2026-11-10'));
t('vence el 20, N=10: pago el 11 (un dia despues) NO', !q('20/11/2026', '2026-11-11'));
t('vence el 20, N=10: pago el 1 SI', q('20/11/2026', '2026-11-01'));
t('vence el 5, N=15: limite = 20 del mes anterior', limiteProntoPago('05/12/2026', 15) === '2026-11-20' && q('05/12/2026', '2026-11-20', prontoDePlan({ pronto: 5, prontoDias: 15 })) && !q('05/12/2026', '2026-11-21', prontoDePlan({ pronto: 5, prontoDias: 15 })));
t('cuota vencida NO (aunque el limite sea anterior)', !q('01/10/2026', '2026-10-11'));
t('cuota futura (vence 01/12) pagada el 11/10 SI; el 22/11 NO (limite 21/11)', q('01/12/2026', '2026-10-11') && q('01/12/2026', '2026-11-21') && !q('01/12/2026', '2026-11-22'));
t('fin de mes / anio: vence 05/01/2027 N=10 → limite 26/12/2026', limiteProntoPago('05/01/2027', 10) === '2026-12-26');
t('febrero: vence 05/03/2027 N=10 → limite 23/02/2027', limiteProntoPago('05/03/2027', 10) === '2027-02-23');
t('plan sin pronto (0 %) NO', !q('01/12/2026', '2026-10-11', prontoDePlan({ pronto: 0, prontoDias: 10 })));
t('plan con % pero N=0 NO', !q('01/12/2026', '2026-10-11', prontoDePlan({ pronto: 5, prontoDias: 0 })));
t('sin plan NO', !q('01/12/2026', '2026-10-11', null));
t('servicios no col (com/tra/srv/mat/mora) NO', ['com', 'tra', 'srv', 'mat', 'mora'].every(x => !q('01/12/2026', '2026-10-11', p10, x)));
const d = descuentoLinea(col('20/11/2026'), 'pronto', p10, '2026-11-05');
t('monto 500, motivo y detalle del tooltip', d?.monto === 500 && d.motivo === 'Pronto pago 5 %' && d.detalle === 'hasta el 10/11 (10 días antes del vencimiento)');
t('exoneracion de mora sin cambios', descuentoLinea({ tipo: 'mora', monto: 255, vence: '06/10/2026' }, 'exo', null, '2026-10-11')?.monto === 255);
// Compatibilidad con el campo antiguo prontoDia (dia limite del mes): N = dia − prontoDia si es positivo; si no, 0
t('legado PLN-001 (dia 1, prontoDia 3) → N=0', prontoDiasDe({ dia: '1', pronto: '5', prontoDia: '3' }) === 0);
t('legado dia 20, prontoDia 10 → N=10', prontoDiasDe({ dia: '20', pronto: '5', prontoDia: '10' }) === 10);
t('prontoDias nuevo manda sobre el legado', prontoDiasDe({ dia: '20', prontoDia: '10', prontoDias: '7' }) === 7);
t('sin ningun campo → 0', prontoDiasDe({ dia: '1' }) === 0);
console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo OK'); process.exit(fallos ? 1 : 0);
