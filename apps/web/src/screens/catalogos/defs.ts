/** CAT_DEF / CAT_GROUPS del prototipo (L2294-2329): metadatos de UI de cada catálogo maestro. */
export type Row = { id: string; estado: string } & Record<string, unknown>;
export type Cat = Record<string, Row[]>;
export type Lbl = (cat: string, id: string) => string;

export interface FieldDef {
  k: string; l: string; t: 'text' | 'int' | 'select' | 'ref' | 'multi' | 'time' | 'password' | 'role' | 'info';
  req?: 1; ph?: string; hint?: string; mono?: 1; upper?: 1; opts?: string[]; ref?: string;
}
export type ColKind = 'bold' | 'mono' | 'ref' | 'occ' | 'chips' | 'pwd' | 'money';
export interface CatDef {
  l: string; one: string; icon: string; desc: string; fem?: 1; estados?: string[];
  label: (r: Row, L: Lbl) => string; uniq: string[][];
  fields: FieldDef[]; cols: [string, string, ColKind?][];
}

const s = (v: unknown) => String(v ?? '');
export const CAT_GROUPS: [string, string[]][] = [['Estructura académica', ['grados', 'secciones', 'tandas', 'materias', 'rubricas']], ['Recursos humanos', ['docentes', 'staff']], ['Infraestructura', ['aulas']], ['Finanzas y logística', ['cajas', 'rutas']]];

