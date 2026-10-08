import type { Article } from './types';

export const article: Article = {
  slug: 'proceso-de-inscripcion-escolar-checklist-para-colegios',
  title: 'Proceso de inscripción escolar: checklist para colegios',
  description:
    'Checklist del proceso de inscripción escolar en un colegio privado: admisión, documentos, contrato, reinscripción y cómo digitalizar el expediente.',
  date: '2026-09-26',
  category: 'Guías',
  readMinutes: 9,
  keywords: [
    'proceso de inscripción escolar',
    'checklist inscripción colegio',
    'documentos para inscribir en un colegio',
    'reinscripción escolar',
    'admisión colegio privado',
  ],
  summary:
    'Un buen proceso de inscripción combina cuatro etapas: admisión, recepción de documentos, contrato y pago, y confirmación de la plaza. Define una lista de documentos, plazos y responsables por escrito, y digitaliza el expediente para evitar pérdidas, duplicados y filas en temporada de matrícula.',
  sections: [
    {
      h2: 'Las etapas de un proceso de inscripción bien diseñado',
      blocks: [
        {
          t: 'p',
          text: 'La inscripción es la primera experiencia administrativa que una familia tiene con tu colegio, y condiciona la imagen que se llevará. También es una de las semanas más cargadas del año para la secretaría y la caja. Un proceso claro, con pasos y responsables definidos, reduce errores y esperas.',
        },
        {
          t: 'ol',
          items: [
            'Información y solicitud: la familia conoce la oferta, costos y calendario, y solicita un cupo.',
            'Admisión: entrevista, evaluación diagnóstica o revisión del historial, según la política del colegio.',
            'Documentación: entrega y verificación de los papeles del estudiante y del tutor.',
            'Contrato y pagos: firma del contrato de servicios y pago de la matrícula.',
            'Confirmación: asignación de curso y sección, y comunicación de lo que sigue.',
            'Seguimiento: documentos pendientes, bienvenida y entrega de acceso al portal.',
          ],
        },
        {
          t: 'p',
          text: 'Si estás montando tu colegio desde cero, el proceso de inscripción forma parte de tu operación desde el primer día; mira también [[como-abrir-un-colegio-privado-en-republica-dominicana|cómo abrir un colegio privado en República Dominicana]].',
        },
      ],
    },
    {
      h2: 'Checklist de documentos para inscribir a un estudiante',
      blocks: [
        {
          t: 'p',
          text: 'La lista exacta depende del nivel, de si el estudiante es nuevo o de reingreso y de las políticas de cada colegio. Esta tabla es una base habitual que debes ajustar a tu realidad y validar con el distrito educativo cuando haya dudas sobre lo que es obligatorio.',
        },
        {
          t: 'table',
          caption: 'Documentos habituales según la situación del estudiante',
          head: ['Documento', 'Estudiante nuevo', 'Reinscripción', 'Observación'],
          rows: [
            ['Formulario de inscripción o solicitud', 'Sí', 'Sí (actualización)', 'Conviene que el tutor confirme sus datos cada año'],
            ['Acta de nacimiento', 'Sí', 'Solo si falta', 'Ver aviso sobre acta pendiente más abajo'],
            ['Documento de identidad del tutor', 'Sí', 'Solo si cambió', 'Para contrato y contactos autorizados'],
            ['Historial o boletín del grado anterior', 'Sí', 'No aplica', 'Para ubicar al estudiante en el curso correspondiente'],
            ['Certificado médico o ficha de salud', 'Según política', 'Actualización', 'Incluye alergias y condiciones relevantes'],
            ['Fotografías', 'Según política', 'Según política', 'Para carné o expediente'],
            ['Contrato de servicios firmado', 'Sí', 'Sí', 'Con calendario de pagos'],
            ['Autorizaciones (uso de imagen, salidas, datos personales)', 'Sí', 'Actualización', 'Ver protección de datos'],
          ],
        },
        {
          t: 'callout',
          title: 'Acta de nacimiento pendiente',
          text: 'Una nota de la Presidencia de la República recoge que el MINERD indicó que la falta del acta de nacimiento no debe ser un obstáculo para inscribir a un estudiante, aunque el documento debe presentarse posteriormente, con base en la Ley 136-03. Confirma con tu distrito educativo cómo aplica a tu centro privado y registra el documento como pendiente en lugar de rechazar la inscripción.',
        },
      ],
    },
    {
      h2: 'Admisión: criterios claros y trato equitativo',
      blocks: [
        {
          t: 'p',
          text: 'La admisión es el filtro entre solicitar un cupo y obtenerlo. Definir criterios por escrito protege a la familia y al colegio frente a reclamos de trato desigual.',
        },
        {
          t: 'ul',
          items: [
            'Cupos por grado y sección, y fecha de cierre de solicitudes.',
            'Criterios de prioridad: hermanos, reinscripciones, lista de espera.',
            'Instrumentos de admisión: entrevista, evaluación diagnóstica, referencias del colegio anterior.',
            'Comunicación de resultados: fecha, medio y plazo para confirmar la plaza.',
            'Registro de cada aspirante y su estado (solicitó, evaluado, admitido, en espera, rechazado, inscrito).',
          ],
        },
        {
          t: 'p',
          text: 'Mantén un embudo sencillo: cuántas familias preguntan, cuántas solicitan, cuántas son admitidas y cuántas se inscriben. Te ayuda a planificar cupos y campañas con datos reales de tu colegio.',
        },
      ],
    },
    {
      h2: 'Contrato, cuotas y becas en el momento de inscribir',
      blocks: [
        {
          t: 'p',
          text: 'La inscripción es el momento ideal para dejar todo claro: lo que paga la familia, cuándo, y qué ocurre si se atrasa. Un contrato bien explicado previene la mayoría de los problemas de cobro (ver [[como-reducir-la-morosidad-en-un-colegio-privado|cómo reducir la morosidad]]).',
        },
        {
          t: 'ul',
          items: [
            'Matrícula, mensualidades y otros cargos con fechas de vencimiento.',
            'Descuentos aplicables (hermanos, pronto pago, convenios) y condiciones para mantenerlos.',
            'Becas: proceso de solicitud y criterios (ver [[como-gestionar-becas-y-descuentos-en-un-colegio-privado|becas y descuentos]]).',
            'Reglamento de convivencia, políticas de uniformes, comedor y transporte.',
            'Aviso de privacidad y consentimiento sobre datos del menor, conforme a la [[ley-172-13-proteccion-de-datos-en-colegios|Ley 172-13]].',
          ],
        },
      ],
    },
    {
      h2: 'Reinscripción: cómo hacerla sin filas ni papeleo repetido',
      blocks: [
        {
          t: 'p',
          text: 'Para estudiantes que ya están en el colegio, la reinscripción debería ser más corta que la inscripción inicial. No pidas de nuevo lo que ya tienes: solicita solo actualizaciones y confirmaciones.',
        },
        {
          t: 'ol',
          items: [
            'Define una ventana de reinscripción antes del cierre del año escolar y comunícala con anticipación.',
            'Verifica el estado de cuenta del estudiante antes de confirmar la reinscripción y comunica las condiciones con claridad.',
            'Pide al tutor confirmar o actualizar datos de contacto, personas autorizadas a recoger y datos de salud.',
            'Presenta el contrato y cuotas del nuevo año para firma.',
            'Confirma por escrito la plaza y los pasos siguientes (listas de útiles, uniformes, fechas).',
          ],
        },
        {
          t: 'p',
          text: 'Cualquier condición sobre morosidad para reinscribir debe estar en el contrato y haberse revisado con un abogado. Evita sorpresas el día de la reinscripción.',
        },
      ],
    },
    {
      h2: 'Digitalizar la inscripción: qué cambia y qué cuidar',
      blocks: [
        {
          t: 'p',
          text: 'Digitalizar no es escanear papeles y guardarlos en una carpeta. Es que cada dato del estudiante y del tutor se capture una sola vez y alimente al resto de los procesos: grupos, cobros, asistencia y comunicación.',
        },
        {
          t: 'table',
          head: ['Con papel y hojas sueltas', 'Con expediente digital'],
          rows: [
            ['Los mismos datos se copian en varios libros o archivos', 'Se capturan una vez y se reutilizan'],
            ['Documentos que se pierden o se dañan', 'Copias escaneadas asociadas al expediente'],
            ['Es difícil saber qué falta por familia', 'Lista de pendientes visible por estudiante'],
            ['Reinscripción que repite el papeleo', 'Datos precargados que el tutor solo confirma'],
            ['Información de cobros separada de la inscripción', 'Contrato, cuotas y becas conectadas con el estado de cuenta'],
          ],
        },
        {
          t: 'h3',
          text: 'Cuidados al digitalizar',
        },
        {
          t: 'ul',
          items: [
            'Controla quién puede ver el expediente: no todo el personal necesita acceder a todo.',
            'Conserva copias de seguridad y define dónde se almacenan los documentos.',
            'Informa a las familias para qué se usan sus datos y obtén el consentimiento cuando corresponda.',
            'Define cuánto tiempo conservarás los expedientes y cómo los depurarás, asesorado por un abogado.',
          ],
        },
        {
          t: 'p',
          text: 'Un sistema como STODIA integra inscripción, expediente, cobros y portal de tutores, de manera que la información que se registra en la inscripción alimenta el resto de los módulos. Si quieres ver cómo se vería con tu propio formulario y tus propias cuotas, puedes pedir una demostración. Y si todavía no sabes qué buscar, revisa [[como-elegir-un-software-de-gestion-escolar-checklist|cómo elegir un software de gestión escolar]].',
        },
      ],
    },
    {
      h2: 'Calendario de trabajo: qué hacer antes, durante y después',
      blocks: [
        {
          t: 'table',
          head: ['Momento', 'Tareas clave', 'Responsable sugerido'],
          rows: [
            ['Antes de abrir inscripciones', 'Actualizar costos, contrato, formularios, cupos y lista de documentos; capacitar al personal', 'Dirección y administración'],
            ['Durante la inscripción', 'Recibir solicitudes, evaluar, verificar documentos, firmar contratos, cobrar matrícula', 'Admisiones, secretaría y caja'],
            ['Cierre de inscripción', 'Revisar documentos pendientes, armar cursos, comunicar listas', 'Secretaría y coordinación académica'],
            ['Antes del inicio de clases', 'Entregar accesos al portal, comunicar calendario, uniformes y útiles', 'Administración y comunicación'],
            ['Primeras semanas', 'Cerrar pendientes, validar datos y revisar casos de salud o necesidades especiales', 'Secretaría y orientación'],
          ],
        },
        {
          t: 'p',
          text: 'Para ordenar quién hace qué en estas etapas, revisa [[como-organizar-la-administracion-de-un-colegio-privado|cómo organizar la administración de un colegio privado]].',
        },
      ],
    },
    {
      h2: 'Errores frecuentes en la inscripción',
      blocks: [
        {
          t: 'ul',
          items: [
            'No comunicar por escrito la lista de documentos y las fechas límite.',
            'Rechazar o dejar en el aire a familias por documentos que pueden entregarse después.',
            'Capturar datos de contacto sin verificar números y correos.',
            'No registrar a las personas autorizadas a recoger al estudiante.',
            'Mezclar cobros de matrícula con otros conceptos sin comprobante claro.',
            'No dar acceso a las familias a su información tras inscribirse.',
          ],
        },
      ],
    },
  ],
  faq: [
    {
      q: '¿Qué documentos piden para inscribir a un niño en un colegio privado?',
      a: 'Lo habitual es el formulario de inscripción, acta de nacimiento, documento del tutor, historial del grado anterior, información de salud y contrato firmado. La lista exacta la define cada colegio; confirma con el distrito educativo lo que es obligatorio.',
    },
    {
      q: '¿Se puede inscribir a un estudiante sin acta de nacimiento?',
      a: 'Según una nota de la Presidencia, el MINERD indicó que la falta del acta no debe impedir la inscripción, pero debe presentarse después. Registra el documento como pendiente y confirma con tu distrito cómo aplica en tu centro.',
    },
    {
      q: '¿Cuándo debe hacerse la reinscripción?',
      a: 'Cada colegio fija su calendario. Lo recomendable es abrir una ventana antes del cierre del año escolar y comunicarla con anticipación a los tutores.',
    },
    {
      q: '¿Cómo evitar filas en la inscripción?',
      a: 'Con citas o turnos, formularios previos en línea, documentos precargados para reinscripciones y varios medios de pago.',
    },
    {
      q: '¿Qué datos del estudiante puede recopilar el colegio?',
      a: 'Los necesarios para prestar el servicio educativo, con finalidad clara e información al tutor. Revisa la Ley 172-13 y pide asesoría legal para tus formularios.',
    },
  ],
  related: [
    'como-abrir-un-colegio-privado-en-republica-dominicana',
    'como-gestionar-becas-y-descuentos-en-un-colegio-privado',
    'ley-172-13-proteccion-de-datos-en-colegios',
    'comunicacion-con-padres-portal-de-tutores',
  ],
  sources: [
    {
      name: 'Presidencia de la República: MINERD indica que falta de acta de nacimiento no será obstáculo para inscribir estudiantes',
      url: 'https://presidencia.gob.do/noticias/minerd-indica-falta-de-acta-de-nacimiento-no-sera-obstaculo-para-inscribir-estudiantes',
    },
    {
      name: 'MINERD: portal oficial',
      url: 'https://www.ministeriodeeducacion.gob.do/',
    },
    {
      name: 'Ley 172-13 sobre Protección Integral de los Datos Personales (texto)',
      url: 'https://bdi.com.do/media/lx0bzgfe/ley-sobre-proteccion-datos-caracter-personal.pdf',
    },
  ],
};
