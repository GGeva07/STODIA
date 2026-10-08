import type { Article } from './types';

export const article: Article = {
  slug: 'comunicacion-con-padres-portal-de-tutores',
  title: 'Comunicación con padres: portal de tutores en colegios',
  description:
    'Cómo mejorar la comunicación entre colegio y familias con un portal de tutores: qué publicar, reglas de uso, privacidad y errores a evitar en tu centro.',
  date: '2026-09-26',
  category: 'Padres y comunidad',
  readMinutes: 8,
  keywords: [
    'comunicación con padres',
    'portal de tutores',
    'portal de padres colegio',
    'app para padres colegio',
    'comunicación escuela familia',
  ],
  summary:
    'Un portal de tutores concentra en un solo lugar lo que las familias más preguntan: notas, asistencia, estado de cuenta, circulares y calendario. Reduce las llamadas repetidas y los mensajes dispersos por mensajería, siempre que se definan reglas claras de qué se publica, quién responde y cómo se protegen los datos. La tecnología ayuda, pero el orden del proceso es lo que genera confianza.',
  sections: [
    {
      h2: '¿Por qué falla la comunicación entre colegio y familias?',
      blocks: [
        {
          t: 'p',
          text: 'En muchos colegios la comunicación se reparte entre grupos de mensajería, llamadas a secretaría, notas en la agenda y avisos impresos. Cada canal funciona un poco, pero ninguno es la fuente oficial. El resultado es conocido: padres que dicen que nadie les avisó, secretarias respondiendo la misma pregunta veinte veces y directivos enterándose de un malentendido cuando ya escaló.',
        },
        {
          t: 'ul',
          items: [
            'No hay una fuente oficial única: la misma información circula con versiones distintas.',
            'Los grupos masivos mezclan avisos, conversaciones personales y rumores.',
            'La información privada (notas, deudas) termina en canales donde no debería estar.',
            'No queda registro de qué se comunicó, a quién y cuándo.',
            'El horario de atención no está definido y los mensajes llegan a cualquier hora.',
          ],
        },
        {
          t: 'p',
          text: 'Un portal de tutores no arregla esto solo, pero da una base ordenada sobre la cual establecer reglas.',
        },
      ],
    },
    {
      h2: '¿Qué es un portal de tutores y qué debe incluir?',
      blocks: [
        {
          t: 'p',
          text: 'Es un espacio web o una aplicación (a menudo una PWA que se instala desde el navegador) donde cada tutor entra con su propio usuario y ve únicamente la información de sus hijos. Lo que más valoran las familias son las consultas simples y frecuentes:',
        },
        {
          t: 'table',
          head: ['Función', 'Qué resuelve', 'Cuidado de privacidad'],
          rows: [
            ['Notas y boletines', 'Evita llamadas y esperas para saber el rendimiento', 'Solo el tutor del estudiante'],
            ['Asistencia y tardanzas', 'Aviso inmediato de ausencias', 'Evitar exponer datos a otros padres'],
            ['Estado de cuenta y pagos', 'Claridad sobre mensualidades y saldo', 'Visible solo al responsable de pago'],
            ['Circulares y calendario', 'Una sola fuente oficial de fechas y eventos', 'Segmentar por curso o sección'],
            ['Documentos y constancias', 'Descarga sin ir al colegio', 'Control de acceso y trazabilidad'],
            ['Comedor y actividades', 'Menús, inscripciones, autorizaciones', 'Datos de alergias solo a quien corresponde'],
          ],
        },
        {
          t: 'p',
          text: 'Prioriza pocas funciones bien hechas antes que una lista larga que nadie mantiene actualizada.',
        },
      ],
    },
    {
      h2: '¿Qué mensajes deben ir por el portal y cuáles no?',
      blocks: [
        {
          t: 'p',
          text: 'Define una política simple de canales. Una propuesta que puedes adaptar:',
        },
        {
          t: 'ul',
          items: [
            'Portal o app: avisos oficiales, notas, asistencia, estados de cuenta, circulares y documentos.',
            'Llamada o mensaje directo del docente o la coordinación: situaciones urgentes o sensibles, como un accidente, un problema de conducta grave o una situación de salud.',
            'Reunión presencial o virtual: temas complejos, como bajo rendimiento sostenido, acuerdos de pago o casos de apoyo psicopedagógico.',
            'Grupo de mensajería general (si lo mantienes): solo avisos de una vía, con reglas de uso claras y administradores definidos.',
          ],
        },
        {
          t: 'callout',
          title: 'Regla de oro',
          text: 'La información de un estudiante concreto (notas, conducta, deudas, salud) no debe publicarse en canales grupales. Es un asunto de respeto y de protección de datos, como detalla la guía sobre [[ley-172-13-proteccion-de-datos-en-colegios|la Ley 172-13 en colegios]].',
        },
      ],
    },
    {
      h2: 'Cómo implementar un portal de tutores paso a paso',
      blocks: [
        {
          t: 'ol',
          items: [
            'Depura los datos de contacto: correo y teléfono de cada tutor, y quién es el responsable de pago. Un portal es tan bueno como los datos que lo alimentan.',
            'Define quién ve qué: un tutor ve solo a sus hijos; un docente ve solo sus cursos; administración ve lo que necesita para su función.',
            'Decide el calendario de publicación: cuándo se cargan las notas, cuándo se emiten los estados de cuenta, cuándo salen las circulares.',
            'Redacta reglas de uso en una página: horarios de respuesta, tiempos esperados y canal para emergencias.',
            'Haz un lanzamiento piloto con un grado o una sección y recoge comentarios antes de abrir a todos.',
            'Ofrece apoyo a quienes tienen menos habilidades digitales: una sesión breve, una guía impresa de una hoja o un punto de ayuda en secretaría.',
            'Mide el uso: cuántas familias activaron la cuenta y qué preguntas siguen llegando por teléfono.',
          ],
        },
      ],
    },
    {
      h2: '¿Cómo se relaciona con la asistencia, los cobros y la morosidad?',
      blocks: [
        {
          t: 'p',
          text: 'La transparencia reduce conflictos. Si la familia puede ver su estado de cuenta, la fecha de vencimiento y el historial de pagos, hay menos discusiones sobre "yo ya pagué" y más disposición a regularizar. Combina esto con recordatorios cordiales y reglas claras, tal como se plantea en [[como-reducir-la-morosidad-en-un-colegio-privado|cómo reducir la morosidad en un colegio privado]].',
        },
        {
          t: 'p',
          text: 'Con la asistencia ocurre algo similar: avisar al tutor el mismo día de una ausencia es una de las comunicaciones más valoradas y más útiles para el bienestar del estudiante. Lo desarrollamos en [[control-de-asistencia-digital-en-colegios|control de asistencia digital en colegios]].',
        },
      ],
    },
    {
      h2: 'Seguridad y privacidad del portal',
      blocks: [
        {
          t: 'p',
          text: 'Un portal expone datos de menores por internet, así que la seguridad no es opcional. Revisa estos puntos con tu proveedor:',
        },
        {
          t: 'ul',
          items: [
            'Usuarios individuales por tutor, con contraseñas almacenadas de forma segura (hash) y no en texto plano.',
            'Roles y permisos: un tutor jamás ve información de otro estudiante.',
            'Recuperación de contraseña con verificación, no entregando claves por canales abiertos.',
            'Registro de auditoría de accesos y cambios.',
            'Cierre automático de sesión y recomendación de no compartir cuentas.',
            'Política para dar de baja o actualizar a un tutor cuando cambia la custodia o la persona responsable.',
          ],
        },
        {
          t: 'p',
          text: 'Más controles en la [[seguridad-de-la-informacion-en-colegios-guia-practica|guía práctica de seguridad de la información]]. Y si la custodia de un estudiante es un tema legal delicado, consulta a un abogado antes de decidir quién accede.',
        },
      ],
    },
    {
      h2: 'Errores comunes al lanzar un portal',
      blocks: [
        {
          t: 'ul',
          items: [
            'Lanzarlo sin datos limpios: tutores sin correo, teléfonos erróneos o tutores duplicados.',
            'Publicar notas o saldos incompletos y generar más dudas que respuestas.',
            'No decidir quién responde ni en cuánto tiempo.',
            'Abandonar los canales anteriores de golpe, sin período de transición.',
            'Esperar que los docentes carguen información extra sin darles tiempo ni capacitación.',
            'Usar el portal solo para cobrar y no para informar, lo que genera rechazo.',
          ],
        },
      ],
    },
    {
      h2: 'Un ejemplo de herramienta: STODIA',
      blocks: [
        {
          t: 'p',
          text: 'STODIA incluye un portal de tutores y una aplicación móvil (PWA) conectados con los módulos de notas, asistencia y cobros, de modo que la información que ve la familia sale de la misma base que usa la administración. Así se evita mantener datos duplicados. Si quieres ver cómo se vería con la estructura de tu colegio, puedes pedir una demostración y juzgar si encaja con tu forma de trabajar; para comparar opciones usa la [[como-elegir-un-software-de-gestion-escolar-checklist|checklist de selección]].',
        },
      ],
    },
  ],
  faq: [
    {
      q: '¿Qué es un portal de tutores?',
      a: 'Es un acceso web o móvil donde cada padre, madre o tutor consulta de forma privada la información de sus hijos: notas, asistencia, estado de cuenta, circulares y documentos del colegio.',
    },
    {
      q: '¿Qué hago con las familias que no usan tecnología?',
      a: 'Mantén una alternativa mínima: atención en secretaría, un resumen impreso o llamadas puntuales, y ofrece una breve capacitación. El portal debe sumar acceso, no excluir.',
    },
    {
      q: '¿Es buena idea que los padres hablen con los docentes por mensajería?',
      a: 'Conviene definir horarios y límites. Muchos colegios acuerdan que los temas urgentes van por teléfono o coordinación y que los mensajes escritos se responden en horarios laborables.',
    },
    {
      q: '¿Pueden dos tutores ver la misma información del estudiante?',
      a: 'Normalmente sí, si ambos están registrados como tutores autorizados. Si hay conflictos de custodia, solicita documentación y consulta a un abogado antes de restringir o conceder acceso.',
    },
    {
      q: '¿Cómo sé si el portal está funcionando?',
      a: 'Mide cuántas familias lo usan, cuántas consultas telefónicas repetitivas bajaron y si los atrasos o las ausencias sin aviso disminuyen. Evita fijarte metas por estadísticas ajenas; compara contra tu propio punto de partida.',
    },
  ],
  related: [
    'control-de-asistencia-digital-en-colegios',
    'seguridad-de-la-informacion-en-colegios-guia-practica',
    'ley-172-13-proteccion-de-datos-en-colegios',
    'como-reducir-la-morosidad-en-un-colegio-privado',
  ],
  sources: [
    {
      name: 'Resumen de la Ley 172-13 sobre Protección de Datos Personales',
      url: 'https://phlaw.com/es/ley-172-13-sobre-proteccion-de-datos-personales/',
    },
    {
      name: 'OWASP Password Storage Cheat Sheet',
      url: 'https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html',
    },
  ],
};
