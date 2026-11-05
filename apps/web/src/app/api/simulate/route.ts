import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiNotFoundError, fetchSimulation } from "@/lib/api";

const querySchema = z.object({ franchiseId: z.string().uuid(), characterId: z.string().uuid() });

/** Same-origin proxy so the browser never needs the API's address or CORS. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "franchiseId and characterId must be UUIDs" }, { status: 400 });
  }
  try {
    const simulation = await fetchSimulation(parsed.data.franchiseId, parsed.data.characterId);
    return NextResponse.json(simulation);
  } catch (error) {
    if (error instanceof ApiNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("simulation proxy failed", error);
    return NextResponse.json({ error: "Simulation unavailable" }, { status: 502 });
  }
}
