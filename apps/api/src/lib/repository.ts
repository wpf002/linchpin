import { prisma, Prisma } from "@linchpin/db";
import {
  MODEL_VERSION,
  ROSTER_COMPLETE_DISPLAY_FLOOR,
  SIGNAL_SOURCE_BY_SHARE,
  SIGNAL_WEIGHTS,
  hhi as computeHhi,
  simulateRemoval,
  topNShare,
} from "@linchpin/shared";
import type {
  CharacterDetail,
  CharacterRow,
  EventStudyRow,
  ExitSimulation,
  FranchiseDetail,
  FranchiseRow,
  ScreenerQuery,
  SignalRowsQuery,
  SignalRowsResponse,
  ValidationReport,
} from "@linchpin/shared";
import { z } from "zod";
import { toIsoDate, toIsoDateTime } from "./dates.js";
import { applyDisplayFloor } from "./display.js";
import { NotFoundError } from "./errors.js";
import { parseBlend, parseStrata } from "./validation-run.js";

/** Signal history returned with a character. A year of daily points. */
const SERIES_DAYS = 365;

/** How many absorbers an exit simulation names. Beyond this the deltas are noise. */
const MAX_ABSORBERS = 5;

type SortKey = ScreenerQuery["sort"];

/**
 * A franchise below the coverage floor still has score rows, but its figures
 * are withheld. Sorting on the gated value sends those rows last (NULLS LAST)
 * instead of ranking them by a number nobody is shown.
 */
function gated(column: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`CASE WHEN f."rosterComplete" >= ${ROSTER_COMPLETE_DISPLAY_FLOOR} THEN ${column} END`;
}

const SORT_COLUMNS: Record<SortKey, Prisma.Sql> = {
  fragility: gated(Prisma.sql`fs.fragility`),
  hhi: gated(Prisma.sql`fs.hhi`),
  top1Share: gated(Prisma.sql`fs."top1Share"`),
  rosterSize: Prisma.sql`roster.roster_size`,
  name: Prisma.sql`f."canonicalName"`,
};

interface ScreenerRecord {
  id: string;
  canonicalName: string;
  medium: FranchiseRow["medium"];
  status: FranchiseRow["status"];
  firstRelease: Date | null;
  rosterComplete: number;
  roster_size: bigint;
  fragility: number | null;
  hhi: number | null;
  top1Share: number | null;
  top3Share: number | null;
  scoredOn: Date | null;
  exit_event_count: bigint;
  top_character_id: string | null;
  top_character_name: string | null;
}

export async function listFranchises(
  query: ScreenerQuery,
): Promise<{ rows: FranchiseRow[]; nextCursor: number | null; total: number }> {
  const filters: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (query.q) filters.push(Prisma.sql`f."canonicalName" ILIKE ${`%${query.q}%`}`);
  if (query.medium) filters.push(Prisma.sql`f.medium = ${query.medium}::"Medium"`);
  if (query.status) filters.push(Prisma.sql`f.status = ${query.status}::"FranchiseStatus"`);
  if (query.minRosterComplete !== undefined) {
    filters.push(Prisma.sql`f."rosterComplete" >= ${query.minRosterComplete}`);
  }
  const where = Prisma.join(filters, " AND ");
  const direction = query.order === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;

  const records = await prisma.$queryRaw<ScreenerRecord[]>`
    SELECT f.id,
           f."canonicalName",
           f.medium::text   AS "medium",
           f.status::text    AS "status",
           f."firstRelease",
           f."rosterComplete",
           roster.roster_size,
           fs.fragility,
           fs.hhi,
           fs."top1Share",
           fs."top3Share",
           fs."scoredOn",
           COALESCE(exits.exit_event_count, 0) AS exit_event_count,
           top.character_id  AS top_character_id,
           top.character_name AS top_character_name
    FROM "Franchise" f
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS roster_size FROM "Character" c WHERE c."franchiseId" = f.id
    ) roster ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS exit_event_count FROM "ExitEvent" e WHERE e."franchiseId" = f.id
    ) exits ON TRUE
    LEFT JOIN LATERAL (
      SELECT s.fragility, s.hhi, s."top1Share", s."top3Share", s."scoredOn"
      FROM "FragilityScore" s
      WHERE s."franchiseId" = f.id AND s."modelVersion" = ${MODEL_VERSION}
      ORDER BY s."scoredOn" DESC
      LIMIT 1
    ) fs ON TRUE
    LEFT JOIN LATERAL (
      SELECT c.id AS character_id, c."canonicalName" AS character_name
      FROM "CarryScore" cs
      JOIN "Character" c ON c.id = cs."characterId"
      WHERE c."franchiseId" = f.id AND cs."modelVersion" = ${MODEL_VERSION}
      ORDER BY cs."carryScore" DESC
      LIMIT 1
    ) top ON TRUE
    WHERE ${where}
    ORDER BY ${SORT_COLUMNS[query.sort]} ${direction} NULLS LAST, f."canonicalName" ASC
    LIMIT ${query.limit + 1} OFFSET ${query.cursor}
  `;

  const totalRow = await prisma.$queryRaw<{ total: bigint }[]>`
    SELECT COUNT(*) AS total FROM "Franchise" f WHERE ${where}
  `;

  const page = records.slice(0, query.limit);
  return {
    rows: page.map(toFranchiseRow),
    nextCursor: records.length > query.limit ? query.cursor + query.limit : null,
    total: Number(totalRow[0]?.total ?? 0),
  };
}

