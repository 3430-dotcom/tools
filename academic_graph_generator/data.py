"""CSV 로딩과 오차범위(에러바) 컬럼 자동 인식."""
from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

# 이 접미사가 붙은 컬럼은 바로 앞의 데이터 컬럼에 대한 오차범위로 취급한다.
# 예: "temp_A", "temp_A_err" -> temp_A 시리즈의 오차범위
ERROR_SUFFIXES = ("_err", "_error", "_stderr", "_std", "_sd")


@dataclass(frozen=True)
class Series:
    """하나의 y 데이터 계열과 (있다면) 그 오차범위 컬럼."""

    label: str
    y_col: str
    err_col: str | None


def load_csv(path: str) -> pd.DataFrame:
    df = pd.read_csv(path)
    if df.shape[1] < 2:
        raise ValueError("CSV에 최소 2개 이상의 컬럼(x, y)이 있어야 합니다.")
    return df


def _strip_error_suffix(col: str) -> str | None:
    for suffix in ERROR_SUFFIXES:
        if col.lower().endswith(suffix):
            return col[: -len(suffix)]
    return None


def detect_series(df: pd.DataFrame, x_col: str | None = None) -> tuple[str, list[Series]]:
    """x축 컬럼과 y 계열 목록을 자동으로 찾는다.

    오차범위 컬럼(예: value_err)은 별도 시리즈로 만들지 않고
    같은 이름의 본 데이터 컬럼에 매칭시킨다.
    """
    columns = list(df.columns)
    if x_col is None:
        x_col = columns[0]
    if x_col not in columns:
        raise ValueError(f"x축 컬럼 '{x_col}'을 CSV에서 찾을 수 없습니다. 사용 가능한 컬럼: {columns}")

    error_map: dict[str, str] = {}
    for col in columns:
        base = _strip_error_suffix(col)
        if base is not None:
            error_map[base] = col

    series: list[Series] = []
    for col in columns:
        if col == x_col or col in error_map.values():
            continue
        series.append(Series(label=col, y_col=col, err_col=error_map.get(col)))

    if not series:
        raise ValueError("오차범위 컬럼을 제외하면 그릴 수 있는 y 데이터 컬럼이 없습니다.")

    return x_col, series
