/* =====================================================================================
   STODIA - Auditoria de integridad referencial, version POSTERIOR A LA FASE 2C (SOLO LECTURA: unicamente tablas temporales #...).
   Base: stodia (SQL Server, collation Modern_Spanish_CI_AI). Versiones anteriores: docs/db-auditoria-pre-fase1.sql (sin FK) y el historial de git (Fases 1, 2A, 2B).

   Ejecutar:  sqlcmd -S tcp:localhost,1433 -E -C -d stodia -I -f 65001 -i docs\db-auditoria.sql -W -s"|"
   (el equivalente motor-agnostico, que tambien sirve en SQLite, es:  pnpm --filter @stodia/api db:fk:auditar)

   Secciones del resultado (todas deben dar problemas = 0 salvo las marcadas "informativo"):
     A. TODAS las FK reales del esquema (116 tras la Fase 2C): huerfanos y '' usados como "sin valor".
     B. Duplicados que violarian un UNIQUE / indice unico filtrado (un ciclo activo, un financiero y un legal vigentes por alumno...).
     C. Coherencia que las FK no expresan: matricula = seccion del alumno, tutores vigentes = columnas del alumno, lineas y pagos del recibo, ServicioAlumno (una sola FK de catalogo)...
     D. Referencias LOGICAS que quedan sin FK: la lista es DELIBERADA (ver docs/db-relaciones.md, 0.1): instantaneas de texto, auditoria, folios y configuracion.
     E. Cobertura (filas por tabla) y F. DBCC CHECKCONSTRAINTS (FK y CHECK confiables).
   ===================================================================================== */
