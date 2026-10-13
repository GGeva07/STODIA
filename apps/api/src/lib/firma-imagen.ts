/** Validación de imágenes de firma por sus bytes (cabecera), sin librerías: tipo real y dimensiones de PNG / JPEG / WebP. */

export type MimeFirma = 'image/png' | 'image/jpeg' | 'image/webp';

/** Tipo REAL por la firma de bytes (ignora extensión y lo que declare el cliente). null = no es PNG/JPG/WebP. */
export function mimeReal(b: Uint8Array): MimeFirma | null {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 30 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

/** Ancho y alto en píxeles leyendo solo la cabecera. null = cabecera truncada o corrupta. */
export function dimensionesImagen(b: Uint8Array, mime: MimeFirma): { w: number; h: number } | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let w = 0, h = 0;
  if (mime === 'image/png') {
    if (b.length < 24 || dv.getUint32(12) !== 0x49484452) return null; // chunk IHDR
    w = dv.getUint32(16); h = dv.getUint32(20);
  } else if (mime === 'image/jpeg') {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const len = dv.getUint16(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) { h = dv.getUint16(i + 5); w = dv.getUint16(i + 7); break; } // SOFn
      i += 2 + len;
    }
  } else {
    const t = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (t === 'VP8 ') { w = dv.getUint16(26, true) & 0x3fff; h = dv.getUint16(28, true) & 0x3fff; }
    else if (t === 'VP8L') { const v = dv.getUint32(21, true); w = (v & 0x3fff) + 1; h = ((v >> 14) & 0x3fff) + 1; }
    else if (t === 'VP8X') { w = (b[24] | (b[25] << 8) | (b[26] << 16)) + 1; h = (b[27] | (b[28] << 8) | (b[29] << 16)) + 1; }
  }
  return w > 0 && h > 0 ? { w, h } : null;
}
