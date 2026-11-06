# Sources

| Source | Used For | Status | Access | Limits Honoured |
| --- | --- | --- | --- | --- |
| Wikimedia Pageviews | Daily per-character attention (`WIKI`) | Wired into ingest | REST, no key, `WIKIMEDIA_USER_AGENT` required | Throttled client, cached, Retry-After honoured |
| Wikipedia Action API | Resolving characters to articles | Wired into ingest | No key | 20 titles per query (the API returns intro extracts for at most 20 pages), 1 request/second |
| TVmaze | Casts, episode and season dates | Wired into ingest | No key | Throttled, cached |
| TMDB | Cast, credits, air dates | Module present, untested. `TMDB_API_KEY` is empty | `TMDB_API_KEY` | Attribution required by TMDB terms |
| Google Trends | Pre-window interest per exit event (`TRENDS`) | Wired into `ingest-search`. 9 of 28 windows stored as of 2026-11-06 | pytrends, no key | 5 terms per query, 8 seconds between batches, anchor term pinned in every batch. Stops on the first refusal |
| Reddit | Mention counts | Module present, untested. Credentials are empty | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` | Counting only. No sentiment |
| AO3 | Tagged work counts | Unavailable. Three requests on 2026-11-06 returned HTTP 418. No workaround attempted | Public HTML | 6 requests/minute, per AO3 terms |
| Fandom | Character lists | Not used | | Fandom terms prohibit bulk scraping |
| `data/corpus/exit_events.json` | Exit events for Phase 2 | Hand-curated, each with a source URL | | |

All signals in the current scores come from `WIKI`. `TRENDS` rows are read only by the blend test in `validate`. Carry weights are `WIKI_ONLY_WEIGHTS`, and the UI shows the other shares as Not Measured.

## Google Trends

- Values are comparative. Each window stores one row per character in units of the franchise's top-billed character, whose value is 1.0.
- A window is stored only when every character in the roster came back.
- Google answered HTTP 429 at Grey's Anatomy 2016-05-19. Fetched batches are cached, so `ingest-search` resumes from that window.
- `pytrends` is archived and unmaintained. It works today against an unofficial endpoint and can break without notice. Google announced an official Trends API in 2025 with limited access. Switch to it if access opens.

## Wikipedia Title Audit

`audit-titles` re-checks every stored `Character.wikiTitle` against the resolver's current rules. An article is accepted when its title matches the character's name or a known short form, or when its lead sentence names the character as a fictional character.

Run with `--write` on 2026-11-06:

| Figure | Count |
| --- | --- |
| Links checked | 561 |
| Links rejected and cleared | 59 |
| Franchises affected | 30 |
| `WIKI` and `TRENDS` signal rows deleted | 181,209 |

The deleted rows measured a different article (an actor, a real person, a disambiguation page). They were attributed to the wrong character, so they were removed and the affected franchises re-ingested. This is the only case where signal rows are deleted. `rawValue` on a kept row is never rewritten.

The rules can't confirm these links, so the characters have no article and no signal: Krusty the Klown ("Krusty the Clown"), Slade Wilson ("Deathstroke"), Quentin Lance ("Larry Lance"), Ivy Pepper ("Poison Ivy"), Winn Schott ("Toyman"), M.J. Delfino. An alias table would recover them.

The v0.1.0 and v0.2.0 validation results were registered before this audit.

## Cache

`data/cache` stores raw HTTP responses keyed by URL and params. 404s are cached as missing so reruns don't re-request them. Delete a namespace folder to force a refetch.
