import type { Article } from './types';

export const article: Article = {
  slug: 'control-de-asistencia-digital-en-colegios',
  title: 'Control de asistencia digital en colegios: guía',
  description:
    'Cómo implementar el control de asistencia digital en un colegio: métodos, alertas a padres, reportes, buenas prácticas y errores frecuentes al dejar el papel.',
  date: '2026-09-30',
  category: 'Administración',
  readMinutes: 8,
  keywords: [
    'control de asistencia digital',
    'asistencia escolar',
    'registro de asistencia colegio',
    'ausentismo escolar',
    'pasar lista digital',
  ],
  summary:
    'El control de asistencia digital sustituye el papel y las hojas sueltas por un registro único, en tiempo real, que alimenta reportes y avisos a las familias. Funciona mejor cuando el docente puede marcar en menos de un minuto, hay reglas claras para justificaciones y los datos se usan para actuar a tiempo. La herramienta es solo la mitad: la otra mitad es el proceso.',
  sections: [
    {
      h2: '¿Por qué digitalizar la asistencia?',
      blocks: [
        {
          t: 'p',
          text: 'Pasar lista en papel es rápido en el aula, pero el trabajo viene después: alguien transcribe, alguien consolida, alguien responde a un padre que reclama una falta. En un colegio con muchas secciones, eso significa errores, retrasos y datos que llegan tarde para ser útiles.',
        },
        {
          t: 'ul',
          items: [
            'Un solo registro: lo que marca el docente es lo que ve la dirección y, si corresponde, la familia.',
            'Información a tiempo: saber el mismo día cuántos estudiantes faltaron y quiénes.',
            'Menos transcripción: no hay que pasar de la hoja al sistema.',
            'Historial confiable: útil para boletines, constancias y reuniones con padres.',
            'Alertas tempranas: detectar patrones de ausencias antes de que afecten el rendimiento.',
          ],
        },
        {
          t: 'p',
          text: 'No existe un porcentaje universal de mejora para citar. El beneficio real lo medirás tú comparando horas de trabajo administrativo, discrepancias en las listas y rapidez de respuesta a las familias antes y después.',
        },
      ],
    },
    {
      h2: 'Métodos de control de asistencia: ¿cuál elegir?',
      blocks: [
        {
          t: 'table',
          head: ['Método', 'Ventajas', 'Desventajas'],
          rows: [
            ['Lista en papel', 'Sin tecnología, inmediata', 'Transcripción, pérdida, errores, sin alertas'],
            ['Hoja de cálculo compartida', 'Barata y flexible', 'Conflictos de edición, sin permisos finos'],
            ['Registro digital por el docente (móvil o PC)', 'Rápido, centralizado, con reportes', 'Requiere dispositivo y conectividad o modo sin conexión'],
            ['Carnet con código QR o tarjeta', 'Agiliza entradas y salidas', 'Costo de lectores, carnets perdidos, uso indebido'],
            ['Biometría', 'Difícil de suplantar', 'Datos biométricos de menores: alto nivel de sensibilidad y riesgo; evalúalo con asesoría legal'],
          ],
        },
        {
          t: 'p',
          text: 'Para la mayoría de los colegios, el registro digital hecho por el docente en un teléfono, tableta o computadora de aula es el punto de partida más sensato. Los métodos con carnet o biometría pueden añadirse después, pero exigen más cuidado con los datos personales de los menores, tema que se trata en la guía de [[ley-172-13-proteccion-de-datos-en-colegios|la Ley 172-13 en colegios]].',
        },
      ],
    },
    {
      h2: 'Cómo debe ser el flujo diario ideal',
      blocks: [
        {
          t: 'ol',
          items: [
            'Primera hora: el docente abre su lista del curso en el sistema y marca presente, ausente, tardanza o excusa.',
            'Antes de cierta hora definida por el colegio, coordinación revisa los casos pendientes o inconsistentes.',
            'El sistema consolida las ausencias del día por curso y genera el resumen para dirección.',
            'Se avisa a los tutores de los estudiantes ausentes por el canal oficial acordado.',
            'Las justificaciones (certificado médico, nota de los padres) se registran en el mismo sistema.',
            'Al cierre de semana o mes, se revisan los patrones y se actúa.',
          ],
        },
        {
          t: 'callout',
          title: 'Consejo práctico',
          text: 'Marcar asistencia no debe tomar más de un minuto por clase. Si toma más, el personal buscará atajos y los datos perderán calidad. Prueba el flujo con docentes reales antes de implementarlo.',
        },
      ],
    },
    {
      h2: 'Reglas que debes definir antes de empezar',
      blocks: [
        {
          t: 'ul',
          items: [
            'Estados válidos: presente, ausente, tardanza, ausencia justificada, salida anticipada.',
            'Hora límite para marcar y quién puede corregir después.',
            'Qué se considera tardanza y cuántas equivalen a una falta, si el reglamento del colegio lo establece.',
            'Cómo y en qué plazo se justifican las ausencias, y quién las aprueba.',
            'Quién puede editar registros pasados; cada cambio debe quedar auditado.',
            'Cuándo y cómo se avisa a las familias.',
            'Qué se hace cuando un estudiante acumula ausencias: llamada, reunión, plan de apoyo.',
          ],
        },
        {
          t: 'p',
          text: 'Estas reglas deben estar en tu manual de convivencia o reglamento interno, para que lo digital refleje lo que ya está acordado con las familias. Si apenas estás armando tu estructura, revisa [[como-organizar-la-administracion-de-un-colegio-privado|cómo organizar la administración de un colegio privado]].',
        },
      ],
    },
    {
      h2: '¿Cómo avisar a los padres de una ausencia?',
      blocks: [
        {
          t: 'p',
          text: 'La notificación el mismo día es una de las funciones más apreciadas por las familias, porque tranquiliza y permite reaccionar rápido ante un hecho extraño. Puede hacerse mediante el portal o la aplicación de tutores, o por mensajes, siempre con un canal oficial y datos de contacto actualizados.',
        },
        {
          t: 'ul',
          items: [
            'Redacta mensajes neutros y breves: "Su hijo(a) fue registrado(a) ausente hoy. Si ya lo informó, ignore este mensaje."',
            'No incluyas datos sensibles en mensajes que puedan verse en pantallas bloqueadas.',
            'Mantén actualizados los números y correos; un aviso al tutor equivocado es un problema de privacidad.',
            'Ofrece un canal para justificar desde el mismo portal.',
          ],
        },
        {
          t: 'p',
          text: 'Para integrar estos avisos con otras comunicaciones, mira [[comunicacion-con-padres-portal-de-tutores|comunicación con padres y portal de tutores]].',
        },
      ],
    },
    {
      h2: 'Cómo usar los datos de asistencia para actuar',
      blocks: [
        {
          t: 'p',
          text: 'Registrar no basta; hay que leer los datos. Algunos reportes útiles:',
        },
        {
          t: 'ul',
          items: [
            'Ausencias por estudiante en el último mes, ordenadas de mayor a menor.',
            'Ausencias por curso y por día de la semana, para detectar patrones (por ejemplo, lunes o vísperas de feriado).',
            'Tardanzas recurrentes por franja horaria.',
            'Estudiantes con ausencias consecutivas, que ameritan una llamada.',
            'Comparación de asistencia con rendimiento, para priorizar apoyo.',
          ],
        },
        {
          t: 'p',
          text: 'Ante ausencias reiteradas de un menor, el colegio actúa dentro de su rol de protección y debe seguir sus protocolos internos y las normas aplicables sobre niñez, como la Ley 136-03. Ante casos complejos, consulta con orientación y con un asesor legal.',
        },
      ],
    },
    {
      h2: 'Privacidad y seguridad de los registros',
      blocks: [
        {
          t: 'p',
          text: 'La asistencia parece un dato inocente, pero asociada a nombres de menores y a patrones de comportamiento merece cuidado. Aplica permisos por rol (el docente ve sus cursos; coordinación ve su ámbito), conserva un historial de cambios y respalda la información. Revisa estos controles en la [[seguridad-de-la-informacion-en-colegios-guia-practica|guía práctica de seguridad]]. Si el colegio usa cámaras, huellas o carnets con foto, evalúa con un abogado el consentimiento de las familias y la finalidad de cada dato.',
        },
      ],
    },
    {
      h2: 'Errores frecuentes al digitalizar la asistencia',
      blocks: [
        {
          t: 'ul',
          items: [
            'Implementar una herramienta sin definir primero las reglas.',
            'No dar tiempo a los docentes ni capacitarlos: la resistencia suele ser por falta de práctica, no de voluntad.',
            'Depender de conexión constante sin plan alterno; ten un procedimiento para cortes de internet.',
            'Permitir editar el pasado sin dejar rastro.',
            'No conectar la asistencia con las notas, los boletines y la comunicación con padres, y crear islas de datos.',
          ],
        },
        {
          t: 'p',
          text: 'STODIA incluye un módulo de asistencia integrado con notas, portal de tutores y aplicación móvil (PWA), pensado para marcar rápido desde el aula y consultar reportes por curso. Si deseas verlo con tus propios grupos, puedes solicitar una demostración; y para compararlo con otras alternativas, utiliza la [[como-elegir-un-software-de-gestion-escolar-checklist|checklist de selección]].',
        },
      ],
    },
  ],
  faq: [
    {
      q: '¿Qué es el control de asistencia digital en un colegio?',
      a: 'Es el registro electrónico de la presencia, ausencia y tardanza de los estudiantes, normalmente hecho por el docente desde un dispositivo, que alimenta reportes y avisos a las familias sin transcripciones manuales.',
    },
    {
      q: '¿Se necesitan carnets o biometría?',
      a: 'No. Un registro digital hecho por el docente suele ser suficiente. Los carnets o la biometría añaden costos y obligaciones de privacidad, por lo que conviene evaluarlos con cuidado, sobre todo tratándose de menores.',
    },
    {
      q: '¿Qué pasa si no hay internet en el aula?',
      a: 'Define un plan alterno: marcar en papel y cargar después, o usar una herramienta con funcionamiento sin conexión. Pregunta al proveedor cómo maneja los cortes de conectividad.',
    },
    {
      q: '¿Quién puede modificar una asistencia ya registrada?',
      a: 'Solo roles autorizados (por ejemplo, coordinación), y cada modificación debe quedar en un registro de auditoría con usuario, fecha y motivo.',
    },
    {
      q: '¿Se deben avisar todas las ausencias a los padres?',
      a: 'Es una buena práctica avisar las ausencias no informadas el mismo día. Define en tu reglamento qué se notifica y por qué canal, y avisa a las familias al inscribirse.',
    },
  ],
  related: [
    'comunicacion-con-padres-portal-de-tutores',
    'excel-vs-software-de-gestion-escolar',
    'seguridad-de-la-informacion-en-colegios-guia-practica',
    'ley-172-13-proteccion-de-datos-en-colegios',
  ],
  sources: [
    {
      name: 'Resumen de la Ley 172-13 sobre Protección de Datos Personales',
      url: 'https://phlaw.com/es/ley-172-13-sobre-proteccion-de-datos-personales/',
    },
  ],
};
