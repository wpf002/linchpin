import Link from "next/link";
import { MODEL_VERSION } from "@linchpin/shared";
import { fetchValidation } from "@/lib/api";
import { GateChip } from "./gate-chip";
import { NavLinks } from "./nav-links";

async function loadGate() {
  try {
    const report = await fetchValidation();
    return { gate: report.gate, rankIC: report.rankIC } as const;
  } catch (error) {
    console.error("header could not load the validation gate", error);
    return null;
  }
}

export async function AppHeader() {
  const gate = await loadGate();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-8 px-4 sm:px-8">
        <Link href="/" className="group flex items-baseline gap-2" aria-label="Linchpin Home">
          <PinMark />
          <span className="font-display text-lg leading-none tracking-tight text-ink">Linchpin</span>
        </Link>
        <NavLinks />
        <div className="ml-auto flex items-center gap-4">
          <span className="hidden font-mono text-xs text-faint sm:inline">{MODEL_VERSION}</span>
          <GateChip gate={gate?.gate ?? null} rankIC={gate?.rankIC ?? null} />
        </div>
      </div>
    </header>
  );
}

function PinMark() {
  return (
    <svg width="12" height="16" viewBox="0 0 12 16" aria-hidden="true" className="self-center">
      <rect x="4.5" y="0" width="3" height="16" rx="1.5" fill="var(--accent)" />
      <rect x="0" y="3" width="12" height="3" rx="1.5" fill="var(--text)" />
    </svg>
  );
}
