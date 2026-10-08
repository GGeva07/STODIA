import type { Article } from './types';

export const article: Article = {
  slug: 'cuanto-cuesta-un-sistema-de-gestion-escolar',
  title: 'Cuánto cuesta un sistema de gestión escolar',
  description:
    'Qué determina el costo de un sistema de gestión escolar: modelos de licencia, costos ocultos y preguntas para cotizar y comparar propuestas sin sorpresas.',
  date: '2026-09-22',
  category: 'Finanzas',
  readMinutes: 8,
  keywords: [
    'cuánto cuesta un sistema de gestión escolar',
    'precio software escolar',
    'costo software para colegios',
    'licencia o suscripción software escolar',
    'cotizar sistema de gestión escolar',
  ],
  summary:
    'No existe un precio único: el costo de un sistema de gestión escolar depende del número de estudiantes, los módulos, el modelo de licencia (compra, suscripción o mixto), dónde se aloja y qué servicios incluye. Para comparar bien hay que pedir cotizaciones equivalentes y mirar el costo total de varios años, no solo la primera cuota.',
  sections: [
    {
      h2: '¿Cuánto cuesta un sistema de gestión escolar?',
      blocks: [
        {
          t: 'p',
          text: 'La respuesta honesta es que depende. Cualquier cifra que veas sin contexto, sin número de estudiantes ni lista de módulos, no sirve para decidir. Por eso, en este artículo no te damos precios: te damos las variables que los determinan y las preguntas que debes hacer para que cada proveedor te cotice en igualdad de condiciones.',
        },
        {
          t: 'p',
          text: 'Antes de pedir cotizaciones, ten claro qué necesitas. Si aún no lo has hecho, empieza por la [[como-elegir-un-software-de-gestion-escolar-checklist|checklist para elegir un software de gestión escolar]].',
        },
      ],
    },
    {
      h2: 'Factores que determinan el costo',
      blocks: [
        {
          t: 'table',
          caption: 'Variables que cambian la cotización',
          head: ['Factor', 'Cómo influye'],
          rows: [
            ['Número de estudiantes y usuarios', 'Muchos proveedores escalan el costo según la matrícula o los usuarios'],
            ['Módulos contratados', 'Inscripción y notas básicos cuestan distinto que finanzas, comedor, inventario o app móvil'],
            ['Número de sedes o niveles', 'Más sedes suelen implicar más configuración y soporte'],
            ['Modelo de licencia', 'Pago único, suscripción periódica o combinación'],
            ['Dónde se aloja', 'En tu servidor, en la nube del proveedor o en infraestructura dedicada'],
            ['Migración de datos', 'Cargar estudiantes, tutores, saldos e historial puede ser un servicio aparte'],
            ['Capacitación y soporte', 'Horas incluidas, canales, horarios y tiempos de respuesta'],
            ['Personalizaciones', 'Boletines propios, reportes, integraciones o cambios específicos'],
          ],
        },
        {
          t: 'p',
          text: 'Dos propuestas pueden parecer muy distintas y en realidad estar cotizando cosas diferentes. Una puede incluir soporte y actualizaciones, y otra cobrarlos aparte.',
        },
      ],
    },
    {
      h2: 'Modelos de licencia: compra, suscripción o mixto',
      blocks: [
        {
          t: 'table',
          head: ['Modelo', 'Ventajas', 'Aspectos a vigilar'],
          rows: [
            [
              'Licencia perpetua (pago inicial)',
              'Inversión conocida; puedes sentir mayor control del sistema',
              'Costos de mantenimiento, actualizaciones y soporte que a veces se cobran aparte; puede quedar desactualizado',
            ],
            [
              'Suscripción periódica',
              'Pagos más repartidos; suele incluir actualizaciones y soporte',
              'Costo acumulado a largo plazo; qué ocurre con tus datos si dejas de pagar',
            ],
            [
              'Modelo mixto',
              'Combina un pago inicial con una cuota por servicios',
              'Entender con exactitud qué cubre cada pago',
            ],
          ],
        },
        {
          t: 'p',
          text: 'Ningún modelo es mejor en abstracto. Lo importante es que el contrato diga claramente qué obtienes, durante cuánto tiempo y qué pasa al terminar la relación. Y que en cualquier caso puedas exportar tus datos.',
        },
      ],
    },
    {
      h2: 'En la nube o en tu servidor: cómo cambia el costo',
      blocks: [
        {
          t: 'p',
          text: 'El lugar donde vive el sistema cambia el reparto de costos y de responsabilidades. Si lo instalas en tu servidor, necesitas hardware, red, energía, respaldo y alguien que lo mantenga. Si lo aloja el proveedor, parte de eso se incluye en la cuota, pero dependes de su servicio y de tu conexión. Lo comparamos con detalle en [[software-escolar-en-la-nube-vs-en-tu-servidor|software escolar en la nube vs en tu servidor]].',
        },
        {
          t: 'ul',
          items: [
            'En tu servidor: costo de equipo, respaldos, seguridad y personal técnico, pero mayor control físico de los datos.',
            'En la nube del proveedor: menos infraestructura propia, pero dependencia de internet y del proveedor.',
            'Instancia dedicada: aislamiento de tus datos frente a otros clientes, con un costo que debe quedar explícito.',
          ],
        },
        {
          t: 'p',
          text: 'En STODIA, cada cliente tiene su propia instancia, que puede instalarse en el servidor del colegio o ser alojada por SynsetSolutions. Para conocer el costo de tu caso, la forma correcta es solicitar una cotización con tus datos reales.',
        },
      ],
    },
    {
      h2: 'Costos ocultos que debes buscar',
      blocks: [
        {
          t: 'p',
          text: 'El precio de lista rara vez es el costo real. Estos son los conceptos que más sorprenden cuando no se preguntan a tiempo.',
        },
        {
          t: 'ul',
          items: [
            'Implementación y configuración inicial.',
            'Migración de datos desde Excel u otro sistema.',
            'Capacitación del personal y de nuevos empleados cada año.',
            'Soporte fuera de horario o en periodos críticos.',
            'Módulos adicionales no incluidos (app móvil, comedor, inventario, portal).',
            'Mensajería: costos de SMS o WhatsApp si el sistema los usa.',
            'Almacenamiento adicional cuando crece la información.',
            'Hardware: servidores, equipos de caja, lectores o impresoras.',
            'Personalizaciones: boletines, reportes o integraciones a medida.',
            'Costos de salida: exportación de datos o cierre del contrato.',
          ],
        },
        {
          t: 'callout',
          title: 'El costo de no tener sistema también existe',
          text: 'Si hoy dependes de hojas de cálculo, valora el tiempo del personal, los errores de cobro y la información que llega tarde. Revisa los límites de esa opción en [[excel-vs-software-de-gestion-escolar|Excel vs software de gestión escolar]]. No lo hacemos para empujarte a comprar, sino para que compares con todo el cuadro delante.',
        },
      ],
    },
    {
      h2: 'Preguntas para pedir una cotización comparable',
      blocks: [
        {
          t: 'ol',
          items: [
            '¿Cuál es el costo total en los primeros tres años, desglosado por concepto?',
            '¿Cómo se calcula el precio: por estudiante, por usuario, por módulo o plano?',
            '¿Qué pasa con el precio si crece o disminuye la matrícula?',
            '¿Qué módulos están incluidos y cuáles se cobran aparte?',
            '¿La implementación, la migración y la capacitación están incluidas o se cobran aparte?',
            '¿Qué cubre el soporte, por qué canales y con qué tiempos de respuesta?',
            '¿Las actualizaciones están incluidas? ¿Con qué frecuencia?',
            '¿Hay límite de usuarios, almacenamiento o mensajes?',
            '¿Cuál es el plazo mínimo del contrato y cómo se renueva? ¿Pueden cambiar el precio al renovar?',
            '¿Puedo exportar mis datos en cualquier momento y qué cuesta hacerlo?',
          ],
        },
        {
          t: 'p',
          text: 'Envía la misma lista de preguntas y los mismos datos del colegio a todos los proveedores. Así podrás comparar, y verás rápidamente quién responde con claridad y quién evade.',
        },
      ],
    },
    {
      h2: 'Cómo valorar el retorno sin inventar números',
      blocks: [
        {
          t: 'p',
          text: 'Presentar cifras de ahorro genéricas sería engañoso, porque cada colegio es distinto. En lugar de eso, haz tu propio cálculo con datos propios.',
        },
        {
          t: 'ul',
          items: [
            'Horas semanales que el personal dedica a tareas manuales de cobros, notas y reportes.',
            'Errores o reclamos de cobro del último año y su costo en tiempo.',
            'Cartera vencida y rapidez con que detectas atrasos (ver [[como-reducir-la-morosidad-en-un-colegio-privado|cómo reducir la morosidad]]).',
            'Tiempo de inscripción por familia y filas en periodos de matrícula.',
            'Llamadas de padres que podrían resolverse con un portal.',
          ],
        },
        {
          t: 'p',
          text: 'Estima estos puntos antes y compáralos después de unos meses de uso. Si el proveedor te promete un porcentaje de mejora garantizado, desconfía.',
        },
      ],
    },
    {
      h2: 'Presupuesto: cómo prepararte',
      blocks: [
        {
          t: 'ul',
          items: [
            'Define un rango de inversión inicial y otro recurrente anual.',
            'Reserva presupuesto para capacitación y acompañamiento, no solo para la licencia.',
            'Evita implementar en plena temporada de inscripciones o cierre de notas.',
            'Negocia por escrito el tope de aumentos en renovaciones.',
            'Si dudas, pide un piloto antes de comprometerte con todos los módulos.',
          ],
        },
        {
          t: 'p',
          text: 'Si quieres una cotización de STODIA para tu colegio, puedes solicitarla indicando matrícula, módulos de interés y forma de alojamiento; te responderemos con una propuesta detallada, sin compromiso.',
        },
      ],
    },
  ],
  faq: [
    {
      q: '¿Por qué los proveedores no publican precios?',
      a: 'Porque el costo depende de la matrícula, los módulos, el alojamiento y el nivel de servicio. Una cotización con tus datos es más útil que una cifra genérica.',
    },
    {
      q: '¿Es mejor pagar una licencia única o una suscripción?',
      a: 'Depende de tu flujo de caja y de qué incluya cada opción. Compara el costo total a varios años, incluyendo soporte, actualizaciones y condiciones de salida.',
    },
    {
      q: '¿Qué costos adicionales suele haber además de la licencia?',
      a: 'Implementación, migración de datos, capacitación, soporte, módulos extra, mensajería, hardware y personalizaciones. Pregunta por cada uno por escrito.',
    },
    {
      q: '¿Puedo probar el sistema antes de contratar?',
      a: 'Muchos proveedores ofrecen demostraciones o pilotos. Solicita una prueba con escenarios reales de tu colegio antes de firmar.',
    },
    {
      q: '¿Qué pasa con mis datos si dejo de pagar o cambio de proveedor?',
      a: 'Debe quedar escrito en el contrato. Exige poder exportar tus datos y conoce los plazos y costos de hacerlo.',
    },
  ],
  related: [
    'como-elegir-un-software-de-gestion-escolar-checklist',
    'excel-vs-software-de-gestion-escolar',
    'software-escolar-en-la-nube-vs-en-tu-servidor',
    'como-reducir-la-morosidad-en-un-colegio-privado',
  ],
  sources: [
    {
      name: 'Ley 172-13 sobre Protección Integral de los Datos Personales (texto)',
      url: 'https://bdi.com.do/media/lx0bzgfe/ley-sobre-proteccion-datos-caracter-personal.pdf',
    },
  ],
};
