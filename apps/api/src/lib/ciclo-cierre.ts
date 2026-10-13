/**
 * CIERRE DEL AÑO ESCOLAR (EOY) = cierre CONTABLE / ADMINISTRATIVO y de EDICION del ciclo. Decision de negocio (docs/cierre-y-promocion.md):
 * «el cierre del año escolar NO pasa estudiantes a un proximo curso: cierra a nivel contable las finanzas y para edicion el año escolar».
 * La promocion de curso es un proceso SEPARADO basado en las notas (lib/promocion.ts) que puede ejecutarse antes o despues del cierre.
 *
 * Que hace `cerrarCiclo`:
 *  1) Valida: el ciclo es el ACTIVO y existe un ciclo Planificado siguiente (se exige: toda la app trabaja sobre UN ciclo activo —indice
 *     UX_Ciclo_activo, cicloIdActivo()— y cerrar sin sucesor dejaria la instalacion sin ciclo activo).
 *  2) Calcula el RESUMEN FINANCIERO del ciclo (resumenFinancieroCiclo) y lo guarda como foto inmutable en CierreCiclo (totales + deuda por alumno).
 *  3) Marca el ciclo Cerrado (solo lectura: hook global de app.ts → 409 CICLO_CERRADO) y activa el Planificado siguiente.
 *  4) NO promueve, NO cambia grados ni crea matriculas. Las matriculas del ciclo cerrado se conservan TAL CUAL (estado 'Activo' = «curso ese año»;
 *     la promocion las pasa a Promovido / Repitente / Graduado). No se introduce un estado 'Cursado': CK_Matricula_estado (lib/db-indices.ts) solo
 *     admite Activo | Retirado | Promovido | Repitente | Graduado y los reportes ya leen 'Activo' de un ciclo cerrado como alumno de ese ciclo.
 *  5) Coherencia Alumno ↔ Matricula al cambiar el ciclo activo (invariante de lib/matricula.ts: Alumno.seccionId = seccion del ciclo ACTIVO). Solo
 *     para alumnos que YA tienen matricula en el ciclo que se activa (pre-inscritos nuevos o promocion aplicada antes del cierre):
 *       - Alumno.seccionId ← la seccion de esa matricula; 'Preinscrito' → 'Activo'.
 *     Y para los que la promocion ya marco Graduado en el ciclo que se cierra (sin matricula en el siguiente): Alumno.estado ← 'Egresado'.
 *     Son decisiones tomadas antes (inscripcion / promocion); el cierre solo las hace efectivas al cambiar de ciclo. El resto de alumnos queda intacto.
 *
 * La cartera pendiente del ciclo cerrado SIGUE COBRABLE: el POS la muestra como «deuda anterior» desde el ciclo activo (modules/cobros: /cuenta y
 * /procesar aceptan cargos de ciclos Cerrados; el recibo se emite en el ciclo activo). Reimprimir / enviar recibos del ciclo cerrado: lib/ciclo.ESCRITURA_LIBRE.
 */
import type { CierreDeudaAlumno, CierreResumen } from '@stodia/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { CicloError } from './ciclo';
import { hoyISO, round2, saldoCuenta, zonaHoraria } from './cxc';

type Db = typeof prisma | Prisma.TransactionClient;
const trozos = <T>(l: T[], n = 800) => Array.from({ length: Math.ceil(l.length / n) }, (_, i) => l.slice(i * n, (i + 1) * n));
type Totales = Omit<CierreResumen, 'ciclo' | 'estado' | 'siguiente' | 'cerrado'>;

/**
 * Totales RD$ de un ciclo (solo lectura):
 *  - cobrado        = Σ FinRecibo.monto de recibos VIGENTES (est ≠ Anulado) emitidos en el ciclo (caja del ciclo; incluye cobros de deuda anterior).
 *  - notasCredito   = Σ notas de CREDITO emitidas en el ciclo; notasDebito = Σ notas de DEBITO.
 *  - cobradoNeto    = cobrado − notas de credito sobre recibos vigentes del ciclo (misma regla que el historial del POS).
 *  - pendiente      = Σ monto de los cargos SIN PAGAR del ciclo (FinCobroItem.paid = false); vencido = su parte vencida (cxc.saldoCuenta, hoy).
 *  - facturado      = Σ monto bruto de las lineas de recibos vigentes que cobraron cargos DEL ciclo + pendiente (cargos del ciclo, cobrados o no).
 *  - descuentos     = Σ descuento de esas lineas (pronto pago, exoneraciones).
 *  - mora           = Σ cargos tipo 'mora' del ciclo (cobrados: lineas; pendientes: monto) ; moraPendiente = su parte sin pagar.
 *  - deudaAlumnos   = deuda vigente por alumno (pendiente/vencido/cargos), de mayor a menor.
 */
