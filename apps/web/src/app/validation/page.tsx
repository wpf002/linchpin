import type { Metadata } from "next";
import Link from "next/link";
import type { EventStudyRow, ValidationResponse } from "@linchpin/shared";
import { clsx } from "clsx";
import { EventScatter } from "@/components/event-scatter";
import { Face } from "@/components/face";
import { IntervalChart, type IntervalRow } from "@/components/interval-chart";
import { Numbers } from "@/components/numbers";
import { PageTitle } from "@/components/page-title";
import { EmptyState, Panel } from "@/components/panel";
import { fetchEventStudies, fetchValidation } from "@/lib/api";
import {
  EM_DASH,
  formatCount,
  formatDate,
  formatLogChange,
  formatNumber,
  formatPercent,
  formatSigned,
  label,
} from "@/lib/format";
import { changeInWords } from "@/lib/words";

export const metadata: Metadata = { title: "Validation" };

type CriterionStatus = "PASS" | "FAIL" | "NOT RUN";

interface CriterionRow {
  key: string;
  label: string;
  threshold: string;
  observed: string;
  status: CriterionStatus;
}

const GATE_TOKEN = { PASS: "var(--pass)", FAIL: "var(--fail)", BLOCKED: "var(--blocked)" } as const;

function statusOf(report: ValidationResponse, key: string, met: boolean | null): CriterionStatus {
  if (report.failures.some((failure) => failure.criterion === key)) return "FAIL";
  if (met === null) return "NOT RUN";
  return met ? "PASS" : "FAIL";
}

function criteria(report: ValidationResponse): CriterionRow[] {
  const thresholds = report.killCriteria;
  const minExits = thresholds.minExitEvents ?? 0;
  const minCoverage = thresholds.minRosterCompleteness ?? 0;
  const minIC = thresholds.minRankIC ?? 0;
  const hasIC = report.rankIC !== null;
  return [
    {
      key: "minExitEvents",
      label: "Verified Exits",
      threshold: `≥ ${formatCount(minExits)}`,
      observed: formatCount(report.verifiedEventCount),
      status: statusOf(report, "minExitEvents", report.runAt ? report.verifiedEventCount >= minExits : null),
    },
    {
      key: "minRosterCompleteness",
      label: "Median Cast Coverage",
      threshold: `≥ ${formatPercent(minCoverage, 0)}`,
      observed: formatPercent(report.medianRosterComplete),
      status: statusOf(
        report,
        "minRosterCompleteness",
        report.medianRosterComplete === null ? null : report.medianRosterComplete >= minCoverage,
      ),
    },
    {
      key: "minRankIC",
      label: "Rank Correlation",
      threshold: `≥ ${formatNumber(minIC, 2)}`,
      observed: formatNumber(report.rankIC, 3),
      status: statusOf(report, "minRankIC", hasIC ? (report.rankIC ?? 0) >= minIC : null),
    },
    {
      key: "rankICInterval",
      label: "Range Above Zero",
      threshold: "Low End > 0",
      observed: formatNumber(report.rankICLower, 3),
      status: statusOf(report, "rankICInterval", report.rankICLower === null ? null : report.rankICLower > 0),
    },
    {
      key: "beatsBaseline",
      label: "Beats Billing Order",
      threshold: report.baselineRankIC === null ? "> Billing Order" : `> ${formatNumber(report.baselineRankIC, 3)}`,
      observed: formatNumber(report.rankIC, 3),
      status: statusOf(
        report,
        "beatsBaseline",
        report.rankIC === null || report.baselineRankIC === null ? null : report.rankIC > report.baselineRankIC,
      ),
    },
  ];
}

const BLEND_LABEL = { BLEND: "Blend Wins", WIKI_ONLY: "Wikipedia Only", INCONCLUSIVE: "Blend Not Tested" } as const;

/** Held-out rows for the blend test. Empty until a run fits a weight. */
function blendRows(report: ValidationResponse): IntervalRow[] {
  const blend = report.blend;
  if (!blend || blend.blendRankIC === null || blend.wikiRankIC === null) return [];
  return [
    {
      label: "Blend, Test Set",
      point: blend.blendRankIC.coefficient,
      lower: blend.blendRankIC.lower,
      upper: blend.blendRankIC.upper,
      emphasis: false,
    },
    {
      label: "Wikipedia, Test Set",
      point: blend.wikiRankIC.coefficient,
      lower: blend.wikiRankIC.lower,
      upper: blend.wikiRankIC.upper,
      emphasis: false,
    },
  ];
}

