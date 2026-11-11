"""Command line entry point for the scoring service."""

from __future__ import annotations

import json
import logging
from dataclasses import asdict
from pathlib import Path

import typer

from config import REPO_ROOT

LANGUAGE_REPORT = REPO_ROOT / "docs" / "results" / "language_test.json"

app = typer.Typer(add_completion=False, help="Linchpin scoring service")


def _configure_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    for noisy in ("httpx", "httpcore", "urllib3"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


@app.command()
def ingest(
    only: list[str] = typer.Option(None, "--only", help="Limit to these franchise names."),
    skip_signals: bool = typer.Option(False, help="Build rosters without fetching pageviews."),
    verbose: bool = typer.Option(False, "--verbose", "-v"),
) -> None:
    """Pull rosters, release calendars and attention signals into the database."""
    from ingest.images import run_image_pass
    from ingest.pipeline import run_ingest

    _configure_logging(verbose)
    names = list(only) if only else None
    report = run_ingest(only=names, skip_signals=skip_signals)
    run_image_pass(only=names)
    resolved = sum(f.resolved for f in report.franchises)
    roster = sum(f.roster_size for f in report.franchises)
    typer.echo(
        f"franchises={len(report.franchises)} roster={resolved}/{roster} "
        f"signals={report.signal_rows} exits={report.exit_events_written} "
        f"unmatched={len(report.exit_events_unmatched)}"
    )
    for line in report.exit_events_unmatched:
        typer.echo(f"  unmatched exit: {line}")


@app.command()
def score(verbose: bool = typer.Option(False, "--verbose", "-v")) -> None:
    """Recompute carry scores and franchise fragility from stored signals."""
    from metrics.scoring import run_scoring

    _configure_logging(verbose)
    result = run_scoring()
    typer.echo(
        f"characters={result.characters_scored} franchises={result.franchises_scored} "
        f"creators={result.creators_scored} window={result.window_start}..{result.window_end}"
    )


@app.command("ingest-search")
def ingest_search(verbose: bool = typer.Option(False, "--verbose", "-v")) -> None:
    """Fetch Google Trends interest for each exit event's pre-window."""
    from ingest.search_signals import run_search_ingest

    _configure_logging(verbose)
    report = run_search_ingest()
    typer.echo(
        f"windows={report.windows} stored={report.stored} "
        f"incomplete={len(report.incomplete)} rows={report.rows_written}"
    )
    for label in report.incomplete:
        typer.echo(f"  incomplete {label}")
    if report.stopped:
        typer.echo(f"  stopped {report.stopped}")


@app.command("language-test")
def language_test(
    out: Path = typer.Option(LANGUAGE_REPORT, help="Where to write the JSON report."),
    verbose: bool = typer.Option(False, "--verbose", "-v"),
) -> None:
    """Compare English-only shares with shares summed across language editions."""
    from validation.language import run_language_test

    _configure_logging(verbose)
    result = run_language_test()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(asdict(result), indent=2, default=str) + "\n", "utf-8")
    median = result.median_rank_agreement
    typer.echo(
        f"decision={result.decision} franchises={len(result.franchises)} "
        f"median_rank_agreement={'n/a' if median is None else format(median, '.3f')} "
        f"top_character_changes={result.top_character_changes} floor={result.floor}"
    )


@app.command()
def validate(verbose: bool = typer.Option(False, "--verbose", "-v")) -> None:
    """Run the event study and evaluate the kill criteria."""
    from validation.gate import run_validation

    _configure_logging(verbose)
    run = run_validation()
    typer.echo(f"gate={run.gate}")
    typer.echo(
        f"events={run.event_count} verified={run.verified_event_count}"
        f" studied={run.studied_event_count}"
    )
    typer.echo(f"carry   rankIC={_ic(run.rank_ic)}")
    typer.echo(f"billing rankIC={_ic(run.baseline_rank_ic)}")
    if run.median_roster_complete is not None:
        typer.echo(f"median rosterComplete={run.median_roster_complete:.3f}")
    for stratum in run.strata:
        mean = "n/a" if stratum.mean_did is None else f"{stratum.mean_did:.3f}"
        typer.echo(
            f"  stratum {stratum.name}: events={stratum.events} meanDiD={mean}"
            f" rankIC={_ic(stratum.rank_ic)}"
        )
    for comparison in run.comparisons:
        z_score = "n/a" if comparison.z_score is None else f"{comparison.z_score:.2f}"
        typer.echo(
            f"  {comparison.stratum} vs {comparison.against}: z={z_score}"
            f" diverges={comparison.diverges}"
        )
    if run.blend is not None:
        typer.echo(
            f"blend verdict={run.blend.verdict} wikiWeight={run.blend.wiki_weight}"
            f" train={run.blend.train_pairs} heldOut={run.blend.held_out_pairs}"
            f" ({run.blend.reason})"
        )
    for failure in run.failures:
        typer.echo(f"  FAIL {failure.criterion}: {failure.detail}")


