BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[User] (
    [id] NVARCHAR(100) NOT NULL,
    [usuario] NVARCHAR(100) NOT NULL,
    [nombre] NVARCHAR(1000) NOT NULL,
    [rol] NVARCHAR(1000) NOT NULL,
    [passwordHash] NVARCHAR(1000) NOT NULL,
    [estado] NVARCHAR(1000) NOT NULL CONSTRAINT [User_estado_df] DEFAULT 'Activo',
    [mustChange] BIT NOT NULL CONSTRAINT [User_mustChange_df] DEFAULT 0,
    CONSTRAINT [User_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [User_usuario_key] UNIQUE NONCLUSTERED ([usuario])
);

-- CreateTable
CREATE TABLE [dbo].[Tutor] (
    [id] NVARCHAR(100) NOT NULL,
    [nombre] NVARCHAR(1000) NOT NULL,
    [cedula] NVARCHAR(100) NOT NULL,
    [parentesco] NVARCHAR(1000) NOT NULL,
    [tipo] NVARCHAR(1000) NOT NULL,
    [tel] NVARCHAR(1000) NOT NULL,
    [email] NVARCHAR(1000),
    [rnc] NVARCHAR(1000),
    [userId] NVARCHAR(100),
    [estado] NVARCHAR(1000) NOT NULL CONSTRAINT [Tutor_estado_df] DEFAULT 'Activo',
    CONSTRAINT [Tutor_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Tutor_cedula_key] UNIQUE NONCLUSTERED ([cedula])
);

-- CreateTable
CREATE TABLE [dbo].[Alumno] (
    [id] NVARCHAR(100) NOT NULL,
    [code] NVARCHAR(100) NOT NULL,
    [nombres] NVARCHAR(1000) NOT NULL,
    [apellidos] NVARCHAR(1000) NOT NULL,
    [fnac] NVARCHAR(1000) NOT NULL,
    [seccionId] NVARCHAR(100) NOT NULL,
    [cuenta] NVARCHAR(1000) NOT NULL,
    [estado] NVARCHAR(1000) NOT NULL,
    [dir] NVARCHAR(1000) NOT NULL CONSTRAINT [Alumno_dir_df] DEFAULT '',
    [tel] NVARCHAR(1000) NOT NULL CONSTRAINT [Alumno_tel_df] DEFAULT '',
    [tutorId] NVARCHAR(100) NOT NULL,
    [tutorLegalId] NVARCHAR(100),
    CONSTRAINT [Alumno_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Alumno_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[MobNota] (
    [id] NVARCHAR(100) NOT NULL,
    [alumnoId] NVARCHAR(100) NOT NULL,
    [materiaId] NVARCHAR(100) NOT NULL,
    [valor] FLOAT(53) NOT NULL,
    CONSTRAINT [MobNota_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Monedero] (
    [alumnoId] NVARCHAR(100) NOT NULL,
    [saldo] FLOAT(53) NOT NULL,
    [limite] FLOAT(53) NOT NULL,
    CONSTRAINT [Monedero_pkey] PRIMARY KEY CLUSTERED ([alumnoId])
);

-- CreateTable
CREATE TABLE [dbo].[MonederoMovimiento] (
    [id] INT NOT NULL IDENTITY(1,1),
    [alumnoId] NVARCHAR(100) NOT NULL,
    [tipo] NVARCHAR(20) NOT NULL,
    [monto] FLOAT(53) NOT NULL,
    [saldoDespues] FLOAT(53) NOT NULL,
    [concepto] NVARCHAR(1000) NOT NULL CONSTRAINT [MonederoMovimiento_concepto_df] DEFAULT '',
    [intencionId] NVARCHAR(100),
    [creado] DATETIME2 NOT NULL CONSTRAINT [MonederoMovimiento_creado_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [MonederoMovimiento_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[MobAcceso] (
    [id] NVARCHAR(100) NOT NULL,
    [alumnoId] NVARCHAR(100) NOT NULL,
    [hora] NVARCHAR(1000) NOT NULL,
    [resultado] NVARCHAR(1000) NOT NULL,
    [creado] DATETIME2 NOT NULL CONSTRAINT [MobAcceso_creado_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [MobAcceso_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[AliPlan] (
    [id] NVARCHAR(100) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [modelo] NVARCHAR(1000) NOT NULL,
    [precio] FLOAT(53),
    [freq] NVARCHAR(1000) NOT NULL,
    [dias] NVARCHAR(1000) NOT NULL,
    [mora] BIT NOT NULL,
    [recarga] FLOAT(53),
    [limite] FLOAT(53),
    [canal] NVARCHAR(1000) NOT NULL,
    [saldo] NVARCHAR(1000) NOT NULL,
    [estado] NVARCHAR(1000) NOT NULL CONSTRAINT [AliPlan_estado_df] DEFAULT 'Activo',
    CONSTRAINT [AliPlan_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[AliMenu] (
    [orden] INT NOT NULL,
    [dia] NVARCHAR(1000) NOT NULL,
    [plato] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [AliMenu_pkey] PRIMARY KEY CLUSTERED ([orden])
);

-- CreateTable
CREATE TABLE [dbo].[ComCarnet] (
    [code] NVARCHAR(100) NOT NULL,
    [alumnoId] NVARCHAR(100) NOT NULL,
    [aliPlanId] NVARCHAR(100),
    [name] NVARCHAR(1000) NOT NULL,
    [grado] NVARCHAR(1000) NOT NULL,
    [plan] NVARCHAR(1000) NOT NULL,
    [ok] BIT NOT NULL,
    [restr] NVARCHAR(1000) NOT NULL,
    [motivo] NVARCHAR(1000) NOT NULL CONSTRAINT [ComCarnet_motivo_df] DEFAULT '',
    CONSTRAINT [ComCarnet_pkey] PRIMARY KEY CLUSTERED ([code]),
    CONSTRAINT [ComCarnet_alumnoId_key] UNIQUE NONCLUSTERED ([alumnoId])
);

-- CreateTable
CREATE TABLE [dbo].[ComLectura] (
    [id] NVARCHAR(100) NOT NULL,
    [t] NVARCHAR(1000) NOT NULL,
    [n] NVARCHAR(1000) NOT NULL,
    [alumnoId] NVARCHAR(100),
    [s] NVARCHAR(1000) NOT NULL,
    [creado] DATETIME2 NOT NULL CONSTRAINT [ComLectura_creado_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ComLectura_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[CmnMensaje] (
    [id] INT NOT NULL IDENTITY(1,1),
    [batch] NVARCHAR(1000) NOT NULL CONSTRAINT [CmnMensaje_batch_df] DEFAULT '',
    [t] NVARCHAR(1000) NOT NULL,
    [to] NVARCHAR(1000) NOT NULL,
    [tutorId] NVARCHAR(100),
    [canal] NVARCHAR(1000) NOT NULL,
    [asunto] NVARCHAR(1000) NOT NULL,
    [estado] NVARCHAR(1000) NOT NULL,
    [by] NVARCHAR(1000) NOT NULL,
    [userId] NVARCHAR(100),
    [cuerpo] NVARCHAR(max) NOT NULL CONSTRAINT [CmnMensaje_cuerpo_df] DEFAULT '',
    [destino] NVARCHAR(1000) NOT NULL CONSTRAINT [CmnMensaje_destino_df] DEFAULT '',
    [error] NVARCHAR(max) NOT NULL CONSTRAINT [CmnMensaje_error_df] DEFAULT '',
    [intentos] INT NOT NULL CONSTRAINT [CmnMensaje_intentos_df] DEFAULT 0,
    CONSTRAINT [CmnMensaje_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[MobPagoIntencion] (
    [id] NVARCHAR(100) NOT NULL,
    [alumnoId] NVARCHAR(100) NOT NULL,
    [tutorId] NVARCHAR(100) NOT NULL,
    [tipo] NVARCHAR(1000) NOT NULL,
    [monto] FLOAT(53) NOT NULL,
    [estado] NVARCHAR(100) NOT NULL CONSTRAINT [MobPagoIntencion_estado_df] DEFAULT 'pendiente',
    [creado] DATETIME2 NOT NULL CONSTRAINT [MobPagoIntencion_creado_df] DEFAULT CURRENT_TIMESTAMP,
    [resuelto] DATETIME2,
    [resueltoPorId] NVARCHAR(100),
    [nota] NVARCHAR(max) NOT NULL CONSTRAINT [MobPagoIntencion_nota_df] DEFAULT '',
    [reciboId] NVARCHAR(100),
    CONSTRAINT [MobPagoIntencion_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[MobPagoIntencionCargo] (
    [intencionId] NVARCHAR(100) NOT NULL,
    [cobroItemId] NVARCHAR(100) NOT NULL,
    CONSTRAINT [MobPagoIntencionCargo_pkey] PRIMARY KEY CLUSTERED ([intencionId],[cobroItemId])
);

-- CreateTable
CREATE TABLE [dbo].[FinCobroItem] (
    [id] NVARCHAR(100) NOT NULL,
    [alumnoId] NVARCHAR(100) NOT NULL,
    [tutorId] NVARCHAR(100),
    [servicioId] NVARCHAR(100),
    [cicloId] NVARCHAR(100) NOT NULL,
    [con] NVARCHAR(1000) NOT NULL,
    [al] NVARCHAR(1000) NOT NULL,
    [vence] NVARCHAR(1000) NOT NULL,
    [monto] FLOAT(53) NOT NULL,
    [est] NVARCHAR(1000) NOT NULL,
    [tipo] NVARCHAR(1000) NOT NULL,
    [paid] BIT NOT NULL CONSTRAINT [FinCobroItem_paid_df] DEFAULT 0,
    [abono] BIT NOT NULL CONSTRAINT [FinCobroItem_abono_df] DEFAULT 0,
    [orden] INT NOT NULL CONSTRAINT [FinCobroItem_orden_df] DEFAULT 0,
    CONSTRAINT [FinCobroItem_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[FinRecibo] (
    [id] NVARCHAR(100) NOT NULL,
    [ncf] NVARCHAR(100) NOT NULL,
    [tutor] NVARCHAR(1000) NOT NULL,
    [tutorId] NVARCHAR(100),
    [cajaId] NVARCHAR(100),
    [cicloId] NVARCHAR(100) NOT NULL,
    [metodoPagoId] NVARCHAR(100),
    [cajeroId] NVARCHAR(100),
    [hora] NVARCHAR(1000) NOT NULL,
    [monto] FLOAT(53) NOT NULL,
    [est] NVARCHAR(1000) NOT NULL CONSTRAINT [FinRecibo_est_df] DEFAULT 'Activo',
    [abono] BIT NOT NULL CONSTRAINT [FinRecibo_abono_df] DEFAULT 0,
    [saldo] FLOAT(53) NOT NULL CONSTRAINT [FinRecibo_saldo_df] DEFAULT 0,
    [nc] NVARCHAR(1000),
    [change] FLOAT(53) NOT NULL CONSTRAINT [FinRecibo_change_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [FinRecibo_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [FinRecibo_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FinRecibo_ncf_key] UNIQUE NONCLUSTERED ([ncf])
);

-- CreateTable
CREATE TABLE [dbo].[FinReciboItem] (
    [id] INT NOT NULL IDENTITY(1,1),
    [reciboId] NVARCHAR(100) NOT NULL,
    [orden] INT NOT NULL,
    [concepto] NVARCHAR(1000) NOT NULL,
    [monto] FLOAT(53) NOT NULL,
    [cobroItemId] NVARCHAR(100),
    CONSTRAINT [FinReciboItem_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FinReciboItem_reciboId_orden_key] UNIQUE NONCLUSTERED ([reciboId],[orden])
);

-- CreateTable
CREATE TABLE [dbo].[FinReciboPago] (
    [id] INT NOT NULL IDENTITY(1,1),
    [reciboId] NVARCHAR(100) NOT NULL,
    [orden] INT NOT NULL,
    [metodoPagoId] NVARCHAR(100) NOT NULL,
    [monto] FLOAT(53) NOT NULL,
    [referencia] NVARCHAR(1000) NOT NULL CONSTRAINT [FinReciboPago_referencia_df] DEFAULT '',
    CONSTRAINT [FinReciboPago_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FinReciboPago_reciboId_orden_key] UNIQUE NONCLUSTERED ([reciboId],[orden])
);

-- CreateTable
CREATE TABLE [dbo].[FinCounter] (
    [key] NVARCHAR(100) NOT NULL,
    [value] INT NOT NULL,
    CONSTRAINT [FinCounter_pkey] PRIMARY KEY CLUSTERED ([key])
);

-- CreateTable
CREATE TABLE [dbo].[FinPlan] (
    [id] NVARCHAR(100) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [estado] NVARCHAR(1000) NOT NULL CONSTRAINT [FinPlan_estado_df] DEFAULT 'Activo',
    [data] NVARCHAR(max) NOT NULL,
    CONSTRAINT [FinPlan_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[FinPlanTanda] (
    [planId] NVARCHAR(100) NOT NULL,
    [tandaId] NVARCHAR(100) NOT NULL,
    [monto] FLOAT(53) NOT NULL,
    CONSTRAINT [FinPlanTanda_pkey] PRIMARY KEY CLUSTERED ([planId],[tandaId])
);

-- CreateTable
CREATE TABLE [dbo].[FinBeca] (
    [id] NVARCHAR(100) NOT NULL,
    [cicloId] NVARCHAR(100) NOT NULL,
    [alumnoId] NVARCHAR(100) NOT NULL,
    [est] NVARCHAR(1000) NOT NULL,
    [grado] NVARCHAR(1000) NOT NULL,
    [tipoBecaId] NVARCHAR(100) NOT NULL,
    [modo] NVARCHAR(10) NOT NULL,
    [valor] FLOAT(53) NOT NULL,
    [exp] NVARCHAR(1000) NOT NULL,
    [estado] NVARCHAR(1000) NOT NULL,
    [aprob] NVARCHAR(1000) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [FinBeca_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [FinBeca_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[FinProducto] (
    [id] NVARCHAR(100) NOT NULL,
    [code] NVARCHAR(100) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [categoriaId] NVARCHAR(100) NOT NULL,
    [price] FLOAT(53) NOT NULL,
    [tax] BIT NOT NULL CONSTRAINT [FinProducto_tax_df] DEFAULT 0,
    [stock] INT,
    [icon] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [FinProducto_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FinProducto_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[FinMovimiento] (
    [id] INT NOT NULL IDENTITY(1,1),
    [t] NVARCHAR(1000) NOT NULL,
    [tipo] NVARCHAR(1000) NOT NULL,
    [productoId] NVARCHAR(100) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [q] NVARCHAR(1000) NOT NULL,
    [ref] NVARCHAR(1000) NOT NULL,
    [ventaId] NVARCHAR(100),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [FinMovimiento_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [FinMovimiento_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[FinVenta] (
    [id] NVARCHAR(100) NOT NULL,
    [ncf] NVARCHAR(1000) NOT NULL,
    [total] FLOAT(53) NOT NULL,
    [metodo] NVARCHAR(1000) NOT NULL,
    [metodoPagoId] NVARCHAR(100) NOT NULL,
    [doc] NVARCHAR(1000) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [FinVenta_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [FinVenta_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[FinVentaItem] (
    [id] INT NOT NULL IDENTITY(1,1),
    [ventaId] NVARCHAR(100) NOT NULL,
    [productoId] NVARCHAR(100) NOT NULL,
    [nombre] NVARCHAR(1000) NOT NULL,
    [cantidad] INT NOT NULL,
    [precio] FLOAT(53) NOT NULL,
    [tax] BIT NOT NULL CONSTRAINT [FinVentaItem_tax_df] DEFAULT 0,
    CONSTRAINT [FinVentaItem_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[SisAudit] (
    [id] NVARCHAR(100) NOT NULL,
    [t] NVARCHAR(100) NOT NULL,
    [usr] NVARCHAR(1000) NOT NULL,
    [accion] NVARCHAR(1000) NOT NULL,
    [tabla] NVARCHAR(1000) NOT NULL,
    [registro] NVARCHAR(1000) NOT NULL,
    [prev] NVARCHAR(max) NOT NULL CONSTRAINT [SisAudit_prev_df] DEFAULT '',
    [next] NVARCHAR(max) NOT NULL CONSTRAINT [SisAudit_next_df] DEFAULT '',
    [ip] NVARCHAR(1000) NOT NULL CONSTRAINT [SisAudit_ip_df] DEFAULT '',
    CONSTRAINT [SisAudit_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[DocFolio] (
    [folio] NVARCHAR(100) NOT NULL,
    [tipo] NVARCHAR(1000) NOT NULL,
    [hash] NVARCHAR(1000) NOT NULL,
    [detalle] NVARCHAR(max) NOT NULL CONSTRAINT [DocFolio_detalle_df] DEFAULT '',
    [emitidoPor] NVARCHAR(1000) NOT NULL CONSTRAINT [DocFolio_emitidoPor_df] DEFAULT '',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [DocFolio_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [DocFolio_pkey] PRIMARY KEY CLUSTERED ([folio])
);

-- CreateTable
CREATE TABLE [dbo].[SisConfig] (
    [clave] NVARCHAR(100) NOT NULL,
    [valor] NVARCHAR(max) NOT NULL,
    CONSTRAINT [SisConfig_pkey] PRIMARY KEY CLUSTERED ([clave])
);

-- CreateTable
CREATE TABLE [dbo].[Ciclo] (
    [id] NVARCHAR(100) NOT NULL,
    [nombre] NVARCHAR(100) NOT NULL,
    [fechaInicio] NVARCHAR(10) NOT NULL,
    [fechaFin] NVARCHAR(10) NOT NULL,
    [estado] NVARCHAR(20) NOT NULL CONSTRAINT [Ciclo_estado_df] DEFAULT 'Planificado',
    CONSTRAINT [Ciclo_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Ciclo_nombre_key] UNIQUE NONCLUSTERED ([nombre])
);

-- CreateTable
CREATE TABLE [dbo].[PeriodoAcademico] (
    [id] NVARCHAR(100) NOT NULL,
    [cicloId] NVARCHAR(100) NOT NULL,
    [orden] INT NOT NULL,
    [nombre] NVARCHAR(100) NOT NULL,
    [fechaInicio] NVARCHAR(10) NOT NULL,
    [fechaFin] NVARCHAR(10) NOT NULL,
    CONSTRAINT [PeriodoAcademico_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PeriodoAcademico_cicloId_orden_key] UNIQUE NONCLUSTERED ([cicloId],[orden])
);

-- CreateTable
CREATE TABLE [dbo].[Matricula] (
    [id] NVARCHAR(100) NOT NULL,
    [alumnoId] NVARCHAR(100) NOT NULL,
    [cicloId] NVARCHAR(100) NOT NULL,
    [seccionId] NVARCHAR(100) NOT NULL,
    [estado] NVARCHAR(20) NOT NULL CONSTRAINT [Matricula_estado_df] DEFAULT 'Activo',
    [fechaIngreso] NVARCHAR(10) NOT NULL,
    [fechaRetiro] NVARCHAR(10),
    CONSTRAINT [Matricula_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Matricula_alumnoId_cicloId_key] UNIQUE NONCLUSTERED ([alumnoId],[cicloId])
);

-- CreateTable
CREATE TABLE [dbo].[AsistenciaResumen] (
    [id] INT NOT NULL IDENTITY(1,1),
    [matriculaId] NVARCHAR(100) NOT NULL,
    [periodoId] NVARCHAR(100) NOT NULL,
    [diasLectivos] INT NOT NULL,
    [presentes] INT NOT NULL,
    [tardanzas] INT NOT NULL,
    [ausenciasJustificadas] INT NOT NULL,
    [ausenciasInjustificadas] INT NOT NULL,
    CONSTRAINT [AsistenciaResumen_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [AsistenciaResumen_matriculaId_periodoId_key] UNIQUE NONCLUSTERED ([matriculaId],[periodoId])
);

-- CreateTable
CREATE TABLE [dbo].[TutorAlumno] (
    [id] INT NOT NULL IDENTITY(1,1),
    [alumnoId] NVARCHAR(100) NOT NULL,
    [tutorId] NVARCHAR(100) NOT NULL,
    [rol] NVARCHAR(20) NOT NULL,
    [desde] NVARCHAR(10) NOT NULL,
    [hasta] NVARCHAR(10),
    CONSTRAINT [TutorAlumno_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [TutorAlumno_alumnoId_tutorId_rol_desde_key] UNIQUE NONCLUSTERED ([alumnoId],[tutorId],[rol],[desde])
);

-- CreateTable
CREATE TABLE [dbo].[Nivel] (
    [id] NVARCHAR(100) NOT NULL,
    [nombre] NVARCHAR(100) NOT NULL,
    [orden] INT NOT NULL,
    CONSTRAINT [Nivel_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Nivel_nombre_key] UNIQUE NONCLUSTERED ([nombre]),
    CONSTRAINT [Nivel_orden_key] UNIQUE NONCLUSTERED ([orden])
);

-- CreateTable
CREATE TABLE [dbo].[Grado] (
    [id] NVARCHAR(100) NOT NULL,
    [nivelId] NVARCHAR(100) NOT NULL,
    [nombre] NVARCHAR(100) NOT NULL,
    [orden] INT NOT NULL,
    [estado] NVARCHAR(1000) NOT NULL CONSTRAINT [Grado_estado_df] DEFAULT 'Activo',
    CONSTRAINT [Grado_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Grado_nivelId_nombre_key] UNIQUE NONCLUSTERED ([nivelId],[nombre]),
    CONSTRAINT [Grado_orden_key] UNIQUE NONCLUSTERED ([orden])
);

-- CreateTable
CREATE TABLE [dbo].[Tanda] (
    [id] NVARCHAR(100) NOT NULL,
    [nombre] NVARCHAR(100) NOT NULL,
    [ini] NVARCHAR(10) NOT NULL,
    [fin] NVARCHAR(10) NOT NULL,
    [estado] NVARCHAR(1000) NOT NULL CONSTRAINT [Tanda_estado_df] DEFAULT 'Activo',
    CONSTRAINT [Tanda_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Tanda_nombre_key] UNIQUE NONCLUSTERED ([nombre])
);

-- CreateTable
CREATE TABLE [dbo].[Aula] (
    [id] NVARCHAR(100) NOT NULL,
    [nombre] NVARCHAR(100) NOT NULL,
    [tipo] NVARCHAR(100) NOT NULL,
    [edificio] NVARCHAR(200) NOT NULL CONSTRAINT [Aula_edificio_df] DEFAULT '',
    [pupitres] INT NOT NULL,
    [estado] NVARCHAR(1000) NOT NULL CONSTRAINT [Aula_estado_df] DEFAULT 'Activo',
    CONSTRAINT [Aula_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Aula_nombre_key] UNIQUE NONCLUSTERED ([nombre])
);

-- CreateTable
CREATE TABLE [dbo].[Seccion] (
    [id] NVARCHAR(100) NOT NULL,
    [gradoId] NVARCHAR(100) NOT NULL,
    [letra] NVARCHAR(20) NOT NULL,
    [tandaId] NVARCHAR(100) NOT NULL,
    [aulaBaseId] NVARCHAR(100),
    [cap] INT NOT NULL,
    [estado] NVARCHAR(1000) NOT NULL CONSTRAINT [Seccion_estado_df] DEFAULT 'Activo',
    CONSTRAINT [Seccion_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Seccion_gradoId_letra_tandaId_key] UNIQUE NONCLUSTERED ([gradoId],[letra],[tandaId])
);

-- CreateTable
CREATE TABLE [dbo].[Rubrica] (
    [id] NVARCHAR(100) NOT NULL,
    [nombre] NVARCHAR(200) NOT NULL,
    [escala] NVARCHAR(200) NOT NULL,
    [minimo] INT NOT NULL,
    [estado] NVARCHAR(1000) NOT NULL CONSTRAINT [Rubrica_estado_df] DEFAULT 'Activo',
    CONSTRAINT [Rubrica_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Rubrica_nombre_key] UNIQUE NONCLUSTERED ([nombre])
);

-- CreateTable
CREATE TABLE [dbo].[RubricaCriterio] (
    [rubricaId] NVARCHAR(100) NOT NULL,
    [orden] INT NOT NULL,
    [nombre] NVARCHAR(200) NOT NULL,
    [peso] FLOAT(53) NOT NULL,
    [clave] NVARCHAR(10),
    CONSTRAINT [RubricaCriterio_pkey] PRIMARY KEY CLUSTERED ([rubricaId],[orden])
);

-- CreateTable
CREATE TABLE [dbo].[Materia] (
    [id] NVARCHAR(100) NOT NULL,
    [codigo] NVARCHAR(100) NOT NULL,
    [nombre] NVARCHAR(200) NOT NULL,
    [horas] INT NOT NULL,
    [rubricaId] NVARCHAR(100),
    [estado] NVARCHAR(1000) NOT NULL CONSTRAINT [Materia_estado_df] DEFAULT 'Activo',
    CONSTRAINT [Materia_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Materia_codigo_key] UNIQUE NONCLUSTERED ([codigo])
);

-- CreateTable
CREATE TABLE [dbo].[MateriaGrado] (
    [materiaId] NVARCHAR(100) NOT NULL,
    [gradoId] NVARCHAR(100) NOT NULL,
    CONSTRAINT [MateriaGrado_pkey] PRIMARY KEY CLUSTERED ([materiaId],[gradoId])
);

-- CreateTable
CREATE TABLE [dbo].[SeccionMateria] (
    [seccionId] NVARCHAR(100) NOT NULL,
    [materiaId] NVARCHAR(100) NOT NULL,
    [horas] INT NOT NULL,
    CONSTRAINT [SeccionMateria_pkey] PRIMARY KEY CLUSTERED ([seccionId],[materiaId])
);

-- CreateTable
CREATE TABLE [dbo].[Docente] (
    [id] NVARCHAR(100) NOT NULL,
    [nombre] NVARCHAR(1000) NOT NULL,
    [cedula] NVARCHAR(100) NOT NULL,
    [esp] NVARCHAR(1000) NOT NULL CONSTRAINT [Docente_esp_df] DEFAULT '',
    [email] NVARCHAR(1000) NOT NULL CONSTRAINT [Docente_email_df] DEFAULT '',
    [tel] NVARCHAR(1000) NOT NULL CONSTRAINT [Docente_tel_df] DEFAULT '',
    [usuario] NVARCHAR(100),
    [rol] NVARCHAR(100) NOT NULL CONSTRAINT [Docente_rol_df] DEFAULT 'Docente',
    [userId] NVARCHAR(100),
    [estado] NVARCHAR(1000) NOT NULL CONSTRAINT [Docente_estado_df] DEFAULT 'Activo',
    CONSTRAINT [Docente_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Docente_cedula_key] UNIQUE NONCLUSTERED ([cedula])
);

-- CreateTable
CREATE TABLE [dbo].[Empleado] (
    [id] NVARCHAR(100) NOT NULL,
    [nombre] NVARCHAR(1000) NOT NULL,
    [cargo] NVARCHAR(1000) NOT NULL CONSTRAINT [Empleado_cargo_df] DEFAULT '',
    [usuario] NVARCHAR(100),
    [rol] NVARCHAR(100) NOT NULL CONSTRAINT [Empleado_rol_df] DEFAULT 'Cajero',
    [userId] NVARCHAR(100),
    [cajaId] NVARCHAR(100),
    [tel] NVARCHAR(1000) NOT NULL CONSTRAINT [Empleado_tel_df] DEFAULT '',
    [email] NVARCHAR(1000) NOT NULL CONSTRAINT [Empleado_email_df] DEFAULT '',
    [estado] NVARCHAR(1000) NOT NULL CONSTRAINT [Empleado_estado_df] DEFAULT 'Activo',
    CONSTRAINT [Empleado_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[DocenteMateria] (
    [docenteId] NVARCHAR(100) NOT NULL,
    [materiaId] NVARCHAR(100) NOT NULL,
    CONSTRAINT [DocenteMateria_pkey] PRIMARY KEY CLUSTERED ([docenteId],[materiaId])
);

-- CreateTable
CREATE TABLE [dbo].[DocenteSeccion] (
    [docenteId] NVARCHAR(100) NOT NULL,
    [seccionId] NVARCHAR(100) NOT NULL,
    CONSTRAINT [DocenteSeccion_pkey] PRIMARY KEY CLUSTERED ([docenteId],[seccionId])
);

-- CreateTable
CREATE TABLE [dbo].[AcadRoster] (
    [id] NVARCHAR(100) NOT NULL,
    [seccionId] NVARCHAR(100) NOT NULL,
    [orden] INT NOT NULL,
    [nombre] NVARCHAR(1000) NOT NULL,
    [alumnoId] NVARCHAR(100),
    CONSTRAINT [AcadRoster_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[AcadNota] (
    [id] NVARCHAR(100) NOT NULL,
    [rosterId] NVARCHAR(100) NOT NULL,
    [materiaId] NVARCHAR(100) NOT NULL,
    [periodoId] NVARCHAR(100) NOT NULL,
    [c1] FLOAT(53),
    [c2] FLOAT(53),
    [c3] FLOAT(53),
    [c4] FLOAT(53),
    [ex] FLOAT(53),
    CONSTRAINT [AcadNota_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [AcadNota_rosterId_materiaId_periodoId_key] UNIQUE NONCLUSTERED ([rosterId],[materiaId],[periodoId])
);

-- CreateTable
CREATE TABLE [dbo].[AcadAsistencia] (
    [id] NVARCHAR(100) NOT NULL,
    [rosterId] NVARCHAR(100) NOT NULL,
    [fecha] NVARCHAR(100) NOT NULL,
    [estado] NVARCHAR(1000) NOT NULL,
    [notificar] BIT NOT NULL CONSTRAINT [AcadAsistencia_notificar_df] DEFAULT 1,
    CONSTRAINT [AcadAsistencia_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [AcadAsistencia_rosterId_fecha_key] UNIQUE NONCLUSTERED ([rosterId],[fecha])
);

-- CreateTable
CREATE TABLE [dbo].[AcadAsignacion] (
    [id] NVARCHAR(100) NOT NULL,
    [cicloId] NVARCHAR(100) NOT NULL,
    [docenteId] NVARCHAR(100) NOT NULL,
    [seccionId] NVARCHAR(100) NOT NULL,
    [materiaId] NVARCHAR(100) NOT NULL,
    [heredada] BIT NOT NULL CONSTRAINT [AcadAsignacion_heredada_df] DEFAULT 0,
    [aulaElegidaId] NVARCHAR(100),
    CONSTRAINT [AcadAsignacion_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [AcadAsignacion_cicloId_seccionId_materiaId_key] UNIQUE NONCLUSTERED ([cicloId],[seccionId],[materiaId]),
    CONSTRAINT [AcadAsignacion_cicloId_docenteId_seccionId_materiaId_key] UNIQUE NONCLUSTERED ([cicloId],[docenteId],[seccionId],[materiaId])
);

-- CreateTable
CREATE TABLE [dbo].[AsignacionAula] (
    [asignacionId] NVARCHAR(100) NOT NULL,
    [aulaId] NVARCHAR(100) NOT NULL,
    [orden] INT NOT NULL CONSTRAINT [AsignacionAula_orden_df] DEFAULT 0,
    CONSTRAINT [AsignacionAula_pkey] PRIMARY KEY CLUSTERED ([asignacionId],[aulaId])
);

-- CreateTable
CREATE TABLE [dbo].[AcadHorario] (
    [id] NVARCHAR(100) NOT NULL,
    [cicloId] NVARCHAR(100) NOT NULL,
    [seccionId] NVARCHAR(100) NOT NULL,
    [slot] NVARCHAR(100) NOT NULL,
    [materiaId] NVARCHAR(100) NOT NULL,
    CONSTRAINT [AcadHorario_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [AcadHorario_cicloId_seccionId_slot_key] UNIQUE NONCLUSTERED ([cicloId],[seccionId],[slot])
);

-- CreateTable
CREATE TABLE [dbo].[AcadExtra] (
    [id] NVARCHAR(100) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [cat] NVARCHAR(1000) NOT NULL,
    [kind] NVARCHAR(1000) NOT NULL,
    [instructor] NVARCHAR(1000) NOT NULL,
    [docenteId] NVARCHAR(100),
    [lugar] NVARCHAR(1000) NOT NULL,
    [aulaId] NVARCHAR(100),
    [dias] NVARCHAR(1000) NOT NULL,
    [hora] NVARCHAR(1000) NOT NULL,
    [cupo] INT NOT NULL,
    [inscritos] INT NOT NULL CONSTRAINT [AcadExtra_inscritos_df] DEFAULT 0,
    [costo] FLOAT(53) NOT NULL CONSTRAINT [AcadExtra_costo_df] DEFAULT 0,
    [ini] NVARCHAR(1000) NOT NULL CONSTRAINT [AcadExtra_ini_df] DEFAULT '',
    [sem] INT NOT NULL CONSTRAINT [AcadExtra_sem_df] DEFAULT 0,
    [estado] NVARCHAR(1000) NOT NULL CONSTRAINT [AcadExtra_estado_df] DEFAULT 'Abierta',
    CONSTRAINT [AcadExtra_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[AcadExtraGrado] (
    [extraId] NVARCHAR(100) NOT NULL,
    [gradoId] NVARCHAR(100) NOT NULL,
    CONSTRAINT [AcadExtraGrado_pkey] PRIMARY KEY CLUSTERED ([extraId],[gradoId])
);

-- CreateTable
CREATE TABLE [dbo].[PersExpediente] (
    [alumnoId] NVARCHAR(100) NOT NULL,
    [data] NVARCHAR(max) NOT NULL CONSTRAINT [PersExpediente_data_df] DEFAULT '{}',
    CONSTRAINT [PersExpediente_pkey] PRIMARY KEY CLUSTERED ([alumnoId])
);

-- CreateTable
CREATE TABLE [dbo].[PersDocumento] (
    [id] NVARCHAR(100) NOT NULL,
    [alumnoId] NVARCHAR(100) NOT NULL,
    [tipoId] NVARCHAR(100) NOT NULL,
    [f] NVARCHAR(1000) NOT NULL,
    [est] NVARCHAR(1000) NOT NULL,
    [orden] INT NOT NULL CONSTRAINT [PersDocumento_orden_df] DEFAULT 0,
    CONSTRAINT [PersDocumento_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PersDocumento_alumnoId_tipoId_key] UNIQUE NONCLUSTERED ([alumnoId],[tipoId])
);

-- CreateTable
CREATE TABLE [dbo].[TipoDocumento] (
    [id] NVARCHAR(100) NOT NULL,
    [nombre] NVARCHAR(200) NOT NULL,
    [requerido] BIT NOT NULL CONSTRAINT [TipoDocumento_requerido_df] DEFAULT 1,
    [orden] INT NOT NULL CONSTRAINT [TipoDocumento_orden_df] DEFAULT 0,
    [estado] NVARCHAR(1000) NOT NULL CONSTRAINT [TipoDocumento_estado_df] DEFAULT 'Activo',
    CONSTRAINT [TipoDocumento_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [TipoDocumento_nombre_key] UNIQUE NONCLUSTERED ([nombre])
);

-- CreateTable
CREATE TABLE [dbo].[ServicioAlumno] (
    [id] NVARCHAR(100) NOT NULL,
    [alumnoId] NVARCHAR(100) NOT NULL,
    [kind] NVARCHAR(1000) NOT NULL,
    [rutaId] NVARCHAR(100),
    [aliPlanId] NVARCHAR(100),
    [extraId] NVARCHAR(100),
    [productoId] NVARCHAR(100),
    [name] NVARCHAR(1000) NOT NULL,
    [icon] NVARCHAR(1000) NOT NULL CONSTRAINT [ServicioAlumno_icon_df] DEFAULT '',
    [spec] NVARCHAR(1000) NOT NULL CONSTRAINT [ServicioAlumno_spec_df] DEFAULT '',
    [cost] FLOAT(53) NOT NULL,
    [corte] NVARCHAR(1000) NOT NULL CONSTRAINT [ServicioAlumno_corte_df] DEFAULT '',
    [est] NVARCHAR(1000) NOT NULL CONSTRAINT [ServicioAlumno_est_df] DEFAULT 'Activo',
    [alert] NVARCHAR(1000) NOT NULL CONSTRAINT [ServicioAlumno_alert_df] DEFAULT '',
    [fecha] NVARCHAR(100) NOT NULL CONSTRAINT [ServicioAlumno_fecha_df] DEFAULT '',
    [st] NVARCHAR(1000) NOT NULL CONSTRAINT [ServicioAlumno_st_df] DEFAULT '',
    [mes] NVARCHAR(1000) NOT NULL CONSTRAINT [ServicioAlumno_mes_df] DEFAULT '',
    [reciboId] NVARCHAR(100),
    CONSTRAINT [ServicioAlumno_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[PersInscripcion] (
    [id] NVARCHAR(100) NOT NULL,
    [alumnoId] NVARCHAR(100) NOT NULL,
    [cicloId] NVARCHAR(100) NOT NULL,
    [ncf] NVARCHAR(100) NOT NULL,
    [factura] FLOAT(53) NOT NULL,
    [planId] NVARCHAR(100) NOT NULL,
    [cuotas] INT NOT NULL,
    [firma] NVARCHAR(1000) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PersInscripcion_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PersInscripcion_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PersInscripcion_ncf_key] UNIQUE NONCLUSTERED ([ncf]),
    CONSTRAINT [PersInscripcion_alumnoId_cicloId_key] UNIQUE NONCLUSTERED ([alumnoId],[cicloId])
);

-- CreateTable
CREATE TABLE [dbo].[Contrato] (
    [id] NVARCHAR(100) NOT NULL,
    [alumnoId] NVARCHAR(100) NOT NULL,
    [cicloId] NVARCHAR(100) NOT NULL,
    [planId] NVARCHAR(100) NOT NULL,
    [tipoBecaId] NVARCHAR(100),
    [ctr] NVARCHAR(1000) NOT NULL CONSTRAINT [Contrato_ctr_df] DEFAULT '',
    [firmado] NVARCHAR(1000) NOT NULL CONSTRAINT [Contrato_firmado_df] DEFAULT '',
    CONSTRAINT [Contrato_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Contrato_alumnoId_cicloId_key] UNIQUE NONCLUSTERED ([alumnoId],[cicloId])
);

-- CreateTable
CREATE TABLE [dbo].[Caja] (
    [id] NVARCHAR(100) NOT NULL,
    [codigo] NVARCHAR(100) NOT NULL,
    [ubic] NVARCHAR(300) NOT NULL CONSTRAINT [Caja_ubic_df] DEFAULT '',
    [ncf] NVARCHAR(100) NOT NULL,
    [estado] NVARCHAR(1000) NOT NULL CONSTRAINT [Caja_estado_df] DEFAULT 'Activa',
    CONSTRAINT [Caja_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Caja_codigo_key] UNIQUE NONCLUSTERED ([codigo])
);

-- CreateTable
CREATE TABLE [dbo].[RutaTransporte] (
    [id] NVARCHAR(100) NOT NULL,
    [nombre] NVARCHAR(200) NOT NULL,
    [sectores] NVARCHAR(500) NOT NULL CONSTRAINT [RutaTransporte_sectores_df] DEFAULT '',
    [chofer] NVARCHAR(1000) NOT NULL CONSTRAINT [RutaTransporte_chofer_df] DEFAULT '',
    [ficha] NVARCHAR(100) NOT NULL,
    [asientos] INT NOT NULL,
    [tarifa] FLOAT(53) NOT NULL,
    [estado] NVARCHAR(1000) NOT NULL CONSTRAINT [RutaTransporte_estado_df] DEFAULT 'Activo',
    CONSTRAINT [RutaTransporte_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [RutaTransporte_nombre_key] UNIQUE NONCLUSTERED ([nombre]),
    CONSTRAINT [RutaTransporte_ficha_key] UNIQUE NONCLUSTERED ([ficha])
);

-- CreateTable
CREATE TABLE [dbo].[TipoBeca] (
    [id] NVARCHAR(100) NOT NULL,
    [nombre] NVARCHAR(200) NOT NULL,
    [pct] FLOAT(53) NOT NULL CONSTRAINT [TipoBeca_pct_df] DEFAULT 0,
    [requiereAprobacion] BIT NOT NULL CONSTRAINT [TipoBeca_requiereAprobacion_df] DEFAULT 0,
    [estado] NVARCHAR(1000) NOT NULL CONSTRAINT [TipoBeca_estado_df] DEFAULT 'Activo',
    CONSTRAINT [TipoBeca_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [TipoBeca_nombre_key] UNIQUE NONCLUSTERED ([nombre])
);

-- CreateTable
CREATE TABLE [dbo].[ConceptoBeca] (
    [id] NVARCHAR(100) NOT NULL,
    [nombre] NVARCHAR(200) NOT NULL,
    [estado] NVARCHAR(1000) NOT NULL CONSTRAINT [ConceptoBeca_estado_df] DEFAULT 'Activo',
    CONSTRAINT [ConceptoBeca_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ConceptoBeca_nombre_key] UNIQUE NONCLUSTERED ([nombre])
);

-- CreateTable
CREATE TABLE [dbo].[FinBecaConcepto] (
    [becaId] NVARCHAR(100) NOT NULL,
    [conceptoId] NVARCHAR(100) NOT NULL,
    [orden] INT NOT NULL CONSTRAINT [FinBecaConcepto_orden_df] DEFAULT 0,
    CONSTRAINT [FinBecaConcepto_pkey] PRIMARY KEY CLUSTERED ([becaId],[conceptoId])
);

-- CreateTable
CREATE TABLE [dbo].[MetodoPago] (
    [id] NVARCHAR(100) NOT NULL,
    [nombre] NVARCHAR(200) NOT NULL,
    [ref] NVARCHAR(200),
    [estado] NVARCHAR(1000) NOT NULL CONSTRAINT [MetodoPago_estado_df] DEFAULT 'Activo',
    CONSTRAINT [MetodoPago_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [MetodoPago_nombre_key] UNIQUE NONCLUSTERED ([nombre])
);

-- CreateTable
CREATE TABLE [dbo].[Comida] (
    [id] NVARCHAR(100) NOT NULL,
    [nombre] NVARCHAR(200) NOT NULL,
    [estado] NVARCHAR(1000) NOT NULL CONSTRAINT [Comida_estado_df] DEFAULT 'Activo',
    CONSTRAINT [Comida_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Comida_nombre_key] UNIQUE NONCLUSTERED ([nombre])
);

-- CreateTable
CREATE TABLE [dbo].[Dieta] (
    [id] NVARCHAR(100) NOT NULL,
    [nombre] NVARCHAR(200) NOT NULL,
    [estado] NVARCHAR(1000) NOT NULL CONSTRAINT [Dieta_estado_df] DEFAULT 'Activo',
    CONSTRAINT [Dieta_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Dieta_nombre_key] UNIQUE NONCLUSTERED ([nombre])
);

-- CreateTable
CREATE TABLE [dbo].[Alergia] (
    [id] NVARCHAR(100) NOT NULL,
    [nombre] NVARCHAR(200) NOT NULL,
    [estado] NVARCHAR(1000) NOT NULL CONSTRAINT [Alergia_estado_df] DEFAULT 'Activo',
    CONSTRAINT [Alergia_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Alergia_nombre_key] UNIQUE NONCLUSTERED ([nombre])
);

-- CreateTable
CREATE TABLE [dbo].[CategoriaProducto] (
    [id] NVARCHAR(100) NOT NULL,
    [nombre] NVARCHAR(200) NOT NULL,
    [estado] NVARCHAR(1000) NOT NULL CONSTRAINT [CategoriaProducto_estado_df] DEFAULT 'Activo',
    CONSTRAINT [CategoriaProducto_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [CategoriaProducto_nombre_key] UNIQUE NONCLUSTERED ([nombre])
);

-- CreateTable
CREATE TABLE [dbo].[AliPlanComida] (
    [planId] NVARCHAR(100) NOT NULL,
    [comidaId] NVARCHAR(100) NOT NULL,
    CONSTRAINT [AliPlanComida_pkey] PRIMARY KEY CLUSTERED ([planId],[comidaId])
);

-- CreateTable
CREATE TABLE [dbo].[AliPlanDieta] (
    [planId] NVARCHAR(100) NOT NULL,
    [dietaId] NVARCHAR(100) NOT NULL,
    CONSTRAINT [AliPlanDieta_pkey] PRIMARY KEY CLUSTERED ([planId],[dietaId])
);

-- CreateTable
CREATE TABLE [dbo].[AlumnoAlergia] (
    [alumnoId] NVARCHAR(100) NOT NULL,
    [alergiaId] NVARCHAR(100) NOT NULL,
    CONSTRAINT [AlumnoAlergia_pkey] PRIMARY KEY CLUSTERED ([alumnoId],[alergiaId])
);

-- CreateTable
CREATE TABLE [dbo].[AliMenuAlergia] (
    [menuOrden] INT NOT NULL,
    [alergiaId] NVARCHAR(100) NOT NULL,
    CONSTRAINT [AliMenuAlergia_pkey] PRIMARY KEY CLUSTERED ([menuOrden],[alergiaId])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Tutor_userId_idx] ON [dbo].[Tutor]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Alumno_tutorId_idx] ON [dbo].[Alumno]([tutorId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Alumno_tutorLegalId_idx] ON [dbo].[Alumno]([tutorLegalId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Alumno_seccionId_idx] ON [dbo].[Alumno]([seccionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MobNota_alumnoId_idx] ON [dbo].[MobNota]([alumnoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MobNota_materiaId_idx] ON [dbo].[MobNota]([materiaId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MonederoMovimiento_alumnoId_creado_idx] ON [dbo].[MonederoMovimiento]([alumnoId], [creado]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MonederoMovimiento_intencionId_idx] ON [dbo].[MonederoMovimiento]([intencionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MobAcceso_alumnoId_idx] ON [dbo].[MobAcceso]([alumnoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ComCarnet_aliPlanId_idx] ON [dbo].[ComCarnet]([aliPlanId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ComLectura_alumnoId_idx] ON [dbo].[ComLectura]([alumnoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CmnMensaje_tutorId_idx] ON [dbo].[CmnMensaje]([tutorId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CmnMensaje_userId_idx] ON [dbo].[CmnMensaje]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MobPagoIntencion_estado_idx] ON [dbo].[MobPagoIntencion]([estado]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MobPagoIntencion_alumnoId_idx] ON [dbo].[MobPagoIntencion]([alumnoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MobPagoIntencion_tutorId_idx] ON [dbo].[MobPagoIntencion]([tutorId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MobPagoIntencion_reciboId_idx] ON [dbo].[MobPagoIntencion]([reciboId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MobPagoIntencion_resueltoPorId_idx] ON [dbo].[MobPagoIntencion]([resueltoPorId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MobPagoIntencionCargo_cobroItemId_idx] ON [dbo].[MobPagoIntencionCargo]([cobroItemId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FinCobroItem_alumnoId_paid_idx] ON [dbo].[FinCobroItem]([alumnoId], [paid]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FinCobroItem_tutorId_idx] ON [dbo].[FinCobroItem]([tutorId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FinCobroItem_servicioId_idx] ON [dbo].[FinCobroItem]([servicioId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FinCobroItem_cicloId_paid_idx] ON [dbo].[FinCobroItem]([cicloId], [paid]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FinRecibo_tutorId_idx] ON [dbo].[FinRecibo]([tutorId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FinRecibo_cicloId_idx] ON [dbo].[FinRecibo]([cicloId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FinRecibo_cajeroId_idx] ON [dbo].[FinRecibo]([cajeroId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FinRecibo_cajaId_idx] ON [dbo].[FinRecibo]([cajaId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FinRecibo_metodoPagoId_idx] ON [dbo].[FinRecibo]([metodoPagoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FinRecibo_createdAt_idx] ON [dbo].[FinRecibo]([createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FinReciboItem_cobroItemId_idx] ON [dbo].[FinReciboItem]([cobroItemId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FinReciboPago_metodoPagoId_idx] ON [dbo].[FinReciboPago]([metodoPagoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FinPlanTanda_tandaId_idx] ON [dbo].[FinPlanTanda]([tandaId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FinBeca_alumnoId_idx] ON [dbo].[FinBeca]([alumnoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FinBeca_tipoBecaId_idx] ON [dbo].[FinBeca]([tipoBecaId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FinBeca_cicloId_idx] ON [dbo].[FinBeca]([cicloId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FinProducto_categoriaId_idx] ON [dbo].[FinProducto]([categoriaId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FinMovimiento_productoId_idx] ON [dbo].[FinMovimiento]([productoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FinMovimiento_ventaId_idx] ON [dbo].[FinMovimiento]([ventaId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FinVenta_metodoPagoId_idx] ON [dbo].[FinVenta]([metodoPagoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FinVentaItem_ventaId_idx] ON [dbo].[FinVentaItem]([ventaId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FinVentaItem_productoId_idx] ON [dbo].[FinVentaItem]([productoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SisAudit_t_idx] ON [dbo].[SisAudit]([t]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Matricula_cicloId_idx] ON [dbo].[Matricula]([cicloId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Matricula_seccionId_idx] ON [dbo].[Matricula]([seccionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AsistenciaResumen_periodoId_idx] ON [dbo].[AsistenciaResumen]([periodoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [TutorAlumno_tutorId_idx] ON [dbo].[TutorAlumno]([tutorId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Seccion_tandaId_idx] ON [dbo].[Seccion]([tandaId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Seccion_aulaBaseId_idx] ON [dbo].[Seccion]([aulaBaseId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Materia_rubricaId_idx] ON [dbo].[Materia]([rubricaId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MateriaGrado_gradoId_idx] ON [dbo].[MateriaGrado]([gradoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SeccionMateria_materiaId_idx] ON [dbo].[SeccionMateria]([materiaId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Docente_userId_idx] ON [dbo].[Docente]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Empleado_userId_idx] ON [dbo].[Empleado]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Empleado_cajaId_idx] ON [dbo].[Empleado]([cajaId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [DocenteMateria_materiaId_idx] ON [dbo].[DocenteMateria]([materiaId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [DocenteSeccion_seccionId_idx] ON [dbo].[DocenteSeccion]([seccionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AcadRoster_seccionId_idx] ON [dbo].[AcadRoster]([seccionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AcadRoster_alumnoId_idx] ON [dbo].[AcadRoster]([alumnoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AcadNota_materiaId_idx] ON [dbo].[AcadNota]([materiaId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AcadNota_periodoId_idx] ON [dbo].[AcadNota]([periodoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AcadAsignacion_materiaId_idx] ON [dbo].[AcadAsignacion]([materiaId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AcadAsignacion_seccionId_idx] ON [dbo].[AcadAsignacion]([seccionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AcadAsignacion_docenteId_idx] ON [dbo].[AcadAsignacion]([docenteId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AcadAsignacion_aulaElegidaId_idx] ON [dbo].[AcadAsignacion]([aulaElegidaId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AsignacionAula_aulaId_idx] ON [dbo].[AsignacionAula]([aulaId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AcadHorario_materiaId_idx] ON [dbo].[AcadHorario]([materiaId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AcadHorario_seccionId_idx] ON [dbo].[AcadHorario]([seccionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AcadExtra_docenteId_idx] ON [dbo].[AcadExtra]([docenteId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AcadExtra_aulaId_idx] ON [dbo].[AcadExtra]([aulaId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AcadExtraGrado_gradoId_idx] ON [dbo].[AcadExtraGrado]([gradoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PersDocumento_alumnoId_idx] ON [dbo].[PersDocumento]([alumnoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PersDocumento_tipoId_idx] ON [dbo].[PersDocumento]([tipoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ServicioAlumno_alumnoId_idx] ON [dbo].[ServicioAlumno]([alumnoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ServicioAlumno_reciboId_idx] ON [dbo].[ServicioAlumno]([reciboId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ServicioAlumno_rutaId_idx] ON [dbo].[ServicioAlumno]([rutaId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ServicioAlumno_aliPlanId_idx] ON [dbo].[ServicioAlumno]([aliPlanId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ServicioAlumno_extraId_idx] ON [dbo].[ServicioAlumno]([extraId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ServicioAlumno_productoId_idx] ON [dbo].[ServicioAlumno]([productoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PersInscripcion_planId_idx] ON [dbo].[PersInscripcion]([planId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PersInscripcion_cicloId_idx] ON [dbo].[PersInscripcion]([cicloId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Contrato_planId_idx] ON [dbo].[Contrato]([planId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Contrato_tipoBecaId_idx] ON [dbo].[Contrato]([tipoBecaId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Contrato_cicloId_idx] ON [dbo].[Contrato]([cicloId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FinBecaConcepto_conceptoId_idx] ON [dbo].[FinBecaConcepto]([conceptoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AliPlanComida_comidaId_idx] ON [dbo].[AliPlanComida]([comidaId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AliPlanDieta_dietaId_idx] ON [dbo].[AliPlanDieta]([dietaId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AlumnoAlergia_alergiaId_idx] ON [dbo].[AlumnoAlergia]([alergiaId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AliMenuAlergia_alergiaId_idx] ON [dbo].[AliMenuAlergia]([alergiaId]);

-- AddForeignKey
ALTER TABLE [dbo].[Tutor] ADD CONSTRAINT [Tutor_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Alumno] ADD CONSTRAINT [Alumno_seccionId_fkey] FOREIGN KEY ([seccionId]) REFERENCES [dbo].[Seccion]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Alumno] ADD CONSTRAINT [Alumno_tutorId_fkey] FOREIGN KEY ([tutorId]) REFERENCES [dbo].[Tutor]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Alumno] ADD CONSTRAINT [Alumno_tutorLegalId_fkey] FOREIGN KEY ([tutorLegalId]) REFERENCES [dbo].[Tutor]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MobNota] ADD CONSTRAINT [MobNota_alumnoId_fkey] FOREIGN KEY ([alumnoId]) REFERENCES [dbo].[Alumno]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MobNota] ADD CONSTRAINT [MobNota_materiaId_fkey] FOREIGN KEY ([materiaId]) REFERENCES [dbo].[Materia]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Monedero] ADD CONSTRAINT [Monedero_alumnoId_fkey] FOREIGN KEY ([alumnoId]) REFERENCES [dbo].[Alumno]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MonederoMovimiento] ADD CONSTRAINT [MonederoMovimiento_alumnoId_fkey] FOREIGN KEY ([alumnoId]) REFERENCES [dbo].[Monedero]([alumnoId]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MonederoMovimiento] ADD CONSTRAINT [MonederoMovimiento_intencionId_fkey] FOREIGN KEY ([intencionId]) REFERENCES [dbo].[MobPagoIntencion]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MobAcceso] ADD CONSTRAINT [MobAcceso_alumnoId_fkey] FOREIGN KEY ([alumnoId]) REFERENCES [dbo].[Alumno]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ComCarnet] ADD CONSTRAINT [ComCarnet_alumnoId_fkey] FOREIGN KEY ([alumnoId]) REFERENCES [dbo].[Alumno]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ComCarnet] ADD CONSTRAINT [ComCarnet_aliPlanId_fkey] FOREIGN KEY ([aliPlanId]) REFERENCES [dbo].[AliPlan]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ComLectura] ADD CONSTRAINT [ComLectura_alumnoId_fkey] FOREIGN KEY ([alumnoId]) REFERENCES [dbo].[Alumno]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CmnMensaje] ADD CONSTRAINT [CmnMensaje_tutorId_fkey] FOREIGN KEY ([tutorId]) REFERENCES [dbo].[Tutor]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CmnMensaje] ADD CONSTRAINT [CmnMensaje_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MobPagoIntencion] ADD CONSTRAINT [MobPagoIntencion_alumnoId_fkey] FOREIGN KEY ([alumnoId]) REFERENCES [dbo].[Alumno]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MobPagoIntencion] ADD CONSTRAINT [MobPagoIntencion_tutorId_fkey] FOREIGN KEY ([tutorId]) REFERENCES [dbo].[Tutor]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MobPagoIntencion] ADD CONSTRAINT [MobPagoIntencion_resueltoPorId_fkey] FOREIGN KEY ([resueltoPorId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MobPagoIntencion] ADD CONSTRAINT [MobPagoIntencion_reciboId_fkey] FOREIGN KEY ([reciboId]) REFERENCES [dbo].[FinRecibo]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MobPagoIntencionCargo] ADD CONSTRAINT [MobPagoIntencionCargo_intencionId_fkey] FOREIGN KEY ([intencionId]) REFERENCES [dbo].[MobPagoIntencion]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MobPagoIntencionCargo] ADD CONSTRAINT [MobPagoIntencionCargo_cobroItemId_fkey] FOREIGN KEY ([cobroItemId]) REFERENCES [dbo].[FinCobroItem]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinCobroItem] ADD CONSTRAINT [FinCobroItem_alumnoId_fkey] FOREIGN KEY ([alumnoId]) REFERENCES [dbo].[Alumno]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinCobroItem] ADD CONSTRAINT [FinCobroItem_tutorId_fkey] FOREIGN KEY ([tutorId]) REFERENCES [dbo].[Tutor]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinCobroItem] ADD CONSTRAINT [FinCobroItem_servicioId_fkey] FOREIGN KEY ([servicioId]) REFERENCES [dbo].[ServicioAlumno]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinCobroItem] ADD CONSTRAINT [FinCobroItem_cicloId_fkey] FOREIGN KEY ([cicloId]) REFERENCES [dbo].[Ciclo]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinRecibo] ADD CONSTRAINT [FinRecibo_tutorId_fkey] FOREIGN KEY ([tutorId]) REFERENCES [dbo].[Tutor]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinRecibo] ADD CONSTRAINT [FinRecibo_cajaId_fkey] FOREIGN KEY ([cajaId]) REFERENCES [dbo].[Caja]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinRecibo] ADD CONSTRAINT [FinRecibo_cicloId_fkey] FOREIGN KEY ([cicloId]) REFERENCES [dbo].[Ciclo]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinRecibo] ADD CONSTRAINT [FinRecibo_metodoPagoId_fkey] FOREIGN KEY ([metodoPagoId]) REFERENCES [dbo].[MetodoPago]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinRecibo] ADD CONSTRAINT [FinRecibo_cajeroId_fkey] FOREIGN KEY ([cajeroId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinReciboItem] ADD CONSTRAINT [FinReciboItem_reciboId_fkey] FOREIGN KEY ([reciboId]) REFERENCES [dbo].[FinRecibo]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinReciboItem] ADD CONSTRAINT [FinReciboItem_cobroItemId_fkey] FOREIGN KEY ([cobroItemId]) REFERENCES [dbo].[FinCobroItem]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinReciboPago] ADD CONSTRAINT [FinReciboPago_reciboId_fkey] FOREIGN KEY ([reciboId]) REFERENCES [dbo].[FinRecibo]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinReciboPago] ADD CONSTRAINT [FinReciboPago_metodoPagoId_fkey] FOREIGN KEY ([metodoPagoId]) REFERENCES [dbo].[MetodoPago]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinPlanTanda] ADD CONSTRAINT [FinPlanTanda_planId_fkey] FOREIGN KEY ([planId]) REFERENCES [dbo].[FinPlan]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinPlanTanda] ADD CONSTRAINT [FinPlanTanda_tandaId_fkey] FOREIGN KEY ([tandaId]) REFERENCES [dbo].[Tanda]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinBeca] ADD CONSTRAINT [FinBeca_cicloId_fkey] FOREIGN KEY ([cicloId]) REFERENCES [dbo].[Ciclo]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinBeca] ADD CONSTRAINT [FinBeca_alumnoId_fkey] FOREIGN KEY ([alumnoId]) REFERENCES [dbo].[Alumno]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinBeca] ADD CONSTRAINT [FinBeca_tipoBecaId_fkey] FOREIGN KEY ([tipoBecaId]) REFERENCES [dbo].[TipoBeca]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinProducto] ADD CONSTRAINT [FinProducto_categoriaId_fkey] FOREIGN KEY ([categoriaId]) REFERENCES [dbo].[CategoriaProducto]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinMovimiento] ADD CONSTRAINT [FinMovimiento_productoId_fkey] FOREIGN KEY ([productoId]) REFERENCES [dbo].[FinProducto]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinMovimiento] ADD CONSTRAINT [FinMovimiento_ventaId_fkey] FOREIGN KEY ([ventaId]) REFERENCES [dbo].[FinVenta]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinVenta] ADD CONSTRAINT [FinVenta_metodoPagoId_fkey] FOREIGN KEY ([metodoPagoId]) REFERENCES [dbo].[MetodoPago]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinVentaItem] ADD CONSTRAINT [FinVentaItem_ventaId_fkey] FOREIGN KEY ([ventaId]) REFERENCES [dbo].[FinVenta]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinVentaItem] ADD CONSTRAINT [FinVentaItem_productoId_fkey] FOREIGN KEY ([productoId]) REFERENCES [dbo].[FinProducto]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PeriodoAcademico] ADD CONSTRAINT [PeriodoAcademico_cicloId_fkey] FOREIGN KEY ([cicloId]) REFERENCES [dbo].[Ciclo]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Matricula] ADD CONSTRAINT [Matricula_alumnoId_fkey] FOREIGN KEY ([alumnoId]) REFERENCES [dbo].[Alumno]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Matricula] ADD CONSTRAINT [Matricula_cicloId_fkey] FOREIGN KEY ([cicloId]) REFERENCES [dbo].[Ciclo]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Matricula] ADD CONSTRAINT [Matricula_seccionId_fkey] FOREIGN KEY ([seccionId]) REFERENCES [dbo].[Seccion]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AsistenciaResumen] ADD CONSTRAINT [AsistenciaResumen_matriculaId_fkey] FOREIGN KEY ([matriculaId]) REFERENCES [dbo].[Matricula]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AsistenciaResumen] ADD CONSTRAINT [AsistenciaResumen_periodoId_fkey] FOREIGN KEY ([periodoId]) REFERENCES [dbo].[PeriodoAcademico]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[TutorAlumno] ADD CONSTRAINT [TutorAlumno_alumnoId_fkey] FOREIGN KEY ([alumnoId]) REFERENCES [dbo].[Alumno]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[TutorAlumno] ADD CONSTRAINT [TutorAlumno_tutorId_fkey] FOREIGN KEY ([tutorId]) REFERENCES [dbo].[Tutor]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Grado] ADD CONSTRAINT [Grado_nivelId_fkey] FOREIGN KEY ([nivelId]) REFERENCES [dbo].[Nivel]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Seccion] ADD CONSTRAINT [Seccion_gradoId_fkey] FOREIGN KEY ([gradoId]) REFERENCES [dbo].[Grado]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Seccion] ADD CONSTRAINT [Seccion_tandaId_fkey] FOREIGN KEY ([tandaId]) REFERENCES [dbo].[Tanda]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Seccion] ADD CONSTRAINT [Seccion_aulaBaseId_fkey] FOREIGN KEY ([aulaBaseId]) REFERENCES [dbo].[Aula]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RubricaCriterio] ADD CONSTRAINT [RubricaCriterio_rubricaId_fkey] FOREIGN KEY ([rubricaId]) REFERENCES [dbo].[Rubrica]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Materia] ADD CONSTRAINT [Materia_rubricaId_fkey] FOREIGN KEY ([rubricaId]) REFERENCES [dbo].[Rubrica]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MateriaGrado] ADD CONSTRAINT [MateriaGrado_materiaId_fkey] FOREIGN KEY ([materiaId]) REFERENCES [dbo].[Materia]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MateriaGrado] ADD CONSTRAINT [MateriaGrado_gradoId_fkey] FOREIGN KEY ([gradoId]) REFERENCES [dbo].[Grado]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[SeccionMateria] ADD CONSTRAINT [SeccionMateria_seccionId_fkey] FOREIGN KEY ([seccionId]) REFERENCES [dbo].[Seccion]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[SeccionMateria] ADD CONSTRAINT [SeccionMateria_materiaId_fkey] FOREIGN KEY ([materiaId]) REFERENCES [dbo].[Materia]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Docente] ADD CONSTRAINT [Docente_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Empleado] ADD CONSTRAINT [Empleado_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Empleado] ADD CONSTRAINT [Empleado_cajaId_fkey] FOREIGN KEY ([cajaId]) REFERENCES [dbo].[Caja]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[DocenteMateria] ADD CONSTRAINT [DocenteMateria_docenteId_fkey] FOREIGN KEY ([docenteId]) REFERENCES [dbo].[Docente]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[DocenteMateria] ADD CONSTRAINT [DocenteMateria_materiaId_fkey] FOREIGN KEY ([materiaId]) REFERENCES [dbo].[Materia]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[DocenteSeccion] ADD CONSTRAINT [DocenteSeccion_docenteId_fkey] FOREIGN KEY ([docenteId]) REFERENCES [dbo].[Docente]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[DocenteSeccion] ADD CONSTRAINT [DocenteSeccion_seccionId_fkey] FOREIGN KEY ([seccionId]) REFERENCES [dbo].[Seccion]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AcadRoster] ADD CONSTRAINT [AcadRoster_seccionId_fkey] FOREIGN KEY ([seccionId]) REFERENCES [dbo].[Seccion]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AcadRoster] ADD CONSTRAINT [AcadRoster_alumnoId_fkey] FOREIGN KEY ([alumnoId]) REFERENCES [dbo].[Alumno]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AcadNota] ADD CONSTRAINT [AcadNota_rosterId_fkey] FOREIGN KEY ([rosterId]) REFERENCES [dbo].[AcadRoster]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AcadNota] ADD CONSTRAINT [AcadNota_materiaId_fkey] FOREIGN KEY ([materiaId]) REFERENCES [dbo].[Materia]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AcadNota] ADD CONSTRAINT [AcadNota_periodoId_fkey] FOREIGN KEY ([periodoId]) REFERENCES [dbo].[PeriodoAcademico]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AcadAsistencia] ADD CONSTRAINT [AcadAsistencia_rosterId_fkey] FOREIGN KEY ([rosterId]) REFERENCES [dbo].[AcadRoster]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AcadAsignacion] ADD CONSTRAINT [AcadAsignacion_cicloId_fkey] FOREIGN KEY ([cicloId]) REFERENCES [dbo].[Ciclo]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AcadAsignacion] ADD CONSTRAINT [AcadAsignacion_docenteId_fkey] FOREIGN KEY ([docenteId]) REFERENCES [dbo].[Docente]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AcadAsignacion] ADD CONSTRAINT [AcadAsignacion_seccionId_fkey] FOREIGN KEY ([seccionId]) REFERENCES [dbo].[Seccion]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AcadAsignacion] ADD CONSTRAINT [AcadAsignacion_materiaId_fkey] FOREIGN KEY ([materiaId]) REFERENCES [dbo].[Materia]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AcadAsignacion] ADD CONSTRAINT [AcadAsignacion_aulaElegidaId_fkey] FOREIGN KEY ([aulaElegidaId]) REFERENCES [dbo].[Aula]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AsignacionAula] ADD CONSTRAINT [AsignacionAula_asignacionId_fkey] FOREIGN KEY ([asignacionId]) REFERENCES [dbo].[AcadAsignacion]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AsignacionAula] ADD CONSTRAINT [AsignacionAula_aulaId_fkey] FOREIGN KEY ([aulaId]) REFERENCES [dbo].[Aula]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AcadHorario] ADD CONSTRAINT [AcadHorario_cicloId_fkey] FOREIGN KEY ([cicloId]) REFERENCES [dbo].[Ciclo]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AcadHorario] ADD CONSTRAINT [AcadHorario_seccionId_fkey] FOREIGN KEY ([seccionId]) REFERENCES [dbo].[Seccion]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AcadHorario] ADD CONSTRAINT [AcadHorario_materiaId_fkey] FOREIGN KEY ([materiaId]) REFERENCES [dbo].[Materia]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AcadExtra] ADD CONSTRAINT [AcadExtra_docenteId_fkey] FOREIGN KEY ([docenteId]) REFERENCES [dbo].[Docente]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AcadExtra] ADD CONSTRAINT [AcadExtra_aulaId_fkey] FOREIGN KEY ([aulaId]) REFERENCES [dbo].[Aula]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AcadExtraGrado] ADD CONSTRAINT [AcadExtraGrado_extraId_fkey] FOREIGN KEY ([extraId]) REFERENCES [dbo].[AcadExtra]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AcadExtraGrado] ADD CONSTRAINT [AcadExtraGrado_gradoId_fkey] FOREIGN KEY ([gradoId]) REFERENCES [dbo].[Grado]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PersExpediente] ADD CONSTRAINT [PersExpediente_alumnoId_fkey] FOREIGN KEY ([alumnoId]) REFERENCES [dbo].[Alumno]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PersDocumento] ADD CONSTRAINT [PersDocumento_alumnoId_fkey] FOREIGN KEY ([alumnoId]) REFERENCES [dbo].[Alumno]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PersDocumento] ADD CONSTRAINT [PersDocumento_tipoId_fkey] FOREIGN KEY ([tipoId]) REFERENCES [dbo].[TipoDocumento]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ServicioAlumno] ADD CONSTRAINT [ServicioAlumno_alumnoId_fkey] FOREIGN KEY ([alumnoId]) REFERENCES [dbo].[Alumno]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ServicioAlumno] ADD CONSTRAINT [ServicioAlumno_rutaId_fkey] FOREIGN KEY ([rutaId]) REFERENCES [dbo].[RutaTransporte]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ServicioAlumno] ADD CONSTRAINT [ServicioAlumno_aliPlanId_fkey] FOREIGN KEY ([aliPlanId]) REFERENCES [dbo].[AliPlan]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ServicioAlumno] ADD CONSTRAINT [ServicioAlumno_extraId_fkey] FOREIGN KEY ([extraId]) REFERENCES [dbo].[AcadExtra]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ServicioAlumno] ADD CONSTRAINT [ServicioAlumno_productoId_fkey] FOREIGN KEY ([productoId]) REFERENCES [dbo].[FinProducto]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ServicioAlumno] ADD CONSTRAINT [ServicioAlumno_reciboId_fkey] FOREIGN KEY ([reciboId]) REFERENCES [dbo].[FinRecibo]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PersInscripcion] ADD CONSTRAINT [PersInscripcion_alumnoId_fkey] FOREIGN KEY ([alumnoId]) REFERENCES [dbo].[Alumno]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PersInscripcion] ADD CONSTRAINT [PersInscripcion_cicloId_fkey] FOREIGN KEY ([cicloId]) REFERENCES [dbo].[Ciclo]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PersInscripcion] ADD CONSTRAINT [PersInscripcion_planId_fkey] FOREIGN KEY ([planId]) REFERENCES [dbo].[FinPlan]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Contrato] ADD CONSTRAINT [Contrato_alumnoId_fkey] FOREIGN KEY ([alumnoId]) REFERENCES [dbo].[Alumno]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Contrato] ADD CONSTRAINT [Contrato_cicloId_fkey] FOREIGN KEY ([cicloId]) REFERENCES [dbo].[Ciclo]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Contrato] ADD CONSTRAINT [Contrato_planId_fkey] FOREIGN KEY ([planId]) REFERENCES [dbo].[FinPlan]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Contrato] ADD CONSTRAINT [Contrato_tipoBecaId_fkey] FOREIGN KEY ([tipoBecaId]) REFERENCES [dbo].[TipoBeca]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinBecaConcepto] ADD CONSTRAINT [FinBecaConcepto_becaId_fkey] FOREIGN KEY ([becaId]) REFERENCES [dbo].[FinBeca]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinBecaConcepto] ADD CONSTRAINT [FinBecaConcepto_conceptoId_fkey] FOREIGN KEY ([conceptoId]) REFERENCES [dbo].[ConceptoBeca]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AliPlanComida] ADD CONSTRAINT [AliPlanComida_planId_fkey] FOREIGN KEY ([planId]) REFERENCES [dbo].[AliPlan]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AliPlanComida] ADD CONSTRAINT [AliPlanComida_comidaId_fkey] FOREIGN KEY ([comidaId]) REFERENCES [dbo].[Comida]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AliPlanDieta] ADD CONSTRAINT [AliPlanDieta_planId_fkey] FOREIGN KEY ([planId]) REFERENCES [dbo].[AliPlan]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AliPlanDieta] ADD CONSTRAINT [AliPlanDieta_dietaId_fkey] FOREIGN KEY ([dietaId]) REFERENCES [dbo].[Dieta]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AlumnoAlergia] ADD CONSTRAINT [AlumnoAlergia_alumnoId_fkey] FOREIGN KEY ([alumnoId]) REFERENCES [dbo].[Alumno]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AlumnoAlergia] ADD CONSTRAINT [AlumnoAlergia_alergiaId_fkey] FOREIGN KEY ([alergiaId]) REFERENCES [dbo].[Alergia]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AliMenuAlergia] ADD CONSTRAINT [AliMenuAlergia_menuOrden_fkey] FOREIGN KEY ([menuOrden]) REFERENCES [dbo].[AliMenu]([orden]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AliMenuAlergia] ADD CONSTRAINT [AliMenuAlergia_alergiaId_fkey] FOREIGN KEY ([alergiaId]) REFERENCES [dbo].[Alergia]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH


-- =====================================================================================
-- Restricciones que Prisma no modela (las crea src/lib/db-indices.ts al arrancar; se incluyen aqui para una instalacion manual).
-- Requieren SET QUOTED_IDENTIFIER ON (indices filtrados): ejecutar con sqlcmd -I.
-- =====================================================================================
SET QUOTED_IDENTIFIER ON;
GO
CREATE UNIQUE INDEX [UX_AcadRoster_alumnoId] ON [dbo].[AcadRoster]([alumnoId]) WHERE [alumnoId] IS NOT NULL;
CREATE UNIQUE INDEX [UX_Tutor_userId] ON [dbo].[Tutor]([userId]) WHERE [userId] IS NOT NULL;
CREATE UNIQUE INDEX [UX_Docente_userId] ON [dbo].[Docente]([userId]) WHERE [userId] IS NOT NULL;
CREATE UNIQUE INDEX [UX_Empleado_userId] ON [dbo].[Empleado]([userId]) WHERE [userId] IS NOT NULL;
CREATE UNIQUE INDEX [UX_Docente_usuario] ON [dbo].[Docente]([usuario]) WHERE [usuario] IS NOT NULL;
CREATE UNIQUE INDEX [UX_Empleado_usuario] ON [dbo].[Empleado]([usuario]) WHERE [usuario] IS NOT NULL;
CREATE UNIQUE INDEX [UX_Ciclo_activo] ON [dbo].[Ciclo]([estado]) WHERE estado = 'Activo';
CREATE UNIQUE INDEX [UX_TutorAlumno_financiero] ON [dbo].[TutorAlumno]([alumnoId]) WHERE rol = 'Financiero' AND hasta IS NULL;
CREATE UNIQUE INDEX [UX_TutorAlumno_legal] ON [dbo].[TutorAlumno]([alumnoId]) WHERE rol = 'Legal' AND hasta IS NULL;
ALTER TABLE [dbo].[ServicioAlumno] ADD CONSTRAINT [CK_ServicioAlumno_catalogo] CHECK (((CASE WHEN rutaId IS NULL THEN 0 ELSE 1 END) + (CASE WHEN aliPlanId IS NULL THEN 0 ELSE 1 END) + (CASE WHEN extraId IS NULL THEN 0 ELSE 1 END) + (CASE WHEN productoId IS NULL THEN 0 ELSE 1 END)) = 1); -- Un servicio del alumno referencia exactamente UN elemento del catalogo (ruta, plan de alimentacion, actividad o producto)
ALTER TABLE [dbo].[Ciclo] ADD CONSTRAINT [CK_Ciclo_estado] CHECK (estado IN ('Planificado', 'Activo', 'Cerrado')); -- Estado de ciclo invalido
ALTER TABLE [dbo].[Ciclo] ADD CONSTRAINT [CK_Ciclo_fechas] CHECK (fechaFin > fechaInicio); -- La fecha fin del ciclo debe ser posterior al inicio
ALTER TABLE [dbo].[Matricula] ADD CONSTRAINT [CK_Matricula_estado] CHECK (estado IN ('Activo', 'Retirado', 'Promovido', 'Repitente', 'Graduado')); -- Estado de matricula invalido
ALTER TABLE [dbo].[TutorAlumno] ADD CONSTRAINT [CK_TutorAlumno_rol] CHECK (rol IN ('Financiero', 'Legal', 'Academico')); -- Rol de tutor invalido
ALTER TABLE [dbo].[TutorAlumno] ADD CONSTRAINT [CK_TutorAlumno_vigencia] CHECK (hasta IS NULL OR hasta >= desde); -- La vigencia del vinculo termina antes de empezar
ALTER TABLE [dbo].[MonederoMovimiento] ADD CONSTRAINT [CK_MonederoMovimiento_tipo] CHECK (tipo IN ('Recarga', 'Consumo', 'Ajuste')); -- Tipo de movimiento invalido
ALTER TABLE [dbo].[FinReciboPago] ADD CONSTRAINT [CK_FinReciboPago_monto] CHECK (monto >= 0); -- El monto del pago no puede ser negativo
GO
