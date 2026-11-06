import Link from "next/link";
import type { ValidationReport } from "@linchpin/shared";

const GATE_STYLE: Record<ValidationReport["gate"], { label: string; color: string }> = {
  PASS: { label: "Validated", color: "var(--pass)" },
  FAIL: { label: "Failed Validation", color: "var(--fail)" },
  BLOCKED: { label: "Not Tested", color: "var(--blocked)" },
};

export function GateChip({ gate }: { gate: ValidationReport["gate"] | null }) {
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
      title="Accuracy test result. Scores are unproven until it passes."
      className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-line px-3 py-1 text-xs text-ink transition-colors duration-150 hover:border-line-strong hover:bg-hover"
    >
      <Dot color={style.color} />
      {style.label}
    </Link>
  );
}

function Dot({ color }: { color: string }) {
  return <span aria-hidden="true" className="size-2 rounded-full" style={{ background: color }} />;
}
