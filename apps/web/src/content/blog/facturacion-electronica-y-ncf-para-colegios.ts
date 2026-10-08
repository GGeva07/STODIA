import type { Article } from './types';

export const article: Article = {
  slug: 'facturacion-electronica-y-ncf-para-colegios',
  title: 'Facturación electrónica y NCF para colegios en RD',
  description:
    'Cómo se relacionan el NCF, el e-CF y la Ley 32-23 con el cobro de mensualidades de un colegio privado, y qué pasos dar antes de la fecha límite de la DGII.',
  date: '2026-09-15',
  category: 'Finanzas',
  readMinutes: 9,
  keywords: [
    'facturación electrónica colegios',
    'NCF colegios República Dominicana',
    'e-CF DGII',
    'Ley 32-23',
    'comprobantes fiscales mensualidades',
    'recibos de pago colegio',
  ],
  summary:
    'La Ley 32-23 establece la facturación electrónica (e-CF) en República Dominicana con un calendario escalonado por tipo de contribuyente. Para el grupo de pequeños, micro y no clasificados, la DGII comunicó una prórroga hasta el 15 de noviembre de 2026. Si tu colegio emite comprobantes por mensualidades u otros servicios, confirma con tu contador y en la DGII en qué grupo está clasificado y qué debe emitir.',
  sections: [
    {
      h2: '¿Qué es el NCF y qué es el e-CF?',
      blocks: [
        {
          t: 'p',
          text: 'El Número de Comprobante Fiscal (NCF) es la secuencia autorizada por la Dirección General de Impuestos Internos (DGII) que identifica un comprobante de venta de bienes o servicios. Tradicionalmente se emitía en talonarios o por sistemas con secuencias autorizadas. El comprobante fiscal electrónico (e-CF) es la versión digital: se genera en formato estructurado, se firma digitalmente y se envía a la DGII para su validación, en lugar de depender de un documento impreso como original.',
        },
        {
          t: 'p',
          text: 'La base legal de la transición es la Ley 32-23 de Facturación Electrónica, cuyo reglamento de aplicación es el Decreto 587-24. Las reglas de comprobantes fiscales en general se rigen por las normas generales de la DGII, entre ellas la Norma General 06-2018, que también fija el contenido que deben tener los comprobantes.',
        },
        {
          t: 'callout',
          title: 'Aviso importante',
          text: 'Este contenido es informativo y no sustituye la asesoría de un contador o abogado tributarista. Las fechas y clasificaciones pueden cambiar por avisos de la DGII; confirma siempre en dgii.gov.do.',
        },
      ],
    },
    {
      h2: '¿Cuáles son las fechas límite del e-CF?',
      blocks: [
        {
          t: 'p',
          text: 'La Ley 32-23 estableció un calendario por grupos según el tamaño del contribuyente. Según la información publicada por la DGII y por medios especializados, la situación es esta:',
        },
        {
          t: 'table',
          caption: 'Calendario de implementación del e-CF (resumen)',
          head: ['Grupo', 'Situación'],
          rows: [
            ['Grandes contribuyentes nacionales', 'Plazo ya vencido (implementación escalonada que cerró en 2024)'],
            ['Grandes contribuyentes locales y medianos', 'Plazo ya vencido; la DGII informó emisión exclusiva de e-CF desde noviembre'],
            ['Pequeños, micro y no clasificados', 'Plazo original 15 de mayo de 2026; la DGII otorgó una prórroga de seis meses hasta el 15 de noviembre de 2026'],
          ],
        },
        {
          t: 'p',
          text: 'Las fuentes secundarias difieren en algunos detalles del calendario intermedio y del número del aviso de la prórroga, así que no te guíes por un blog, incluido este: valida la fecha de tu grupo en la Oficina Virtual y en las noticias oficiales de la DGII.',
        },
      ],
    },
    {
      h2: '¿Mi colegio está obligado a emitir comprobantes fiscales?',
      blocks: [
        {
          t: 'p',
          text: 'La respuesta depende de la figura jurídica del colegio, de su régimen tributario y de qué cobra. No existe una respuesta única válida para todos. Hay colegios constituidos como sociedades comerciales, otros como asociaciones sin fines de lucro y otros como persona física con RNC. Además, los servicios educativos tienen un tratamiento específico en materia de ITBIS, pero eso no equivale automáticamente a que no deban emitir comprobantes.',
        },
        {
          t: 'p',
          text: 'En lugar de suponer, resuelve estas tres preguntas con tu contador:',
        },
        {
          t: 'ol',
          items: [
            '¿En qué grupo de la DGII está clasificado el colegio (según su RNC)?',
            '¿Qué ingresos emite con comprobante hoy: mensualidades, matrícula, uniformes, libros, comedor, transporte, tienda?',
            '¿Qué tipos de comprobante necesitamos para cada caso (consumidor final, crédito fiscal, etc.) y cuándo se exige que sean electrónicos?',
          ],
        },
        {
          t: 'p',
          text: 'Por ejemplo, un padre que es empresario podría pedir un comprobante con crédito fiscal para fines de su propia contabilidad. Saber qué tipos puede emitir tu colegio evita tener que reprocesar cobros después.',
        },
      ],
    },
    {
      h2: '¿Cómo se emite un e-CF? Opciones para un colegio',
      blocks: [
        {
          t: 'p',
          text: 'Para convertirse en emisor electrónico hay que cumplir con los requisitos que fija la DGII, que incluyen estar al día en las obligaciones y pasar por un proceso de postulación y certificación. Según la propia DGII, existe una red de proveedores de servicios de facturación electrónica autorizados (la entidad informó cerca de 190), de modo que no necesitas desarrollar nada propio.',
        },
        {
          t: 'table',
          head: ['Opción', 'Cuándo tiene sentido', 'Aspecto a vigilar'],
          rows: [
            ['Facturador gratuito de la DGII', 'Volumen bajo de comprobantes y sin necesidad de integración', 'Digitación manual; difícil conciliar con cobros masivos'],
            ['Proveedor autorizado de facturación electrónica', 'Colegios con muchos cobros mensuales', 'Costos, integración con tu sistema y soporte'],
            ['Sistema administrativo con emisión integrada', 'Cuando se quiere cobrar y facturar en un solo flujo', 'Que esté habilitado para emitir e-CF según la DGII'],
          ],
        },
        {
          t: 'p',
          text: 'Una mensualidad suele cobrarse a cientos de familias el mismo día. Si cada comprobante se digita a mano, el cuello de botella aparece rápido. Por eso conviene que el sistema de cobros y el emisor de comprobantes se hablen entre sí, o que al menos exportes los datos en un formato ordenado.',
        },
      ],
    },
    {
      h2: '¿Cómo afecta esto al cobro de mensualidades?',
      blocks: [
        {
          t: 'p',
          text: 'La facturación electrónica obliga a que cada cobro tenga sus datos correctos: RNC o cédula del cliente cuando corresponde, descripción del concepto, monto y fecha. Esto empuja a ordenar el catálogo de conceptos (mensualidad, inscripción, material, comedor, etc.) y a tener una sola fuente de verdad de los pagos.',
        },
        {
          t: 'ul',
          items: [
            'Define un catálogo de conceptos de cobro con nombres claros y consistentes.',
            'Registra cada pago al momento (caja, transferencia, tarjeta) con su referencia.',
            'Decide quién es el cliente del comprobante: el tutor responsable de pago, no el estudiante.',
            'Concilia los pagos del banco contra lo registrado antes de emitir.',
            'Guarda los comprobantes y sus respuestas de validación; la conservación forma parte de las buenas prácticas contables.',
          ],
        },
        {
          t: 'p',
          text: 'Este orden también ayuda a la cobranza. Si quieres reducir atrasos, revisa [[como-reducir-la-morosidad-en-un-colegio-privado|cómo reducir la morosidad en un colegio privado]]: tener cada pago registrado y visible es la base de cualquier estrategia de seguimiento.',
        },
      ],
    },
    {
      h2: '¿Qué pasa si no cumplo con la fecha?',
      blocks: [
        {
          t: 'p',
          text: 'La Ley 32-23 contempla sanciones por incumplimiento, y la prórroga otorgada a los pequeños, micro y no clasificados desplaza la fecha de inicio del régimen sancionador para ese grupo. Medios especializados reportan multas que van de 5 a 30 salarios mínimos para ciertas infracciones, y señalan que la DGII debe seguir un procedimiento administrativo antes de aplicar una sanción. Como esos montos y supuestos pueden variar según la infracción, consulta el texto de la ley y las normas vigentes o a tu contador antes de tomar decisiones.',
        },
        {
          t: 'p',
          text: 'Más importante que memorizar las multas es llegar con tiempo: el proceso de certificación y las pruebas con un proveedor toman semanas, y los últimos días antes de una fecha límite suelen saturarse.',
        },
      ],
    },
    {
      h2: 'Checklist para prepararse antes de la fecha límite',
      blocks: [
        {
          t: 'ul',
          items: [
            'Confirmar la clasificación del colegio y su fecha límite en la DGII.',
            'Revisar con el contador qué ingresos requieren comprobante y de qué tipo.',
            'Verificar que el RNC, la razón social y los datos del contribuyente estén actualizados.',
            'Elegir la vía de emisión: facturador gratuito, proveedor autorizado o sistema con emisión integrada.',
            'Limpiar la base de datos de tutores: nombre, RNC o cédula y correo correctos.',
            'Definir el catálogo de conceptos de cobro y sus impuestos aplicables.',
            'Hacer pruebas de emisión con unos pocos casos antes del cierre de mes.',
            'Capacitar a caja y administración en el nuevo flujo.',
            'Establecer un respaldo y una política de conservación de comprobantes.',
          ],
        },
      ],
    },
    {
      h2: 'Cómo ayuda un sistema de gestión escolar',
      blocks: [
        {
          t: 'p',
          text: 'Un sistema de gestión escolar no sustituye al emisor autorizado por la DGII, pero ordena todo lo que viene antes: quién debe qué, qué se cobró, a nombre de quién y por qué concepto. STODIA, por ejemplo, incluye módulos de finanzas, cobros y punto de venta con registro de pagos y estados de cuenta por familia. Antes de depender de cualquier plataforma para la parte fiscal, pregunta de forma directa si emite o se integra con un proveedor autorizado de e-CF y cómo se maneja ese flujo; no asumas que cualquier sistema lo hace.',
        },
        {
          t: 'p',
          text: 'Si estás en etapa de evaluación, te serán útiles la [[como-elegir-un-software-de-gestion-escolar-checklist|checklist para elegir un software de gestión escolar]] y la guía de [[como-organizar-la-administracion-de-un-colegio-privado|organización administrativa de un colegio privado]].',
        },
      ],
    },
  ],
  faq: [
    {
      q: '¿Cuál es la fecha límite del e-CF para colegios pequeños?',
      a: 'Para el grupo de pequeños, micro y no clasificados, la DGII comunicó una prórroga hasta el 15 de noviembre de 2026 (el plazo original era el 15 de mayo de 2026). Confirma en la DGII en qué grupo está clasificado tu colegio.',
    },
    {
      q: '¿Es lo mismo NCF que e-CF?',
      a: 'No. El NCF es el número que identifica el comprobante fiscal; el e-CF es el comprobante en formato electrónico, validado por la DGII. En el esquema electrónico, el comprobante lleva su propia numeración electrónica bajo las reglas de la DGII.',
    },
    {
      q: '¿Puedo seguir usando mi talonario cuando venza el plazo?',
      a: 'Depende de tu grupo y de las disposiciones vigentes. Una vez vencido el plazo de tu grupo, la expectativa es emitir de forma electrónica. Confírmalo con tu contador y con la DGII antes de esa fecha.',
    },
    {
      q: '¿Necesito un software propio para facturar electrónicamente?',
      a: 'No necesariamente. Puedes usar el facturador gratuito de la DGII o contratar a un proveedor autorizado. Lo recomendable es evaluar tu volumen de cobros y la integración con tu sistema administrativo.',
    },
    {
      q: '¿Mi sistema escolar tiene que estar certificado por la DGII?',
      a: 'Quien emite e-CF debe cumplir los requisitos de la DGII. Si tu sistema no emite directamente, puede apoyarse en un proveedor autorizado. Pregunta siempre a tu proveedor cómo resuelve este punto y pide la evidencia correspondiente.',
    },
  ],
  related: [
    'como-reducir-la-morosidad-en-un-colegio-privado',
    'como-organizar-la-administracion-de-un-colegio-privado',
    'excel-vs-software-de-gestion-escolar',
    'ley-172-13-proteccion-de-datos-en-colegios',
  ],
  sources: [
    {
      name: 'DGII: emisión exclusiva de facturas electrónicas para Grandes Locales y Medianos (menciona la prórroga al 15 de noviembre de 2026)',
      url: 'https://dgii.gov.do/noticias/Paginas/DGII-informa-emision-exclusiva-de-facturas-electronicas-para-Grandes-Locales-y-Medianos-contribuyentes-desde-noviembre.aspx',
    },
    {
      name: 'DGII: Guía de Facturación Electrónica',
      url: 'https://dgii.gov.do/publicacionesOficiales/bibliotecaVirtual/contribuyentes/facturacion/Documents/Facturaci%C3%B3n%20Electr%C3%B3nica/6%20Guia%20Facturacion%20Electronica.pdf',
    },
  ],
};
