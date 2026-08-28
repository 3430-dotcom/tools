"""보고서/논문 규격에 맞춘 matplotlib 스타일 프리셋.

APA(7판)와 IEEE 논문 스타일은 공통적으로
- 흰 배경, 상단/우측 테두리 제거
- 최소한의 격자선
- 명확한 축 라벨과 범례
- 흑백 인쇄에도 구분되는 마커/선 스타일
을 요구한다. 두 스타일의 세부 차이(글꼴, 격자선 유무 등)만 프리셋으로 분리한다.
"""
from __future__ import annotations

import matplotlib as mpl
import matplotlib.font_manager as fm

# 한글을 지원하는 폰트 후보. 설치되어 있는 것 중 우선순위가 가장 높은 것을 사용한다.
# (세리프 계열이 없으면 산세리프 계열로라도 대체해 글자가 깨지는 것을 막는다)
_KOREAN_SERIF_CANDIDATES = [
    "NanumMyeongjo", "Noto Serif CJK KR", "Noto Serif KR", "Batang", "UnBatang",
]
_KOREAN_SANS_CANDIDATES = [
    "NanumGothic", "Noto Sans CJK KR", "Noto Sans KR", "Malgun Gothic", "AppleGothic",
]


def _installed_font_names() -> set[str]:
    return {f.name for f in fm.fontManager.ttflist}


def _pick_korean_font(candidates: list[str]) -> str | None:
    installed = _installed_font_names()
    for name in candidates:
        if name in installed:
            return name
    # 후보 목록에 없어도 시스템에 다른 한글 폰트가 있을 수 있으므로 이름 패턴으로 재탐색
    for name in installed:
        if any(k in name for k in ("Nanum", "CJK", "Gothic", "Myeongjo", "Batang", "Malgun")):
            return name
    return None

# 흑백으로 인쇄해도 구분 가능하도록 마커와 선 스타일을 함께 순환시킨다.
MARKER_CYCLE = ["o", "s", "^", "D", "v", "P", "X"]
LINESTYLE_CYCLE = ["-", "--", "-.", ":"]
# 색상은 보조 수단일 뿐, 흑백에서도 명도 차이로 구분되도록 어두운 계열로 제한한다.
COLOR_CYCLE = ["#1a1a1a", "#4472c4", "#c00000", "#548235", "#7030a0", "#bf8f00"]

_BASE_RC = {
    "figure.dpi": 150,
    "savefig.dpi": 300,
    "savefig.bbox": "tight",
    "axes.spines.top": False,
    "axes.spines.right": False,
    "axes.linewidth": 0.8,
    "axes.edgecolor": "#333333",
    "axes.labelcolor": "#000000",
    "text.color": "#000000",
    "xtick.color": "#000000",
    "ytick.color": "#000000",
    "xtick.direction": "out",
    "ytick.direction": "out",
    "legend.frameon": False,
    "legend.fontsize": 9,
    "lines.linewidth": 1.4,
    "lines.markersize": 5,
    "errorbar.capsize": 3,
}

STYLE_PRESETS = {
    # APA 7판: 세리프체(Times New Roman 계열), 격자선 없음, 축 제목은 보통체
    "apa": {
        **_BASE_RC,
        "font.family": "serif",
        "font.serif": ["Times New Roman", "Nimbus Roman", "DejaVu Serif"],
        "font.size": 11,
        "axes.titlesize": 12,
        "axes.titleweight": "bold",
        "axes.labelsize": 11,
        "axes.grid": False,
        "figure.figsize": (6.0, 4.0),
    },
    # IEEE: 세리프체(Times), 옅은 y축 격자선 허용, 2단 컬럼 폭에 맞춘 작은 크기
    "ieee": {
        **_BASE_RC,
        "font.family": "serif",
        "font.serif": ["Times New Roman", "Nimbus Roman", "DejaVu Serif"],
        "font.size": 9,
        "axes.titlesize": 10,
        "axes.titleweight": "normal",
        "axes.labelsize": 9,
        "axes.grid": True,
        "grid.color": "#cccccc",
        "grid.linewidth": 0.5,
        "axes.grid.axis": "y",
        "figure.figsize": (3.5, 2.6),
    },
    # matplotlib 기본 모양 그대로: 사각 테두리(4면 spine), 채워진 범례 박스,
    # 자동 색상 순환(tab10) 등 커스텀 프리셋을 전혀 얹지 않는다.
    "matplotlib": {
        "savefig.dpi": 300,
        "savefig.bbox": "tight",
        "figure.dpi": 150,
    },
}


def apply_style(style: str, has_korean_text: bool = False) -> bool:
    """지정한 스타일 프리셋을 matplotlib rcParams에 적용한다.

    has_korean_text가 True일 때만 한글 폰트를 탐색해 적용한다. 영문 전용
    그래프는 원래 프리셋의 세리프체(Times New Roman 등)를 그대로 사용한다.
    반환값은 한글 텍스트가 있는데도 한글 폰트를 찾지 못했는지 여부(True=문제 있음)의 반대,
    즉 "한글이 정상적으로 표시될 수 있는가"이다.
    """
    if style not in STYLE_PRESETS:
        raise ValueError(
            f"알 수 없는 스타일 '{style}'. 사용 가능한 스타일: {list(STYLE_PRESETS)}"
        )
    mpl.rcdefaults()
    mpl.rcParams.update(STYLE_PRESETS[style])
    mpl.rcParams["axes.unicode_minus"] = False

    if not has_korean_text:
        return True

    korean_font = _pick_korean_font(_KOREAN_SERIF_CANDIDATES + _KOREAN_SANS_CANDIDATES)
    if korean_font is None:
        return False

    # 한글 폰트를 최우선으로 넣어 라벨/제목의 한글이 깨지지 않도록 한다.
    # (기존 프리셋의 family는 그대로 두고 후보 목록 맨 앞에만 끼워 넣는다)
    mpl.rcParams["font.serif"] = [korean_font, *mpl.rcParams["font.serif"]]
    mpl.rcParams["font.sans-serif"] = [korean_font, *mpl.rcParams["font.sans-serif"]]
    mpl.rcParams["font.family"] = [korean_font]
    return True
