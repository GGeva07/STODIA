# STODIA

Sistema escolar vendido como **una instancia por cliente**. Monorepo pnpm (Node >= 20, pnpm 9).

```
apps/web        React + Vite + TS + Tailwind + react-router (la API se configura en runtime)
apps/api        Fastify + TS + Prisma (SQL Server en desarrollo local · SQLite en el instalador/Docker de clientes)
apps/desktop    Electron mínimo (carga la URL web del cliente)
packages/shared Tipos TS compartidos (solo tipos)
```

## Desarrollo

```bash
pnpm install
cp apps/api/.env.example apps/api/.env      # PowerShell: Copy-Item
pnpm dev:api        # http://localhost:3000  (db push + seed idempotente + watch)
pnpm dev:web        # http://localhost:5173  (lee public/config.json -> apiUrl)
pnpm typecheck && pnpm build
pnpm desktop        # Electron; STODIA_URL=http://localhost:5173 pnpm desktop
```

Usuarios sembrados (solo con `SEED_DEMO=true`, el modo dev; contraseña = `SEED_PASSWORD`, en dev `stodia123`): `usr_palmanzar` (Super Admin),
`usr_cvidal` (Director), `usr_ralmonte` (Docente), `usr_arosario` (Cajero), `usr_jtejada` (Comedor), `c.mendoza` (Tutor).

## Base de datos (SQL Server en desarrollo, SQLite en clientes)

Prisma admite **un solo provider por schema**, y STODIA se usa en dos escenarios, por lo que hay UNA fuente de verdad y dos motores:

| Escenario | Motor | Conexión (`DATABASE_URL`) |
|---|---|---|
| Desarrollo local en Windows (por defecto) | SQL Server (Express `SQLEXPRESS`) | `sqlserver://localhost:1433;database=stodia;integratedSecurity=true;trustServerCertificate=true` |
| Instalador / Docker / Linux de clientes | SQLite | `file:/data/stodia.db` (lo fija `docker-compose.yml`; sin cambios) |
| SQL Server en contenedor o en Linux | SQL Server con usuario | `sqlserver://host:1433;database=stodia;user=sa;password=...;trustServerCertificate=true` |

- `apps/api/prisma/schema.prisma` es la **fuente principal** y está escrita para SQL Server (`provider = "sqlserver"`, con atributos `@db.NVarChar(...)`).
- `apps/api/scripts/gen-schema.mjs` deriva el schema SQLite quitando los `@db.*`: `pnpm --filter @stodia/api db:schema:sqlite` escribe `prisma/schema.sqlite.prisma` (generado, ignorado por git).
  El Dockerfile de la API lo ejecuta con `--inplace` DENTRO de la imagen antes de `pnpm install`, así `prisma generate`/`db push` del contenedor siguen usando SQLite sin cambios en `docker-entrypoint.sh`.
- **Cambiar de motor en local**:
  - A SQL Server: `DATABASE_URL` de SQL Server en `apps/api/.env`, `pnpm --filter @stodia/api db:generate` y `pnpm --filter @stodia/api db:push`.
  - A SQLite: `DATABASE_URL="file:./dev.db"` en `.env`, `pnpm --filter @stodia/api db:generate:sqlite` y `pnpm --filter @stodia/api db:push:sqlite`. Para volver, `db:generate`.
  (Detén la API antes de generar: en Windows el motor de Prisma queda bloqueado mientras corre.)
- **Windows Authentication (`integratedSecurity=true`) solo funciona en Windows.** En Docker/Linux no aplica: usa `user=sa;password=...` (p. ej. un contenedor `mcr.microsoft.com/mssql/server`).
- **Requisitos de SQL Server local**: protocolo TCP/IP habilitado (Prisma no usa memoria compartida) y escuchando en el puerto **1433 fijo**
  (SQL Server Configuration Manager > Protocolos de SQLEXPRESS > TCP/IP > Direcciones IP > IPAll: `TCP Port = 1433`, `TCP Dynamic Ports` vacío; reiniciar el servicio con permisos de administrador).
  Si el puerto cambiara (puerto dinámico), consulta el actual con `Get-NetTCPConnection -OwningProcess (Get-Process sqlservr).Id -State Listen` y ajusta SOLO `DATABASE_URL` en `.env` (el puerto no está en el código).
  La base `stodia` debe existir (`CREATE DATABASE stodia COLLATE Modern_Spanish_CI_AI`); el esquema se aplica con `db:push` (no usa migraciones destructivas).
