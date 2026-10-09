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
    [grado] NVARCHAR(1000) NOT NULL,
    [sec] NVARCHAR(1000) NOT NULL,
    [tanda] NVARCHAR(1000) NOT NULL,
    [cuenta] NVARCHAR(1000) NOT NULL,
    [estado] NVARCHAR(1000) NOT NULL,
    [alg] NVARCHAR(1000) NOT NULL CONSTRAINT [Alumno_alg_df] DEFAULT '',
    [dir] NVARCHAR(1000) NOT NULL CONSTRAINT [Alumno_dir_df] DEFAULT '',
    [tel] NVARCHAR(1000) NOT NULL CONSTRAINT [Alumno_tel_df] DEFAULT '',
    [tutorId] NVARCHAR(100) NOT NULL,
    [tutorLegalId] NVARCHAR(100),
    CONSTRAINT [Alumno_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Alumno_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[Catalogo] (
    [id] NVARCHAR(100) NOT NULL,
    [tipo] NVARCHAR(100) NOT NULL,
    [data] NVARCHAR(max) NOT NULL,
    [estado] NVARCHAR(1000) NOT NULL CONSTRAINT [Catalogo_estado_df] DEFAULT 'Activo',
    CONSTRAINT [Catalogo_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[MobNota] (
    [id] NVARCHAR(100) NOT NULL,
    [alumnoId] NVARCHAR(100) NOT NULL,
    [materia] NVARCHAR(100) NOT NULL,
    [valor] FLOAT(53) NOT NULL,
    CONSTRAINT [MobNota_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[MobWallet] (
    [alumnoId] NVARCHAR(100) NOT NULL,
    [saldo] FLOAT(53) NOT NULL,
    [limite] FLOAT(53) NOT NULL,
    CONSTRAINT [MobWallet_pkey] PRIMARY KEY CLUSTERED ([alumnoId])
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
    [meals] NVARCHAR(1000) NOT NULL,
    [precio] FLOAT(53),
    [freq] NVARCHAR(1000) NOT NULL,
    [dias] NVARCHAR(1000) NOT NULL,
    [mora] BIT NOT NULL,
    [recarga] FLOAT(53),
    [limite] FLOAT(53),
    [canal] NVARCHAR(1000) NOT NULL,
    [saldo] NVARCHAR(1000) NOT NULL,
    [diets] NVARCHAR(1000) NOT NULL,
    [estado] NVARCHAR(1000) NOT NULL CONSTRAINT [AliPlan_estado_df] DEFAULT 'Activo',
    CONSTRAINT [AliPlan_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[AliMenu] (
    [orden] INT NOT NULL,
    [dia] NVARCHAR(1000) NOT NULL,
    [plato] NVARCHAR(1000) NOT NULL,
    [algs] NVARCHAR(1000) NOT NULL,
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
    [allergies] NVARCHAR(1000) NOT NULL,
    [restr] NVARCHAR(1000) NOT NULL,
    [limit] FLOAT(53) NOT NULL,
    [motivo] NVARCHAR(1000) NOT NULL CONSTRAINT [ComCarnet_motivo_df] DEFAULT '',
    [wallet] FLOAT(53) NOT NULL,
    [spent] FLOAT(53) NOT NULL,
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
    [detalle] NVARCHAR(max) NOT NULL CONSTRAINT [MobPagoIntencion_detalle_df] DEFAULT '[]',
    [estado] NVARCHAR(100) NOT NULL CONSTRAINT [MobPagoIntencion_estado_df] DEFAULT 'pendiente',
    [creado] DATETIME2 NOT NULL CONSTRAINT [MobPagoIntencion_creado_df] DEFAULT CURRENT_TIMESTAMP,
    [resuelto] DATETIME2,
    [resueltoPor] NVARCHAR(1000),
    [nota] NVARCHAR(max) NOT NULL CONSTRAINT [MobPagoIntencion_nota_df] DEFAULT '',
    [reciboId] NVARCHAR(100),
    CONSTRAINT [MobPagoIntencion_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[FinCobroItem] (
    [id] NVARCHAR(100) NOT NULL,
    [alumnoId] NVARCHAR(100) NOT NULL,
    [tutorId] NVARCHAR(100),
    [servicioId] NVARCHAR(100),
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
    [cajeroId] NVARCHAR(100),
    [hora] NVARCHAR(1000) NOT NULL,
    [monto] FLOAT(53) NOT NULL,
    [est] NVARCHAR(1000) NOT NULL CONSTRAINT [FinRecibo_est_df] DEFAULT 'Activo',
    [abono] BIT NOT NULL CONSTRAINT [FinRecibo_abono_df] DEFAULT 0,
    [saldo] FLOAT(53) NOT NULL CONSTRAINT [FinRecibo_saldo_df] DEFAULT 0,
    [nc] NVARCHAR(1000),
    [change] FLOAT(53) NOT NULL CONSTRAINT [FinRecibo_change_df] DEFAULT 0,
    [items] NVARCHAR(max) NOT NULL CONSTRAINT [FinRecibo_items_df] DEFAULT '[]',
    [pays] NVARCHAR(max) NOT NULL CONSTRAINT [FinRecibo_pays_df] DEFAULT '[]',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [FinRecibo_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [FinRecibo_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FinRecibo_ncf_key] UNIQUE NONCLUSTERED ([ncf])
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
CREATE TABLE [dbo].[FinBeca] (
    [id] NVARCHAR(100) NOT NULL,
    [periodo] NVARCHAR(100) NOT NULL,
    [alumnoId] NVARCHAR(100) NOT NULL,
    [est] NVARCHAR(1000) NOT NULL,
    [grado] NVARCHAR(1000) NOT NULL,
    [tipo] NVARCHAR(1000) NOT NULL,
    [regla] NVARCHAR(max) NOT NULL,
    [conceptos] NVARCHAR(max) NOT NULL,
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
    [cat] NVARCHAR(1000) NOT NULL,
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
CREATE TABLE [dbo].[AcadRoster] (
    [id] NVARCHAR(100) NOT NULL,
    [seccion] NVARCHAR(100) NOT NULL,
    [orden] INT NOT NULL,
    [nombre] NVARCHAR(1000) NOT NULL,
    [alumnoId] NVARCHAR(100),
    CONSTRAINT [AcadRoster_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[AcadNota] (
    [id] NVARCHAR(100) NOT NULL,
    [rosterId] NVARCHAR(100) NOT NULL,
    [materia] NVARCHAR(100) NOT NULL,
    [periodo] NVARCHAR(100) NOT NULL,
    [c1] FLOAT(53),
    [c2] FLOAT(53),
    [c3] FLOAT(53),
    [c4] FLOAT(53),
    [ex] FLOAT(53),
    CONSTRAINT [AcadNota_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [AcadNota_rosterId_materia_periodo_key] UNIQUE NONCLUSTERED ([rosterId],[materia],[periodo])
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
    [docenteId] NVARCHAR(100) NOT NULL,
    [seccionId] NVARCHAR(100) NOT NULL,
    [materiaId] NVARCHAR(100) NOT NULL,
    [aulas] NVARCHAR(max) NOT NULL CONSTRAINT [AcadAsignacion_aulas_df] DEFAULT '[]',
    CONSTRAINT [AcadAsignacion_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [AcadAsignacion_seccionId_materiaId_key] UNIQUE NONCLUSTERED ([seccionId],[materiaId])
);

-- CreateTable
CREATE TABLE [dbo].[AcadHorario] (
    [id] NVARCHAR(100) NOT NULL,
    [seccion] NVARCHAR(100) NOT NULL,
    [slot] NVARCHAR(100) NOT NULL,
    [materia] NVARCHAR(100) NOT NULL,
    CONSTRAINT [AcadHorario_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [AcadHorario_seccion_slot_key] UNIQUE NONCLUSTERED ([seccion],[slot])
);

-- CreateTable
CREATE TABLE [dbo].[AcadExtra] (
    [id] NVARCHAR(100) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [cat] NVARCHAR(1000) NOT NULL,
    [kind] NVARCHAR(1000) NOT NULL,
    [instructor] NVARCHAR(1000) NOT NULL,
    [lugar] NVARCHAR(1000) NOT NULL,
    [dias] NVARCHAR(1000) NOT NULL,
    [hora] NVARCHAR(1000) NOT NULL,
    [grados] NVARCHAR(1000) NOT NULL,
    [cupo] INT NOT NULL,
    [inscritos] INT NOT NULL CONSTRAINT [AcadExtra_inscritos_df] DEFAULT 0,
    [costo] FLOAT(53) NOT NULL CONSTRAINT [AcadExtra_costo_df] DEFAULT 0,
    [ini] NVARCHAR(1000) NOT NULL CONSTRAINT [AcadExtra_ini_df] DEFAULT '',
    [sem] INT NOT NULL CONSTRAINT [AcadExtra_sem_df] DEFAULT 0,
    [estado] NVARCHAR(1000) NOT NULL CONSTRAINT [AcadExtra_estado_df] DEFAULT 'Abierta',
    CONSTRAINT [AcadExtra_pkey] PRIMARY KEY CLUSTERED ([id])
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
    [n] NVARCHAR(1000) NOT NULL,
    [f] NVARCHAR(1000) NOT NULL,
    [est] NVARCHAR(1000) NOT NULL,
    [orden] INT NOT NULL CONSTRAINT [PersDocumento_orden_df] DEFAULT 0,
    CONSTRAINT [PersDocumento_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[PersServicio] (
    [id] NVARCHAR(100) NOT NULL,
    [alumnoId] NVARCHAR(100) NOT NULL,
    [kind] NVARCHAR(1000) NOT NULL,
    [catKey] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [icon] NVARCHAR(1000) NOT NULL CONSTRAINT [PersServicio_icon_df] DEFAULT '',
    [spec] NVARCHAR(1000) NOT NULL CONSTRAINT [PersServicio_spec_df] DEFAULT '',
    [cost] FLOAT(53) NOT NULL,
    [corte] NVARCHAR(1000) NOT NULL CONSTRAINT [PersServicio_corte_df] DEFAULT '',
    [est] NVARCHAR(1000) NOT NULL CONSTRAINT [PersServicio_est_df] DEFAULT 'Activo',
    [alert] NVARCHAR(1000) NOT NULL CONSTRAINT [PersServicio_alert_df] DEFAULT '',
    [fecha] NVARCHAR(100) NOT NULL CONSTRAINT [PersServicio_fecha_df] DEFAULT '',
    [st] NVARCHAR(1000) NOT NULL CONSTRAINT [PersServicio_st_df] DEFAULT '',
    [mes] NVARCHAR(1000) NOT NULL CONSTRAINT [PersServicio_mes_df] DEFAULT '',
    [reciboId] NVARCHAR(100),
    CONSTRAINT [PersServicio_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[PersInscripcion] (
    [id] NVARCHAR(100) NOT NULL,
    [alumnoId] NVARCHAR(100) NOT NULL,
    [ncf] NVARCHAR(100) NOT NULL,
    [factura] FLOAT(53) NOT NULL,
    [planId] NVARCHAR(100) NOT NULL,
    [cuotas] INT NOT NULL,
    [firma] NVARCHAR(1000) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PersInscripcion_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PersInscripcion_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PersInscripcion_ncf_key] UNIQUE NONCLUSTERED ([ncf])
);

-- CreateTable
CREATE TABLE [dbo].[Contrato] (
    [id] NVARCHAR(100) NOT NULL,
    [alumnoId] NVARCHAR(100) NOT NULL,
    [ciclo] NVARCHAR(100) NOT NULL,
    [planId] NVARCHAR(100) NOT NULL,
    [beca] NVARCHAR(100),
    [ctr] NVARCHAR(1000) NOT NULL CONSTRAINT [Contrato_ctr_df] DEFAULT '',
    [firmado] NVARCHAR(1000) NOT NULL CONSTRAINT [Contrato_firmado_df] DEFAULT '',
    CONSTRAINT [Contrato_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Contrato_alumnoId_ciclo_key] UNIQUE NONCLUSTERED ([alumnoId],[ciclo])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Tutor_userId_idx] ON [dbo].[Tutor]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Alumno_tutorId_idx] ON [dbo].[Alumno]([tutorId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Alumno_tutorLegalId_idx] ON [dbo].[Alumno]([tutorLegalId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Catalogo_tipo_idx] ON [dbo].[Catalogo]([tipo]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MobNota_alumnoId_idx] ON [dbo].[MobNota]([alumnoId]);

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
CREATE NONCLUSTERED INDEX [FinCobroItem_alumnoId_paid_idx] ON [dbo].[FinCobroItem]([alumnoId], [paid]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FinCobroItem_tutorId_idx] ON [dbo].[FinCobroItem]([tutorId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FinCobroItem_servicioId_idx] ON [dbo].[FinCobroItem]([servicioId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FinRecibo_tutorId_idx] ON [dbo].[FinRecibo]([tutorId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FinRecibo_cajeroId_idx] ON [dbo].[FinRecibo]([cajeroId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FinRecibo_createdAt_idx] ON [dbo].[FinRecibo]([createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FinBeca_alumnoId_idx] ON [dbo].[FinBeca]([alumnoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FinMovimiento_productoId_idx] ON [dbo].[FinMovimiento]([productoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FinMovimiento_ventaId_idx] ON [dbo].[FinMovimiento]([ventaId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FinVentaItem_ventaId_idx] ON [dbo].[FinVentaItem]([ventaId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FinVentaItem_productoId_idx] ON [dbo].[FinVentaItem]([productoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SisAudit_t_idx] ON [dbo].[SisAudit]([t]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AcadRoster_seccion_idx] ON [dbo].[AcadRoster]([seccion]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AcadRoster_alumnoId_idx] ON [dbo].[AcadRoster]([alumnoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AcadAsignacion_docenteId_idx] ON [dbo].[AcadAsignacion]([docenteId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PersDocumento_alumnoId_idx] ON [dbo].[PersDocumento]([alumnoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PersServicio_alumnoId_idx] ON [dbo].[PersServicio]([alumnoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PersServicio_reciboId_idx] ON [dbo].[PersServicio]([reciboId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PersInscripcion_alumnoId_idx] ON [dbo].[PersInscripcion]([alumnoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PersInscripcion_planId_idx] ON [dbo].[PersInscripcion]([planId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Contrato_planId_idx] ON [dbo].[Contrato]([planId]);

-- AddForeignKey
ALTER TABLE [dbo].[Tutor] ADD CONSTRAINT [Tutor_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Alumno] ADD CONSTRAINT [Alumno_tutorId_fkey] FOREIGN KEY ([tutorId]) REFERENCES [dbo].[Tutor]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Alumno] ADD CONSTRAINT [Alumno_tutorLegalId_fkey] FOREIGN KEY ([tutorLegalId]) REFERENCES [dbo].[Tutor]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MobNota] ADD CONSTRAINT [MobNota_alumnoId_fkey] FOREIGN KEY ([alumnoId]) REFERENCES [dbo].[Alumno]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MobWallet] ADD CONSTRAINT [MobWallet_alumnoId_fkey] FOREIGN KEY ([alumnoId]) REFERENCES [dbo].[Alumno]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

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
ALTER TABLE [dbo].[MobPagoIntencion] ADD CONSTRAINT [MobPagoIntencion_reciboId_fkey] FOREIGN KEY ([reciboId]) REFERENCES [dbo].[FinRecibo]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinCobroItem] ADD CONSTRAINT [FinCobroItem_alumnoId_fkey] FOREIGN KEY ([alumnoId]) REFERENCES [dbo].[Alumno]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinCobroItem] ADD CONSTRAINT [FinCobroItem_tutorId_fkey] FOREIGN KEY ([tutorId]) REFERENCES [dbo].[Tutor]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinCobroItem] ADD CONSTRAINT [FinCobroItem_servicioId_fkey] FOREIGN KEY ([servicioId]) REFERENCES [dbo].[PersServicio]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinRecibo] ADD CONSTRAINT [FinRecibo_tutorId_fkey] FOREIGN KEY ([tutorId]) REFERENCES [dbo].[Tutor]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinRecibo] ADD CONSTRAINT [FinRecibo_cajeroId_fkey] FOREIGN KEY ([cajeroId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinBeca] ADD CONSTRAINT [FinBeca_alumnoId_fkey] FOREIGN KEY ([alumnoId]) REFERENCES [dbo].[Alumno]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinMovimiento] ADD CONSTRAINT [FinMovimiento_productoId_fkey] FOREIGN KEY ([productoId]) REFERENCES [dbo].[FinProducto]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinMovimiento] ADD CONSTRAINT [FinMovimiento_ventaId_fkey] FOREIGN KEY ([ventaId]) REFERENCES [dbo].[FinVenta]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinVentaItem] ADD CONSTRAINT [FinVentaItem_ventaId_fkey] FOREIGN KEY ([ventaId]) REFERENCES [dbo].[FinVenta]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FinVentaItem] ADD CONSTRAINT [FinVentaItem_productoId_fkey] FOREIGN KEY ([productoId]) REFERENCES [dbo].[FinProducto]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AcadRoster] ADD CONSTRAINT [AcadRoster_alumnoId_fkey] FOREIGN KEY ([alumnoId]) REFERENCES [dbo].[Alumno]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AcadNota] ADD CONSTRAINT [AcadNota_rosterId_fkey] FOREIGN KEY ([rosterId]) REFERENCES [dbo].[AcadRoster]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AcadAsistencia] ADD CONSTRAINT [AcadAsistencia_rosterId_fkey] FOREIGN KEY ([rosterId]) REFERENCES [dbo].[AcadRoster]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PersExpediente] ADD CONSTRAINT [PersExpediente_alumnoId_fkey] FOREIGN KEY ([alumnoId]) REFERENCES [dbo].[Alumno]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PersDocumento] ADD CONSTRAINT [PersDocumento_alumnoId_fkey] FOREIGN KEY ([alumnoId]) REFERENCES [dbo].[Alumno]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PersServicio] ADD CONSTRAINT [PersServicio_alumnoId_fkey] FOREIGN KEY ([alumnoId]) REFERENCES [dbo].[Alumno]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PersServicio] ADD CONSTRAINT [PersServicio_reciboId_fkey] FOREIGN KEY ([reciboId]) REFERENCES [dbo].[FinRecibo]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PersInscripcion] ADD CONSTRAINT [PersInscripcion_alumnoId_fkey] FOREIGN KEY ([alumnoId]) REFERENCES [dbo].[Alumno]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PersInscripcion] ADD CONSTRAINT [PersInscripcion_planId_fkey] FOREIGN KEY ([planId]) REFERENCES [dbo].[FinPlan]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Contrato] ADD CONSTRAINT [Contrato_alumnoId_fkey] FOREIGN KEY ([alumnoId]) REFERENCES [dbo].[Alumno]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Contrato] ADD CONSTRAINT [Contrato_planId_fkey] FOREIGN KEY ([planId]) REFERENCES [dbo].[FinPlan]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

