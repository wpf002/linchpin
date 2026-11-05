import { prisma } from "@linchpin/db";
import { buildApp } from "./app.js";
import { loadEnv } from "./env.js";

const SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM"] as const;

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await buildApp({
    webOrigin: env.WEB_ORIGIN,
    logLevel: env.NODE_ENV === "production" ? "info" : "debug",
  });

  for (const signal of SHUTDOWN_SIGNALS) {
    process.once(signal, () => {
      app.log.info({ signal }, "shutting down");
      void app
        .close()
        .then(() => prisma.$disconnect())
        .then(() => process.exit(0));
    });
  }

  await app.listen({ port: env.API_PORT, host: env.API_HOST });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
