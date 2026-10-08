import type { CSSProperties, ReactNode } from 'react';
import { Arrow, Circle, Squiggle, Underline } from './Doodles';

const d = (ms: number) => ({ ['--d' as string]: `${ms}ms` }) as CSSProperties;

function Check({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700"><i className="ph-bold ph-check text-sm" aria-hidden="true" /></span>
      <span>{children}</span>
    </li>
  );
}

/* ---------- Mockup 1: portal del tutor en un teléfono ---------- */
function PhoneMock() {
  return (
    <figure className="relative mx-auto w-[min(280px,78vw)]">
      <div className="shape -left-10 top-10 h-40 w-40 rounded-full bg-amber-200/70" data-parallax="0.12" aria-hidden="true" />
      <div className="shape -right-8 bottom-16 h-32 w-32 rounded-[45%] bg-sky-200/80" data-parallax="0.2" aria-hidden="true" />
      <div className="tilt relative">
        <span className="absolute -left-[3px] top-[18%] h-6 w-[3px] rounded-l-sm bg-slate-700" aria-hidden="true" />
        <span className="absolute -left-[3px] top-[26%] h-10 w-[3px] rounded-l-sm bg-slate-700" aria-hidden="true" />
        <span className="absolute -left-[3px] top-[35%] h-10 w-[3px] rounded-l-sm bg-slate-700" aria-hidden="true" />
        <span className="absolute -right-[3px] top-[28%] h-14 w-[3px] rounded-r-sm bg-slate-700" aria-hidden="true" />
        <div className="relative rounded-[2.6rem] bg-ink p-[5px] shadow-2xl shadow-slate-900/30 ring-1 ring-slate-700">
          <div className="relative overflow-hidden rounded-[2.2rem] bg-white" style={{ aspectRatio: '390 / 844' }}>
            <img
              src="/landing/portal-tutor.webp" width={780} height={1688}
              alt="Portal del tutor de STODIA en un teléfono: saldo pendiente, botón para pagar y lista de cuotas del estudiante"
              loading="lazy" decoding="async" className="block h-full w-full object-cover object-top"
            />
            <span className="pointer-events-none absolute left-1/2 top-[9px] h-[13px] w-[50px] -translate-x-1/2 rounded-full bg-ink" aria-hidden="true" />
          </div>
        </div>
      </div>
      <figcaption className="mt-4 text-center text-xs font-medium text-slate-600">Captura real de STODIA con datos de demostración</figcaption>
    </figure>
  );
}

