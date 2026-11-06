import { prisma, Prisma } from "@linchpin/db";
import { KILL_CRITERIA, MODEL_VERSION, ROSTER_COMPLETE_DISPLAY_FLOOR } from "@linchpin/shared";
import { CHARACTER_IMAGE } from "./images.js";
import type {
  CreatorRow,
  CreatorsQuery,
  CreatorsResponse,
  LeaderRow,
  LeadersQuery,
  LeadersResponse,
  SearchQuery,
  SearchResponse,
} from "@linchpin/shared";

/** Results per group in the header search. */
const SEARCH_LIMIT = 6;

/** Franchise names listed beside a creator. The full list lives on the franchise pages. */
const CREATOR_FRANCHISE_PREVIEW = 3;

/**
 * Completion rule for a creator project. Mirrors COMPLETED_FRANCHISE_STATUSES and
 * COMPLETED_CHARACTER_STATUSES in services/scoring/metrics/creator.py.
 */
const COMPLETED_FRANCHISE = Prisma.sql`('ENDED', 'CANCELLED')`;
const COMPLETED_CHARACTER = Prisma.sql`('DEPARTED', 'DECEASED', 'RECAST')`;

/** Escapes LIKE wildcards so a typed % or _ matches itself. */
export function likePattern(term: string, mode: "contains" | "prefix"): string {
  const escaped = term.replace(/[\\%_]/g, (char) => `\\${char}`);
  return mode === "prefix" ? `${escaped}%` : `%${escaped}%`;
}

export async function search(query: SearchQuery): Promise<SearchResponse> {
  const contains = likePattern(query.q, "contains");
  const prefix = likePattern(query.q, "prefix");
  const [franchises, characters] = await Promise.all([
    prisma.$queryRaw<SearchResponse["franchises"]>`
      SELECT f.id, f."canonicalName", f.medium::text AS "medium", f."imageUrl"
      FROM "Franchise" f
      WHERE f."canonicalName" ILIKE ${contains}
      ORDER BY (f."canonicalName" ILIKE ${prefix}) DESC, f."canonicalName" ASC
      LIMIT ${SEARCH_LIMIT}
    `,
    prisma.$queryRaw<SearchResponse["characters"]>`
      SELECT c.id,
             c."canonicalName",
             f.id AS "franchiseId",
             f."canonicalName" AS "franchiseName",
             ${CHARACTER_IMAGE} AS "imageUrl"
      FROM "Character" c
      JOIN "Franchise" f ON f.id = c."franchiseId"
      WHERE c."canonicalName" ILIKE ${contains}
      ORDER BY (c."canonicalName" ILIKE ${prefix}) DESC, c."canonicalName" ASC
      LIMIT ${SEARCH_LIMIT}
    `,
  ]);
  return { franchises, characters };
}

const LEADER_SORT: Record<LeadersQuery["sort"], Prisma.Sql> = {
  carryScore: Prisma.sql`cs."carryScore"`,
  offCycleCarry: Prisma.sql`cs."offCycleCarry"`,
  durabilityRatio: Prisma.sql`cs."durabilityRatio"`,
};

interface LeaderRecord {
  id: string;
  canonicalName: string;
  status: LeaderRow["status"];
  image_url: string | null;
  franchise_id: string;
  franchise_name: string;
  franchise_image_url: string | null;
  rosterComplete: number;
  carryScore: number;
  confidence: number;
  offCycleCarry: number | null;
  durabilityRatio: number | null;
  portrayed_by: string | null;
}

/**
 * Measured characters across every franchise above the coverage floor.
 * A character with zero confidence has no signal behind its share and is left out.
 */
export async function listLeaders(query: LeadersQuery): Promise<LeadersResponse> {
  const filters: Prisma.Sql[] = [
    Prisma.sql`f."rosterComplete" >= ${ROSTER_COMPLETE_DISPLAY_FLOOR}`,
    Prisma.sql`cs.confidence > 0`,
  ];
  if (query.q) {
    const pattern = likePattern(query.q, "contains");
    filters.push(
      Prisma.sql`(c."canonicalName" ILIKE ${pattern} OR f."canonicalName" ILIKE ${pattern})`,
    );
  }
  const source = Prisma.sql`
    FROM "Character" c
    JOIN "Franchise" f ON f.id = c."franchiseId"
    JOIN LATERAL (
      SELECT s."carryScore", s.confidence, s."offCycleCarry", s."durabilityRatio"
      FROM "CarryScore" s
      WHERE s."characterId" = c.id AND s."modelVersion" = ${MODEL_VERSION}
      ORDER BY s."windowEnd" DESC
      LIMIT 1
    ) cs ON TRUE
    WHERE ${Prisma.join(filters, " AND ")}
  `;
  const direction = query.order === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;

  const [records, totalRow] = await Promise.all([
    prisma.$queryRaw<LeaderRecord[]>`
      SELECT c.id,
             c."canonicalName",
             c.status::text AS "status",
             ${CHARACTER_IMAGE} AS image_url,
             f.id AS franchise_id,
             f."canonicalName" AS franchise_name,
             f."imageUrl" AS franchise_image_url,
             f."rosterComplete",
             cs."carryScore",
             cs.confidence,
             cs."offCycleCarry",
             cs."durabilityRatio",
             (
               SELECT p."canonicalName"
               FROM "PersonLink" pl
               JOIN "Person" p ON p.id = pl."personId"
               WHERE pl."characterId" = c.id
               ORDER BY pl."billingOrder" ASC NULLS LAST
               LIMIT 1
             ) AS portrayed_by
      ${source}
      ORDER BY ${LEADER_SORT[query.sort]} ${direction} NULLS LAST, c."canonicalName" ASC
      LIMIT ${query.limit + 1} OFFSET ${query.cursor}
    `,
    prisma.$queryRaw<{ total: bigint }[]>`SELECT COUNT(*) AS total ${source}`,
  ]);

  return {
    rows: records.slice(0, query.limit).map((record) => ({
      id: record.id,
      canonicalName: record.canonicalName,
      status: record.status,
      portrayedBy: record.portrayed_by,
      imageUrl: record.image_url,
      franchise: {
        id: record.franchise_id,
        canonicalName: record.franchise_name,
        imageUrl: record.franchise_image_url,
      },
      rosterComplete: record.rosterComplete,
      carryScore: record.carryScore,
      confidence: record.confidence,
      offCycleCarry: record.offCycleCarry,
      durabilityRatio: record.durabilityRatio,
    })),
    nextCursor: records.length > query.limit ? query.cursor + query.limit : null,
    total: Number(totalRow[0]?.total ?? 0),
  };
}

