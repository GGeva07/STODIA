import type { Article } from './types';

export const article: Article = {
  slug: 'como-organizar-la-administracion-de-un-colegio-privado',
  title: 'Cómo organizar la administración de un colegio privado',
  description:
    'Guía para organizar la administración de un colegio privado: roles, procesos clave, controles, indicadores y herramientas para dirigir con orden y datos.',
  date: '2026-10-01',
  category: 'Administración',
  readMinutes: 9,
  keywords: [
    'administración de un colegio privado',
    'organizar la administración escolar',
    'roles en un colegio privado',
    'indicadores de gestión escolar',
    'procesos administrativos colegio',
  ],
  summary:
    'Organizar la administración de un colegio privado significa separar funciones, documentar los procesos clave (admisión, cobros, personal, compras, comunicación), medir unos pocos indicadores y apoyarse en herramientas que evitan duplicar datos. El objetivo es que la dirección dedique su tiempo a lo educativo y no a apagar incendios administrativos.',
  sections: [
    {
      h2: 'Por qué la administración condiciona la calidad educativa',
      blocks: [
        {
          t: 'p',
          text: 'En muchos colegios privados, el director o la dueña termina resolviendo todo: un cobro dudoso, una nota perdida, una queja de un padre, una compra urgente. Ese modelo funciona mientras el colegio es pequeño y deja de funcionar cuando crece. Una administración ordenada no es burocracia: es lo que permite que los docentes enseñen y la dirección lidere.',
        },
        {
          t: 'p',
          text: 'Este artículo propone un marco simple: roles claros, procesos escritos, controles básicos, pocos indicadores y herramientas adecuadas. Ajústalo a tu tamaño; no hace falta tener un organigrama enorme para aplicarlo.',
        },
      ],
    },
    {
      h2: 'Define roles y responsabilidades',
      blocks: [
        {
          t: 'p',
          text: 'En un colegio pequeño una misma persona puede cumplir varios roles, pero conviene que cada función esté asignada y que quien cobra no sea quien aprueba descuentos, por ejemplo.',
        },
        {
          t: 'table',
          caption: 'Mapa de roles típicos',
          head: ['Rol', 'Responsabilidades principales', 'Debe poder ver'],
          rows: [
            ['Dirección general', 'Visión, decisiones estratégicas, relación con el MINERD y con la junta o propietarios', 'Todo, en modo resumen'],
            ['Coordinación académica', 'Horarios, planificación docente, calendario de evaluaciones, calificaciones', 'Información académica y de personal docente'],
            ['Administración y finanzas', 'Presupuesto, pagos a proveedores, nómina, cobros, conciliación', 'Información financiera'],
            ['Secretaría', 'Expedientes, inscripciones, certificaciones, atención a padres', 'Datos de estudiantes y tutores'],
            ['Caja', 'Cobro de cuotas, recibos y cuadre diario', 'Estado de cuenta de tutores'],
            ['Orientación y bienestar', 'Seguimiento de conducta, apoyo a estudiantes y familias', 'Información sensible, con acceso restringido'],
            ['Docentes', 'Asistencia, evaluaciones y comunicación con familias', 'Sus cursos y estudiantes'],
            ['Mantenimiento y servicios', 'Limpieza, seguridad, comedor, transporte', 'Solo lo necesario para su labor'],
          ],
        },
        {
          t: 'callout',
          title: 'Principio de separación de funciones',
          text: 'Quien registra un pago no debería ser quien aprueba un descuento ni quien concilia el banco. Si el colegio es pequeño y no es posible, compensa con revisiones periódicas de otra persona.',
        },
      ],
    },
    {
      h2: 'Procesos clave que conviene documentar',
      blocks: [
        {
          t: 'p',
          text: 'Un proceso documentado es una hoja de una página que dice quién hace qué, en qué orden y en qué plazo. No necesitas manuales de cien páginas; necesitas que cuando alguien falte, otro pueda continuar.',
        },
        {
          t: 'ul',
          items: [
            'Admisión e inscripción: de la solicitud a la confirmación (ver [[proceso-de-inscripcion-escolar-checklist-para-colegios|checklist de inscripción escolar]]).',
            'Cobros: emisión de cuotas, recibos, cierre de caja y seguimiento de atrasos (ver [[como-reducir-la-morosidad-en-un-colegio-privado|cómo reducir la morosidad]]).',
            'Becas y descuentos: solicitud, evaluación, aprobación y revisión (ver [[como-gestionar-becas-y-descuentos-en-un-colegio-privado|gestión de becas]]).',
            'Personal: contratación, expedientes, evaluación, ausencias y nómina.',
            'Compras e inventario: solicitud, aprobación, recepción y control de existencias.',
            'Asistencia y calificaciones: registro, correcciones y cierre de periodos (ver [[control-de-asistencia-digital-en-colegios|control de asistencia digital]]).',
            'Comunicación con familias: canales, tiempos de respuesta y protocolo de quejas.',
            'Documentos y certificaciones: quién los emite, con qué requisitos y en cuánto tiempo.',
          ],
        },
        {
          t: 'h3',
          text: 'Plantilla mínima para documentar un proceso',
        },
        {
          t: 'ol',
          items: [
            'Nombre del proceso y objetivo.',
            'Responsable y personas que participan.',
            'Pasos numerados, con plazos.',
            'Documentos o datos que se necesitan y dónde se guardan.',
            'Qué hacer cuando algo sale mal (excepciones).',
          ],
        },
      ],
    },
    {
      h2: 'Controles internos básicos',
      blocks: [
        {
          t: 'p',
          text: 'Los controles no son desconfianza: protegen a las personas y al colegio de errores y malentendidos.',
        },
        {
          t: 'ul',
          items: [
            'Cuadre diario de caja con comprobante de cada cobro.',
            'Conciliación bancaria mensual hecha por una persona distinta de quien cobra.',
            'Aprobación escrita para descuentos, becas y excepciones.',
            'Accesos por roles al sistema y a los expedientes.',
            'Copias de seguridad probadas de la información.',
            'Inventario periódico de materiales, uniformes y activos.',
            'Archivo ordenado de contratos, expedientes del personal y documentos de la entidad.',
          ],
        },
        {
          t: 'p',
          text: 'Estos controles también ayudan a cumplir con la protección de datos personales de estudiantes y familias; ver [[ley-172-13-proteccion-de-datos-en-colegios|Ley 172-13 y protección de datos en colegios]].',
        },
      ],
    },
    {
      h2: 'Indicadores de gestión: pocos y útiles',
      blocks: [
        {
          t: 'p',
          text: 'No necesitas un tablero con cuarenta métricas. Elige entre cinco y ocho, revísalos cada mes en una reunión corta y registra la tendencia. Define tú la meta de cada uno según tu realidad; aquí no proponemos cifras porque dependen de cada colegio.',
        },
        {
          t: 'table',
          head: ['Área', 'Indicador', 'Para qué sirve'],
          rows: [
            ['Matrícula', 'Estudiantes inscritos frente al cupo, y reinscripción de un año a otro', 'Planificar ingresos y cupos'],
            ['Finanzas', 'Cartera vencida y su antigüedad', 'Detectar problemas de cobro a tiempo'],
            ['Finanzas', 'Ingresos y gastos frente al presupuesto', 'Controlar la salud financiera'],
            ['Académico', 'Asistencia de estudiantes y puntualidad', 'Detectar riesgos de deserción o bajo rendimiento'],
            ['Personal', 'Ausencias y rotación docente', 'Anticipar necesidades de reemplazo'],
            ['Servicio a familias', 'Quejas o solicitudes recibidas y tiempo de respuesta', 'Medir la calidad de la atención'],
            ['Operación', 'Tiempo de emisión de certificaciones y documentos', 'Evaluar eficiencia administrativa'],
          ],
        },
      ],
    },
    {
      h2: 'Herramientas: de la libreta y Excel a un sistema integrado',
      blocks: [
        {
          t: 'p',
          text: 'La mayor fuente de desorden administrativo es la información duplicada: el mismo estudiante en la lista de secretaría, en la hoja de caja y en el cuaderno del docente. Cada copia se desactualiza por su cuenta.',
        },
        {
          t: 'ul',
          items: [
            'Una sola fuente de datos para estudiantes y tutores.',
            'Cobros, recibos y estados de cuenta conectados con la inscripción y las becas.',
            'Asistencia y calificaciones registradas por quien las genera, no transcritas.',
            'Portal para que las familias consulten por sí mismas, ver [[comunicacion-con-padres-portal-de-tutores|comunicación con padres y portal de tutores]].',
            'Reportes generados desde el sistema, no armados a mano cada mes.',
          ],
        },
        {
          t: 'p',
          text: 'Si te preguntas cuándo pasar de las hojas de cálculo a un sistema, lee [[excel-vs-software-de-gestion-escolar|Excel vs software de gestión escolar]], y si ya estás listo, la guía de [[como-elegir-un-software-de-gestion-escolar-checklist|cómo elegir un software de gestión escolar]]. STODIA, por ejemplo, reúne inscripción, notas, asistencia, finanzas, comedor, becas, inventario y portal en una sola instancia para cada colegio; si quieres conocerlo, puedes solicitar una demostración.',
        },
      ],
    },
    {
      h2: 'Reuniones y ritmo de gestión',
      blocks: [
        {
          t: 'p',
          text: 'Los procesos se sostienen con rutinas. Un ritmo sencillo de reuniones evita que todo dependa de la urgencia.',
        },
        {
          t: 'table',
          head: ['Frecuencia', 'Reunión', 'Qué se revisa'],
          rows: [
            ['Semanal', 'Equipo de dirección y administración', 'Pendientes, casos urgentes, calendario de la semana'],
            ['Mensual', 'Revisión de indicadores', 'Cartera, presupuesto, asistencia, quejas'],
            ['Por periodo académico', 'Cierre de notas y revisión pedagógica', 'Resultados, casos de apoyo, comunicaciones a familias'],
            ['Anual', 'Planificación y presupuesto', 'Cupos, cuotas, inversión, mejoras y revisión de políticas'],
          ],
        },
      ],
    },
    {
      h2: 'Plan de organización en 90 días',
      blocks: [
        {
          t: 'ol',
          items: [
            'Días 1-30: levanta el mapa de roles y procesos actuales; identifica dónde se pierden tiempo, dinero o información.',
            'Días 31-60: documenta los tres procesos más críticos (normalmente cobros, inscripción y calificaciones) y define controles mínimos.',
            'Días 61-90: elige tus indicadores, establece las reuniones y decide qué herramientas necesitas para sostener el orden.',
          ],
        },
        {
          t: 'p',
          text: 'Si el colegio aún no ha abierto, este orden es todavía más fácil de implantar; revisa [[como-abrir-un-colegio-privado-en-republica-dominicana|cómo abrir un colegio privado en República Dominicana]].',
        },
      ],
    },
  ],
  faq: [
    {
      q: '¿Qué funciones debe tener la administración de un colegio?',
      a: 'Gestión de inscripciones y expedientes, cobros y finanzas, personal, compras e inventario, atención a familias, y apoyo a los procesos académicos como asistencia y calificaciones.',
    },
    {
      q: '¿Cuántas personas necesita la administración de un colegio pequeño?',
      a: 'Depende de la matrícula y los servicios. Lo importante es que las funciones estén asignadas y que existan controles aunque una persona cumpla varios roles.',
    },
    {
      q: '¿Qué indicadores debo revisar cada mes?',
      a: 'Matrícula frente a cupos, cartera vencida y su antigüedad, ingresos y gastos frente al presupuesto, asistencia, ausencias del personal y tiempos de respuesta a familias.',
    },
    {
      q: '¿Cuándo conviene usar un software de gestión escolar?',
      a: 'Cuando la información está duplicada, los cobros o notas se atrasan, o la dirección no puede obtener reportes sin mucho trabajo manual.',
    },
    {
      q: '¿Cómo evito que todo dependa del director?',
      a: 'Documentando los procesos, delegando por roles con límites claros, definiendo quién aprueba qué y revisando indicadores en reuniones regulares.',
    },
  ],
  related: [
    'como-reducir-la-morosidad-en-un-colegio-privado',
    'proceso-de-inscripcion-escolar-checklist-para-colegios',
    'como-elegir-un-software-de-gestion-escolar-checklist',
    'control-de-asistencia-digital-en-colegios',
  ],
  sources: [
    {
      name: 'MINERD: portal oficial',
      url: 'https://www.ministeriodeeducacion.gob.do/',
    },
    {
      name: 'MINERD: Manual de Procedimientos para las Instituciones Educativas Privadas (2022)',
      url: 'https://www.ministeriodeeducacion.gob.do/media/banners/8cb286dddbb92b735467ded42d01617153cf932dmanualdeprocedimiento-webf2pdf.pdf',
    },
  ],
};
