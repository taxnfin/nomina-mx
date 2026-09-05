-- AlterTable
ALTER TABLE "Empleado" ALTER COLUMN "claveEntidadFederativa" SET DEFAULT 'NLE';

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "claveEntidadIsn" TEXT NOT NULL DEFAULT 'NLE',
ADD COLUMN     "diaLimiteIsn" INTEGER,
ADD COLUMN     "sobretasaIsn" DECIMAL(9,6),
ADD COLUMN     "tasaIsn" DECIMAL(9,6);

