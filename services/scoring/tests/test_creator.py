from metrics.constants import KILL_CRITERIA
from metrics.creator import (
    CREATOR_CONFIDENCE,
    MIN_PEER_FRANCHISES,
    Project,
    creator_residual,
    peer_baselines,
)


def _project(franchise_id: str, *, persistence: float, baseline: float = 5.0) -> Project:
    return Project(
        franchise_id=franchise_id,
        role_type="SHOWRUNNER",
        credit_share=1.0,
        persistence=persistence,
        peer_baseline=baseline,
    )


def test_score_is_suppressed_below_the_minimum_project_count() -> None:
    projects = [_project(f"f{index}", persistence=9.0) for index in range(2)]
    assert len(projects) < KILL_CRITERIA["minCreatorProjects"]
    assert creator_residual(projects) is None


def test_score_is_always_low_confidence() -> None:
    result = creator_residual([_project(f"f{index}", persistence=6.0) for index in range(3)])
    assert result is not None
    assert result.project_count == 3
    assert result.confidence == CREATOR_CONFIDENCE
    assert abs(result.residual - 1.0) < 1e-12


def test_residual_is_weighted_by_role_and_credit_share() -> None:
    lead = Project("a", "SHOWRUNNER", 1.0, persistence=7.0, peer_baseline=5.0)
    minor = Project("b", "ACTOR", 0.1, persistence=1.0, peer_baseline=5.0)
    other = Project("c", "SHOWRUNNER", 1.0, persistence=7.0, peer_baseline=5.0)
    result = creator_residual([lead, minor, other])
    assert result is not None
    assert 1.8 < result.residual < 2.0


def test_zero_weight_credits_are_suppressed() -> None:
    projects = [Project(f"f{i}", "ACTOR", 0.0, 6.0, 5.0) for i in range(3)]
    assert creator_residual(projects) is None


def test_baseline_excludes_the_franchise_itself_and_needs_enough_peers() -> None:
    tv = {"a": 1.0, "b": 2.0, "c": 3.0, "d": 100.0}
    comics = {f"c{index}": 1.0 for index in range(MIN_PEER_FRANCHISES)}
    baselines = peer_baselines({"TV": tv, "COMIC": comics})
    assert baselines["d"] == 2.0
    assert baselines["a"] == 3.0
    assert not any(key in baselines for key in comics)
