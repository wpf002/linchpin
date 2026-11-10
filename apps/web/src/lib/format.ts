/** What every formatter returns for a missing value. */
export const EM_DASH = "—";

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return EM_DASH;
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return EM_DASH;
  return value.toFixed(digits);
}

export function formatSigned(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return EM_DASH;
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}`;
}

/** A log-point DiD estimate read as a proportional change in attention. */
export function formatLogChange(value: number | null | undefined): string {
  if (value === null || value === undefined) return EM_DASH;
  return formatSigned((Math.exp(value) - 1) * 100, 1) + "%";
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return EM_DASH;
  return DATE_FORMAT.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
}

export function formatYear(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 4) : EM_DASH;
}

const LABELS: Record<string, string> = {
  TV: "TV",
  FILM: "Film",
  COMIC: "Comic",
  ANIMATION: "Animation",
  SPORTS: "Sports",
  ACTIVE: "Active",
  ENDED: "Ended",
  CANCELLED: "Cancelled",
  HIATUS: "Hiatus",
  ANNOUNCED: "Announced",
  WIKI: "Wikipedia",
  AO3: "AO3",
  TRENDS: "Google Trends",
  REDDIT: "Reddit",
  BLUESKY: "Bluesky",
  FANDOM: "Fandom",
};

export function label(code: string): string {
  return (
    LABELS[code] ??
    code
      .toLowerCase()
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  );
}
