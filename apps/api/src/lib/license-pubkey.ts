/**
 * Clave PÚBLICA Ed25519 (SPKI DER en base64) del proveedor. Es la única clave que viaja con el producto.
 * La privada NUNCA está en el repo ni en la imagen: vive en %USERPROFILE%\.stodia\license-private.pem (ver scripts/license/README.md).
 * `pnpm license:keygen` reescribe la línea LICENSE_PUBLIC_KEY_B64.
 */
export const LICENSE_PUBLIC_KEY_B64 = 'MCowBQYDK2VwAyEAvNQ4y3i7dDMx7mnwKMMfjo3MU8fEDyhUikIllOZindw=';

/** LICENSE_PUBLIC_KEY (env) solo se respeta fuera de producción: es para pruebas. */
export const licensePublicKey = () => (process.env.NODE_ENV !== 'production' && process.env.LICENSE_PUBLIC_KEY?.trim()) || LICENSE_PUBLIC_KEY_B64;