/* ---------- Mockup 2: collage de tarjetas ---------- */
function CollageMock() {
  const students = [
    ['Estudiante A', '4.º B', '#DBEAFE', '#1D4ED8', 'Al día', true],
    ['Estudiante B', '6.º A', '#FCE7F3', '#BE185D', 'Al día', true],
    ['Estudiante C', '3.º C', '#DCFCE7', '#15803D', 'Pendiente', false],
    ['Estudiante D', '5.º A', '#FEF3C7', '#B45309', 'Al día', true],
  ] as const;
  return (
    <div className="relative mx-auto grid w-full max-w-[520px] gap-4 sm:grid-cols-2" role="img" aria-label="Ilustración de ejemplo: lista de estudiantes, barra de asistencia y conversación con una familia">
      <div className="shape -left-6 -top-6 h-36 w-36 rounded-full bg-violet-200/70" data-parallax="0.15" aria-hidden="true" />
      <div className="shape -bottom-6 right-0 h-32 w-32 rounded-[40%] bg-amber-200/80" data-parallax="0.1" aria-hidden="true" />
      <div className="relative sm:col-span-2" data-reveal="zoom" aria-hidden="true">
        <div className="tilt rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-900/10">
          <div className="mb-3 flex items-center justify-between"><div className="text-sm font-bold text-ink">Directorio de alumnos</div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700"><i className="ph ph-magnifying-glass" /> Buscar</span></div>
          <div className="divide-y divide-slate-100">
            {students.map(([n, g, bg, fg, st, ok]) => (
              <div key={n} className="flex items-center gap-3 py-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold" style={{ background: bg, color: fg }}>{n.slice(-1)}</span>
                <div className="min-w-0 flex-1 leading-tight"><div className="text-xs font-semibold text-ink">{n}</div><div className="text-[11px] text-slate-600">{g}</div></div>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${ok ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{st}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="relative" data-reveal="" style={d(120)} aria-hidden="true">
        <div className="tilt rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-900/10">
          <div className="flex items-center justify-between text-xs font-bold text-ink"><span>Asistencia de hoy</span><i className="ph-fill ph-user-check text-lg text-green-600" /></div>
          <div className="mt-1 tabnum text-2xl font-extrabold text-ink">27 <span className="text-sm font-medium text-slate-600">de 30</span></div>
          <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-100">
            <div className="bar-grow h-full bg-green-500" style={{ width: '90%' }} />
            <div className="h-full bg-amber-400" style={{ width: '6%' }} />
            <div className="h-full bg-rose-400" style={{ width: '4%' }} />
          </div>
          <div className="mt-2 flex gap-3 text-[10px] font-medium text-slate-700"><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-green-500" />Presentes</span><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-amber-400" />Tarde</span><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-rose-400" />Ausentes</span></div>
        </div>
      </div>
      <div className="relative" data-reveal="" style={d(240)} aria-hidden="true">
        <div className="tilt rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-900/10">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold text-ink"><i className="ph-fill ph-chats-circle text-lg text-violet-600" /> Mensajes</div>
          <div className="space-y-2 text-[11px] leading-snug">
            <div className="max-w-[88%] rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-slate-800">Buenos días, ¿cómo va la tarea de ciencias?</div>
            <div className="ml-auto max-w-[88%] rounded-2xl rounded-br-sm bg-accent px-3 py-2 text-white">Todo al día. La entrega es el viernes.</div>
          </div>
        </div>
      </div>
      <Arrow className="absolute -left-10 top-1/2 hidden -rotate-12 lg:block" color="#F59E0B" delay={500} flip />
    </div>
  );
}

/* ---------- Bento ---------- */
function ServerArt() {
  return (
    <svg viewBox="0 0 160 110" className="w-full max-w-[200px]" aria-hidden="true" focusable="false">
      <rect x="20" y="14" width="120" height="26" rx="8" fill="#fff" opacity=".95" /><circle cx="36" cy="27" r="4" fill="#22C55E" /><rect x="50" y="24" width="60" height="6" rx="3" fill="#CBD5E1" />
      <rect x="20" y="46" width="120" height="26" rx="8" fill="#fff" opacity=".95" /><circle cx="36" cy="59" r="4" fill="#22C55E" /><rect x="50" y="56" width="44" height="6" rx="3" fill="#CBD5E1" />
      <rect x="20" y="78" width="120" height="26" rx="8" fill="#fff" opacity=".95" /><circle cx="36" cy="91" r="4" fill="#FACC15" /><rect x="50" y="88" width="72" height="6" rx="3" fill="#CBD5E1" />
    </svg>
  );
}

function Bento() {
  const tile = 'tilt relative overflow-hidden rounded-3xl p-6 sm:p-7';
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-2" aria-label="Por qué STODIA">
      <li className="lg:col-span-2 lg:row-span-2" data-reveal="">
        <div className={`${tile} flex h-full flex-col justify-between bg-gradient-to-br from-blue-600 to-blue-800 text-white`}>
          <div>
            <i className="ph-fill ph-hard-drives text-4xl text-sky-200" aria-hidden="true" />
            <h3 className="mt-4 font-hand text-4xl font-bold leading-none">Tu servidor o el nuestro</h3>
            <p className="mt-3 max-w-md text-blue-50">Una instancia por colegio, con los datos aislados. Instálala en tu propia infraestructura con un asistente guiado, o deja que SynsetSolutions la aloje y mantenga por ti. Ambas opciones están incluidas en los planes.</p>
          </div>
          <div className="mt-6 flex justify-end"><ServerArt /></div>
        </div>
      </li>
      <li data-reveal="" style={d(80)}>
        <div className={`${tile} h-full bg-[#FEF9C3]`}>
          <i className="ph-fill ph-lock-key text-3xl text-amber-700" aria-hidden="true" />
          <h3 className="mt-3 text-lg font-bold text-ink">Tus datos son tuyos</h3>
          <p className="mt-1 text-sm text-slate-700">La información de tu colegio es tuya, en tu servidor o en tu instancia gestionada, y la puedes exportar.</p>
        </div>
      </li>
      <li data-reveal="" style={d(160)}>
        <div className={`${tile} h-full bg-[#DCFCE7]`}>
          <i className="ph-fill ph-tag text-3xl text-green-700" aria-hidden="true" />
          <h3 className="mt-3 text-lg font-bold text-ink">Un precio claro</h3>
          <p className="mt-1 text-sm text-slate-700">Planes Básico, Intermedio y Avanzado. Los límites de cada uno se ven en la pantalla de Licencia.</p>
        </div>
      </li>
      <li data-reveal="" style={d(240)}>
        <div className={`${tile} h-full bg-[#EDE9FE]`}>
          <i className="ph-fill ph-shield-check text-3xl text-violet-700" aria-hidden="true" />
          <h3 className="mt-3 text-lg font-bold text-ink">Roles y auditoría</h3>
          <p className="mt-1 text-sm text-slate-700">Seis roles con acceso a medida y un registro de las acciones importantes.</p>
        </div>
      </li>
      <li data-reveal="" style={d(320)}>
        <div className={`${tile} h-full bg-[#FFE4E6]`}>
          <i className="ph-fill ph-devices text-3xl text-rose-700" aria-hidden="true" />
          <h3 className="mt-3 text-lg font-bold text-ink">Web, móvil y escritorio</h3>
          <p className="mt-1 text-sm text-slate-700">Misma información en el navegador, la app Android y la aplicación de Windows.</p>
        </div>
      </li>
      <li className="sm:col-span-2" data-reveal="" style={d(120)}>
        <div className={`${tile} flex h-full items-center gap-5 bg-ink text-white`}>
          <span className="hidden h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/10 sm:flex"><i className="ph-fill ph-map-pin text-3xl text-yellow-300" aria-hidden="true" /></span>
          <div>
            <h3 className="text-lg font-bold">Pensado para República Dominicana</h3>
            <p className="mt-1 text-sm text-slate-200">Español dominicano, pesos dominicanos (DOP), RNC y la zona horaria de Santo Domingo desde la instalación.</p>
          </div>
        </div>
      </li>
    </ul>
  );
}

/* ---------- Sección con título manuscrito ---------- */
interface Block { id?: string; title: ReactNode; lead: string; bullets: string[]; cta: string; bg: string; reverse?: boolean; visual: ReactNode; curve?: boolean }

function Block({ id, title, lead, bullets, cta, bg, reverse, visual, curve }: Block) {
  return (
    <section id={id} className={`${curve ? 'curve-top' : ''} relative px-4 pb-32 sm:px-6 lg:pb-40 ${curve ? "" : "pt-20"} ${bg}`} aria-labelledby={`${id}-t`}>
      <div className={`mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-20 ${reverse ? 'lg:[&>*:first-child]:order-2' : ''}`}>
        <div data-reveal={reverse ? 'right' : 'left'}>{visual}</div>
        <div data-reveal={reverse ? 'left' : 'right'} style={d(120)}>
          <h2 id={`${id}-t`} className="font-hand text-5xl font-bold leading-[1.02] text-ink sm:text-6xl">{title}</h2>
          <p className="mt-5 text-lg text-slate-700">{lead}</p>
          <ul className="mt-6 space-y-3 text-slate-800">{bullets.map(b => <Check key={b}>{b}</Check>)}</ul>
          <a href="#demo" className="btn btn-ink mt-8">{cta} <i className="ph ph-arrow-right" aria-hidden="true" /></a>
        </div>
      </div>
    </section>
  );
}

export default function Features() {
  return (
    <div id="beneficios">
      <Block
        id="calidad" curve bg="bg-white"
        title={<>Mejora la <span className="relative inline-block">calidad<Underline color="#F59E0B" /></span> de tu trabajo</>}
        lead="Que los cobros, las notas y los avisos dejen de vivir en cuadernos y hojas sueltas. Las familias consultan por su cuenta y tu equipo responde menos llamadas."
        bullets={['Los tutores ven saldo, pagos y calificaciones desde el celular.', 'Cada cobro queda registrado y trazable por quien lo hizo.', 'Planes de pago y becas aplicados sin cálculos manuales.']}
        cta="Quiero verlo en acción"
        visual={<PhoneMock />}
      />
      <Block
        id="productividad" curve reverse bg="bg-[#FFF7E6]"
        title={<>Optimizado para mejorar la <span className="marker">productividad</span></>}
        lead="Pasar lista, buscar un expediente o contestar a una familia toma segundos. Cada pantalla está pensada para que el trabajo diario fluya."
        bullets={['Pase de lista desde el celular del docente, incluso en el salón.', 'Un solo expediente por estudiante con todo su historial.', 'Comunicación directa con familias y personal desde el mismo sistema.']}
        cta="Solicitar una demo"
        visual={<CollageMock />}
      />
      <section className="curve-top relative bg-white px-4 pb-32 sm:px-6 lg:pb-40" aria-labelledby="diseno-t">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto mb-12 max-w-3xl text-center" data-reveal="">
            <h2 id="diseno-t" className="font-hand text-5xl font-bold leading-[1.02] text-ink sm:text-6xl">
              Un software escolar <span className="relative inline-block">bien diseñado<Underline color="#2563EB" /></span>
            </h2>
            <p className="mt-6 text-lg text-slate-700">Sencillo para quien lo usa a diario y transparente para quien lo contrata.</p>
            <Squiggle className="mx-auto mt-3" />
          </div>
          <Bento />
          <div className="mt-10 flex justify-center">
            <span className="relative inline-block px-2 font-hand text-3xl font-bold text-ink">
              <Circle color="#F59E0B" />
              ¿Lo probamos juntos?
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
