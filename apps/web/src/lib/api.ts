import "server-only";
import {
  characterDetailSchema,
  eventStudiesResponseSchema,
  exitSimulationSchema,
  franchiseDetailSchema,
  screenerResponseSchema,
  signalRowsResponseSchema,
  validationResponseSchema,
  type ScreenerQuery,
  type SignalRowsQuery,
} from "@linchpin/shared";
import type { ZodType, ZodTypeDef } from "zod";
import { serverEnv } from "./env";

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 250;
const NOT_FOUND = 404;

export class ApiNotFoundError extends Error {
  constructor(path: string) {
    super(`API returned 404 for ${path}`);
    this.name = "ApiNotFoundError";
  }
}

/** GETs are idempotent, so transport failures and 5xx are retried with backoff. */
async function getJson<T>(path: string, schema: ZodType<T, ZodTypeDef, unknown>): Promise<T> {
  const url = new URL(path, serverEnv.API_URL);
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.status === NOT_FOUND) throw new ApiNotFoundError(path);
      if (response.status >= 500) throw new Error(`API ${response.status} for ${path}`);
      if (!response.ok) throw new Error(`API ${response.status} for ${path}: ${await response.text()}`);
      return schema.parse(await response.json());
    } catch (error) {
      if (error instanceof ApiNotFoundError) throw error;
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, BACKOFF_BASE_MS * 2 ** (attempt - 1)));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`API request failed for ${path}`);
}

function toQueryString(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function fetchScreener(query: Partial<ScreenerQuery>) {
  return getJson(`/franchises${toQueryString(query)}`, screenerResponseSchema);
}

export function fetchFranchise(id: string) {
  return getJson(`/franchises/${encodeURIComponent(id)}`, franchiseDetailSchema);
}

export function fetchSimulation(franchiseId: string, characterId: string) {
  return getJson(
    `/franchises/${encodeURIComponent(franchiseId)}/simulate/${encodeURIComponent(characterId)}`,
    exitSimulationSchema,
  );
}

export function fetchCharacter(id: string) {
  return getJson(`/characters/${encodeURIComponent(id)}`, characterDetailSchema);
}

export function fetchSignalRows(id: string, query: Partial<SignalRowsQuery>) {
  return getJson(
    `/characters/${encodeURIComponent(id)}/signals${toQueryString(query)}`,
    signalRowsResponseSchema,
  );
}

export function fetchValidation() {
  return getJson("/validation", validationResponseSchema);
}

export function fetchEventStudies() {
  return getJson("/validation/studies", eventStudiesResponseSchema);
}
