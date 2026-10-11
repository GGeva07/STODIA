/** RNC (9 dígitos, empresa) o cédula/RNC de persona física (11 dígitos); admite guiones, puntos y espacios. */
export const rncValido = (v: unknown): boolean => {
  const s = String(v ?? '');
  if (!/^[\d .-]+$/.test(s)) return false;
  const n = s.replace(/\D/g, '').length;
  return n === 9 || n === 11;
};
