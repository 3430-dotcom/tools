import os

import pandas as pd
import pytest

from academic_graph_generator.chart import render_figure, save_figure
from academic_graph_generator.data import Series


@pytest.fixture
def df():
    return pd.DataFrame({
        "x": [0, 1, 2, 3, 4],
        "y": [0.0, 1.0, 2.0, 3.0, 4.0],
        "y_err": [0.1, 0.1, 0.1, 0.1, 0.1],
    })


def test_render_line_with_errorbar(df):
    series = [Series(label="y", y_col="y", err_col="y_err")]
    fig = render_figure(df, "x", series, style="apa", kind="line")
    ax = fig.axes[0]
    assert ax.get_xlabel() == "x"
    # errorbar()로 그리면 축에 LineCollection(에러바)이 최소 1개 이상 생긴다
    assert len(ax.containers) == 1


def test_render_bar_kind(df):
    series = [Series(label="y", y_col="y", err_col="y_err")]
    fig = render_figure(df, "x", series, kind="bar")
    ax = fig.axes[0]
    assert len(ax.patches) == len(df)


def test_trendline_adds_r_squared_to_legend(df):
    series = [Series(label="y", y_col="y", err_col=None)]
    fig = render_figure(df, "x", series, kind="line", trendline=True)
    ax = fig.axes[0]
    legend_labels = [t.get_text() for t in ax.get_legend().get_texts()]
    assert any("R²" in label for label in legend_labels)
    # y = x인 완벽한 직선이므로 R^2는 1에 매우 가까워야 한다
    assert any("1.000" in label for label in legend_labels)


def test_invalid_kind_raises(df):
    series = [Series(label="y", y_col="y", err_col=None)]
    with pytest.raises(ValueError, match="알 수 없는 그래프 종류"):
        render_figure(df, "x", series, kind="pie")


def test_save_figure_writes_requested_formats(df, tmp_path):
    series = [Series(label="y", y_col="y", err_col=None)]
    fig = render_figure(df, "x", series, kind="line")
    stem = str(tmp_path / "out")
    saved = save_figure(fig, stem, formats=("svg", "png"))
    assert saved == [f"{stem}.svg", f"{stem}.png"]
    for path in saved:
        assert os.path.exists(path)
        assert os.path.getsize(path) > 0
