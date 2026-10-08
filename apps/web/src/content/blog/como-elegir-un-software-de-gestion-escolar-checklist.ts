import type { Article } from './types';

export const article: Article = {
  slug: 'como-elegir-un-software-de-gestion-escolar-checklist',
  title: 'Cómo elegir un software de gestión escolar: checklist',
  description:
    'Checklist para elegir un software de gestión escolar: módulos, instalación, datos, soporte, seguridad y preguntas para evaluar a cada proveedor.',
  date: '2026-09-18',
  category: 'Tecnología',
  readMinutes: 9,
  keywords: [
    'cómo elegir un software de gestión escolar',
    'software de gestión escolar',
    'sistema de gestión escolar checklist',
    'software para colegios República Dominicana',
    'evaluar proveedor software escolar',
  ],
  summary:
    'Elegir un software de gestión escolar es una decisión de varios años, así que conviene evaluar primero tus procesos y luego a los proveedores con los mismos criterios: cobertura de módulos, forma de instalación, propiedad de los datos, soporte, seguridad y costo total. Esta checklist te permite comparar sin dejarte llevar por una demostración vistosa.',
  sections: [
    {
      h2: 'Antes de mirar software: define qué problema quieres resolver',
      blocks: [
        {
          t: 'p',
          text: 'El error más común es empezar viendo demostraciones. Primero describe cómo trabaja hoy tu colegio y dónde duele: ¿se pierden pagos?, ¿las notas se consolidan a mano?, ¿cuesta saber quién faltó?, ¿los padres llaman constantemente por información? Los problemas definen las prioridades.',
        },
        {
          t: 'ol',
          items: [
            'Haz una lista de procesos: admisión, inscripción, calificaciones, asistencia, cobros, comedor, becas, inventario, comunicación.',
            'Marca cuáles son críticos, cuáles deseables y cuáles pueden esperar.',
            'Anota cuántos estudiantes, usuarios y sedes tienes y cuántos esperas tener en tres años.',
            'Identifica a quienes lo usarán: dirección, secretaría, caja, docentes, tutores.',
            'Define quién del colegio liderará la implementación.',
          ],
        },
        {
          t: 'p',
          text: 'Si hoy trabajas con hojas de cálculo, revisa antes [[excel-vs-software-de-gestion-escolar|cuándo Excel deja de ser suficiente]] para confirmar que el cambio tiene sentido.',
        },
      ],
    },
    {
      h2: 'Checklist de funcionalidades: qué debe cubrir',
      blocks: [
        {
          t: 'p',
          text: 'No todas las funciones pesan igual para todos los colegios. Usa esta tabla como base y marca lo que es imprescindible para ti.',
        },
        {
          t: 'table',
          caption: 'Módulos habituales en un sistema de gestión escolar',
          head: ['Módulo', 'Qué debería permitir', 'Preguntas clave'],
          rows: [
            ['Admisión e inscripción', 'Registrar aspirantes, expedientes, documentos y reinscripción', '¿Guarda historial por año? ¿Permite adjuntar documentos?'],
            ['Calificaciones', 'Notas por periodo, competencias, boletines y actas', '¿Se adapta a la escala y estructura que usa tu colegio?'],
            ['Asistencia', 'Registro diario por curso, ausencias y tardanzas', '¿Notifica al tutor? ¿Se puede registrar desde el móvil?'],
            ['Finanzas y cobros', 'Cuotas, recibos, estado de cuenta, caja y reportes', '¿Maneja becas, descuentos, recargos y comprobantes fiscales?'],
            ['Comedor', 'Menús, consumos y cobros asociados', '¿Se integra con el estado de cuenta del tutor?'],
            ['Becas y descuentos', 'Reglas, aprobaciones y seguimiento', '¿Deja trazabilidad de quién aprobó?'],
            ['Inventario', 'Materiales, uniformes, libros y activos', '¿Permite punto de venta y control de existencias?'],
            ['Portal de tutores y app móvil', 'Consulta de notas, pagos y avisos', '¿Funciona bien en celular? ¿Es fácil para el tutor?'],
            ['Reportes y exportación', 'Indicadores y salida de datos', '¿Puedo exportar mis datos cuando quiera?'],
          ],
        },
        {
          t: 'p',
          text: 'Más que contar funciones, evalúa qué tan bien se integran entre sí. Un sistema donde cobros, becas y estado de cuenta comparten información evita reconciliaciones manuales.',
        },
      ],
    },
    {
      h2: 'Dónde vive el sistema: en tu servidor o en la nube',
      blocks: [
        {
          t: 'p',
          text: 'Pregunta cómo se despliega el software y qué implica para ti. Algunos proveedores solo ofrecen un servicio compartido en la nube; otros permiten instalar el sistema en el servidor del colegio o en una instancia dedicada. Cada modelo tiene ventajas y obligaciones distintas, que explicamos en [[software-escolar-en-la-nube-vs-en-tu-servidor|software escolar en la nube vs en tu servidor]].',
        },
        {
          t: 'ul',
          items: [
            '¿Se instala en nuestro servidor, en la nube del proveedor, o ambas opciones?',
            '¿La instancia es exclusiva para nuestro colegio o compartida con otros?',
            '¿Quién hace las copias de seguridad, con qué frecuencia y cómo se restauran?',
            '¿Qué pasa si se cae internet? ¿Hay funciones que sigan operando?',
            '¿Quién se encarga de actualizar el sistema y cómo se comunican los cambios?',
          ],
        },
        {
          t: 'p',
          text: 'STODIA, por ejemplo, funciona con una instancia por cliente: se puede instalar en el servidor del colegio o lo aloja SynsetSolutions. Es solo un ejemplo del tipo de preguntas que debes hacer a cualquier proveedor.',
        },
      ],
    },
    {
      h2: 'Datos, privacidad y seguridad',
      blocks: [
        {
          t: 'p',
          text: 'Tu colegio guarda datos de menores, información de familias y datos financieros. Esa información es tu responsabilidad, incluso si la almacena un tercero. En República Dominicana rige la Ley 172-13 de protección de datos personales, cuyo texto exige respetar principios como licitud, calidad, lealtad, seguridad y finalidad. Lo desarrollamos en [[ley-172-13-proteccion-de-datos-en-colegios|Ley 172-13 y protección de datos en colegios]].',
        },
        {
          t: 'h3',
          text: 'Preguntas de seguridad para el proveedor',
        },
        {
          t: 'ul',
          items: [
            '¿Quién es el dueño de los datos y qué dice el contrato sobre ello?',
            '¿Puedo exportar toda mi información en un formato abierto si decido irme?',
            '¿Hay roles y permisos por usuario (secretaría, caja, docentes, dirección)?',
            '¿Se registra quién hizo qué (bitácora de auditoría)?',
            '¿Los datos viajan cifrados y se protege el acceso con contraseñas robustas?',
            '¿Cómo se manejan las copias de seguridad y cuánto tiempo se conservan?',
          ],
        },
      ],
    },
    {
      h2: 'Cumplimiento fiscal y requisitos locales',
      blocks: [
        {
          t: 'p',
          text: 'Un sistema pensado para otro país puede no encajar con la realidad dominicana. Pregunta si el módulo de cobros maneja los comprobantes fiscales que necesitas y cómo se adapta a los cambios de la DGII. Más información en [[facturacion-electronica-y-ncf-para-colegios|facturación electrónica y NCF para colegios]].',
        },
        {
          t: 'p',
          text: 'Del mismo modo, confirma que el sistema se adapta a la estructura de calificaciones, boletines y periodos que usa tu colegio, y a las exigencias de reporte que apliquen según el MINERD. Si tienes dudas sobre los formatos vigentes, consúltalo con el distrito educativo.',
        },
      ],
    },
    {
      h2: 'Implementación, capacitación y soporte',
      blocks: [
        {
          t: 'p',
          text: 'Un buen software mal implementado fracasa. Pide un plan por escrito: quién migra tus datos, cuánto tardan las etapas, qué capacitación incluye y cómo se da soporte cuando haya problemas en pleno periodo de inscripción.',
        },
        {
          t: 'table',
          head: ['Aspecto', 'Qué pedir'],
          rows: [
            ['Migración de datos', 'Quién carga estudiantes, tutores, saldos y notas históricas; cómo se valida'],
            ['Capacitación', 'Sesiones por rol, material de apoyo y tiempo disponible'],
            ['Soporte', 'Canales, horarios, tiempos de respuesta y qué cubre el soporte'],
            ['Acompañamiento en temporadas críticas', 'Apoyo en inscripción, cierre de notas y fin de año'],
            ['Hoja de ruta', 'Cómo se deciden las mejoras y si puedes proponer cambios'],
          ],
        },
      ],
    },
    {
      h2: 'Costo total: no te quedes solo con la cuota',
      blocks: [
        {
          t: 'p',
          text: 'Compara costo total, no solo el precio inicial. Considera licencia o suscripción, implementación, migración, capacitación, soporte, servidores y mejoras. Hemos desarrollado este tema en [[cuanto-cuesta-un-sistema-de-gestion-escolar|cuánto cuesta un sistema de gestión escolar]], con las preguntas que debes hacer para obtener cotizaciones comparables.',
        },
        {
          t: 'callout',
          title: 'Pide la cotización por escrito',
          text: 'Solicita a cada proveedor que detalle qué incluye y qué no, con las mismas condiciones (número de estudiantes, módulos, sedes y tiempo de contrato) para poder comparar de forma justa.',
        },
      ],
    },
    {
      h2: 'Cómo hacer la evaluación: demo, prueba y referencias',
      blocks: [
        {
          t: 'ol',
          items: [
            'Prepara tres o cuatro escenarios reales, como inscribir a un hermano con descuento, registrar un pago parcial o generar un boletín, y pide que el proveedor los ejecute en la demostración.',
            'Involucra a quienes lo usarán: la caja y la secretaría detectan problemas que la dirección no ve.',
            'Solicita un periodo de prueba o un piloto con datos reales o simulados.',
            'Pide hablar con colegios que ya lo usen y pregunta por la experiencia con soporte y migración.',
            'Revisa el contrato: plazo, renovación, propiedad de los datos, condiciones de salida y tarifas.',
            'Puntúa a cada proveedor con una matriz con los mismos criterios.',
          ],
        },
        {
          t: 'p',
          text: 'Si quieres conocer STODIA como una opción dentro de tu comparación, puedes solicitar una demostración con tus propios escenarios; el objetivo es que decidas con información, no con presión.',
        },
      ],
    },
    {
      h2: 'Señales de alerta',
      blocks: [
        {
          t: 'ul',
          items: [
            'El proveedor no explica con claridad dónde se guardan tus datos ni cómo los recuperas.',
            'No permite exportar la información o la deja como rehén en el contrato.',
            'Promete resultados garantizados o que el sistema se adapta a todo sin mostrarlo.',
            'No ofrece referencias ni periodo de prueba.',
            'La cotización no detalla qué incluye el soporte o las actualizaciones.',
            'Presiona con descuentos que caducan hoy.',
          ],
        },
      ],
    },
  ],
  faq: [
    {
      q: '¿Qué módulos debe tener un software de gestión escolar?',
      a: 'Lo habitual es inscripción, calificaciones, asistencia, finanzas y cobros, y portal de tutores. Según tu colegio pueden sumarse comedor, becas, inventario y app móvil. Lo importante es que los módulos compartan información.',
    },
    {
      q: '¿Es mejor un software en la nube o instalado en el colegio?',
      a: 'Depende de tu infraestructura, tu equipo técnico y tus prioridades de control de datos. Cada modelo tiene ventajas y obligaciones distintas; compáralos antes de decidir.',
    },
    {
      q: '¿Cuánto tarda implementar un sistema de gestión escolar?',
      a: 'Depende del volumen de datos a migrar, los módulos y la disponibilidad del equipo. Pide al proveedor un cronograma por escrito y procura que no coincida con tu periodo de inscripciones.',
    },
    {
      q: '¿Quién es dueño de los datos del colegio?',
      a: 'Debe ser el colegio. Verifica que el contrato lo diga y que puedas exportar tu información cuando lo necesites.',
    },
    {
      q: '¿Cómo comparo cotizaciones de distintos proveedores?',
      a: 'Pide a todos la misma información: número de estudiantes, módulos, sedes, plazo y servicios incluidos, y compara el costo total, no solo la cuota.',
    },
  ],
  related: [
    'cuanto-cuesta-un-sistema-de-gestion-escolar',
    'excel-vs-software-de-gestion-escolar',
    'software-escolar-en-la-nube-vs-en-tu-servidor',
    'ley-172-13-proteccion-de-datos-en-colegios',
  ],
  sources: [
    {
      name: 'Ley 172-13 sobre Protección Integral de los Datos Personales (texto)',
      url: 'https://bdi.com.do/media/lx0bzgfe/ley-sobre-proteccion-datos-caracter-personal.pdf',
    },
    {
      name: 'DGII: portal oficial',
      url: 'https://dgii.gov.do/',
    },
    {
      name: 'MINERD: portal oficial',
      url: 'https://www.ministeriodeeducacion.gob.do/',
    },
  ],
};
