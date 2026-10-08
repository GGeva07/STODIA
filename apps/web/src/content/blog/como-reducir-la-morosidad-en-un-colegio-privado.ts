import type { Article } from './types';

export const article: Article = {
  slug: 'como-reducir-la-morosidad-en-un-colegio-privado',
  title: 'Cómo reducir la morosidad en un colegio privado',
  description:
    'Estrategias prácticas para reducir la morosidad en un colegio privado: políticas claras, recordatorios, acuerdos de pago, seguimiento y control con datos.',
  date: '2026-09-14',
  category: 'Finanzas',
  readMinutes: 9,
  keywords: [
    'morosidad en colegios privados',
    'cobro de mensualidades colegio',
    'cuentas por cobrar colegio',
    'cómo cobrar mensualidades atrasadas',
    'acuerdos de pago colegio',
  ],
  summary:
    'La morosidad en un colegio se reduce combinando tres cosas: reglas de cobro claras desde la inscripción, recordatorios oportunos antes y después del vencimiento, y seguimiento con datos al día. Cuanto antes se detecta un atraso y se conversa con la familia, más fácil es resolverlo sin dañar la relación.',
  sections: [
    {
      h2: '¿Por qué se atrasan las familias en el pago del colegio?',
      blocks: [
        {
          t: 'p',
          text: 'Antes de aplicar medidas conviene entender el origen del atraso, porque no todos los casos requieren la misma respuesta. En la práctica, la morosidad suele venir de causas distintas que se mezclan en un mismo reporte.',
        },
        {
          t: 'ul',
          items: [
            'Olvido o desorden: la familia puede pagar, pero no recuerda la fecha o no sabe cuánto debe.',
            'Falta de información: no sabe que hay recargos, qué incluye la cuota o dónde y cómo pagar.',
            'Dificultad temporal: pérdida de empleo, enfermedad o un gasto imprevisto.',
            'Desacuerdo: cree que un cargo es incorrecto o no recibió respuesta a un reclamo.',
            'Hábito: sabe que el colegio no da seguimiento y deja el pago para el final.',
          ],
        },
        {
          t: 'p',
          text: 'Las dos primeras causas son las más fáciles de atacar con procesos y herramientas. Las otras requieren conversación y flexibilidad. Si tu colegio trata a todos los casos igual, o con dureza, o con descuido, perderá en ambos frentes.',
        },
      ],
    },
    {
      h2: 'Primero mide: qué es morosidad y cómo calcularla',
      blocks: [
        {
          t: 'p',
          text: 'No puedes mejorar lo que no mides. Define con tu administración qué considerarás atraso (por ejemplo, cualquier cuota con la fecha de vencimiento vencida) y revisa los mismos indicadores cada mes, siempre con la misma fórmula, para poder comparar.',
        },
        {
          t: 'table',
          caption: 'Indicadores básicos de cobranza',
          head: ['Indicador', 'Qué responde', 'Cómo calcularlo'],
          rows: [
            ['Cartera vencida', 'Cuánto dinero está atrasado hoy', 'Suma de cuotas vencidas y no pagadas'],
            ['Porcentaje de morosidad', 'Qué parte de lo facturado no se ha cobrado', 'Cartera vencida entre total facturado del periodo'],
            ['Antigüedad de la deuda', 'Qué tan viejos son los atrasos', 'Agrupar por 1-30, 31-60, 61-90 y más de 90 días'],
            ['Familias morosas', 'A cuántas familias hay que contactar', 'Conteo de tutores con al menos una cuota vencida'],
            ['Cobro en la fecha', 'Qué parte paga a tiempo', 'Cuotas pagadas hasta el vencimiento entre cuotas emitidas'],
          ],
        },
        {
          t: 'callout',
          title: 'Mira la antigüedad, no solo el total',
          text: 'Una cartera de poco monto pero muy antigua es más difícil de recuperar que una más grande pero reciente. Prioriza el contacto en los primeros días después del vencimiento: es cuando más probabilidad hay de resolver.',
        },
      ],
    },
    {
      h2: 'Políticas de cobro claras desde la inscripción',
      blocks: [
        {
          t: 'p',
          text: 'La mayor parte de los conflictos de cobro nace de reglas que nunca se explicaron bien. Antes de la inscripción, el tutor debe conocer por escrito cuánto pagará y cuándo, y aceptarlo en el contrato de servicios educativos.',
        },
        {
          t: 'ul',
          items: [
            'Monto de la matrícula, mensualidades y otros cargos (materiales, actividades, uniformes, transporte, comedor).',
            'Calendario de pagos con fechas exactas de vencimiento.',
            'Medios de pago disponibles: caja del colegio, transferencia, tarjeta, portal en línea.',
            'Recargos por atraso, si el colegio los aplica y están en el contrato, con la fecha desde la que corren.',
            'Procedimiento ante un atraso: quién contacta, en qué plazos y qué se ofrece.',
            'Cómo solicitar una prórroga, un acuerdo de pago o una beca (ver [[como-gestionar-becas-y-descuentos-en-un-colegio-privado|gestión de becas y descuentos]]).',
          ],
        },
        {
          t: 'p',
          text: 'Antes de adoptar sanciones como recargos, suspensión de servicios complementarios o condiciones para la reinscripción, valídalas con un abogado y revisa lo que establece el MINERD para los centros privados. No hemos encontrado una norma dominicana específica que regule la retención de documentos escolares por deudas, así que ante cualquier duda consulta al distrito educativo o a un asesor legal antes de aplicar medidas de este tipo. En todo caso, el interés superior del estudiante debe ir primero: evita medidas que lo expongan frente a sus compañeros.',
        },
      ],
    },
    {
      h2: 'Recordatorios: antes, el día y después del vencimiento',
      blocks: [
        {
          t: 'p',
          text: 'Un recordatorio oportuno resuelve más atrasos que cualquier carta de cobro. La clave es la constancia y el tono: informativo, respetuoso y con una acción clara (cómo y dónde pagar).',
        },
        {
          t: 'table',
          caption: 'Secuencia de comunicación sugerida (ajústala a tu realidad)',
          head: ['Momento', 'Mensaje', 'Canal típico'],
          rows: [
            ['Unos días antes del vencimiento', 'Aviso amable con monto y medios de pago', 'WhatsApp, correo o portal'],
            ['Día del vencimiento', 'Recordatorio breve', 'Mensaje o aviso en el portal'],
            ['Primeros días de atraso', 'Aviso de cuota vencida y oferta de ayuda', 'Llamada o mensaje personalizado'],
            ['Atraso mayor', 'Cita con administración para un acuerdo', 'Reunión presencial o llamada'],
            ['Atraso persistente', 'Comunicación formal conforme al contrato', 'Carta o correo, con asesoría legal'],
          ],
        },
        {
          t: 'p',
          text: 'Si automatizas los avisos, cuida el trato con los datos personales de las familias. Para aspectos de consentimiento y uso de datos, revisa [[ley-172-13-proteccion-de-datos-en-colegios|la Ley 172-13 y la protección de datos en colegios]]. Para mejorar el canal con las familias, ver [[comunicacion-con-padres-portal-de-tutores|comunicación con padres y portal de tutores]].',
        },
      ],
    },
    {
      h2: 'Facilita el pago: menos fricción, menos atrasos',
      blocks: [
        {
          t: 'p',
          text: 'Muchas veces el tutor no paga a tiempo porque pagar es incómodo: ir al colegio en horario laboral, hacer filas o no saber el saldo exacto. Cada barrera que elimines reduce atrasos.',
        },
        {
          t: 'ul',
          items: [
            'Ofrece más de un medio de pago (efectivo en caja, transferencia, tarjeta, portal).',
            'Que el tutor pueda ver su estado de cuenta y los recibos sin tener que llamar.',
            'Emite un comprobante de cada pago de inmediato; si facturas, apóyate en [[facturacion-electronica-y-ncf-para-colegios|facturación electrónica y NCF]].',
            'Alinea las fechas de vencimiento con las fechas de pago más comunes de las familias, si el contrato lo permite.',
            'Permite pagar por adelantado o en cuotas por conceptos grandes como materiales o matrícula.',
          ],
        },
      ],
    },
    {
      h2: 'Acuerdos de pago y casos de dificultad real',
      blocks: [
        {
          t: 'p',
          text: 'Cuando una familia atraviesa dificultades, un acuerdo de pago por escrito suele recuperar más que un conflicto. El colegio conserva el ingreso y la familia mantiene a su hijo escolarizado.',
        },
        {
          t: 'h3',
          text: 'Qué debe contener un acuerdo de pago',
        },
        {
          t: 'ol',
          items: [
            'Identificación del tutor y del estudiante.',
            'Monto adeudado, desglosado por conceptos y meses.',
            'Plan de cuotas con montos y fechas concretas.',
            'Qué ocurre si se incumple el acuerdo.',
            'Firma de ambas partes y copia para cada una.',
          ],
        },
        {
          t: 'p',
          text: 'Para situaciones económicas delicadas, el colegio puede evaluar una beca o descuento temporal con criterios definidos y documentación, en lugar de decisiones improvisadas. Más sobre cómo hacerlo en [[como-gestionar-becas-y-descuentos-en-un-colegio-privado|este artículo]].',
        },
      ],
    },
    {
      h2: 'Responsabilidades internas: quién hace qué',
      blocks: [
        {
          t: 'p',
          text: 'La morosidad se reduce más cuando alguien es dueño del proceso. Define un responsable de cobranza, con acceso a información actualizada, y evita que la dirección tenga que perseguir cada caso.',
        },
        {
          t: 'ul',
          items: [
            'Caja o cobros: registra pagos y emite recibos el mismo día.',
            'Responsable de cobranza: contacta, negocia acuerdos y registra cada gestión.',
            'Dirección: aprueba excepciones y casos especiales según una política escrita.',
            'Coordinación académica: se mantiene fuera de la conversación de dinero con los estudiantes.',
          ],
        },
        {
          t: 'p',
          text: 'Esta separación ordena el proceso. Si quieres revisar el panorama completo de roles, mira [[como-organizar-la-administracion-de-un-colegio-privado|cómo organizar la administración de un colegio privado]].',
        },
      ],
    },
    {
      h2: 'Herramientas: de la hoja de cálculo al sistema de gestión',
      blocks: [
        {
          t: 'p',
          text: 'Una hoja de cálculo sirve al comienzo, pero conforme crece la matrícula aparecen los problemas: cuotas mal calculadas, pagos sin registrar y reportes que llegan tarde. Hay una comparación detallada en [[excel-vs-software-de-gestion-escolar|Excel vs software de gestión escolar]].',
        },
        {
          t: 'p',
          text: 'Un sistema de gestión que integre cobros, estado de cuenta, recibos y portal del tutor permite ver la cartera vencida en tiempo real, programar recordatorios y registrar cada gestión. STODIA incluye módulos de finanzas, cobros y punto de venta, y un portal de tutores; no es indispensable, pero si hoy persigues pagos con papeles y mensajes sueltos, puedes pedir una demostración para ver si te encaja.',
        },
        {
          t: 'callout',
          title: 'Cuidado con las promesas',
          text: 'Ninguna herramienta elimina la morosidad por sí sola. Lo que hace es darte información a tiempo y quitar fricción; el resultado depende de tus políticas y de la constancia del equipo.',
        },
      ],
    },
    {
      h2: 'Plan de 30 días para empezar',
      blocks: [
        {
          t: 'ol',
          items: [
            'Semana 1: calcula tu cartera vencida y su antigüedad, y lista las familias con atraso.',
            'Semana 2: revisa contrato y política de cobros; corrige lo ambiguo con asesoría legal.',
            'Semana 3: define la secuencia de recordatorios y asigna un responsable.',
            'Semana 4: contacta a las familias con atraso y ofrece acuerdos por escrito; mide de nuevo.',
          ],
        },
      ],
    },
  ],
  faq: [
    {
      q: '¿Qué hacer cuando un padre no paga la mensualidad del colegio?',
      a: 'Contáctalo pronto y de forma respetuosa, confirma que conoce el saldo, indaga la causa y ofrece un acuerdo de pago por escrito si hay dificultad. Si el atraso persiste, actúa conforme al contrato y con asesoría legal.',
    },
    {
      q: '¿Puede un colegio privado retener las notas o documentos por deuda?',
      a: 'No encontramos una norma dominicana específica sobre este punto, así que no lo afirmamos. Consulta al distrito educativo del MINERD y a un abogado antes de aplicar cualquier medida de este tipo, y evita que afecte al estudiante.',
    },
    {
      q: '¿Cuándo conviene aplicar recargos por atraso?',
      a: 'Solo si están previstos en el contrato firmado, con montos y fechas claros y revisados por un asesor legal. Los recargos informados desde la inscripción generan menos conflictos.',
    },
    {
      q: '¿Cómo calculo el porcentaje de morosidad de mi colegio?',
      a: 'Divide la cartera vencida entre el total facturado del periodo y revisa también la antigüedad de la deuda. Usa siempre la misma fórmula para comparar mes a mes.',
    },
    {
      q: '¿Un software ayuda a reducir la morosidad?',
      a: 'Ayuda a ver la cartera en tiempo real, enviar recordatorios, registrar gestiones y dar a las familias su estado de cuenta, pero los resultados dependen de tus políticas y del seguimiento.',
    },
  ],
  related: [
    'como-gestionar-becas-y-descuentos-en-un-colegio-privado',
    'como-organizar-la-administracion-de-un-colegio-privado',
    'excel-vs-software-de-gestion-escolar',
    'comunicacion-con-padres-portal-de-tutores',
  ],
  sources: [
    {
      name: 'Ley 172-13 sobre Protección Integral de los Datos Personales (texto)',
      url: 'https://bdi.com.do/media/lx0bzgfe/ley-sobre-proteccion-datos-caracter-personal.pdf',
    },
    {
      name: 'MINERD: Reglamento de las Instituciones Educativas Privadas',
      url: 'https://www.ministeriodeeducacion.gob.do/docs/direccion-general-de-supervision-educativa/aMos-reglamento-de-instituciones-educativas-privadaspdf.pdf',
    },
  ],
};
