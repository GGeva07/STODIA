/** RNC (9 dígitos, empresa) o cédula/RNC de persona física (11 dígitos); admite guiones, puntos y espacios. */
export const soloDigitos = (v: unknown): string => String(v ?? '').replace(/\D/g, '');
/** Máscara mientras se escribe: hasta 9 dígitos = RNC (0-00-00000-0); 10-11 = cédula (000-0000000-0). */
export const mascaraRnc = (v: string): string => {
  const d = soloDigitos(v).slice(0, 11);
  if (d.length <= 9) return [d.slice(0, 1), d.slice(1, 3), d.slice(3, 8), d.slice(8, 9)].filter(Boolean).join('-');
  return [d.slice(0, 3), d.slice(3, 10), d.slice(10)].filter(Boolean).join('-');
};
export const rncValido =(v: unknown): boolean => {
  const s = String(v ?? '');
  if (!/^[\d .-]+$/.test(s)) return false;
  const n = s.replace(/\D/g, '').length;
  return n === 9 || n === 11;
};
