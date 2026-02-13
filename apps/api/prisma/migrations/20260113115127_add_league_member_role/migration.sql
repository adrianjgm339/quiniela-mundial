-- CreateEnum
CREATE TYPE "LeagueMemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- AlterTable
ALTER TABLE "LeagueMember" ADD COLUMN     "role" "LeagueMemberRole" NOT NULL DEFAULT 'MEMBER';
