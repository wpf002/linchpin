import { notFound } from "next/navigation";
import { ApiNotFoundError } from "./api";

/** Turns an API 404 into the route's not-found page; every other failure reaches error.tsx. */
export async function orNotFound<T>(request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (error) {
    if (error instanceof ApiNotFoundError) notFound();
    throw error;
  }
}