SET NOCOUNT ON;
USE stodia;
GO
IF OBJECT_ID('tempdb..#r') IS NOT NULL DROP TABLE #r;
CREATE TABLE #r(n INT IDENTITY, grupo NVARCHAR(24), ref NVARCHAR(220), total INT, problemas INT, detalle NVARCHAR(400));
GO
/* ------------------------- A. FK reales ------------------------- */
DECLARE @sql NVARCHAR(MAX) = N'';
SELECT @sql += N'INSERT #r(grupo, ref, total, problemas, detalle) SELECT N''A-FK real'', N''' + ref + N''',
  (SELECT COUNT(*) FROM dbo.' + QUOTENAME(h) + N'),
  (SELECT COUNT(*) FROM dbo.' + QUOTENAME(h) + N' c WHERE c.' + QUOTENAME(hc) + N' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.' + QUOTENAME(p) + N' x WHERE x.' + QUOTENAME(pc) + N' = c.' + QUOTENAME(hc) + N'))
   + (SELECT COUNT(*) FROM dbo.' + QUOTENAME(h) + N' WHERE CAST(' + QUOTENAME(hc) + N' AS NVARCHAR(400)) = N''''), N''' + regla + N''';' + CHAR(10)
FROM (
  SELECT OBJECT_NAME(fk.parent_object_id) h, COL_NAME(fkc.parent_object_id, fkc.parent_column_id) hc, OBJECT_NAME(fk.referenced_object_id) p, COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) pc,
         OBJECT_NAME(fk.parent_object_id) + N'.' + COL_NAME(fkc.parent_object_id, fkc.parent_column_id) + N' -> ' + OBJECT_NAME(fk.referenced_object_id) + N'.' + COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) ref,
         N'ON DELETE ' + REPLACE(fk.delete_referential_action_desc, '_', ' ') + CASE WHEN fk.is_not_trusted = 1 THEN N' · NO CONFIABLE' ELSE N'' END regla
  FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id) f
ORDER BY h, hc;
EXEC sp_executesql @sql;
GO
/* ------------------------- B. Duplicados / unicidad ------------------------- */
INSERT #r(grupo, ref, total, problemas, detalle) VALUES
 (N'B-Duplicados', N'Ciclo ACTIVO (debe haber exactamente uno)', (SELECT COUNT(*) FROM Ciclo), (SELECT ABS(COUNT(*) - 1) FROM Ciclo WHERE estado = N'Activo'), N'indice unico filtrado UX_Ciclo_activo'),
 (N'B-Duplicados', N'Ciclo.nombre', (SELECT COUNT(*) FROM Ciclo), (SELECT COUNT(*) FROM (SELECT nombre FROM Ciclo GROUP BY nombre HAVING COUNT(*) > 1) d), N'UNIQUE'),
 (N'B-Duplicados', N'Matricula (alumnoId, cicloId)', (SELECT COUNT(*) FROM Matricula), (SELECT COUNT(*) FROM (SELECT alumnoId, cicloId FROM Matricula GROUP BY alumnoId, cicloId HAVING COUNT(*) > 1) d), N'UNIQUE'),
 (N'B-Duplicados', N'Contrato (alumnoId, cicloId)', (SELECT COUNT(*) FROM Contrato), (SELECT COUNT(*) FROM (SELECT alumnoId, cicloId FROM Contrato GROUP BY alumnoId, cicloId HAVING COUNT(*) > 1) d), N'UNIQUE'),
 (N'B-Duplicados', N'PersInscripcion (alumnoId, cicloId)', (SELECT COUNT(*) FROM PersInscripcion), (SELECT COUNT(*) FROM (SELECT alumnoId, cicloId FROM PersInscripcion GROUP BY alumnoId, cicloId HAVING COUNT(*) > 1) d), N'UNIQUE'),
 (N'B-Duplicados', N'TutorAlumno Financiero VIGENTE por alumno', (SELECT COUNT(*) FROM TutorAlumno), (SELECT COUNT(*) FROM (SELECT alumnoId FROM TutorAlumno WHERE rol = N'Financiero' AND hasta IS NULL GROUP BY alumnoId HAVING COUNT(*) > 1) d), N'indice unico filtrado UX_TutorAlumno_financiero'),
 (N'B-Duplicados', N'TutorAlumno Legal VIGENTE por alumno', (SELECT COUNT(*) FROM TutorAlumno), (SELECT COUNT(*) FROM (SELECT alumnoId FROM TutorAlumno WHERE rol = N'Legal' AND hasta IS NULL GROUP BY alumnoId HAVING COUNT(*) > 1) d), N'indice unico filtrado UX_TutorAlumno_legal'),
 (N'B-Duplicados', N'AcadAsignacion (cicloId, seccionId, materiaId)', (SELECT COUNT(*) FROM AcadAsignacion), (SELECT COUNT(*) FROM (SELECT cicloId, seccionId, materiaId FROM AcadAsignacion GROUP BY cicloId, seccionId, materiaId HAVING COUNT(*) > 1) d), N'UNIQUE'),
 (N'B-Duplicados', N'AcadHorario (cicloId, seccionId, slot)', (SELECT COUNT(*) FROM AcadHorario), (SELECT COUNT(*) FROM (SELECT cicloId, seccionId, slot FROM AcadHorario GROUP BY cicloId, seccionId, slot HAVING COUNT(*) > 1) d), N'UNIQUE'),
 (N'B-Duplicados', N'AcadNota (rosterId, materiaId, periodoId)', (SELECT COUNT(*) FROM AcadNota), (SELECT COUNT(*) FROM (SELECT rosterId, materiaId, periodoId FROM AcadNota GROUP BY rosterId, materiaId, periodoId HAVING COUNT(*) > 1) d), N'UNIQUE'),
 (N'B-Duplicados', N'PersDocumento (alumnoId, tipoId)', (SELECT COUNT(*) FROM PersDocumento), (SELECT COUNT(*) FROM (SELECT alumnoId, tipoId FROM PersDocumento GROUP BY alumnoId, tipoId HAVING COUNT(*) > 1) d), N'UNIQUE'),
 (N'B-Duplicados', N'FinRecibo.ncf', (SELECT COUNT(*) FROM FinRecibo), (SELECT COUNT(*) FROM (SELECT ncf FROM FinRecibo GROUP BY ncf HAVING COUNT(*) > 1) d), N'UNIQUE'),
 (N'B-Duplicados', N'PersInscripcion.ncf', (SELECT COUNT(*) FROM PersInscripcion), (SELECT COUNT(*) FROM (SELECT ncf FROM PersInscripcion GROUP BY ncf HAVING COUNT(*) > 1) d), N'UNIQUE'),
 (N'B-Duplicados', N'Tutor.cedula', (SELECT COUNT(*) FROM Tutor), (SELECT COUNT(*) FROM (SELECT cedula FROM Tutor GROUP BY cedula HAVING COUNT(*) > 1) d), N'UNIQUE'),
 (N'B-Duplicados', N'Seccion (gradoId, letra, tandaId)', (SELECT COUNT(*) FROM Seccion), (SELECT COUNT(*) FROM (SELECT gradoId, letra, tandaId FROM Seccion GROUP BY gradoId, letra, tandaId HAVING COUNT(*) > 1) d), N'UNIQUE');
GO
/* ------------------------- C. Coherencia ------------------------- */
INSERT #r(grupo, ref, total, problemas, detalle) VALUES
 (N'C-Coherencia', N'Alumno (ni Egresado ni Retirado de un ciclo anterior) sin Matricula del ciclo activo', (SELECT COUNT(*) FROM Alumno), (SELECT COUNT(*) FROM Alumno a WHERE a.estado NOT IN (N'Egresado', N'Retirado') AND NOT EXISTS (SELECT 1 FROM Matricula m JOIN Ciclo c ON c.id = m.cicloId AND c.estado = N'Activo' WHERE m.alumnoId = a.id)), N'regla: Matricula es la fuente del historial; Alumno.seccionId = su matricula activa'),
 (N'C-Coherencia', N'Alumno.seccionId distinta de la seccion de su Matricula del ciclo activo', (SELECT COUNT(*) FROM Alumno), (SELECT COUNT(*) FROM Alumno a JOIN Matricula m ON m.alumnoId = a.id JOIN Ciclo c ON c.id = m.cicloId AND c.estado = N'Activo' WHERE m.seccionId <> a.seccionId), N''),
 (N'C-Coherencia', N'Estado Retirado del alumno distinto del de su matricula activa', (SELECT COUNT(*) FROM Alumno), (SELECT COUNT(*) FROM Alumno a JOIN Matricula m ON m.alumnoId = a.id JOIN Ciclo c ON c.id = m.cicloId AND c.estado = N'Activo' WHERE (a.estado = N'Retirado' AND m.estado <> N'Retirado') OR (a.estado <> N'Retirado' AND m.estado = N'Retirado')), N''),
 (N'C-Coherencia', N'Matricula de un ciclo CERRADO todavia Activo', (SELECT COUNT(*) FROM Matricula), (SELECT COUNT(*) FROM Matricula m JOIN Ciclo c ON c.id = m.cicloId WHERE c.estado = N'Cerrado' AND m.estado = N'Activo'), N'al cerrar: Promovido / Repitente / Graduado / Retirado'),
 (N'C-Coherencia', N'Alumno.tutorId sin vinculo Financiero vigente igual en TutorAlumno', (SELECT COUNT(*) FROM Alumno), (SELECT COUNT(*) FROM Alumno a WHERE NOT EXISTS (SELECT 1 FROM TutorAlumno t WHERE t.alumnoId = a.id AND t.rol = N'Financiero' AND t.hasta IS NULL AND t.tutorId = a.tutorId)), N'TutorAlumno es la fuente; las columnas del alumno son su copia vigente'),
 (N'C-Coherencia', N'Alumno.tutorLegalId sin vinculo Legal vigente igual en TutorAlumno', (SELECT COUNT(*) FROM Alumno), (SELECT COUNT(*) FROM Alumno a WHERE a.tutorLegalId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM TutorAlumno t WHERE t.alumnoId = a.id AND t.rol = N'Legal' AND t.hasta IS NULL AND t.tutorId = a.tutorLegalId)), N''),
 (N'C-Coherencia', N'FinRecibo con lineas que no suman su monto', (SELECT COUNT(*) FROM FinRecibo), (SELECT COUNT(*) FROM FinRecibo r WHERE EXISTS (SELECT 1 FROM FinReciboItem i WHERE i.reciboId = r.id) AND ABS(r.monto - (SELECT SUM(i.monto) FROM FinReciboItem i WHERE i.reciboId = r.id)) > 0.01), N''),
 (N'C-Coherencia', N'FinRecibo sin ningun pago (FinReciboPago)', (SELECT COUNT(*) FROM FinRecibo), (SELECT COUNT(*) FROM FinRecibo r WHERE NOT EXISTS (SELECT 1 FROM FinReciboPago p WHERE p.reciboId = r.id)), N''),
 (N'C-Coherencia', N'FinRecibo cuyos pagos suman menos que su monto', (SELECT COUNT(*) FROM FinRecibo), (SELECT COUNT(*) FROM FinRecibo r WHERE (SELECT SUM(p.monto) FROM FinReciboPago p WHERE p.reciboId = r.id) < r.monto - 0.01), N'(el vuelto hace que los pagos puedan exceder el monto)'),
 (N'C-Coherencia', N'FinRecibo.metodoPagoId incoherente con sus pagos (unico medio = ese medio; mixto = NULL)', (SELECT COUNT(*) FROM FinRecibo), (SELECT COUNT(*) FROM FinRecibo r WHERE ((SELECT COUNT(DISTINCT p.metodoPagoId) FROM FinReciboPago p WHERE p.reciboId = r.id) = 1 AND r.metodoPagoId IS NOT NULL AND r.metodoPagoId <> (SELECT MIN(p.metodoPagoId) FROM FinReciboPago p WHERE p.reciboId = r.id)) OR ((SELECT COUNT(DISTINCT p.metodoPagoId) FROM FinReciboPago p WHERE p.reciboId = r.id) > 1 AND r.metodoPagoId IS NOT NULL)), N''),
 (N'C-Coherencia', N'FinReciboItem sin cargo de cartera (cobroItemId NULL permitido) - informativo', (SELECT COUNT(*) FROM FinReciboItem), 0, N'lineas historicas: ' + CAST((SELECT COUNT(*) FROM FinReciboItem WHERE cobroItemId IS NULL) AS NVARCHAR(12))),
 (N'C-Coherencia', N'ServicioAlumno sin EXACTAMENTE una FK de catalogo', (SELECT COUNT(*) FROM ServicioAlumno), (SELECT COUNT(*) FROM ServicioAlumno s WHERE (CASE WHEN s.rutaId IS NULL THEN 0 ELSE 1 END) + (CASE WHEN s.aliPlanId IS NULL THEN 0 ELSE 1 END) + (CASE WHEN s.extraId IS NULL THEN 0 ELSE 1 END) + (CASE WHEN s.productoId IS NULL THEN 0 ELSE 1 END) <> 1), N'CHECK CK_ServicioAlumno_catalogo'),
 (N'C-Coherencia', N'Ciclo sin sus periodos academicos', (SELECT COUNT(*) FROM Ciclo), (SELECT COUNT(*) FROM Ciclo c WHERE NOT EXISTS (SELECT 1 FROM PeriodoAcademico p WHERE p.cicloId = c.id)), N''),
 (N'C-Coherencia', N'Carnet de comedor sin Monedero (una sola fuente de saldo)', (SELECT COUNT(*) FROM ComCarnet), (SELECT COUNT(*) FROM ComCarnet c WHERE NOT EXISTS (SELECT 1 FROM Monedero m WHERE m.alumnoId = c.alumnoId)), N''),
 (N'C-Coherencia', N'Monedero con saldo negativo', (SELECT COUNT(*) FROM Monedero), (SELECT COUNT(*) FROM Monedero WHERE saldo < 0), N''),
 (N'C-Coherencia', N'AcadAsignacion fuera del plan de estudios (SeccionMateria)', (SELECT COUNT(*) FROM AcadAsignacion), (SELECT COUNT(*) FROM AcadAsignacion a WHERE NOT EXISTS (SELECT 1 FROM SeccionMateria p WHERE p.seccionId = a.seccionId AND p.materiaId = a.materiaId)), N''),
 (N'C-Coherencia', N'AcadAsignacion.aulaElegidaId que no esta entre sus aulas (AsignacionAula)', (SELECT COUNT(*) FROM AcadAsignacion), (SELECT COUNT(*) FROM AcadAsignacion a WHERE a.aulaElegidaId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM AsignacionAula x WHERE x.asignacionId = a.id AND x.aulaId = a.aulaElegidaId)), N''),
 (N'C-Coherencia', N'FinCobroItem con cicloId distinto del ciclo de su vencimiento - informativo', (SELECT COUNT(*) FROM FinCobroItem), 0, N'divergentes: ' + CAST((SELECT COUNT(*) FROM FinCobroItem c JOIN Ciclo y ON y.id = c.cicloId WHERE c.vence LIKE N'__/__/____' AND (SUBSTRING(c.vence, 7, 4) + N'-' + SUBSTRING(c.vence, 4, 2) + N'-' + SUBSTRING(c.vence, 1, 2)) NOT BETWEEN y.fechaInicio AND y.fechaFin) AS NVARCHAR(12))),
 (N'C-Coherencia', N'FinRecibo.cicloId distinto del ciclo de su fecha de emision - informativo', (SELECT COUNT(*) FROM FinRecibo), 0, N'divergentes: ' + CAST((SELECT COUNT(*) FROM FinRecibo r JOIN Ciclo y ON y.id = r.cicloId WHERE CONVERT(CHAR(10), r.createdAt, 23) NOT BETWEEN y.fechaInicio AND y.fechaFin) AS NVARCHAR(12)));
GO
/* ------------------------- D. Referencias LOGICAS deliberadas (sin FK a proposito) ------------------------- */
INSERT #r(grupo, ref, total, problemas, detalle) VALUES
 (N'D-Logica deliberada', N'SisAudit.usr / tabla / registro', (SELECT COUNT(*) FROM SisAudit), 0, N'bitacora append-only: el usuario y el registro pueden dejar de existir; tabla+registro es polimorfica'),
 (N'D-Logica deliberada', N'DocFolio.emitidoPor', (SELECT COUNT(*) FROM DocFolio), 0, N'folio publico de verificacion: instantanea del usuario emisor'),
 (N'D-Logica deliberada', N'CmnMensaje.by / to (instantaneas de texto; FK reales: userId, tutorId)', (SELECT COUNT(*) FROM CmnMensaje), 0, N'nombre del emisor y destinatario al enviar'),
 (N'D-Logica deliberada', N'ComLectura.n (instantanea del nombre leido; FK real: alumnoId)', (SELECT COUNT(*) FROM ComLectura), 0, N'log del lector'),
 (N'D-Logica deliberada', N'FinRecibo.tutor / FinBeca.est / FinMovimiento.name / FinVenta.metodo / FinCobroItem.al / ComCarnet.name,grado,plan (instantaneas)', (SELECT COUNT(*) FROM FinRecibo), 0, N'texto impreso en el comprobante o la pantalla; la relacion real es la FK vecina'),
 (N'D-Logica deliberada', N'Alumno.cuenta (derivado de la CxC), AcadExtra.inscritos (contador del cupo)', (SELECT COUNT(*) FROM AcadExtra), 0, N'contadores operativos; la lista nominal esta en ServicioAlumno.extraId'),
 (N'D-Logica deliberada', N'SisConfig (clave/valor JSON) y FinCounter (secuencias)', (SELECT COUNT(*) FROM SisConfig) + (SELECT COUNT(*) FROM FinCounter), 0, N'configuracion y contadores NCF/recibos sin relacion con otras tablas'),
 (N'D-Logica deliberada', N'PersExpediente.data (ficha JSON: medica, conducta, carnet, geo)', (SELECT COUNT(*) FROM PersExpediente), 0, N'ficha propia del alumno; contrato, tutor legal e historial NO van aqui (Contrato, Alumno.tutorLegalId, Matricula)');
GO
/* ------------------------- Resultados ------------------------- */
SELECT n, grupo, ref, total, problemas, detalle FROM #r ORDER BY n;
SELECT grupo, COUNT(*) AS comprobaciones, SUM(problemas) AS problemas FROM #r GROUP BY grupo ORDER BY MIN(n);
/* E. cobertura */
SELECT t.name AS tabla, SUM(p.rows) AS filas FROM sys.tables t JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1) GROUP BY t.name ORDER BY t.name;
SELECT (SELECT COUNT(*) FROM sys.tables) AS tablas, (SELECT COUNT(*) FROM sys.foreign_keys) AS fk, (SELECT COUNT(*) FROM sys.foreign_keys WHERE is_not_trusted = 1) AS fk_no_confiables,
       (SELECT COUNT(*) FROM sys.check_constraints) AS checks, (SELECT COUNT(*) FROM sys.check_constraints WHERE is_not_trusted = 1) AS checks_no_confiables;
/* F. DBCC: no debe devolver filas */
DBCC CHECKCONSTRAINTS WITH ALL_CONSTRAINTS, NO_INFOMSGS;
GO
