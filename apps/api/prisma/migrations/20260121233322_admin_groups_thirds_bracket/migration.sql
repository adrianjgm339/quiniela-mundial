-- CreateEnum
CREATE TYPE "BracketRound" AS ENUM ('R32');

-- CreateEnum
CREATE TYPE "BracketSlotType" AS ENUM ('HOME', 'AWAY');

-- CreateTable
CREATE TABLE "GroupStanding" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "groupCode" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "played" INTEGER NOT NULL DEFAULT 0,
    "won" INTEGER NOT NULL DEFAULT 0,
    "drawn" INTEGER NOT NULL DEFAULT 0,
    "lost" INTEGER NOT NULL DEFAULT 0,
    "gf" INTEGER NOT NULL DEFAULT 0,
    "ga" INTEGER NOT NULL DEFAULT 0,
    "gd" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "posGroup" INTEGER,
    "needsManual" BOOLEAN NOT NULL DEFAULT false,
    "manualOverride" BOOLEAN NOT NULL DEFAULT false,
    "manualReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupStanding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThirdPlaceRanking" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "groupCode" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "gd" INTEGER NOT NULL,
    "gf" INTEGER NOT NULL,
    "ga" INTEGER NOT NULL,
    "rankGlobal" INTEGER,
    "isQualified" BOOLEAN NOT NULL DEFAULT false,
    "needsManual" BOOLEAN NOT NULL DEFAULT false,
    "manualOverride" BOOLEAN NOT NULL DEFAULT false,
    "manualReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThirdPlaceRanking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BracketSlot" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "round" "BracketRound" NOT NULL DEFAULT 'R32',
    "matchNo" INTEGER NOT NULL,
    "slot" "BracketSlotType" NOT NULL,
    "placeholderText" TEXT,
    "teamId" TEXT,
    "needsManual" BOOLEAN NOT NULL DEFAULT false,
    "manualOverride" BOOLEAN NOT NULL DEFAULT false,
    "manualReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BracketSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupStanding_seasonId_groupCode_idx" ON "GroupStanding"("seasonId", "groupCode");

-- CreateIndex
CREATE UNIQUE INDEX "GroupStanding_seasonId_groupCode_teamId_key" ON "GroupStanding"("seasonId", "groupCode", "teamId");

-- CreateIndex
CREATE INDEX "ThirdPlaceRanking_seasonId_idx" ON "ThirdPlaceRanking"("seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "ThirdPlaceRanking_seasonId_teamId_key" ON "ThirdPlaceRanking"("seasonId", "teamId");

-- CreateIndex
CREATE INDEX "BracketSlot_seasonId_round_idx" ON "BracketSlot"("seasonId", "round");

-- CreateIndex
CREATE UNIQUE INDEX "BracketSlot_seasonId_round_matchNo_slot_key" ON "BracketSlot"("seasonId", "round", "matchNo", "slot");

-- AddForeignKey
ALTER TABLE "GroupStanding" ADD CONSTRAINT "GroupStanding_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupStanding" ADD CONSTRAINT "GroupStanding_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThirdPlaceRanking" ADD CONSTRAINT "ThirdPlaceRanking_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThirdPlaceRanking" ADD CONSTRAINT "ThirdPlaceRanking_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BracketSlot" ADD CONSTRAINT "BracketSlot_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BracketSlot" ADD CONSTRAINT "BracketSlot_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
