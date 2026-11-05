import type { ZodType, ZodTypeDef } from "zod";
import { BadRequestError } from "./errors.js";

export function parseOrBadRequest<T>(schema: ZodType<T, ZodTypeDef, unknown>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
      .join("; ");
    throw new BadRequestError(detail);
  }
  return parsed.data;
}
