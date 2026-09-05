-- CreateTable
CREATE TABLE "RegistroRepse" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numeroRegistro" TEXT NOT NULL,
    "fechaRegistro" TIMESTAMP(3) NOT NULL,
    "actividades" TEXT NOT NULL,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistroRepse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContratoRepse" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "beneficiario" TEXT NOT NULL,
    "rfcBeneficiario" TEXT NOT NULL,
    "objeto" TEXT NOT NULL,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3),
    "numeroTrabajadores" INTEGER NOT NULL DEFAULT 0,
    "margenUtilidad" DECIMAL(9,6) NOT NULL DEFAULT 0.15,
    "otrosCostos" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContratoRepse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegistroRepse_empresaId_key" ON "RegistroRepse"("empresaId");

-- CreateIndex
CREATE INDEX "ContratoRepse_empresaId_idx" ON "ContratoRepse"("empresaId");

-- AddForeignKey
ALTER TABLE "RegistroRepse" ADD CONSTRAINT "RegistroRepse_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContratoRepse" ADD CONSTRAINT "ContratoRepse_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

