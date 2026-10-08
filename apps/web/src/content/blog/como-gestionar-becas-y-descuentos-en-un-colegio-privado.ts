import type { Article } from './types';

export const article: Article = {
  slug: 'como-gestionar-becas-y-descuentos-en-un-colegio-privado',
  title: 'Cómo gestionar becas y descuentos en un colegio privado',
  description:
    'Guía para gestionar becas y descuentos en un colegio privado: tipos, política escrita, criterios, aprobación, control financiero y seguimiento anual.',
  date: '2026-10-05',
  category: 'Finanzas',
  readMinutes: 9,
  keywords: [
    'becas en colegios privados',
    'descuentos en colegios privados',
    'política de becas colegio',
    'gestionar becas escolares',
    'descuento por hermanos colegio',
  ],
  summary:
    'Gestionar becas y descuentos con orden exige una política escrita con tipos, criterios, topes y quién aprueba; un proceso de solicitud con documentación; y un registro que permita ver cuánto cuesta cada beneficio y a quién se otorgó. Así el colegio es justo con las familias y protege sus finanzas.',
  sections: [
    {
      h2: 'Becas, descuentos y convenios: no son lo mismo',
      blocks: [
        {
          t: 'p',
          text: 'Aunque a veces se usan como sinónimos, conviene distinguirlos porque se administran distinto. Una beca suele basarse en una necesidad o un mérito evaluados; un descuento responde a una regla comercial (por ejemplo, tener más de un hijo en el colegio); un convenio se pacta con una empresa o institución.',
        },
        {
          t: 'table',
          head: ['Tipo', 'Base', 'Ejemplos habituales', 'Cómo se decide'],
          rows: [
            ['Beca por necesidad económica', 'Situación socioeconómica de la familia', 'Reducción parcial o total de la mensualidad', 'Solicitud, documentación y evaluación'],
            ['Beca por mérito', 'Rendimiento académico, deportivo o artístico', 'Apoyo a estudiantes destacados', 'Criterios publicados y comité'],
            ['Descuento por hermanos', 'Número de hijos inscritos', 'Porcentaje en el segundo o tercer hijo', 'Regla automática'],
            ['Descuento por pronto pago', 'Pago anticipado', 'Reducción si paga antes de una fecha', 'Regla automática'],
            ['Convenio institucional', 'Acuerdo con una empresa u organización', 'Condiciones especiales para sus empleados', 'Contrato con la entidad'],
            ['Beneficio al personal', 'Relación laboral con el colegio', 'Descuento a hijos de empleados', 'Política interna'],
          ],
        },
        {
          t: 'p',
          text: 'Los porcentajes y las condiciones las define cada colegio. En este artículo no sugerimos cifras: cada institución debe calcularlas según su presupuesto.',
        },
      ],
    },
    {
      h2: 'Antes de otorgar nada: revisa el marco y tu presupuesto',
      blocks: [
        {
          t: 'p',
          text: 'Verifica con el distrito educativo del MINERD si existe alguna regla aplicable a tu centro sobre becas o sobre cómo debes comunicar tus costos a las familias, ya que los reglamentos para centros privados pueden cambiar. No encontramos una exigencia general que podamos citar aquí, así que no la afirmamos; consulta la versión vigente del Reglamento de las Instituciones Educativas Privadas.',
        },
        {
          t: 'p',
          text: 'Desde el lado financiero, cada beneficio es ingreso que el colegio deja de percibir. Antes de abrir convocatoria, define cuánto puedes destinar al conjunto de becas y descuentos, como un presupuesto anual, y revísalo con tu contador. Un beneficio sin tope es un riesgo para el flujo de caja.',
        },
        {
          t: 'callout',
          title: 'Regla práctica',
          text: 'Define primero el monto total que el colegio puede asignar a ayudas en el año y luego distribúyelo entre tipos de beneficio. Hacerlo al revés suele terminar en promesas que no se pueden sostener.',
        },
      ],
    },
    {
      h2: 'Cómo redactar una política de becas y descuentos',
      blocks: [
        {
          t: 'p',
          text: 'La política escrita es lo que evita que cada caso se resuelva por simpatía o presión. Debe ser corta, clara y aprobada por la dirección o la junta.',
        },
        {
          t: 'ol',
          items: [
            'Objetivo: por qué el colegio ofrece ayudas.',
            'Tipos de beneficio disponibles y a quién aplican.',
            'Requisitos y criterios de elegibilidad para cada tipo.',
            'Topes: monto o porcentaje máximo por estudiante y presupuesto total del año.',
            'Documentación que debe presentar la familia.',
            'Calendario: fechas de solicitud, evaluación y respuesta.',
            'Quién evalúa y quién aprueba (idealmente un comité, no una sola persona).',
            'Condiciones para mantener el beneficio: asistencia, conducta, rendimiento, pagos al día de la parte no becada.',
            'Causas de suspensión o revocación y cómo se comunican.',
            'Confidencialidad del proceso.',
          ],
        },
        {
          t: 'p',
          text: 'Informa la política a las familias desde la inscripción (ver [[proceso-de-inscripcion-escolar-checklist-para-colegios|checklist de inscripción escolar]]) y refiérela en el contrato de servicios.',
        },
      ],
    },
    {
      h2: 'El proceso de solicitud y evaluación paso a paso',
      blocks: [
        {
          t: 'ol',
          items: [
            'Convocatoria: publica fechas, requisitos y formulario con anticipación.',
            'Solicitud: la familia completa el formulario y entrega los documentos requeridos.',
            'Verificación: administración revisa que el expediente esté completo.',
            'Evaluación: un comité aplica los criterios de la política a cada solicitud, de forma consistente.',
            'Decisión: se registra quién aprobó, qué se otorgó, por cuánto tiempo y bajo qué condiciones.',
            'Notificación: se comunica a la familia por escrito, con las condiciones.',
            'Aplicación: se carga el beneficio en el estado de cuenta del estudiante.',
            'Seguimiento: revisión periódica del cumplimiento de condiciones.',
          ],
        },
        {
          t: 'h3',
          text: 'Documentación que suelen solicitar los colegios (ajústala a tu política)',
        },
        {
          t: 'ul',
          items: [
            'Carta de solicitud explicando la situación de la familia.',
            'Constancia de ingresos o de situación laboral.',
            'Información del núcleo familiar.',
            'Boletines recientes del estudiante, en becas por mérito.',
            'Referencias o entrevistas con orientación o trabajo social, si el colegio las contempla.',
          ],
        },
        {
          t: 'p',
          text: 'Solicita solo los datos que necesitas y guárdalos con acceso restringido: contienen información sensible de menores y familias. Más sobre este tema en [[ley-172-13-proteccion-de-datos-en-colegios|Ley 172-13 y protección de datos en colegios]].',
        },
      ],
    },
    {
      h2: 'Cómo aplicar los beneficios en el estado de cuenta',
      blocks: [
        {
          t: 'p',
          text: 'Aquí es donde más errores aparecen cuando se gestiona a mano. Un descuento mal aplicado genera reclamos; uno olvidado genera pérdidas.',
        },
        {
          t: 'ul',
          items: [
            'Define si el beneficio se aplica sobre matrícula, mensualidad o ambos, y si aplica a otros cargos como comedor o materiales.',
            'Establece si los descuentos se acumulan o se aplica solo el mayor.',
            'Fija el orden de cálculo: porcentaje sobre el monto base o sobre el monto ya descontado.',
            'Especifica la vigencia: año escolar, periodo o hasta revisión.',
            'Asegura que el comprobante de pago refleje el monto real cobrado; coordina con tu contador el tratamiento fiscal (ver [[facturacion-electronica-y-ncf-para-colegios|facturación electrónica y NCF]]).',
          ],
        },
        {
          t: 'callout',
          title: 'Documenta las reglas de combinación',
          text: 'Por ejemplo, qué pasa si un estudiante tiene beca parcial y además un descuento por hermanos. Si la política no lo dice, cada empleado lo resolverá a su manera.',
        },
      ],
    },
    {
      h2: 'Controla el costo y la equidad de tu programa de ayudas',
      blocks: [
        {
          t: 'p',
          text: 'Un programa de becas y descuentos se evalúa como cualquier otra inversión del colegio. Revisa al menos una vez al año cuánto representa y a quién llega.',
        },
        {
          t: 'table',
          head: ['Pregunta de control', 'Qué revisar'],
          rows: [
            ['¿Cuánto cuesta el programa?', 'Total de ingresos no percibidos por becas y descuentos frente al presupuesto asignado'],
            ['¿A quién se otorga?', 'Distribución por tipo de beneficio, nivel y grado'],
            ['¿Se aplica igual a casos similares?', 'Revisión de decisiones frente a los criterios de la política'],
            ['¿Se mantienen las condiciones?', 'Cumplimiento de asistencia, conducta y rendimiento'],
            ['¿Quién aprobó cada caso?', 'Trazabilidad de aprobaciones y excepciones'],
            ['¿Hay becados con atrasos en su parte?', 'Estado de cuenta de la porción no becada'],
          ],
        },
        {
          t: 'p',
          text: 'Las ayudas también pueden ser parte de la estrategia para prevenir atrasos: una familia en dificultad temporal que recibe un apoyo documentado suele ser mejor que una deuda creciente (ver [[como-reducir-la-morosidad-en-un-colegio-privado|cómo reducir la morosidad]]).',
        },
      ],
    },
    {
      h2: 'Errores frecuentes al manejar becas',
      blocks: [
        {
          t: 'ul',
          items: [
            'Otorgar ayudas verbalmente sin dejar nada por escrito.',
            'Decidir según la insistencia de la familia y no según criterios.',
            'No fijar vigencia: el beneficio se arrastra de año a año sin revisión.',
            'Que quien cobra sea quien decide los descuentos.',
            'No registrar el costo total del programa.',
            'Exponer datos de familias becadas a personal que no necesita verlos.',
            'No comunicar a las familias las condiciones para conservar el beneficio.',
          ],
        },
      ],
    },
    {
      h2: 'Herramientas para llevar el control',
      blocks: [
        {
          t: 'p',
          text: 'Con pocos estudiantes puedes llevar un registro en una hoja de cálculo bien protegida. Cuando crece el número de casos, es útil un sistema donde las becas y descuentos se definan como reglas, se asocien al estudiante y se reflejen automáticamente en el estado de cuenta, con registro de quién los aprobó. Esto lo comparamos en [[excel-vs-software-de-gestion-escolar|Excel vs software de gestión escolar]].',
        },
        {
          t: 'p',
          text: 'STODIA incluye un módulo de becas conectado con cobros y estados de cuenta. Si quieres ver cómo se configuran tus propias reglas, puedes pedir una demostración sin compromiso. Y para el panorama general de la administración, revisa [[como-organizar-la-administracion-de-un-colegio-privado|cómo organizar la administración de un colegio privado]].',
        },
      ],
    },
  ],
  faq: [
    {
      q: '¿Qué diferencia hay entre una beca y un descuento?',
      a: 'La beca suele basarse en una evaluación de necesidad o mérito; el descuento responde a una regla general, como tener hermanos inscritos o pagar por adelantado.',
    },
    {
      q: '¿Están obligados los colegios privados a dar becas?',
      a: 'No hemos encontrado una norma que podamos citar con certeza. Consulta el reglamento vigente de centros privados y a tu distrito educativo del MINERD para saber si algo aplica a tu caso.',
    },
    {
      q: '¿Cómo decido a quién dar una beca?',
      a: 'Con criterios escritos y públicos, documentación de respaldo y un comité que evalúe todos los casos con las mismas reglas, dejando constancia de la decisión.',
    },
    {
      q: '¿Se pueden acumular varios descuentos?',
      a: 'Depende de lo que establezca tu política. Lo importante es definir por escrito si se acumulan, en qué orden se calculan y si hay un tope total por estudiante.',
    },
    {
      q: '¿Cada cuánto se revisan las becas?',
      a: 'Lo recomendable es fijar una vigencia, por ejemplo por año escolar, y revisar el cumplimiento de condiciones antes de renovar.',
    },
  ],
  related: [
    'como-reducir-la-morosidad-en-un-colegio-privado',
    'proceso-de-inscripcion-escolar-checklist-para-colegios',
    'como-organizar-la-administracion-de-un-colegio-privado',
    'ley-172-13-proteccion-de-datos-en-colegios',
  ],
  sources: [
    {
      name: 'MINERD: Reglamento de las Instituciones Educativas Privadas',
      url: 'https://www.ministeriodeeducacion.gob.do/docs/direccion-general-de-supervision-educativa/aMos-reglamento-de-instituciones-educativas-privadaspdf.pdf',
    },
    {
      name: 'Ley 172-13 sobre Protección Integral de los Datos Personales (texto)',
      url: 'https://bdi.com.do/media/lx0bzgfe/ley-sobre-proteccion-datos-caracter-personal.pdf',
    },
  ],
};
