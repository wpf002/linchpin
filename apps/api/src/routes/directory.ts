import type { FastifyInstance } from "fastify";
import {
  creatorsQuerySchema,
  creatorsResponseSchema,
  searchQuerySchema,
  searchResponseSchema,
} from "@linchpin/shared";
import { listCreators, search } from "../lib/directory.js";
import { parseOrBadRequest } from "../lib/validate.js";

export async function directoryRoutes(app: FastifyInstance): Promise<void> {
  app.get("/search", async (request) => {
    const query = parseOrBadRequest(searchQuerySchema, request.query);
    return searchResponseSchema.parse(await search(query));
  });

  app.get("/creators", async (request) => {
    const query = parseOrBadRequest(creatorsQuerySchema, request.query);
    return creatorsResponseSchema.parse(await listCreators(query));
  });
}
