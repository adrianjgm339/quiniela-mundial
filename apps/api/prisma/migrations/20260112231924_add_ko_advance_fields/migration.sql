-- CreateEnum
CREATE TYPE "MatchAdvanceMethod" AS ENUM ('ET', 'PEN');

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "advanceMethod" "MatchAdvanceMethod",
ADD COLUMN     "advanceTeamId" TEXT;

-- AlterTable
ALTER TABLE "Pick" ADD COLUMN     "koWinnerTeamId" TEXT;
