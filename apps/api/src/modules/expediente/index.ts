import type { FastifyPluginAsync } from 'fastify';
import type { ExpCatalogoItem, ExpDoc, ExpFicha, ExpPersona, ExpServicio, ExpedienteResp, PersPlan } from '@stodia/shared';
import { prisma } from '../../db';
import { audit } from '../../lib/audit';
import { READONLY_ROLES, SEC_INC, algDe, gst, toAlumno } from '../../lib/personas';
import { fmtCed } from '../../lib/tutor-datos';
import { cuentaDerivada, estadoCuota, hoyISO, partesEnZona, zonaHoraria } from '../../lib/cxc';
import { MNAME, anioDeMes, reglaBeca, becasCatalogo, catalogoServicios, cicloActivo, getFinanzas, type CicloInfo, mesesCiclo, persPlan, planesPago, resolverPlan, tiposDocumentoRequeridos, vencDMY } from '../../lib/pers-fin';
import { anioInicio, cicloIdActivo, cicloReq, esCicloActivo, type CicloRow } from '../../lib/ciclo';
import { historialAcademico } from '../../lib/matricula';
import { notasDeCuenta } from '../../lib/notas-cuenta';
import { catKeyDe, fkDeCatKey } from '../../lib/servicios';
import { nowHM } from '../../fin-utils';

const fichaDefault = (ciclo: string): ExpFicha => ({
  carnet: '', ingreso: '', geo: '',
  medico: { sangre: '', seguro: '', poliza: '', condiciones: '', planAlim: '', planAlimExtra: '', emergenciaNombre: '', emergenciaTel: '', alertaDetalle: '' },
  conducta: { obs: [], record: 'Sin observaciones' }, hist: [],
  contrato: { ciclo, plan: '', beca: 'none', ctr: '', firmado: '' },
});

const persona = (t: { nombre: string; parentesco: string; cedula: string; tel: string } | null): ExpPersona | null =>
  t ? { nombre: t.nombre, parentesco: t.parentesco, cedula: fmtCed(t.cedula), tel: t.tel } : null;

/** «Beca X −10%»: los tipos del catálogo ya empiezan por «Beca» en varios casos; no se duplica el prefijo. */
const conBeca = (txt: string) => (/^beca\b/i.test(txt) ? txt : 'Beca ' + txt);

type ServRow = { id: string; kind: string; rutaId: string | null; aliPlanId: string | null; extraId: string | null; productoId: string | null; name: string; icon: string; spec: string; cost: number; corte: string; est: string; alert: string; fecha: string; st: string; mes: string; reciboId: string | null };
/** catKey (clave textual del catalogo) se deriva de la FK real (ServicioAlumno.rutaId / aliPlanId / extraId / productoId). */
const toServ = ({ reciboId, rutaId, aliPlanId, extraId, productoId, ...s }: ServRow): ExpServicio => ({ ...s, catKey: catKeyDe({ rutaId, aliPlanId, extraId, productoId }), kind: s.kind as ExpServicio['kind'], st: s.st as ExpServicio['st'], recibo: reciboId ?? '' });

