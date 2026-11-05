import type { FastifyInstance } from "fastify";
import {
  characterDetailSchema,
  signalRowsQuerySchema,
  signalRowsResponseSchema,
} from "@linchpin/shared";
import { z } from "zod";
import { getCharacter, listSignalRows } from "../lib/repository.js";
import { parseOrBadRequest } from "../lib/validate.js";

const idParams = z.object({ id: z.string().uuid() });

export async function characterRoutes(app: FastifyInstance): Promise<void> {
  app.get("/characters/:id", async (request) => {
    const { id } = parseOrBadRequest(idParams, request.params);
    return characterDetailSchema.parse(await getCharacter(id));
  });

  app.get("/characters/:id/signals", async (request) => {
    const { id } = parseOrBadRequest(idParams, request.params);
    const query = parseOrBadRequest(signalRowsQuerySchema, request.query);
    return signalRowsResponseSchema.parse(await listSignalRows(id, query));
  });
}