- **Diferencias a tener presentes**: la collation `Modern_Spanish_CI_AI` hace las comparaciones insensibles a mayúsculas y acentos (ids y unicidad incluidos);
  SQL Server no garantiza orden sin `ORDER BY` (`src/db.ts` ordena por clave primaria los `findMany` sin `orderBy` cuando el motor es SQL Server);
  `AcadRoster.alumnoId` y `Tutor.userId` (opcionales) no llevan `@unique`: su unicidad la dan índices únicos filtrados creados por `src/lib/db-indices.ts` al arrancar (funciona en ambos motores).
  No hay columnas `Json`, enums ni listas escalares: los datos JSON ya se guardan como texto (`NVarChar(Max)` en SQL Server), idénticos en ambos motores.
- **Migrar datos de SQLite a SQL Server**: `pnpm --filter @stodia/api db:migrar [ruta.db] [--reemplazar]` (por defecto `prisma/preview.db`; solo lectura sobre el origen; sin `--reemplazar` omite las tablas que ya tienen filas; con él vacía el destino primero). Informa conteo y checksum por tabla.

### Integridad referencial (Fases 1, 2A, 2B y 2C de `docs/db-relaciones.md`)

La base tiene **116 claves foráneas reales en 76 tablas** (85 tras la Fase 2B; 67 tras la 2A; 35 tras la Fase 1; 4 al inicio), 9 índices únicos filtrados y 8 CHECK, idénticas en SQL Server y SQLite (Prisma activa `foreign_keys=ON`). Todas apuntan al **id interno** (nunca al nombre, cédula o código):

- `onUpdate: NoAction` siempre. `onDelete: NoAction` (Prisma + SQL Server no admiten `Restrict`) para todo lo financiero, fiscal, académico y de auditoría: `FinCobroItem`, `FinRecibo`, `FinBeca`, `PersInscripcion`, `Contrato`, `ServicioAlumno`, `Monedero`, `AcadRoster/Nota/Asistencia`...
- `Cascade` solo en `PersExpediente`, `PersDocumento` y `MobNota` (respecto del Alumno) y en las líneas de una venta (`FinVentaItem`). `SetNull` en `Tutor.userId`, `CmnMensaje.tutorId` y `ComLectura.alumnoId`. El grafo de cascadas es un bosque (sin "multiple cascade paths").
- **Borrado lógico**: un alumno, tutor o catálogo con historial no se elimina, se desactiva (`estado`). Los endpoints de eliminar (Directorio, Tutores, Catálogos, Planes) comprueban el historial y responden **409 con un mensaje en español**; cualquier violación de FK que se escape (Prisma `P2003`/`P2002`) también se traduce a 409 (`src/app.ts`).
- Cambios de modelo: `FinCobroItem.kid`→`alumnoId` (id real de Alumno, ya no `juan/sofia`), `tutorCed`→`tutorId`, `Tutor.usuario`→`Tutor.userId`, `Tutor.cedula` se guarda **solo con dígitos** (UNIQUE; `fmtCed` la presenta con guiones, la búsqueda acepta ambos), contrato y tutor legal salen del JSON del expediente a `Contrato` y `Alumno.tutorLegalId`, `ComCarnet.code` = `Alumno.code` + FK `alumnoId` (el lector acepta también `EST-<id>`), recibos con `tutorId/cajaId/cajeroId` y líneas `{con, monto, cobroItemId}`. Contadores que divergían (`FinPlan.alumnos`, `AliPlan.inscritos`, `secciones.insc`) ahora **se calculan**. Eliminados `MobCargo`, `PersCupo`, `MobAsistencia`.
- Índices únicos filtrados (UNIQUE sobre columna NULLable): `UX_AcadRoster_alumnoId`, `UX_Tutor_userId` (`src/lib/db-indices.ts`). **`sqlcmd` debe ejecutarse con `-I`** (QUOTED_IDENTIFIER ON) para escribir en tablas con índices filtrados.
- **Fase 2C (cierre de la base)**: el **ciclo lectivo es una tabla** (`Ciclo` con un solo Activo, `PeriodoAcademico` con sus 4 períodos, `Matricula` = historial real del alumno por ciclo; `Alumno.seccionId` es la matrícula del ciclo activo) y todo lo que es por ciclo lleva `cicloId` (`Contrato`, `FinBeca`, `PersInscripcion`, `FinCobroItem`, `FinRecibo`, `AcadAsignacion`, `AcadHorario`, `AcadNota.periodoId`). Además: `TutorAlumno` (rol financiero/legal/académico con vigencia; un solo financiero vigente), `FinReciboItem`/`FinReciboPago` (reemplazan los JSON del recibo), `ServicioAlumno` (4 FK de catálogo con CHECK de una sola no nula), `Monedero` único con `MonederoMovimiento`, `FinPlanTanda`, `TipoDocumento`; la tabla `Catalogo` se eliminó. El instalador crea el ciclo del año en curso (o el de `CICLO_INICIO`/`CICLO_FIN`, `AAAA-MM-DD`). **Fase 2D**: el selector «Ciclo lectivo» de la barra lateral funciona (ver `docs/ciclo-lectivo.md`): la web envía la cabecera `X-Ciclo` (solo si el ciclo elegido no es el activo), Dashboard, Directorio, Expediente, Notas, Asistencia, Horarios, Cobros, Planes, Becas, Tutores y Comunicaciones muestran los datos de ese ciclo, y todo ciclo que no es el activo es **solo lectura** (la API responde `409 CICLO_CERRADO` a cualquier escritura por ciclo). Desde el ciclo activo se cobra la **deuda anterior** de ciclos cerrados. El cierre de ciclo (Configuración → Ciclos lectivos) promueve y crea las matrículas del ciclo siguiente sin perder historial.

