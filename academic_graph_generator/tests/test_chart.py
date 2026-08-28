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


def test_invalid_legend_option_raises(df):
    series = [Series(label="y", y_col="y", err_col=None)]
    with pytest.raises(ValueError, match="알 수 없는 범례 옵션"):
        render_figure(df, "x", series, kind="line", legend="sometimes")


def test_default_figsize_is_16_9(df):
    series = [Series(label="y", y_col="y", err_col=None)]
    fig = render_figure(df, "x", series, kind="line")
    width, height = fig.get_size_inches()
    assert round(width / height, 2) == round(16 / 9, 2)


def test_custom_figsize_applied(df):
    series = [Series(label="y", y_col="y", err_col=None)]
    fig = render_figure(df, "x", series, kind="line", figsize=(5.0, 5.0))
    assert tuple(fig.get_size_inches()) == (5.0, 5.0)


def test_legend_off_hides_legend_even_with_trendline(df):
    series = [Series(label="y", y_col="y", err_col=None)]
    fig = render_figure(df, "x", series, kind="line", trendline=True, legend="off")
    assert fig.axes[0].get_legend() is None


def test_legend_on_shows_legend_for_single_series(df):
    series = [Series(label="y", y_col="y", err_col=None)]
    fig = render_figure(df, "x", series, kind="line", legend="on")
    assert fig.axes[0].get_legend() is not None


def test_custom_colors_applied_in_order(df):
    df2 = df.assign(z=df["y"] * 2)
    series = [
        Series(label="y", y_col="y", err_col=None),
        Series(label="z", y_col="z", err_col=None),
    ]
    fig = render_figure(df2, "x", series, kind="line", colors=["red", "blue"])
    ax = fig.axes[0]
    import matplotlib.colors as mcolors
    assert mcolors.to_rgba(ax.containers[0].lines[0].get_color()) == mcolors.to_rgba("red")
    assert mcolors.to_rgba(ax.containers[1].lines[0].get_color()) == mcolors.to_rgba("blue")


def test_save_figure_writes_requested_formats(df, tmp_path):
    series = [Series(label="y", y_col="y", err_col=None)]
    fig = render_figure(df, "x", series, kind="line")
    stem = str(tmp_path / "out")
    saved = save_figure(fig, stem, formats=("svg", "png"))
    assert saved == [f"{stem}.svg", f"{stem}.png"]
    for path in saved:
        assert os.path.exists(path)
        assert os.path.getsize(path) > 0
