from datetime import date

from ingest.http import RetryableStatus
from ingest.stage_exits import (
    RATE_LIMITED_REASON,
    ExitCandidate,
    find_episode,
    find_evidence,
    is_duplicate,
    source_or_reason,
)
from ingest.tvmaze import TvMazeEpisode

EPISODES = [
    TvMazeEpisode(8, 5, "The Bells", date(2019, 5, 12)),
    TvMazeEpisode(8, 6, "The Iron Throne", date(2019, 5, 19)),
    TvMazeEpisode(2, 6, "Episode 6", date(2014, 11, 6)),
]


def _candidate(title: str, season: int | None = None, episode: int | None = None) -> ExitCandidate:
    return ExitCandidate(
        franchise="Game of Thrones",
        character="Lord Varys",
        person="Conleth Hill",
        exitType="CHARACTER_DEATH",
        episodeTitle=title,
        season=season,
        episode=episode,
    )


def test_season_and_number_pick_the_episode_when_titles_agree() -> None:
    found = find_episode(EPISODES, _candidate("The Bells", 8, 5))
    assert isinstance(found, TvMazeEpisode)
    assert found.airdate == date(2019, 5, 12)


def test_title_mismatch_rejects_a_wrong_episode_number() -> None:
    assert isinstance(find_episode(EPISODES, _candidate("The Bells", 8, 6)), str)


def test_generic_tvmaze_title_defers_to_season_and_number() -> None:
    found = find_episode(EPISODES, _candidate("Anything", 2, 6))
    assert isinstance(found, TvMazeEpisode)


def test_title_only_lookup() -> None:
    found = find_episode(EPISODES, _candidate("The Iron Throne"))
    assert isinstance(found, TvMazeEpisode)
    assert found.airdate == date(2019, 5, 19)


def test_evidence_requires_name_near_exit_word() -> None:
    text = (
        "Sandor arrives and kills the Queensguard to fight his brother. "
        "Jaime comforts Cersei as the Red Keep collapses, resulting in their deaths."
    )
    sentence = find_evidence(text, "Queen Cersei Lannister", "CHARACTER_DEATH")
    assert sentence is not None and sentence.startswith("Jaime comforts")


def test_exit_words_match_whole_word_prefixes_only() -> None:
    # "audience" contains "die" but is not an exit word.
    assert find_evidence("Varys won over the audience.", "Lord Varys", "CHARACTER_DEATH") is None


def test_duplicate_detection_matches_roster_and_corpus_spellings() -> None:
    existing = [("Grey's Anatomy", "Mark Sloan", date(2012, 10, 4))]
    assert is_duplicate(("Grey's Anatomy", "Dr. Mark Sloan", date(2012, 10, 4)), existing)
    assert not is_duplicate(("Grey's Anatomy", "Dr. Mark Sloan", date(2012, 10, 5)), existing)


class _RateLimitedWiki:
    def get_json(self, *_args: object, **_kwargs: object) -> None:
        raise RetryableStatus(429, "https://en.wikipedia.org/w/api.php")


def test_rate_limit_rejects_one_candidate_instead_of_ending_the_run() -> None:
    # 2026-11-11: a 429 that outlasted the retries crashed stage-exits 240 candidates in.
    reason = source_or_reason(_RateLimitedWiki(), _candidate("The Bells", 8, 5), "Game of Thrones")  # type: ignore[arg-type]
    assert reason == RATE_LIMITED_REASON
