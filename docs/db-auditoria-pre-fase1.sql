/* =====================================================================================
   STODIA - Auditoria de referencias logicas (SOLO LECTURA: no hay INSERT/UPDATE/DELETE sobre tablas de negocio;
   unicamente tablas temporales #...). Base: stodia (SQL Server, collation Modern_Spanish_CI_AI).

   Ejecutar:  sqlcmd -S tcp:localhost,1433 -E -C -d stodia -f 65001 -i docs\db-auditoria.sql -W -s"|" -y 0

   Columnas del resultado (#r):
     total      = filas hijas evaluadas (una por ocurrencia; en JSON/CSV, una por elemento)
     huerfanos  = valores NO vacios que no existen en el padre (comparacion CI_AI, la de la BD)
     vacios     = NULL o '' (o solo espacios) usados como 'sin valor'
     dif_exacta = existen en el padre SOLO ignorando mayuscula/acento (no coinciden byte a byte, BIN2)
     con_esp    = valores con espacios al inicio/fin
     ejemplos   = hasta 5 valores huerfanos distintos
   ===================================================================================== */
SET NOCOUNT ON;
USE stodia;
GO
IF OBJECT_ID('tempdb..#r') IS NOT NULL DROP TABLE #r;
IF OBJECT_ID('tempdb..#d') IS NOT NULL DROP TABLE #d;
IF OBJECT_ID('tempdb..#c') IS NOT NULL DROP TABLE #c;
IF OBJECT_ID('tempdb..#chk') IS NOT NULL DROP PROCEDURE #chk;
CREATE TABLE #r(n INT IDENTITY, grupo NVARCHAR(12), ref NVARCHAR(160), total INT, huerfanos INT, vacios INT, dif_exacta INT, con_esp INT, ejemplos NVARCHAR(400));
CREATE TABLE #d(n INT IDENTITY, clave_candidata NVARCHAR(130), filas INT, grupos_duplicados INT, filas_en_duplicados INT, ejemplos NVARCHAR(400));
-- Catalogo desnormalizado: tipo, id sin prefijo 'tipo:', estado y JSON
SELECT tipo COLLATE DATABASE_DEFAULT AS tipo, CAST(SUBSTRING(id, CHARINDEX(':', id) + 1, 100) AS NVARCHAR(100)) AS cid, estado, CAST(data AS NVARCHAR(MAX)) COLLATE DATABASE_DEFAULT AS d INTO #c FROM Catalogo;
GO
-- Procedimiento de comprobacion: @hijo y @padre son SELECT que devuelven una columna v (NVARCHAR)
CREATE PROCEDURE #chk @grupo NVARCHAR(12), @ref NVARCHAR(160), @hijo NVARCHAR(MAX), @padre NVARCHAR(MAX) AS
BEGIN
  DECLARE @s NVARCHAR(MAX) = N';WITH h AS (' + @hijo + N'), p AS (' + @padre + N')
  INSERT #r(grupo, ref, total, huerfanos, vacios, dif_exacta, con_esp, ejemplos)
  SELECT @grupo, @ref, (SELECT COUNT(*) FROM h),
    (SELECT COUNT(*) FROM h WHERE NULLIF(LTRIM(RTRIM(v)), N'''') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM p WHERE p.v = h.v)),
    (SELECT COUNT(*) FROM h WHERE NULLIF(LTRIM(RTRIM(v)), N'''') IS NULL),
    (SELECT COUNT(*) FROM h WHERE EXISTS (SELECT 1 FROM p WHERE p.v = h.v) AND NOT EXISTS (SELECT 1 FROM p WHERE p.v COLLATE Latin1_General_BIN2 = h.v COLLATE Latin1_General_BIN2)),
    (SELECT COUNT(*) FROM h WHERE v IS NOT NULL AND DATALENGTH(v) <> DATALENGTH(LTRIM(RTRIM(v)))),
    (SELECT STRING_AGG(CAST(x AS NVARCHAR(MAX)), N'', '') FROM (SELECT DISTINCT TOP 5 v AS x FROM h WHERE NULLIF(LTRIM(RTRIM(v)), N'''') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM p WHERE p.v = h.v)) e)';
  EXEC sp_executesql @s, N'@grupo NVARCHAR(12), @ref NVARCHAR(160)', @grupo, @ref;
END
GO

/* ------------------------- A. FK REALES (deben dar 0 huerfanos) ------------------------- */
EXEC #chk 'A-FK real', N'AcadAsistencia.rosterId -> AcadRoster.id', N'SELECT CAST(rosterId AS NVARCHAR(400)) v FROM AcadAsistencia', N'SELECT CAST(id AS NVARCHAR(400)) v FROM AcadRoster';
EXEC #chk 'A-FK real', N'AcadNota.rosterId -> AcadRoster.id', N'SELECT CAST(rosterId AS NVARCHAR(400)) v FROM AcadNota', N'SELECT CAST(id AS NVARCHAR(400)) v FROM AcadRoster';
EXEC #chk 'A-FK real', N'AcadRoster.alumnoId -> Alumno.id (opcional)', N'SELECT CAST(alumnoId AS NVARCHAR(400)) v FROM AcadRoster', N'SELECT CAST(id AS NVARCHAR(400)) v FROM Alumno';
EXEC #chk 'A-FK real', N'Alumno.tutorId -> Tutor.id (opcional)', N'SELECT CAST(tutorId AS NVARCHAR(400)) v FROM Alumno', N'SELECT CAST(id AS NVARCHAR(400)) v FROM Tutor';

/* ------------------------- B. Referencias a Alumno ------------------------- */
DECLARE @pa NVARCHAR(MAX) = N'SELECT CAST(id AS NVARCHAR(400)) v FROM Alumno';
EXEC #chk 'B-Alumno', N'MobCargo.alumnoId -> Alumno.id (DEPRECADA)', N'SELECT CAST(alumnoId AS NVARCHAR(400)) v FROM MobCargo', @pa;
EXEC #chk 'B-Alumno', N'MobNota.alumnoId -> Alumno.id', N'SELECT CAST(alumnoId AS NVARCHAR(400)) v FROM MobNota', @pa;
EXEC #chk 'B-Alumno', N'MobWallet.alumnoId -> Alumno.id (1:1, PK)', N'SELECT CAST(alumnoId AS NVARCHAR(400)) v FROM MobWallet', @pa;
EXEC #chk 'B-Alumno', N'MobAcceso.alumnoId -> Alumno.id', N'SELECT CAST(alumnoId AS NVARCHAR(400)) v FROM MobAcceso', @pa;
EXEC #chk 'B-Alumno', N'MobAsistencia.alumnoId -> Alumno.id (paralela a AcadAsistencia)', N'SELECT CAST(alumnoId AS NVARCHAR(400)) v FROM MobAsistencia', @pa;
EXEC #chk 'B-Alumno', N'MobPagoIntencion.alumnoId -> Alumno.id', N'SELECT CAST(alumnoId AS NVARCHAR(400)) v FROM MobPagoIntencion', @pa;
EXEC #chk 'B-Alumno', N'PersExpediente.alumnoId -> Alumno.id (1:1, PK)', N'SELECT CAST(alumnoId AS NVARCHAR(400)) v FROM PersExpediente', @pa;
EXEC #chk 'B-Alumno', N'PersDocumento.alumnoId -> Alumno.id', N'SELECT CAST(alumnoId AS NVARCHAR(400)) v FROM PersDocumento', @pa;
EXEC #chk 'B-Alumno', N'PersServicio.alumnoId -> Alumno.id', N'SELECT CAST(alumnoId AS NVARCHAR(400)) v FROM PersServicio', @pa;
EXEC #chk 'B-Alumno', N'PersInscripcion.alumnoId -> Alumno.id', N'SELECT CAST(alumnoId AS NVARCHAR(400)) v FROM PersInscripcion', @pa;
-- FinCobroItem.kid: codigo corto del prototipo ('juan'/'sofia' = lib/personas.ts kidOf) o id de Alumno
EXEC #chk 'B-Alumno', N'FinCobroItem.kid (CRUDO) -> Alumno.id', N'SELECT CAST(kid AS NVARCHAR(400)) v FROM FinCobroItem', @pa;
EXEC #chk 'B-Alumno', N'FinCobroItem.kid (con kidOf juan->0412, sofia->0587) -> Alumno.id',
  N'SELECT CAST(CASE kid WHEN ''juan'' THEN ''0412'' WHEN ''sofia'' THEN ''0587'' ELSE kid END AS NVARCHAR(400)) v FROM FinCobroItem', @pa;
-- ComCarnet.code = 'EST-' + Alumno.id (no el Alumno.code 'EST-2026-0412'); comedor/index.ts alumnoIdDe()
EXEC #chk 'B-Alumno', N'ComCarnet.code -> Alumno.code (literal)', N'SELECT CAST(code AS NVARCHAR(400)) v FROM ComCarnet', N'SELECT CAST(code AS NVARCHAR(400)) v FROM Alumno';
EXEC #chk 'B-Alumno', N'ComCarnet.code sin "EST-" -> Alumno.id (regla alumnoIdDe)', N'SELECT CAST(REPLACE(code, ''EST-'', '''') AS NVARCHAR(400)) v FROM ComCarnet', @pa;
EXEC #chk 'B-Alumno', N'FinBeca.est (nombre completo) -> Alumno nombres+" "+apellidos',
  N'SELECT CAST(est AS NVARCHAR(400)) v FROM FinBeca', N'SELECT CAST(nombres + '' '' + apellidos AS NVARCHAR(400)) v FROM Alumno';

/* ------------------------- C. Referencias a Tutor / User ------------------------- */
EXEC #chk 'C-Tutor', N'FinCobroItem.tutorCed (solo digitos) -> Tutor.cedula (solo digitos)',
  N'SELECT CAST(REPLACE(tutorCed, ''-'', '''') AS NVARCHAR(400)) v FROM FinCobroItem', N'SELECT CAST(REPLACE(cedula, ''-'', '''') AS NVARCHAR(400)) v FROM Tutor';
EXEC #chk 'C-Tutor', N'FinRecibo.tutor (nombre) -> Tutor.nombre', N'SELECT CAST(tutor AS NVARCHAR(400)) v FROM FinRecibo', N'SELECT CAST(nombre AS NVARCHAR(400)) v FROM Tutor';
EXEC #chk 'C-Tutor', N'MobPagoIntencion.tutor (nombre) -> Tutor.nombre', N'SELECT CAST(tutor AS NVARCHAR(400)) v FROM MobPagoIntencion', N'SELECT CAST(nombre AS NVARCHAR(400)) v FROM Tutor';
EXEC #chk 'C-Tutor', N'CmnMensaje.to (nombre) -> Tutor.nombre', N'SELECT CAST([to] AS NVARCHAR(400)) v FROM CmnMensaje', N'SELECT CAST(nombre AS NVARCHAR(400)) v FROM Tutor';
EXEC #chk 'C-Tutor', N'PersExpediente.data.tutorLegalId (JSON) -> Tutor.id', N'SELECT CAST(JSON_VALUE(data, ''$.tutorLegalId'') AS NVARCHAR(400)) v FROM PersExpediente', N'SELECT CAST(id AS NVARCHAR(400)) v FROM Tutor';
EXEC #chk 'C-User', N'Tutor.usuario -> User.usuario (opcional)', N'SELECT CAST(usuario AS NVARCHAR(400)) v FROM Tutor', N'SELECT CAST(usuario AS NVARCHAR(400)) v FROM [User]';
EXEC #chk 'C-User', N'Catalogo docentes.usuario -> User.usuario', N'SELECT CAST(JSON_VALUE(d, ''$.usuario'') AS NVARCHAR(400)) v FROM #c WHERE tipo=''docentes''', N'SELECT CAST(usuario AS NVARCHAR(400)) v FROM [User]';
EXEC #chk 'C-User', N'Catalogo staff.usuario -> User.usuario', N'SELECT CAST(JSON_VALUE(d, ''$.usuario'') AS NVARCHAR(400)) v FROM #c WHERE tipo=''staff''', N'SELECT CAST(usuario AS NVARCHAR(400)) v FROM [User]';
EXEC #chk 'C-User', N'SisAudit.usr -> User.usuario', N'SELECT CAST(usr AS NVARCHAR(400)) v FROM SisAudit', N'SELECT CAST(usuario AS NVARCHAR(400)) v FROM [User]';
EXEC #chk 'C-User', N'CmnMensaje.by -> User.usuario', N'SELECT CAST([by] AS NVARCHAR(400)) v FROM CmnMensaje', N'SELECT CAST(usuario AS NVARCHAR(400)) v FROM [User]';
EXEC #chk 'C-User', N'DocFolio.emitidoPor ('''' por defecto) -> User.usuario', N'SELECT CAST(emitidoPor AS NVARCHAR(400)) v FROM DocFolio', N'SELECT CAST(usuario AS NVARCHAR(400)) v FROM [User]';
EXEC #chk 'C-User', N'MobPagoIntencion.resueltoPor ('''' por defecto) -> User.usuario', N'SELECT CAST(resueltoPor AS NVARCHAR(400)) v FROM MobPagoIntencion', N'SELECT CAST(usuario AS NVARCHAR(400)) v FROM [User]';

/* ------------------------- D. Catalogo -> Catalogo (JSON) ------------------------- */
DECLARE @g NVARCHAR(MAX) = N'SELECT cid v FROM #c WHERE tipo=''grados''';
EXEC #chk 'D-Catalogo', N'secciones.grado -> grados.id', N'SELECT CAST(JSON_VALUE(d,''$.grado'') AS NVARCHAR(400)) v FROM #c WHERE tipo=''secciones''', @g;
EXEC #chk 'D-Catalogo', N'secciones.tanda -> tandas.id', N'SELECT CAST(JSON_VALUE(d,''$.tanda'') AS NVARCHAR(400)) v FROM #c WHERE tipo=''secciones''', N'SELECT cid v FROM #c WHERE tipo=''tandas''';
EXEC #chk 'D-Catalogo', N'secciones.aula (opcional) -> aulas.id', N'SELECT CAST(JSON_VALUE(d,''$.aula'') AS NVARCHAR(400)) v FROM #c WHERE tipo=''secciones''', N'SELECT cid v FROM #c WHERE tipo=''aulas''';
EXEC #chk 'D-Catalogo', N'materias.grados[] (N:M) -> grados.id', N'SELECT CAST(j.value AS NVARCHAR(400)) v FROM #c CROSS APPLY OPENJSON(d,''$.grados'') j WHERE tipo=''materias''', @g;
EXEC #chk 'D-Catalogo', N'rubricas.materias[] (N:M) -> materias.id', N'SELECT CAST(j.value AS NVARCHAR(400)) v FROM #c CROSS APPLY OPENJSON(d,''$.materias'') j WHERE tipo=''rubricas''', N'SELECT cid v FROM #c WHERE tipo=''materias''';
EXEC #chk 'D-Catalogo', N'docentes.materias[] (N:M) -> materias.id', N'SELECT CAST(j.value AS NVARCHAR(400)) v FROM #c CROSS APPLY OPENJSON(d,''$.materias'') j WHERE tipo=''docentes''', N'SELECT cid v FROM #c WHERE tipo=''materias''';
EXEC #chk 'D-Catalogo', N'docentes.secciones[] (N:M) -> secciones.id', N'SELECT CAST(j.value AS NVARCHAR(400)) v FROM #c CROSS APPLY OPENJSON(d,''$.secciones'') j WHERE tipo=''docentes''', N'SELECT cid v FROM #c WHERE tipo=''secciones''';
EXEC #chk 'D-Catalogo', N'staff.caja (opcional) -> cajas.id', N'SELECT CAST(JSON_VALUE(d,''$.caja'') AS NVARCHAR(400)) v FROM #c WHERE tipo=''staff''', N'SELECT cid v FROM #c WHERE tipo=''cajas''';

/* ------------------------- E. Academico -> Catalogo ------------------------- */
DECLARE @sec NVARCHAR(MAX) = N'SELECT cid v FROM #c WHERE tipo=''secciones''', @mat NVARCHAR(MAX) = N'SELECT cid v FROM #c WHERE tipo=''materias''', @aul NVARCHAR(MAX) = N'SELECT cid v FROM #c WHERE tipo=''aulas''';
EXEC #chk 'E-Acad', N'AcadRoster.seccion -> secciones.id', N'SELECT CAST(seccion AS NVARCHAR(400)) v FROM AcadRoster', @sec;
EXEC #chk 'E-Acad', N'AcadNota.materia -> materias.id', N'SELECT CAST(materia AS NVARCHAR(400)) v FROM AcadNota', @mat;
EXEC #chk 'E-Acad', N'AcadAsignacion.docenteId -> docentes.id', N'SELECT CAST(docenteId AS NVARCHAR(400)) v FROM AcadAsignacion', N'SELECT cid v FROM #c WHERE tipo=''docentes''';
EXEC #chk 'E-Acad', N'AcadAsignacion.seccionId -> secciones.id', N'SELECT CAST(seccionId AS NVARCHAR(400)) v FROM AcadAsignacion', @sec;
EXEC #chk 'E-Acad', N'AcadAsignacion.materiaId -> materias.id', N'SELECT CAST(materiaId AS NVARCHAR(400)) v FROM AcadAsignacion', @mat;
EXEC #chk 'E-Acad', N'AcadAsignacion.aulas[] (JSON, N:M) -> aulas.id', N'SELECT CAST(j.value AS NVARCHAR(400)) v FROM AcadAsignacion CROSS APPLY OPENJSON(aulas) j', @aul;
EXEC #chk 'E-Acad', N'AcadHorario.seccion -> secciones.id', N'SELECT CAST(seccion AS NVARCHAR(400)) v FROM AcadHorario', @sec;
EXEC #chk 'E-Acad', N'AcadHorario.materia (slot normal) -> materias.id', N'SELECT CAST(materia AS NVARCHAR(400)) v FROM AcadHorario WHERE slot NOT LIKE ''\_%'' ESCAPE ''\''', @mat;
EXEC #chk 'E-Acad', N'AcadHorario.materia (slot "_aula:*": columna sobrecargada = id de AULA) -> aulas.id', N'SELECT CAST(materia AS NVARCHAR(400)) v FROM AcadHorario WHERE slot LIKE ''\_aula:%'' ESCAPE ''\''', @aul;
EXEC #chk 'E-Acad', N'AcadHorario slot "_aula:<materiaId>" (id embebido en el slot) -> materias.id', N'SELECT CAST(SUBSTRING(slot, 7, 100) AS NVARCHAR(400)) v FROM AcadHorario WHERE slot LIKE ''\_aula:%'' ESCAPE ''\''', @mat;
EXEC #chk 'E-Acad', N'PersCupo.seccion -> secciones.id (tabla sin uso)', N'SELECT CAST(seccion AS NVARCHAR(400)) v FROM PersCupo', @sec;
EXEC #chk 'E-Acad', N'MobAsistencia.seccion -> secciones.id', N'SELECT CAST(seccion AS NVARCHAR(400)) v FROM MobAsistencia', @sec;
EXEC #chk 'E-Acad', N'MobNota.materia (NOMBRE) -> materias.nombre', N'SELECT CAST(materia AS NVARCHAR(400)) v FROM MobNota', N'SELECT CAST(JSON_VALUE(d,''$.nombre'') AS NVARCHAR(400)) v FROM #c WHERE tipo=''materias''';

/* ------------------------- F. Alumno.grado/sec/tanda (TEXTO) y alergias ------------------------- */
EXEC #chk 'F-Alumno', N'Alumno.grado (texto) -> grados.grado', N'SELECT CAST(grado AS NVARCHAR(400)) v FROM Alumno', N'SELECT CAST(JSON_VALUE(d,''$.grado'') AS NVARCHAR(400)) v FROM #c WHERE tipo=''grados''';
EXEC #chk 'F-Alumno', N'Alumno.tanda (texto) -> tandas.nombre', N'SELECT CAST(tanda AS NVARCHAR(400)) v FROM Alumno', N'SELECT CAST(JSON_VALUE(d,''$.nombre'') AS NVARCHAR(400)) v FROM #c WHERE tipo=''tandas''';
EXEC #chk 'F-Alumno', N'Alumno (grado|sec|tanda) -> secciones (grado.grado|seccion|tanda.nombre)',
  N'SELECT CAST(grado + ''|'' + sec + ''|'' + tanda AS NVARCHAR(400)) v FROM Alumno',
  N'SELECT CAST(JSON_VALUE(g.d,''$.grado'') + ''|'' + JSON_VALUE(s.d,''$.seccion'') + ''|'' + JSON_VALUE(t.d,''$.nombre'') AS NVARCHAR(400)) v FROM #c s JOIN #c g ON g.tipo=''grados'' AND g.cid=JSON_VALUE(s.d,''$.grado'') JOIN #c t ON t.tipo=''tandas'' AND t.cid=JSON_VALUE(s.d,''$.tanda'') WHERE s.tipo=''secciones''';
EXEC #chk 'F-Alumno', N'Alumno.alg (CSV de nombres) -> alergias.nombre',
  N'SELECT CAST(LTRIM(RTRIM(value)) AS NVARCHAR(400)) v FROM Alumno CROSS APPLY STRING_SPLIT(alg, '','') WHERE alg <> ''''',
  N'SELECT CAST(JSON_VALUE(d,''$.nombre'') AS NVARCHAR(400)) v FROM #c WHERE tipo=''alergias''';
EXEC #chk 'F-Alumno', N'ComCarnet.allergies[] (JSON, MAYUSCULAS) -> alergias.nombre', N'SELECT CAST(j.value AS NVARCHAR(400)) v FROM ComCarnet CROSS APPLY OPENJSON(allergies) j', N'SELECT CAST(JSON_VALUE(d,''$.nombre'') AS NVARCHAR(400)) v FROM #c WHERE tipo=''alergias''';
EXEC #chk 'F-Alumno', N'AliMenu.algs[] (JSON) -> alergias.nombre', N'SELECT CAST(j.value AS NVARCHAR(400)) v FROM AliMenu CROSS APPLY OPENJSON(algs) j', N'SELECT CAST(JSON_VALUE(d,''$.nombre'') AS NVARCHAR(400)) v FROM #c WHERE tipo=''alergias''';

/* ------------------------- G. Finanzas ------------------------- */
EXEC #chk 'G-Fin', N'FinRecibo.pays[].m (JSON) -> metodosPago.nombre', N'SELECT CAST(JSON_VALUE(j.value,''$.m'') AS NVARCHAR(400)) v FROM FinRecibo CROSS APPLY OPENJSON(pays) j', N'SELECT CAST(JSON_VALUE(d,''$.nombre'') AS NVARCHAR(400)) v FROM #c WHERE tipo=''metodosPago''';
EXEC #chk 'G-Fin', N'FinRecibo.metodo (texto derivado Tarjeta/Mixto/..) -> metodosPago.nombre', N'SELECT CAST(metodo AS NVARCHAR(400)) v FROM FinRecibo', N'SELECT CAST(JSON_VALUE(d,''$.nombre'') AS NVARCHAR(400)) v FROM #c WHERE tipo=''metodosPago''';
EXEC #chk 'G-Fin', N'FinVenta.metodo -> metodosPago.nombre', N'SELECT CAST(metodo AS NVARCHAR(400)) v FROM FinVenta', N'SELECT CAST(JSON_VALUE(d,''$.nombre'') AS NVARCHAR(400)) v FROM #c WHERE tipo=''metodosPago''';
EXEC #chk 'G-Fin', N'FinRecibo.items[].con (JSON, sin id de cargo) -> FinCobroItem.con', N'SELECT CAST(JSON_VALUE(j.value,''$.con'') AS NVARCHAR(400)) v FROM FinRecibo CROSS APPLY OPENJSON(items) j', N'SELECT CAST(con AS NVARCHAR(400)) v FROM FinCobroItem';
EXEC #chk 'G-Fin', N'FinBeca.tipo -> Catalogo becas.nombre', N'SELECT CAST(tipo AS NVARCHAR(400)) v FROM FinBeca', N'SELECT CAST(JSON_VALUE(d,''$.nombre'') AS NVARCHAR(400)) v FROM #c WHERE tipo=''becas''';
EXEC #chk 'G-Fin', N'FinBeca.conceptos (texto separado por " · ") -> conceptosBeca.nombre',
  N'SELECT CAST(LTRIM(RTRIM(value)) AS NVARCHAR(400)) v FROM FinBeca CROSS APPLY STRING_SPLIT(REPLACE(conceptos, NCHAR(183), ''|''), ''|'')',
  N'SELECT CAST(JSON_VALUE(d,''$.nombre'') AS NVARCHAR(400)) v FROM #c WHERE tipo=''conceptosBeca''';
EXEC #chk 'G-Fin', N'FinBeca.grado (texto "5to A") -> Alumno.grado+" "+sec', N'SELECT CAST(grado AS NVARCHAR(400)) v FROM FinBeca', N'SELECT DISTINCT CAST(grado + '' '' + sec AS NVARCHAR(400)) v FROM Alumno';
EXEC #chk 'G-Fin', N'FinPlan.data.tm[tanda] (claves JSON = NOMBRE de tanda) -> tandas.nombre',
  N'SELECT CAST(j.[key] COLLATE DATABASE_DEFAULT AS NVARCHAR(400)) v FROM FinPlan CROSS APPLY OPENJSON(data,''$.tm'') j',
  N'SELECT CAST(JSON_VALUE(d,''$.nombre'') AS NVARCHAR(400)) v FROM #c WHERE tipo=''tandas''';
EXEC #chk 'G-Fin', N'PersExpediente.data.contrato.plan (JSON) -> FinPlan.id', N'SELECT CAST(JSON_VALUE(data,''$.contrato.plan'') AS NVARCHAR(400)) v FROM PersExpediente', N'SELECT CAST(id AS NVARCHAR(400)) v FROM FinPlan';
EXEC #chk 'G-Fin', N'PersInscripcion.plan -> FinPlan.id', N'SELECT CAST([plan] AS NVARCHAR(400)) v FROM PersInscripcion', N'SELECT CAST(id AS NVARCHAR(400)) v FROM FinPlan';
EXEC #chk 'G-Fin', N'PersExpediente.data.contrato.beca (JSON; "none"=sin beca) -> Catalogo becas.id', N'SELECT CAST(JSON_VALUE(data,''$.contrato.beca'') AS NVARCHAR(400)) v FROM PersExpediente', N'SELECT cid v FROM #c WHERE tipo=''becas''';
EXEC #chk 'G-Fin', N'PersServicio.recibo ('''' = sin recibo) -> FinRecibo.id', N'SELECT CAST(recibo AS NVARCHAR(400)) v FROM PersServicio', N'SELECT CAST(id AS NVARCHAR(400)) v FROM FinRecibo';
EXEC #chk 'G-Fin', N'MobPagoIntencion.reciboId ('''' = sin recibo) -> FinRecibo.id', N'SELECT CAST(reciboId AS NVARCHAR(400)) v FROM MobPagoIntencion', N'SELECT CAST(id AS NVARCHAR(400)) v FROM FinRecibo';
EXEC #chk 'G-Fin', N'MobPagoIntencion.detalle[] (JSON de ids) -> FinCobroItem.id', N'SELECT CAST(j.value AS NVARCHAR(400)) v FROM MobPagoIntencion CROSS APPLY OPENJSON(detalle) j', N'SELECT CAST(id AS NVARCHAR(400)) v FROM FinCobroItem';
EXEC #chk 'G-Fin', N'FinMovimiento.ref -> FinVenta.id (Salida) / "ENT-nnnn" (Entrada, sin tabla)', N'SELECT CAST(ref AS NVARCHAR(400)) v FROM FinMovimiento', N'SELECT CAST(id AS NVARCHAR(400)) v FROM FinVenta';
EXEC #chk 'G-Fin', N'FinMovimiento.name -> FinProducto.name', N'SELECT CAST(name AS NVARCHAR(400)) v FROM FinMovimiento', N'SELECT CAST(name AS NVARCHAR(400)) v FROM FinProducto';
-- Servicios: FinCobroItem.id = PersServicio.id + '-' + mes (prefijo de id; expediente/index.ts baja y borrado)
EXEC #chk 'G-Fin', N'FinCobroItem.id "psv-*" (prefijo antes del ultimo "-") -> PersServicio.id',
  N'SELECT CAST(LEFT(id, LEN(id) - CHARINDEX(''-'', REVERSE(id))) AS NVARCHAR(400)) v FROM FinCobroItem WHERE id LIKE ''psv-%''', N'SELECT CAST(id AS NVARCHAR(400)) v FROM PersServicio';
EXEC #chk 'G-Fin', N'PersServicio.catKey (rt:/ali:/ext:/prd: o heredada) -> rutas/AliPlan/AcadExtra/FinProducto',
  N'SELECT CAST(catKey AS NVARCHAR(400)) v FROM PersServicio',
  N'SELECT CAST(''rt:'' + cid AS NVARCHAR(400)) v FROM #c WHERE tipo=''rutas'' UNION ALL SELECT CAST(''ali:'' + id AS NVARCHAR(400)) FROM AliPlan UNION ALL SELECT CAST(''ext:'' + id AS NVARCHAR(400)) FROM AcadExtra UNION ALL SELECT CAST(''prd:'' + id AS NVARCHAR(400)) FROM FinProducto';

/* ------------------------- H. Alimentacion / comedor ------------------------- */
EXEC #chk 'H-Ali', N'ComCarnet.plan (texto) -> AliPlan.name', N'SELECT CAST([plan] AS NVARCHAR(400)) v FROM ComCarnet', N'SELECT CAST(name AS NVARCHAR(400)) v FROM AliPlan';
EXEC #chk 'H-Ali', N'PersExpediente.data.medico.planAlim (texto) -> AliPlan.name', N'SELECT CAST(JSON_VALUE(data,''$.medico.planAlim'') AS NVARCHAR(400)) v FROM PersExpediente', N'SELECT CAST(name AS NVARCHAR(400)) v FROM AliPlan';

/* =========================== RESULTADO: referencias =========================== */
SELECT n, grupo, ref, total, huerfanos, vacios, dif_exacta, con_esp, ejemplos FROM #r ORDER BY n;
SELECT COUNT(*) AS referencias_evaluadas, SUM(CASE WHEN huerfanos > 0 THEN 1 ELSE 0 END) AS con_huerfanos, SUM(huerfanos) AS huerfanos_totales, SUM(vacios) AS vacios_totales, SUM(dif_exacta) AS dif_exacta_total FROM #r;
GO

/* =========================== I. DUPLICADOS que impedirian un UNIQUE =========================== */
DECLARE @t TABLE(k NVARCHAR(130), v NVARCHAR(400));
INSERT @t SELECT N'Alumno.code', code FROM Alumno;
INSERT @t SELECT N'Tutor.cedula (solo digitos)', REPLACE(cedula,'-','') FROM Tutor;
INSERT @t SELECT N'Tutor.usuario (no nulo)', usuario FROM Tutor WHERE usuario IS NOT NULL;
INSERT @t SELECT N'Tutor.rnc (no nulo/vacio)', REPLACE(rnc,'-','') FROM Tutor WHERE NULLIF(rnc,'') IS NOT NULL;
INSERT @t SELECT N'Tutor.nombre (FinRecibo.tutor lo usa como llave)', nombre FROM Tutor;
INSERT @t SELECT N'Alumno nombres+apellidos (FinBeca.est lo usa como llave)', nombres + ' ' + apellidos FROM Alumno;
INSERT @t SELECT N'Alumno nombres+apellidos+fnac', nombres + '|' + apellidos + '|' + fnac FROM Alumno;
INSERT @t SELECT N'User.usuario', usuario FROM [User];
INSERT @t SELECT N'FinRecibo.ncf', ncf FROM FinRecibo;
INSERT @t SELECT N'FinVenta.ncf', ncf FROM FinVenta;
INSERT @t SELECT N'FinProducto.code', code FROM FinProducto;
INSERT @t SELECT N'FinPlan.name', name FROM FinPlan;
INSERT @t SELECT N'AliPlan.name', name FROM AliPlan;
INSERT @t SELECT N'PersInscripcion.alumnoId (1 inscripcion por alumno)', alumnoId FROM PersInscripcion;
INSERT @t SELECT N'PersInscripcion.ncf', ncf FROM PersInscripcion;
INSERT @t SELECT N'AcadRoster.alumnoId (no nulo)', alumnoId FROM AcadRoster WHERE alumnoId IS NOT NULL;
INSERT @t SELECT N'AcadRoster (seccion,nombre) legado sin alumno', seccion + '|' + nombre FROM AcadRoster WHERE alumnoId IS NULL;
INSERT @t SELECT N'PersExpediente carnet (no vacio)', JSON_VALUE(data,'$.carnet') FROM PersExpediente WHERE NULLIF(JSON_VALUE(data,'$.carnet'),'') IS NOT NULL;
INSERT @t SELECT N'Catalogo grados (nivel,grado)', JSON_VALUE(d,'$.nivel') + '|' + JSON_VALUE(d,'$.grado') FROM #c WHERE tipo='grados';
INSERT @t SELECT N'Catalogo grados.grado SOLO (ambiguo entre niveles)', JSON_VALUE(d,'$.grado') FROM #c WHERE tipo='grados';
INSERT @t SELECT N'Catalogo grados.orden', JSON_VALUE(d,'$.orden') FROM #c WHERE tipo='grados';
INSERT @t SELECT N'Catalogo secciones (grado,seccion,tanda)', JSON_VALUE(d,'$.grado') + '|' + JSON_VALUE(d,'$.seccion') + '|' + JSON_VALUE(d,'$.tanda') FROM #c WHERE tipo='secciones';
INSERT @t SELECT N'Catalogo tandas.nombre', JSON_VALUE(d,'$.nombre') FROM #c WHERE tipo='tandas';
INSERT @t SELECT N'Catalogo materias.codigo', JSON_VALUE(d,'$.codigo') FROM #c WHERE tipo='materias';
INSERT @t SELECT N'Catalogo materias.nombre', JSON_VALUE(d,'$.nombre') FROM #c WHERE tipo='materias';
INSERT @t SELECT N'Catalogo rubricas.nombre', JSON_VALUE(d,'$.nombre') FROM #c WHERE tipo='rubricas';
INSERT @t SELECT N'Catalogo docentes.cedula', JSON_VALUE(d,'$.cedula') FROM #c WHERE tipo='docentes';
INSERT @t SELECT N'Catalogo docentes.usuario', JSON_VALUE(d,'$.usuario') FROM #c WHERE tipo='docentes';
INSERT @t SELECT N'Catalogo staff.usuario', JSON_VALUE(d,'$.usuario') FROM #c WHERE tipo='staff';
INSERT @t SELECT N'Catalogo docentes+staff usuario (un User por persona)', JSON_VALUE(d,'$.usuario') FROM #c WHERE tipo IN ('docentes','staff');
INSERT @t SELECT N'Catalogo aulas.nombre', JSON_VALUE(d,'$.nombre') FROM #c WHERE tipo='aulas';
INSERT @t SELECT N'Catalogo cajas.codigo', JSON_VALUE(d,'$.codigo') FROM #c WHERE tipo='cajas';
INSERT @t SELECT N'Catalogo rutas.nombre', JSON_VALUE(d,'$.nombre') FROM #c WHERE tipo='rutas';
INSERT @t SELECT N'Catalogo rutas.ficha', JSON_VALUE(d,'$.ficha') FROM #c WHERE tipo='rutas';
INSERT @t SELECT N'Catalogo metodosPago.nombre', JSON_VALUE(d,'$.nombre') FROM #c WHERE tipo='metodosPago';
INSERT @t SELECT N'Catalogo becas.nombre', JSON_VALUE(d,'$.nombre') FROM #c WHERE tipo='becas';
INSERT @t SELECT N'Catalogo conceptosBeca.nombre', JSON_VALUE(d,'$.nombre') FROM #c WHERE tipo='conceptosBeca';
INSERT @t SELECT N'Catalogo comidas/dietas/alergias nombre (por tipo)', tipo + '|' + JSON_VALUE(d,'$.nombre') FROM #c WHERE tipo IN ('comidas','dietas','alergias');
INSERT #d(clave_candidata, filas, grupos_duplicados, filas_en_duplicados, ejemplos)
SELECT k, COUNT(*), COUNT(DISTINCT CASE WHEN c > 1 THEN v END), SUM(CASE WHEN c > 1 THEN 1 ELSE 0 END),
       (SELECT STRING_AGG(CAST(v2 AS NVARCHAR(MAX)), ', ') FROM (SELECT TOP 4 v AS v2 FROM @t t2 WHERE t2.k = a.k GROUP BY v HAVING COUNT(*) > 1) e)
FROM (SELECT k, v, COUNT(*) OVER (PARTITION BY k, v) AS c FROM @t) a GROUP BY k;
SELECT n, clave_candidata, filas, grupos_duplicados, filas_en_duplicados, ejemplos FROM #d ORDER BY n;
GO

/* =========================== J. CONTADORES DESNORMALIZADOS vs realidad =========================== */
SELECT N'FinPlan.alumnos vs expedientes con contrato.plan' AS control, p.id, p.alumnos AS guardado,
       (SELECT COUNT(*) FROM PersExpediente e WHERE JSON_VALUE(e.data,'$.contrato.plan') = p.id) AS real FROM FinPlan p;
SELECT N'AliPlan.inscritos vs ComCarnet.plan (por nombre)' AS control, a.id, a.inscritos AS guardado, (SELECT COUNT(*) FROM ComCarnet c WHERE c.[plan] = a.name) AS real FROM AliPlan a;
SELECT N'Catalogo secciones.insc vs Alumno activos (grado,sec,tanda)' AS control, s.cid, JSON_VALUE(s.d,'$.insc') AS guardado,
       (SELECT COUNT(*) FROM Alumno a JOIN #c g ON g.tipo='grados' AND g.cid=JSON_VALUE(s.d,'$.grado') JOIN #c t ON t.tipo='tandas' AND t.cid=JSON_VALUE(s.d,'$.tanda')
         WHERE a.grado=JSON_VALUE(g.d,'$.grado') AND a.sec=JSON_VALUE(s.d,'$.seccion') AND a.tanda=JSON_VALUE(t.d,'$.nombre') AND a.estado='Activo') AS real
FROM #c s WHERE s.tipo='secciones' ORDER BY s.cid;
-- AliPlan.meals/diets son arreglos booleanos POSICIONALES: su largo deberia igualar el # de comidas/dietas del catalogo
SELECT a.id, (SELECT COUNT(*) FROM OPENJSON(a.meals)) AS meals_len, (SELECT COUNT(*) FROM #c WHERE tipo='comidas') AS comidas_cat,
       (SELECT COUNT(*) FROM OPENJSON(a.diets)) AS diets_len, (SELECT COUNT(*) FROM #c WHERE tipo='dietas') AS dietas_cat FROM AliPlan a;
GO

/* =========================== K. Cobertura de personas (huecos 1:0..1) =========================== */
SELECT N'Alumno sin Tutor financiero' AS control, COUNT(*) AS n FROM Alumno WHERE tutorId IS NULL
UNION ALL SELECT N'Alumno sin PersExpediente', COUNT(*) FROM Alumno a WHERE NOT EXISTS (SELECT 1 FROM PersExpediente e WHERE e.alumnoId=a.id)
UNION ALL SELECT N'Alumno sin MobWallet', COUNT(*) FROM Alumno a WHERE NOT EXISTS (SELECT 1 FROM MobWallet w WHERE w.alumnoId=a.id)
UNION ALL SELECT N'Alumno sin AcadRoster', COUNT(*) FROM Alumno a WHERE NOT EXISTS (SELECT 1 FROM AcadRoster r WHERE r.alumnoId=a.id)
UNION ALL SELECT N'Alumno sin PersInscripcion', COUNT(*) FROM Alumno a WHERE NOT EXISTS (SELECT 1 FROM PersInscripcion i WHERE i.alumnoId=a.id)
UNION ALL SELECT N'Alumno sin ComCarnet (por EST-<id>)', COUNT(*) FROM Alumno a WHERE NOT EXISTS (SELECT 1 FROM ComCarnet c WHERE REPLACE(c.code,'EST-','')=a.id)
UNION ALL SELECT N'Tutor sin ningun Alumno financiero', COUNT(*) FROM Tutor t WHERE NOT EXISTS (SELECT 1 FROM Alumno a WHERE a.tutorId=t.id)
UNION ALL SELECT N'Tutor.usuario sin User', COUNT(*) FROM Tutor t WHERE t.usuario IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [User] u WHERE u.usuario=t.usuario)
UNION ALL SELECT N'User sin docente/staff/tutor asociado (por usuario)', COUNT(*) FROM [User] u WHERE NOT EXISTS (SELECT 1 FROM #c c WHERE c.tipo IN ('docentes','staff') AND JSON_VALUE(c.d,'$.usuario')=u.usuario) AND NOT EXISTS (SELECT 1 FROM Tutor t WHERE t.usuario=u.usuario)
UNION ALL SELECT N'Expedientes con tutor legal (JSON) informado', COUNT(*) FROM PersExpediente WHERE NULLIF(JSON_VALUE(data,'$.tutorLegalId'),'') IS NOT NULL
UNION ALL SELECT N'Expedientes con tutor legal distinto del financiero', COUNT(*) FROM Alumno a JOIN PersExpediente e ON e.alumnoId=a.id WHERE NULLIF(JSON_VALUE(e.data,'$.tutorLegalId'),'') IS NOT NULL AND JSON_VALUE(e.data,'$.tutorLegalId') <> a.tutorId
UNION ALL SELECT N'FinCobroItem con tutorCed NULL', COUNT(*) FROM FinCobroItem WHERE tutorCed IS NULL
UNION ALL SELECT N'FinRecibo con items = []', COUNT(*) FROM FinRecibo WHERE items = '[]'
UNION ALL SELECT N'AcadRoster sin Alumno (nomina heredada)', COUNT(*) FROM AcadRoster WHERE alumnoId IS NULL;
GO
