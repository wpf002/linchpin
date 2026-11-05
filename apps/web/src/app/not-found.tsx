import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <h1 className="font-display text-display text-ink">Not Found</h1>
      <Link href="/" className="text-sm text-accent hover:text-accent-strong">
        Back to Screener
      </Link>
    </div>
  );
}
