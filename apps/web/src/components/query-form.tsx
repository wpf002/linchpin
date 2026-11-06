const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 80;

/** Plain GET search form. Hidden inputs carry the sort so a search does not reset it. */
export function QueryForm({
  placeholder,
  value,
  preserved,
}: {
  placeholder: string;
  value: string | undefined;
  preserved: Record<string, string>;
}) {
  return (
    <form method="get" role="search" className="flex gap-2">
      {Object.entries(preserved).map(([name, preservedValue]) => (
        <input key={name} type="hidden" name={name} value={preservedValue} />
      ))}
      <input
        type="search"
        name="q"
        defaultValue={value}
        placeholder={placeholder}
        aria-label={placeholder}
        minLength={MIN_QUERY_LENGTH}
        maxLength={MAX_QUERY_LENGTH}
        className="h-9 w-56 rounded-[var(--radius-ui)] border border-line bg-surface px-3 text-sm text-ink transition-colors duration-150 placeholder:text-faint hover:border-line-strong"
      />
      <button
        type="submit"
        className="h-9 rounded-[var(--radius-ui)] border border-line px-3 text-sm text-muted transition-colors duration-150 hover:border-line-strong hover:text-ink active:bg-hover"
      >
        Search
      </button>
    </form>
  );
}
