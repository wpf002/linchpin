import type { FastifyInstance } from "fastify";
import {
  KILL_CRITERIA,
  eventStudiesResponseSchema,
  validationResponseSchema,
} from "@linchpin/shared";
import { getValidationReport, listEventStudies } from "../lib/repository.js";

export async function validationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/validation", async () => {
    const report = await getValidationReport();
    return validationResponseSchema.parse({ ...report, killCriteria: KILL_CRITERIA });
  });

  app.get("/validation/studies", async () => {
    return eventStudiesResponseSchema.parse(await listEventStudies());
  });
}
