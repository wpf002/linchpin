import Link from "next/link";
import type { ValidationReport } from "@linchpin/shared";
import { formatNumber } from "@/lib/format";

const GATE_STYLE: Record<ValidationReport["gate"], { label: string; color: string }> = {
  PASS: { label: "Gate Passed", color: "var(--pass)" },
  FAIL: { label: "Gate Failed", color: "var(--fail)" },
  BLOCKED: { label: "Gate Blocked", color: "var(--blocked)" },
};

export function GateChip({
  gate,
  rankIC,
}: {
  gate: ValidationReport["gate"] | null;
  rankIC: number | null;
}) {
  if (gate === null) {
    return (
      <span className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-line px-3 py-1 text-xs text-muted">
        <Dot color="var(--fail)" />
        API Offline
      </span>
    );
  }
  const style = GATE_STYLE[gate];
  return (
    <Link
      href="/validation"
      title="Phase 2 kill-criteria result. Scores are unvalidated until the gate passes."
      className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-line px-3 py-1 text-xs text-ink transition-colors duration-150 hover:border-line-strong hover:bg-hover"
    >
      <Dot color={style.color} />
      {style.label}
      {rankIC !== null ? <span className="num hidden text-muted sm:inline">IC {formatNumber(rankIC, 2)}</span> : null}
    </Link>
  );
}

function Dot({ color }: { color: string }) {
  return <span aria-hidden="true" className="size-2 rounded-full" style={{ background: color }} />;
}
