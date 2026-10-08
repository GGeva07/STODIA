import type { Article } from './types';

export const article: Article = {
  slug: 'software-escolar-en-la-nube-vs-en-tu-servidor',
  title: 'Software escolar en la nube vs en tu servidor',
  description:
    'Compara software escolar alojado por el proveedor y autoalojado en el servidor del colegio: costos, seguridad, internet, respaldos y control de los datos.',
  date: '2026-09-22',
  category: 'Tecnología',
  readMinutes: 9,
  keywords: [
    'software escolar en la nube',
    'software escolar en servidor propio',
    'autoalojado vs nube',
    'sistema de gestión escolar On-premise',
    'hosting sistema escolar',
  ],
  summary:
    'Un software escolar puede estar alojado por el proveedor (en la nube) o instalado en un servidor del propio colegio. La nube reduce el trabajo técnico y facilita el acceso remoto; el servidor propio da más control físico sobre los datos, pero exige personal, respaldos y energía e internet estables. No hay una opción universalmente mejor: depende de tu infraestructura, tu equipo técnico y tu tolerancia al riesgo.',
  sections: [
    {
      h2: '¿Qué significa software en la nube y software en tu servidor?',
      blocks: [
        {
          t: 'p',
          text: 'En un modelo alojado por el proveedor, el sistema funciona en servidores que administra la empresa que te lo vende. Tú accedes por internet desde el navegador o una aplicación. El instituto de normas de Estados Unidos (NIST) describe la computación en la nube como un modelo que permite acceder bajo demanda a recursos compartidos de cómputo, y en la práctica, para un colegio, eso se traduce en que no administras la máquina donde vive el sistema.',
        },
        {
          t: 'p',
          text: 'En un modelo autoalojado (también llamado instalación local o on-premise), el sistema se instala en un servidor que está físicamente en el colegio, o en uno que el colegio contrata y administra. Los datos residen en tu infraestructura y tu equipo, o un técnico contratado, se encarga del mantenimiento.',
        },
        {
          t: 'p',
          text: 'También existen esquemas mixtos: una instancia dedicada por colegio que puede instalarse en tu servidor o ser alojada por el proveedor, que es el enfoque de STODIA con una instancia por cliente. Lo importante es entender qué responsabilidad asumes en cada caso.',
        },
      ],
    },
    {
      h2: 'Comparativa honesta: ventajas y desventajas',
      blocks: [
        {
          t: 'table',
          head: ['Criterio', 'Alojado por el proveedor', 'En el servidor del colegio'],
          rows: [
            ['Puesta en marcha', 'Rápida; no compras equipo', 'Requiere servidor, instalación y configuración'],
            ['Costo inicial', 'Menor; pago recurrente', 'Mayor por hardware; menos pagos recurrentes al proveedor, más gastos propios'],
            ['Mantenimiento técnico', 'Lo asume el proveedor', 'Lo asume el colegio o un técnico contratado'],
            ['Dependencia de internet', 'Alta: sin internet no hay acceso', 'Menor en la red interna; el acceso remoto de padres sí requiere internet'],
            ['Acceso desde casa o móvil', 'Directo', 'Posible, pero requiere configurar red, dominio y seguridad'],
            ['Control físico de los datos', 'Compartido con el proveedor', 'Total, pero con total responsabilidad'],
            ['Respaldos', 'Gestionados por el proveedor (verifica cómo)', 'Responsabilidad del colegio (debes diseñarlos y probarlos)'],
            ['Energía y equipo', 'No te afectan', 'Un apagón o una falla de disco te afecta directamente'],
            ['Actualizaciones', 'Aplicadas por el proveedor', 'Las programas con el proveedor y tu técnico'],
          ],
        },
        {
          t: 'p',
          text: 'Nota que "más control" también significa "más responsabilidad". Tener el servidor en tu oficina no vuelve los datos más seguros por sí solo: si no hay respaldos, actualizaciones ni control de acceso físico, puede ser menos seguro que un servicio gestionado con buenas prácticas.',
        },
      ],
    },
    {
      h2: '¿Qué pasa si se cae el internet o la luz?',
      blocks: [
        {
          t: 'p',
          text: 'En República Dominicana, la estabilidad de internet y de energía varía por zona y por proveedor, así que esta pregunta es práctica, no teórica. Evalúa tu situación con estas preguntas:',
        },
        {
          t: 'ul',
          items: [
            '¿Cuántas veces al mes se cae el internet en el colegio y por cuánto tiempo?',
            '¿Tienes una conexión de respaldo (segundo proveedor o datos móviles) para caja y secretaría?',
            '¿Tienes inversor, planta o UPS para el servidor y los equipos clave?',
            '¿Qué procesos no pueden detenerse (cobros en caja, asistencia diaria) y cómo se continuarían?',
          ],
        },
        {
          t: 'p',
          text: 'Con un sistema alojado fuera, una caída de internet puede paralizar caja y secretaría. Con un servidor local, la operación interna puede seguir mientras la red local funcione, aunque los padres no puedan entrar al portal. Una aplicación web progresiva (PWA) puede mitigar parte del problema en los dispositivos, pero no sustituye una conexión estable para sincronizar datos.',
        },
      ],
    },
    {
      h2: '¿Cuál es más seguro: la nube o el servidor propio?',
      blocks: [
        {
          t: 'p',
          text: 'Depende de cómo se gestione, no del lugar. Un servidor bien administrado, con acceso restringido, actualizaciones y respaldos probados, puede ser muy seguro en cualquiera de los dos modelos. Un servidor descuidado es un riesgo en ambos.',
        },
        {
          t: 'ul',
          items: [
            'Acceso físico: en un servidor propio, ¿quién tiene llave del cuarto? ¿Hay control de ingreso?',
            'Acceso lógico: roles por usuario, contraseñas individuales y registro de auditoría.',
            'Actualizaciones: ¿quién aplica los parches y con qué frecuencia?',
            'Respaldos: ¿dónde se guardan, cada cuánto y quién prueba la restauración? Ver la regla 3-2-1 en la [[seguridad-de-la-informacion-en-colegios-guia-practica|guía de seguridad de la información]].',
            'Aislamiento entre clientes: si el proveedor aloja a varios colegios, pregunta si cada uno tiene su instancia independiente o comparte la misma base de datos.',
            'Confidencialidad: contrato que defina qué puede hacer el proveedor con tus datos.',
          ],
        },
        {
          t: 'callout',
          title: 'Pregunta clave al proveedor',
          text: 'Pide que te expliquen por escrito qué medidas de seguridad existen realmente (contraseñas con hash, roles, auditoría, respaldos) y no aceptes certificaciones o cifrado que no puedan demostrar. Si algo no existe, es mejor que lo digan.',
        },
      ],
    },
    {
      h2: '¿Y la ley? Datos personales y dónde viven',
      blocks: [
        {
          t: 'p',
          text: 'La Ley 172-13 obliga al responsable de los datos a protegerlos con medidas técnicas y organizativas, esté el servidor donde esté. Si un proveedor aloja la información, el colegio sigue siendo responsable frente a las familias, por lo que conviene un contrato que defina confidencialidad, uso permitido de los datos, respaldos y qué pasa al terminar la relación. Revisa los detalles en la guía de [[ley-172-13-proteccion-de-datos-en-colegios|protección de datos en colegios]] y consulta a un abogado para la redacción del acuerdo.',
        },
      ],
    },
    {
      h2: 'Criterios para decidir según tu colegio',
      blocks: [
        {
          t: 'table',
          head: ['Si tu colegio...', 'Probablemente conviene'],
          rows: [
            ['No tiene personal técnico ni presupuesto para servidor', 'Alojado por el proveedor'],
            ['Quiere que padres y docentes accedan desde casa y el móvil sin configurar nada', 'Alojado por el proveedor'],
            ['Tiene internet inestable y necesita operar la caja y la asistencia sí o sí', 'Servidor local, con respaldo de conexión'],
            ['Cuenta con técnico propio y sala de equipos segura', 'Servidor propio es viable'],
            ['Quiere conservar los datos físicamente en sus instalaciones por política interna', 'Servidor propio'],
            ['Tiene varias sedes', 'Evalúa alojado, o servidor central bien conectado'],
          ],
        },
        {
          t: 'p',
          text: 'Sea cual sea tu elección, plantea la salida desde el principio: ¿podrás exportar tus datos? ¿En qué formato? ¿Puedes cambiar de modelo después? Esa flexibilidad vale más que cualquier descuento inicial.',
        },
      ],
    },
    {
      h2: 'Costos: qué incluir al comparar',
      blocks: [
        {
          t: 'ul',
          items: [
            'Licencia o suscripción, con lo que incluye y lo que no (módulos, usuarios, soporte).',
            'Hardware del servidor, UPS, discos de respaldo y su reposición.',
            'Servicio técnico: instalación, mantenimiento y atención de incidentes.',
            'Conectividad adicional si habrá acceso remoto.',
            'Capacitación del personal.',
            'Costo de salida: exportación de datos y migración si cambias de proveedor.',
          ],
        },
        {
          t: 'p',
          text: 'No existe un precio de referencia universal, y desconfía de comparativas que lo presenten como tal. Para ordenar las partidas, usa la guía de [[cuanto-cuesta-un-sistema-de-gestion-escolar|cuánto cuesta un sistema de gestión escolar]] y el listado de la [[como-elegir-un-software-de-gestion-escolar-checklist|checklist de selección]].',
        },
      ],
    },
    {
      h2: 'El enfoque de STODIA: una instancia por colegio',
      blocks: [
        {
          t: 'p',
          text: 'STODIA se despliega como una instancia independiente por cliente. El colegio puede optar por instalarla en su propio servidor o por que la aloje SynsetSolutions, de modo que la decisión no queda atada al producto. En ambos casos, el sistema usa contraseñas almacenadas con bcrypt, sesiones con JWT, roles de usuario y registro de auditoría. Si quieres evaluar cuál modelo encaja con tu infraestructura, puedes pedir una conversación técnica sin compromiso y llevar las preguntas de este artículo.',
        },
      ],
    },
  ],
  faq: [
    {
      q: '¿Qué significa que el software sea "autoalojado"?',
      a: 'Que se instala y funciona en un servidor que administra el propio colegio (en sus instalaciones o en un servicio contratado por él), en lugar de depender de la infraestructura del proveedor.',
    },
    {
      q: '¿La nube es siempre más barata?',
      a: 'No siempre. Suele reducir el costo inicial, pero el pago es recurrente. Un servidor propio implica inversión en equipo y mantenimiento. Compara el costo total a varios años, no solo el primer mes.',
    },
    {
      q: '¿Puedo pasar de un modelo a otro más adelante?',
      a: 'Depende del proveedor. Pregunta de antemano si se puede migrar la instancia entre su alojamiento y tu servidor, en qué plazo y con qué costo.',
    },
    {
      q: '¿Quién hace los respaldos?',
      a: 'En un servicio alojado, normalmente el proveedor, pero debes verificar frecuencia, ubicación y pruebas de restauración. En un servidor propio, es responsabilidad del colegio y debe seguir una regla como la 3-2-1.',
    },
    {
      q: '¿El hecho de que los datos estén en otro lugar me libera de responsabilidad legal?',
      a: 'No. El colegio sigue siendo responsable de los datos de sus estudiantes y familias. Por eso conviene un contrato claro con el proveedor y medidas de seguridad verificables.',
    },
  ],
  related: [
    'seguridad-de-la-informacion-en-colegios-guia-practica',
    'ley-172-13-proteccion-de-datos-en-colegios',
    'excel-vs-software-de-gestion-escolar',
    'cuanto-cuesta-un-sistema-de-gestion-escolar',
  ],
  sources: [
    {
      name: 'NIST SP 800-145: The NIST Definition of Cloud Computing',
      url: 'https://csrc.nist.gov/pubs/sp/800/145/final',
    },
    {
      name: 'Resumen de la Ley 172-13 sobre Protección de Datos Personales',
      url: 'https://phlaw.com/es/ley-172-13-sobre-proteccion-de-datos-personales/',
    },
  ],
};