function toFranchiseRow(record: ScreenerRecord): FranchiseRow {
  const figures = applyDisplayFloor(record.rosterComplete, {
    fragility: record.fragility,
    hhi: record.hhi,
    top1Share: record.top1Share,
    top3Share: record.top3Share,
  });
  return {
    id: record.id,
    canonicalName: record.canonicalName,
    medium: record.medium,
    status: record.status,
    firstRelease: toIsoDate(record.firstRelease),
    rosterSize: Number(record.roster_size),
    rosterComplete: record.rosterComplete,
    ...figures,
    topCharacter:
      record.top_character_id && record.top_character_name
        ? { id: record.top_character_id, canonicalName: record.top_character_name }
        : null,
    exitEventCount: Number(record.exit_event_count),
    scoredOn: toIsoDate(record.scoredOn),
    modelVersion: MODEL_VERSION,
  };
}

export async function getFranchise(id: string): Promise<FranchiseDetail> {
  const franchise = await prisma.franchise.findUnique({
    where: { id },
    include: {
      releases: { orderBy: { releasedOn: "asc" } },
      exitEvents: {
        orderBy: { eventDate: "desc" },
        include: {
          character: { select: { canonicalName: true } },
          person: { select: { canonicalName: true } },
          studyResults: { where: { modelVersion: MODEL_VERSION }, take: 1 },
        },
      },
    },
  });
  if (!franchise) throw new NotFoundError("franchise");

  const rows = await listFranchises({
    q: franchise.canonicalName,
    sort: "name",
    order: "asc",
    limit: 200,
    cursor: 0,
  });
  const base = rows.rows.find((row) => row.id === id);
  if (!base) throw new NotFoundError("franchise");

  return {
    ...base,
    aliases: franchise.aliases,
    wikiTitle: franchise.wikiTitle,
    primarySubs: franchise.primarySubs,
    characters: await listCharacters(id),
    releases: franchise.releases.map((release) => ({
      id: release.id,
      title: release.title,
      seasonNo: release.seasonNo,
      releasedOn: toIsoDate(release.releasedOn) ?? "",
    })),
    exitEvents: franchise.exitEvents.map((event) => {
      const study = event.studyResults[0];
      return {
        id: event.id,
        exitType: event.exitType,
        eventDate: toIsoDate(event.eventDate) ?? "",
        announcedDate: toIsoDate(event.announcedDate),
        characterName: event.character?.canonicalName ?? null,
        personName: event.person?.canonicalName ?? null,
        verified: event.verified,
        sourceUrl: event.sourceUrl,
        didEstimate: study?.didEstimate ?? null,
        preCarryScore: study?.preCarryScore ?? null,
      };
    }),
  };
}

export async function listCharacters(franchiseId: string): Promise<CharacterRow[]> {
  const characters = await prisma.character.findMany({
    where: { franchiseId },
    include: {
      carryScores: {
        where: { modelVersion: MODEL_VERSION },
        orderBy: { windowEnd: "desc" },
        take: 1,
      },
      portrayedBy: {
        include: { person: { select: { canonicalName: true } } },
        orderBy: { billingOrder: "asc" },
        take: 1,
      },
    },
  });

  return characters
    .map((character): CharacterRow => {
      const score = character.carryScores[0];
      const link = character.portrayedBy[0];
      return {
        id: character.id,
        canonicalName: character.canonicalName,
        status: character.status,
        portrayedBy: link?.person.canonicalName ?? null,
        billingOrder: link?.billingOrder ?? null,
        carryScore: score?.carryScore ?? 0,
        offCycleCarry: score?.offCycleCarry ?? null,
        durabilityRatio: score?.durabilityRatio ?? null,
        substitutability: score?.substitutability ?? null,
        substitutabilityFlag: score?.substitutabilityFlag ?? null,
        confidence: score?.confidence ?? 0,
        signals: {
          wikiShare: score?.wikiShare ?? 0,
          fanworkShare: score?.fanworkShare ?? null,
          searchShare: score?.searchShare ?? null,
          discourseShare: score?.discourseShare ?? null,
        },
      };
    })
    .sort((left, right) => right.carryScore - left.carryScore);
}

