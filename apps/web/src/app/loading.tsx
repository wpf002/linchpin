export default function Loading() {
  return (
    <div className="flex flex-col gap-12 pt-12" aria-busy="true" aria-label="Loading">
      <div className="h-12 w-72 max-w-full animate-pulse bg-raised" />
      <div className="h-96 animate-pulse border-t-2 border-line-strong" />
    </div>
  );
}