interface CreatorRecord {
  id: string;
  canonicalName: string;
  imageUrl: string | null;
  roles: CreatorRow["roles"];
  franchise_count: bigint;
  completed_count: bigint;
  residual: number | null;
  projectCount: number | null;
  confidence: number | null;
}

/** A stored score below the project minimum is never returned, whatever wrote it. */
export function toCreatorScore(
  record: Pick<CreatorRecord, "residual" | "projectCount" | "confidence">,
): CreatorRow["score"] {
  const { residual, projectCount, confidence } = record;
  if (residual === null || projectCount === null || confidence === null) return null;
  if (projectCount < KILL_CRITERIA.minCreatorProjects) return null;
  return { residual, projectCount, confidence };
}

async function franchisePreviews(personIds: string[]): Promise<Map<string, CreatorRow["franchises"]>> {
  const links = await prisma.personLink.findMany({
    where: { personId: { in: personIds } },
    distinct: ["personId", "franchiseId"],
    select: {
      personId: true,
      franchise: { select: { id: true, canonicalName: true, imageUrl: true } },
    },
    orderBy: { franchise: { canonicalName: "asc" } },
  });
  const byPerson = new Map<string, CreatorRow["franchises"]>();
  for (const link of links) {
    const list = byPerson.get(link.personId) ?? [];
    if (list.length < CREATOR_FRANCHISE_PREVIEW) list.push(link.franchise);
    byPerson.set(link.personId, list);
  }
  return byPerson;
}

/** Credited people, scored ones first. Most rows carry no score: that is the n >= 3 gate working. */
export async function listCreators(query: CreatorsQuery): Promise<CreatorsResponse> {
  const where = query.q
    ? Prisma.sql`p."canonicalName" ILIKE ${likePattern(query.q, "contains")}`
    : Prisma.sql`TRUE`;

  const [records, totalRow, scoredTotal] = await Promise.all([
    prisma.$queryRaw<CreatorRecord[]>`
      WITH credits AS (
        SELECT pl."personId" AS person_id,
               ARRAY_AGG(DISTINCT pl."roleType"::text) AS roles,
               COUNT(DISTINCT pl."franchiseId") AS franchise_count,
               COUNT(DISTINCT pl."franchiseId") FILTER (
                 WHERE f.status::text IN ${COMPLETED_FRANCHISE}
                    OR c.status::text IN ${COMPLETED_CHARACTER}
               ) AS completed_count
        FROM "PersonLink" pl
        JOIN "Franchise" f ON f.id = pl."franchiseId"
        LEFT JOIN "Character" c ON c.id = pl."characterId"
        GROUP BY pl."personId"
      )
      SELECT p.id,
             p."canonicalName",
             p."imageUrl",
             credits.roles,
             credits.franchise_count,
             credits.completed_count,
             score.residual,
             score."projectCount",
             score.confidence
      FROM "Person" p
      JOIN credits ON credits.person_id = p.id
      LEFT JOIN "CreatorScore" score
             ON score."personId" = p.id AND score."modelVersion" = ${MODEL_VERSION}
      WHERE ${where}
      ORDER BY (score.residual IS NULL) ASC,
               score.residual DESC NULLS LAST,
               credits.completed_count DESC,
               credits.franchise_count DESC,
               p."canonicalName" ASC
      LIMIT ${query.limit + 1} OFFSET ${query.cursor}
    `,
    prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*) AS total
      FROM "Person" p
      WHERE ${where} AND EXISTS (SELECT 1 FROM "PersonLink" pl WHERE pl."personId" = p.id)
    `,
    prisma.creatorScore.count({
      where: {
        modelVersion: MODEL_VERSION,
        projectCount: { gte: KILL_CRITERIA.minCreatorProjects },
      },
    }),
  ]);

  const page = records.slice(0, query.limit);
  const previews = await franchisePreviews(page.map((record) => record.id));
  return {
    rows: page.map((record) => ({
      personId: record.id,
      name: record.canonicalName,
      imageUrl: record.imageUrl,
      roles: record.roles,
      franchiseCount: Number(record.franchise_count),
      completedCount: Number(record.completed_count),
      franchises: previews.get(record.id) ?? [],
      score: toCreatorScore(record),
    })),
    nextCursor: records.length > query.limit ? query.cursor + query.limit : null,
    total: Number(totalRow[0]?.total ?? 0),
    scoredTotal,
  };
}
