-- AlterTable
ALTER TABLE "Checada" ADD COLUMN     "distanciaMetros" INTEGER,
ADD COLUMN     "fueraDeRango" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Empleado" ADD COLUMN     "exigeUbicacion" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "latitudCentro" DECIMAL(10,6),
ADD COLUMN     "longitudCentro" DECIMAL(10,6),
ADD COLUMN     "radioMetros" INTEGER NOT NULL DEFAULT 200;