**Fase 2B**: todos los catálogos restantes son tablas tipadas con los mismos ids (`Caja`, `RutaTransporte`, `TipoBeca`, `ConceptoBeca`, `MetodoPago`, `Comida`, `Dieta`, `Alergia`, `CategoriaProducto`) y las listas en texto/JSON/banderas son tablas puente con FK (`AlumnoAlergia`, `AliMenuAlergia`, `AliPlanComida`, `AliPlanDieta`, `FinBecaConcepto`). `Empleado.cajaId`, `FinRecibo.cajaId/metodoPagoId`, `FinVenta.metodoPagoId`, `FinBeca.tipoBecaId`, `Contrato.tipoBecaId`, `PersServicio.rutaId` y `FinProducto.categoriaId` son FK reales. La tabla `Catalogo` queda vacía (se elimina en la Fase 2C, junto con `Ciclo`, `FinReciboItem/Pago`, `TutorAlumno`, `ServicioAlumno` y `Monedero`). La API `/catalogos` y la web no cambian.

**Fase 2A (núcleo académico tipado)**: `Nivel`, `Grado`, `Tanda`, `Aula`, `Seccion` (única por grado+letra+tanda), `Materia`, `Rubrica` + `RubricaCriterio` (claves C1–C4/EX), `Docente` y `Empleado` (cada uno con `userId` opcional y único hacia `User`) y los puentes `MateriaGrado`, `SeccionMateria` (plan de estudios con horas), `DocenteMateria`, `DocenteSeccion`, `AsignacionAula`, `AcadExtraGrado`. Conservan los **mismos ids de texto** que tenían en `Catalogo` (`g6`, `s1`, `m1`, `d1`, `a1`...), que ya no guarda esos tipos. `Alumno.seccionId` (FK obligatoria) reemplaza el trío de texto `grado/sec/tanda` (ambiguo entre niveles: `1ro`..`6to` existen en Primaria y Secundaria); `grado/sec/tanda` se calculan de la sección y la API devuelve exactamente la misma forma (`GET /catalogos`, `/directorio`...). `AcadAsignacion`, `AcadHorario`, `AcadRoster`, `AcadNota`, `MobNota` y `AcadExtra` apuntan por FK a Docente/Seccion/Materia/Aula; las asignaciones que implica el perfil del docente (materias × secciones) quedan **materializadas** (`heredada = true`) y el aula elegida entre varias pasó de una fila `_aula:*` del horario a `AcadAsignacion.aulaElegidaId`. La capa de compatibilidad está en `src/lib/catalogos-tipados.ts` (+ `src/modules/catalogos`): validaciones, 409 amistosos con dependientes y borrado lógico (Activo/Inactivo).

**Auditar** (solo lectura, ambos motores; sale con código 1 si hay huérfanos o duplicados):
`pnpm --filter @stodia/api db:fk:auditar [--json]` — huérfanos de **todas** las FK del schema, `''` usados como "sin valor", duplicados que impedirían un UNIQUE, cédulas sin normalizar y las referencias lógicas a catálogos.

**Reparar / normalizar** (idempotente; nunca borra filas; sin `--aplicar` solo muestra el plan):
`pnpm --filter @stodia/api db:fk:reparar [-- --aplicar] [--crear-secciones]`