export async function resumenFinancieroCiclo(cicloId: string, db: Db = prisma): Promise<Totales> {
  const vigente = { cicloId, est: { not: 'Anulado' } };
  const [rec, anulados, ncVig, nc, nd, lineas, pend, cargos, matriculas] = await Promise.all([
    db.finRecibo.aggregate({ where: vigente, _sum: { monto: true }, _count: { _all: true } }),
    db.finRecibo.count({ where: { cicloId, est: 'Anulado' } }),
    db.notaFiscal.aggregate({ where: { clase: 'CREDITO', recibo: { is: vigente } }, _sum: { monto: true } }),
    db.notaFiscal.aggregate({ where: { cicloId, clase: 'CREDITO', estado: 'Emitida' }, _sum: { monto: true } }),
    db.notaFiscal.aggregate({ where: { cicloId, clase: 'DEBITO', estado: 'Emitida' }, _sum: { monto: true } }),
    db.finReciboItem.findMany({ where: { recibo: { est: { not: 'Anulado' } }, cobroItem: { is: { cicloId } } }, select: { monto: true, descuento: true, cobroItem: { select: { tipo: true } } } }),
    db.finCobroItem.findMany({ where: { cicloId, paid: false }, select: { alumnoId: true, monto: true, vence: true, est: true, tipo: true } }),
    db.finCobroItem.count({ where: { cicloId } }),
    db.matricula.count({ where: { cicloId } }),
  ]);
  const hoy = hoyISO(await zonaHoraria());
  const sal = saldoCuenta(pend, hoy);
  const cobradoCargos = lineas.reduce((a, l) => a + l.monto, 0), descuentos = lineas.reduce((a, l) => a + (l.descuento ?? 0), 0);
  const moraCobrada = lineas.filter(l => l.cobroItem?.tipo === 'mora').reduce((a, l) => a + l.monto, 0);
  const moraPendiente = pend.filter(p => p.tipo === 'mora').reduce((a, p) => a + p.monto, 0);
  // Deuda por alumno
  const porAl = new Map<string, typeof pend>();
  for (const p of pend) porAl.set(p.alumnoId, [...(porAl.get(p.alumnoId) ?? []), p]);
  const als = porAl.size ? await db.alumno.findMany({ where: { id: { in: [...porAl.keys()] } }, select: { id: true, code: true, nombres: true, apellidos: true, seccion: { select: { letra: true, grado: { select: { nombre: true } } } } } }) : [];
  const deudaAlumnos: CierreDeudaAlumno[] = als.map(a => {
    const l = porAl.get(a.id)!, s = saldoCuenta(l, hoy);
    return { alumnoId: a.id, code: a.code, nombre: `${a.nombres} ${a.apellidos}`.trim(), seccion: `${a.seccion.grado.nombre} ${a.seccion.letra}`, pendiente: s.total, vencido: s.vencido, cargos: l.length };
  }).sort((x, y) => y.pendiente - x.pendiente || x.nombre.localeCompare(y.nombre, 'es'));
  const cobrado = round2(rec._sum.monto ?? 0);
  return {
    facturado: round2(cobradoCargos + sal.total), cobrado, notasCredito: round2(nc._sum.monto ?? 0), notasDebito: round2(nd._sum.monto ?? 0),
    cobradoNeto: round2(cobrado - (ncVig._sum.monto ?? 0)), descuentos: round2(descuentos), pendiente: sal.total, vencido: sal.vencido,
    mora: round2(moraCobrada + moraPendiente), moraPendiente: round2(moraPendiente), recibos: rec._count._all, recibosAnulados: anulados,
    cargos, cargosPendientes: pend.length, alumnosConDeuda: deudaAlumnos.length, matriculas, deudaAlumnos,
  };
}

const siguientePlanificado = (db: Db = prisma) => db.ciclo.findFirst({ where: { estado: 'Planificado' }, orderBy: { fechaInicio: 'asc' } });

/** Vista previa del cierre (o el snapshot guardado si el ciclo ya esta Cerrado). `top` limita la lista de deudores devuelta. */
export async function resumenCierre(nombre: string, top = 50): Promise<CierreResumen> {
  const c = await prisma.ciclo.findUnique({ where: { nombre }, include: { cierre: true } });
  if (!c) throw new CicloError(`El ciclo lectivo «${nombre}» no existe`, 404);
  const base = { ciclo: c.nombre, estado: c.estado as CierreResumen['estado'] };
  if (c.cierre) {
    const { id: _id, cicloId: _c, cicloSiguiente, fecha, usuario, usuarioNombre, deudaAlumnos, ...tot } = c.cierre;
    const deuda = JSON.parse(deudaAlumnos) as CierreDeudaAlumno[];
    return { ...base, siguiente: cicloSiguiente, ...tot, deudaAlumnos: deuda.slice(0, top), cerrado: { fecha: fecha.toISOString(), usuario, usuarioNombre } };
  }
  const [tot, next] = await Promise.all([resumenFinancieroCiclo(c.id), siguientePlanificado()]);
  return { ...base, siguiente: next?.nombre ?? null, ...tot, deudaAlumnos: tot.deudaAlumnos.slice(0, top) };
}

