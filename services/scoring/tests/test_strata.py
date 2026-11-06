from validation.strata import DIVERGENCE_Z, StratumRow, compare, summarise


def _rows(estimates: list[float]) -> list[StratumRow]:
    return [
        StratumRow(predictor=index / 10, did_estimate=value)
        for index, value in enumerate(estimates)
    ]


def test_summary_reports_mean_and_standard_error() -> None:
    stratum = summarise("UNANNOUNCED", _rows([-0.2, -0.4]))
    assert stratum.events == 2
    assert stratum.mean_did is not None and abs(stratum.mean_did + 0.3) < 1e-12
    assert stratum.std_error is not None and abs(stratum.std_error - 0.1) < 1e-12


def test_single_event_stratum_has_no_standard_error_and_no_verdict() -> None:
    lone = summarise("RECAST", _rows([-0.5]))
    other = summarise("UNANNOUNCED", _rows([-0.1, -0.2, -0.3]))
    assert lone.std_error is None
    assert compare(lone, other).diverges is None


def test_rank_ic_is_positive_when_bigger_shares_precede_bigger_falls() -> None:
    falls = [-0.01 * index for index in range(15)]
    assert summarise("UNANNOUNCED", _rows(falls)).rank_ic.coefficient == 1.0


def test_far_apart_strata_diverge_and_close_ones_do_not() -> None:
    base = summarise("UNANNOUNCED", _rows([-0.10, -0.11, -0.09, -0.10]))
    far = summarise("ANNOUNCED", _rows([-0.90, -0.91, -0.89, -0.90]))
    near = summarise("ANNOUNCED", _rows([-0.10, -0.12, -0.08, -0.11]))
    far_comparison = compare(far, base)
    assert far_comparison.diverges is True
    assert far_comparison.z_score is not None and abs(far_comparison.z_score) > DIVERGENCE_Z
    assert compare(near, base).diverges is False
