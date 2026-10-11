import type { FastifyPluginAsync } from 'fastify';
import type { CobroTurno, CobroCuenta, CobroComprobantes, CobroHijo, CobroMetodo, CobroItem, CobroProcesarReq, ReciboEnvioRes, ReciboListaRes } from '@stodia/shared';
import { prisma } from '../../db';
import { audit } from '../../lib/audit';
import { cfgGet } from '../../lib/sisconfig';
import { SEC_INC, digits, gst } from '../../lib/personas';
import { fmtCed } from '../../lib/tutor-datos';
import { RECIBO_INC, SUCURSAL, cajaDe, lineasData, metodoDe, metodoPagoIdDe, pagosData, reciboDto, type LineaRecibo } from '../../lib/recibos';
import { canalesGet, correoListo, proveedorDe } from '../../lib/canales';
import type { Prisma } from '@prisma/client';
import { cicloIdActivo, cicloReq, esCicloActivo } from '../../lib/ciclo';
import { nextSeq, nowHM, round2, supervisorOk } from '../../fin-utils';
import { estadoCuota, hoyISO, inicioDia, zonaHoraria } from '../../lib/cxc';
import { fmtCed as fmtCedula } from '../../lib/tutor-datos';
import { reglaBeca } from '../../lib/pers-fin';
import { anularRecibo, FILA_SELECT, notaFila, reembolsosEnRango } from '../../lib/notas';
import { responderNotaError, rutasNotas } from './notas';
import { resolverRnc, soloDigitos, longitudRncOk } from '../../lib/rnc-lookup';
import { FiscalError, TIPOS_COBRO, asignarNcf, contextoFiscal, disponibilidad, esTipoLogico, refrescarEstados, enSerie, transaccionFiscal, validarComprador } from '../../lib/fiscal';

/** Medios de pago ACTIVOS (tabla MetodoPago; «Efectivo» siempre existe: lib/catalogos-tipados.asegurarCatalogosBase). */
const metodos = async (): Promise<CobroMetodo[]> => {
  const rows = await prisma.metodoPago.findMany({ where: { estado: 'Activo' }, orderBy: { id: 'asc' } });
  const l = rows.map(r => ({ nombre: r.nombre, ref: r.ref || null }));
  return l.length ? l : [{ nombre: 'Efectivo', ref: null }];
};
/** Recibos recientes DE LA CUENTA consultada que devuelve /cobros/cuenta (el historial del turno es GET /cobros/turno). */
const RECIBOS_CUENTA = 20;
/** Franjas del turno (misma regla que web/components/finanzas/caja.ts `turnoAhora`): Matutino < 12:00, Vespertino 12:00-17:59, Nocturno >= 18:00. */
const TURNOS = [{ n: 'Matutino', h0: 0, h1: 12 }, { n: 'Vespertino', h0: 12, h1: 18 }, { n: 'Nocturno', h0: 18, h1: 24 }] as const;
const hh = (h: number) => String(h).padStart(2, '0');
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** El estado de la cuota se DERIVA de la fecha de vencimiento (regla única de lib/cxc.ts); el `est` guardado solo es respaldo si la fecha no se interpreta. */
const toItem = (r: { id: string; con: string; al: string; alumnoId: string; vence: string; monto: number; est: string; tipo: string; abono: boolean; notaDebitoId?: string | null }, hoy: string, ciclo?: string): CobroItem =>
  ({ id: r.id, con: r.con, al: r.al, kid: r.alumnoId, vence: r.vence, monto: r.monto, est: estadoCuota(r, hoy), tipo: r.tipo, abono: r.abono || undefined, ...(r.notaDebitoId ? { nd: r.notaDebitoId } : {}), ...(ciclo ? { ciclo } : {}) });
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const POS_ROLES = ['Super Admin', 'Cajero'] as const; // roles con acceso a la pantalla Cobros (lib/access.ts de la web)
/** Guiones de un RNC (9: 0-00-00000-0) o cédula (11: 000-0000000-0). */
const fmtId = (d: string) => d.length === 9 ? `${d.slice(0, 1)}-${d.slice(1, 3)}-${d.slice(3, 8)}-${d.slice(8)}` : d.length === 11 ? fmtCed(d) : d;
/** Identificación fiscal del tutor para el comprobante: su RNC propio si lo tiene (9/11 dígitos), si no su cédula. El Tutor no guarda una razón social aparte (razonSocialPropia = false). */
const identificacionFiscal = (t: { nombre: string; cedula: string; rnc: string | null }): NonNullable<CobroCuenta['fiscal']> => {
  const rnc = digits(t.rnc ?? ''), ced = digits(t.cedula);
  const id = longitudRncOk(rnc) ? rnc : ced;
  return { tieneIdentificacion: longitudRncOk(id) && !!t.nombre.trim(), identificacion: fmtId(id), nombre: t.nombre, esRnc: longitudRncOk(rnc) && rnc !== ced, razonSocialPropia: false };
};

