-- AlterTable
ALTER TABLE "League" ADD COLUMN     "scoringRuleId" TEXT;

-- CreateTable
CREATE TABLE "ScoringRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoringRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoringRuleDetail" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "points" INTEGER NOT NULL,

    CONSTRAINT "ScoringRuleDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickScore" (
    "id" TEXT NOT NULL,
    "pickId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,

    CONSTRAINT "PickScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScoringRuleDetail_ruleId_code_key" ON "ScoringRuleDetail"("ruleId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PickScore_pickId_ruleId_key" ON "PickScore"("pickId", "ruleId");

-- AddForeignKey
ALTER TABLE "League" ADD CONSTRAINT "League_scoringRuleId_fkey" FOREIGN KEY ("scoringRuleId") REFERENCES "ScoringRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringRuleDetail" ADD CONSTRAINT "ScoringRuleDetail_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ScoringRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickScore" ADD CONSTRAINT "PickScore_pickId_fkey" FOREIGN KEY ("pickId") REFERENCES "Pick"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickScore" ADD CONSTRAINT "PickScore_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ScoringRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
