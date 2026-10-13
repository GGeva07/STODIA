# Firmas en documentos

Imagen de firma por usuario firmante (Cajero, Director Académico, Docente), guardada en la BD (tabla `UserFirma`: `userId` PK/FK a `User` con borrado en cascada, `mime`, `data` varbinary, `updatedAt`, `updatedBy`). No se guarda en disco.

## API (módulo `apps/api/src/modules/firmas`)
| Endpoint | Quién | Qué |
|---|---|---|
| `GET /firmas` | Super Admin o rol con la pantalla `catalogos` en la matriz | Lista de firmantes activos con `tiene` |
| `GET /usuarios/:id/firma` | el propio usuario (`me` o su id/login) o quien administra usuarios | `{ dataUrl, mime, updatedAt }` o 404 |
| `PUT /usuarios/:id/firma` | igual | Body `{ imagen: 'data:image/...;base64,...' }` |
| `DELETE /usuarios/:id/firma` | igual | Quita la firma |
| `GET /documentos/firmas?cajero=&docente=&director=1` | cualquier usuario autenticado que no sea Tutor | Firmas (data URL) para imprimir; `null` si no hay |

Validación del PUT: PNG/JPG/WebP **por los primeros bytes** (no por extensión ni por el `data:` declarado), máx. 300 KB, máx. 1200 px de ancho (y de alto); solo usuarios con rol Cajero / Director Académico / Docente. Auditoría (`SisAudit`, tabla `UserFirma`) registra tipo, tamaño y bytes, nunca la imagen.

## Regla de selección de firmante
`apps/web/src/components/finanzas/firmas.ts` (`conFirmas`) decide por la **etiqueta de cada línea de firma** del documento (`PDoc.sign`):

| Etiqueta contiene | Firma quien… |
|---|---|
| «cajer» (Cajero/a, Firma del cajero, Emitido por (cajero)) | `doc.firmaDe.Cajero` (login o nombre de quien emitió: tirilla y notas lo fijan con `recibo.cajero`); si no, la sesión cuando es Cajero |
| «docente» | `doc.firmaDe.Docente` (docente del curso: sábana y boletines lo fijan con `m.docente`, se resuelve por la ficha Docente → cuenta); si no, la sesión cuando es Docente (p. ej. lista de asistencia) |
| «dirección» / «director» | el **Director Académico activo con firma cargada**, el primero por usuario (orden estable). No hay «director por documento» |
| otra (tutor, supervisor, coordinación, auditoría, administración) | nadie: línea en blanco |

- Un nombre ambiguo (dos cuentas iguales) no se adivina: sin firma.
- Sin firma cargada, o ante cualquier fallo de la consulta, el documento sale igual que antes (línea en blanco, sin error).
- La **tirilla** no tiene bloque de firmas: solo si la cajera tiene firma se añade la línea «Cajero/a» con su imagen.
- La imagen va como data URL en `PDoc.signImg` (paralelo a `sign`), encima de la línea, alto máx. 48 px, `object-fit: contain`; igual en vista previa y PDF (html2canvas). `runPrint`, `generarPdf` y `generarZipPorPagina` la resuelven solos.
- **Hash/folio de boletines**: la firma NO entra al hash canónico (`contenidoPagina` solo usa `sign`, las etiquetas); el folio sigue válido haya o no firma.

## Documentos sin firma por falta de dato o de bloque
Records de conducta (no existe documento), listados sin bloque `sign` (inventario, historial de recibos, tarifario, listado de alumnos) y tirillas de venta rápida cuando `cajero` no llega al documento. El Director no varía por documento.

## UI
Configuración › Firmas (lista por rol, vista previa, Cargar/Reemplazar/Quitar con modal de confirmación) y «Mi firma» en el menú de usuario para Cajero, Director Académico y Docente. Opción «Quitar fondo blanco» (canvas: el alfa sale de la luminosidad) y reducción automática a 1200 px.
