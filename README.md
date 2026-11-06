# Linchpin

Character-level attention concentration and franchise fragility scoring, built only on public signals. It answers one question: what happens to this franchise if the lead leaves?

**Status:** Phase 2 gate is **FAIL** under `v0.1.0` and under the `v0.2.0` re-run. See [docs/PHASE2_RESULT.md](docs/PHASE2_RESULT.md) and [docs/PHASE3_RESULT.md](docs/PHASE3_RESULT.md). Scores in the UI are exploratory until the gate passes.

## Layout

| Path | What |
| --- | --- |
| `apps/web` | Next.js 15 UI: screener, franchise workbench, character audit, validation |
| `apps/api` | Fastify API over Postgres (port 4000) |
| `packages/db` | Prisma schema and migrations |
| `packages/shared` | Zod schemas and metric constants shared by API and web |
| `services/scoring` | Python ingest, carry scoring, event-study validation |
| `data/corpus` | Franchise list and hand-verified exit events |
| `data/cache` | HTTP response cache (gitignored) |

## Setup

Requires Node 22, pnpm 10, Python 3.12, Postgres 16.

```bash
cp .env.example .env
createdb linchpin
pnpm install
pnpm db:deploy
pnpm db:generate
cd services/scoring && python3.12 -m venv .venv && .venv/bin/pip install -e '.[dev]'
```

Set `WIKIMEDIA_USER_AGENT` to a real contact address before ingesting. Wikimedia blocks anonymous clients.

## Pipeline

Run from `services/scoring`:

```bash
.venv/bin/python cli.py ingest        # rosters, releases, pageviews, exit events
.venv/bin/python cli.py ingest-search # Google Trends interest for each exit event's pre-window
.venv/bin/python cli.py score         # carry, fragility, substitutability and creator scores, keyed by MODEL_VERSION
.venv/bin/python cli.py validate      # event study, strata, blend test and kill criteria
.venv/bin/python cli.py language-test # English-only vs summed Wikipedia editions; writes docs/results/language_test.json
.venv/bin/python cli.py stage-exits   # date and source data/corpus/exit_candidates.json; --write appends them unverified
```

`ingest-search` stops at the first window Google Trends refuses. Fetched batches are cached, so the next run resumes there.

Ingest is cached under `data/cache`. A cold run takes roughly an hour because every source is throttled. Raw signal rows are append-only; scoring never rewrites them.

## Run The App

```bash
pnpm --filter @linchpin/api dev
API_URL=http://localhost:4000 pnpm --filter @linchpin/web dev
```

Web runs on port 3000. Pass `--port` to `next dev` if it's taken.

## Vantage Dataset

`GET /vantage/sector` returns the scored universe as one read-only document: sector `entertainment_franchises`, the model version, the Phase 2 gate, and franchise, character and creator rows. Concentration figures below the roster floor are null, the same as in the UI. The response shape is `vantageSectorSchema` in `packages/shared/src/contracts.ts`.

Vantage's `Sector` enum has no entertainment value. Consuming this needs an adapter on the Vantage side that maps each franchise to a `Company` row. Nothing in the Vantage repo was changed.

## Checks

```bash
pnpm typecheck && pnpm test && pnpm --filter @linchpin/web build
cd services/scoring && .venv/bin/ruff check . && .venv/bin/ruff format --check . && .venv/bin/pytest
```

## Rules

- Never tune weights after seeing validation results. Bump `MODEL_VERSION` in `services/scoring/metrics/constants.py` and `packages/shared` and re-run.
- No score is shown without its confidence flag. Franchises below `rosterComplete` 0.70 have null fragility and are suppressed in the UI.
- Every number in the UI links to the signal rows behind it.
- Out of scope: first-party streamer telemetry, revenue forecasting, recommendations, sentiment analysis.

Sources and their terms: [docs/SOURCES.md](docs/SOURCES.md). Decisions on the roadmap's open questions: [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md).
