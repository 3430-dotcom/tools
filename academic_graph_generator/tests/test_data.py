import io

import pandas as pd
import pytest

from academic_graph_generator.data import Series, detect_series, load_csv


def test_detect_series_pairs_error_columns():
    df = pd.DataFrame({
        "temp": [1, 2, 3],
        "rate_A": [1.0, 2.0, 3.0],
        "rate_A_err": [0.1, 0.1, 0.1],
        "rate_B": [2.0, 3.0, 4.0],
    })
    x_col, series = detect_series(df)
    assert x_col == "temp"
    assert series == [
        Series(label="rate_A", y_col="rate_A", err_col="rate_A_err"),
        Series(label="rate_B", y_col="rate_B", err_col=None),
    ]


def test_detect_series_explicit_x_col():
    df = pd.DataFrame({"a": [1, 2], "b": [3, 4], "x": [5, 6]})
    x_col, series = detect_series(df, x_col="x")
    assert x_col == "x"
    assert {s.y_col for s in series} == {"a", "b"}


def test_detect_series_unknown_x_col_raises():
    df = pd.DataFrame({"a": [1, 2], "b": [3, 4]})
    with pytest.raises(ValueError, match="찾을 수 없습니다"):
        detect_series(df, x_col="nope")


def test_detect_series_only_error_columns_raises():
    df = pd.DataFrame({"x": [1, 2], "y_err": [0.1, 0.1]})
    with pytest.raises(ValueError, match="y 데이터 컬럼이 없습니다"):
        detect_series(df)


def test_load_csv_requires_two_columns(tmp_path):
    path = tmp_path / "single.csv"
    path.write_text("only_col\n1\n2\n")
    with pytest.raises(ValueError, match="최소 2개"):
        load_csv(str(path))


def test_load_csv_reads_data(tmp_path):
    path = tmp_path / "data.csv"
    path.write_text("x,y\n1,2\n3,4\n")
    df = load_csv(str(path))
    assert list(df.columns) == ["x", "y"]
    assert len(df) == 2
