export default function Loading() {
  return (
    <div className="flex flex-col gap-8 pt-12" aria-busy="true" aria-label="Loading">
      <div className="h-12 w-72 animate-pulse bg-raised" />
      <div className="h-24 animate-pulse border-y border-line" />
      <div className="h-96 animate-pulse border-t-2 border-line-strong" />
    </div>
  );
}
