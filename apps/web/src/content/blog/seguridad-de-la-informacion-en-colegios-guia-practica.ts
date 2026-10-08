import type { Article } from './types';

export const article: Article = {
  slug: 'seguridad-de-la-informacion-en-colegios-guia-practica',
  title: 'Seguridad de la información en colegios: guía práctica',
  description:
    'Guía práctica de seguridad de la información para colegios: respaldos 3-2-1, accesos por rol, contraseñas, auditoría, ransomware y plan de respuesta.',
  date: '2026-10-04',
  category: 'Tecnología',
  readMinutes: 10,
  keywords: [
    'seguridad de la información colegios',
    'respaldos 3-2-1',
    'ransomware escuelas',
    'ciberseguridad colegios',
    'contraseñas seguras colegio',
    'plan de respuesta a incidentes',
  ],
  summary:
    'Un colegio protege mejor sus datos con pocas medidas bien aplicadas: respaldos con la regla 3-2-1, accesos por rol, contraseñas individuales, registro de auditoría, equipos actualizados y un plan escrito para responder a incidentes. No hace falta un presupuesto de gran empresa, pero sí constancia y responsables definidos. Esta guía las ordena por prioridad.',
  sections: [
    {
      h2: '¿Por qué los colegios son un blanco atractivo?',
      blocks: [
        {
          t: 'p',
          text: 'Un colegio guarda información valiosa y delicada: datos de menores, contactos de familias, información económica y de salud. A la vez, suele tener equipos mixtos, personal que rota, pocas políticas escritas y poco presupuesto técnico. Esa combinación facilita que un descuido, como una clave compartida o un correo falso, termine en una pérdida de datos.',
        },
        {
          t: 'p',
          text: 'Las agencias de ciberseguridad internacionales, como la CISA de Estados Unidos, recomiendan medidas de base que aplican a cualquier organización: respaldos, parches, accesos controlados y planes de respuesta. Esas son las que desarrollamos aquí, adaptadas a un colegio.',
        },
        {
          t: 'callout',
          title: 'Aviso importante',
          text: 'Esta guía es informativa y no sustituye una evaluación de seguridad profesional ni asesoría legal. Para incidentes graves o dudas jurídicas, consulta con especialistas.',
        },
      ],
    },
    {
      h2: 'Respaldos: la regla 3-2-1',
      blocks: [
        {
          t: 'p',
          text: 'Los respaldos son tu seguro contra fallas de disco, borrados accidentales, robos y ransomware. La regla 3-2-1 es una pauta sencilla y muy difundida:',
        },
        {
          t: 'ul',
          items: [
            '3 copias de tus datos: la original más dos respaldos.',
            '2 tipos de medio distintos: por ejemplo, un disco externo y un servicio remoto.',
            '1 copia fuera del colegio (o desconectada de la red), para que un incendio, un robo o un ransomware no la alcancen.',
          ],
        },
        {
          t: 'p',
          text: 'Lo que más se olvida es probar la restauración. Un respaldo que nunca se ha restaurado es una suposición, no una garantía.',
        },
        {
          t: 'table',
          caption: 'Calendario de respaldos sugerido',
          head: ['Acción', 'Frecuencia sugerida', 'Responsable'],
          rows: [
            ['Respaldo automático de la base de datos del sistema', 'Diario', 'Administrador técnico o proveedor'],
            ['Copia externa o fuera del colegio', 'Diaria o semanal, según lo que puedas perder', 'Administrador técnico'],
            ['Prueba de restauración', 'Al menos cada trimestre o cada cierre de periodo', 'Administrador técnico con testigo de dirección'],
            ['Revisión de que los respaldos terminaron bien', 'Semanal', 'Administrador técnico'],
          ],
        },
        {
          t: 'p',
          text: 'Define también cuántos datos puedes permitirte perder: si el sistema se cae mañana, ¿es aceptable perder un día de cobros? Esa respuesta determina la frecuencia real de tus respaldos.',
        },
      ],
    },
    {
      h2: 'Accesos por rol y principio de mínimo privilegio',
      blocks: [
        {
          t: 'p',
          text: 'Cada persona debe ver y hacer solo lo que su trabajo exige. Esto reduce errores y limita el daño si una cuenta se compromete.',
        },
        {
          t: 'table',
          head: ['Rol', 'Debería poder', 'No debería poder'],
          rows: [
            ['Docente', 'Ver sus cursos, registrar asistencia y notas', 'Ver saldos de familias o datos de otros cursos'],
            ['Caja / cobros', 'Registrar pagos y emitir recibos', 'Modificar notas o ver informes psicopedagógicos'],
            ['Secretaría', 'Gestionar inscripciones y expedientes', 'Eliminar historial financiero'],
            ['Coordinación', 'Ver su ámbito y corregir asistencia', 'Cambiar permisos de usuarios'],
            ['Dirección', 'Ver reportes globales', 'Compartir sus claves con otros'],
            ['Administrador técnico', 'Gestionar usuarios y respaldos', 'Operar con la misma cuenta en el día a día'],
          ],
        },
        {
          t: 'ul',
          items: [
            'Crea y elimina usuarios con un procedimiento formal: alta al ingresar, baja el mismo día de la salida.',
            'Revisa los permisos cada periodo escolar.',
            'Evita cuentas genéricas como "caja1" compartida por varias personas: no sabrás quién hizo qué.',
          ],
        },
      ],
    },
    {
      h2: 'Contraseñas: ¿qué hacer y qué evitar?',
      blocks: [
        {
          t: 'p',
          text: 'La guía técnica del NIST sobre identidad digital (SP 800-63B) recomienda priorizar la longitud, evitar contraseñas conocidas o filtradas y no forzar cambios periódicos sin motivo. Traducido a la vida de un colegio:',
        },
        {
          t: 'ul',
          items: [
            'Usa frases largas (varias palabras) en lugar de claves cortas con símbolos obligatorios.',
            'Una contraseña distinta para cada servicio; un gestor de contraseñas ayuda mucho.',
            'Cambia la clave de inmediato ante una sospecha o filtración, y no por calendario obligatorio.',
            'Activa verificación en dos pasos en el correo institucional y en servicios críticos.',
            'Nunca compartas claves por mensajería ni las dejes escritas a la vista.',
            'Pide que el sistema escolar almacene contraseñas con hash y sal (por ejemplo, bcrypt), nunca en texto plano. La hoja de buenas prácticas de OWASP explica por qué.',
          ],
        },
      ],
    },
    {
      h2: 'Registro de auditoría: saber quién hizo qué',
      blocks: [
        {
          t: 'p',
          text: 'Un registro de auditoría guarda quién entró, qué consultó y qué modificó. Sirve para detectar abusos, resolver discrepancias ("yo no borré ese pago") y demostrar diligencia ante un reclamo. Pide que incluya al menos usuario, acción, fecha y hora, y que no pueda ser alterado por los usuarios comunes.',
        },
        {
          t: 'p',
          text: 'En archivos sueltos como los de Excel esto es casi imposible, una de las razones que se explican en [[excel-vs-software-de-gestion-escolar|Excel vs software de gestión escolar]].',
        },
      ],
    },
    {
      h2: 'Ransomware y phishing: cómo evitarlos',
      blocks: [
        {
          t: 'p',
          text: 'El ransomware cifra los archivos de una organización y pide dinero para devolverlos. Suele entrar por un correo engañoso (phishing), una descarga maliciosa o una cuenta con clave débil. Medidas de prevención:',
        },
        {
          t: 'ul',
          items: [
            'Mantén sistemas operativos, navegadores y antivirus actualizados.',
            'Capacita al personal para reconocer correos sospechosos: urgencia, remitentes extraños, enlaces que no coinciden, adjuntos inesperados.',
            'Limita quién puede instalar programas.',
            'Separa la red de invitados y de estudiantes de la red administrativa.',
            'Conserva respaldos desconectados de la red principal para que el ransomware no los alcance.',
            'Desactiva accesos remotos que no uses y protege los que sí necesites.',
          ],
        },
        {
          t: 'callout',
          title: 'Si te infectan',
          text: 'Desconecta de inmediato los equipos afectados de la red, no apagues sin criterio ni borres evidencia, avisa a la dirección y a tu soporte técnico, y restaura desde respaldos limpios. Las autoridades y agencias especializadas suelen desaconsejar pagar el rescate, porque no garantiza la recuperación de los datos.',
        },
      ],
    },
    {
      h2: 'Plan de respuesta a incidentes en 8 pasos',
      blocks: [
        {
          t: 'ol',
          items: [
            'Detectar y registrar: qué ocurrió, cuándo y quién lo notó.',
            'Contener: aislar equipos, cambiar claves, revocar accesos sospechosos.',
            'Activar al equipo: dirección, responsable técnico, proveedor del sistema y asesor legal.',
            'Evaluar el alcance: qué datos se afectaron y de qué personas.',
            'Recuperar: restaurar desde respaldos verificados y comprobar que el origen del problema fue eliminado.',
            'Comunicar: informar con claridad y a tiempo a las familias y al personal afectados, sin minimizar ni alarmar.',
            'Evaluar obligaciones: consultar con un abogado qué corresponde en materia de la Ley 172-13 y, si hay acceso ilícito o delito, la Ley 53-07.',
            'Aprender: documentar causas y ajustar las medidas.',
          ],
        },
        {
          t: 'p',
          text: 'Escribe este plan antes de necesitarlo, con nombres de cargos y teléfonos de contacto, y guárdalo también en papel. El contexto legal de los datos de menores se desarrolla en la guía de [[ley-172-13-proteccion-de-datos-en-colegios|la Ley 172-13 en colegios]].',
        },
      ],
    },
    {
      h2: 'Seguridad según dónde vive tu sistema',
      blocks: [
        {
          t: 'p',
          text: 'Parte de las medidas depende de si tu software está alojado por el proveedor o en tu propio servidor. En el segundo caso, tú eres responsable del cuarto del servidor, la energía, las actualizaciones y los respaldos. En el primero, debes verificar qué hace el proveedor y exigirlo por contrato. Lo comparamos en [[software-escolar-en-la-nube-vs-en-tu-servidor|software escolar en la nube vs en tu servidor]].',
        },
        {
          t: 'p',
          text: 'STODIA aplica contraseñas con bcrypt, sesiones con JWT, roles de usuario y auditoría de acciones, y se despliega como una instancia por colegio, en tu servidor o alojada por SynsetSolutions. Aun así, ningún sistema suple hábitos como respaldar, dar de baja usuarios y capacitar al personal. Si quieres revisar tu situación actual con un enfoque práctico, puedes pedir una conversación técnica sin compromiso.',
        },
      ],
    },
    {
      h2: 'Checklist mensual de seguridad para la dirección',
      blocks: [
        {
          t: 'ul',
          items: [
            'Los respaldos se ejecutaron y se guardó una copia fuera del colegio.',
            'Se hizo una prueba de restauración en este periodo.',
            'Se revisó la lista de usuarios: no queda nadie que ya no trabaje aquí.',
            'Los equipos tienen actualizaciones y antivirus al día.',
            'No hay cuentas compartidas entre empleados.',
            'El personal recibió un recordatorio breve sobre phishing.',
            'El plan de respuesta está vigente y los contactos son correctos.',
            'Se revisaron los registros de auditoría de acciones inusuales (borrados, accesos fuera de horario).',
          ],
        },
      ],
    },
  ],
  faq: [
    {
      q: '¿Qué es la regla de respaldos 3-2-1?',
      a: 'Mantener tres copias de los datos, en dos tipos de medio diferentes, con una de ellas fuera de tu sede o desconectada de la red. Así un solo evento, como un robo, un incendio o un ransomware, no destruye todas las copias.',
    },
    {
      q: '¿Cada cuánto debo cambiar las contraseñas?',
      a: 'Las guías actuales, como la del NIST, desaconsejan forzar cambios periódicos sin motivo y recomiendan claves largas y únicas, cambiándolas cuando haya sospecha de compromiso. Combínalo con verificación en dos pasos donde sea posible.',
    },
    {
      q: '¿Debo pagar si un ransomware cifra mis archivos?',
      a: 'Las agencias especializadas suelen desaconsejar el pago, porque no garantiza recuperar los datos y puede fomentar más ataques. La mejor defensa es tener respaldos desconectados y probados. Consulta a especialistas antes de decidir.',
    },
    {
      q: '¿Mi colegio es responsable si se filtran datos de estudiantes?',
      a: 'Como responsable de los datos, el colegio debe adoptar medidas de seguridad razonables según la Ley 172-13, y una filtración puede dar lugar a reclamos. Un abogado puede orientarte sobre tu caso concreto.',
    },
    {
      q: '¿Basta con tener antivirus?',
      a: 'No. El antivirus es una capa más. Necesitas respaldos, accesos por rol, actualizaciones, capacitación del personal y un plan de respuesta.',
    },
  ],
  related: [
    'ley-172-13-proteccion-de-datos-en-colegios',
    'software-escolar-en-la-nube-vs-en-tu-servidor',
    'excel-vs-software-de-gestion-escolar',
    'control-de-asistencia-digital-en-colegios',
  ],
  sources: [
    {
      name: 'CISA: Guía Stop Ransomware (Ransomware Guide)',
      url: 'https://www.cisa.gov/stopransomware/ransomware-guide',
    },
    {
      name: 'NIST SP 800-63B: Digital Identity Guidelines, Authentication',
      url: 'https://pages.nist.gov/800-63-3/sp800-63b.html',
    },
    {
      name: 'OWASP Password Storage Cheat Sheet',
      url: 'https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html',
    },
    {
      name: 'Resumen de la Ley 172-13 sobre Protección de Datos Personales',
      url: 'https://phlaw.com/es/ley-172-13-sobre-proteccion-de-datos-personales/',
    },
  ],
};
