import { NextResponse } from "next/server";
import { MODEL_VERSION, screenerQuerySchema, toCsv, type CsvCell, type FranchiseRow } from "@linchpin/shared";
import { fetchAllFranchises } from "@/lib/api";

const HEADER = [
  "Franchise",
  "Medium",
  "Status",
  "Cast Size",
  "Cast Coverage",
  "Lead",
  "Top 1 Share",
  "Top 3 Share",
  "HHI",
  "Fragility",
  "Cast Exits",
  "Model Version",
];

/** Suppressed figures arrive as null and export as empty cells. Coverage is always written. */
function toCells(row: FranchiseRow): CsvCell[] {
  return [
    row.canonicalName,
    row.medium,
    row.status,
    row.rosterSize,
    row.rosterComplete,
    row.top1Share === null ? null : (row.topCharacter?.canonicalName ?? null),
    row.top1Share,
    row.top3Share,
    row.hhi,
    row.fragility,
    row.exitEventCount,
    MODEL_VERSION,
  ];
}

/** The screener's current filters and sort, every page, as one CSV. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = screenerQuerySchema
    .omit({ limit: true, cursor: true })
    .safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid screener filters" }, { status: 400 });
  }
  try {
    const rows = await fetchAllFranchises(parsed.data);
    return new NextResponse(toCsv(HEADER, rows.map(toCells)), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="linchpin-franchises-${MODEL_VERSION}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("export failed", error);
    return NextResponse.json({ error: "Export unavailable" }, { status: 502 });
  }
}
