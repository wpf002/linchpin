export default function Loading() {
  return (
    <div className="flex flex-col gap-6 pt-12" aria-busy="true" aria-label="Loading">
      <div className="h-10 w-72 animate-pulse rounded-sm bg-raised" />
      <div className="h-32 animate-pulse rounded-[var(--radius-ui)] bg-surface" />
      <div className="h-96 animate-pulse rounded-[var(--radius-ui)] bg-surface" />
    </div>
  );
}
