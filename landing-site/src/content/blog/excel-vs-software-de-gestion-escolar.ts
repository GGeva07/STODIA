import type { Article } from './types';

export const article: Article = {
  slug: 'excel-vs-software-de-gestion-escolar',
  title: 'Excel vs software de gestión escolar: cuál conviene',
  description:
    'Compara Excel y un software de gestión escolar para tu colegio: costos ocultos, errores, seguridad, cobros y cuándo es momento de dar el salto.',
  date: '2026-09-18',
  category: 'Tecnología',
  readMinutes: 9,
  keywords: [
    'Excel vs software de gestión escolar',
    'software de gestión escolar',
    'administrar un colegio con Excel',
    'sistema escolar República Dominicana',
    'migrar de Excel a software escolar',
  ],
  summary:
    'Excel funciona bien para un colegio muy pequeño con pocos procesos, pero se vuelve riesgoso cuando crecen los estudiantes, los cobros y el personal que toca los datos. Un software de gestión escolar centraliza información, controla permisos y reduce errores de digitación. La decisión no es ideológica: depende del tamaño, del volumen de cobros y del riesgo que aceptes.',
  sections: [
    {
      h2: '¿Se puede administrar un colegio con Excel?',
      blocks: [
        {
          t: 'p',
          text: 'Sí, y muchos colegios dominicanos empezaron así: una hoja para la lista de estudiantes, otra para las mensualidades, otra para las notas. Excel es flexible, familiar y casi no tiene costo adicional. Para un centro pequeño, con pocos grados y una sola persona administrando, puede ser suficiente durante un tiempo.',
        },
        {
          t: 'p',
          text: 'El problema aparece de forma gradual. Cada hoja nueva multiplica las copias, cada persona que edita aumenta la probabilidad de error y cada informe pedido por un padre o por la dirección requiere cruzar datos a mano. El costo real de Excel no está en la licencia, sino en el tiempo y en los errores.',
        },
      ],
    },
    {
      h2: 'Comparativa: Excel frente a un software de gestión escolar',
      blocks: [
        {
          t: 'table',
          head: ['Criterio', 'Excel / hojas de cálculo', 'Software de gestión escolar'],
          rows: [
            ['Costo inicial', 'Bajo o nulo', 'Suscripción o licencia (varía según proveedor)'],
            ['Datos centralizados', 'Dispersos en varios archivos', 'Una sola base de datos'],
            ['Errores de digitación', 'Frecuentes; sin validaciones automáticas', 'Validaciones y campos controlados'],
            ['Permisos por persona', 'Limitados; quien tiene el archivo lo ve todo', 'Roles: cada usuario ve solo lo necesario'],
            ['Historial de cambios', 'Difícil de rastrear', 'Auditoría de quién cambió qué'],
            ['Cobros y estados de cuenta', 'Manual, sujeto a fórmulas rotas', 'Cargos, pagos y saldos automáticos'],
            ['Notas y boletines', 'Plantillas por curso', 'Cálculo y boletines generados'],
            ['Acceso de padres', 'Inexistente o por mensajería', 'Portal o app para tutores'],
            ['Respaldos', 'Depende de la disciplina de cada quien', 'Respaldos programados y centralizados'],
            ['Crecimiento', 'Se vuelve inmanejable', 'Diseñado para escalar'],
          ],
        },
        {
          t: 'p',
          text: 'La tabla no dice que Excel sea malo. Dice que sus fortalezas (flexibilidad y bajo costo) pierden peso frente a sus debilidades cuando el colegio supera cierta complejidad.',
        },
      ],
    },
    {
      h2: 'Los costos ocultos de Excel',
      blocks: [
        {
          t: 'ul',
          items: [
            'Tiempo administrativo: horas cada mes consolidando pagos, listas y reportes que un sistema genera sin intervención.',
            'Errores económicos: un pago no registrado o una beca mal aplicada se traduce en dinero perdido o en conflictos con una familia.',
            'Dependencia de una persona: si quien creó las fórmulas se va, nadie entiende el archivo.',
            'Versiones duplicadas: "Mensualidades_final_v3_OK.xlsx" en tres computadoras distintas.',
            'Riesgo de pérdida: un equipo dañado o un archivo corrupto sin respaldo puede borrar años de historial.',
            'Imagen frente a las familias: respuestas lentas a preguntas simples como "cuánto debo" o "cuál es la nota de mi hijo".',
          ],
        },
        {
          t: 'p',
          text: 'No inventes números de ahorro. Mide los tuyos: cuenta las horas que tu equipo dedica al cierre de mes y las diferencias de caja detectadas en el último trimestre. Esa es tu línea base real para decidir.',
        },
      ],
    },
    {
      h2: '¿Es seguro guardar datos de estudiantes en Excel?',
      blocks: [
        {
          t: 'p',
          text: 'Un archivo de Excel viaja fácil: por correo, en una memoria USB, en un grupo de mensajería. Cada copia es un nuevo punto de fuga de datos de menores, algo especialmente delicado según lo que explica la guía sobre la [[ley-172-13-proteccion-de-datos-en-colegios|Ley 172-13 y la protección de datos en colegios]]. Proteger un archivo con contraseña ayuda, pero no resuelve la falta de permisos diferenciados ni de trazabilidad.',
        },
        {
          t: 'p',
          text: 'Un software bien diseñado no es mágico, pero ofrece controles que una hoja no puede: usuarios individuales, roles, registro de actividad y respaldos centralizados. Profundiza en estos controles en la [[seguridad-de-la-informacion-en-colegios-guia-practica|guía práctica de seguridad de la información]].',
        },
      ],
    },
    {
      h2: '¿Cuándo es momento de dejar Excel?',
      blocks: [
        {
          t: 'p',
          text: 'No hay un número mágico de estudiantes, pero estas señales suelen indicar que llegó la hora:',
        },
        {
          t: 'ul',
          items: [
            'Más de una persona edita los mismos archivos y ya hubo pisadas o pérdidas de datos.',
            'El cierre de mes toma varios días o requiere "cuadrar" cifras entre hojas.',
            'Los padres piden estados de cuenta, boletines o constancias con frecuencia y cada uno requiere trabajo manual.',
            'Hay becas, descuentos por hermanos o recargos por mora difíciles de aplicar con consistencia.',
            'Necesitas controlar comedor, inventario, tienda o transporte además de las notas.',
            'La dirección no puede responder en minutos cuántos estudiantes están al día y cuántos no.',
            'Te preocupa la seguridad: no sabes quién ha abierto o copiado qué.',
          ],
        },
        {
          t: 'p',
          text: 'Si reconoces tres o más, el costo de seguir con Excel probablemente ya supera el de migrar. Para cuantificar la inversión, consulta [[cuanto-cuesta-un-sistema-de-gestion-escolar|cuánto cuesta un sistema de gestión escolar]].',
        },
      ],
    },
    {
      h2: 'Cómo migrar de Excel a un sistema sin morir en el intento',
      blocks: [
        {
          t: 'ol',
          items: [
            'Limpia tus datos: elimina duplicados, unifica nombres de cursos y verifica cédulas y teléfonos de tutores.',
            'Define qué módulos necesitas primero (por ejemplo inscripción, cobros y notas) y deja lo demás para una segunda fase.',
            'Pide una demostración con tus propios casos: una familia con tres hijos, una beca parcial, un cambio de sección.',
            'Importa una muestra pequeña y verifica contra tus hojas antes de cargar todo.',
            'Capacita primero al personal de administración; luego a docentes y, al final, a las familias.',
            'Mantén Excel en paralelo durante un ciclo corto de cobro para comparar resultados, y luego retíralo.',
            'Archiva las hojas antiguas con respaldo como evidencia histórica.',
          ],
        },
        {
          t: 'p',
          text: 'La [[como-elegir-un-software-de-gestion-escolar-checklist|checklist para elegir un software de gestión escolar]] te da preguntas concretas para evaluar proveedores, y la [[software-escolar-en-la-nube-vs-en-tu-servidor|comparativa entre software en la nube y en tu servidor]] te ayuda a decidir dónde vivirán tus datos.',
        },
      ],
    },
    {
      h2: 'Qué puede aportar STODIA en la transición',
      blocks: [
        {
          t: 'p',
          text: 'STODIA es un sistema de gestión escolar pensado para colegios privados dominicanos: reúne inscripción, notas, asistencia, finanzas y cobros con punto de venta, comedor, becas, inventario, portal de tutores, aplicación móvil (PWA) y versión de escritorio. Cada colegio tiene su propia instancia, que puede instalarse en el servidor del centro o ser alojada por SynsetSolutions. Si quieres ver cómo se vería tu operación actual dentro de un sistema, puedes solicitar una demostración, sin compromiso, y llevar tus casos más complicados para evaluarlo con ellos.',
        },
        {
          t: 'callout',
          title: 'Una regla práctica',
          text: 'Elige la herramienta que tu equipo realmente va a usar. Un sistema excelente que nadie adopta es peor que una hoja bien cuidada; por eso pesa tanto la capacitación y el acompañamiento del proveedor.',
        },
      ],
    },
  ],
  faq: [
    {
      q: '¿Cuántos estudiantes necesito para justificar un software de gestión escolar?',
      a: 'No existe un número universal. Lo que cuenta es la complejidad: cantidad de cobros, personas que editan datos, necesidad de reportes y riesgo de errores. Muchos colegios sienten el límite de Excel mucho antes de llegar a grandes matrículas.',
    },
    {
      q: '¿Puedo importar mis datos de Excel a un sistema escolar?',
      a: 'Normalmente sí, mediante plantillas de importación, siempre que tus datos estén limpios y consistentes. Pregunta al proveedor cómo se hace, si incluye acompañamiento y cómo se valida la carga antes de usarla en producción.',
    },
    {
      q: '¿Excel es peor en seguridad?',
      a: 'Excel puede protegerse con contraseña, pero carece de roles, historial de cambios y control centralizado. Su mayor riesgo está en las copias que circulan por correo, memorias y mensajería.',
    },
    {
      q: '¿Qué pasa si el sistema falla o cambio de proveedor?',
      a: 'Antes de contratar, pregunta cómo exportas tus datos, en qué formato y cómo funcionan los respaldos. Tus datos son del colegio, y debes poder llevártelos cuando lo decidas.',
    },
  ],
  related: [
    'software-escolar-en-la-nube-vs-en-tu-servidor',
    'como-elegir-un-software-de-gestion-escolar-checklist',
    'cuanto-cuesta-un-sistema-de-gestion-escolar',
    'seguridad-de-la-informacion-en-colegios-guia-practica',
  ],
  sources: [
    {
      name: 'NIST: Guía de seguridad para pequeñas empresas (Small Business Cybersecurity Corner)',
      url: 'https://www.nist.gov/itl/smallbusinesscyber',
    },
    {
      name: 'Resumen de la Ley 172-13 sobre Protección de Datos Personales',
      url: 'https://phlaw.com/es/ley-172-13-sobre-proteccion-de-datos-personales/',
    },
  ],
};
