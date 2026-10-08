import { Link } from 'react-router-dom';
import LegalLayout, { Brand, S, Trade } from './LegalLayout';
import { SITE, LEGAL_ROUTES } from '../../lib/site';

const SECTIONS = [
  { id: 'objeto', title: '1. Objeto y aceptación' },
  { id: 'definiciones', title: '2. Definiciones' },
  { id: 'licencia', title: '3. Licencia e instancia por cliente' },
  { id: 'modalidades', title: '3 bis. Modalidades de despliegue' },
  { id: 'roles', title: '4. Roles en el tratamiento de datos' },
  { id: 'pi', title: '5. Propiedad intelectual' },
  { id: 'soporte', title: '6. Soporte y niveles de servicio' },
  { id: 'precios', title: '7. Precios, impuestos y facturación' },
  { id: 'pagos', title: '8. Pagos, renovación y suspensión' },
  { id: 'uso', title: '9. Uso aceptable' },
  { id: 'garantias', title: '10. Garantías y responsabilidad' },
  { id: 'confidencialidad', title: '11. Confidencialidad' },
  { id: 'backups', title: '12. Copias de seguridad' },
  { id: 'terminacion', title: '13. Terminación y datos' },
  { id: 'fuerza', title: '14. Fuerza mayor' },
  { id: 'modificaciones', title: '15. Modificaciones' },
  { id: 'comunicaciones', title: '16. Comunicaciones' },
  { id: 'ley', title: '17. Ley aplicable y jurisdicción' },
  { id: 'consumidor', title: '18. Derechos del consumidor' },
  { id: 'contacto', title: '19. Contacto' },
];

