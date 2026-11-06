from dataclasses import dataclass

from ingest.roster import ROSTER_CAP_BY_MEDIUM, cap_roster


@dataclass(frozen=True)
class _Entry:
    name: str
    billing_order: int
    appearances: int | None = None


def _cap(entries: list[_Entry], medium: str) -> list[str]:
    capped = cap_roster(
        entries,
        medium,
        billing_order=lambda entry: entry.billing_order,
        appearances=lambda entry: entry.appearances,
    )
    return [entry.name for entry in capped]


def test_roster_is_cut_to_the_medium_cap() -> None:
    entries = [_Entry(f"c{index}", index) for index in range(1, 101)]
    assert len(_cap(entries, "COMIC")) == ROSTER_CAP_BY_MEDIUM["COMIC"]
    assert len(_cap(entries, "TV")) == ROSTER_CAP_BY_MEDIUM["TV"]


def test_without_counts_billing_order_decides() -> None:
    entries = [_Entry("third", 3), _Entry("first", 1), _Entry("second", 2)]
    assert _cap(entries, "TV") == ["first", "second", "third"]


def test_appearance_count_outranks_billing_order() -> None:
    entries = [_Entry(f"minor{index}", index, appearances=1) for index in range(1, 31)]
    entries.append(_Entry("mainstay", 99, appearances=5000))
    assert _cap(entries, "COMIC")[0] == "mainstay"


def test_counted_entries_rank_above_uncounted_ones() -> None:
    entries = [_Entry("uncounted", 1), _Entry("counted", 2, appearances=3)]
    assert _cap(entries, "COMIC") == ["counted", "uncounted"]
