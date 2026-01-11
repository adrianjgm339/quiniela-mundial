-- AlterTable
ALTER TABLE "User" ADD COLUMN     "activeSeasonId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_activeSeasonId_fkey" FOREIGN KEY ("activeSeasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;
