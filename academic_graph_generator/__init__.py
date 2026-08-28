"""보고서용 학술 그래프 뚝딱 생성기.

CSV 파일 하나로 APA/IEEE 규격에 맞는 matplotlib 스타일 그래프를
SVG/PNG로 바로 만들어주는 도구.
"""
from .chart import render_figure, save_figure
from .data import detect_series, load_csv

__all__ = ["render_figure", "save_figure", "detect_series", "load_csv"]