**Actualizar una base anterior a la Fase 1, 2A, 2B o 2C** (SQL Server o SQLite con datos reales; *expandir → rellenar → contraer*). Con la API detenida:
1. Respaldo (SQL Server: `BACKUP DATABASE stodia TO DISK=... WITH COPY_ONLY, CHECKSUM`; SQLite: copiar el `.db`).
2. `pnpm --filter @stodia/api db:fk:reparar -- --aplicar` — **expande** (agrega las columnas nuevas NULLables, quita los DEFAULT de las columnas obsoletas que bloquean `db push` en SQL Server) y **rellena** desde las columnas viejas (alias `juan/sofia`→id, `tutorCed`→`tutorId`, cédulas a dígitos, `'Tarjeta'`→nombre del catálogo, carnets a `Alumno.code`, alergias canónicas...).
3. `pnpm --filter @stodia/api db:fk:auditar` — revisa que no queden huérfanos/duplicados.
4. `pnpm --filter @stodia/api exec prisma db push --accept-data-loss` (SQLite: `--schema prisma/schema.sqlite.prisma` tras `db:schema:sqlite`) — **contrae**: crea FK/UNIQUE/NOT NULL y elimina las columnas heredadas, ya copiadas.
5. Otra vez `db:fk:reparar -- --aplicar` (rellena `Contrato` desde la ficha) y `db:fk:auditar` debe terminar en 0.
**Fase 2A** (núcleo académico): el mismo procedimiento con `db:fk:reparar -- --fase2a --aplicar` (o `--auto`): crea las tablas tipadas, copia `Catalogo` → tablas con los mismos ids, enlaza docentes/empleados con su `User` (por usuario o nombre), resuelve `Alumno.seccionId` por (grado, letra, tanda) **creando las secciones que faltan** si el grado y la tanda son inequívocos, y **no inventa**: lo ambiguo (p. ej. «3ro B Matutina» cuando `3ro` existe en dos niveles) se informa como `BLOQUEANTE` y detiene el `db push`; se resuelve a mano o con la decisión explícita `--nivel-por-defecto=Primaria` (en Docker: `STODIA_NIVEL_POR_DEFECTO`). Tras el `db push --accept-data-loss` se repite el comando y retira de `Catalogo` los tipos migrados. Las notas demostrativas del portal (`MobNota`) sin materia resoluble solo se descartan con `--descartar-mobnota` (implícito en `--auto`).

**Fase 2C** (cierre): `db:fk:reparar -- --fase2c --aplicar` (o `--auto`, que encadena 1 → 2A → 2B → 2C) → `prisma db push --accept-data-loss` → otra vez `--auto`. Crea los `Ciclo` desde `SisConfig ciclos`, rellena `cicloId`, `Matricula`, `TutorAlumno`, líneas y pagos de recibo, `ServicioAlumno` (las claves heredadas se resuelven por nombre; un servicio sin catálogo pasa a ser un producto), `Monedero`, y el `db push` elimina `Catalogo`, `PersServicio` y `MobWallet`. Lo ambiguo (ciclo con nombre inválido, más de un ciclo activo, medio de pago inexistente...) bloquea con código 3. Verifica con `db:fk:auditar` (0) o `docs/db-auditoria.sql`.

**Fase 2B** (resto de catálogos): `db:fk:reparar -- --fase2b --aplicar` (o `--auto`) → `prisma db push --accept-data-loss` → otra vez `--fase2b --aplicar` (retira los 8 tipos de `Catalogo`). Convierte `Alumno.alg`, `ComCarnet.allergies`, `AliMenu.algs`, las banderas de `AliPlan` y el texto de `FinBeca` en puentes con FK, y da de alta las alergias usadas que el catálogo no tenía; lo ambiguo se informa como BLOQUEANTE (exit 3 en `--auto`). `db:migrar` detecta orígenes anteriores a la 2B y se detiene.

En Docker (SQLite) el `docker-entrypoint.sh` hace todo esto solo (con copia `*.pre-migracion-*.bak` del `.db`). Lo que no se puede resolver con certeza (nombre de beneficiario ambiguo, carnet sin alumno, sección con grado repetido entre niveles) se informa y se deja intacto para revisión manual (`--crear-secciones` crea las secciones faltantes cuando el grado es inequívoco). Para migrar un SQLite a SQL Server, primero actualízalo así: `db:migrar` se detiene si el origen es anterior a la Fase 1 o a la Fase 2A.

**`prisma migrate` (preparado, no activado)**: el desarrollo sigue con `db push`. El DDL completo vigente para SQL Server está en `docs/db-baseline-sqlserver.sql` (se regenera con `pnpm --filter @stodia/api db:baseline`). Para adoptar migraciones en una base ya existente: `mkdir prisma/migrations/0_fase1` → guardar ahí ese SQL como `migration.sql` → `prisma migrate resolve --applied 0_fase1` (marca la línea base sin ejecutarla) → desde ahí `prisma migrate dev/deploy`. No se versiona `prisma/migrations/` todavía para no mezclar el flujo `db push` de los contenedores SQLite.

- **Datos de prueba de los catálogos maestros** (solo `SEED_DEMO=true`): `pnpm --filter @stodia/api seed:catalogos` (también lo ejecuta el seed). Es aditivo e idempotente y nunca modifica registros existentes.

### Comprobantes fiscales: NCF físicos y e-NCF (módulo fiscal)

Detalle, alcance y «A VALIDAR» en **[`docs/fiscal-ncf.md`](docs/fiscal-ncf.md)**. Resumen:

