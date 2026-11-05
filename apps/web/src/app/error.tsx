"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <h1 className="font-display text-display text-ink">API Unavailable</h1>
      <p className="text-sm text-muted">{error.digest ? `Reference ${error.digest}` : "The scoring API did not respond."}</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-[var(--radius-ui)] bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent-strong"
      >
        Retry
      </button>
    </div>
  );
}
