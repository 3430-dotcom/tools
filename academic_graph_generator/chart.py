"""CSV 데이터를 학술 보고서 규격 그래프로 그리는 핵심 로직."""
from __future__ import annotations

import re
import warnings

import numpy as np
import pandas as pd
from matplotlib.figure import Figure

from .data import Series
from .styles import COLOR_CYCLE, LINESTYLE_CYCLE, MARKER_CYCLE, apply_style

KIND_CHOICES = ("line", "scatter", "bar")

_HANGUL_RE = re.compile(r"[가-힣]")


def _linear_trendline(x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray, float, float, float]:
    """1차 선형 회귀 추세선과 R^2, 기울기, 절편을 계산한다."""
    slope, intercept = np.polyfit(x, y, 1)
    fit_y = slope * x + intercept
    ss_res = float(np.sum((y - fit_y) ** 2))
    ss_tot = float(np.sum((y - np.mean(y)) ** 2))
    r_squared = 1.0 - ss_res / ss_tot if ss_tot > 0 else 1.0
    x_line = np.linspace(x.min(), x.max(), 100)
    y_line = slope * x_line + intercept
    return x_line, y_line, slope, intercept, r_squared


def render_figure(
    df: pd.DataFrame,
    x_col: str,
    series: list[Series],
    *,
    style: str = "apa",
    kind: str = "line",
    title: str | None = None,
    xlabel: str | None = None,
    ylabel: str | None = None,
    trendline: bool = False,
) -> Figure:
    if kind not in KIND_CHOICES:
        raise ValueError(f"알 수 없는 그래프 종류 '{kind}'. 선택 가능: {KIND_CHOICES}")

    text_fields = [title, xlabel, ylabel, x_col, *(s.label for s in series)]
    # 추세선을 그리면 범례에 "추세선"이라는 한글이 자동으로 들어가므로 함께 고려한다.
    has_korean_text = trendline or any(v and _HANGUL_RE.search(str(v)) for v in text_fields)
    korean_ok = apply_style(style, has_korean_text=has_korean_text)
    if has_korean_text and not korean_ok:
        warnings.warn(
            "한글 라벨이 있지만 시스템에 한글 폰트가 설치되어 있지 않습니다. "
            "그래프에서 한글이 네모(□)로 깨져 보일 수 있습니다. "
            "리눅스: `sudo apt-get install fonts-nanum` / macOS: 맑은 고딕·나눔고딕 설치 후 "
            "matplotlib 폰트 캐시를 재생성(`fc-cache -f`, `import matplotlib.font_manager as fm; "
            "fm._load_fontmanager(try_read_cache=False)`)하세요.",
            stacklevel=2,
        )

    fig = Figure()
    ax = fig.add_subplot(111)

    x = df[x_col].to_numpy()
    n_series = len(series)
    bar_width = 0.8 / max(n_series, 1)

    # "matplotlib" 스타일은 커스텀 마커/선/색 순환을 강제하지 않고 matplotlib의
    # 기본 자동 색상 순환(axes.prop_cycle, tab10)과 기본 선/마커 모양을 그대로 쓴다.
    use_default_cycle = style == "matplotlib"

    for i, s in enumerate(series):
        y = df[s.y_col].to_numpy(dtype=float)
        yerr = df[s.err_col].to_numpy(dtype=float) if s.err_col else None

        color = None if use_default_cycle else COLOR_CYCLE[i % len(COLOR_CYCLE)]
        marker = None if use_default_cycle else MARKER_CYCLE[i % len(MARKER_CYCLE)]
        linestyle = "-" if use_default_cycle else LINESTYLE_CYCLE[i % len(LINESTYLE_CYCLE)]

        if kind == "line":
            container = ax.errorbar(
                x, y, yerr=yerr,
                label=s.label, color=color, marker=marker, linestyle=linestyle,
                capsize=3, elinewidth=0.9, markeredgewidth=0.9,
            )
            color = container.lines[0].get_color()
        elif kind == "scatter":
            container = ax.errorbar(
                x, y, yerr=yerr,
                label=s.label, color=color, marker=marker or "o", linestyle="none",
                capsize=3, elinewidth=0.9, markeredgewidth=0.9,
            )
            color = container.lines[0].get_color()
        else:  # bar
            offset = (i - (n_series - 1) / 2) * bar_width
            positions = np.arange(len(x)) + offset
            bars = ax.bar(
                positions, y, width=bar_width, yerr=yerr,
                label=s.label, color=color, edgecolor="black", linewidth=0.6,
                capsize=3,
            )
            color = bars.patches[0].get_facecolor()

        if trendline and kind != "bar" and len(x) >= 2:
            x_line, y_line, slope, intercept, r2 = _linear_trendline(
                x.astype(float), y.astype(float)
            )
            ax.plot(
                x_line, y_line, color=color, linestyle=":", linewidth=1.0, alpha=0.8,
                label=f"{s.label} 추세선 (R²={r2:.3f})",
            )

    if kind == "bar":
        ax.set_xticks(np.arange(len(x)))
        ax.set_xticklabels([str(v) for v in x])

    ax.set_title(title or "")
    ax.set_xlabel(xlabel or x_col)
    ax.set_ylabel(ylabel or (series[0].y_col if len(series) == 1 else "값"))

    if n_series > 1 or trendline:
        ax.legend(loc="best")

    fig.tight_layout()
    return fig


def save_figure(fig: Figure, output_stem: str, formats: tuple[str, ...] = ("svg", "png")) -> list[str]:
    """지정한 포맷들로 그래프를 저장하고 저장된 경로 목록을 반환한다."""
    saved = []
    for fmt in formats:
        path = f"{output_stem}.{fmt}"
        fig.savefig(path, format=fmt)
        saved.append(path)
    return saved
