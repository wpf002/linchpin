import type { Metadata } from "next";
import Link from "next/link";
import type { ValidationResponse } from "@linchpin/shared";
import { clsx } from "clsx";
import { EventScatter } from "@/components/event-scatter";
import { IntervalChart, type IntervalRow } from "@/components/interval-chart";
import { PageTitle } from "@/components/page-title";
import { EmptyState, Panel } from "@/components/panel";
import { fetchEventStudies, fetchValidation } from "@/lib/api";
import {
  formatCount,
  formatDate,
  formatLogChange,
  formatNumber,
  formatPercent,
  formatSigned,
  label,
} from "@/lib/format";

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
      threshold: `> ${formatNumber(report.baselineRankIC, 3)}`,
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

export default async function ValidationPage() {
  const [report, studies] = await Promise.all([fetchValidation(), fetchEventStudies()]);
  const gateColor = GATE_TOKEN[report.gate];
  const minIC = report.killCriteria.minRankIC ?? 0;

  return (
    <>
      <PageTitle
        eyebrow={`Model ${report.modelVersion} · ${report.runAt ? formatDate(report.runAt) : "Never Run"}`}
        title="Validation"
        aside={
          <span
            className="inline-flex items-center gap-3 rounded-[var(--radius-ui)] border px-4 py-2 text-lg"
            style={{ borderColor: gateColor, color: gateColor }}
          >
            <span className="size-2.5 rounded-full" style={{ background: gateColor }} />
            {report.gate === "PASS" ? "Passed" : report.gate === "FAIL" ? "Failed" : "Blocked"}
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Pass Criteria" action={<span className="text-xs text-faint">Set Before the Run</span>}>
          <div className="-m-4 overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Test</th>
                  <th className="px-4 py-3 text-right font-medium">Needed</th>
                  <th className="px-4 py-3 text-right font-medium">Actual</th>
                  <th className="px-4 py-3 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {criteria(report).map((row) => (
                  <tr key={row.key} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-3 text-ink">{row.label}</td>
                    <td className="num px-4 py-3 text-right text-muted">{row.threshold}</td>
                    <td className="num px-4 py-3 text-right text-ink">{row.observed}</td>
                    <td
                      className={clsx("px-4 py-3 text-right text-xs font-medium uppercase tracking-wide", STATUS_CLASS[row.status])}
                      title={report.failures.find((failure) => failure.criterion === row.key)?.detail}
                    >
                      {row.status === "NOT RUN" ? "Not Run" : row.status === "PASS" ? "Pass" : "Fail"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel
          title="Rank Correlation"
          action={
            <span className="text-xs text-faint" title="How well the ranking before an exit matched the drop after it. Bars show the 95% range.">
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

      <div className="mt-6 flex flex-col gap-6">
        {report.strata.length > 0 ? (
          <Panel
            title="Exit Types"
            action={
              <span className="text-xs text-faint" title="Each exit type compared with unannounced exits. Differs means the averages are apart at 95%.">
                Against Unannounced
              </span>
            }
          >
            <div className="-m-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 text-right font-medium">Events</th>
                    <th className="px-4 py-3 text-right font-medium">Avg Change</th>
                    <th className="px-4 py-3 text-right font-medium">Std Error</th>
                    <th className="px-4 py-3 text-right font-medium">Correlation</th>
                    <th className="px-4 py-3 text-right font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {report.strata.map((row) => (
                    <tr key={row.name} className="border-b border-line last:border-b-0">
                      <td className="px-4 py-3 text-ink">{label(row.name)}</td>
                      <td className="num px-4 py-3 text-right text-muted">{formatCount(row.events)}</td>
                      <td className="num px-4 py-3 text-right text-ink">{formatLogChange(row.meanDid)}</td>
                      <td className="num px-4 py-3 text-right text-muted">{formatNumber(row.stdError, 3)}</td>
                      <td className="num px-4 py-3 text-right text-ink">{formatSigned(row.rankIC.coefficient, 3)}</td>
                      <td className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted">
                        {divergence(report, row.name)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ) : null}
        <Panel
          title="Exits Studied"
          action={
            <span className="flex items-center gap-4 text-xs text-faint">
              <span className="flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-accent" /> Unannounced
              </span>
              <span className="flex items-center gap-2">
                <span className="size-2.5 rounded-full border border-accent" /> Announced
              </span>
            </span>
          }
        >
          {studies.length === 0 ? <EmptyState title="No Exits Studied" /> : <EventScatter rows={studies} />}
        </Panel>
        {studies.length > 0 ? (
          <Panel title="Exit List" action={<span className="text-xs text-faint">{formatCount(studies.length)}</span>}>
            <div className="-m-4 max-h-[480px] overflow-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="sticky top-0 border-b border-line bg-surface text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Franchise</th>
                    <th className="px-4 py-3 font-medium">Character</th>
                    <th className="px-4 py-3 text-right font-medium">Share Before</th>
                    <th className="px-4 py-3 text-right font-medium">Billing Rank</th>
                    <th className="px-4 py-3 text-right font-medium">Change</th>
                    <th className="px-4 py-3 text-right font-medium">Std Error</th>
                  </tr>
                </thead>
                <tbody className="num">
                  {studies.map((row) => (
                    <tr key={row.exitEventId} className="border-b border-line last:border-b-0">
                      <td className="px-4 py-2 text-muted">{formatDate(row.eventDate)}</td>
                      <td className="px-4 py-2">
                        <Link href={`/franchises/${row.franchiseId}`} className="text-ink hover:text-accent-strong">
                          {row.franchiseName}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-muted">
                        {row.characterId ? (
                          <Link href={`/characters/${row.characterId}`} className="hover:text-ink">
                            {row.characterName}
                          </Link>
                        ) : (
                          "—"
                        )}
                        {row.announced ? <span className="ml-2 text-xs text-faint">Announced</span> : null}
                      </td>
                      <td className="px-4 py-2 text-right text-muted">{formatPercent(row.preCarryScore)}</td>
                      <td className="px-4 py-2 text-right text-muted">{row.baselineRank ?? "—"}</td>
                      <td className="px-4 py-2 text-right text-ink">{formatLogChange(row.didEstimate)}</td>
                      <td className="px-4 py-2 text-right text-faint">{formatNumber(row.stdError, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ) : null}
      </div>
    </>
  );
}
