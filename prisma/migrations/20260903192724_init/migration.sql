-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'NOMINISTA', 'AUDITOR');

-- CreateEnum
CREATE TYPE "Periodicidad" AS ENUM ('SEMANAL', 'CATORCENAL', 'QUINCENAL', 'MENSUAL');

-- CreateEnum
CREATE TYPE "RegimenContratacion" AS ENUM ('SUELDOS_SALARIOS', 'ASIMILADOS_MIEMBROS_SOCIEDADES', 'ASIMILADOS_COMISIONISTAS', 'ASIMILADOS_HONORARIOS', 'ASIMILADOS_ACCIONES', 'ASIMILADOS_OTROS', 'JUBILADOS');

-- CreateEnum
CREATE TYPE "TipoJornada" AS ENUM ('DIURNA', 'NOCTURNA', 'MIXTA', 'POR_HORA', 'REDUCIDA', 'CONTINUADA', 'PARTIDA', 'POR_TURNOS');

-- CreateEnum
CREATE TYPE "TipoContrato" AS ENUM ('INDETERMINADO', 'OBRA_DETERMINADA', 'TIEMPO_DETERMINADO', 'CAPACITACION_INICIAL', 'PRUEBA');

-- CreateEnum
CREATE TYPE "TipoSalario" AS ENUM ('FIJO', 'VARIABLE', 'MIXTO');

-- CreateEnum
CREATE TYPE "EstadoEmpleado" AS ENUM ('ACTIVO', 'BAJA', 'INCAPACIDAD', 'PERMISO');

