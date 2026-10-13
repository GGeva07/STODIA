# Borradores de formularios (`useDraft`)

Requisito: lo escrito en un formulario o campo debe conservarse al salir de la pantalla y volver (también al recargar).

## Hook

`apps/web/src/lib/useDraft.tsx`

```tsx
const [valor, setValor, limpiar, meta] = useDraft<T>(clave, inicial, opts?);
<AvisoBorrador meta={meta} />   // «Borrador restaurado · Descartar»
```

Misma firma que `useState` (`inicial` puede ser valor o función), más:

- `limpiar()` vuelve al valor inicial y borra el borrador.
- `meta`: `{ restaurado, obsoleto, descartar }` (para el aviso).
- `opts`: `omitir` (claves de primer nivel que no se guardan), `transformar` (saneado antes de guardar), `version` (esquema), `ttlMs` (24 h por defecto), `porCiclo` (false = la clave no incluye el ciclo), `firma` (huella de la entidad; si cambió, `meta.obsoleto`), `activo:false` (no guarda y borra), `pausado:true` (ni restaura ni guarda ni borra; p. ej. drawer en modo «ver»).
- `limpiarBorradores()` (cierre de sesión / otro usuario) y `limpiarPrefijo('inscripcion:')`.

## Almacenamiento y seguridad

- Solo `sessionStorage` (datos personales de alumnos y tutores: se borra al cerrar la pestaña). Nunca `localStorage`.
- Clave `stodia:draft:<usuario>:<ciclo|activo|->:<clave>`; valor `{ v, t, f?, d }` (versión, marca de tiempo, firma, datos). Un borrador con otra versión, vencido (TTL) o ilegible se descarta.
- Cada lectura/escritura va en `try/catch`: si el almacenamiento falla, el hook funciona como `useState`.
- Escritura con debounce de 300 ms, al desmontar y en `pagehide` (recarga/cierre). Si el valor es igual al inicial no se guarda nada (no hay «borrador»).

## Qué NO se guarda (nunca)

Contraseñas, PIN/clave de supervisor, tokens, contenido de archivos/imágenes (firmas, logos, adjuntos), números de tarjeta, el texto de confirmación de acciones destructivas (ELIMINAR-xxx / CERRAR-xxxx), resultados de búsquedas del servidor (solo el texto buscado), efectivo ya cobrado. Se aplica con `omitir`/`transformar` o dejando ese campo en un `useState` normal (p. ej. `clave` en `EditarAlumno`, `pass` SMTP, `pin` de la autorización DGII, `exoPin` y exoneración en POS, `recv` en Venta Rápida, campos `password` de Catálogos).

## Cuándo se limpia

| Evento | Acción |
|---|---|
| Guardar / emitir / enviar con éxito | `limpiar()` (en Inscripción `limpiarPrefijo` + `activo:false` hasta «Nueva inscripción») |
| «Cancelar», «Limpiar», «Nueva inscripción», «Descartar» | `limpiar()` |
| Cerrar sesión (y 401) | `limpiarBorradores()` desde `lib/session.tsx` |
| Entrar otro usuario | `limpiarBorradores(usuarioNuevo)` borra los ajenos; además la clave lleva el usuario |
| TTL 24 h / versión distinta | se descarta al leer |

## Criterio de modales y drawers (consistente en todas las pantallas)

- «×», clic en el fondo, Escape o navegar a otra pantalla **conservan** el borrador (queda en la clave del formulario y se restaura al reabrir, con el aviso «Borrador restaurado»).
- El botón **«Cancelar»** explícito **descarta** el borrador (`limpiar()`).
- Guardar con éxito descarta.
- Formularios cuyo estado es a la vez «abierto/cerrado» y datos (Asignar servicio, plan alimenticio): se separa un flag `oculto`; «×» solo oculta y el botón de abrir lo retoma.
- «Editar entidad X»: la clave incluye X (`tutor:<id>`, `plan:<id>`, `alumno-editar:<id>`...). Donde la entidad trae `updatedAt`/versión se puede pasar `firma` para marcar `meta.obsoleto`; hoy las entidades no exponen versión, así que no se compara (el usuario puede descartar).
- El modal de «Nuevo ...» abierto se reabre solo al volver (Tutores, Planes, Becas, Catálogos); los de edición se restauran al pulsar Editar (su fila/PIN no se persisten).

## Cobertura

Con borrador: Inscripción (asistente completo), Tutores, Expediente (editar alumno, asignar servicio), Planes de pago (drawer), Becas (registrar, motivo aprobar/rechazar, filtro), Planes de alimentación (drawer y menú), Inventario (entrada de stock), Venta Rápida (carrito, comprador, método), POS/Cobros (búsqueda, cuenta, cargos, pagos en edición, comprobante, datos fiscales), Notas de crédito/débito (asistente), Comunicaciones (mensaje), Catálogos (alta/edición, sin contraseñas), Configuración (perfil, finanzas, canales sin contraseña SMTP, alta de autorización DGII sin PIN), Extracurriculares (drawer), Asistencia (marcas sin registrar), Notas (materia/periodo), Directorio, Auditoría (filtros).

Sin borrador (a propósito): Licencia (clave), Cambiar contraseña, PIN de supervisor, Firmas (archivos), Comedor (lector de carnet), Portal Tutor, Horarios (solo selección de lectura), modales de confirmación (baja de servicio, motivo de beca en Servicios, eliminar).