const plugin: FastifyPluginAsync = async app => {
  const auth = { onRequest: [app.authenticate] };

  // Busca por cédula/RNC, carnet (matrícula), nombre del tutor o nombre del alumno contra Tutor/Alumno reales (tutor responsable).
  app.get<{ Querystring: { q?: string } }>('/cuenta', auth, async (req, reply) => {
    const q = norm(req.query.q ?? '').trim(), qd = digits(q), qa = q.replace(/[^a-z0-9]/g, '');
    if (q.length < 2) return reply.code(404).send({ error: 'Escribe una cédula, carnet o nombre para buscar' });
    const [tutores, alumnos] = await Promise.all([
      prisma.tutor.findMany({ select: { id: true, nombre: true, cedula: true, rnc: true, email: true, comprobanteHabitual: true } }),
      prisma.alumno.findMany({ select: { id: true, code: true, nombres: true, apellidos: true, tutorId: true } }),
    ]);
    // Puntaje de coincidencia: cédula/RNC o carnet exactos > carnet parcial > nombre del tutor > nombre del alumno.
    const cand = new Map<string, number>();
    const bump = (tid: string | null, n: number) => { if (tid && n > (cand.get(tid) ?? 0)) cand.set(tid, n); };
    for (const t of tutores) {
      const ced = digits(t.cedula), rnc = digits(t.rnc ?? '');
      if (qd.length >= 5 && (ced === qd || (rnc && rnc === qd))) bump(t.id, 100);
      else if (qd.length >= 5 && qd === q.replace(/[\s-]/g, '') && (ced.includes(qd) || (rnc && rnc.includes(qd)))) bump(t.id, 60);
      const nom = norm(t.nombre);
      if (nom === q) bump(t.id, 80); else if (nom.includes(q)) bump(t.id, 55);
    }
    for (const a of alumnos) {
      const code = norm(a.code).replace(/[^a-z0-9]/g, ''), num = a.id.replace(/\D/g, '');
      if (code === qa || (qd && qd.length <= 8 && /^(est)?-?\d+$/.test(q.replace(/\s/g, '')) && (a.id === qd || num === qd || code.endsWith(qd)))) bump(a.tutorId, 95);
      else if (qa.length >= 4 && code.includes(qa)) bump(a.tutorId, 70);
      const full = norm(a.nombres + ' ' + a.apellidos);
      if (full === q) bump(a.tutorId, 85); else if (full.includes(q)) bump(a.tutorId, 50);
    }
    const best = [...cand.entries()].sort((a, b) => b[1] - a[1])[0];
    const tut = best && tutores.find(t => t.id === best[0]);
    if (!tut) return reply.code(404).send({ error: 'No encontramos ninguna cuenta con «' + (req.query.q ?? '').trim() + '». Verifica la cédula, el carnet o el nombre.' });
    const ciclo = await cicloReq(req), act = esCicloActivo(ciclo); // Fase 2D: cuenta del ciclo elegido (X-Ciclo); por defecto el ACTIVO
    let hijosDb = await prisma.alumno.findMany({ where: { tutorId: tut.id }, include: SEC_INC, orderBy: { id: 'asc' } });
    if (!act) { // otro ciclo: solo los hijos matriculados entonces, con la seccion de ese ciclo
      const mats = await prisma.matricula.findMany({ where: { cicloId: ciclo.id, alumnoId: { in: hijosDb.map(h => h.id) } }, include: { seccion: { include: { grado: true, tanda: true } } } });
      const porAl = new Map(mats.map(m => [m.alumnoId, m]));
      hijosDb = hijosDb.filter(h => porAl.has(h.id)).map(h => ({ ...h, seccionId: porAl.get(h.id)!.seccionId, seccion: porAl.get(h.id)!.seccion }));
    }
    const hijos: CobroHijo[] = hijosDb.map(a => ({ id: a.id, kid: a.id, nombre: `${a.nombres.split(' ')[0]} ${a.apellidos.split(' ')[0]}`, corto: a.nombres.split(' ')[0], grado: gst(a).grado, sec: gst(a).sec, code: a.code }));
    const tz = await zonaHoraria(), hoy = hoyISO(tz);
    const cicloId = ciclo.id;
    const duenos = { OR: [{ tutorId: tut.id }, { alumnoId: { in: hijos.map(h => h.id) } }] };
    const [items, recibos, becas, anteriores] = await Promise.all([
      prisma.finCobroItem.findMany({ where: { paid: false, cicloId, ...duenos }, orderBy: { orden: 'asc' } }),
      prisma.finRecibo.findMany({ where: { tutorId: tut.id, cicloId }, include: RECIBO_INC, orderBy: { createdAt: 'desc' }, take: RECIBOS_CUENTA }).then(l => l.reverse()),
      prisma.finBeca.findMany({ where: { estado: 'Aprobada', cicloId, alumnoId: { in: hijosDb.map(a => a.id) } }, include: { tipoBeca: true, conceptos: { include: { concepto: true } } } }),
      // Deuda anterior: cargos sin pagar de ciclos CERRADOS (solo se muestra y se cobra desde el ciclo activo).
      act ? prisma.finCobroItem.findMany({ where: { paid: false, ciclo: { estado: 'Cerrado' }, OR: [{ tutorId: tut.id }, { alumnoId: { in: hijos.map(h => h.id) } }] }, orderBy: [{ cicloId: 'asc' }, { orden: 'asc' }], include: { ciclo: { select: { nombre: true } } } }) : Promise.resolve([]),
    ]);
    const becasTxt = becas.filter(b => b.conceptos.some(c => c.concepto.nombre.toLowerCase().includes('colegiatura'))).map(b => {
      const h = hijos.find(x => x.id === b.alumnoId), tipo = b.tipoBeca.nombre;
      return `${/^beca\b/i.test(tipo) ? '' : 'Beca '}${tipo} −${reglaBeca(b)} ya aplicada a la colegiatura de ${h?.corto ?? b.est}.`;
    });
    const res: CobroCuenta = { tutor: tut.nombre, cedula: fmtCed(tut.cedula), email: tut.email ?? undefined, hijos, becas: becasTxt, items: items.map(i => toItem(i, hoy)), recibos: recibos.map(r => reciboDto(r, tz)), ciclo: ciclo.nombre,
      comprobanteHabitual: esTipoLogico(tut.comprobanteHabitual) && TIPOS_COBRO.includes(tut.comprobanteHabitual) ? tut.comprobanteHabitual : null,
      datosFiscales: { rnc: digits(tut.rnc ?? '') || digits(tut.cedula), nombre: tut.nombre },
      fiscal: identificacionFiscal(tut),
      ...(act ? { deudaAnterior: anteriores.map(i => toItem(i, hoy, i.ciclo.nombre)) } : {}) };
    return res;
  });

  app.get('/metodos', auth, async () => metodos());

  /** Razón social de un RNC/cédula (tutores → recibos anteriores → DGII si está activada). Sin coincidencia: 200 con encontrado:false. */
  app.get<{ Params: { rnc: string } }>('/rnc/:rnc', { onRequest: [app.authenticate, app.requireRole(...POS_ROLES)] }, async req => resolverRnc(req.params.rnc));

  /** Tipos de comprobante que se pueden emitir al cobrar (los 4 logicos) con el prefijo que se usara segun la modalidad configurada y si hay secuencia disponible. */
  app.get('/comprobantes', auth, async (): Promise<CobroComprobantes> => {
    await refrescarEstados();
    const fin = await cfgGet('finanzas');
    return { tipos: await disponibilidad(), umbralConsumoIdentificado: Number(fin.umbralConsumoIdentificado ?? 250000), ecf: await cfgGet('ecf') };
  });

  /**
   * Turno del cajero autenticado: sus recibos (cajeroId = User.id, aunque sea Super Admin) del DIA DE HOY (zona horaria del perfil) dentro de la franja del
   * turno ACTUAL, anulados incluidos. createdAt es un instante UTC: la ventana se calcula como instantes UTC desde la medianoche local (inicioDia).
   * No depende del ciclo (los recibos siempre se emiten en el activo). Solo desarrollo: `?ahora=<ISO>` simula la hora actual (ignorado en produccion).
   */
  app.get<{ Querystring: { ahora?: string } }>('/turno', { onRequest: [app.authenticate, app.requireRole(...POS_ROLES)] }, async (req) => {
    const tz = await zonaHoraria();
    const sim = process.env.NODE_ENV !== 'production' && req.query.ahora ? new Date(req.query.ahora) : null;
    const ahora = sim && !isNaN(sim.getTime()) ? sim : new Date();
    const hoy = hoyISO(tz, ahora);
    const hora = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', hour: 'numeric' }).format(ahora));
    const t = TURNOS.find(x => hora >= x.h0 && hora < x.h1)!;
    const ini = inicioDia(hoy, tz).getTime(), sig = new Date(Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1, +hoy.slice(8, 10) + 1));
    const fin = t.h1 === 24 ? inicioDia(sig.toISOString().slice(0, 10), tz).getTime() : ini + t.h1 * 3600_000;
    const rows = await prisma.finRecibo.findMany({
      where: { cajeroId: req.user.sub, createdAt: { gte: new Date(ini + t.h0 * 3600_000), lt: new Date(fin) } },
      include: RECIBO_INC, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    // Cuadre: COBRADO BRUTO = recibos del turno (los anulados despues tambien: el dinero entro a la caja en este turno); DEVOLUCIONES = reembolsos de las notas de credito que ESTE cajero emitio
    // en la franja (el dinero sale de la caja cuando se devuelve, aunque el recibo sea de otro turno); NETO = bruto − devoluciones, por medio de pago.
    const recibos = rows.map(r => reciboDto(r, tz)), porMetodo: Record<string, number> = {};
    for (const r of rows) for (const p of r.pagos) { const m = p.metodoPago.nombre.startsWith('Tarjeta') ? 'Tarjeta' : p.metodoPago.nombre; porMetodo[m] = round2((porMetodo[m] ?? 0) + p.monto); }
    const bruto = round2(recibos.reduce((a, r) => a + r.monto, 0)), devPorMetodo: Record<string, number> = {};
    for (const d of await reembolsosEnRango(new Date(ini + t.h0 * 3600_000), new Date(fin), { cajeroId: req.user.sub })) { const m = d.metodo.startsWith('Tarjeta') ? 'Tarjeta' : d.metodo; devPorMetodo[m] = round2((devPorMetodo[m] ?? 0) + d.monto); }
    for (const [m, v] of Object.entries(devPorMetodo)) porMetodo[m] = round2((porMetodo[m] ?? 0) - v);
    const devoluciones = round2(Object.values(devPorMetodo).reduce((a, v) => a + v, 0));
    const notasTurno = await prisma.notaFiscal.findMany({ where: { cajeroId: req.user.sub, createdAt: { gte: new Date(ini + t.h0 * 3600_000), lt: new Date(fin) } }, select: FILA_SELECT, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    const cajaId = await cajaDe(req.user), caja = cajaId ? (await prisma.caja.findUnique({ where: { id: cajaId }, select: { codigo: true } }))?.codigo ?? '' : '';
    const res: CobroTurno = {
      turno: t.n, caja, sucursal: SUCURSAL, desde: `${hh(t.h0)}:00`, hasta: `${hh(t.h1 - 1)}:59`, recibos,
      resumen: { emitidos: recibos.length, anulados: recibos.filter(r => r.est === 'Anulado').length, netoActivo: round2(bruto - devoluciones), porMetodo, bruto, devoluciones, devolucionesPorMetodo: devPorMetodo },
      notas: notasTurno.map(n => notaFila(n, tz)),
    };
    return res;
  });

  app.post<{ Body: CobroProcesarReq }>('/procesar', auth, (req, reply) => enSerie(async () => {
    const { ids, discount, pays: rawPays, pin, cedula, intencionId } = req.body;
    const logico = req.body.tipoComprobante ?? 'CONSUMO';
    if (!esTipoLogico(logico) || !TIPOS_COBRO.includes(logico)) return reply.code(400).send({ error: 'Tipo de comprobante inválido (usa Crédito fiscal, Consumo, Gubernamental o Régimen especial)' });
    const cicloId = await cicloIdActivo();
    // Cargos del ciclo ACTIVO y deuda anterior (ciclos CERRADOS): el recibo SIEMPRE se emite en el ciclo activo; el cargo conserva su ciclo y solo pasa a pagado.
    const sel = await prisma.finCobroItem.findMany({ where: { id: { in: ids }, paid: false, ciclo: { estado: { in: ['Activo', 'Cerrado'] } } }, orderBy: [{ cicloId: 'asc' }, { orden: 'asc' }] });
    if (!sel.length) return reply.code(400).send({ error: 'Selecciona al menos un ítem' });
    if (discount === 'exo' && !(await supervisorOk(req, pin, 'cobro.exonerar'))) return reply.code(403).send({ error: 'Clave de supervisor inválida' });
    // Tutor del comprobante: el de la cédula de la cuenta cargada; si no se indicó, el del primer ítem; si tampoco, el tutor responsable del alumno.
    const cedBuscada = digits(cedula ?? '');
    const tutor = cedBuscada
      ? await prisma.tutor.findUnique({ where: { cedula: cedBuscada } })
      : sel[0].tutorId
        ? await prisma.tutor.findUnique({ where: { id: sel[0].tutorId } })
        : (await prisma.alumno.findUnique({ where: { id: sel[0].alumnoId }, include: { tutor: true } }))?.tutor ?? null;
    const tutorNombre = tutor?.nombre ?? 'Consumidor final';
    const sub = sel.reduce((a, i) => a + i.monto, 0);
    const prontoPct = (await cfgGet('finanzas')).descuentoProntoPct;
    if (discount === 'pronto' && !(prontoPct > 0)) return reply.code(400).send({ error: 'El descuento por pronto pago no está configurado' });
    let desc = 0;
    const hoyP = hoyISO(await zonaHoraria());
    if (discount === 'pronto') desc = sel.filter(i => i.tipo === 'col' && estadoCuota(i, hoyP) === 'Pendiente').reduce((a, i) => a + i.monto * (prontoPct / 100), 0);
    if (discount === 'exo') desc = sel.filter(i => i.tipo === 'mora').reduce((a, i) => a + i.monto, 0);
    const total = round2(sub - desc);
    const pays = rawPays.map(p => ({ m: p.m, r: p.r ?? '', amt: rawPays.length === 1 && p.a === '' ? total : parseFloat(p.a) || 0 }));
    const paid = pays.reduce((a, p) => a + p.amt, 0);
    const nonCash = pays.filter(p => p.m !== 'Efectivo').reduce((a, p) => a + p.amt, 0);
    if (total <= 0 || paid <= 0.001) return reply.code(400).send({ error: 'Ingresa el monto recibido' });
    if (nonCash > total + 0.001) return reply.code(400).send({ error: 'El monto no-efectivo excede el total' });
    const REFS = new Map((await metodos()).map(m => [m.nombre, m.ref]));
    if (pays.some(p => !REFS.has(p.m))) return reply.code(400).send({ error: 'Medio de pago no configurado' });
    if (pays.some(p => REFS.get(p.m) && !p.r.trim())) return reply.code(400).send({ error: 'Falta la referencia del medio de pago' });

    // Comprobante fiscal: datos del comprador y secuencia disponible se validan ANTES de consumir el numero de recibo (400 / 409 en español).
    // La razón social la fija el SERVIDOR: si el RNC/cédula se resuelve (tutores, recibos anteriores o DGII) se ignora el nombre que mande el cliente; si no, se usa el manual.
    const cuerpoFiscal = { ...req.body };
    const rncEnviado = soloDigitos(req.body.clienteRnc);
    if (longitudRncOk(rncEnviado)) {
      const r = await resolverRnc(rncEnviado);
      if (r.encontrado && r.razonSocial) cuerpoFiscal.clienteNombre = r.razonSocial;
      else if (logico !== 'CONSUMO' && String(req.body.clienteNombre ?? '').trim().length < 3) throw new FiscalError(400, 'RNC sin verificar: escribe la razón social del comprador (mínimo 3 caracteres)');
    }
    const comprador = await validarComprador(logico, total, cuerpoFiscal);
    await refrescarEstados();
    const disp = (await disponibilidad(prisma, [logico]))[0];
    if (!disp.disponible) throw new FiscalError(409, disp.motivo!);
    const ctxFiscal = await contextoFiscal(logico);

    const remaining = round2(total - paid), change = paid > total ? round2(paid - total) : 0;
    const abono = remaining > 0.001;
    const applied: LineaRecibo[] = [];
    const id = 'REC-' + String(await nextSeq('rec')).padStart(4, '0');
    const cajaId = await cajaDe(req.user);
    const metodoPagoId = await metodoPagoIdDe(pays);
    // Saldar cargos + emitir recibo en UNA transaccion: si algo falla no queda una cartera saldada sin comprobante.
    const pagosRows = await pagosData(id, pays); // valida el medio de pago contra el catalogo antes de tocar la cartera
    let fiscal!: Awaited<ReturnType<typeof asignarNcf>>;
    const row = await transaccionFiscal(async tx => {
      // PRIMER paso: el NCF/e-NCF (serializa las peticiones del mismo tipo en la fila de la secuencia antes de tocar cartera o recibos; se revierte si el cobro falla).
      fiscal = await asignarNcf(tx, logico, ctxFiscal);
      applied.length = 0;
      if (abono) {
        let left = paid;
        for (const i of sel) {
          if (left <= 0.001) break;
          const take = Math.min(left, i.monto);
          applied.push({ con: i.con + (take < i.monto - 0.001 ? ' (abono)' : ''), monto: take, cobroItemId: i.id });
          if (take >= i.monto - 0.001) await tx.finCobroItem.update({ where: { id: i.id }, data: { paid: true } });
          else await tx.finCobroItem.update({ where: { id: i.id }, data: { monto: round2(i.monto - take), abono: true } });
          left -= take;
        }
      } else {
        await tx.finCobroItem.updateMany({ where: { id: { in: sel.map(i => i.id) } }, data: { paid: true } });
      }
      const lineas: LineaRecibo[] = abono ? applied : sel.map(i => ({ con: i.con, monto: i.monto, cobroItemId: i.id }));
      await tx.finRecibo.create({
        data: {
          id, ncf: fiscal.ncf, tipoComprobanteId: fiscal.codigo, secuenciaFiscalId: fiscal.secuenciaFiscalId, modalidad: fiscal.modalidad, estadoDgii: fiscal.estadoDgii,
          clienteRnc: comprador.rnc, clienteNombre: comprador.nombre, regimenEspecial: comprador.regimen, tutor: tutorNombre, tutorId: tutor?.id ?? null, cajaId, cicloId, metodoPagoId, cajeroId: req.user.sub, hora: nowHM(), monto: abono ? paid : total, abono, saldo: abono ? remaining : 0,
          change: abono ? 0 : change,
        },
      });
      await tx.finReciboItem.createMany({ data: lineasData(id, lineas) });
      await tx.finReciboPago.createMany({ data: pagosRows });
      if (req.body.habitual && tutor) await tx.tutor.update({ where: { id: tutor.id }, data: { comprobanteHabitual: logico === 'CONSUMO' ? null : logico } });
      return tx.finRecibo.findUniqueOrThrow({ where: { id }, include: RECIBO_INC });
    });
    const ncf = fiscal.ncf;
    const metodo = metodoDe(pays);
    await audit(req.user, 'Insert', { tabla: 'Recibos', id, next: `${ncf} · ${metodo} · $${row.monto}${abono ? ' (abono)' : ''}`, ip: req.ip });
    // Cobro ligado a una intención de pago del portal (tipo cargos): se cierra con este recibo. Un abono parcial la deja pendiente.
    if (intencionId && !abono) {
      const ok = await prisma.mobPagoIntencion.updateMany({ where: { id: intencionId, estado: 'pendiente', tipo: 'cargos' }, data: { estado: 'confirmada', resuelto: new Date(), resueltoPorId: req.user.sub, reciboId: id } });
      if (ok.count) await audit(req.user, 'Update', { tabla: 'MobPagoIntencion', id: intencionId, prev: 'pendiente', next: 'confirmada · ' + id, ip: req.ip });
    }
    return reciboDto(row, await zonaHoraria());
  }));

  // Historial de recibos del POS: ciclo elegido (X-Ciclo), mas reciente primero, paginado; respuesta minima por fila.
  app.get<{ Querystring: { q?: string; desde?: string; hasta?: string; mios?: string; page?: string; size?: string } }>('/recibos', { onRequest: [app.authenticate, app.requireRole(...POS_ROLES)] }, async (req, reply) => {
    const { q = '', desde = '', hasta = '', mios } = req.query;
    if ((desde && !ISO_RE.test(desde)) || (hasta && !ISO_RE.test(hasta))) return reply.code(400).send({ error: 'Fecha inválida (usa AAAA-MM-DD)' });
    const size = Math.min(100, Math.max(1, parseInt(req.query.size ?? '25', 10) || 25)), page = Math.max(1, parseInt(req.query.page ?? '1', 10) || 1);
    const tz = await zonaHoraria(), ciclo = await cicloReq(req);
    const where: Prisma.FinReciboWhereInput = { cicloId: ciclo.id };
    const fecha: { gte?: Date; lt?: Date } = {};
    if (desde) fecha.gte = inicioDia(desde, tz);
    if (hasta) { const [y, m, d] = hasta.split('-').map(Number); fecha.lt = inicioDia(new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10), tz); }
    if (fecha.gte || fecha.lt) where.createdAt = fecha;
    if (mios === '1' || mios === 'true') where.cajeroId = req.user.sub;
    const term = q.trim().slice(0, 80), qd = digits(term);
    if (term) {
      const or: Prisma.FinReciboWhereInput[] = [{ id: { contains: term } }, { ncf: { contains: term } }, { tutor: { contains: term } }];
      if (/^\d+$/.test(term)) or.push({ id: { contains: term.padStart(4, '0') } });
      if (qd.length >= 3) or.push({ titular: { is: { cedula: { contains: qd } } } });
      where.OR = or;
    }
    const [total, agg, aggNc, rows] = await Promise.all([
      prisma.finRecibo.count({ where }),
      prisma.finRecibo.aggregate({ where: { ...where, est: { not: 'Anulado' } }, _sum: { monto: true } }),
      prisma.notaFiscal.aggregate({ where: { clase: 'CREDITO', recibo: { is: { ...where, est: { not: 'Anulado' } } } }, _sum: { monto: true } }), // notas de credito parciales de los recibos vigentes: la suma es NETA
      prisma.finRecibo.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * size, take: size, select: { id: true, ncf: true, modalidad: true, estadoDgii: true, tipoComprobante: { select: { codigo: true, nombre: true } }, monto: true, est: true, abono: true, nc: true, tutor: true, hora: true, createdAt: true, cajero: { select: { nombre: true } }, titular: { select: { cedula: true } } } }),
    ]);
    const acr = rows.length ? await prisma.notaFiscal.groupBy({ by: ['reciboId'], where: { reciboId: { in: rows.map(r => r.id) } }, _sum: { monto: true }, _count: { _all: true } }) : [];
    const acrC = rows.length ? await prisma.notaFiscal.groupBy({ by: ['reciboId'], where: { reciboId: { in: rows.map(r => r.id) }, clase: 'CREDITO' }, _sum: { monto: true } }) : [];
    const nNotas = new Map(acr.map(x => [x.reciboId!, x._count._all])), credito = new Map(acrC.map(x => [x.reciboId!, round2(x._sum.monto ?? 0)]));
    const fmtF = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    const res: ReciboListaRes = {
      total, suma: round2((agg._sum.monto ?? 0) - (aggNc._sum.monto ?? 0)), page, size,
      rows: rows.map(r => { const p = Object.fromEntries(fmtF.formatToParts(r.createdAt).map(x => [x.type, x.value])); return { id: r.id, ncf: r.ncf, tipoComprobante: { codigo: r.tipoComprobante.codigo, nombre: r.tipoComprobante.nombre, modalidad: r.modalidad as 'FISICA' | 'ELECTRONICA' }, estadoDgii: r.estadoDgii as 'NoAplica', monto: r.monto, est: r.est as 'Activo' | 'Anulado', abono: r.abono, nc: r.nc ?? undefined, tutor: r.tutor, cedula: r.titular ? fmtCedula(r.titular.cedula) : undefined, cajero: r.cajero?.nombre ?? 'Sistema', fecha: `${p.day}/${p.month}/${p.year}`, hora: r.hora, ...(nNotas.get(r.id) ? { notas: nNotas.get(r.id), acreditado: credito.get(r.id) ?? 0 } : {}) }; }),
    };
    return res;
  });

  // Mismo DTO que devuelve /procesar (reciboDto): el modal del recibo es identico tras emitir y desde el historial.
  app.get<{ Params: { id: string } }>('/recibos/:id', { onRequest: [app.authenticate, app.requireRole(...POS_ROLES)] }, async (req, reply) => {
    const r = await prisma.finRecibo.findUnique({ where: { id: req.params.id }, include: RECIBO_INC });
    if (!r) return reply.code(404).send({ error: 'Recibo no encontrado' });
    return reciboDto(r, await zonaHoraria());
  });

  // Reimpresion / envio por correo: no tocan contabilidad (permitidos tambien en ciclo cerrado: lib/ciclo.ESCRITURA_LIBRE). Siempre auditados.
  app.post<{ Params: { id: string } }>('/recibos/:id/reimprimir', { onRequest: [app.authenticate, app.requireRole(...POS_ROLES)] }, async (req, reply) => {
    const r = await prisma.finRecibo.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!r) return reply.code(404).send({ error: 'Recibo no encontrado' });
    await audit(req.user, 'Update', { tabla: 'Recibos', id: r.id, next: 'Reimpresión de recibo ' + r.id, ip: req.ip });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/recibos/:id/enviar', { onRequest: [app.authenticate, app.requireRole(...POS_ROLES)] }, async (req, reply): Promise<ReciboEnvioRes | void> => {
    const row = await prisma.finRecibo.findUnique({ where: { id: req.params.id }, include: RECIBO_INC });
    if (!row) return reply.code(404).send({ error: 'Recibo no encontrado' });
    const rec = reciboDto(row, await zonaHoraria());
    const destino = (rec.email ?? '').trim();
    if (!destino) return { ok: false, estado: 'Sin correo' };
    const prov = correoListo((await canalesGet()).email) ? await proveedorDe('Correo') : null;
    if (!prov) return { ok: false, estado: 'Canal no configurado', destino };
    const m = (n: number) => 'RD$ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const cuerpo = [`Comprobante ${rec.id} · ${rec.tipoComprobante?.nombre ?? ''} · ${rec.tipoComprobante?.modalidad === 'ELECTRONICA' ? 'e-NCF' : 'NCF'} ${rec.ncf}${rec.est === 'Anulado' ? ' · ANULADO' : ''}`, `Fecha: ${rec.fecha} ${rec.hora}`, `Cliente: ${rec.tutor}`, '', ...rec.items.map(i => `- ${i.con}: ${m(i.monto)}`), '', `${rec.abono ? 'Abono' : 'Total'}: ${m(rec.monto)}`, ...rec.pays.map(p => `${p.m}${p.r ? ' ' + p.r : ''}: ${m(p.amt)}`), '', 'Gracias por su pago.'].join('\n');
    try { await prov.enviar({ destino, asunto: 'Recibo ' + rec.id, cuerpo }); } catch { return reply.code(502).send({ error: 'No se pudo enviar el correo. Revisa el canal de correo en Configuración.' }); }
    await audit(req.user, 'Update', { tabla: 'Recibos', id: rec.id, next: `Envío de recibo ${rec.id} por correo a ${destino}`, ip: req.ip });
    return { ok: true, estado: 'Enviado', destino };
  });

  // ANULAR = nota de credito TOTAL (motivo 01) emitida por el servicio de notas (lib/notas.anularRecibo): reabre los cargos que el recibo habia pagado, devuelve el dinero por los mismos
  // medios y numera la nota B04/E34 en la misma transaccion. Misma ruta, PIN y forma de respuesta de siempre (el recibo).
  app.post<{ Params: { id: string }; Body: { pin?: string } }>('/recibos/:id/anular', auth, (req, reply) => enSerie(async () => {
    try {
      await anularRecibo(req, req.params.id, req.body?.pin);
    } catch (e) { return responderNotaError(reply, e); }
    const upd = await prisma.finRecibo.findUniqueOrThrow({ where: { id: req.params.id }, include: RECIBO_INC });
    return reciboDto(upd, await zonaHoraria());
  }));

  await rutasNotas(app, POS_ROLES);
};
export default plugin;
