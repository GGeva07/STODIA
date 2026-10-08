import { Link } from 'react-router-dom';
import LegalLayout, { Brand, S, Trade } from './LegalLayout';
import { SITE, LEGAL_ROUTES } from '../../lib/site';

const SECTIONS = [
  { id: 'responsable', title: '1. Responsable del tratamiento' },
  { id: 'alcance', title: '2. Alcance: sitio vs. datos escolares' },
  { id: 'datos', title: '3. Datos que recogemos' },
  { id: 'finalidades', title: '4. Finalidades y bases legales' },
  { id: 'principios', title: '5. Principios aplicados' },
  { id: 'menores', title: '6. Menores de edad' },
  { id: 'destinatarios', title: '7. Destinatarios y encargados' },
  { id: 'transferencias', title: '8. Transferencias internacionales' },
  { id: 'conservacion', title: '9. Plazos de conservación' },
  { id: 'seguridad', title: '10. Medidas de seguridad' },
  { id: 'derechos', title: '11. Sus derechos y cómo ejercerlos' },
  { id: 'brechas', title: '12. Incidentes de seguridad' },
  { id: 'autoridades', title: '13. Reclamaciones y autoridades' },
  { id: 'marco', title: '14. Marco normativo' },
  { id: 'cambios', title: '15. Cambios en esta política' },
  { id: 'contacto', title: '16. Contacto y DPO' },
];

