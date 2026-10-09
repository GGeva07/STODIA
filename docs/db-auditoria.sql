/* =====================================================================================
   STODIA - Auditoria de integridad referencial, version POSTERIOR A LA FASE 1 (SOLO LECTURA: unicamente tablas temporales #...).
   Base: stodia (SQL Server, collation Modern_Spanish_CI_AI). La version anterior (esquema sin FK) esta en docs/db-auditoria-pre-fase1.sql.

   Ejecutar:  sqlcmd -S tcp:localhost,1433 -E -C -d stodia -I -f 65001 -i docs\db-auditoria.sql -W -s"|" -y 0
   (el motor-agnostico equivalente, que tambien sirve en SQLite, es:  pnpm --filter @stodia/api db:fk:auditar)

   Secciones del resultado:
     A. TODAS las FK reales del esquema (35): huerfanos y '' usados como "sin valor". Debe dar 0.
     B. SEGUIMIENTO de los 273 datos rotos y los 4,196 casos de convencion/representacion del analisis original (docs/db-relaciones.md, 3.1).
     C. Referencias LOGICAS que siguen sin FK hasta la Fase 2 (catalogos y JSON).
     D. Duplicados que impiden/violarian un UNIQUE.   E. Contadores (ahora calculados).   F. Cobertura.   G. DBCC CHECKCONSTRAINTS.
   ===================================================================================== */