- **Tablas**: `TipoComprobante` (catálogo fijo B01…B17 / E31…E47), `SecuenciaFiscal` (autorizaciones DGII: rango, `actual` = último usado, vencimiento, umbral, estado, autorización) y `FinRecibo`
  con `tipoComprobanteId`, `secuenciaFiscalId`, `modalidad`, `clienteRnc/clienteNombre`, `estadoDgii`. Sustituye a `SisConfig 'ncf'` y a los contadores `ncf/b01/nc` (la forma `ConfigGlobal.ncf: CfgNcf[]` de la API se conserva).
- **Numeración**: `lib/fiscal.asignarNcf` consume el siguiente número con un `UPDATE … OUTPUT` (SQL Server) / `UPDATE … RETURNING` (SQLite) dentro de la transacción del documento: sin repetir ni saltar bajo concurrencia; usa la
  secuencia activa que vence antes; sin secuencia → 409 (nunca se emite sin NCF). Físico `B`+tipo+8 dígitos (11 caracteres), electrónico `E`+tipo+10 (13).
- **Cobros**: el POS elige Crédito fiscal / Consumo / Gubernamental / Régimen especial (el servidor decide B01/E31, B02/E32, B15/E45, B14/E44 según **Configuración › Gestión fiscal › Modalidad por tipo**) y pide RNC y razón social cuando corresponde.
- **Configuración › Gestión fiscal**: «Secuencias de comprobantes fiscales» (Físicos | Electrónicos), registrar autorización DGII (clave de supervisor), alertas de agotamiento y vencimiento en el Dashboard.
- **Electrónicos**: el sistema reserva y asigna el e-NCF y el recibo queda `PendienteEnvio`. El envío/firma a la DGII se integrará en la fase final (ver [`docs/integracion-ecf.md`](docs/integracion-ecf.md) y el checklist secuencial de certificación [`docs/certificacion-ecf-checklist.md`](docs/certificacion-ecf-checklist.md); fork interno del cliente DGII en `packages/dgii-ecf`, solo backend).
- **Notas de crédito / débito** (Cobros › «Notas de Crédito / Débito»): tablas `NotaFiscal`, `NotaFiscalLinea`, `NotaFiscalReembolso` y `MotivoNota` (+ `FinCobroItem.notaDebitoId`). La nota de crédito (B04/E34) devuelve dinero, reabre los cargos pagados y repone inventario del kiosko; la de débito (B03/E33) crea cargos nuevos que se cobran en el POS. PIN de supervisor siempre, idempotente, cuadre del turno y Dashboard netos. Anular un recibo ahora es una nota de crédito total. Migración aditiva: `fk-reparar --notas` (informe de anulaciones históricas con cargos aún pagados; `--reabrir-cargos` solo explícito). Detalle y «A VALIDAR» en [`docs/fiscal-ncf.md`](docs/fiscal-ncf.md) §12.
- **Instalación nueva**: no trae secuencias; registra tus autorizaciones DGII en Configuración › Gestión fiscal antes de cobrar. **Base existente**: `db:fk:reparar -- --fiscal --aplicar` → `db:push` → `--fiscal --aplicar` (aditivo, idempotente; `--auto` del contenedor lo hace solo).

## Docker

```bash
cp .env.example .env   # editar valores (o usar install.ps1 / install.sh)
docker compose up -d --build
```

- Web: `http://localhost:8080` · API: `http://localhost:3000/health`
- Datos SQLite en el volumen `stodia-data` (`/data/stodia.db`).
- El contenedor web genera `/config.json` al arrancar desde `API_URL`, `INSTITUTION_NAME` (la licencia ya no viaja al navegador):
  **la misma imagen sirve a cualquier cliente**. Con `API_URL=/api` la web usa el proxy nginx `/api/` -> `api:3000`.

## Instalación en un cliente

Requisitos: Docker con Compose v2 (opcional: Node 20 para validar la firma de la licencia antes de instalar).
El proveedor ejecuta `install.ps1` (Windows) o `sh install.sh` (Linux/macOS) en el equipo del cliente, desde la raíz del repo.

**Preguntas** (con valor por defecto y validación; mismo orden en ambos scripts): URL pública de la API `[http://localhost:3000]`
(o `/api` para servirla tras el proxy de la web), institución, RNC (9 u 11 dígitos; **se valida en la DGII**, ver más abajo), dirección, ciudad, teléfono, correo de contacto,
nombre y usuario del admin `[admin]`, **contraseña del admin** (oculta, dos veces, mín. 8; vacía = se genera), **PIN de supervisor**
(oculto, dos veces, 4–8 caracteres; vacío = 6 dígitos aleatorios), clave de licencia `STODIA1.*` (trae el plan; formato y, con Node, firma y vigencia),
puerto web `[8080]`, puerto de la API `[3000]`, **URL pública de la web** (origen CORS; por defecto `http://<host de la API>:<puerto web>`; se cambia si difiere),
zona horaria `[America/Santo_Domingo]`, moneda `[DOP]` y, opcional, **correo saliente** (`¿Configurar correo saliente ahora? (s/n) [n]`: servidor,
puerto `[587]`, usuario, contraseña oculta, remitente).