export default function Privacidad() {
  return (
    <LegalLayout
      title="Política de Privacidad"
      description="Cómo STODIA trata los datos personales conforme a la Ley 172-13 de República Dominicana: finalidades, derechos ARCO, menores, seguridad y transferencias."
      sections={SECTIONS}
    >
      <S id="responsable" title="1. Responsable del tratamiento">
        <p>Respecto de los datos recogidos a través de este sitio web, el responsable del tratamiento es <Brand />, titular del RNC {SITE.legal.rnc}, persona física con actividad comercial que opera bajo el nombre comercial <Trade />, con domicilio en {SITE.legal.address}, correo <a href={`mailto:${SITE.legal.email}`}>{SITE.legal.email}</a>, teléfono {SITE.legal.phone}.</p>
        <p>El software y la marca STODIA pertenecen a <Brand />, quien licencia el Servicio, contrata, factura y da soporte a los colegios.</p>
      </S>
      <S id="alcance" title="2. Alcance: sitio web frente a datos escolares">
        <p>Esta política distingue dos situaciones:</p>
        <ul>
          <li><b>Datos de visitantes y de quienes solicitan información o una demostración.</b> {SITE.legal.name} es el <b>responsable</b> y esta política se aplica íntegramente.</li>
          <li><b>Datos escolares</b> (estudiantes, tutores, personal, notas, asistencia, finanzas, comedor, expediente) cargados en la Instancia de cada colegio. El <b>colegio es el responsable del tratamiento</b> y decide para qué y cómo se usan. {SITE.legal.name} actúa solo como <b>encargado</b> (en la modalidad gestionada, en la que aloja la Instancia, y cuando accede para soporte en la autoalojada), siguiendo las instrucciones del colegio, sin usar esos datos para fines propios. Las solicitudes de padres, tutores, estudiantes o personal sobre esos datos deben dirigirse al colegio; si nos las envían a nosotros, las trasladaremos al colegio correspondiente.</li>
        </ul>
      </S>
      <S id="datos" title="3. Datos que recogemos">
        <h3>Visitantes del sitio</h3>
        <ul>
          <li>Datos técnicos mínimos de navegación (dirección IP, navegador, páginas visitadas) en registros del servidor.</li>
          <li>Preferencias de cookies, guardadas en su dispositivo (ver <Link to={LEGAL_ROUTES.cookies}>Política de Cookies</Link>).</li>
        </ul>
        <h3>Formulario o solicitud de demostración</h3>
        <ul>
          <li>Nombre, cargo, institución, correo electrónico, teléfono y el mensaje que usted decida escribir.</li>
        </ul>
        <p>No solicitamos datos sensibles ni de menores a través del sitio. Le rogamos no incluirlos en sus mensajes.</p>
        <h3>Datos escolares (como encargado)</h3>
        <p>Según los módulos que el colegio active, la Instancia puede contener identificación y contacto de estudiantes, tutores y personal; datos académicos y de asistencia; datos de pagos y facturación; datos de comedor y expediente, que pueden incluir información de salud o necesidades especiales. Estos datos se rigen por las decisiones del colegio y su propio aviso de privacidad.</p>
      </S>
      <S id="finalidades" title="4. Finalidades y bases legales">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead><tr className="bg-slate-100 text-left"><th className="border border-slate-200 p-2">Finalidad</th><th className="border border-slate-200 p-2">Base</th></tr></thead>
            <tbody>
              <tr><td className="border border-slate-200 p-2">Responder consultas y gestionar solicitudes de demostración o propuesta.</td><td className="border border-slate-200 p-2">Consentimiento o medidas precontractuales a petición del interesado.</td></tr>
              <tr><td className="border border-slate-200 p-2">Gestionar la relación contractual con el colegio cliente (facturación, soporte, licencia).</td><td className="border border-slate-200 p-2">Ejecución del contrato y obligaciones legales (fiscales, DGII).</td></tr>
              <tr><td className="border border-slate-200 p-2">Seguridad del sitio y prevención de abusos.</td><td className="border border-slate-200 p-2">Interés legítimo.</td></tr>
              <tr><td className="border border-slate-200 p-2">Analítica y mejora del sitio; comunicaciones comerciales.</td><td className="border border-slate-200 p-2">Consentimiento, revocable en cualquier momento.</td></tr>
            </tbody>
          </table>
        </div>
        <p>Solo usaremos sus datos para fines compatibles con los indicados. Si necesitamos un fin nuevo, se lo informaremos y, de ser necesario, solicitaremos su consentimiento.</p>
      </S>
      <S id="principios" title="5. Principios aplicados">
        <p>Conforme a la Ley núm. 172-13, tratamos los datos con licitud, lealtad y transparencia; para finalidades determinadas y legítimas; limitándonos a los datos adecuados y necesarios; procurando que sean exactos y actualizados; conservándolos solo el tiempo necesario; garantizando su seguridad y el deber de confidencialidad de quienes acceden a ellos. El consentimiento, cuando es la base, debe ser libre, previo, informado y específico, y puede revocarse.</p>
      </S>
      <S id="menores" title="6. Menores de edad">
        <p>El sitio está dirigido a personas adultas (directivos y personal de colegios) y no recoge intencionadamente datos de menores. Los datos de estudiantes menores de edad se tratan únicamente dentro de la Instancia de cada colegio, que es quien debe contar con la autorización de sus padres o tutores y tratarlos atendiendo al <b>interés superior del niño, niña y adolescente</b> (Ley núm. 136-03, Código para el Sistema de Protección y los Derechos Fundamentales de Niños, Niñas y Adolescentes) y a los derechos a la intimidad y a la propia imagen. Si cree que un menor nos ha enviado datos a través del sitio, escríbanos para eliminarlos.</p>
        <p>Los datos de salud y otros datos sensibles reciben un nivel reforzado de protección. El colegio debe limitar su recogida a lo estrictamente necesario, restringir su acceso a roles autorizados y no comunicarlos sin base legal o consentimiento. Los colegios deben además observar las normas y lineamientos del Ministerio de Educación (MINERD) aplicables al manejo de la información de los estudiantes.</p>
      </S>
      <S id="destinatarios" title="7. Destinatarios y encargados">
        <p>No vendemos datos personales. Podemos comunicarlos a: proveedores que nos prestan servicios necesarios (alojamiento, correo, herramientas de gestión y, si usted consiente, analítica) bajo obligación de confidencialidad; asesores profesionales; y autoridades cuando una norma o resolución judicial lo exija. Los proveedores concretos pueden consultarse solicitándolos al correo de contacto.</p>
        <p><b>Modalidades de despliegue.</b> En la modalidad <b>autoalojada</b>, la Instancia reside en la infraestructura del colegio, que es responsable de su seguridad física y lógica y de sus respaldos; {SITE.legal.name} presta licencia y soporte. En la modalidad <b>gestionada</b>, {SITE.legal.name} aloja la Instancia como encargado del tratamiento y puede apoyarse en subencargados de infraestructura; la lista vigente se facilita al colegio previa solicitud al correo de contacto.</p>
        <p>En las Instancias, el acceso a los datos escolares por parte de STODIA se limita al estrictamente necesario para soporte o mantenimiento y siempre por instrucción del colegio.</p>
      </S>
      <S id="transferencias" title="8. Transferencias internacionales">
        <p>Si alguno de nuestros proveedores trata datos fuera de la República Dominicana, la transferencia solo se hará cuando el país destinatario ofrezca un nivel de protección adecuado o existan garantías contractuales equivalentes, o con el consentimiento del titular, conforme a la Ley núm. 172-13. Cualquier transferencia se informará previamente. Las Instancias autoalojadas en la infraestructura del colegio no implican transferencia por parte de STODIA. En la modalidad gestionada, si el proveedor de infraestructura trata datos fuera de la República Dominicana, se informará previamente al colegio, que es el responsable del tratamiento.</p>
      </S>
      <S id="conservacion" title="9. Plazos de conservación">
        <ul>
          <li>Consultas y solicitudes de demostración sin contratación: 24 meses desde el último contacto.</li>
          <li>Datos contractuales y de facturación: mientras dure la relación y, después, el plazo que exija la normativa fiscal y mercantil dominicana (en general, no menos de 10 años para registros contables y fiscales) y hasta la prescripción de posibles acciones.</li>
          <li>Registros técnicos del servidor: hasta 12 meses.</li>
          <li>Datos escolares: el que determine el colegio; al terminar el contrato se devuelven (portabilidad) o eliminan conforme a los <Link to={LEGAL_ROUTES.terminos}>Términos</Link>.</li>
        </ul>
        <p>Vencidos los plazos, los datos se suprimen o anonimizan, salvo bloqueo por obligación legal.</p>
      </S>
      <S id="seguridad" title="10. Medidas de seguridad">
        <p>Aplicamos medidas técnicas y organizativas razonables. En el software STODIA, a la fecha de esta política, el código implementa, entre otras:</p>
        <ul>
          <li>Almacenamiento de contraseñas con hash (bcrypt), no en texto plano.</li>
          <li>Autenticación mediante tokens firmados (JWT) con expiración.</li>
          <li>Control de acceso por roles y permisos.</li>
          <li>Registro de auditoría de acciones en el sistema.</li>
          <li>Instancia independiente por cliente.</li>
        </ul>
        <p>En la modalidad gestionada, {SITE.legal.name} las aplica sobre la Instancia que aloja y realiza copias de seguridad periódicas según el contrato; en la autoalojada, las medidas de infraestructura y los respaldos corresponden al colegio. Otras medidas dependen del despliegue (cifrado en tránsito con HTTPS, copias de seguridad, firewall, actualizaciones) y se acuerdan con el colegio. <b>No declaramos certificaciones de seguridad</b> (como ISO 27001 o SOC 2) mientras no las hayamos obtenido. Ningún sistema es infalible; el colegio debe además proteger sus credenciales y dispositivos.</p>
      </S>
      <S id="derechos" title="11. Sus derechos y cómo ejercerlos">
        <p>Usted puede ejercer los derechos de <b>acceso, rectificación, actualización y supresión (cancelación)</b>, y <b>oponerse</b> al tratamiento o revocar su consentimiento, de forma gratuita, así como invocar el derecho de <i>hábeas data</i> reconocido en la Constitución dominicana (arts. 44 y 70). Para hacerlo use la <Link to={LEGAL_ROUTES.arco}>guía y plantilla de Derechos ARCO</Link> o escriba a <a href={`mailto:${SITE.legal.email}`}>{SITE.legal.email}</a> acreditando su identidad.</p>
        <p>Responderemos en un plazo máximo de 10 días laborables desde que la solicitud esté completa, ampliable por otros 10 días laborables cuando la complejidad lo justifique, informándole del motivo. Si el dato corresponde a una Instancia escolar, trasladaremos su solicitud al colegio responsable, que deberá atenderla.</p>
      </S>
      <S id="brechas" title="12. Incidentes de seguridad">
        <p>Si ocurre una violación de seguridad que afecte datos personales, la investigaremos y contendremos con prontitud, informaremos al colegio responsable cuando afecte a una Instancia, y comunicaremos a los afectados y a las autoridades competentes en los casos y plazos que la normativa o el contrato exijan. Notificaremos al colegio sin demora injustificada desde que tengamos conocimiento del incidente, con la información disponible sobre su alcance y las medidas adoptadas. Los incidentes informáticos delictivos pueden denunciarse ante las unidades especializadas (ver sección 13).</p>
      </S>
      <S id="autoridades" title="13. Reclamaciones y autoridades">
        <p>Primero puede escribirnos para resolver su queja. Además, en la República Dominicana <b>no existe una autoridad general de protección de datos personales</b> equivalente a las de otros países. Las vías disponibles son:</p>
        <ul>
          <li><b>Acción de hábeas data / amparo</b> ante los tribunales, conforme a la Constitución y a la Ley núm. 137-11 Orgánica del Tribunal Constitucional y de los Procedimientos Constitucionales.</li>
          <li><b>Pro Consumidor</b>, en lo relativo a relaciones de consumo (Ley núm. 358-05).</li>
          <li><b>Ministerio Público</b> y unidades especializadas en delitos de alta tecnología (DICAT de la Policía Nacional y PEDATEC de la Procuraduría), Ley núm. 53-07.</li>
          <li>En materia de información crediticia (burós de crédito), la Superintendencia de Bancos, que la Ley núm. 172-13 designa como órgano de control en ese ámbito.</li>
        </ul>
      </S>
      <S id="marco" title="14. Marco normativo">
        <p>Esta política se apoya, entre otras, en: Constitución de la República (art. 44, intimidad y honor, y acceso a los datos propios; art. 70, hábeas data); Ley núm. 172-13 sobre Protección Integral de los Datos Personales; Ley núm. 136-03 (niños, niñas y adolescentes); Ley núm. 358-05 (consumidor); Ley núm. 53-07 (delitos de alta tecnología); Ley núm. 310-14 (correo comercial no solicitado); Ley núm. 153-98 (telecomunicaciones) y Ley núm. 32-23 (facturación electrónica, respecto de la facturación). </p>
      </S>
      <S id="cambios" title="15. Cambios en esta política">
        <p>Podemos actualizar esta política. La versión vigente indica su fecha de actualización; los cambios sustanciales se comunicarán por medios razonables.</p>
      </S>
      <S id="contacto" title="16. Contacto y delegado de protección de datos">
        <p>{SITE.legal.name} · <a href={`mailto:${SITE.legal.email}`}>{SITE.legal.email}</a> · {SITE.legal.phone} · {SITE.legal.address}</p>
        <p>Responsable de privacidad: {SITE.legal.name}.</p>
      </S>
    </LegalLayout>
  );
}
