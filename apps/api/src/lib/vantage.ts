import { prisma } from "@linchpin/db";
import { MODEL_VERSION } from "@linchpin/shared";
import type { VantageSector } from "@linchpin/shared";
import { toIsoDate } from "./dates.js";
import { applyDisplayFloor } from "./display.js";
import { getValidationReport } from "./repository.js";

const SECTOR = "entertainment_franchises" as const;

/**
 * The whole scored universe for the current model version, in one read.
 *
 * Suppression matches the web UI: concentration figures are null below the
 * roster coverage floor, unscored characters are left out, and creator scores
 * exist only for people with enough completed projects.
 */
export async function getVantageSector(generatedAt: Date): Promise<VantageSector> {
  const [report, franchises, carryScores, creatorScores] = await Promise.all([
    getValidationReport(),
    prisma.franchise.findMany({
      include: {
        _count: { select: { characters: true } },
        fragility: {
          where: { modelVersion: MODEL_VERSION },
          orderBy: { scoredOn: "desc" },
          take: 1,
        },
      },
      orderBy: { canonicalName: "asc" },
    }),
    prisma.carryScore.findMany({
      where: { modelVersion: MODEL_VERSION },
      include: {
        character: { select: { id: true, franchiseId: true, canonicalName: true, status: true } },
      },
      orderBy: [{ windowEnd: "desc" }, { carryScore: "desc" }],
    }),
    prisma.creatorScore.findMany({
      where: { modelVersion: MODEL_VERSION },
      include: { person: { select: { canonicalName: true } } },
      orderBy: { residual: "desc" },
    }),
  ]);

  const latestByCharacter = new Map<string, (typeof carryScores)[number]>();
  for (const score of carryScores) {
    if (!latestByCharacter.has(score.characterId)) latestByCharacter.set(score.characterId, score);
  }

  return {
    sector: SECTOR,
    modelVersion: MODEL_VERSION,
    generatedAt: generatedAt.toISOString(),
    gate: report.gate,
    rankIC: report.rankIC,
    signalBlend: report.blend?.verdict ?? null,
    franchises: franchises.map((franchise) => {
      const score = franchise.fragility[0];
      return {
        id: franchise.id,
        name: franchise.canonicalName,
        medium: franchise.medium,
        status: franchise.status,
        rosterSize: franchise._count.characters,
        rosterComplete: franchise.rosterComplete,
        ...applyDisplayFloor(franchise.rosterComplete, {
          fragility: score?.fragility ?? null,
          hhi: score?.hhi ?? null,
          top1Share: score?.top1Share ?? null,
          top3Share: score?.top3Share ?? null,
        }),
        scoredOn: toIsoDate(score?.scoredOn ?? null),
      };
    }),
    characters: [...latestByCharacter.values()].map((score) => ({
      id: score.character.id,
      franchiseId: score.character.franchiseId,
      name: score.character.canonicalName,
      status: score.character.status,
      carryScore: score.carryScore,
      confidence: score.confidence,
      offCycleCarry: score.offCycleCarry,
      durabilityRatio: score.durabilityRatio,
      substitutability: score.substitutability,
      substitutabilityFlag: score.substitutabilityFlag,
    })),
    creators: creatorScores.map((score) => ({
      personId: score.personId,
      name: score.person.canonicalName,
      residual: score.residual,
      projectCount: score.projectCount,
      confidence: score.confidence,
    })),
  };
}