function divergence(report: ValidationResponse, stratum: string): string {
  const comparison = report.comparisons.find((row) => row.stratum === stratum);
  if (!comparison) return "Baseline";
  if (comparison.diverges === null) return "Too Few Exits";
  return comparison.diverges ? "Differs" : "Same";
}

const STATUS_CLASS: Record<CriterionStatus, string> = {
  PASS: "text-pass",
  FAIL: "text-fail",
  "NOT RUN": "text-blocked",
};

const STATUS_LABEL: Record<CriterionStatus, string> = { PASS: "Pass", FAIL: "Fail", "NOT RUN": "Not Run" };
const GATE_LABEL = { PASS: "Passed", FAIL: "Failed", BLOCKED: "Blocked" } as const;

/** Verified exits against the count a run needs, as a bar. The run is blocked until the bar is full. */
function ExitProgress({ verified, needed }: { verified: number; needed: number }) {
  const filled = needed > 0 ? Math.min(1, verified / needed) : 1;
  return (
    <div className="flex w-full flex-col gap-2 sm:w-64">
      <span className="text-sm text-muted">
        <span className="num text-ink">{formatCount(verified)}</span> of {formatCount(needed)} Exits Verified
      </span>
      <span className="relative block h-2 bg-raised" aria-hidden="true">
        <span className="absolute inset-y-0 left-0 bg-ink" style={{ width: `${filled * 100}%` }} />
      </span>
    </div>
  );
}

function CriterionItem({ row, failureDetail }: { row: CriterionRow; failureDetail: string | undefined }) {
  return (
    <li className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-b-0">
      <span className="flex min-w-0 flex-col">
        <span className="text-ink">{row.label}</span>
        <span className="num text-sm text-muted">
          {row.observed === EM_DASH ? null : `${row.observed} · `}Needs {row.threshold}
        </span>
      </span>
      <span className={clsx("shrink-0 text-sm font-medium", STATUS_CLASS[row.status])} title={failureDetail}>
        {STATUS_LABEL[row.status]}
      </span>
    </li>
  );
}

function studyHint(row: EventStudyRow): string {
  const parts = [
    row.preCarryScore === null ? null : `Share Before ${formatPercent(row.preCarryScore)}`,
    row.baselineRank === null ? null : `Billed ${row.baselineRank}`,
    `Std Error ${formatNumber(row.stdError, 3)}`,
  ];
  return parts.filter((part) => part !== null).join(" · ");
}

function StudyItem({ row }: { row: EventStudyRow }) {
  const franchiseLink = (
    <Link href={`/franchises/${row.franchiseId}`} className="hover:text-ink">
      {row.franchiseName}
    </Link>
  );
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line py-3 last:border-b-0">
      <Face name={row.characterName ?? row.franchiseName} imageUrl={row.imageUrl} className="w-10" />
      <div className="flex min-w-0 flex-1 basis-40 flex-col">
        <span className="flex flex-wrap items-baseline gap-x-2 font-medium text-ink">
          {row.characterId && row.characterName ? (
            <Link href={`/characters/${row.characterId}`} className="hover:text-accent-strong">
              {row.characterName}
            </Link>
          ) : (
            franchiseLink
          )}
          {row.announced ? <span className="text-xs font-normal text-faint">Announced</span> : null}
        </span>
        <span className="text-sm text-muted">
          {row.characterName ? <>{franchiseLink} · </> : null}
          {formatDate(row.eventDate)}
        </span>
      </div>
      <span className="text-sm text-ink" title={studyHint(row)}>
        Attention {changeInWords(row.didEstimate)}
      </span>
    </li>
  );
}

