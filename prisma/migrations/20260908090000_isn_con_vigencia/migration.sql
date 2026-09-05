-- CreateTable
CREATE TABLE "ConfiguracionIsn" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "vigenteDesde" DATE NOT NULL,
    "claveEntidadIsn" TEXT NOT NULL,
    "tasaIsn" DECIMAL(9,6),
    "sobretasaIsn" DECIMAL(9,6),
    "diaLimiteIsn" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfiguracionIsn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConfiguracionIsn_empresaId_vigenteDesde_idx" ON "ConfiguracionIsn"("empresaId", "vigenteDesde");

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracionIsn_empresaId_vigenteDesde_key" ON "ConfiguracionIsn"("empresaId", "vigenteDesde");

-- AddForeignKey
ALTER TABLE "ConfiguracionIsn" ADD CONSTRAINT "ConfiguracionIsn_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- La configuración vigente hasta hoy se conserva con una vigencia anterior a
-- cualquier periodo declarado, para que los meses ya cerrados no cambien.
INSERT INTO "ConfiguracionIsn" ("id", "empresaId", "vigenteDesde", "claveEntidadIsn", "tasaIsn", "sobretasaIsn", "diaLimiteIsn")
SELECT gen_random_uuid()::text, "id", DATE '2000-01-01', "claveEntidadIsn", "tasaIsn", "sobretasaIsn", "diaLimiteIsn"
FROM "Empresa";

-- AlterTable
ALTER TABLE "Empresa" DROP COLUMN "claveEntidadIsn",
DROP COLUMN "diaLimiteIsn",
DROP COLUMN "sobretasaIsn",
DROP COLUMN "tasaIsn";
