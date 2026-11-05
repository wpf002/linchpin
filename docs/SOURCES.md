# Sources

| Source | Used For | Status | Access | Limits Honoured |
| --- | --- | --- | --- | --- |
| Wikimedia Pageviews | Daily per-character attention (`WIKI`) | Wired into ingest | REST, no key, `WIKIMEDIA_USER_AGENT` required | Throttled client, cached, Retry-After honoured |
| Wikipedia Action API | Resolving characters to articles | Wired into ingest | No key | 50 titles per query, 1 request/second |
| TVmaze | Casts, episode and season dates | Wired into ingest | No key | Throttled, cached |
| TMDB | Cast, credits, air dates | Module present, not in default ingest | `TMDB_API_KEY` | Attribution required by TMDB terms |
| Google Trends | Comparative interest only | Module present, not in default ingest | pytrends | Values rescaled to a shared anchor term. Never treated as absolute volume |
| Reddit | Mention counts | Module present, not in default ingest | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` | Counting only. No sentiment |
| AO3 | Tagged work counts | Module present, not in default ingest | Public HTML | 6 requests/minute, per AO3 terms |
| Fandom | Character lists | Not used | | Fandom terms prohibit bulk scraping |
| `data/corpus/exit_events.json` | Exit events for Phase 2 | Hand-curated, each with a source URL | | |

All signals in the current scores come from `WIKI`. Carry weights fall back to `WIKI_ONLY_WEIGHTS` when other sources are missing, and the UI shows those shares as Not Measured.

## Cache

`data/cache` stores raw HTTP responses keyed by URL and params. 404s are cached as missing so reruns don't re-request them. Delete a namespace folder to force a refetch.