@app.command("stage-exits")
def stage_exits(
    write: bool = typer.Option(False, "--write", help="Append staged events to the corpus."),
    verbose: bool = typer.Option(False, "--verbose", "-v"),
) -> None:
    """Date and source candidate exits; staged events are written unverified."""
    from ingest.stage_exits import append_staged, existing_keys, load_candidates, stage

    _configure_logging(verbose)
    staged, rejected = stage(load_candidates(), existing=existing_keys())
    for item in staged:
        typer.echo(
            f"  ok   {item.candidate.franchise} | {item.candidate.character} | {item.event_date}"
        )
    for item in rejected:
        typer.echo(f"  drop {item.candidate.franchise} | {item.candidate.character}: {item.reason}")
    typer.echo(f"staged={len(staged)} rejected={len(rejected)}")
    if write:
        typer.echo(f"appended={append_staged(staged)} (verified=false)")


@app.command("ingest-bluesky")
def ingest_bluesky(
    only: list[str] = typer.Option(None, "--only", help="Franchise names to limit the pass to."),
    days: int = typer.Option(30, min=1, help="Trailing full days to fill per character."),
    verbose: bool = typer.Option(False, "--verbose", "-v"),
) -> None:
    """Count daily Bluesky posts naming each character and its franchise. Counting only."""
    from ingest.discourse import run_discourse_ingest

    _configure_logging(verbose)
    report = run_discourse_ingest(only=only or None, days=days)
    typer.echo(
        f"franchises={report.franchises} characters={report.characters} "
        f"rows={report.rows_written} skipped={len(report.skipped)}"
    )
    for label in report.skipped:
        typer.echo(f"  skipped {label}")
    if report.stopped:
        typer.echo(f"  stopped {report.stopped}")


@app.command("ingest-images")
def ingest_images(
    only: list[str] = typer.Option(None, "--only", help="Franchise names to limit the pass to."),
    verbose: bool = typer.Option(False, "--verbose", "-v"),
) -> None:
    """Store poster and portrait URLs from the roster catalogue."""
    from ingest.images import run_image_pass

    _configure_logging(verbose)
    report = run_image_pass(only=only or None)
    typer.echo(
        f"franchises={report.franchises} characters={report.characters} people={report.people}"
    )


@app.command("audit-titles")
def audit_titles(
    write: bool = typer.Option(False, "--write", help="Clear rejected links and their signals."),
    verbose: bool = typer.Option(False, "--verbose", "-v"),
) -> None:
    """Re-check stored Wikipedia links against the resolver's current rules."""
    from ingest.title_audit import run_title_audit

    _configure_logging(verbose)
    report = run_title_audit(write=write)
    for item in report.rejected:
        claim = item.link.claim
        typer.echo(
            f"  drop {claim.franchise_name} | {claim.character_name} -> {claim.title}: "
            f"{item.reason}"
        )
    typer.echo(
        f"checked={report.checked} unchecked={report.unchecked} rejected={len(report.rejected)} "
        f"franchises={len(report.franchises)}"
    )
    if write:
        typer.echo(
            f"cleared={len(report.rejected)} signal_rows_removed={report.signal_rows_removed}"
        )
        for name in report.franchises:
            typer.echo(f"  reingest: {name}")


def _ic(result: object) -> str:
    coefficient = getattr(result, "coefficient", None)
    if coefficient is None:
        return f"n/a ({getattr(result, 'reason', 'unavailable')})"
    lower = getattr(result, "lower", None)
    upper = getattr(result, "upper", None)
    pairs = getattr(result, "pairs", 0)
    bounds = f" [{lower:.3f}, {upper:.3f}]" if lower is not None and upper is not None else ""
    return f"{coefficient:.3f}{bounds} n={pairs}"


@app.command("audit-basis")
def audit_basis(verbose: bool = typer.Option(False, "--verbose", "-v")) -> None:
    """Mark each stored Wikipedia title as an article or a redirect."""
    from db import connection
    from ingest.wiki_basis import open_client, refresh_wiki_basis

    _configure_logging(verbose)
    client = open_client()
    try:
        with connection() as conn:
            report = refresh_wiki_basis(conn, client)
    finally:
        client.close()
    typer.echo(f"article={report.article} redirect={report.redirect} unchecked={report.unchecked}")


@app.command("verify-queue")
def verify_queue() -> None:
    """List unverified exits the gate could test, with source and evidence, oldest first."""
    from db import connection
    from ingest.corpus import load_exit_events
    from validation.verify_queue import build_queue, load_testable_keys

    with connection() as conn:
        queue = build_queue(load_exit_events(), load_testable_keys(conn))
    for item in queue:
        typer.echo(
            f"{item.event_date}\t{item.franchise}\t{item.character}\t{item.exit_type}"
            f"\t{item.source_url}\t{item.evidence or ''}"
        )
    typer.echo(f"queue={len(queue)}")


if __name__ == "__main__":
    app()