-- CreateEnum
CREATE TYPE "EstadoCorrida" AS ENUM ('BORRADOR', 'CALCULADA', 'AUTORIZADA', 'TIMBRADA', 'PAGADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoConcepto" AS ENUM ('PERCEPCION', 'DEDUCCION', 'OTRO_PAGO');

-- CreateEnum
CREATE TYPE "TipoIncidencia" AS ENUM ('FALTA', 'INCAPACIDAD_ENFERMEDAD', 'INCAPACIDAD_RIESGO', 'INCAPACIDAD_MATERNIDAD', 'PERMISO_SIN_GOCE', 'PERMISO_CON_GOCE', 'VACACIONES', 'HORAS_EXTRA_DOBLES', 'HORAS_EXTRA_TRIPLES', 'DIA_DESCANSO_TRABAJADO', 'PRIMA_DOMINICAL', 'DIA_FESTIVO_TRABAJADO');

-- CreateEnum
CREATE TYPE "TipoSeparacion" AS ENUM ('RENUNCIA', 'DESPIDO_JUSTIFICADO', 'DESPIDO_INJUSTIFICADO', 'TERMINO_CONTRATO', 'MUTUO_ACUERDO', 'DEFUNCION');

-- CreateTable
CREATE TABLE "Empresa" (
    "id" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "rfc" TEXT NOT NULL,
    "regimenFiscal" TEXT NOT NULL,
    "codigoPostal" TEXT NOT NULL,
    "registroPatronal" TEXT,
    "primaRiesgoTrabajo" DECIMAL(9,6) NOT NULL DEFAULT 0.005,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "hashPassword" TEXT NOT NULL,
    "rol" "Rol" NOT NULL DEFAULT 'NOMINISTA',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Empleado" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numeroEmpleado" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellidoPaterno" TEXT NOT NULL,
    "apellidoMaterno" TEXT,
    "rfc" TEXT NOT NULL,
    "curp" TEXT NOT NULL,
    "nss" TEXT,
    "fechaNacimiento" TIMESTAMP(3),
    "fechaIngreso" TIMESTAMP(3) NOT NULL,
    "fechaBaja" TIMESTAMP(3),
    "motivoBaja" "TipoSeparacion",
    "estado" "EstadoEmpleado" NOT NULL DEFAULT 'ACTIVO',
    "puesto" TEXT NOT NULL,
    "departamento" TEXT,
    "registroPatronal" TEXT,
    "claveEntidadFederativa" TEXT NOT NULL DEFAULT 'MEX',
    "banco" TEXT,
    "cuentaClabe" TEXT,
    "periodicidad" "Periodicidad" NOT NULL,
    "regimen" "RegimenContratacion" NOT NULL DEFAULT 'SUELDOS_SALARIOS',
    "tipoContrato" "TipoContrato" NOT NULL DEFAULT 'INDETERMINADO',
    "tipoJornada" "TipoJornada" NOT NULL DEFAULT 'DIURNA',
    "tipoSalario" "TipoSalario" NOT NULL DEFAULT 'FIJO',
    "sindicalizado" BOOLEAN NOT NULL DEFAULT false,
    "salarioDiario" DECIMAL(14,4) NOT NULL,
    "salarioBaseCotizacion" DECIMAL(14,4) NOT NULL,
    "diasVacacionesExtra" INTEGER NOT NULL DEFAULT 0,
    "primaVacacionalPct" DECIMAL(6,4) NOT NULL DEFAULT 0.25,
    "diasAguinaldo" INTEGER NOT NULL DEFAULT 15,
    "descuentoInfonavitTipo" TEXT,
    "descuentoInfonavitValor" DECIMAL(14,4),
    "numeroCreditoInfonavit" TEXT,
    "pensionAlimenticiaTipo" TEXT,
    "pensionAlimenticiaValor" DECIMAL(14,4),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Empleado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistorialSalario" (
    "id" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL,
    "salarioDiario" DECIMAL(14,4) NOT NULL,
    "salarioBaseCotizacion" DECIMAL(14,4) NOT NULL,
    "motivo" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistorialSalario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeriodoNomina" (
    "id" TEXT NOT NULL,
    "ejercicio" INTEGER NOT NULL,
    "periodicidad" "Periodicidad" NOT NULL,
    "numero" INTEGER NOT NULL,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3) NOT NULL,
    "fechaPago" TIMESTAMP(3) NOT NULL,
    "diasPeriodo" INTEGER NOT NULL,

    CONSTRAINT "PeriodoNomina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorridaNomina" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "periodoId" TEXT NOT NULL,
    "estado" "EstadoCorrida" NOT NULL DEFAULT 'BORRADOR',
    "descripcion" TEXT,
    "totalPercepciones" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "totalDeducciones" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "totalOtrosPagos" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "totalNeto" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "totalCuotasPatron" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "creadaPorId" TEXT,
    "autorizadaPorId" TEXT,
    "autorizadaEn" TIMESTAMP(3),
    "pagadaEn" TIMESTAMP(3),
    "parametrosSnapshot" JSONB,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadaEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorridaNomina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recibo" (
    "id" TEXT NOT NULL,
    "corridaId" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "diasPagados" DECIMAL(9,4) NOT NULL,
    "salarioDiario" DECIMAL(14,4) NOT NULL,
    "salarioBaseCotizacion" DECIMAL(14,4) NOT NULL,
    "totalPercepciones" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "totalDeducciones" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "totalOtrosPagos" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "totalGravado" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "totalExento" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "isrRetenido" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "subsidioCausado" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "subsidioEntregado" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "imssObrero" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "imssPatron" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "infonavitPatron" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "retiroCesantiaVejez" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "impuestoEstatalNomina" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "neto" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "memoriaCalculo" JSONB NOT NULL,
    "uuidCfdi" TEXT,
    "fechaTimbrado" TIMESTAMP(3),
    "xmlCfdi" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recibo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConceptoRecibo" (
    "id" TEXT NOT NULL,
    "reciboId" TEXT NOT NULL,
    "tipo" "TipoConcepto" NOT NULL,
    "claveSat" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "importeGravado" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "importeExento" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "importe" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ConceptoRecibo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incidencia" (
    "id" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "tipo" "TipoIncidencia" NOT NULL,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3) NOT NULL,
    "cantidad" DECIMAL(9,4) NOT NULL,
    "folio" TEXT,
    "comentario" TEXT,
    "aplicada" BOOLEAN NOT NULL DEFAULT false,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Incidencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finiquito" (
    "id" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "tipoSeparacion" "TipoSeparacion" NOT NULL,
    "fechaBaja" TIMESTAMP(3) NOT NULL,
    "incluyeIndemnizacion" BOOLEAN NOT NULL DEFAULT false,
    "totalPercepciones" DECIMAL(16,2) NOT NULL,
    "totalDeducciones" DECIMAL(16,2) NOT NULL,
    "neto" DECIMAL(16,2) NOT NULL,
    "memoriaCalculo" JSONB NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Finiquito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParametroFiscal" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT,
    "ejercicio" INTEGER NOT NULL,
    "clave" TEXT NOT NULL,
    "valor" DECIMAL(18,8) NOT NULL,
    "descripcion" TEXT,
    "vigenteDesde" TIMESTAMP(3) NOT NULL,
    "vigenteHasta" TIMESTAMP(3),

    CONSTRAINT "ParametroFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TarifaIsr" (
    "id" TEXT NOT NULL,
    "ejercicio" INTEGER NOT NULL,
    "periodicidad" "Periodicidad" NOT NULL,
    "limiteInferior" DECIMAL(16,2) NOT NULL,
    "limiteSuperior" DECIMAL(16,2),
    "cuotaFija" DECIMAL(16,2) NOT NULL,
    "porcentaje" DECIMAL(9,6) NOT NULL,

    CONSTRAINT "TarifaIsr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TablaSubsidio" (
    "id" TEXT NOT NULL,
    "ejercicio" INTEGER NOT NULL,
    "periodicidad" "Periodicidad" NOT NULL,
    "limiteInferior" DECIMAL(16,2) NOT NULL,
    "limiteSuperior" DECIMAL(16,2),
    "subsidio" DECIMAL(16,2) NOT NULL,

    CONSTRAINT "TablaSubsidio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroBitacora" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT,
    "secuencia" SERIAL NOT NULL,
    "ocurridoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "actorRol" TEXT,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT,
    "datosAntes" JSONB,
    "datosDespues" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "hashPrevio" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "RegistroBitacora_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_rfc_key" ON "Empresa"("rfc");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "Empleado_empresaId_estado_idx" ON "Empleado"("empresaId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "Empleado_empresaId_numeroEmpleado_key" ON "Empleado"("empresaId", "numeroEmpleado");

-- CreateIndex
CREATE INDEX "HistorialSalario_empleadoId_vigenteDesde_idx" ON "HistorialSalario"("empleadoId", "vigenteDesde");

-- CreateIndex
CREATE INDEX "PeriodoNomina_ejercicio_periodicidad_idx" ON "PeriodoNomina"("ejercicio", "periodicidad");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodoNomina_ejercicio_periodicidad_numero_key" ON "PeriodoNomina"("ejercicio", "periodicidad", "numero");

-- CreateIndex
CREATE INDEX "CorridaNomina_empresaId_estado_idx" ON "CorridaNomina"("empresaId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "CorridaNomina_empresaId_periodoId_key" ON "CorridaNomina"("empresaId", "periodoId");

-- CreateIndex
CREATE INDEX "Recibo_empleadoId_idx" ON "Recibo"("empleadoId");

-- CreateIndex
CREATE UNIQUE INDEX "Recibo_corridaId_empleadoId_key" ON "Recibo"("corridaId", "empleadoId");

-- CreateIndex
CREATE INDEX "ConceptoRecibo_reciboId_tipo_idx" ON "ConceptoRecibo"("reciboId", "tipo");

-- CreateIndex
CREATE INDEX "Incidencia_empleadoId_fechaInicio_idx" ON "Incidencia"("empleadoId", "fechaInicio");

-- CreateIndex
CREATE INDEX "Finiquito_empleadoId_idx" ON "Finiquito"("empleadoId");

-- CreateIndex
CREATE INDEX "ParametroFiscal_ejercicio_idx" ON "ParametroFiscal"("ejercicio");

-- CreateIndex
CREATE UNIQUE INDEX "ParametroFiscal_ejercicio_clave_empresaId_key" ON "ParametroFiscal"("ejercicio", "clave", "empresaId");

-- CreateIndex
CREATE INDEX "TarifaIsr_ejercicio_periodicidad_limiteInferior_idx" ON "TarifaIsr"("ejercicio", "periodicidad", "limiteInferior");

-- CreateIndex
CREATE INDEX "TablaSubsidio_ejercicio_periodicidad_limiteInferior_idx" ON "TablaSubsidio"("ejercicio", "periodicidad", "limiteInferior");

-- CreateIndex
CREATE UNIQUE INDEX "RegistroBitacora_secuencia_key" ON "RegistroBitacora"("secuencia");

-- CreateIndex
CREATE UNIQUE INDEX "RegistroBitacora_hash_key" ON "RegistroBitacora"("hash");

-- CreateIndex
CREATE INDEX "RegistroBitacora_empresaId_entidad_entidadId_idx" ON "RegistroBitacora"("empresaId", "entidad", "entidadId");

-- CreateIndex
CREATE INDEX "RegistroBitacora_ocurridoEn_idx" ON "RegistroBitacora"("ocurridoEn");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empleado" ADD CONSTRAINT "Empleado_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistorialSalario" ADD CONSTRAINT "HistorialSalario_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorridaNomina" ADD CONSTRAINT "CorridaNomina_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorridaNomina" ADD CONSTRAINT "CorridaNomina_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "PeriodoNomina"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorridaNomina" ADD CONSTRAINT "CorridaNomina_creadaPorId_fkey" FOREIGN KEY ("creadaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorridaNomina" ADD CONSTRAINT "CorridaNomina_autorizadaPorId_fkey" FOREIGN KEY ("autorizadaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recibo" ADD CONSTRAINT "Recibo_corridaId_fkey" FOREIGN KEY ("corridaId") REFERENCES "CorridaNomina"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recibo" ADD CONSTRAINT "Recibo_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptoRecibo" ADD CONSTRAINT "ConceptoRecibo_reciboId_fkey" FOREIGN KEY ("reciboId") REFERENCES "Recibo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incidencia" ADD CONSTRAINT "Incidencia_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finiquito" ADD CONSTRAINT "Finiquito_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParametroFiscal" ADD CONSTRAINT "ParametroFiscal_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroBitacora" ADD CONSTRAINT "RegistroBitacora_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
