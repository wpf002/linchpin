import { describe, expect, it } from "vitest";
import { screenerQuerySchema } from "@linchpin/shared";

const hasDatabase = Boolean(process.env.DATABASE_URL);

/**
 * Regression: franchises below the coverage floor have score rows, so sorting by
 * fragility ranked them above scored franchises while showing "Suppressed".
 */
describe.skipIf(!hasDatabase)("listFranchises sort", () => {
  for (const sort of ["fragility", "hhi", "top1Share"] as const) {
    for (const order of ["asc", "desc"] as const) {
      it(`puts suppressed rows after scored rows for ${sort} ${order}`, async () => {
        const { listFranchises } = await import("../src/lib/repository.js");
        const page = await listFranchises(screenerQuerySchema.parse({ sort, order, limit: 200 }));
        const firstSuppressed = page.rows.findIndex((row) => row[sort] === null);
        if (firstSuppressed === -1) return;
        const scoredAfter = page.rows.slice(firstSuppressed).filter((row) => row[sort] !== null);
        expect(scoredAfter).toEqual([]);
      });
    }
  }
});
