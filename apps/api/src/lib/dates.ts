/** Prisma returns Date for @db.Date columns. The API speaks ISO dates only. */
export function toIsoDate(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

export function toIsoDateTime(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString();
}
