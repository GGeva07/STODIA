import { Link } from 'react-router-dom';
import LegalLayout, { S } from './LegalLayout';
import { SITE, LEGAL_ROUTES } from '../../lib/site';

const SECTIONS = [
  { id: 'que-son', title: '1. Qué son' },
  { id: 'categorias', title: '2. Categorías y base legal' },
  { id: 'tabla', title: '3. Qué almacena STODIA' },
  { id: 'gestionar', title: '4. Gestionar su consentimiento' },
  { id: 'navegador', title: '5. Desde su navegador' },
  { id: 'terceros', title: '6. Terceros' },
  { id: 'cambios', title: '7. Cambios y contacto' },
];

const ROWS: { name: string; provider: string; purpose: string; duration: string; type: string }[] = [
  { name: 'stodia.cookie-consent', provider: `${SITE.name} (propio)`, purpose: 'Recordar sus preferencias de cookies (esenciales/analíticas/marketing).', duration: 'Hasta que lo borre o cambie su elección', type: 'Esencial · localStorage' },
  { name: 'stodia.token', provider: `${SITE.name} (propio)`, purpose: 'Mantener la sesión iniciada en la aplicación (token de acceso). No se usa en el sitio público.', duration: 'Hasta cerrar sesión; el token caduca a las 12 horas', type: 'Esencial · localStorage' },
  { name: 'stodia.user', provider: `${SITE.name} (propio)`, purpose: 'Datos básicos del usuario conectado (nombre, rol) para mostrar la interfaz.', duration: 'Hasta cerrar sesión', type: 'Esencial · localStorage' },
  { name: 'stodia.apiUrl', provider: `${SITE.name} (propio)`, purpose: 'Dirección del servidor de la institución a la que se conecta la app (instancia autoalojada o gestionada, o app móvil).', duration: 'Hasta que lo borre', type: 'Esencial · localStorage / Capacitor Preferences (app móvil)' },
  { name: 'stodia-shell-v1', provider: `${SITE.name} (propio)`, purpose: 'Caché del service worker (PWA): archivos de la aplicación para abrirla sin conexión. No almacena respuestas de la API.', duration: 'Hasta que una nueva versión lo reemplace o lo borre', type: 'Esencial · Cache Storage' },
];

export default function Cookies() {
  return (
    <LegalLayout
      title="Política de Cookies"
      description="Qué cookies y almacenamiento local usa STODIA, para qué sirven, cuánto duran y cómo puede gestionarlas o retirar su consentimiento."
      sections={SECTIONS}
    >
      <S id="que-son" title="1. Qué son las cookies y el almacenamiento local">
        <p>Son pequeños archivos o datos que un sitio guarda en su dispositivo. Además de cookies, STODIA usa almacenamiento local del navegador (<i>localStorage</i>), la caché del <i>service worker</i> y, en la app móvil, <i>Capacitor Preferences</i>. Esta política aplica a todos ellos y complementa la <Link to={LEGAL_ROUTES.privacidad}>Política de Privacidad</Link>.</p>
      </S>
      <S id="categorias" title="2. Categorías y base legal">
        <ul>
          <li><b>Esenciales:</b> necesarias para el funcionamiento del sitio o para prestar un servicio que usted solicita (sesión, preferencias, modo sin conexión). No requieren consentimiento.</li>
          <li><b>Analíticas:</b> miden el uso del sitio para mejorarlo. Solo se activan si usted las acepta.</li>
          <li><b>Marketing:</b> permiten medir o personalizar campañas. Solo se activan si usted las acepta.</li>
        </ul>
        <p>El consentimiento es libre, específico y revocable en cualquier momento, y rechazar las no esenciales es tan fácil como aceptarlas. Su elección se registra y se vuelve a solicitar cuando cambie la política o pasado un tiempo razonable (12 meses).</p>
        <p>A la fecha de esta política, el código de la aplicación <b>no instala cookies analíticas ni de marketing</b>. Si en el futuro se añaden herramientas de analítica o de marketing, se incorporarán a esta tabla y no se cargarán sin su consentimiento previo.</p>
      </S>
      <S id="tabla" title="3. Qué almacena STODIA en su dispositivo">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            <thead><tr className="bg-slate-100 text-left">
              {['Nombre', 'Proveedor', 'Finalidad', 'Duración', 'Tipo'].map(h => <th key={h} className="border border-slate-200 p-2">{h}</th>)}
            </tr></thead>
            <tbody>
              {ROWS.map(r => (
                <tr key={r.name} className="align-top">
                  <td className="border border-slate-200 p-2 font-mono text-xs">{r.name}</td>
                  <td className="border border-slate-200 p-2">{r.provider}</td>
                  <td className="border border-slate-200 p-2">{r.purpose}</td>
                  <td className="border border-slate-200 p-2">{r.duration}</td>
                  <td className="border border-slate-200 p-2">{r.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>Los servidores de STODIA no establecen cookies de sesión: la autenticación usa un token en cabecera, no cookies.</p>
      </S>
      <S id="gestionar" title="4. Cómo cambiar o retirar su consentimiento">
        <p>Puede revisar su elección en cualquier momento:</p>
        <p>
          <button type="button" onClick={() => window.dispatchEvent(new Event('stodia:open-cookie-preferences'))} className="rounded-md bg-[#2563EB] px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#2563EB] print:hidden">Abrir preferencias de cookies</button>
        </p>
        <p>También desde el enlace «Preferencias de cookies» del pie de página. Retirar el consentimiento no afecta a la licitud del tratamiento previo.</p>
      </S>
      <S id="navegador" title="5. Desactivarlas desde su navegador">
        <p>Puede bloquear o eliminar cookies y datos del sitio desde la configuración de Chrome, Edge, Firefox, Safari u otro navegador (normalmente en «Privacidad y seguridad»). Al borrar los datos del sitio se cierra su sesión y se pierde la dirección del servidor guardada. Bloquear el almacenamiento esencial puede impedir iniciar sesión o usar el modo sin conexión.</p>
      </S>
      <S id="terceros" title="6. Cookies de terceros">
        <p>El sitio no incorpora, a la fecha, servicios de terceros que instalen cookies. Si se incorporan, se informará aquí con su proveedor, finalidad y duración, y solo se cargarán tras su consentimiento (si no son esenciales). Las transferencias internacionales asociadas se describen en la Política de Privacidad.</p>
      </S>
      <S id="cambios" title="7. Cambios y contacto">
        <p>Podemos actualizar esta política; la fecha figura arriba. Consultas: <a href={`mailto:${SITE.legal.email}`}>{SITE.legal.email}</a>. Más información: <Link to={LEGAL_ROUTES.privacidad}>Privacidad</Link> · <Link to={LEGAL_ROUTES.arco}>Derechos ARCO</Link>.</p>
      </S>
    </LegalLayout>
  );
}
