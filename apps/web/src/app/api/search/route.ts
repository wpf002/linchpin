import { NextResponse } from "next/server";
import { searchQuerySchema } from "@linchpin/shared";
import { fetchSearch } from "@/lib/api";

/** Same-origin proxy for the header search. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = searchQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "q must be 2 to 80 characters" }, { status: 400 });
  }
  try {
    return NextResponse.json(await fetchSearch(parsed.data.q));
  } catch (error) {
    console.error("search proxy failed", error);
    return NextResponse.json({ error: "Search unavailable" }, { status: 502 });
  }
}