const plugin: FastifyPluginAsync = async app => {
  const auth = { onRequest: [app.authenticate] };
  const canWrite = (rol: string) => !READONLY_ROLES.includes(rol);

  /** Ficha completa = JSON de PersExpediente + Contrato del ciclo activo + tutor legal (Alumno.tutorLegalId) + historial (Matricula y notas): contrato, tutor legal e historial viven en tablas con FK. */
  /** CicloInfo del ciclo pedido (Fase 2D): el activo trae su configuracion; otro ciclo solo lo identifica (nombre, año de inicio, id). */
  async function infoDe(c?: CicloRow): Promise<CicloInfo> {
    const act = await cicloActivo();
    if (!c || c.id === act.id) return act;
    const todos = await prisma.ciclo.findMany({ select: { nombre: true } });
    return { id: c.id, nombre: c.nombre, y0: anioInicio(c.nombre), configurado: true, otros: todos.map(x => x.nombre).filter(n => n !== c.nombre).sort().reverse() };
  }

  async function loadFicha(alumnoId: string, cicloSel?: CicloRow): Promise<ExpFicha> {
    const ciclo = await infoDe(cicloSel);
    const [r, ct, al, hist] = await Promise.all([
      prisma.persExpediente.findUnique({ where: { alumnoId } }),
      ciclo.id ? prisma.contrato.findUnique({ where: { alumnoId_cicloId: { alumnoId, cicloId: ciclo.id } }, include: { ciclo: { select: { nombre: true } } } }) : null,
      prisma.alumno.findUnique({ where: { id: alumnoId }, select: { tutorLegalId: true } }),
      historialAcademico(alumnoId),
    ]);
    const f: ExpFicha = r ? { ...fichaDefault(ciclo.nombre), ...JSON.parse(r.data) } : fichaDefault(ciclo.nombre);
    f.hist = hist; // el historial sale de Matricula + AcadNota (ya no del JSON de la ficha)
    f.contrato = ct ? { ciclo: ct.ciclo.nombre, plan: ct.planId, beca: ct.tipoBecaId ?? 'none', ctr: ct.ctr, firmado: ct.firmado } : { ...fichaDefault(ciclo.nombre).contrato };
    if (al?.tutorLegalId) f.tutorLegalId = al.tutorLegalId; else delete f.tutorLegalId;
    return f;
  }

  /** Calendario del ciclo activo: meses, año de inicio, hoy y mes actual (zona horaria de la institución). */
  async function calendario(planes: Awaited<ReturnType<typeof planesPago>>, cicloSel?: CicloRow) {
    const [ciclo, tz] = await Promise.all([infoDe(cicloSel), zonaHoraria()]);
    const meses = mesesCiclo(planes), { y, m, d } = partesEnZona(tz);
    const ultimo = meses[meses.length - 1];
    const fin = new Date(Date.UTC(anioDeMes(meses, ciclo.y0, ultimo), ultimo, 0)).toISOString().slice(0, 10);
    return { ciclo, meses, hoy: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, mesActual: m, finCiclo: fin };
  }

  /** Notas por materia/periodo y asistencia resumida del alumno en un ciclo NO activo (Fase 2D). */
  async function detalleCiclo(alumnoId: string, c: CicloRow): Promise<NonNullable<ExpedienteResp['cicloDetalle']>> {
    const [pers, rosters, asis] = await Promise.all([
      prisma.periodoAcademico.findMany({ where: { cicloId: c.id }, orderBy: { orden: 'asc' } }),
      prisma.acadRoster.findMany({ where: { alumnoId }, select: { id: true } }),
      prisma.asistenciaResumen.findMany({ where: { matricula: { alumnoId, cicloId: c.id } } }),
    ]);
    const notas = await prisma.acadNota.findMany({ where: { rosterId: { in: rosters.map(r => r.id) }, periodo: { cicloId: c.id } }, include: { materia: { select: { nombre: true } } } });
    const media = (n: { c1: number | null; c2: number | null; c3: number | null; c4: number | null; ex: number | null }) => { const v = [n.c1, n.c2, n.c3, n.c4, n.ex].filter((x): x is number => x != null); return v.length ? v.reduce((p, q) => p + q, 0) / v.length : null; };
    const r1 = (x: number) => Math.round(x * 10) / 10;
    const porMateria = new Map<string, (number | null)[]>();
    for (const n of notas) {
      const m = media(n), i = pers.findIndex(p => p.id === n.periodoId);
      if (m == null || i < 0) continue;
      const arr = porMateria.get(n.materia.nombre) ?? pers.map(() => null);
      arr[i] = r1(m); porMateria.set(n.materia.nombre, arr);
    }
    const filas = [...porMateria.entries()].sort((x, y) => x[0].localeCompare(y[0], 'es')).map(([materia, p]) => { const v = p.filter((x): x is number => x != null); return { materia, p, prom: v.length ? r1(v.reduce((a, b) => a + b, 0) / v.length) : null }; });
    const proms = filas.map(f => f.prom).filter((x): x is number => x != null);
    return {
      ciclo: c.nombre, cerrado: c.estado === 'Cerrado', notas: filas, promedio: proms.length ? r1(proms.reduce((a, b) => a + b, 0) / proms.length) : null,
      asistencia: asis.length ? { dias: asis.reduce((a, r) => a + r.diasLectivos, 0), presentes: asis.reduce((a, r) => a + r.presentes, 0), tardanzas: asis.reduce((a, r) => a + r.tardanzas, 0), ausJust: asis.reduce((a, r) => a + r.ausenciasJustificadas, 0), ausInjust: asis.reduce((a, r) => a + r.ausenciasInjustificadas, 0) } : null,
    };
  }

  async function bundle(id: string, cicloSel: CicloRow): Promise<ExpedienteResp | { error: string } | null> {
    const act = esCicloActivo(cicloSel);
    const a0 = await prisma.alumno.findUnique({ where: { id }, include: { tutor: true, ...SEC_INC } });
    if (!a0) return null;
    // Fase 2D: en otro ciclo el alumno se muestra con la seccion de su MATRICULA de ese ciclo (no la actual); sin matricula no hay expediente de ese ciclo.
    let a = a0;
    if (!act) {
      const m = await prisma.matricula.findUnique({ where: { alumnoId_cicloId: { alumnoId: id, cicloId: cicloSel.id } }, include: { seccion: { include: { grado: true, tanda: true } } } });
      if (!m) return { error: `${a0.nombres} ${a0.apellidos} no estuvo matriculado en el ciclo ${cicloSel.nombre}.` };
      a = { ...a0, seccionId: m.seccionId, seccion: m.seccion, estado: m.estado === 'Retirado' ? 'Retirado' : m.estado === 'Graduado' ? 'Egresado' : 'Activo' };
    }
    const [ficha, planes, fin, becasCat, catalogo] = await Promise.all([loadFicha(id, cicloSel), planesPago(), getFinanzas(), becasCatalogo(), catalogoServicios()]);
    const cal = await calendario(planes, cicloSel);
    let docs = await prisma.persDocumento.findMany({ where: { alumnoId: id }, include: { tipo: { select: { nombre: true } } }, orderBy: { orden: 'asc' } });
    if (!docs.length) {
      await prisma.persDocumento.createMany({ data: (await tiposDocumentoRequeridos()).map((t, i) => ({ id: `pdoc-${id}-${i}`, alumnoId: id, tipoId: t.id, f: 'Sin archivo', est: 'Pendiente', orden: i })) });
      docs = await prisma.persDocumento.findMany({ where: { alumnoId: id }, include: { tipo: { select: { nombre: true } } }, orderBy: { orden: 'asc' } });
    }
    const cicloId = cicloSel.id; // cuenta y becas del ciclo elegido (por defecto el ACTIVO)
    const [servicios, cuenta, legal, sibs, becas, becasPend] = await Promise.all([
      prisma.servicioAlumno.findMany({ where: { alumnoId: id, ...(act ? {} : { cargos: { some: { cicloId } } }) } }), // otro ciclo: solo los servicios que tuvieron cargos en ese ciclo
      prisma.finCobroItem.findMany({ where: { alumnoId: id, cicloId }, orderBy: { orden: 'asc' } }),
      a.tutorLegalId ? prisma.tutor.findUnique({ where: { id: a.tutorLegalId } }) : null,
      prisma.alumno.findMany({ where: { tutorId: a.tutorId, NOT: { id } }, include: SEC_INC }),
      prisma.finBeca.findMany({ where: { estado: 'Aprobada', cicloId }, include: { tipoBeca: true } }),
      prisma.finBeca.findMany({ where: { estado: 'Pendiente', cicloId, alumnoId: id }, include: { tipoBeca: true } }),
    ]);
    const tzCxc = await zonaHoraria(), hoyCxc = hoyISO(tzCxc);
    const { porCargo: notasPorCargo, movimientos: notasMov } = await notasDeCuenta(cuenta.map(c => ({ id: c.id, paid: c.paid, monto: c.monto })), tzCxc);
    const cicloDetalle = act ? undefined : await detalleCiclo(id, cicloSel);
    const full = (x: { nombres: string; apellidos: string }) => `${x.nombres} ${x.apellidos}`;
    const becaOf = (x: { id: string }) => becas.filter(b => b.alumnoId === x.id).map(b => `${b.tipoBeca.nombre} ${b.modo === 'pct' ? '−' : ''}${reglaBeca(b)}`);

    // El contrato guarda el id del plan (o la clave heredada '10'/'4'/'1'); se normaliza al plan real.
    const actual = resolverPlan(planes, ficha.contrato.plan);
    ficha.contrato = { ...ficha.contrato, plan: actual?.id ?? '' };
    const refPlanes: Record<string, PersPlan> = {};
    for (const p of planes) if (p.estado === 'Activo' || p.id === actual?.id) refPlanes[p.id] = persPlan(p, gst(a).tanda, fin, cal.ciclo.y0);
    const avisos: string[] = [];
    if (!Object.keys(refPlanes).length) avisos.push('Configura planes y precios: no hay Planes de Pago activos (Finanzas → Planes de Pago).');
    if (!cal.ciclo.configurado) avisos.push('Configura el ciclo lectivo activo en Configuración.');
    if (!catalogo.length) avisos.push('No hay servicios con precio configurado (rutas, planes de alimentación, actividades o productos).');
    return {
      alumno: { ...toAlumno(a), cuenta: (await cuentaDerivada(cicloId))(a.id) }, tutor: persona(a.tutor), legal: persona(legal), ficha,
      hermanos: sibs.map(s => ({ id: s.id, nombre: full(s), curso: `${gst(s).grado} ${gst(s).sec}`, beca: becaOf(s).map(conBeca).join(' · ') })),
      docs: docs.map(d => ({ id: d.id, n: d.tipo.nombre, f: d.f, est: d.est as ExpDoc['est'] })),
      servicios: servicios.map(toServ),
      cuenta: cuenta.map(c => ({ id: c.id, con: c.con, vence: c.vence, est: estadoCuota(c, hoyCxc), monto: c.monto, paid: c.paid, ...(notasPorCargo.get(c.id) ? { nc: notasPorCargo.get(c.id) } : {}) })),
      ...(notasMov.length ? { notas: notasMov } : {}),
      becasActivas: becaOf(a), becasPendientes: becasPend.map(b => `${b.tipoBeca.nombre} ${reglaBeca(b)}`), ...(cicloDetalle ? { cicloDetalle } : {}),
      ref: {
        planes: refPlanes,
        becas: Object.fromEntries(becasCat.map(b => [b.key, { nombre: b.nombre, pct: b.pct, aprobacion: b.aprobacion, tag: b.aprobacion ? 'Pendiente de aprobación' : 'Aprobada por Dirección' }])),
        catalogo, ciclos: [cal.ciclo.nombre, ...cal.ciclo.otros], meses: cal.meses, anio0: cal.ciclo.y0, hoy: cal.hoy, mesActual: cal.mesActual, finCiclo: cal.finCiclo, diaCorte: fin.diaCorte > 0 ? fin.diaCorte : 1, avisos,
      },
    };
  }

  app.get<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const r = await bundle(req.params.id, await cicloReq(req));
    if (!r) return reply.code(404).send({ error: 'Alumno no encontrado' });
    return 'error' in r ? reply.code(404).send({ error: r.error }) : r;
  });

  app.put<{ Params: { id: string }; Body: { plan: string; beca: string; motivo?: string } }>('/:id/contrato', auth, async (req, reply) => {
    if (!canWrite(req.user.rol)) return reply.code(403).send({ error: 'Sin permiso' });
    const { plan, beca } = req.body ?? ({} as { plan: string; beca: string });
    const [planes, becas, f] = await Promise.all([planesPago(), becasCatalogo(), loadFicha(req.params.id)]);
    const prev = resolverPlan(planes, f.contrato.plan), next = resolverPlan(planes, plan);
    if (!next || (next.estado !== 'Activo' && next.id !== prev?.id) || (beca !== 'none' && !becas.some(b => b.key === beca) && beca !== f.contrato.beca)) return reply.code(400).send({ error: 'Plan o beca inválidos' });
    const ciclo = await cicloActivo();
    if (!ciclo.id) return reply.code(409).send({ error: 'No hay un ciclo lectivo activo' });
    // PUERTA CERRADA: una beca/descuento NUNCA se escribe directo en el contrato. Cambiar el tipo de beca crea una SOLICITUD Pendiente en Becas y Convenios;
    // Contrato.tipoBecaId solo lo escribe la aprobación del Director (modules/becas). Quitar una beca vigente se hace revocándola allí.
    let becaPendiente: string | undefined;
    if (beca !== f.contrato.beca) {
      if (beca === 'none') {
        if (await prisma.finBeca.count({ where: { alumnoId: req.params.id, cicloId: ciclo.id, estado: 'Aprobada' } })) return reply.code(409).send({ error: 'Esta beca está vigente: para quitarla, revócala en Becas y Acuerdos.' });
      } else {
        const motivo = (req.body?.motivo ?? '').trim().slice(0, 300);
        if (!motivo) return reply.code(400).send({ error: 'Indica el motivo de la solicitud de beca' });
        const [tipo, conc, al, dup] = await Promise.all([
          prisma.tipoBeca.findUnique({ where: { id: beca } }), prisma.conceptoBeca.findFirst({ where: { estado: 'Activo', nombre: 'Colegiatura' } }),
          prisma.alumno.findUnique({ where: { id: req.params.id }, include: SEC_INC }),
          prisma.finBeca.count({ where: { alumnoId: req.params.id, cicloId: ciclo.id, tipoBecaId: beca, estado: { in: ['Pendiente', 'Aprobada'] } } }),
        ]);
        if (!tipo || !al) return reply.code(400).send({ error: 'Tipo de beca o alumno inválidos' });
        if (!conc) return reply.code(409).send({ error: 'Falta el concepto de beca «Colegiatura» en el catálogo de conceptos de beca' });
        if (dup) return reply.code(409).send({ error: 'Ya existe una solicitud pendiente o vigente de este tipo de beca para el alumno en este ciclo.' });
        const hoyTxt = new Date().toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const row = await prisma.finBeca.create({
          data: {
            id: String(Date.now()), cicloId: ciclo.id, alumnoId: al.id, est: `${al.nombres} ${al.apellidos}`, grado: `${gst(al).grado} ${gst(al).sec}`, tipoBecaId: tipo.id,
            modo: 'pct', valor: tipo.pct > 1 ? tipo.pct : Math.round(tipo.pct * 10000) / 100, conceptos: { create: [{ conceptoId: conc.id, orden: 0 }] },
            exp: `SOL-CTR-${al.code}-${ciclo.y0}`, estado: 'Pendiente', aprob: `Solicitada por ${req.user.nombre} · ${hoyTxt} · Plan ${next.name} · ${motivo}`,
          },
        });
        await audit(req.user, 'Insert', { tabla: 'Becas', id: row.id, next: `${tipo.nombre} · ${row.valor}% · ${row.est} · Pendiente (solicitada desde el contrato; plan ${next.name}; ${motivo})`, ip: req.ip });
        becaPendiente = row.id;
      }
    }
    await audit(req.user, 'Update', { tabla: 'Contrato', id: f.contrato.ctr || req.params.id, prev: `${f.contrato.plan}/${f.contrato.beca}`, next: `${next.id}/${f.contrato.beca}${becaPendiente ? ' (beca solicitada: pendiente)' : ''}`, ip: req.ip });
    // El contrato es una fila (Contrato) con FK a Plan y a Ciclo: «alumnos» de cada plan se cuenta desde aquí, sin contadores que puedan divergir.
    await prisma.contrato.upsert({
      where: { alumnoId_cicloId: { alumnoId: req.params.id, cicloId: ciclo.id } },
      update: { planId: next.id, ...(beca === 'none' ? { tipoBecaId: null } : {}) },
      create: { id: `ctr-${req.params.id}-${ciclo.y0}`, alumnoId: req.params.id, cicloId: ciclo.id, planId: next.id, tipoBecaId: null, ctr: f.contrato.ctr, firmado: f.contrato.firmado },
    });
    return becaPendiente ? { ok: true, becaPendiente } : { ok: true };
  });

  // Asigna un servicio del catálogo: recurrente (cuotas desde el mes de `fecha` hasta fin de ciclo o `cuotas`) o cargo único (vence en `fecha`).
  // Contrato nuevo: `fecha` aaaa-mm-dd (cargo único = fecha de cargo/vencimiento; recurrente = inicio), `dia` 1–31 (31 = último día del mes) y `cuotas` (solo recurrentes).
  // Contrato anterior (sin `fecha`): `mes` del ciclo; vence el día de corte de la institución.
  app.post<{ Params: { id: string }; Body: { catKey: string; spec: string; mes?: number; q?: number; fecha?: string; dia?: number; cuotas?: number } }>('/:id/servicios', auth, async (req, reply) => {
    if (!canWrite(req.user.rol)) return reply.code(403).send({ error: 'Sin permiso' });
    const { catKey, spec } = req.body ?? ({} as { catKey: string; spec: string });
    const q0 = req.body?.q === undefined ? 1 : Number(req.body.q);
    if (!Number.isInteger(q0) || q0 < 1 || q0 > 99) return reply.code(400).send({ error: 'Cantidad inválida (1 a 99)' });
    const [catalogo, planes, fin] = await Promise.all([catalogoServicios(), planesPago(), getFinanzas()]);
    const cc: ExpCatalogoItem | undefined = catalogo.find(c => c.k === catKey);
    const fk = cc ? fkDeCatKey(cc.k) : null;
    const a = await prisma.alumno.findUnique({ where: { id: req.params.id }, include: { tutor: true, ...SEC_INC } });
    const cal = await calendario(planes);
    if (!cal.ciclo.id) return reply.code(409).send({ error: 'No hay un ciclo lectivo activo' });
    const idxHoy = Math.max(0, cal.meses.indexOf(cal.mesActual));
    const diaCorte = fin.diaCorte > 0 ? fin.diaCorte : 1;
    const fechaIn = req.body?.fecha;
    // Fecha de inicio/cargo: la elegida (cualquier día dentro del ciclo) o, con el contrato anterior, el mes elegido.
    let mes: number, dd: number | null = null;
    if (fechaIn !== undefined && fechaIn !== null && fechaIn !== '') {
      const mm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fechaIn));
      if (!mm) return reply.code(400).send({ error: 'Fecha inválida (aaaa-mm-dd)' });
      const y = +mm[1], m = +mm[2], d = +mm[3];
      if (m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return reply.code(400).send({ error: 'Fecha inválida' });
      if (!cal.meses.includes(m) || anioDeMes(cal.meses, cal.ciclo.y0, m) !== y) return reply.code(400).send({ error: 'La fecha debe estar dentro del ciclo lectivo activo' });
      mes = m; dd = d;
    } else {
      mes = Number(req.body?.mes);
      if (!cal.meses.includes(mes) || cal.meses.indexOf(mes) < idxHoy) return reply.code(400).send({ error: 'Datos inválidos' });
    }
    if (!cc || !fk || !a) return reply.code(400).send({ error: 'Datos inválidos' });
    const idx = cal.meses.indexOf(mes);
    const diaIn = req.body?.dia === undefined || req.body?.dia === null ? null : Number(req.body.dia);
    if (diaIn !== null && (!Number.isInteger(diaIn) || diaIn < 1 || diaIn > 31)) return reply.code(400).send({ error: 'Día de cobro inválido (1 a 31)' });
    const dia = diaIn ?? diaCorte;
    const disp = cc.rec ? cal.meses.length - idx : 1;
    const nCuotas = req.body?.cuotas === undefined || req.body?.cuotas === null ? disp : Number(req.body.cuotas);
    if (!Number.isInteger(nCuotas) || nCuotas < 1 || nCuotas > disp) return reply.code(400).send({ error: `Número de cuotas inválido (1 a ${disp})` });
    const pad = (n: number) => String(n).padStart(2, '0');
    // Vencimiento de cada cuota: día `dia` del mes (31 o más que los días del mes = último día); la primera nunca antes de la fecha de inicio.
    // Cargo único con fecha: vence exactamente ese día.
    const venc = (m: number) => {
      const y = anioDeMes(cal.meses, cal.ciclo.y0, m);
      let d = Math.min(dia, new Date(Date.UTC(y, m, 0)).getUTCDate());
      if (dd !== null && (!cc.rec || (m === mes && d < dd))) d = dd;
      return vencDMY(d, m, y);
    };
    const meses = cc.rec ? cal.meses.slice(idx, idx + nCuotas) : [mes];
    const sid = `psv-${cc.k.replace(/\W/g, '')}${Date.now().toString(36)}`;
    const q = cc.rec ? 1 : q0; // la cantidad aplica a cargos únicos; las suscripciones recurrentes son 1 por mes
    const monto = Math.round(cc.price * q * 100) / 100;
    const name = (q > 1 ? `${q} × ` : '') + cc.l.split(' · ').pop()!;
    // Cargo único: con fecha de hoy o pasada queda cargado (pendiente de cobro) de inmediato; con fecha futura, programado (cancelable). Sin `fecha` (contrato anterior): programado salvo el mes en curso.
    const cargado = dd !== null ? venc(mes).split('/').reverse().join('-') <= cal.hoy : mes === cal.mesActual;
    // Artículo de inventario con stock limitado (prd:): la cantidad no puede exceder lo disponible (mismo criterio que resolverLineas del kiosko).
    if (!cc.rec && q > 1 && cc.stock != null && q > cc.stock) return reply.code(409).send({ error: `Solo hay ${cc.stock} unidades de ${cc.l}` });
    if (!cc.rec && cc.stock != null && cc.stock < 1) return reply.code(409).send({ error: `Sin stock de ${cc.l}` });
    const sp = spec?.trim() || cc.spec;
    const alert = cc.food && a.alergias.length ? 'Sin ' + a.alergias.map(x => x.alergia.nombre).join(' / ') : '';
    const prodId = !cc.rec && cc.k.startsWith('prd:') && cc.stock != null ? cc.k.slice(4) : null;
    try { await prisma.$transaction(async tx => {
    await tx.servicioAlumno.create({
      data: cc.rec
        ? { id: sid, alumnoId: a.id, kind: 'rec', ...fk, name, icon: cc.icon, spec: sp, cost: cc.price, corte: dia >= 31 ? 'Último día de cada mes' : `Día ${pad(dia)} de cada mes`, alert }
        : { id: sid, alumnoId: a.id, kind: 'once', ...fk, name: (q > 1 ? `${q} × ` : '') + (sp ? `${cc.l} · ${sp}` : cc.l), cost: monto, fecha: venc(mes), st: cargado ? 'cargado' : 'prog', mes: MNAME[mes] },
    });
    const base = 1000 + (await prisma.finCobroItem.count());
    await tx.finCobroItem.createMany({
      data: meses.map((m, i) => ({
        id: `${sid}-${m}`, alumnoId: a.id, tutorId: a.tutorId, servicioId: sid, cicloId: cal.ciclo.id!, con: `${name} · ${MNAME[m]}`, al: `${a.nombres.split(' ')[0]} · ${gst(a).grado} ${gst(a).sec}`, vence: venc(m), monto,
        est: estadoCuota({ vence: venc(m) }, cal.hoy) === 'Por vencer' ? 'Por vencer' : 'Pendiente', tipo: 'srv', orden: base + i,
      })),
    });
    if (prodId) {
      // Descuento atómico: solo si aún alcanza el stock; el movimiento queda referenciado al servicio para poder reponerlo al cancelar.
      const up = await tx.finProducto.updateMany({ where: { id: prodId, stock: { gte: q } }, data: { stock: { decrement: q } } });
      if (!up.count) throw new Error('STOCK');
      await tx.finMovimiento.create({ data: { t: nowHM(), tipo: 'Salida', productoId: prodId, name: cc.l, q: '−' + q, ref: sid } });
    }
    }); } catch (e) { if ((e as Error).message === 'STOCK') return reply.code(409).send({ error: `Stock insuficiente de ${cc.l}` }); throw e; }
    await audit(req.user, 'Insert', { tabla: 'Servicios', id: `${a.code}/${cc.k}`, prev: '—', next: `${meses.length} cargo(s) × ${cc.price}${q > 1 ? ' × ' + q + ' u.' : ''}`, ip: req.ip });
    return { id: sid, cargos: meses.length };
  });

  app.put<{ Params: { id: string; sid: string }; Body: { spec: string } }>('/:id/servicios/:sid', auth, async (req, reply) => {
    if (!canWrite(req.user.rol)) return reply.code(403).send({ error: 'Sin permiso' });
    const s = await prisma.servicioAlumno.findFirst({ where: { id: req.params.sid, alumnoId: req.params.id } });
    if (!s) return reply.code(404).send({ error: 'Servicio no encontrado' });
    await prisma.servicioAlumno.update({ where: { id: s.id }, data: { spec: req.body?.spec?.trim() || s.spec } });
    return { ok: true };
  });

  // Baja: marca el servicio y anula las cuotas futuras pendientes (no vencidas ni pagadas) en CxC.
    app.post<{ Params: { id: string; sid: string }; Body: { fecha: string } }>('/:id/servicios/:sid/baja', auth, async (req, reply) => {
    if (!canWrite(req.user.rol)) return reply.code(403).send({ error: 'Sin permiso' });
    const s = await prisma.servicioAlumno.findFirst({ where: { id: req.params.sid, alumnoId: req.params.id, kind: 'rec' } });
    const f = req.body?.fecha ?? '';
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return reply.code(400).send({ error: 'Datos inválidos' });
    await prisma.servicioAlumno.update({ where: { id: s.id }, data: { est: 'Baja · ' + f.split('-').reverse().join('/') } });
    // Solo se anulan las cuotas NO vencidas (la deuda vencida se deriva de la fecha, regla única de lib/cxc.ts).
    const hoy = hoyISO(await zonaHoraria());
    const cand = await prisma.finCobroItem.findMany({ where: { paid: false, servicioId: s.id }, select: { id: true, vence: true, est: true } });
    const del = await prisma.finCobroItem.deleteMany({ where: { id: { in: cand.filter(c => estadoCuota(c, hoy) !== 'Vencida').map(c => c.id) } } });
    await audit(req.user, 'Update', { tabla: 'Servicios', id: s.id, prev: 'Activo', next: 'Baja ' + f, ip: req.ip });
    return { anuladas: del.count };
  });

  app.delete<{ Params: { id: string; sid: string } }>('/:id/servicios/:sid', auth, async (req, reply) => {
    if (!canWrite(req.user.rol)) return reply.code(403).send({ error: 'Sin permiso' });
    const s = await prisma.servicioAlumno.findFirst({ where: { id: req.params.sid, alumnoId: req.params.id, kind: 'once', st: 'prog' } });
    if (!s) return reply.code(400).send({ error: 'Solo se cancelan cargos programados' });
    // Primero los cargos (referencian al servicio por FK), luego el servicio. Si descontó stock al asignarse, se repone (movimiento «Devolución»).
    const salidas = await prisma.finMovimiento.findMany({ where: { ref: s.id, tipo: 'Salida' } });
    await prisma.$transaction(async tx => {
      for (const m of salidas) {
        const q = Math.abs(parseInt(m.q.replace('−', '-'), 10)) || 0;
        const pr = await tx.finProducto.findUnique({ where: { id: m.productoId } });
        if (!pr || pr.stock == null || !q) continue;
        await tx.finProducto.update({ where: { id: pr.id }, data: { stock: pr.stock + q } });
        await tx.finMovimiento.create({ data: { t: nowHM(), tipo: 'Devolución', productoId: pr.id, name: pr.name, q: '+' + q, ref: 'DEV-' + s.id } });
      }
      await tx.finCobroItem.deleteMany({ where: { servicioId: s.id, paid: false } });
      await tx.servicioAlumno.delete({ where: { id: s.id } });
    });
    return { ok: true };
  });

  // Carga de documento (simulada como en el prototipo: aún no hay almacenamiento de archivos).
  app.put<{ Params: { id: string; did: string } }>('/:id/documentos/:did', auth, async (req, reply) => {
    if (!canWrite(req.user.rol)) return reply.code(403).send({ error: 'Sin permiso' });
    const d = await prisma.persDocumento.findFirst({ where: { id: req.params.did, alumnoId: req.params.id } });
    if (!d) return reply.code(404).send({ error: 'Documento no encontrado' });
    const tipo = await prisma.tipoDocumento.findUnique({ where: { id: d.tipoId } });
    const slug = (tipo?.nombre ?? d.tipoId).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    await prisma.persDocumento.update({ where: { id: d.id }, data: { est: 'En revisión', f: d.f === 'Sin archivo' ? `${slug}.pdf` : d.f } });
    return { ok: true };
  });
};
export default plugin;
