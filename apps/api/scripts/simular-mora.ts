// Simulacion (SIN escribir) de la pasada global de recargos por mora sobre la BD configurada.
import { generarMoras } from '../src/lib/mora';
import { prisma } from '../src/db';

(async () => {
  const r = await generarMoras({ simular: true });
  console.log(JSON.stringify({ moras: r.creadas, monto: r.monto, evaluadas: r.evaluadas }));
  console.log(r.detalle.slice(0, 8));
  await prisma.$disconnect();
})();
