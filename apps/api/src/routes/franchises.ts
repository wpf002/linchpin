import type { FastifyInstance } from "fastify";
import {
  exitSimulationSchema,
  franchiseDetailSchema,
  screenerQuerySchema,
  screenerResponseSchema,
} from "@linchpin/shared";
import { z } from "zod";
import { getFranchise, listFranchises, simulateExit } from "../lib/repository.js";
import { parseOrBadRequest } from "../lib/validate.js";

const idParams = z.object({ id: z.string().uuid() });
const simulateParams = z.object({ id: z.string().uuid(), characterId: z.string().uuid() });

export async function franchiseRoutes(app: FastifyInstance): Promise<void> {
  app.get("/franchises", async (request) => {
    const query = parseOrBadRequest(screenerQuerySchema, request.query);
    return screenerResponseSchema.parse(await listFranchises(query));
  });

  app.get("/franchises/:id", async (request) => {
    const { id } = parseOrBadRequest(idParams, request.params);
    return franchiseDetailSchema.parse(await getFranchise(id));
  });

  app.get("/franchises/:id/simulate/:characterId", async (request) => {
    const { id, characterId } = parseOrBadRequest(simulateParams, request.params);
    return exitSimulationSchema.parse(await simulateExit(id, characterId));
  });
}
