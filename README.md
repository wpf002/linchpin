# Linchpin

Character-level attention concentration and franchise fragility scoring, built only on public signals. It answers one question: what happens to this franchise if the lead leaves?

**Status:** Killed on 2026-11-11. The gate failed under `v0.1.0`, `v0.2.0` and `v0.4.0`, and every computable rank IC was negative. See [docs/PHASE4_RESULT.md](docs/PHASE4_RESULT.md). Scores in the UI are exploratory.

`MODEL_VERSION` is `v0.4.0`. It scores only characters whose wikiTitle is an article ([docs/SOURCES.md](docs/SOURCES.md)).

## Layout

| Path | What |
| --- | --- |
| `apps/web` | Next.js 15 UI: poster wall and table of franchises, cast page with write-out simulation, character and creator pages, signal audit, validation, global search, CSV export |
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
.venv/bin/python cli.py ingest-bluesky # daily Bluesky post counts per character (--days 30 default); no key needed
.venv/bin/python cli.py audit-basis   # mark each stored wikiTitle ARTICLE or REDIRECT; score reads ARTICLE only
.venv/bin/python cli.py verify-queue  # unverified exits the gate could test, with source URL and evidence
.venv/bin/python cli.py verify        # step through that queue: opens each page, answer y/n/q
.venv/bin/python cli.py score         # carry, fragility, substitutability and creator scores, keyed by MODEL_VERSION
.venv/bin/python cli.py validate      # event study, strata, blend test and kill criteria
.venv/bin/python cli.py language-test # English-only vs summed Wikipedia editions; writes docs/results/language_test.json
.venv/bin/python cli.py stage-exits   # date and source data/corpus/exit_candidates.json; --write appends them unverified
.venv/bin/python cli.py audit-titles  # re-check every stored Wikipedia link; --write clears the ones that fail
.venv/bin/python cli.py ingest-images # poster and portrait URLs from TVmaze; ingest already runs this, use it to refresh
```

`ingest --only "Name"` (repeatable) limits a run to named franchises. `--skip-signals` resolves rosters without fetching pageviews.

`ingest-search` stops at the first window Google Trends refuses. Fetched batches are cached, so the next run resumes there.

Ingest is cached under `data/cache`. A cold run takes roughly an hour because every source is throttled. Scoring never rewrites raw signal rows. `audit-titles --write` is the only command that deletes them, and only for a character whose stored article failed the audit. See [docs/SOURCES.md](docs/SOURCES.md).

## Run The App

```bash
pnpm --filter @linchpin/api dev
API_URL=http://localhost:4000 pnpm --filter @linchpin/web dev
```

Web runs on port 3000. Pass `--port` to `next dev` if it's taken.

## API

| Route | Returns |
| --- | --- |
| `GET /franchises` | Screener rows. Filter by medium and status; sort by fragility, HHI, lead share, roster size or name; cursor paging |
| `GET /franchises/:id` | Franchise detail, roster, releases, exit events |
| `GET /franchises/:id/simulate/:characterId` | Concentration figures with one character removed |
| `GET /characters` | Characters across all scored franchises, sorted by carry, off-cycle carry or durability |
| `GET /characters/:id`, `GET /characters/:id/signals` | Character detail and its raw signal rows |
| `GET /creators` | Creators with project counts. Residuals are null below 3 completed projects |
| `GET /search?q=` | Franchises, characters and creators matching a name |
| `GET /validation`, `GET /validation/studies` | Gate status, kill criteria, event-study rows |
| `GET /vantage/sector` | The scored universe as one document |

The web app's `/api/export` route streams the filtered screener as CSV. Suppressed figures export as empty cells.

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
