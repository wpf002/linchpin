-- CreateEnum
CREATE TYPE "Medium" AS ENUM ('TV', 'FILM', 'COMIC', 'ANIMATION', 'SPORTS');

-- CreateEnum
CREATE TYPE "FranchiseStatus" AS ENUM ('ACTIVE', 'ENDED', 'CANCELLED', 'HIATUS', 'ANNOUNCED');

-- CreateEnum
CREATE TYPE "CharacterStatus" AS ENUM ('ACTIVE', 'DEPARTED', 'DECEASED', 'RECAST', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RoleType" AS ENUM ('ACTOR', 'WRITER', 'DIRECTOR', 'SHOWRUNNER', 'ARTIST', 'CREATOR', 'ATHLETE');

-- CreateEnum
CREATE TYPE "SignalSource" AS ENUM ('WIKI', 'AO3', 'TRENDS', 'REDDIT', 'FANDOM');

-- CreateEnum
CREATE TYPE "ExitType" AS ENUM ('CHARACTER_DEATH', 'ACTOR_DEPARTURE', 'RECAST', 'SHOWRUNNER_EXIT', 'CREATIVE_TEAM_CHANGE');

-- CreateEnum
CREATE TYPE "GateOutcome" AS ENUM ('PASS', 'FAIL', 'BLOCKED');

-- CreateTable
CREATE TABLE "Franchise" (
    "id" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "aliases" TEXT[],
    "tmdbId" INTEGER,
    "wikiTitle" TEXT,
    "fandomWiki" TEXT,
    "primarySubs" TEXT[],
    "genres" TEXT[],
    "medium" "Medium" NOT NULL,
    "firstRelease" TIMESTAMP(3),
    "status" "FranchiseStatus" NOT NULL,
    "rosterComplete" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Franchise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Release" (
    "id" TEXT NOT NULL,
    "franchiseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "seasonNo" INTEGER,
    "episodeNo" INTEGER,
    "issueNo" INTEGER,
    "releasedOn" TIMESTAMP(3) NOT NULL,
    "tmdbId" INTEGER,

    CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "franchiseId" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "aliases" TEXT[],
    "wikiTitle" TEXT,
    "fandomPage" TEXT,
    "ao3Tag" TEXT,
    "tmdbCharId" INTEGER,
    "firstSeenAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "status" "CharacterStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "aliases" TEXT[],
    "tmdbPersonId" INTEGER,
    "roleTypes" "RoleType"[],

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonLink" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "characterId" TEXT,
    "franchiseId" TEXT NOT NULL,
    "roleType" "RoleType" NOT NULL,
    "billingOrder" INTEGER,
    "creditShare" DOUBLE PRECISION,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,

    CONSTRAINT "PersonLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttentionSignal" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "source" "SignalSource" NOT NULL,
    "measuredOn" DATE NOT NULL,
    "rawValue" DOUBLE PRECISION NOT NULL,
    "isOffCycle" BOOLEAN NOT NULL DEFAULT false,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,

    CONSTRAINT "AttentionSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarryScore" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "windowStart" DATE NOT NULL,
    "windowEnd" DATE NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "wikiShare" DOUBLE PRECISION NOT NULL,
    "fanworkShare" DOUBLE PRECISION,
    "searchShare" DOUBLE PRECISION,
    "discourseShare" DOUBLE PRECISION,
    "carryScore" DOUBLE PRECISION NOT NULL,
    "offCycleCarry" DOUBLE PRECISION,
    "durabilityRatio" DOUBLE PRECISION,
    "substitutability" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "observationCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CarryScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FragilityScore" (
    "id" TEXT NOT NULL,
    "franchiseId" TEXT NOT NULL,
    "scoredOn" DATE NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "hhi" DOUBLE PRECISION NOT NULL,
    "top1Share" DOUBLE PRECISION NOT NULL,
    "top3Share" DOUBLE PRECISION NOT NULL,
    "fragility" DOUBLE PRECISION NOT NULL,
    "rosterComplete" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "FragilityScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExitEvent" (
    "id" TEXT NOT NULL,
    "franchiseId" TEXT NOT NULL,
    "characterId" TEXT,
    "personId" TEXT,
    "exitType" "ExitType" NOT NULL,
    "eventDate" DATE NOT NULL,
    "announcedDate" DATE,
    "sourceUrl" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "ExitEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlSet" (
    "id" TEXT NOT NULL,
    "exitEventId" TEXT NOT NULL,
    "franchiseIds" TEXT[],
    "matchedOn" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventStudy" (
    "id" TEXT NOT NULL,
    "exitEventId" TEXT NOT NULL,
    "controlSetId" TEXT NOT NULL,
    "preMean" DOUBLE PRECISION NOT NULL,
    "postMean" DOUBLE PRECISION NOT NULL,
    "controlPre" DOUBLE PRECISION NOT NULL,
    "controlPost" DOUBLE PRECISION NOT NULL,
    "didEstimate" DOUBLE PRECISION NOT NULL,
    "stdError" DOUBLE PRECISION NOT NULL,
    "preCarryScore" DOUBLE PRECISION NOT NULL,
    "baselineRank" INTEGER,
    "announced" BOOLEAN NOT NULL DEFAULT false,
    "split" TEXT NOT NULL DEFAULT 'test',
    "modelVersion" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventStudy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationRun" (
    "id" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventCount" INTEGER NOT NULL,
    "verifiedEventCount" INTEGER NOT NULL,
    "rankIC" DOUBLE PRECISION,
    "rankICLower" DOUBLE PRECISION,
    "rankICUpper" DOUBLE PRECISION,
    "baselineRankIC" DOUBLE PRECISION,
    "baselineLower" DOUBLE PRECISION,
    "baselineUpper" DOUBLE PRECISION,
    "medianRosterComplete" DOUBLE PRECISION,
    "gate" "GateOutcome" NOT NULL,
    "failures" JSONB NOT NULL,
    "notes" TEXT,

    CONSTRAINT "ValidationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Franchise_medium_status_idx" ON "Franchise"("medium", "status");

-- CreateIndex
CREATE INDEX "Franchise_rosterComplete_idx" ON "Franchise"("rosterComplete");

-- CreateIndex
CREATE UNIQUE INDEX "Franchise_canonicalName_medium_key" ON "Franchise"("canonicalName", "medium");

-- CreateIndex
CREATE INDEX "Release_franchiseId_releasedOn_idx" ON "Release"("franchiseId", "releasedOn");

-- CreateIndex
CREATE INDEX "Character_franchiseId_idx" ON "Character"("franchiseId");

-- CreateIndex
CREATE UNIQUE INDEX "Character_franchiseId_canonicalName_key" ON "Character"("franchiseId", "canonicalName");

-- CreateIndex
CREATE INDEX "Person_canonicalName_idx" ON "Person"("canonicalName");

-- CreateIndex
CREATE INDEX "PersonLink_franchiseId_roleType_idx" ON "PersonLink"("franchiseId", "roleType");

-- CreateIndex
CREATE INDEX "PersonLink_characterId_idx" ON "PersonLink"("characterId");

-- CreateIndex
CREATE INDEX "AttentionSignal_measuredOn_idx" ON "AttentionSignal"("measuredOn");

-- CreateIndex
CREATE INDEX "AttentionSignal_characterId_source_measuredOn_idx" ON "AttentionSignal"("characterId", "source", "measuredOn");

-- CreateIndex
CREATE UNIQUE INDEX "AttentionSignal_characterId_source_measuredOn_key" ON "AttentionSignal"("characterId", "source", "measuredOn");

-- CreateIndex
CREATE INDEX "CarryScore_modelVersion_carryScore_idx" ON "CarryScore"("modelVersion", "carryScore");

-- CreateIndex
CREATE UNIQUE INDEX "CarryScore_characterId_windowStart_modelVersion_key" ON "CarryScore"("characterId", "windowStart", "modelVersion");

-- CreateIndex
CREATE INDEX "FragilityScore_modelVersion_fragility_idx" ON "FragilityScore"("modelVersion", "fragility");

-- CreateIndex
CREATE UNIQUE INDEX "FragilityScore_franchiseId_scoredOn_modelVersion_key" ON "FragilityScore"("franchiseId", "scoredOn", "modelVersion");

-- CreateIndex
CREATE INDEX "ExitEvent_eventDate_verified_idx" ON "ExitEvent"("eventDate", "verified");

-- CreateIndex
CREATE UNIQUE INDEX "ExitEvent_franchiseId_characterId_exitType_eventDate_key" ON "ExitEvent"("franchiseId", "characterId", "exitType", "eventDate");

-- CreateIndex
CREATE INDEX "ControlSet_exitEventId_idx" ON "ControlSet"("exitEventId");

-- CreateIndex
CREATE INDEX "EventStudy_modelVersion_idx" ON "EventStudy"("modelVersion");

-- CreateIndex
CREATE UNIQUE INDEX "EventStudy_exitEventId_modelVersion_key" ON "EventStudy"("exitEventId", "modelVersion");

-- CreateIndex
CREATE INDEX "ValidationRun_modelVersion_runAt_idx" ON "ValidationRun"("modelVersion", "runAt");

-- AddForeignKey
ALTER TABLE "Release" ADD CONSTRAINT "Release_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "Franchise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "Franchise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonLink" ADD CONSTRAINT "PersonLink_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonLink" ADD CONSTRAINT "PersonLink_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonLink" ADD CONSTRAINT "PersonLink_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "Franchise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttentionSignal" ADD CONSTRAINT "AttentionSignal_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarryScore" ADD CONSTRAINT "CarryScore_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FragilityScore" ADD CONSTRAINT "FragilityScore_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "Franchise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExitEvent" ADD CONSTRAINT "ExitEvent_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "Franchise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExitEvent" ADD CONSTRAINT "ExitEvent_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExitEvent" ADD CONSTRAINT "ExitEvent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlSet" ADD CONSTRAINT "ControlSet_exitEventId_fkey" FOREIGN KEY ("exitEventId") REFERENCES "ExitEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventStudy" ADD CONSTRAINT "EventStudy_exitEventId_fkey" FOREIGN KEY ("exitEventId") REFERENCES "ExitEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventStudy" ADD CONSTRAINT "EventStudy_controlSetId_fkey" FOREIGN KEY ("controlSetId") REFERENCES "ControlSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