**Qué hace**: escribe `.env` (permisos 600; en Windows, ACL solo para el usuario actual; `JWT_SECRET` aleatorio, conservado al reinstalar;
`SEED_DEMO=false`), ejecuta `docker compose up -d --build`, espera `/health` y, si responde, **borra `ADMIN_PASSWORD` y `SUPERVISOR_PIN`
del `.env`** (el seed ya los consumió) y recrea solo el contenedor de la API para que tampoco queden en su entorno. Si `/health` no responde no los
borra y lo avisa: bórralos a mano (valores vacíos) y ejecuta `docker compose up -d`. El resumen final muestra la contraseña y el PIN
**solo si se generaron, una única vez**. Con `API_URL=/api` pone `TRUST_PROXY=true` y publica la API solo en `127.0.0.1`.

**Desatendido**: `powershell -ExecutionPolicy Bypass -File .\install.ps1 -Config respuestas.env` o `sh install.sh --config respuestas.env`
(claves = las de `.env.example`; las no indicadas toman su valor por defecto; contraseña/PIN vacíos se generan; un dato obligatorio
faltante o inválido aborta). Con comillas simples se admiten espacios y ` #` en los valores. El correo se configura solo si `SMTP_HOST` trae valor.
**Borra el archivo de respuestas al terminar** (contiene secretos; `respuestas*.env` está en `.gitignore`).

En el primer arranque el API (`src/seed-instalacion.ts`, idempotente, no pisa lo editado luego en la app) crea el Super Admin real (bcrypt),
el perfil de la institución (`SisConfig 'perfil'`), la clave de licencia (`licenciaClave`; plan, módulos, cuotas y vencimiento salen de su payload
firmado) y el PIN de supervisor (hash scrypt). Con `SEED_DEMO=false` no existen usuarios demo. `/config.json` de la web recibe `apiUrl` e `institutionName`.

#### Validación del RNC en la DGII (antes de crear nada)

Justo después de pedir el RNC, el instalador (ambos scripts) lo **normaliza** (quita guiones, puntos y espacios), valida el formato local (**9 dígitos** = empresa,
**11** = persona física/cédula; si no, rechaza sin llamar a la red) y lo consulta en la API de solo lectura `GET {base}/api/v1/rnc/{rnc}`
(cabecera `x-api-key`; timeout 10 s; un reintento solo ante error de red o 5xx). El estado se toma de `estatus` o de `regimen` (la API los trae desplazados):
basta que uno diga `ACTIVO` (sin distinguir mayúsculas); cualquier otro valor se trata como no activo.

| Respuesta | Interactivo | Desatendido (`-Config` / `--config`) | `RNC_VERIFICADO` |
|---|---|---|---|
| 200 y ACTIVO | Muestra `RNC verificado en la DGII: <razón social> (<comercial>) · ACTIVO` y pide `¿Es esta la institución? [S/n]` | Continúa | `true` |
| 200 y nombre de la institución distinto de la razón social/nombre comercial (tokens sin tildes ni SRL/SA/EIRL/«Colegio»/«Centro Educativo»; umbral 50 %) | AVISO (no bloquea) y ofrece usar la razón social oficial como nombre | AVISO y continúa | `true` |
| 200 y estado NO activo (SUSPENDIDO, CESE TEMPORAL, ANULADO…) | No continúa: corregir el RNC o escribir exactamente `FORZAR` | Aborta, **código 2** | `false` (si `FORZAR`) |
| 404 (no está en el padrón o formato inválido) | `RNC no encontrado en el padrón de la DGII`; vuelve a pedirlo (3 intentos; luego aborta o `FORZAR`) | Aborta, **código 2** | `false` (si `FORZAR`) |
| 401/403 (clave rechazada), 429, 5xx, timeout, red, JSON inválido | `No se pudo verificar el RNC (<motivo>)`: escribir `SI` para continuar sin verificar, Enter para reintentar | Aborta, **código 2** | `false` (si continúa) |

`RNC_VERIFICACION=omitir` (variable de entorno o clave del archivo de respuestas) permite continuar **sin verificar** en los casos no exitosos de la tabla
(estado no activo, 404, servicio caído) también en modo desatendido; el instalador igualmente intenta la consulta y, si responde ACTIVO, lo marca verificado.
Un formato inválido siempre aborta (código 1).

