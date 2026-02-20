-- CreateEnum
CREATE TYPE "LeagueJoinPolicy" AS ENUM ('PUBLIC', 'PRIVATE', 'APPROVAL');

-- CreateEnum
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED');

-- AlterTable
ALTER TABLE "League" ADD COLUMN     "inviteEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "joinPolicy" "LeagueJoinPolicy" NOT NULL DEFAULT 'PRIVATE';

-- CreateTable
CREATE TABLE "LeagueJoinRequest" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "reason" TEXT,

    CONSTRAINT "LeagueJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeagueJoinRequest_leagueId_status_idx" ON "LeagueJoinRequest"("leagueId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueJoinRequest_leagueId_userId_key" ON "LeagueJoinRequest"("leagueId", "userId");

-- AddForeignKey
ALTER TABLE "LeagueJoinRequest" ADD CONSTRAINT "LeagueJoinRequest_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueJoinRequest" ADD CONSTRAINT "LeagueJoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
