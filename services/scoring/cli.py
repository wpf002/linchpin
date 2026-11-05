"""Command line entry point for the scoring service."""

from __future__ import annotations

import logging

import typer

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
    from ingest.pipeline import run_ingest

    _configure_logging(verbose)
    report = run_ingest(only=list(only) if only else None, skip_signals=skip_signals)
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
        f"window={result.window_start}..{result.window_end}"
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


def _ic(result: object) -> str:
    coefficient = getattr(result, "coefficient", None)
    if coefficient is None:
        return f"n/a ({getattr(result, 'reason', 'unavailable')})"
    lower = getattr(result, "lower", None)
    upper = getattr(result, "upper", None)
    pairs = getattr(result, "pairs", 0)
    bounds = f" [{lower:.3f}, {upper:.3f}]" if lower is not None and upper is not None else ""
    return f"{coefficient:.3f}{bounds} n={pairs}"


if __name__ == "__main__":
    app()
