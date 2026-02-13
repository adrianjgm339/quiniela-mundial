-- AlterTable
ALTER TABLE "ScoringRule" ADD COLUMN     "seasonId" TEXT;

-- AlterTable
ALTER TABLE "Season" ADD COLUMN     "defaultScoringRuleId" TEXT;

-- CreateTable
CREATE TABLE "SeasonScoringConcept" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT,

    CONSTRAINT "SeasonScoringConcept_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeasonScoringConcept_seasonId_idx" ON "SeasonScoringConcept"("seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonScoringConcept_seasonId_code_key" ON "SeasonScoringConcept"("seasonId", "code");

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_defaultScoringRuleId_fkey" FOREIGN KEY ("defaultScoringRuleId") REFERENCES "ScoringRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringRule" ADD CONSTRAINT "ScoringRule_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonScoringConcept" ADD CONSTRAINT "SeasonScoringConcept_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;
