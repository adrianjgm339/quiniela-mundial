-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "flagKey" TEXT,
    "groupCode" TEXT,
    "confed" TEXT,
    "isPlaceholder" BOOLEAN NOT NULL DEFAULT false,
    "placeholderRule" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamTranslation" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "TeamTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "phaseCode" TEXT NOT NULL,
    "groupCode" TEXT,
    "matchNumber" INTEGER,
    "venue" TEXT,
    "utcDateTime" TIMESTAMP(3) NOT NULL,
    "closeUtc" TIMESTAMP(3),
    "closeMinutes" INTEGER,
    "status" "MatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "statusRaw" TEXT,
    "resultConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Team_seasonId_externalId_key" ON "Team"("seasonId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamTranslation_teamId_locale_key" ON "TeamTranslation"("teamId", "locale");

-- CreateIndex
CREATE INDEX "Match_seasonId_utcDateTime_idx" ON "Match"("seasonId", "utcDateTime");

-- CreateIndex
CREATE UNIQUE INDEX "Match_seasonId_externalId_key" ON "Match"("seasonId", "externalId");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamTranslation" ADD CONSTRAINT "TeamTranslation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