export default function Terminos() {
  return (
    <LegalLayout
      title="Términos y Condiciones"
      description="Términos y condiciones de uso del sitio web y de la licencia del sistema de gestión escolar STODIA en República Dominicana."
      sections={SECTIONS}
    >
      <S id="objeto" title="1. Objeto y aceptación">
        <p>Estos Términos regulan el acceso al sitio web de {SITE.name} ({SITE.url}) y la contratación y uso de la licencia del sistema de gestión escolar {SITE.name} (el «Servicio»), ofrecido por <Brand />, persona física con actividad comercial, titular del RNC {SITE.legal.rnc}, que opera bajo el nombre comercial <Trade />, con domicilio en {SITE.legal.address}, titular de los derechos de propiedad intelectual sobre el software y la marca STODIA y licenciante de los mismos («STODIA» o «el Proveedor»).</p>
        <p>El Proveedor es quien contrata, factura, cobra y presta el soporte del Servicio, administra este sitio web y atiende los datos de contacto y las solicitudes de demostración.</p>
        <p>Al navegar por el sitio, solicitar una demostración o contratar el Servicio, usted declara haber leído y aceptado estos Términos, la <Link to={LEGAL_ROUTES.privacidad}>Política de Privacidad</Link> y la <Link to={LEGAL_ROUTES.cookies}>Política de Cookies</Link>. Si actúa en nombre de un colegio, declara tener facultades para obligarlo. Si no está de acuerdo, no utilice el sitio ni el Servicio.</p>
        <p>Las condiciones particulares de cada contrato (propuesta comercial, orden de servicio o contrato de licencia firmado) prevalecen sobre estos Términos en caso de conflicto.</p>
      </S>
      <S id="definiciones" title="2. Definiciones">
        <ul>
          <li><b>Cliente o Colegio:</b> institución educativa que contrata la licencia.</li>
          <li><b>Usuarios:</b> personas autorizadas por el Colegio (personal administrativo, docentes, tutores, estudiantes u otros roles).</li>
          <li><b>Instancia:</b> instalación independiente de STODIA dedicada a un Cliente, alojada, según la modalidad contratada, en la infraestructura del Colegio (autoalojada) o en la infraestructura del Proveedor (gestionada).</li>
          <li><b>Datos del Cliente:</b> toda información cargada o generada en la Instancia, incluidos datos personales de estudiantes (menores de edad), tutores y personal.</li>
          <li><b>Responsable del tratamiento:</b> quien decide sobre la finalidad y el uso de los datos personales. <b>Encargado:</b> quien los trata por cuenta del responsable (Ley núm. 172-13).</li>
          <li><b>Proveedor:</b> <Brand /> (RNC {SITE.legal.rnc}), persona física con actividad comercial bajo el nombre comercial <Trade />; titular de la propiedad intelectual del software y la marca STODIA, licenciante y quien presta el Servicio.</li>
          <li><b>Licencia:</b> derecho de uso del software durante el plazo y alcance contratados.</li>
        </ul>
      </S>
      <S id="licencia" title="3. Licencia de uso e instancia por cliente">
        <p>El Proveedor otorga al Colegio una licencia <b>no exclusiva, intransferible y no sublicenciable</b>, limitada al plazo, módulos, número de usuarios o planteles y demás límites indicados en su contrato, para usar el Servicio exclusivamente en la gestión interna del Colegio.</p>
        <p>Cada Cliente opera su propia Instancia. Los datos de un Cliente no se mezclan con los de otro. La licencia puede incluir una verificación de licencia en la Instancia; manipularla o eludirla constituye un incumplimiento grave.</p>
        <p>Queda prohibido copiar, descompilar, realizar ingeniería inversa, revender, alquilar o ceder el acceso a terceros, salvo en la medida en que la ley lo permita de forma imperativa.</p>
      </S>
      <S id="modalidades" title="3 bis. Modalidades de despliegue">
        <p>STODIA puede contratarse en cualquiera de estas dos modalidades, ambas incluidas en los planes. En las dos, cada Cliente opera una Instancia propia y sus datos permanecen aislados de los de otros clientes.</p>
        <h3>a) Autoalojada (en la infraestructura del Colegio)</h3>
        <ul>
          <li>La Instancia se instala en los servidores o equipos del Colegio. El Proveedor presta la licencia de uso y el soporte previstos en el contrato.</li>
          <li>El <b>Colegio es responsable</b> de la infraestructura: disponibilidad del servidor, red y energía; seguridad física y lógica del entorno; control de accesos al equipo; actualizaciones del sistema operativo; y la realización y verificación de los respaldos y de su restauración.</li>
          <li>El Proveedor no aloja ni almacena los Datos del Cliente en esta modalidad y solo accede a ellos de forma puntual cuando el Colegio lo solicite para soporte.</li>
        </ul>
        <h3>b) Gestionada (alojada por el Proveedor)</h3>
        <ul>
          <li>El Proveedor aloja y mantiene la Instancia del Colegio en su infraestructura y actúa como <b>encargado del tratamiento</b> de los Datos del Cliente, siguiendo las instrucciones documentadas del Colegio y sin usarlos para fines propios.</li>
          <li>Aplica medidas de seguridad razonables, entre ellas: Instancia aislada por cliente, almacenamiento de contraseñas con hash, control de acceso por roles y registro de auditoría. No se declaran certificaciones de seguridad ni garantías no descritas en el contrato.</li>
          <li>Realiza copias de seguridad periódicas conforme a la sección 12 y gestiona las actualizaciones de la Instancia.</li>
          <li>Puede apoyarse en <b>subencargados de infraestructura</b> (por ejemplo, proveedores de alojamiento). La lista vigente se facilita al Colegio previa solicitud al correo de contacto. Si el proveedor de infraestructura trata datos fuera de la República Dominicana, el Proveedor informará previamente al Colegio y la transferencia se regirá por la <Link to={LEGAL_ROUTES.privacidad}>Política de Privacidad</Link> y la Ley núm. 172-13.</li>
          <li>La disponibilidad y los tiempos de respuesta se rigen por el contrato; no se garantizan niveles de servicio que no consten por escrito.</li>
        </ul>
        <p>El Colegio puede solicitar el cambio de una modalidad a otra; las condiciones y la migración de los datos se acuerdan por escrito. En ambas modalidades se aplican la portabilidad, devolución y eliminación de datos de la sección 13.</p>
      </S>
      <S id="roles" title="4. Roles en el tratamiento de datos personales">
        <p>De conformidad con la Ley núm. 172-13 sobre Protección Integral de los Datos Personales:</p>
        <ul>
          <li>El <b>Colegio es el responsable del tratamiento</b> de los datos de estudiantes, tutores y personal. Le corresponde determinar las finalidades, obtener los consentimientos o acreditar otra base legítima (incluida la autorización de padres o tutores para datos de menores), informar a los titulares y atender sus solicitudes de acceso, rectificación, cancelación y oposición.</li>
          <li><b>El Proveedor actúa como encargado</b> en la medida en que acceda a los Datos del Cliente (por ejemplo, para soporte, mantenimiento o alojamiento), siguiendo instrucciones documentadas del Colegio, sin usarlos para fines propios ni comunicarlos a terceros, y aplicando medidas de seguridad y confidencialidad.</li>
          <li>Cuando el Proveedor recoge datos de los visitantes de su sitio o de quienes solicitan una demostración, actúa como responsable respecto de esos datos (ver <Link to={LEGAL_ROUTES.privacidad}>Política de Privacidad</Link>).</li>
        </ul>
        <p>El Colegio garantiza que tiene base legítima para cargar los datos en el Servicio y que informa debidamente a los titulares. Las partes podrán suscribir un anexo de encargo de tratamiento con el detalle de estas obligaciones.</p>
      </S>
      <S id="pi" title="5. Propiedad intelectual">
        <p>El software, las marcas, logotipos, diseños, documentación y contenidos de STODIA son propiedad del Proveedor o de sus licenciantes y están protegidos por la legislación dominicana sobre derecho de autor y propiedad industrial. Esta licencia no transfiere ninguna titularidad.</p>
        <p>Los Datos del Cliente siguen siendo propiedad del Colegio (o de sus titulares). El Colegio autoriza a STODIA a tratarlos solo para prestar el Servicio.</p>
      </S>
      <S id="soporte" title="6. Soporte y niveles de servicio">
        <p>El soporte técnico se presta por correo electrónico y teléfono, en horario laboral (lunes a viernes, excluidos los feriados en República Dominicana), con respuesta inicial en el siguiente día laborable salvo que el contrato disponga otro plazo. Los mantenimientos programados se avisarán con antelación razonable. Salvo que el contrato disponga otra cosa, no se garantiza un servicio ininterrumpido ni libre de errores.</p>
        <p>Cuando la Instancia esté autoalojada en infraestructura del Colegio, este es responsable de la disponibilidad del servidor, la red, la energía y la seguridad física y lógica de dicho entorno.</p>
      </S>
      <S id="precios" title="7. Precios, impuestos y facturación">
        <p>Los precios y el calendario de pago son los que constan en la propuesta, cotización, orden de servicio o contrato aplicable. Salvo indicación expresa, no incluyen impuestos.</p>
        <p>Sobre los servicios gravados se aplicará el <b>ITBIS vigente (18 % a la fecha de esta redacción)</b> y los demás impuestos que correspondan. La facturación se emite con comprobante fiscal (NCF o comprobante fiscal electrónico, e-CF) conforme a la normativa de la Dirección General de Impuestos Internos (DGII), incluida la Ley núm. 32-23 de Facturación Electrónica y sus normas complementarias. El Colegio debe suministrar su RNC y datos fiscales correctos; podrá aplicar retenciones cuando la ley lo exija.</p>
      </S>
      <S id="pagos" title="8. Pagos, renovación y suspensión">
        <ul>
          <li>Los pagos se realizan en la moneda y por los medios pactados, dentro del plazo indicado en la factura o, en su defecto, dentro de los 15 días siguientes a su emisión.</li>
          <li>La licencia se renueva por períodos iguales salvo aviso de no renovación con 30 días de antelación a su vencimiento; el precio podrá ajustarse con notificación previa.</li>
          <li>La mora faculta al Proveedor a cobrar los intereses o recargos legales o pactados y, tras notificación escrita y un plazo de gracia de 15 días, a suspender el acceso a nuevas funciones, a las actualizaciones o a la licencia. La suspensión no implica eliminación de los Datos del Cliente, que se conservarán según la sección 13 y cuya exportación el Colegio podrá solicitar.</li>
          <li>Salvo disposición legal imperativa, las cuotas pagadas no son reembolsables.</li>
        </ul>
      </S>
      <S id="uso" title="9. Uso aceptable">
        <p>El Colegio y sus Usuarios se obligan a: custodiar sus credenciales y no compartirlas; asignar roles y permisos según el principio de mínimo privilegio; no cargar contenido ilícito, ofensivo o que vulnere derechos de terceros; no intentar acceder sin autorización a datos o sistemas, ni introducir código malicioso, ni sobrecargar la plataforma; y cumplir la legislación aplicable, incluida la Ley núm. 53-07 sobre Crímenes y Delitos de Alta Tecnología. Las pruebas de seguridad deben coordinarse previamente por escrito con el Proveedor.</p>
        <p>El Colegio responde por los actos de sus Usuarios. STODIA podrá suspender de forma preventiva cuentas o accesos ante indicios razonables de uso ilícito o riesgo de seguridad, comunicándolo al Colegio.</p>
      </S>
      <S id="garantias" title="10. Garantías y limitación de responsabilidad">
        <p>El Proveedor se compromete a prestar el Servicio con diligencia profesional y conforme a la documentación vigente. Salvo lo expresamente pactado y lo que la ley no permita excluir, el Servicio se ofrece «tal cual» y no se garantiza que cumpla requisitos específicos no acordados ni la ausencia total de errores o interrupciones.</p>
        <p>En la máxima medida permitida por la ley, STODIA no responderá por daños indirectos, lucro cesante, pérdida de datos imputable a terceros o al Cliente, ni por el uso indebido del Servicio. La responsabilidad total acumulada del Proveedor frente al Cliente se limita al monto efectivamente pagado por el Cliente por el Servicio en los 12 meses anteriores al hecho que origine el reclamo. Esta limitación no aplica en caso de dolo o falta grave ni respecto de responsabilidades que la ley no permita limitar. Los resultados académicos, calificaciones o decisiones basadas en el sistema son responsabilidad del Colegio.</p>
      </S>
      <S id="confidencialidad" title="11. Confidencialidad">
        <p>Cada parte mantendrá en reserva la información no pública de la otra a la que acceda con ocasión del contrato (incluidos datos personales, credenciales, precios y detalles técnicos), la usará solo para ejecutar el contrato y la compartirá únicamente con quienes necesiten conocerla y estén obligados a la misma reserva. La obligación subsiste durante 3 años tras la terminación y, respecto de datos personales, mientras subsista el deber de confidencialidad legal. Se exceptúa la información de dominio público o cuya revelación exija una autoridad competente.</p>
      </S>
      <S id="backups" title="12. Copias de seguridad">
        <p>La política de copias de seguridad (frecuencia, retención y restauración) depende del modelo de despliegue acordado (alojamiento por el Proveedor o infraestructura del Colegio) y se detalla en el contrato. Si la Instancia está en servidores del Colegio (autoalojada), este es responsable de respaldar y probar la restauración, sin perjuicio de las herramientas que el software ofrezca. Si la Instancia es gestionada por el Proveedor, este realiza copias de seguridad periódicas con la frecuencia y retención indicadas en el contrato. Se recomienda mantener copias cifradas fuera del servidor principal y verificar periódicamente su recuperación.</p>
      </S>
      <S id="terminacion" title="13. Terminación, devolución y eliminación de datos">
        <ul>
          <li>Cualquiera de las partes podrá terminar el contrato por incumplimiento grave no subsanado en 30 días tras notificación escrita, o por las causas pactadas.</li>
          <li>Al terminar, en cualquiera de las modalidades, el Colegio podrá solicitar la <b>devolución y portabilidad</b> de sus datos en un formato estructurado y de uso común (por ejemplo CSV o JSON), dentro de los 30 días siguientes a la terminación.</li>
          <li>Transcurrido ese plazo, STODIA eliminará o anonimizará los datos que mantenga como encargado (en la modalidad gestionada, los de la Instancia alojada por el Proveedor), salvo que la ley exija conservarlos, y lo certificará por escrito si se solicita. Las copias en respaldos se depurarán en el ciclo normal de rotación (hasta 90 días).</li>
          <li>Sobreviven a la terminación las cláusulas de propiedad intelectual, confidencialidad, responsabilidad, pago de sumas adeudadas y ley aplicable.</li>
        </ul>
      </S>
      <S id="fuerza" title="14. Fuerza mayor">
        <p>Ninguna parte responde por incumplimientos causados por hechos imprevisibles o inevitables ajenos a su control (desastres naturales, huracanes, fallas generales de energía o telecomunicaciones, actos de autoridad, ciberataques de terceros pese a medidas razonables, entre otros), mientras dure el evento y siempre que lo notifique con prontitud y actúe para mitigarlo. Esto no exime de pagar sumas ya devengadas.</p>
      </S>
      <S id="modificaciones" title="15. Modificaciones">
        <p>STODIA podrá actualizar estos Términos por cambios legales, técnicos o comerciales. Publicará la versión vigente con su fecha de actualización y, para clientes con contrato, notificará los cambios sustanciales con al menos 15 días de antelación. El uso continuado tras la entrada en vigor implica aceptación; si el cambio le perjudica de forma relevante, podrá terminar el contrato conforme a la sección 13.</p>
      </S>
      <S id="comunicaciones" title="16. Comunicaciones">
        <p>Las notificaciones contractuales se harán por escrito al correo y domicilio indicados en el contrato o, en su defecto, a <a href={`mailto:${SITE.legal.email}`}>{SITE.legal.email}</a> y al domicilio de la sección 1. Las comunicaciones comerciales se enviarán solo con base legítima y con un mecanismo sencillo para darse de baja, en línea con la Ley núm. 310-14 sobre correo electrónico comercial no solicitado.</p>
      </S>
      <S id="ley" title="17. Ley aplicable y jurisdicción">
        <p>Estos Términos se rigen por las leyes de la República Dominicana. Las partes intentarán resolver cualquier controversia de buena fe mediante negociación directa durante 15 días. De no lograrse, la someterán a los tribunales competentes del Distrito Nacional, sin perjuicio de los derechos que la ley reconoce al consumidor o usuario.</p>
        <p>Las partes podrán acordar por escrito someter la controversia a mediación o arbitraje institucional en Santo Domingo antes de acudir a los tribunales.</p>
      </S>
      <S id="consumidor" title="18. Derechos del consumidor">
        <p>La Ley núm. 358-05 General de Protección de los Derechos del Consumidor o Usuario reconoce derechos irrenunciables a información veraz y a reclamar, y protege frente a cláusulas abusivas. Si usted contrata como consumidor o usuario final, nada en estos Términos limita esos derechos. Puede presentar reclamaciones ante Pro Consumidor (<a href="https://proconsumidor.gob.do" target="_blank" rel="noopener noreferrer">proconsumidor.gob.do</a>). Los contratos entre STODIA y un colegio como entidad empresarial se rigen principalmente por lo pactado y por el derecho común.</p>
      </S>
      <S id="contacto" title="19. Contacto">
        <p><Brand />, titular del RNC {SITE.legal.rnc}, que opera bajo el nombre comercial <Trade /><br />Domicilio: {SITE.legal.address}<br />Correo: <a href={`mailto:${SITE.legal.email}`}>{SITE.legal.email}</a> · Teléfono: {SITE.legal.phone}</p>
      </S>
    </LegalLayout>
  );
}