export async function getCharacter(id: string): Promise<CharacterDetail> {
  const character = await prisma.character.findUnique({
    where: { id },
    include: {
      franchise: { select: { id: true, canonicalName: true } },
      carryScores: {
        where: { modelVersion: MODEL_VERSION },
        orderBy: { windowEnd: "desc" },
        take: 1,
      },
      portrayedBy: {
        include: { person: { select: { canonicalName: true } } },
        orderBy: { billingOrder: "asc" },
        take: 1,
      },
    },
  });
  if (!character) throw new NotFoundError("character");

  const roster = await listCharacters(character.franchiseId);
  const row = roster.find((entry) => entry.id === id);
  if (!row) throw new NotFoundError("character");
  const rank = roster.findIndex((entry) => entry.id === id) + 1;

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - SERIES_DAYS);
  const signals = await prisma.attentionSignal.findMany({
    where: { characterId: id, measuredOn: { gte: since } },
    orderBy: { measuredOn: "asc" },
    select: { measuredOn: true, rawValue: true, isOffCycle: true, source: true },
  });

  const observationsBySource = signals.reduce<Record<string, number>>((counts, signal) => {
    counts[signal.source] = (counts[signal.source] ?? 0) + 1;
    return counts;
  }, {});

  return {
    ...row,
    franchise: character.franchise,
    aliases: character.aliases,
    wikiTitle: character.wikiTitle,
    firstSeenAt: toIsoDate(character.firstSeenAt),
    lastSeenAt: toIsoDate(character.lastSeenAt),
    rankInFranchise: rank,
    // The chart plots pageviews. Search rows are in anchor units and stay out of it.
    series: signals
      .filter((signal) => signal.source === SIGNAL_SOURCE_BY_SHARE.wikiShare)
      .map((signal) => ({
        measuredOn: toIsoDate(signal.measuredOn) ?? "",
        rawValue: signal.rawValue,
        isOffCycle: signal.isOffCycle,
      })),
    attribution: buildAttribution(row, observationsBySource),
  };
}

function buildAttribution(
  row: CharacterRow,
  observations: Record<string, number>,
): CharacterDetail["attribution"] {
  const present = Object.entries(SIGNAL_WEIGHTS).filter(
    ([key]) => row.signals[key as keyof typeof row.signals] !== null,
  );
  const weightSum = present.reduce((total, [, weight]) => total + weight, 0);

  return Object.entries(SIGNAL_WEIGHTS).map(([key, weight]) => {
    const share = row.signals[key as keyof typeof row.signals];
    const source = SIGNAL_SOURCE_BY_SHARE[key as keyof typeof SIGNAL_SOURCE_BY_SHARE];
    // The renormalised weight: a character measured on wiki alone attributes
    // all of its score to wiki, not 0.35 of it.
    const effective = share === null || weightSum <= 0 ? 0 : weight / weightSum;
    return {
      source,
      share,
      weight: effective,
      contribution: share === null ? 0 : share * effective,
      observationCount: observations[source] ?? 0,
    };
  });
}

export async function getValidationReport(): Promise<ValidationReport> {
  const run = await prisma.validationRun.findFirst({
    where: { modelVersion: MODEL_VERSION },
    orderBy: { runAt: "desc" },
  });
  if (!run) {
    return {
      modelVersion: MODEL_VERSION,
      runAt: null,
      eventCount: 0,
      verifiedEventCount: 0,
      rankIC: null,
      rankICLower: null,
      rankICUpper: null,
      baselineRankIC: null,
      baselineLower: null,
      baselineUpper: null,
      medianRosterComplete: null,
      gate: "BLOCKED",
      failures: [{ criterion: "run", detail: "No validation run has been recorded yet." }],
      strata: [],
      comparisons: [],
      blend: null,
    };
  }

  return {
    modelVersion: run.modelVersion,
    runAt: toIsoDateTime(run.runAt),
    eventCount: run.eventCount,
    verifiedEventCount: run.verifiedEventCount,
    rankIC: run.rankIC,
    rankICLower: run.rankICLower,
    rankICUpper: run.rankICUpper,
    baselineRankIC: run.baselineRankIC,
    baselineLower: run.baselineLower,
    baselineUpper: run.baselineUpper,
    medianRosterComplete: run.medianRosterComplete,
    gate: run.gate,
    failures: parseFailures(run.failures),
    ...parseStrata(run.strata),
    blend: parseBlend(run.blend),
  };
}

const storedFailuresSchema = z.array(z.object({ criterion: z.string(), detail: z.string() }));

function parseFailures(raw: unknown): ValidationReport["failures"] {
  const parsed = storedFailuresSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`ValidationRun.failures has an unexpected shape: ${parsed.error.message}`);
  }
  return parsed.data;
}

