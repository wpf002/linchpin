import "server-only";
import {
  characterDetailSchema,
  eventStudiesResponseSchema,
  franchiseDetailSchema,
  leadersResponseSchema,
  screenerResponseSchema,
  searchResponseSchema,
  signalRowsResponseSchema,
  type FranchiseRow,
  type LeadersQuery,
  type ScreenerQuery,
  type SignalRowsQuery,
} from "@linchpin/shared";
import { z, type ZodType, type ZodTypeDef } from "zod";
import { serverEnv } from "./env";

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 250;
const NOT_FOUND = 404;
/** The API caps a screener page at this many rows. */
const SCREENER_PAGE_LIMIT = 200;
/** Stops a paging loop if the API ever returns a cursor that does not advance. */
const MAX_SCREENER_PAGES = 50;

export class ApiNotFoundError extends Error {
  constructor(path: string) {
    super(`API returned 404 for ${path}`);
    this.name = "ApiNotFoundError";
  }
}

/** A 4xx other than 404: the request itself is wrong, so retrying cannot help. */
export class ApiRequestError extends Error {
  constructor(path: string, status: number, body: string) {
    super(`API ${status} for ${path}: ${body}`);
    this.name = "ApiRequestError";
  }
}

const recordIdSchema = z.string().uuid();

/** Record ids are UUIDs. Anything else in a URL names no record, so it reads as a 404. */
function recordPath(collection: string, id: string, suffix = ""): string {
  const path = `/${collection}/${encodeURIComponent(id)}${suffix}`;
  if (!recordIdSchema.safeParse(id).success) throw new ApiNotFoundError(path);
  return path;
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
      if (!response.ok) throw new ApiRequestError(path, response.status, await response.text());
      return schema.parse(await response.json());
    } catch (error) {
      if (error instanceof ApiNotFoundError || error instanceof ApiRequestError) throw error;
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

/** Every franchise matching the filters, paged through the API's row cap. */
export async function fetchAllFranchises(
  query: Partial<Omit<ScreenerQuery, "limit" | "cursor">> = {},
): Promise<FranchiseRow[]> {
  const rows: FranchiseRow[] = [];
  let cursor: number | null = 0;
  for (let page = 0; cursor !== null && page < MAX_SCREENER_PAGES; page += 1) {
    const response = await fetchScreener({ ...query, limit: SCREENER_PAGE_LIMIT, cursor });
    rows.push(...response.rows);
    cursor = response.nextCursor;
  }
  return rows;
}

export function fetchSearch(q: string) {
  return getJson(`/search${toQueryString({ q })}`, searchResponseSchema);
}

export function fetchLeaders(query: Partial<LeadersQuery>) {
  return getJson(`/characters${toQueryString(query)}`, leadersResponseSchema);
}

export async function fetchFranchise(id: string) {
  return getJson(recordPath("franchises", id), franchiseDetailSchema);
}

export async function fetchCharacter(id: string) {
  return getJson(recordPath("characters", id), characterDetailSchema);
}

export async function fetchSignalRows(id: string, query: Partial<SignalRowsQuery>) {
  return getJson(
    recordPath("characters", id, `/signals${toQueryString(query)}`),
    signalRowsResponseSchema,
  );
}

export function fetchEventStudies() {
  return getJson("/validation/studies", eventStudiesResponseSchema);
}
