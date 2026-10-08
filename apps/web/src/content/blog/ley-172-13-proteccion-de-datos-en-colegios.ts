import type { Article } from './types';

export const article: Article = {
  slug: 'ley-172-13-proteccion-de-datos-en-colegios',
  title: 'Ley 172-13 y protección de datos en colegios: guía',
  description:
    'Qué exige la Ley 172-13 a un colegio privado dominicano al manejar datos de estudiantes y familias: consentimiento, derechos, seguridad y pasos prácticos.',
  date: '2026-09-12',
  category: 'Normativa',
  readMinutes: 9,
  keywords: [
    'Ley 172-13 colegios',
    'protección de datos personales República Dominicana',
    'datos de menores en escuelas',
    'consentimiento padres colegio',
    'hábeas data',
    'seguridad de datos escolares',
  ],
  summary:
    'La Ley 172-13 regula cómo se recopilan, guardan y usan los datos personales en República Dominicana, y un colegio privado es responsable de los datos de sus estudiantes, tutores y empleados. En la práctica, el colegio debe saber qué datos tiene, para qué los usa, protegerlos con medidas técnicas y organizativas y atender los reclamos de los titulares. Esta guía traduce esas ideas en pasos concretos para directores.',
  sections: [
    {
      h2: '¿Qué es la Ley 172-13 y por qué importa a un colegio?',
      blocks: [
        {
          t: 'p',
          text: 'La Ley 172-13 sobre Protección Integral de los Datos Personales fue promulgada el 13 de diciembre de 2013 y publicada en la Gaceta Oficial 10737. Desarrolla dos garantías de la Constitución dominicana: el derecho a la intimidad y a la protección de los datos personales (artículo 44) y la acción de hábeas data (artículo 70), que permite a una persona saber qué datos se guardan sobre ella y pedir que se corrijan o se eliminen.',
        },
        {
          t: 'p',
          text: 'Un colegio privado concentra información muy delicada: nombres completos y fechas de nacimiento de menores, cédulas de padres, direcciones, teléfonos, datos de salud o alergias, informes psicopedagógicos, calificaciones, fotografías y datos económicos de las familias. Todo eso son datos personales, y algunos pueden considerarse sensibles. Por eso el colegio actúa como responsable del tratamiento, aunque nunca haya oído hablar de la ley.',
        },
        {
          t: 'callout',
          title: 'Aviso importante',
          text: 'Este artículo es informativo y no constituye asesoría legal. Para decisiones concretas, por ejemplo redactar formularios de consentimiento o responder un reclamo formal, consulta con un abogado de tu confianza.',
        },
      ],
    },
    {
      h2: '¿Existe una autoridad de protección de datos en República Dominicana?',
      blocks: [
        {
          t: 'p',
          text: 'A diferencia de otros países de la región, la Ley 172-13 no creó una autoridad general de protección de datos con función de registro y supervisión para todos los sectores. La vía principal de reclamo es judicial, mediante el hábeas data, y existen supervisiones sectoriales, como la que ejerce la Superintendencia de Bancos sobre las sociedades de información crediticia.',
        },
        {
          t: 'p',
          text: 'Que no haya un regulador general no significa que la obligación no exista. Un reclamo de una familia puede llegar a un tribunal, y un incidente de seguridad dañará la reputación del colegio mucho antes de que lo haga una sentencia. Para un director, la mejor protección es tener orden y evidencia de que se actuó con diligencia.',
        },
      ],
    },
    {
      h2: '¿Qué datos personales maneja un colegio y cuáles son sensibles?',
      blocks: [
        {
          t: 'p',
          text: 'Haz un inventario simple. Una hoja con tres columnas basta para empezar: qué dato, dónde se guarda y quién puede verlo.',
        },
        {
          t: 'table',
          caption: 'Ejemplos de datos habituales en un colegio',
          head: ['Tipo de dato', 'Ejemplos', 'Nivel de cuidado'],
          rows: [
            ['Identificación', 'Nombre, fecha de nacimiento, cédula del tutor, dirección', 'Alto'],
            ['Académicos', 'Notas, boletines, asistencia, conducta', 'Alto'],
            ['Salud y apoyo', 'Alergias, condiciones médicas, informes psicopedagógicos', 'Muy alto (posiblemente sensibles)'],
            ['Económicos', 'Mensualidades, becas, deudas, medios de pago', 'Alto'],
            ['Imagen y voz', 'Fotos y videos de actividades, cámaras de seguridad', 'Medio a alto'],
            ['Personal docente', 'Contratos, nóminas, evaluaciones', 'Alto'],
          ],
        },
        {
          t: 'p',
          text: 'La ley reconoce una categoría de datos sensibles, como los de salud, y exige para ellos un consentimiento más estricto. Ante la duda sobre si un dato es sensible, trátalo con el nivel máximo de cuidado y pregunta a un profesional.',
        },
      ],
    },
    {
      h2: '¿Necesita el colegio el consentimiento de los padres?',
      blocks: [
        {
          t: 'p',
          text: 'La ley establece como regla general que el tratamiento de datos requiere el consentimiento previo, libre, inequívoco y específico del titular, con excepciones previstas por la propia norma (por ejemplo, obligaciones legales). Como los estudiantes son menores, quien consiente es el padre, la madre o el tutor legal, y el tratamiento de datos de niños y adolescentes debe además respetar la Ley 136-03, que protege sus derechos fundamentales y su interés superior.',
        },
        {
          t: 'p',
          text: 'No se puede afirmar con certeza qué usos exigen consentimiento adicional y cuáles quedan cubiertos por la relación contractual de la inscripción; esa línea la debe confirmar tu abogado. Lo que sí es una buena práctica universal es separar los usos esenciales de los opcionales.',
        },
        {
          t: 'ul',
          items: [
            'Usos esenciales: inscripción, notas, asistencia, cobros, comunicación académica. Explícalos en el contrato o formulario de inscripción.',
            'Usos opcionales: fotos en redes sociales, publicidad, boletines de terceros, uso de imagen del estudiante. Pide autorización específica y permite decir que no sin afectar el servicio educativo.',
            'Datos de salud: pide solo lo necesario (alergias, medicación, contacto de emergencia) y limita quién los ve.',
          ],
        },
      ],
    },
    {
      h2: '¿Qué derechos tienen las familias sobre sus datos?',
      blocks: [
        {
          t: 'p',
          text: 'La ley reconoce a los titulares derechos de acceso, rectificación, actualización y supresión de sus datos, además de la acción de hábeas data. Cuando un padre pregunta qué información tiene el colegio sobre su hijo, o pide corregir un apellido mal escrito, no es una molestia: es el ejercicio de un derecho.',
        },
        {
          t: 'ol',
          items: [
            'Designa a una persona (secretaría o administración) como punto de contacto para solicitudes sobre datos.',
            'Publica un correo o formulario para recibirlas y deja constancia de la fecha.',
            'Verifica la identidad del solicitante antes de entregar información; solo el tutor responsable debe acceder a los datos del menor.',
            'Responde por escrito y en un plazo razonable; guarda copia de la respuesta.',
            'Si piden eliminar datos que el colegio debe conservar por obligación legal o contable, explícalo con claridad en lugar de ignorar la solicitud.',
          ],
        },
      ],
    },
    {
      h2: '¿Qué medidas de seguridad debe aplicar un colegio?',
      blocks: [
        {
          t: 'p',
          text: 'Uno de los principios de la ley es la seguridad: el responsable debe adoptar medidas técnicas y organizativas para evitar la alteración, pérdida o acceso no autorizado a los datos. La ley no dicta una lista técnica exacta; entonces la pregunta útil es qué haría un colegio diligente.',
        },
        {
          t: 'ul',
          items: [
            'Accesos por rol: cada persona ve solo lo que necesita. Un docente no necesita ver los saldos de las familias; cobros no necesita ver informes psicopedagógicos.',
            'Contraseñas individuales y robustas; nada de cuentas compartidas ni claves pegadas en la pared.',
            'Respaldos periódicos y probados, guardados fuera del equipo principal.',
            'Registro de auditoría: saber quién consultó o modificó qué dato y cuándo.',
            'Equipos con actualizaciones y antivirus; pantallas bloqueadas; archivos físicos bajo llave.',
            'Acuerdos de confidencialidad con el personal y con cualquier proveedor que toque los datos.',
            'Un plan escrito de respuesta si ocurre una fuga o pérdida.',
          ],
        },
        {
          t: 'p',
          text: 'Para profundizar, lee la [[seguridad-de-la-informacion-en-colegios-guia-practica|guía práctica de seguridad de la información en colegios]]. Si todavía manejas todo en hojas sueltas, revisa también [[excel-vs-software-de-gestion-escolar|las diferencias entre Excel y un software de gestión escolar]], porque la trazabilidad de accesos es difícil de lograr en archivos compartidos.',
        },
      ],
    },
    {
      h2: '¿Qué normas se relacionan además de la Ley 172-13?',
      blocks: [
        {
          t: 'table',
          head: ['Norma', 'Qué aporta al tema'],
          rows: [
            ['Constitución, arts. 44 y 70', 'Intimidad, protección de datos personales y hábeas data'],
            ['Ley 172-13', 'Principios, consentimiento, derechos de los titulares y sanciones sobre datos personales'],
            ['Ley 53-07', 'Delitos de alta tecnología: acceso ilícito a sistemas, interceptación y uso indebido de datos'],
            ['Ley 136-03', 'Derechos de niños, niñas y adolescentes, incluida su privacidad e imagen'],
          ],
        },
        {
          t: 'p',
          text: 'La Ley 53-07 es relevante porque un acceso no autorizado a los sistemas del colegio puede constituir un delito informático, y es útil como argumento para denunciar un incidente. Las sanciones concretas y sus montos deben consultarse en el texto oficial vigente.',
        },
      ],
    },
    {
      h2: 'Checklist de cumplimiento para directores',
      blocks: [
        {
          t: 'ul',
          items: [
            'Inventario de datos: qué recopilamos, para qué, dónde y quién accede.',
            'Aviso de privacidad breve en el formulario de inscripción y en el sitio web.',
            'Autorización separada para fotos, videos y publicidad.',
            'Procedimiento y responsable para solicitudes de acceso o corrección.',
            'Roles y permisos documentados; cuentas dadas de baja cuando alguien sale.',
            'Respaldos con prueba de restauración al menos una vez por periodo.',
            'Cláusulas de confidencialidad con personal y proveedores.',
            'Plan de respuesta a incidentes con contactos y pasos escritos.',
            'Política de conservación: cuánto tiempo se guardan expedientes y cuándo se eliminan.',
            'Capacitación anual breve para el personal administrativo y docente.',
          ],
        },
        {
          t: 'p',
          text: 'Un sistema de gestión escolar ayuda a ordenar varios de estos puntos, porque centraliza los datos, asigna permisos por rol y deja registro de actividad. STODIA, por ejemplo, trabaja con roles, contraseñas almacenadas con bcrypt, sesiones con JWT y auditoría de acciones; aun así, ninguna herramienta cumple la ley por sí sola: el cumplimiento también depende de tus políticas y de cómo las apliques. Si estás comparando opciones, la [[como-elegir-un-software-de-gestion-escolar-checklist|checklist para elegir un software de gestión escolar]] incluye preguntas de seguridad.',
        },
      ],
    },
    {
      h2: 'Errores comunes que conviene evitar',
      blocks: [
        {
          t: 'ul',
          items: [
            'Compartir listas con datos de contacto en grupos de mensajería abiertos.',
            'Publicar fotos de estudiantes sin autorización específica de la familia.',
            'Enviar boletines o estados de cuenta por canales sin verificar que lleguen al tutor correcto.',
            'Usar una sola cuenta de administrador para todo el personal.',
            'Guardar copias de cédulas o informes en memorias USB sin protección.',
            'No dar de baja el acceso de empleados que ya no trabajan en el colegio.',
          ],
        },
        {
          t: 'p',
          text: 'La comunicación con las familias también es un punto de riesgo; un canal oficial y controlado reduce errores, como explica el artículo sobre [[comunicacion-con-padres-portal-de-tutores|comunicación con padres y portal de tutores]].',
        },
      ],
    },
  ],
  faq: [
    {
      q: '¿La Ley 172-13 aplica a los colegios privados?',
      a: 'Sí en la medida en que el colegio recopila y trata datos personales de estudiantes, tutores y empleados, lo cual ocurre en toda institución educativa. La ley se aplica a quien trata datos personales, sin distinguir si es público o privado, aunque conviene confirmar los detalles con un abogado.',
    },
    {
      q: '¿Hay que registrar la base de datos del colegio ante alguna autoridad?',
      a: 'La ley no crea una autoridad general de protección de datos ante la cual todos los colegios deban registrarse. Aun así, debes mantener tus datos ordenados y protegidos. Verifica con un profesional si algún sector específico en el que operes añade requisitos.',
    },
    {
      q: '¿Puede el colegio publicar fotos de los estudiantes?',
      a: 'Lo prudente es pedir autorización específica del padre, madre o tutor para fotos y videos con fines de promoción, explicar dónde se publicarán y permitir retirarla. Recuerda además que la Ley 136-03 protege la imagen y la privacidad de los menores.',
    },
    {
      q: '¿Qué hago si se pierde o se filtra información de estudiantes?',
      a: 'Contén el incidente (cambiar claves, aislar equipos, revocar accesos), identifica qué datos se afectaron, informa a las familias involucradas de forma clara y consulta a un abogado y a un especialista en seguridad. Tener un plan escrito de antemano acelera todo esto.',
    },
    {
      q: '¿Usar un software de gestión escolar me hace cumplir la ley automáticamente?',
      a: 'No. Un buen software facilita roles, registros de auditoría y respaldos, pero el cumplimiento depende también de tus políticas, tus consentimientos y de cómo el personal use la herramienta.',
    },
  ],
  related: [
    'seguridad-de-la-informacion-en-colegios-guia-practica',
    'excel-vs-software-de-gestion-escolar',
    'comunicacion-con-padres-portal-de-tutores',
    'software-escolar-en-la-nube-vs-en-tu-servidor',
  ],
  sources: [
    {
      name: 'Ley 172-13 sobre Protección Integral de los Datos Personales (texto en inglés, PHLaw)',
      url: 'https://phlaw.com/wp-content/uploads/2015/09/Read-the-PDFLaw-No.-172-13-on-Comprehensive-Protection-of-Personal-Data.pdf',
    },
    {
      name: 'Resumen de la Ley 172-13 (Pellerano & Herrera, en español)',
      url: 'https://phlaw.com/es/ley-172-13-sobre-proteccion-de-datos-personales/',
    },
    {
      name: 'Ley 172-13, texto en PDF (BDI)',
      url: 'https://bdi.com.do/media/lx0bzgfe/ley-sobre-proteccion-datos-caracter-personal.pdf',
    },
  ],
};
