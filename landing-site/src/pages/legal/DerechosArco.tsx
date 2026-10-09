import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import LegalLayout, { S } from './LegalLayout';
import { SITE, LEGAL_ROUTES } from '../../lib/site';

const SECTIONS = [
  { id: 'derechos', title: '1. Sus derechos' },
  { id: 'a-quien', title: '2. A quién dirigirse' },
  { id: 'requisitos', title: '3. Requisitos' },
  { id: 'menores', title: '4. Menores de edad' },
  { id: 'plazos', title: '5. Plazos y respuesta' },
  { id: 'plantilla', title: '6. Plantilla de solicitud' },
  { id: 'reclamo', title: '7. Si no está conforme' },
];

const TIPOS = [
  { v: 'Acceso', d: 'Conocer qué datos suyos tratamos, para qué y con quién se comparten.' },
  { v: 'Rectificación', d: 'Corregir o actualizar datos inexactos o incompletos.' },
  { v: 'Cancelación / Supresión', d: 'Eliminar datos que ya no son necesarios o se tratan sin base legítima.' },
  { v: 'Oposición', d: 'Oponerse a un tratamiento concreto o revocar su consentimiento.' },
  { v: 'Portabilidad', d: 'Recibir sus datos en formato estructurado, cuando sea técnicamente viable.' },
];

const inp = 'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30';

