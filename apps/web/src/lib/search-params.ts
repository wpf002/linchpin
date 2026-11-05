/** Next hands search params as string | string[]; keep the first value of each. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

export function flattenSearchParams(raw: RawSearchParams): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined && first !== "") flat[key] = first;
  }
  return flat;
}
