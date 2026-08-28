"""CSV -> 학술 그래프(SVG/PNG) 커맨드라인 도구.

사용 예:
    python -m academic_graph_generator data.csv --style apa --kind line \
        --trendline --title "온도에 따른 반응 속도" \
        --xlabel "온도 (°C)" --ylabel "반응 속도 (mol/s)" --output result
"""
from __future__ import annotations

import argparse
import sys

from .chart import DEFAULT_FIGSIZE, KIND_CHOICES, LEGEND_CHOICES, render_figure, save_figure
from .data import detect_series, load_csv
from .styles import STYLE_PRESETS


def _parse_figsize(value: str) -> tuple[float, float]:
    try:
        width_str, height_str = value.lower().split("x")
        return float(width_str), float(height_str)
    except ValueError:
        raise argparse.ArgumentTypeError(
            f"'{value}'는 올바른 크기 형식이 아닙니다. '너비x높이'(인치) 형식으로 입력하세요. 예: 8x4.5"
        ) from None


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="academic_graph_generator",
        description="CSV 파일을 과학 보고서/논문 규격(APA/IEEE)의 깔끔한 그래프로 변환합니다.",
    )
    parser.add_argument("csv_path", help="입력 CSV 파일 경로")
    parser.add_argument(
        "--style", choices=list(STYLE_PRESETS), default="apa",
        help="그래프 스타일 (기본값: apa)",
    )
    parser.add_argument(
        "--kind", choices=list(KIND_CHOICES), default="line",
        help="그래프 종류 (기본값: line)",
    )
    parser.add_argument("--x", dest="x_col", default=None, help="x축으로 사용할 컬럼명 (기본값: 첫 컬럼)")
    parser.add_argument("--title", default=None, help="그래프 제목")
    parser.add_argument("--xlabel", default=None, help="x축 라벨 (기본값: x 컬럼명)")
    parser.add_argument("--ylabel", default=None, help="y축 라벨")
    parser.add_argument(
        "--trendline", action="store_true",
        help="선형 회귀 추세선과 R² 값을 함께 표시합니다.",
    )
    parser.add_argument(
        "--figsize", type=_parse_figsize, default=DEFAULT_FIGSIZE,
        help=f"그래프 크기 '너비x높이'(인치) (기본값: {DEFAULT_FIGSIZE[0]}x{DEFAULT_FIGSIZE[1]}, 16:9)",
    )
    parser.add_argument(
        "--legend", choices=list(LEGEND_CHOICES), default="auto",
        help="범례 표시 여부: auto(계열 2개 이상이거나 추세선 있으면 표시)/on/off (기본값: auto)",
    )
    parser.add_argument(
        "--legend-loc", default="best",
        help="범례 위치, matplotlib legend loc 문자열 (예: 'upper right', 'lower left', 기본값: best)",
    )
    parser.add_argument(
        "--colors", nargs="+", default=None,
        help="계열별 선/막대 색상을 순서대로 지정 (예: --colors blue red green). 지정하지 않으면 자동 순환",
    )
    parser.add_argument(
        "--output", default="graph",
        help="출력 파일 이름(확장자 제외, 기본값: graph)",
    )
    parser.add_argument(
        "--formats", nargs="+", default=["svg", "png"],
        help="저장할 파일 형식 목록 (기본값: svg png)",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        df = load_csv(args.csv_path)
        x_col, series = detect_series(df, x_col=args.x_col)
        fig = render_figure(
            df, x_col, series,
            style=args.style, kind=args.kind, title=args.title,
            xlabel=args.xlabel, ylabel=args.ylabel, trendline=args.trendline,
            figsize=args.figsize, legend=args.legend, legend_loc=args.legend_loc,
            colors=args.colors,
        )
        saved = save_figure(fig, args.output, formats=tuple(args.formats))
    except (ValueError, FileNotFoundError) as exc:
        print(f"오류: {exc}", file=sys.stderr)
        return 1

    series_names = ", ".join(s.label for s in series)
    print(f"x축: {x_col} / y 계열: {series_names}")
    print("저장됨: " + ", ".join(saved))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