SET NOCOUNT ON;
USE stodia;
GO
IF OBJECT_ID('tempdb..#r') IS NOT NULL DROP TABLE #r;
IF OBJECT_ID('tempdb..#s') IS NOT NULL DROP TABLE #s;
IF OBJECT_ID('tempdb..#d') IS NOT NULL DROP TABLE #d;
IF OBJECT_ID('tempdb..#c') IS NOT NULL DROP TABLE #c;
IF OBJECT_ID('tempdb..#chk') IS NOT NULL DROP PROCEDURE #chk;
CREATE TABLE #r(n INT IDENTITY, grupo NVARCHAR(12), ref NVARCHAR(200), total INT, huerfanos INT, vacios INT, dif_exacta INT, con_esp INT, ejemplos NVARCHAR(400));
CREATE TABLE #s(n INT IDENTITY, tipo NVARCHAR(14), hallazgo NVARCHAR(140), antes INT, ahora INT, como NVARCHAR(160));
CREATE TABLE #d(n INT IDENTITY, clave_candidata NVARCHAR(130), filas INT, grupos_duplicados INT, ejemplos NVARCHAR(400));
SELECT tipo COLLATE DATABASE_DEFAULT AS tipo, CAST(SUBSTRING(id, CHARINDEX(':', id) + 1, 100) AS NVARCHAR(100)) AS cid, estado, CAST(data AS NVARCHAR(MAX)) COLLATE DATABASE_DEFAULT AS d INTO #c FROM Catalogo;
GO
CREATE PROCEDURE #chk @grupo NVARCHAR(12), @ref NVARCHAR(200), @hijo NVARCHAR(MAX), @padre NVARCHAR(MAX) AS
BEGIN
  DECLARE @s NVARCHAR(MAX) = N';WITH h AS (' + @hijo + N'), p AS (' + @padre + N')
  INSERT #r(grupo, ref, total, huerfanos, vacios, dif_exacta, con_esp, ejemplos)
  SELECT @grupo, @ref, (SELECT COUNT(*) FROM h),
    (SELECT COUNT(*) FROM h WHERE NULLIF(LTRIM(RTRIM(v)), N'''') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM p WHERE p.v = h.v)),
    (SELECT COUNT(*) FROM h WHERE NULLIF(LTRIM(RTRIM(v)), N'''') IS NULL),
    (SELECT COUNT(*) FROM h WHERE EXISTS (SELECT 1 FROM p WHERE p.v = h.v) AND NOT EXISTS (SELECT 1 FROM p WHERE p.v COLLATE Latin1_General_BIN2 = h.v COLLATE Latin1_General_BIN2)),
    (SELECT COUNT(*) FROM h WHERE v IS NOT NULL AND DATALENGTH(v) <> DATALENGTH(LTRIM(RTRIM(v)))),
    (SELECT STRING_AGG(CAST(x AS NVARCHAR(MAX)), N'', '') FROM (SELECT DISTINCT TOP 5 v AS x FROM h WHERE NULLIF(LTRIM(RTRIM(v)), N'''') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM p WHERE p.v = h.v)) e)';
  EXEC sp_executesql @s, N'@grupo NVARCHAR(12), @ref NVARCHAR(200)', @grupo, @ref;
END
GO

/* ------------------------- A. FK REALES: una comprobacion por cada FK del catalogo del sistema ------------------------- */
DECLARE @sql NVARCHAR(MAX) = N'';
SELECT @sql += N'INSERT #r(grupo, ref, total, huerfanos, vacios, dif_exacta, con_esp, ejemplos) SELECT N''A-FK real'', N''' + ref + N''',
  (SELECT COUNT(*) FROM dbo.' + QUOTENAME(h) + N'),
  (SELECT COUNT(*) FROM dbo.' + QUOTENAME(h) + N' c WHERE c.' + QUOTENAME(hc) + N' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.' + QUOTENAME(p) + N' x WHERE x.' + QUOTENAME(pc) + N' = c.' + QUOTENAME(hc) + N')),
  (SELECT COUNT(*) FROM dbo.' + QUOTENAME(h) + N' WHERE CAST(' + QUOTENAME(hc) + N' AS NVARCHAR(400)) = N''''), 0, 0, N''' + regla + N''';' + CHAR(10)
FROM (
  SELECT OBJECT_NAME(fk.parent_object_id) h, COL_NAME(fkc.parent_object_id, fkc.parent_column_id) hc, OBJECT_NAME(fk.referenced_object_id) p, COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) pc,
         OBJECT_NAME(fk.parent_object_id) + N'.' + COL_NAME(fkc.parent_object_id, fkc.parent_column_id) + N' -> ' + OBJECT_NAME(fk.referenced_object_id) + N'.' + COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) ref,
         N'ON DELETE ' + REPLACE(fk.delete_referential_action_desc, '_', ' ') regla
  FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id) f
ORDER BY h, hc;
EXEC sp_executesql @sql;
GO

/* ------------------------- B. SEGUIMIENTO de los 273 datos rotos y 4,196 de convencion (cifras "antes" = auditoria original) ------------------------- */
-- B1. DATOS ROTOS (273)
INSERT #s(tipo, hallazgo, antes, ahora, como) VALUES
 (N'ROTO', N'Alumno en seccion inexistente (grado|sec|tanda)', 3, (SELECT COUNT(*) FROM Alumno a WHERE NOT EXISTS (SELECT 1 FROM #c s JOIN #c g ON g.tipo=N'grados' AND g.cid=JSON_VALUE(s.d,'$.grado') JOIN #c t ON t.tipo=N'tandas' AND t.cid=JSON_VALUE(s.d,'$.tanda') WHERE s.tipo=N'secciones' AND JSON_VALUE(g.d,'$.grado')=a.grado AND JSON_VALUE(s.d,'$.seccion')=a.sec AND JSON_VALUE(t.d,'$.nombre')=a.tanda)), N'secciones s11 (3ro B Matutina) y s12 (4to C Matutina) en seed-academico'),
 (N'ROTO', N'MobNota.materia sin materia del catalogo', 2, (SELECT COUNT(*) FROM MobNota m WHERE NOT EXISTS (SELECT 1 FROM #c WHERE tipo=N'materias' AND JSON_VALUE(d,'$.nombre')=m.materia)), N'nombres exactos del catalogo en seed-movil'),
 (N'ROTO', N'Tutor.usuario inexistente en User', 3, (SELECT COUNT(*) FROM Tutor t WHERE t.userId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [User] u WHERE u.id=t.userId)), N'Tutor.userId es FK a User.id (NULL si no hay cuenta)'),
 (N'ROTO', N'Alumno.alg: alergia fuera del catalogo (exacta)', 29, (SELECT COUNT(*) FROM Alumno CROSS APPLY STRING_SPLIT(alg, ',') x WHERE alg<>'' AND NOT EXISTS (SELECT 1 FROM #c WHERE tipo=N'alergias' AND JSON_VALUE(d,'$.nombre') COLLATE Latin1_General_BIN2 = LTRIM(RTRIM(x.value)) COLLATE Latin1_General_BIN2)), N'Penicilina y Polen agregadas al catalogo; nombres canonicos'),
 (N'ROTO', N'ComCarnet.allergies: alergia fuera del catalogo (exacta)', 17, (SELECT COUNT(*) FROM ComCarnet CROSS APPLY OPENJSON(allergies) j WHERE NOT EXISTS (SELECT 1 FROM #c WHERE tipo=N'alergias' AND JSON_VALUE(d,'$.nombre') COLLATE Latin1_General_BIN2 = j.value COLLATE Latin1_General_BIN2)), N'se guardan nombres canonicos; el DTO los muestra en mayusculas'),
 (N'ROTO', N'FinRecibo.pays[].m fuera del catalogo metodosPago (p. ej. "Tarjeta")', 208, (SELECT COUNT(*) FROM FinRecibo CROSS APPLY OPENJSON(pays) j WHERE NOT EXISTS (SELECT 1 FROM #c WHERE tipo=N'metodosPago' AND JSON_VALUE(d,'$.nombre')=JSON_VALUE(j.value,'$.m'))), N'"Tarjeta de Credito" en seeds; metodo del recibo se deriva'),
 (N'ROTO', N'FinBeca.tipo fuera del catalogo becas', 3, (SELECT COUNT(*) FROM FinBeca b WHERE NOT EXISTS (SELECT 1 FROM #c WHERE tipo=N'becas' AND JSON_VALUE(d,'$.nombre')=b.tipo)), N'"Beca Academica", "Beca Plan Hermano" (nombres del catalogo)'),
 (N'ROTO', N'FinBeca.conceptos fuera del catalogo conceptosBeca', 4, (SELECT COUNT(*) FROM FinBeca CROSS APPLY STRING_SPLIT(REPLACE(conceptos, NCHAR(183), '|'), '|') x WHERE NOT EXISTS (SELECT 1 FROM #c WHERE tipo=N'conceptosBeca' AND JSON_VALUE(d,'$.nombre')=LTRIM(RTRIM(x.value)))), N'"Colegiatura" en lugar de "Solo colegiatura"'),
 (N'ROTO', N'PersServicio.recibo a un recibo inexistente', 2, (SELECT COUNT(*) FROM PersServicio s WHERE s.reciboId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM FinRecibo r WHERE r.id=s.reciboId)), N'PersServicio.reciboId FK a FinRecibo; REC-0389 existe'),
 (N'ROTO', N'FinMovimiento.ref a una venta inexistente', 2, (SELECT COUNT(*) FROM FinMovimiento m WHERE m.ventaId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM FinVenta v WHERE v.id=m.ventaId)), N'FinMovimiento.ventaId FK a FinVenta (NULL en entradas/ventas previas)');
-- B2. CONVENCION / REPRESENTACION (4,196)
INSERT #s(tipo, hallazgo, antes, ahora, como) VALUES
 (N'CONVENCION', N'FinCobroItem.kid con alias juan/sofia', 9, (SELECT COUNT(*) FROM FinCobroItem f WHERE NOT EXISTS (SELECT 1 FROM Alumno a WHERE a.id=f.alumnoId)), N'FinCobroItem.alumnoId FK a Alumno.id'),
 (N'CONVENCION', N'ComCarnet.code distinto de Alumno.code (EST-<id> vs EST-2026-<id>)', 504, (SELECT COUNT(*) FROM ComCarnet c WHERE NOT EXISTS (SELECT 1 FROM Alumno a WHERE a.code=c.code)), N'code = Alumno.code y alumnoId FK unica'),
 (N'CONVENCION', N'CmnMensaje.by = usr_sistema (usuario inexistente)', 4, (SELECT COUNT(*) FROM CmnMensaje m WHERE m.userId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [User] u WHERE u.id=m.userId)), N'CmnMensaje.userId FK (NULL = sistema); by queda como instantanea'),
 (N'CONVENCION', N'FinRecibo.metodo derivado ("Tarjeta") fuera del catalogo', 208, 0, N'columna eliminada: el metodo se deriva de pays (lib/recibos.metodoDe)'),
 (N'CONVENCION', N'FinRecibo.items[] sin id de cargo (lineas)', 1382, (SELECT COUNT(*) FROM FinRecibo CROSS APPLY OPENJSON(items) j WHERE JSON_VALUE(j.value,'$.cobroItemId') IS NULL), N'las nuevas llevan cobroItemId; quedan las historicas sin cargo (reinscripcion, libros, meses cerrados)'),
 (N'CONVENCION', N'contrato.beca = "none" (centinela) en el JSON', 795, (SELECT COUNT(*) FROM Contrato c WHERE c.beca IS NOT NULL AND NOT EXISTS (SELECT 1 FROM #c WHERE tipo=N'becas' AND cid=c.beca)), N'Contrato.beca NULL = sin beca'),
 (N'CONVENCION', N'PersServicio.catKey heredada (com/fut/lib/sal/seg/uni0)', 289, (SELECT COUNT(*) FROM PersServicio s WHERE s.catKey NOT IN (SELECT N'rt:'+cid FROM #c WHERE tipo=N'rutas' UNION ALL SELECT N'ali:'+id FROM AliPlan UNION ALL SELECT N'ext:'+id FROM AcadExtra UNION ALL SELECT N'prd:'+id FROM FinProducto)), N'PENDIENTE Fase 2 (ServicioAlumno con 4 FK)'),
 (N'CONVENCION', N'ComCarnet.plan (etiqueta) sin AliPlan', 504, (SELECT COUNT(*) FROM ComCarnet c WHERE c.aliPlanId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM AliPlan p WHERE p.id=c.aliPlanId)), N'ComCarnet.aliPlanId FK a AliPlan; plan queda como etiqueta'),
 (N'CONVENCION', N'medico.planAlim (texto del JSON) sin AliPlan', 501, (SELECT COUNT(*) FROM PersExpediente e WHERE NULLIF(JSON_VALUE(e.data,'$.medico.planAlim'),'') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM AliPlan p WHERE p.name=JSON_VALUE(e.data,'$.medico.planAlim'))), N'PENDIENTE Fase 2 (texto libre de la ficha medica)');
SELECT n, tipo, hallazgo, antes, ahora, como FROM #s ORDER BY n;
SELECT tipo, SUM(antes) AS antes, SUM(ahora) AS ahora FROM #s GROUP BY tipo;
GO

/* ------------------------- C. Referencias LOGICAS que siguen sin FK (Fase 2) ------------------------- */
DECLARE @pa NVARCHAR(MAX) = N'SELECT CAST(id AS NVARCHAR(400)) v FROM Alumno';
DECLARE @g NVARCHAR(MAX) = N'SELECT cid v FROM #c WHERE tipo=''grados''';
DECLARE @sec NVARCHAR(MAX) = N'SELECT cid v FROM #c WHERE tipo=''secciones''', @mat NVARCHAR(MAX) = N'SELECT cid v FROM #c WHERE tipo=''materias''', @aul NVARCHAR(MAX) = N'SELECT cid v FROM #c WHERE tipo=''aulas''';
EXEC #chk 'C-Catalogo', N'secciones.grado -> grados.id', N'SELECT CAST(JSON_VALUE(d,''$.grado'') AS NVARCHAR(400)) v FROM #c WHERE tipo=''secciones''', @g;
EXEC #chk 'C-Catalogo', N'secciones.tanda -> tandas.id', N'SELECT CAST(JSON_VALUE(d,''$.tanda'') AS NVARCHAR(400)) v FROM #c WHERE tipo=''secciones''', N'SELECT cid v FROM #c WHERE tipo=''tandas''';
EXEC #chk 'C-Catalogo', N'secciones.aula (opcional) -> aulas.id', N'SELECT CAST(JSON_VALUE(d,''$.aula'') AS NVARCHAR(400)) v FROM #c WHERE tipo=''secciones''', @aul;
EXEC #chk 'C-Catalogo', N'materias.grados[] -> grados.id', N'SELECT CAST(j.value AS NVARCHAR(400)) v FROM #c CROSS APPLY OPENJSON(d,''$.grados'') j WHERE tipo=''materias''', @g;
EXEC #chk 'C-Catalogo', N'rubricas.materias[] -> materias.id', N'SELECT CAST(j.value AS NVARCHAR(400)) v FROM #c CROSS APPLY OPENJSON(d,''$.materias'') j WHERE tipo=''rubricas''', @mat;
EXEC #chk 'C-Catalogo', N'docentes.materias[] -> materias.id', N'SELECT CAST(j.value AS NVARCHAR(400)) v FROM #c CROSS APPLY OPENJSON(d,''$.materias'') j WHERE tipo=''docentes''', @mat;
EXEC #chk 'C-Catalogo', N'docentes.secciones[] -> secciones.id', N'SELECT CAST(j.value AS NVARCHAR(400)) v FROM #c CROSS APPLY OPENJSON(d,''$.secciones'') j WHERE tipo=''docentes''', @sec;
EXEC #chk 'C-Catalogo', N'staff.caja -> cajas.id', N'SELECT CAST(JSON_VALUE(d,''$.caja'') AS NVARCHAR(400)) v FROM #c WHERE tipo=''staff''', N'SELECT cid v FROM #c WHERE tipo=''cajas''';
EXEC #chk 'C-Catalogo', N'docentes.usuario -> User.usuario', N'SELECT CAST(JSON_VALUE(d, ''$.usuario'') AS NVARCHAR(400)) v FROM #c WHERE tipo=''docentes''', N'SELECT CAST(usuario AS NVARCHAR(400)) v FROM [User]';
EXEC #chk 'C-Catalogo', N'staff.usuario -> User.usuario', N'SELECT CAST(JSON_VALUE(d, ''$.usuario'') AS NVARCHAR(400)) v FROM #c WHERE tipo=''staff''', N'SELECT CAST(usuario AS NVARCHAR(400)) v FROM [User]';
EXEC #chk 'C-Acad', N'AcadRoster.seccion -> secciones.id', N'SELECT CAST(seccion AS NVARCHAR(400)) v FROM AcadRoster', @sec;
EXEC #chk 'C-Acad', N'AcadNota.materia -> materias.id', N'SELECT CAST(materia AS NVARCHAR(400)) v FROM AcadNota', @mat;
EXEC #chk 'C-Acad', N'AcadAsignacion.docenteId -> docentes.id', N'SELECT CAST(docenteId AS NVARCHAR(400)) v FROM AcadAsignacion', N'SELECT cid v FROM #c WHERE tipo=''docentes''';
EXEC #chk 'C-Acad', N'AcadAsignacion.seccionId -> secciones.id', N'SELECT CAST(seccionId AS NVARCHAR(400)) v FROM AcadAsignacion', @sec;
EXEC #chk 'C-Acad', N'AcadAsignacion.materiaId -> materias.id', N'SELECT CAST(materiaId AS NVARCHAR(400)) v FROM AcadAsignacion', @mat;
EXEC #chk 'C-Acad', N'AcadAsignacion.aulas[] -> aulas.id', N'SELECT CAST(j.value AS NVARCHAR(400)) v FROM AcadAsignacion CROSS APPLY OPENJSON(aulas) j', @aul;
EXEC #chk 'C-Acad', N'AcadHorario.seccion -> secciones.id', N'SELECT CAST(seccion AS NVARCHAR(400)) v FROM AcadHorario', @sec;
EXEC #chk 'C-Acad', N'AcadHorario.materia (slot normal) -> materias.id', N'SELECT CAST(materia AS NVARCHAR(400)) v FROM AcadHorario WHERE slot NOT LIKE ''\_%'' ESCAPE ''\''', @mat;
EXEC #chk 'C-Acad', N'AcadHorario.materia (slot "_aula:*") -> aulas.id', N'SELECT CAST(materia AS NVARCHAR(400)) v FROM AcadHorario WHERE slot LIKE ''\_aula:%'' ESCAPE ''\''', @aul;
EXEC #chk 'C-Alumno', N'Alumno.grado (texto) -> grados.grado', N'SELECT CAST(grado AS NVARCHAR(400)) v FROM Alumno', N'SELECT CAST(JSON_VALUE(d,''$.grado'') AS NVARCHAR(400)) v FROM #c WHERE tipo=''grados''';
EXEC #chk 'C-Alumno', N'Alumno.tanda (texto) -> tandas.nombre', N'SELECT CAST(tanda AS NVARCHAR(400)) v FROM Alumno', N'SELECT CAST(JSON_VALUE(d,''$.nombre'') AS NVARCHAR(400)) v FROM #c WHERE tipo=''tandas''';
EXEC #chk 'C-Alumno', N'Alumno (grado|sec|tanda) -> secciones',
  N'SELECT CAST(grado + ''|'' + sec + ''|'' + tanda AS NVARCHAR(400)) v FROM Alumno',
  N'SELECT CAST(JSON_VALUE(g.d,''$.grado'') + ''|'' + JSON_VALUE(s.d,''$.seccion'') + ''|'' + JSON_VALUE(t.d,''$.nombre'') AS NVARCHAR(400)) v FROM #c s JOIN #c g ON g.tipo=''grados'' AND g.cid=JSON_VALUE(s.d,''$.grado'') JOIN #c t ON t.tipo=''tandas'' AND t.cid=JSON_VALUE(s.d,''$.tanda'') WHERE s.tipo=''secciones''';
EXEC #chk 'C-Alumno', N'Alumno.alg (CSV) -> alergias.nombre', N'SELECT CAST(LTRIM(RTRIM(value)) AS NVARCHAR(400)) v FROM Alumno CROSS APPLY STRING_SPLIT(alg, '','') WHERE alg <> ''''', N'SELECT CAST(JSON_VALUE(d,''$.nombre'') AS NVARCHAR(400)) v FROM #c WHERE tipo=''alergias''';
EXEC #chk 'C-Alumno', N'ComCarnet.allergies[] -> alergias.nombre', N'SELECT CAST(j.value AS NVARCHAR(400)) v FROM ComCarnet CROSS APPLY OPENJSON(allergies) j', N'SELECT CAST(JSON_VALUE(d,''$.nombre'') AS NVARCHAR(400)) v FROM #c WHERE tipo=''alergias''';
EXEC #chk 'C-Alumno', N'AliMenu.algs[] -> alergias.nombre', N'SELECT CAST(j.value AS NVARCHAR(400)) v FROM AliMenu CROSS APPLY OPENJSON(algs) j', N'SELECT CAST(JSON_VALUE(d,''$.nombre'') AS NVARCHAR(400)) v FROM #c WHERE tipo=''alergias''';
EXEC #chk 'C-Fin', N'FinRecibo.pays[].m -> metodosPago.nombre', N'SELECT CAST(JSON_VALUE(j.value,''$.m'') AS NVARCHAR(400)) v FROM FinRecibo CROSS APPLY OPENJSON(pays) j', N'SELECT CAST(JSON_VALUE(d,''$.nombre'') AS NVARCHAR(400)) v FROM #c WHERE tipo=''metodosPago''';
EXEC #chk 'C-Fin', N'FinVenta.metodo -> metodosPago.nombre', N'SELECT CAST(metodo AS NVARCHAR(400)) v FROM FinVenta', N'SELECT CAST(JSON_VALUE(d,''$.nombre'') AS NVARCHAR(400)) v FROM #c WHERE tipo=''metodosPago''';
EXEC #chk 'C-Fin', N'FinRecibo.items[].cobroItemId -> FinCobroItem.id (las que lo traen)', N'SELECT CAST(JSON_VALUE(j.value,''$.cobroItemId'') AS NVARCHAR(400)) v FROM FinRecibo CROSS APPLY OPENJSON(items) j WHERE JSON_VALUE(j.value,''$.cobroItemId'') IS NOT NULL', N'SELECT CAST(id AS NVARCHAR(400)) v FROM FinCobroItem';
EXEC #chk 'C-Fin', N'FinRecibo.cajaId (opcional) -> cajas.id', N'SELECT CAST(cajaId AS NVARCHAR(400)) v FROM FinRecibo WHERE cajaId IS NOT NULL', N'SELECT cid v FROM #c WHERE tipo=''cajas''';
EXEC #chk 'C-Fin', N'Contrato.beca (NULL = sin beca) -> becas.id', N'SELECT CAST(beca AS NVARCHAR(400)) v FROM Contrato WHERE beca IS NOT NULL', N'SELECT cid v FROM #c WHERE tipo=''becas''';
EXEC #chk 'C-Fin', N'FinBeca.tipo -> becas.nombre', N'SELECT CAST(tipo AS NVARCHAR(400)) v FROM FinBeca', N'SELECT CAST(JSON_VALUE(d,''$.nombre'') AS NVARCHAR(400)) v FROM #c WHERE tipo=''becas''';
EXEC #chk 'C-Fin', N'FinPlan.data.tm[tanda] -> tandas.nombre', N'SELECT CAST(j.[key] COLLATE DATABASE_DEFAULT AS NVARCHAR(400)) v FROM FinPlan CROSS APPLY OPENJSON(data,''$.tm'') j', N'SELECT CAST(JSON_VALUE(d,''$.nombre'') AS NVARCHAR(400)) v FROM #c WHERE tipo=''tandas''';
EXEC #chk 'C-Fin', N'MobPagoIntencion.detalle[] (ids) -> FinCobroItem.id', N'SELECT CAST(j.value AS NVARCHAR(400)) v FROM MobPagoIntencion CROSS APPLY OPENJSON(detalle) j', N'SELECT CAST(id AS NVARCHAR(400)) v FROM FinCobroItem';
SELECT n, grupo, ref, total, huerfanos, vacios, dif_exacta, con_esp, ejemplos FROM #r ORDER BY n;
SELECT grupo, COUNT(*) AS referencias, SUM(CASE WHEN huerfanos > 0 THEN 1 ELSE 0 END) AS con_huerfanos, SUM(huerfanos) AS huerfanos_totales, SUM(vacios) AS vacios_totales FROM #r GROUP BY grupo ORDER BY grupo;
GO

/* =========================== D. DUPLICADOS (UNIQUE vigentes y candidatos) =========================== */
DECLARE @t TABLE(k NVARCHAR(130), v NVARCHAR(400));
INSERT @t SELECT N'Alumno.code', code FROM Alumno;
INSERT @t SELECT N'Tutor.cedula (UNIQUE)', cedula FROM Tutor;
INSERT @t SELECT N'Tutor.cedula con guiones (debe estar vacio: se guardan digitos)', cedula FROM Tutor WHERE cedula LIKE '%[^0-9]%';
INSERT @t SELECT N'Tutor.userId (no nulo; indice filtrado)', userId FROM Tutor WHERE userId IS NOT NULL;
INSERT @t SELECT N'ComCarnet.alumnoId (UNIQUE)', alumnoId FROM ComCarnet;
INSERT @t SELECT N'AcadRoster.alumnoId (no nulo; indice filtrado)', alumnoId FROM AcadRoster WHERE alumnoId IS NOT NULL;
INSERT @t SELECT N'FinRecibo.ncf (UNIQUE)', ncf FROM FinRecibo;
INSERT @t SELECT N'PersInscripcion.ncf (UNIQUE)', ncf FROM PersInscripcion;
INSERT @t SELECT N'Contrato (alumno, ciclo) (UNIQUE)', alumnoId + '|' + ciclo FROM Contrato;
INSERT @t SELECT N'FinProducto.code', code FROM FinProducto;
INSERT @t SELECT N'Alumno nombres+apellidos (FinBeca.est ya NO es llave; informativo)', nombres + ' ' + apellidos FROM Alumno;
INSERT @t SELECT N'Catalogo secciones (grado,seccion,tanda)', JSON_VALUE(d,'$.grado') + '|' + JSON_VALUE(d,'$.seccion') + '|' + JSON_VALUE(d,'$.tanda') FROM #c WHERE tipo='secciones';
INSERT @t SELECT N'Catalogo docentes+staff usuario', JSON_VALUE(d,'$.usuario') FROM #c WHERE tipo IN ('docentes','staff');
INSERT #d(clave_candidata, filas, grupos_duplicados, ejemplos)
SELECT k, COUNT(*), COUNT(DISTINCT CASE WHEN c > 1 THEN v END),
       (SELECT STRING_AGG(CAST(v2 AS NVARCHAR(MAX)), ', ') FROM (SELECT TOP 4 v AS v2 FROM @t t2 WHERE t2.k = a.k GROUP BY v HAVING COUNT(*) > 1) e)
FROM (SELECT k, v, COUNT(*) OVER (PARTITION BY k, v) AS c FROM @t) a GROUP BY k;
SELECT n, clave_candidata, filas, grupos_duplicados, ejemplos FROM #d ORDER BY n;
GO

/* =========================== E. CONTADORES: ya no se guardan, se CALCULAN =========================== */
SELECT N'FinPlan: alumnos = COUNT(Contrato)' AS control, p.id, (SELECT COUNT(*) FROM Contrato c WHERE c.planId = p.id) AS calculado FROM FinPlan p;
SELECT N'AliPlan: inscritos = COUNT(ComCarnet.aliPlanId)' AS control, a.id, (SELECT COUNT(*) FROM ComCarnet c WHERE c.aliPlanId = a.id) AS calculado FROM AliPlan a;
SELECT N'secciones.insc = Alumno no Retirado (muestra)' AS control, s.cid,
       (SELECT COUNT(*) FROM Alumno a JOIN #c g ON g.tipo='grados' AND g.cid=JSON_VALUE(s.d,'$.grado') JOIN #c t ON t.tipo='tandas' AND t.cid=JSON_VALUE(s.d,'$.tanda')
         WHERE a.grado=JSON_VALUE(g.d,'$.grado') AND a.sec=JSON_VALUE(s.d,'$.seccion') AND a.tanda=JSON_VALUE(t.d,'$.nombre') AND a.estado<>'Retirado') AS calculado
FROM #c s WHERE s.tipo='secciones' AND s.cid IN ('s1','s2','s10','s11','s12','sg13','sg16') ORDER BY s.cid;
SELECT a.id, (SELECT COUNT(*) FROM OPENJSON(a.meals)) AS meals_len, (SELECT COUNT(*) FROM #c WHERE tipo='comidas') AS comidas_cat,
       (SELECT COUNT(*) FROM OPENJSON(a.diets)) AS diets_len, (SELECT COUNT(*) FROM #c WHERE tipo='dietas') AS dietas_cat FROM AliPlan a;
GO

/* =========================== F. COBERTURA =========================== */
SELECT N'Alumno sin Tutor financiero (imposible: NOT NULL + FK)' AS control, COUNT(*) AS n FROM Alumno WHERE tutorId IS NULL
UNION ALL SELECT N'Alumno sin PersExpediente', COUNT(*) FROM Alumno a WHERE NOT EXISTS (SELECT 1 FROM PersExpediente e WHERE e.alumnoId=a.id)
UNION ALL SELECT N'Alumno sin Contrato', COUNT(*) FROM Alumno a WHERE NOT EXISTS (SELECT 1 FROM Contrato c WHERE c.alumnoId=a.id)
UNION ALL SELECT N'Alumno sin AcadRoster', COUNT(*) FROM Alumno a WHERE NOT EXISTS (SELECT 1 FROM AcadRoster r WHERE r.alumnoId=a.id)
UNION ALL SELECT N'Alumno sin MobWallet', COUNT(*) FROM Alumno a WHERE NOT EXISTS (SELECT 1 FROM MobWallet w WHERE w.alumnoId=a.id)
UNION ALL SELECT N'Alumno sin ComCarnet', COUNT(*) FROM Alumno a WHERE NOT EXISTS (SELECT 1 FROM ComCarnet c WHERE c.alumnoId=a.id)
UNION ALL SELECT N'Tutor sin ningun Alumno financiero', COUNT(*) FROM Tutor t WHERE NOT EXISTS (SELECT 1 FROM Alumno a WHERE a.tutorId=t.id)
UNION ALL SELECT N'Tutor con cuenta de portal (userId)', COUNT(*) FROM Tutor WHERE userId IS NOT NULL
UNION ALL SELECT N'Alumno con tutor legal distinto del financiero', COUNT(*) FROM Alumno WHERE tutorLegalId IS NOT NULL AND tutorLegalId <> tutorId
UNION ALL SELECT N'FinCobroItem sin tutorId', COUNT(*) FROM FinCobroItem WHERE tutorId IS NULL
UNION ALL SELECT N'FinCobroItem con servicioId', COUNT(*) FROM FinCobroItem WHERE servicioId IS NOT NULL
UNION ALL SELECT N'FinRecibo con cajeroId', COUNT(*) FROM FinRecibo WHERE cajeroId IS NOT NULL
UNION ALL SELECT N'AcadRoster sin Alumno (nomina heredada)', COUNT(*) FROM AcadRoster WHERE alumnoId IS NULL;
GO

/* =========================== G. Verificacion del motor ===========================
   DBCC CHECKCONSTRAINTS WITH ALL_CONSTRAINTS devuelve 0 filas si todas las FK/UNIQUE/CHECK se cumplen (incluso las no confiables). */
DBCC CHECKCONSTRAINTS WITH ALL_CONSTRAINTS, NO_INFOMSGS;
SELECT COUNT(*) AS fk_declaradas, SUM(CASE WHEN is_not_trusted = 1 THEN 1 ELSE 0 END) AS fk_no_confiables FROM sys.foreign_keys;
GO
