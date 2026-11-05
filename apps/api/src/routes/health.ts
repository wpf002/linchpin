import type { FastifyInstance } from "fastify";
import { prisma } from "@linchpin/db";
import { MODEL_VERSION } from "@linchpin/shared";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: "ok", modelVersion: MODEL_VERSION, database: true };
    } catch (error) {
      app.log.error({ err: error }, "health check could not reach the database");
      return reply.code(503).send({ status: "degraded", modelVersion: MODEL_VERSION, database: false });
    }
  });
}