export interface ResultadoCierre { activo: string; resumen: CierreResumen; alineados: number; egresados: number }

/** Cierre contable/administrativo del ciclo ACTIVO (ver cabecera). Una sola transaccion; idempotente por CierreCiclo.cicloId unico. */
export async function cerrarCiclo(nombre: string, user: { usuario: string; nombre?: string }): Promise<ResultadoCierre> {
  const [cur, next] = await Promise.all([prisma.ciclo.findUnique({ where: { nombre }, include: { cierre: { select: { id: true } } } }), siguientePlanificado()]);
  if (!cur || cur.estado !== 'Activo') throw new CicloError('Solo se puede cerrar el ciclo activo');
  if (!next) throw new CicloError('Crea primero el ciclo siguiente para poder cerrar este');
  if (cur.cierre) throw new CicloError('Este ciclo ya tiene un cierre registrado', 409);
  const tot = await resumenFinancieroCiclo(cur.id);
  // Coherencia Alumno <-> Matricula del ciclo que se activa (solo decisiones ya tomadas; ver punto 5 de la cabecera).
  const [yaNext, graduadosCur] = await Promise.all([
    prisma.matricula.findMany({ where: { cicloId: next.id, estado: { in: ['Activo', 'Reservado'] }, alumno: { estado: { in: ['Activo', 'Inactivo', 'Preinscrito'] } } }, select: { alumnoId: true, seccionId: true } }), // 'Reservado' = reinscripcion pendiente de pago (Etapa B): el alumno ya ocupa esa seccion
    prisma.matricula.findMany({ where: { cicloId: cur.id, estado: 'Graduado', alumno: { estado: { in: ['Activo', 'Inactivo'] } } }, select: { alumnoId: true } }),
  ]);
  const conNext = new Set(yaNext.map(m => m.alumnoId));
  const egresan = graduadosCur.map(m => m.alumnoId).filter(id => !conNext.has(id));
  const porSeccion = new Map<string, string[]>();
  for (const m of yaNext) porSeccion.set(m.seccionId, [...(porSeccion.get(m.seccionId) ?? []), m.alumnoId]);
  await prisma.$transaction(async tx => {
    await tx.cierreCiclo.create({
      data: {
        cicloId: cur.id, cicloSiguiente: next.nombre, usuario: user.usuario, usuarioNombre: user.nombre ?? '',
        facturado: tot.facturado, cobrado: tot.cobrado, notasCredito: tot.notasCredito, notasDebito: tot.notasDebito, cobradoNeto: tot.cobradoNeto, descuentos: tot.descuentos,
        pendiente: tot.pendiente, vencido: tot.vencido, mora: tot.mora, moraPendiente: tot.moraPendiente, recibos: tot.recibos, recibosAnulados: tot.recibosAnulados,
        cargos: tot.cargos, cargosPendientes: tot.cargosPendientes, alumnosConDeuda: tot.alumnosConDeuda, matriculas: tot.matriculas, deudaAlumnos: JSON.stringify(tot.deudaAlumnos),
      },
    });
    for (const [seccionId, ids] of porSeccion) for (const ch of trozos(ids)) await tx.alumno.updateMany({ where: { id: { in: ch } }, data: { seccionId } });
    for (const ch of trozos([...conNext])) await tx.alumno.updateMany({ where: { id: { in: ch }, estado: 'Preinscrito' }, data: { estado: 'Activo' } });
    for (const ch of trozos(egresan)) await tx.alumno.updateMany({ where: { id: { in: ch } }, data: { estado: 'Egresado' } });
    // Estados del ciclo (primero el que se cierra: UX_Ciclo_activo admite UN solo Activo)
    await tx.ciclo.update({ where: { id: cur.id }, data: { estado: 'Cerrado' } });
    await tx.ciclo.update({ where: { id: next.id }, data: { estado: 'Activo' } });
  }, { timeout: 300_000, maxWait: 60_000 });
  return { activo: next.nombre, resumen: await resumenCierre(nombre), alineados: conNext.size, egresados: egresan.length };
}
