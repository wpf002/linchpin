import type { FastifyInstance } from "fastify";
import { vantageSectorSchema } from "@linchpin/shared";
import { getVantageSector } from "../lib/vantage.js";

/** Read-only. Vantage pulls the scored dataset; nothing is written from here. */
export async function vantageRoutes(app: FastifyInstance): Promise<void> {
  app.get("/vantage/sector", async () => {
    return vantageSectorSchema.parse(await getVantageSector(new Date()));
  });
}