export default function DerechosArco() {
  const [f, setF] = useState({ tipo: 'Acceso', nombre: '', doc: '', correo: '', rol: 'Titular', menor: '', institucion: '', detalle: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const href = useMemo(() => {
    const asunto = `Solicitud de derecho de ${f.tipo} (Ley 172-13)`;
    const cuerpo = [
      'Solicitud de ejercicio de derechos sobre datos personales (Ley núm. 172-13)',
      '',
      `Derecho que ejerzo: ${f.tipo}`,
      `Nombre completo: ${f.nombre}`,
      `Documento de identidad (cédula/pasaporte; adjuntaré copia): ${f.doc}`,
      `Correo de contacto: ${f.correo}`,
      `Actúo como: ${f.rol}`,
      f.rol !== 'Titular' ? `Nombre del menor o representado: ${f.menor}` : '',
      `Colegio / institución relacionada (si aplica): ${f.institucion}`,
      '',
      'Descripción de la solicitud:',
      f.detalle,
      '',
      'Adjunto copia de mi documento de identidad (y, si actúo en representación, documento que acredite la representación).',
    ].join('\n');
    return `mailto:${SITE.legal.email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
  }, [f]);

  return (
    <LegalLayout
      title="Derechos ARCO"
      description="Guía y plantilla para ejercer los derechos de acceso, rectificación, cancelación y oposición sobre sus datos personales en STODIA, conforme a la Ley 172-13."
      sections={SECTIONS}
    >
      <S id="derechos" title="1. Sus derechos">
        <p>La Ley núm. 172-13 sobre Protección Integral de los Datos Personales y el derecho de hábeas data (Constitución, arts. 44 y 70) le permiten controlar sus datos. Puede solicitar, de forma gratuita:</p>
        <ul>{TIPOS.map(t => <li key={t.v}><b>{t.v}:</b> {t.d}</li>)}</ul>
        <p className="text-sm text-slate-500">La portabilidad la atendemos como buena práctica cuando es técnicamente viable.</p>
      </S>
      <S id="a-quien" title="2. A quién dirigirse">
        <ul>
          <li><b>Datos recogidos en este sitio</b> (formularios de contacto o demostración, cookies): a STODIA, mediante la plantilla de abajo o a <a href={`mailto:${SITE.legal.email}`}>{SITE.legal.email}</a>.</li>
          <li><b>Datos escolares</b> (estudiante, tutor, personal, notas, pagos, expediente): <b>al colegio</b>, que es el responsable del tratamiento. STODIA es solo encargado y, si recibe su solicitud, la trasladará al colegio. Puede usar la misma plantilla dirigida al colegio.</li>
        </ul>
      </S>
      <S id="requisitos" title="3. Requisitos de la solicitud">
        <ul>
          <li>Nombre completo y medio de contacto para responderle.</li>
          <li>Copia de su cédula, pasaporte u otro documento de identidad, para evitar que un tercero acceda a sus datos. Solo se usará para verificar su identidad.</li>
          <li>Descripción clara del derecho que ejerce y de los datos afectados; en rectificación, el dato correcto y, si es posible, un documento que lo acredite.</li>
          <li>Si actúa por representación, el documento que la acredite (poder o prueba de tutela/filiación).</li>
        </ul>
      </S>
      <S id="menores" title="4. Representación de menores">
        <p>Los datos de niños, niñas y adolescentes se ejercen por sus padres, madres o tutores legales, quienes deberán acreditar su identidad y el vínculo (acta de nacimiento, resolución de tutela u otro documento). Se atenderá siempre al interés superior del menor (Ley núm. 136-03) y, según su edad y madurez, se tendrá en cuenta su opinión. Un colegio podrá requerir pruebas adicionales para proteger al menor.</p>
      </S>
      <S id="plazos" title="5. Plazos y respuesta">
        <p>Acusaremos recibo y responderemos en un plazo máximo de 10 días laborables, ampliable por otros 10 días laborables cuando la complejidad lo justifique (se lo comunicaremos), desde que la solicitud esté completa. Si la rechazamos, total o parcialmente, le explicaremos los motivos (por ejemplo, obligación legal de conservar datos académicos o fiscales) y las vías de reclamo. Si la solicitud es manifiestamente infundada o repetitiva podremos denegarla de forma motivada. Las respuestas se enviarán a un medio seguro.</p>
      </S>
      <S id="plantilla" title="6. Plantilla de solicitud">
        <p>Complete el formulario; al pulsar el botón se abrirá su programa de correo con el mensaje prellenado. <b>Esta plantilla no envía nada a ningún servidor</b>: usted revisa y envía el correo. (Es distinto del formulario «Solicitar demo» de la página principal, que sí envía el mensaje a nuestro equipo por correo electrónico; vea la <Link to={LEGAL_ROUTES.privacidad}>Política de Privacidad</Link>.) Recuerde adjuntar su documento de identidad.</p>
        <form className="space-y-4 rounded-lg border border-slate-200 p-4" onSubmit={e => e.preventDefault()} aria-label="Plantilla de solicitud de derechos ARCO">
          <div>
            <label htmlFor="a-tipo" className="mb-1 block text-sm font-medium">Derecho que desea ejercer</label>
            <select id="a-tipo" className={inp} value={f.tipo} onChange={set('tipo')}>{TIPOS.map(t => <option key={t.v}>{t.v}</option>)}</select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="a-nombre" className="mb-1 block text-sm font-medium">Nombre completo</label><input id="a-nombre" className={inp} value={f.nombre} onChange={set('nombre')} autoComplete="name" /></div>
            <div><label htmlFor="a-doc" className="mb-1 block text-sm font-medium">Cédula / pasaporte</label><input id="a-doc" className={inp} value={f.doc} onChange={set('doc')} /></div>
            <div><label htmlFor="a-correo" className="mb-1 block text-sm font-medium">Correo de contacto</label><input id="a-correo" type="email" className={inp} value={f.correo} onChange={set('correo')} autoComplete="email" /></div>
            <div><label htmlFor="a-rol" className="mb-1 block text-sm font-medium">Actúo como</label>
              <select id="a-rol" className={inp} value={f.rol} onChange={set('rol')}><option>Titular</option><option>Padre / madre / tutor de un menor</option><option>Representante legal</option></select></div>
          </div>
          {f.rol !== 'Titular' && (
            <div><label htmlFor="a-menor" className="mb-1 block text-sm font-medium">Nombre del menor o representado</label><input id="a-menor" className={inp} value={f.menor} onChange={set('menor')} /></div>
          )}
          <div><label htmlFor="a-inst" className="mb-1 block text-sm font-medium">Colegio o institución relacionada (si aplica)</label><input id="a-inst" className={inp} value={f.institucion} onChange={set('institucion')} /></div>
          <div><label htmlFor="a-det" className="mb-1 block text-sm font-medium">Descripción de su solicitud</label><textarea id="a-det" rows={5} className={inp} value={f.detalle} onChange={set('detalle')} /></div>
          <a href={href} className="inline-block rounded-md bg-[#2563EB] px-4 py-2 text-sm font-medium text-white no-underline hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#2563EB] print:hidden" style={{ color: '#fff', textDecoration: 'none' }}>Preparar correo</a>
        </form>
      </S>
      <S id="reclamo" title="7. Si no está conforme">
        <p>Si no recibe respuesta o no está de acuerdo, en la República Dominicana no existe una autoridad general de protección de datos personales. Puede acudir a:</p>
        <ul>
          <li>Los tribunales mediante acción de <b>hábeas data</b> o amparo (Constitución; Ley núm. 137-11).</li>
          <li><b>Pro Consumidor</b>, si se trata de una relación de consumo (Ley núm. 358-05).</li>
          <li>El <b>Ministerio Público</b>, DICAT (Policía Nacional) o PEDATEC (Procuraduría), ante accesos ilícitos o delitos informáticos (Ley núm. 53-07).</li>
        </ul>
        <p>Más información: <Link to={LEGAL_ROUTES.privacidad}>Política de Privacidad</Link>.</p>
      </S>
    </LegalLayout>
  );
}