El instalador escribe en `.env` (nunca la API key): `RNC_VERIFICADO` (`true|false`), `RNC_RAZON_SOCIAL`, `RNC_NOMBRE_COMERCIAL`, `RNC_ESTADO`, `RNC_VERIFICADO_AT` (ISO UTC);
`docker-compose.yml` las pasa a la API y `seed-instalacion.ts` las vuelca al perfil (`razonSocial`, `nombreComercial`, `rncVerificado`, `rncVerificadoAt`, `rncEstado`).
Instalaciones antiguas (sin esas variables) no cambian. En Configuración › Institución el RNC muestra un indicador de solo lectura
(`Verificado en la DGII · <razón social> · <fecha>` o `RNC no verificado`); `PUT /config/perfil` ignora esos campos si vienen en el cuerpo (solo los fija el
instalador) y, si el RNC cambia, `rncVerificado` pasa a `false` y se limpian los datos de la verificación anterior.

**API key y rotación**: la clave de la API de solo lectura es una constante en `install.ps1` / `install.sh` (decisión aceptada: no es crítica). Para rotarla,
cambia esa constante en ambos scripts o define `STODIA_RNC_API_KEY` en el entorno del instalador. `STODIA_RNC_API_URL` cambia la URL base (pruebas con un servidor
falso) y `STODIA_RNC_TIMEOUT` los segundos de espera (10). La clave nunca se imprime ni se escribe en `.env`/logs (en Linux/macOS viaja por stdin a `curl -K -`,
no por la lista de procesos). Linux/macOS requiere `curl`; sin él la verificación cuenta como servicio no disponible. Con `node` presente se parsea el JSON con `JSON.parse`; sin él se usa un parser `sed` de respaldo.

**Privacidad (Ley 172-13)**: las respuestas de la DGII pueden incluir nombres de personas físicas. El instalador no los escribe en ningún log; solo van a la pantalla
de la instalación y al perfil de la instancia (`.env` y `SisConfig 'perfil'`), igual que el resto de datos de la institución.

### Variables de entorno (`.env`)

| Variable | Uso |
|---|---|
| `API_URL` | URL de la API vista por el navegador (`http://host:3000` o `/api`) |
| `INSTITUTION_NAME`, `TAX_ID`, `ADDRESS`, `CITY`, `PHONE`, `CONTACT_EMAIL` | Perfil inicial de la institución |
| `ADMIN_USER`, `ADMIN_NAME`, `ADMIN_PASSWORD` | Super Admin inicial (la contraseña solo el 1.er arranque; se borra) |
| `SUPERVISOR_PIN` | PIN de supervisor inicial (solo el 1.er arranque; luego se cambia en Configuración) |
| `LICENSE_KEY` | Licencia firmada `STODIA1.*` (obligatoria; el seed la exige al arrancar, no la borres) |
| `WEB_PORT`, `API_PORT`, `API_BIND` | Puertos publicados en el host; `API_BIND=127.0.0.1` con `/api` |
| `CORS_ORIGIN` | Origen(es) de la web permitidos (coma); la app móvil siempre se permite |
| `TRUST_PROXY` | `false` por defecto; `true` (o N saltos) solo si la API va tras el proxy nginx de la web (`API_URL=/api`) |
| `TIMEZONE`, `CURRENCY` | Zona horaria (también `TZ` del contenedor) y moneda |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Correo saliente (opcional) |
| `JWT_SECRET` | Aleatorio, obligatorio en producción |
| `SEED_DEMO` | `false` en producción (el compose lo fija) |
| `RNC_VERIFICADO`, `RNC_RAZON_SOCIAL`, `RNC_NOMBRE_COMERCIAL`, `RNC_ESTADO`, `RNC_VERIFICADO_AT` | Resultado de la verificación del RNC en la DGII (los escribe el instalador; el seed los vuelca al perfil) |
| `RNC_VERIFICACION` | Solo instalador/archivo de respuestas: `omitir` = continuar sin verificar si falla la verificación |
| `STODIA_RNC_API_KEY`, `STODIA_RNC_API_URL`, `STODIA_RNC_TIMEOUT` | Solo instalador: reemplazan la clave embebida, la URL base de la API de RNC y el timeout (10 s) |
| `STODIA_HEALTH_TIMEOUT` | Solo instalador: segundos de espera a `/health` (120) |

### Actualizar la versión sin perder datos

Los datos viven en el volumen `stodia-data` (`/data/stodia.db`), que no se toca al reconstruir.

```bash
sh ./backup.sh                 # 1) respaldo (Windows: .\backup.ps1)
git pull                       # 2) nueva versión (o copiar el release sobre la carpeta; conserva .env)
docker compose up -d --build   # 3) reconstruye; el arranque hace prisma db push + seed idempotente
curl http://localhost:3000/health
```

No uses `docker compose down -v` (borra el volumen). Reejecutar el instalador también es seguro: respalda el `.env` anterior (`.env.bak.*`),
conserva `JWT_SECRET` y el seed no pisa lo ya creado. Para revertir una actualización fallida, restaura el respaldo (abajo) con la versión anterior del código.

### Respaldos y restauración

