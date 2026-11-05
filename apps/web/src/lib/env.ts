import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  API_URL: z.string().url().default("http://localhost:4000"),
});

const parsed = serverEnvSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid web environment: ${parsed.error.message}`);
}

export const serverEnv = parsed.data;
