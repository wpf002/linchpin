import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { BadRequestError, NotFoundError } from "./lib/errors.js";
import { characterRoutes } from "./routes/characters.js";
import { franchiseRoutes } from "./routes/franchises.js";
import { healthRoutes } from "./routes/health.js";
import { validationRoutes } from "./routes/validation.js";

export interface AppOptions {
  webOrigin: string;
  logLevel: string;
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: options.logLevel },
    genReqId: () => crypto.randomUUID(),
  });

  await app.register(sensible);
  await app.register(cors, { origin: options.webOrigin, methods: ["GET"] });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof NotFoundError) {
      return reply.code(404).send({ error: "Not Found", message: error.message });
    }
    if (error instanceof BadRequestError) {
      return reply.code(400).send({ error: "Bad Request", message: error.message });
    }
    request.log.error({ err: error }, "unhandled request error");
    return reply.code(500).send({ error: "Internal Server Error", requestId: request.id });
  });

  await app.register(healthRoutes);
  await app.register(franchiseRoutes);
  await app.register(characterRoutes);
  await app.register(validationRoutes);
  return app;
}