- **Manual / programado**: `sh ./backup.sh` (Linux/macOS; cron) o `.\backup.ps1` (Windows; Programador de tareas). Copia consistente con `sqlite3 .backup`
  a `./backups/stodia-AAAAMMDD-HHMMSS.db` y rota a 14 días (`BACKUP_DAYS` / `-Days`). La API debe estar en marcha. Copia `backups/` periódicamente a otro disco/equipo.
- **Automático diario (opcional)**: `docker compose --profile backup up -d backup` guarda en el volumen (`/data/backups`, 14 días); extrae uno con
  `docker compose cp backup:/data/backups/<archivo> ./backups/`.
- **Restaurar** (la API se detiene un momento):

```bash
docker compose stop api
docker compose run --rm --no-deps -v "$PWD/backups:/b:ro" api sh -c 'cp /b/stodia-AAAAMMDD-HHMMSS.db /data/stodia.db && rm -f /data/stodia.db-journal /data/stodia.db-wal /data/stodia.db-shm'
docker compose up -d api
```

  (PowerShell: `-v "${PWD}/backups:/b:ro"`.) El admin vive en la BD restaurada, así que no hace falta `ADMIN_PASSWORD` en `.env`.

## Convenciones para portar pantallas

- **Pantalla web**: `apps/web/src/screens/<id>/index.tsx` (`export default`), donde `<id>` es el id de `NAV` en
  `apps/web/src/lib/access.ts`. Se registra sola (ruta `/<id>/*`, con guard RBAC según `ACCESS`). Sub-rutas internas con `<Routes>` propio.
  Archivos auxiliares de la pantalla van dentro de su carpeta; componentes reutilizables en `src/components/`.
- **Móvil**: `apps/web/src/mobile/` (`/m/tutor`, `/m/lista`).
- **HTTP**: solo `api` de `src/lib/api.ts` (`api.get/post/put/del`); nunca `fetch` ni URLs fijas.
- **Estilos**: Tailwind con tokens (`accent`, `ok/warn/bad/info/mute`, `font-mono`); íconos Phosphor `<i className="ph ph-xxx" />`.
- **Módulo de API**: crear `apps/api/src/modules/<nombre>/index.ts` con `export default` un `FastifyPluginAsync`
  (prefijo `/<nombre>`, o `export const prefix = '...'`). Se registra automáticamente; no se edita ningún archivo común.
  Rutas protegidas: `{ onRequest: [app.authenticate] }` (+ `app.requireRole('Super Admin')`). BD: `import { prisma } from '../../db'`.
- **Modelos Prisma**: agregar al final de `apps/api/prisma/schema.prisma` (único archivo común inevitable; agregar solo `model`s nuevos).
  Todos los catálogos son tablas tipadas con FK (Fases 2A y 2B, `src/lib/catalogos-tipados.ts`); la tabla genérica `Catalogo` se eliminó en la Fase 2C.
- **Tipos**: entidades en `packages/shared/src/index.ts`; importar con `import type { ... } from '@stodia/shared'`.
- Esquema BD: `prisma db push` (sin migraciones todavía; baseline y pasos de `prisma migrate` en «Integridad referencial»). Toda referencia a una entidad es una FK real: sigue las reglas de `onDelete` de esa sección.

## UI global y servicios de sistema

- `AppLayout` monta `UiProvider` (`components/system/UiProvider.tsx`): `const { toast, openGuard, setCommands } = useUi()` (o `useToast()`).
- `toast(msg, 'ok'|'bad'|'warn'|'info')`; `openGuard({ title, desc, code?, pin?, label, onOk })` = confirmación destructiva con texto/clave (demo 1234; Super Admin omite la clave).
- `<Modal onClose width>` es el cascarón de modales (overlay, Esc, clic fuera). Paleta Ctrl/Cmd+K: añadir ítems con `setCommands('mi-pantalla', [{ type, label, sub, icon, go }])`.
- `useLicense()` (`screenOn(id)`, `info`) expone plan/módulos; estilos comunes en `components/system/styles.ts`.
- API: `audit(user, 'Insert'|'Update'|'Delete', { tabla, id, prev, next, ip })` desde `apps/api/src/lib/audit.ts` (nunca lanza). Licencia: clave firmada Ed25519 `STODIA1.*` (SisConfig `licenciaClave` > env `LICENSE_KEY` > clave dev si `SEED_DEMO=true`); la API solo embebe la pública (`apps/api/src/lib/license-pubkey.ts`). El cliente solo puede pegar una clave nueva (`PUT /licencia/clave`); `PUT /licencia` responde 403. Sin licencia válida/vencida => 402 salvo `/auth` y `/licencia`. Emisión: `scripts/license/README.md`.

## Pendiente / notas

- Hay que generar y commitear `pnpm-lock.yaml` tras el primer `pnpm install`.
- PWA: solo manifest (sin service worker, sin iconos PNG).
