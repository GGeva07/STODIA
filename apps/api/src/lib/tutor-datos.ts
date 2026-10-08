import { digits } from './personas';

/** Datos de contacto del tutor y sus validaciones: única fuente para Tutores (alta/edición) e Inscripción (wizard). */
export const PARENTESCOS = ['Padre', 'Madre', 'Tutor legal', 'Abuelo(a)', 'Otro'];
export const TIPOS = ['Financiero y académico', 'Financiero', 'Académico'];

export const fmtCed = (v: string) => {
  const d = digits(v).slice(0, 11);
  return d.length <= 3 ? d : d.length <= 10 ? `${d.slice(0, 3)}-${d.slice(3)}` : `${d.slice(0, 3)}-${d.slice(3, 10)}-${d.slice(10)}`;
};
export const fmtTel = (v: string) => { const d = digits(v); return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : v.trim(); };

export interface TutorCampos { nombre: string; cedula: string; parentesco: string; tipo: string; tel: string; email: string; rnc: string }

/** Valida los campos ya normalizados. Devuelve el mensaje en español del primer error, o null si todo está bien. */
export function errorTutor(v: TutorCampos): string | null {
  if (!v.nombre) return 'Nombre completo: campo requerido';
  if (digits(v.cedula).length !== 11) return 'Cédula: debe tener 11 dígitos (000-0000000-0)';
  if (!PARENTESCOS.includes(v.parentesco)) return 'Parentesco: valor inválido';
  if (!TIPOS.includes(v.tipo)) return 'Responsabilidad: valor inválido';
  if (digits(v.tel).length < 7) return 'Teléfono: campo requerido (ej. 809-555-0000)';
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return 'Correo: formato inválido';
  if (v.rnc && ![9, 11].includes(digits(v.rnc).length)) return 'RNC: debe tener 9 u 11 dígitos';
  return null;
}

/** Une dos responsabilidades (un tutor que ya era financiero y ahora también es legal pasa a «Financiero y académico»). */
export function unirTipo(a: string, b: string): string {
  const fin = a.includes('Financiero') || b.includes('Financiero'), aca = a.includes('cadémico') || b.includes('cadémico');
  return fin && aca ? 'Financiero y académico' : fin ? 'Financiero' : 'Académico';
}
