-- CreateEnum
CREATE TYPE "TipoChecada" AS ENUM ('ENTRADA', 'SALIDA', 'INICIO_COMIDA', 'FIN_COMIDA');

-- CreateEnum
CREATE TYPE "OrigenChecada" AS ENUM ('WHATSAPP', 'MANUAL');

-- AlterTable
ALTER TABLE "Empleado" ADD COLUMN     "checadorActivo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "diasLaborables" TEXT NOT NULL DEFAULT '1,2,3,4,5',
ADD COLUMN     "horaEntrada" TEXT NOT NULL DEFAULT '09:00',
ADD COLUMN     "horaSalida" TEXT NOT NULL DEFAULT '18:00',
ADD COLUMN     "telefonoWhatsapp" TEXT,
ADD COLUMN     "toleranciaMinutos" INTEGER NOT NULL DEFAULT 15;

-- AlterTable
ALTER TABLE "Incidencia" ADD COLUMN     "origen" TEXT NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "Checada" (
    "id" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "tipo" "TipoChecada" NOT NULL,
    "ocurridoEn" TIMESTAMP(3) NOT NULL,
    "origen" "OrigenChecada" NOT NULL DEFAULT 'WHATSAPP',
    "telefono" TEXT,
    "mensajeId" TEXT,
    "textoMensaje" TEXT,
    "latitud" DECIMAL(10,6),
    "longitud" DECIMAL(10,6),
    "registradaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Checada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Checada_mensajeId_key" ON "Checada"("mensajeId");

-- CreateIndex
CREATE INDEX "Checada_empleadoId_ocurridoEn_idx" ON "Checada"("empleadoId", "ocurridoEn");

-- CreateIndex
CREATE UNIQUE INDEX "Empleado_empresaId_telefonoWhatsapp_key" ON "Empleado"("empresaId", "telefonoWhatsapp");

-- CreateIndex
CREATE INDEX "Incidencia_empleadoId_origen_idx" ON "Incidencia"("empleadoId", "origen");

-- AddForeignKey
ALTER TABLE "Checada" ADD CONSTRAINT "Checada_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