export async function simulateExit(
  franchiseId: string,
  characterId: string,
): Promise<ExitSimulation> {
  const roster = await listCharacters(franchiseId);
  if (roster.length === 0) throw new NotFoundError("franchise");
  const index = roster.findIndex((entry) => entry.id === characterId);
  if (index < 0) throw new NotFoundError("character");

  const scores = roster.map((entry) => entry.carryScore);
  const before = { hhi: computeHhi(scores), top1Share: topNShare(scores, 1) };
  const after = simulateRemoval(scores, index);

  const remainingNames = roster.filter((_, position) => position !== index);
  const sharesBefore = normalise(scores).filter((_, position) => position !== index);
  const absorbers = remainingNames
    .map((entry, position) => ({
      characterId: entry.id,
      canonicalName: entry.canonicalName,
      delta: (after.remaining[position] ?? 0) - (sharesBefore[position] ?? 0),
    }))
    .sort((left, right) => right.delta - left.delta)
    .slice(0, MAX_ABSORBERS);

  return {
    franchiseId,
    characterId,
    removedCarryScore: roster[index]?.carryScore ?? 0,
    hhiBefore: before.hhi,
    hhiAfter: after.hhi,
    top1Before: before.top1Share,
    top1After: after.top1Share,
    absorbers,
    projectedDecline: await projectDecline(roster[index]?.carryScore ?? 0),
  };
}

function normalise(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) return values.map(() => 0);
  return values.map((value) => Math.max(0, value) / total);
}

/** Minimum comparable events before a projection is offered at all. */
const MIN_COMPARABLE_EVENTS = 12;

/** Half-width of the carry-score band used to find comparable past exits. */
const COMPARABLE_CARRY_BAND = 0.08;

async function projectDecline(carryScore: number): Promise<ExitSimulation["projectedDecline"]> {
  const studies = await prisma.eventStudy.findMany({
    where: {
      modelVersion: MODEL_VERSION,
      announced: false,
      preCarryScore: {
        gte: carryScore - COMPARABLE_CARRY_BAND,
        lte: carryScore + COMPARABLE_CARRY_BAND,
      },
    },
    select: { didEstimate: true },
  });
  if (studies.length < MIN_COMPARABLE_EVENTS) return null;

  const estimates = studies.map((study) => study.didEstimate).sort((a, b) => a - b);
  const mean = estimates.reduce((sum, value) => sum + value, 0) / estimates.length;
  return {
    pointEstimate: mean,
    lower: estimates[Math.floor(estimates.length * 0.025)] ?? mean,
    upper: estimates[Math.min(estimates.length - 1, Math.floor(estimates.length * 0.975))] ?? mean,
    comparableEvents: estimates.length,
    basis: `Realised exits with pre-event carry score within ${COMPARABLE_CARRY_BAND} of this character.`,
  };
}


export async function listSignalRows(
  characterId: string,
  query: SignalRowsQuery,
): Promise<SignalRowsResponse> {
  const exists = await prisma.character.count({ where: { id: characterId } });
  if (exists === 0) throw new NotFoundError("character");

  const where = { characterId, ...(query.source ? { source: query.source } : {}) };
  const [rows, total] = await Promise.all([
    prisma.attentionSignal.findMany({
      where,
      orderBy: [{ measuredOn: "desc" }, { source: "asc" }],
      skip: query.cursor,
      take: query.limit,
      select: { measuredOn: true, source: true, rawValue: true, isOffCycle: true, confidence: true },
    }),
    prisma.attentionSignal.count({ where }),
  ]);

  const nextCursor = query.cursor + rows.length;
  return {
    characterId,
    rows: rows.map((row) => ({ ...row, measuredOn: toIsoDate(row.measuredOn) ?? "" })),
    nextCursor: nextCursor < total ? nextCursor : null,
    total,
  };
}

export async function listEventStudies(): Promise<EventStudyRow[]> {
  const studies = await prisma.eventStudy.findMany({
    where: { modelVersion: MODEL_VERSION },
    include: {
      exitEvent: {
        include: {
          franchise: { select: { id: true, canonicalName: true } },
          character: { select: { id: true, canonicalName: true } },
        },
      },
    },
    orderBy: { exitEvent: { eventDate: "desc" } },
  });

  return studies.map((study) => ({
    exitEventId: study.exitEventId,
    franchiseId: study.exitEvent.franchise.id,
    franchiseName: study.exitEvent.franchise.canonicalName,
    characterId: study.exitEvent.character?.id ?? null,
    characterName: study.exitEvent.character?.canonicalName ?? null,
    eventDate: toIsoDate(study.exitEvent.eventDate) ?? "",
    preCarryScore: study.preCarryScore,
    didEstimate: study.didEstimate,
    stdError: study.stdError,
    baselineRank: study.baselineRank,
    announced: study.announced,
  }));
}
