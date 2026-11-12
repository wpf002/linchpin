import type { FastifyInstance } from "fastify";
import {
  franchiseDetailSchema,
  screenerQuerySchema,
  screenerResponseSchema,
} from "@linchpin/shared";
import { z } from "zod";
import { getFranchise, listFranchises } from "../lib/repository.js";
import { parseOrBadRequest } from "../lib/validate.js";

const idParams = z.object({ id: z.string().uuid() });

export async function franchiseRoutes(app: FastifyInstance): Promise<void> {
  app.get("/franchises", async (request) => {
    const query = parseOrBadRequest(screenerQuerySchema, request.query);
    return screenerResponseSchema.parse(await listFranchises(query));
  });

  app.get("/franchises/:id", async (request) => {
    const { id } = parseOrBadRequest(idParams, request.params);
    return franchiseDetailSchema.parse(await getFranchise(id));
  });
}
