-- CreateTable
CREATE TABLE "PickScoreDetail" (
    "id" TEXT NOT NULL,
    "pickScoreId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "points" INTEGER NOT NULL,

    CONSTRAINT "PickScoreDetail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PickScoreDetail_pickScoreId_idx" ON "PickScoreDetail"("pickScoreId");

-- CreateIndex
CREATE INDEX "PickScoreDetail_code_idx" ON "PickScoreDetail"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PickScoreDetail_pickScoreId_code_key" ON "PickScoreDetail"("pickScoreId", "code");

-- AddForeignKey
ALTER TABLE "PickScoreDetail" ADD CONSTRAINT "PickScoreDetail_pickScoreId_fkey" FOREIGN KEY ("pickScoreId") REFERENCES "PickScore"("id") ON DELETE CASCADE ON UPDATE CASCADE;
