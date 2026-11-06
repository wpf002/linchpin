import Link from "next/link";
import type { ValidationReport } from "@linchpin/shared";

/** wideSuffix is dropped on narrow screens so the search box keeps a usable width. */
const GATE_STYLE: Record<ValidationReport["gate"], { label: string; wideSuffix?: string; color: string }> = {
  PASS: { label: "Validated", color: "var(--pass)" },
  FAIL: { label: "Failed", wideSuffix: " Validation", color: "var(--fail)" },
  BLOCKED: { label: "Not Tested", color: "var(--blocked)" },
};

export function GateChip({ gate }: { gate: ValidationReport["gate"] | null }) {
  if (gate === null) {
    return (
      <span className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm text-muted">
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
      className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm text-ink transition-colors duration-150 hover:text-accent-strong"
    >
      <Dot color={style.color} />
      <span>
        {style.label}
        {style.wideSuffix ? <span className="hidden sm:inline">{style.wideSuffix}</span> : null}
      </span>
    </Link>
  );
}

function Dot({ color }: { color: string }) {
  return <span aria-hidden="true" className="size-2 rounded-full" style={{ background: color }} />;
}
