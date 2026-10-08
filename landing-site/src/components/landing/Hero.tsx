import { Arrow, Sparkle, Underline } from './Doodles';
import { ModulesMarquee } from './Modules';

const BUBBLES = [
  { icon: 'ph-graduation-cap', bg: '#DBEAFE', fg: '#1D4ED8', pos: 'left-[5%] top-[26%]', r: '-8deg', fd: '0s', sp: 0.12 },
  { icon: 'ph-calendar-check', bg: '#FEF3C7', fg: '#B45309', pos: 'right-[6%] top-[22%]', r: '7deg', fd: '1.2s', sp: 0.2 },
  { icon: 'ph-cash-register', bg: '#DCFCE7', fg: '#15803D', pos: 'left-[11%] bottom-[16%]', r: '6deg', fd: '2s', sp: 0.16 },
  { icon: 'ph-chats-circle', bg: '#EDE9FE', fg: '#6D28D9', pos: 'right-[10%] bottom-[18%]', r: '-6deg', fd: '.6s', sp: 0.1 },
];
export default function Hero() {
  return <section aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-gradient-to-b from-[#EFF6FF] via-white to-white px-4 pt-32 sm:px-6 sm:pt-40" style={{ paddingBottom: 'calc(var(--curve) + 28px)' }}>
    <div className="absolute inset-0 -z-10" aria-hidden="true"><div className="shape -left-24 top-10 h-72 w-72 rounded-full bg-sky-200/50 blur-2xl" data-parallax="0.12" /><div className="shape -right-20 top-32 h-80 w-80 rounded-[40%_60%_55%_45%] bg-amber-200/50 blur-2xl" data-parallax="0.2" /><div className="shape bottom-0 left-1/3 h-56 w-56 rounded-full bg-indigo-200/40 blur-2xl" data-parallax="0.08" /></div>
    <div className="absolute inset-0 -z-10 hidden md:block" aria-hidden="true">{BUBBLES.map(b => <div key={b.icon} className={`absolute ${b.pos}`}><div className="shape !static" data-parallax={b.sp}><div className="float flex h-16 w-16 items-center justify-center rounded-2xl shadow-lg shadow-slate-900/10 lg:h-20 lg:w-20" style={{ background: b.bg, color: b.fg, ['--r' as string]: b.r, ['--fd' as string]: b.fd }}><i className={`ph-fill ${b.icon} text-3xl lg:text-4xl`} /></div></div></div>)}<Sparkle className="float absolute left-[24%] top-[18%]" /><Sparkle className="float absolute right-[26%] top-[40%] scale-75" color="#38BDF8" /></div>
    <div className="mx-auto max-w-4xl text-center"><h1 id="hero-title" className="hero-in font-hand text-[3.3rem] font-bold leading-[0.98] tracking-tight text-ink sm:text-7xl lg:text-[6.5rem]" style={{ ['--d' as string]: '80ms' }}>Tu colegio,{' '}<span className="relative inline-block text-accent">organizado<Underline color="#F59E0B" delay={700} /></span>{' '}y en un solo lugar</h1>
      <p className="hero-in mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-slate-700 sm:text-xl" style={{ ['--d' as string]: '220ms' }}>STODIA reúne inscripción, notas, asistencia, cobros, comedor y portal de tutores en un sistema que instalas en tu servidor o que alojamos por ti. Menos papeles, menos hojas de cálculo, más tiempo para educar.</p>
      <div className="hero-in mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row" style={{ ['--d' as string]: '340ms' }}><a href="#demo" className="btn btn-primary w-full sm:w-auto">Solicitar demo <i className="ph ph-arrow-right" aria-hidden="true" /></a><a href="#modulos" className="btn btn-ghost w-full sm:w-auto">Ver los módulos</a></div>
      <p className="hero-in mt-5 text-sm text-slate-600" style={{ ['--d' as string]: '440ms' }}>Sin compromiso. Te respondemos por correo y coordinamos una demostración con datos de ejemplo.</p>
      <div className="relative mx-auto mt-6 hidden h-16 w-full max-w-md md:block" aria-hidden="true"><Arrow className="absolute left-1/2 top-0 -translate-x-1/2 rotate-[8deg] opacity-80" color="#2563EB" delay={900} /></div>
    </div><div className="mt-12"><ModulesMarquee /></div>
  </section>;
}