export const CAT_DEF: Record<string, CatDef> = {
  grados: { l: 'Niveles y grados', one: 'grado', icon: 'ph ph-stairs', desc: 'El orden de promoción define a qué grado pasa cada alumno en el cierre de año (EOY).', label: r => s(r.grado) + (r.nivel === 'Primaria' ? '' : ' ' + s(r.nivel)), uniq: [['nivel', 'grado'], ['orden']],
    fields: [{ k: 'nivel', l: 'Nivel', t: 'select', opts: ['Inicial', 'Primaria', 'Secundaria'], req: 1 }, { k: 'grado', l: 'Grado', t: 'text', req: 1, ph: 'ej. 1ro' }, { k: 'orden', l: 'Orden de promoción', t: 'int', req: 1, hint: 'Al cerrar el ciclo, el alumno pasa al grado con el orden siguiente.' }],
    cols: [['nivel', 'Nivel'], ['grado', 'Grado', 'bold'], ['orden', 'Orden', 'mono']] },
  secciones: { fem: 1, l: 'Secciones', one: 'sección', icon: 'ph ph-rows', desc: 'Al llegar a la capacidad máxima, la sección se marca llena y se bloquea en Inscripción.', label: (r, L) => L('grados', s(r.grado)) + ' ' + s(r.seccion), uniq: [['grado', 'seccion', 'tanda']],
    fields: [{ k: 'grado', l: 'Grado', t: 'ref', ref: 'grados', req: 1 }, { k: 'seccion', l: 'Sección', t: 'text', req: 1, ph: 'A', upper: 1 }, { k: 'tanda', l: 'Tanda', t: 'ref', ref: 'tandas', req: 1 }, { k: 'aula', l: 'Aula base', t: 'ref', ref: 'aulas', hint: 'La capacidad no puede superar los pupitres del aula.' }, { k: 'cap', l: 'Capacidad máxima', t: 'int', req: 1 }, { k: 'insc', l: 'Inscritos', t: 'info' }],
    cols: [['_label', 'Sección', 'bold'], ['tanda', 'Tanda', 'ref'], ['aula', 'Aula base', 'ref'], ['cap', 'Ocupación', 'occ']] },
  tandas: { fem: 1, l: 'Tandas / turnos', one: 'tanda', icon: 'ph ph-sun-horizon', desc: 'Turnos disponibles en secciones, horarios y planes de pago por tanda.', label: r => s(r.nombre), uniq: [['nombre']],
    fields: [{ k: 'nombre', l: 'Nombre', t: 'text', req: 1, ph: 'ej. Sabatina' }, { k: 'ini', l: 'Hora de entrada', t: 'time', req: 1, ph: '07:30', mono: 1 }, { k: 'fin', l: 'Hora de salida', t: 'time', req: 1, ph: '12:30', mono: 1 }],
    cols: [['nombre', 'Tanda', 'bold'], ['ini', 'Entrada', 'mono'], ['fin', 'Salida', 'mono']] },
  materias: { fem: 1, l: 'Materias', one: 'materia', icon: 'ph ph-book-open', desc: 'Cada materia pertenece a uno o varios grados; la matriz de notas y los horarios la toman de aquí.', label: r => s(r.nombre), uniq: [['codigo']],
    fields: [{ k: 'codigo', l: 'Código', t: 'text', req: 1, ph: 'MAT-01', mono: 1, upper: 1 }, { k: 'nombre', l: 'Nombre', t: 'text', req: 1 }, { k: 'grados', l: 'Grados donde se imparte', t: 'multi', ref: 'grados', req: 1 }, { k: 'horas', l: 'Horas semanales', t: 'int', req: 1 }],
    cols: [['codigo', 'Código', 'mono'], ['nombre', 'Materia', 'bold'], ['grados', 'Grados', 'chips'], ['horas', 'Hrs/sem', 'mono']] },
  rubricas: { fem: 1, l: 'Rúbricas de evaluación', one: 'rúbrica', icon: 'ph ph-list-checks', desc: 'Criterios y pesos con los que se califica cada materia; la matriz de notas los toma de aquí.', label: r => s(r.nombre), uniq: [['nombre']],
    fields: [{ k: 'nombre', l: 'Nombre de la rúbrica', t: 'text', req: 1, ph: 'Ej. Evaluación de Lengua Española' }, { k: 'materias', l: 'Materias que la usan', t: 'multi', ref: 'materias', req: 1 }, { k: 'escala', l: 'Escala', t: 'select', opts: ['Numérica 0–100', 'Numérica 0–10', 'Literal A–F', 'Descriptiva (Logrado / En proceso)'], req: 1 }, { k: 'crit', l: 'Criterios y pesos', t: 'text', req: 1, ph: 'Tareas 20%, Participación 10%, Exámenes 70%', hint: 'Separa cada criterio con coma; los pesos deben sumar 100%.' }, { k: 'minimo', l: 'Nota mínima de aprobación', t: 'int', req: 1 }],
    cols: [['nombre', 'Rúbrica', 'bold'], ['materias', 'Materias', 'chips'], ['escala', 'Escala'], ['crit', 'Criterios'], ['minimo', 'Aprueba', 'mono']] },
  docentes: { l: 'Docentes', one: 'docente', icon: 'ph ph-chalkboard-teacher', desc: 'Qué materias imparte cada docente y en qué secciones.', label: r => s(r.nombre), uniq: [['cedula'], ['usuario']],
    fields: [{ k: 'nombre', l: 'Nombre completo', t: 'text', req: 1 }, { k: 'cedula', l: 'Cédula', t: 'text', req: 1, mono: 1, ph: '001-0000000-0' }, { k: 'esp', l: 'Especialidad académica', t: 'text', req: 1 }, { k: 'email', l: 'Correo', t: 'text', ph: 'nombre@lospinos.edu.do' }, { k: 'usuario', l: 'Usuario', t: 'text', req: 1, mono: 1, ph: 'usr_apellido' }, { k: 'password', l: 'Contraseña', t: 'password', ph: 'Mínimo 8 caracteres' }, { k: 'rol', l: 'Rol de seguridad', t: 'role', req: 1, hint: 'Los permisos se definen en Configuración › Roles y permisos.' }, { k: 'materias', l: 'Materias que imparte', t: 'multi', ref: 'materias' }, { k: 'secciones', l: 'Secciones asignadas', t: 'multi', ref: 'secciones' }],
    cols: [['nombre', 'Docente', 'bold'], ['usuario', 'Usuario', 'mono'], ['password', 'Contraseña', 'pwd'], ['rol', 'Rol'], ['esp', 'Especialidad'], ['materias', 'Materias', 'chips'], ['secciones', 'Secciones', 'chips']] },
  staff: { l: 'Cajeros y administrativos', one: 'empleado', icon: 'ph ph-identification-badge', desc: 'Empleados con usuario del sistema, rol de seguridad (RBAC) y caja asignada.', label: r => s(r.nombre), uniq: [['usuario']],
    fields: [{ k: 'nombre', l: 'Nombre completo', t: 'text', req: 1 }, { k: 'cargo', l: 'Cargo', t: 'text', req: 1 }, { k: 'usuario', l: 'Usuario', t: 'text', req: 1, mono: 1, ph: 'usr_apellido' }, { k: 'password', l: 'Contraseña', t: 'password', ph: 'Mínimo 8 caracteres' }, { k: 'rol', l: 'Rol de seguridad', t: 'role', req: 1, hint: 'Los permisos se definen en Configuración › Roles y permisos.' }, { k: 'caja', l: 'Caja asignada', t: 'ref', ref: 'cajas', hint: 'Solo para cajeros.' }],
    cols: [['nombre', 'Empleado', 'bold'], ['cargo', 'Cargo'], ['usuario', 'Usuario', 'mono'], ['password', 'Contraseña', 'pwd'], ['rol', 'Rol'], ['caja', 'Caja', 'ref']] },
  aulas: { l: 'Aulas y espacios', one: 'espacio', icon: 'ph ph-door-open', desc: 'El motor de horarios usa la capacidad de pupitres para detectar choques y sobrecupo.', label: r => s(r.nombre), uniq: [['nombre']],
    fields: [{ k: 'nombre', l: 'Nombre', t: 'text', req: 1, ph: 'Aula 22' }, { k: 'tipo', l: 'Tipo', t: 'select', opts: ['Aula', 'Laboratorio', 'Cancha', 'Salón especial'], req: 1 }, { k: 'edif', l: 'Edificio / ubicación', t: 'text' }, { k: 'pupitres', l: 'Capacidad de pupitres', t: 'int', req: 1 }],
    cols: [['nombre', 'Espacio', 'bold'], ['tipo', 'Tipo'], ['edif', 'Ubicación'], ['pupitres', 'Pupitres', 'mono']] },
  cajas: { fem: 1, l: 'Cajas registradoras', one: 'caja', icon: 'ph ph-cash-register', desc: 'Terminales lógicas de cobro; cada cajero se asigna a una.', label: r => s(r.codigo), uniq: [['codigo']], estados: ['Activa', 'Inactiva'],
    fields: [{ k: 'codigo', l: 'Código', t: 'text', req: 1, ph: 'Caja 04' }, { k: 'ubic', l: 'Ubicación', t: 'text', req: 1 }, { k: 'ncf', l: 'Comprobante por defecto', t: 'select', opts: ['B02 · Consumo', 'B01 · Crédito fiscal'], req: 1 }],
    cols: [['codigo', 'Caja', 'bold'], ['ubic', 'Ubicación'], ['ncf', 'NCF por defecto']] },
  rutas: { fem: 1, l: 'Rutas de transporte', one: 'ruta', icon: 'ph ph-bus', desc: 'Zonas, chofer y vehículo asignado a cada ruta.', label: r => s(r.nombre), uniq: [['nombre'], ['ficha']],
    fields: [{ k: 'nombre', l: 'Ruta', t: 'text', req: 1, ph: 'Zona D' }, { k: 'sectores', l: 'Sectores que cubre', t: 'text' }, { k: 'chofer', l: 'Chofer asignado', t: 'text', req: 1 }, { k: 'ficha', l: 'Ficha del vehículo', t: 'text', req: 1, mono: 1, upper: 1, ph: 'AB-0000' }, { k: 'asientos', l: 'Asientos', t: 'int', req: 1 }, { k: 'tarifa', l: 'Tarifa mensual (RD$)', t: 'int', req: 1 }],
    cols: [['nombre', 'Ruta', 'bold'], ['sectores', 'Sectores'], ['chofer', 'Chofer'], ['ficha', 'Ficha', 'mono'], ['asientos', 'Asientos', 'mono'], ['tarifa', 'Tarifa', 'money']] },
};
