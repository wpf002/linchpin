-- AlterTable
ALTER TABLE "CarryScore" ADD COLUMN     "substitutabilityFlag" TEXT;

-- AlterTable
ALTER TABLE "EventStudy" ADD COLUMN     "preSearchShare" DOUBLE PRECISION,
ADD COLUMN     "preWikiShare" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "FragilityScore" ADD COLUMN     "substitutability" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "ValidationRun" ADD COLUMN     "blend" JSONB,
ADD COLUMN     "strata" JSONB;

-- CreateTable
CREATE TABLE "CreatorScore" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "scoredOn" DATE NOT NULL,
    "residual" DOUBLE PRECISION NOT NULL,
    "projectCount" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "CreatorScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreatorScore_modelVersion_residual_idx" ON "CreatorScore"("modelVersion", "residual");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorScore_personId_modelVersion_key" ON "CreatorScore"("personId", "modelVersion");

-- AddForeignKey
ALTER TABLE "CreatorScore" ADD CONSTRAINT "CreatorScore_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