export default async function ValidationPage() {
  const [report, studies] = await Promise.all([fetchValidation(), fetchEventStudies()]);
  const minIC = report.killCriteria.minRankIC ?? 0;

  return (
    <>
      <PageTitle
        eyebrow={`Model ${report.modelVersion} · ${report.runAt ? formatDate(report.runAt) : "Never Run"}`}
        title="Validation"
        aside={
          <div className="flex w-full flex-col gap-4 sm:w-auto sm:items-end">
            <span className="font-display text-display leading-none" style={{ color: GATE_TOKEN[report.gate] }}>
              {GATE_LABEL[report.gate]}
            </span>
            <ExitProgress verified={report.verifiedEventCount} needed={report.killCriteria.minExitEvents ?? 0} />
          </div>
        }
      />

      <div className="grid gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Pass Criteria" action={<span className="text-sm text-muted">Set Before the Run</span>}>
          <ul>
            {criteria(report).map((row) => (
              <CriterionItem
                key={row.key}
                row={row}
                failureDetail={report.failures.find((failure) => failure.criterion === row.key)?.detail}
              />
            ))}
          </ul>
        </Panel>
        <Panel
          title="Rank Correlation"
          hint="How well the ranking before an exit matched the drop after it. Bars show the 95% range."
          action={
            <span className="text-sm text-muted">
              {formatCount(report.verifiedEventCount)} Exits
              {report.blend ? ` · ${BLEND_LABEL[report.blend.verdict]}` : ""}
            </span>
          }
        >
          <IntervalChart
            threshold={minIC}
            rows={[
              {
                label: "Attention Share",
                point: report.rankIC,
                lower: report.rankICLower,
                upper: report.rankICUpper,
                emphasis: true,
              },
              {
                label: "Billing Order",
                point: report.baselineRankIC,
                lower: report.baselineLower,
                upper: report.baselineUpper,
                emphasis: false,
              },
              ...blendRows(report),
            ]}
          />
        </Panel>
      </div>

      <div className="mt-16 flex flex-col gap-16">
        <Panel
          title="Exits Studied"
          action={
            <span className="flex items-center gap-4 text-sm text-muted">
              <span className="flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-ink" /> Unannounced
              </span>
              <span className="flex items-center gap-2">
                <span className="size-2.5 rounded-full border border-ink" /> Announced
              </span>
            </span>
          }
        >
          {studies.length === 0 ? <EmptyState title="No Exits Studied" /> : <EventScatter rows={studies} />}
        </Panel>
        {studies.length > 0 ? (
          <Panel title="Exit List" action={<span className="num text-sm text-muted">{formatCount(studies.length)}</span>}>
            <ul className="max-h-[480px] overflow-y-auto">
              {studies.map((row) => (
                <StudyItem key={row.exitEventId} row={row} />
              ))}
            </ul>
          </Panel>
        ) : null}
        {report.strata.length > 0 ? (
          <Numbers>
            <ExitTypes report={report} />
          </Numbers>
        ) : null}
      </div>
    </>
  );
}

/** Each exit type against unannounced exits. Differs means the averages are apart at 95%. */
function ExitTypes({ report }: { report: ValidationResponse }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b border-ink text-left text-sm text-muted">
          <tr>
            <th className="px-3 py-3 font-medium">Exit Type</th>
            <th className="px-3 py-3 text-right font-medium">Events</th>
            <th className="px-3 py-3 text-right font-medium">Avg Change</th>
            <th className="px-3 py-3 text-right font-medium">Std Error</th>
            <th className="px-3 py-3 text-right font-medium">Correlation</th>
            <th
              className="px-3 py-3 text-right font-medium"
              title="Compared with unannounced exits. Differs means the averages are apart at 95%."
            >
              Against Unannounced
            </th>
          </tr>
        </thead>
        <tbody>
          {report.strata.map((row) => (
            <tr key={row.name} className="border-b border-line last:border-b-0">
              <td className="px-3 py-3 text-ink">{label(row.name)}</td>
              <td className="num px-3 py-3 text-right text-muted">{formatCount(row.events)}</td>
              <td className="num px-3 py-3 text-right text-ink">{formatLogChange(row.meanDid)}</td>
              <td className="num px-3 py-3 text-right text-muted">{formatNumber(row.stdError, 3)}</td>
              <td className="num px-3 py-3 text-right text-ink">{formatSigned(row.rankIC.coefficient, 3)}</td>
              <td className="px-3 py-3 text-right text-sm font-medium text-muted">{divergence(report, row.name)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
