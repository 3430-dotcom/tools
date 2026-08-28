# 학술 그래프 뚝딱 생성기 (academic_graph_generator)

CSV 파일 하나만 있으면 엑셀 기본 디자인 대신 과학 보고서/논문 규격(APA·IEEE 스타일)에
맞는 깔끔한 matplotlib 그래프를 SVG/PNG로 바로 뽑아주는 CLI 도구.

- 오차범위(에러바): `값_err`, `값_std` 등 접미사가 붙은 컬럼을 자동으로 짝지어 표시
- 추세선: 선형 회귀 추세선과 R² 값을 범례에 함께 표시 (`--trendline`)
- 스타일: `apa`(세리프체, 격자선 없음), `ieee`(작은 2단 컬럼 크기, 옅은 y축 격자선),
  `matplotlib`(사각 테두리·자동 색상 순환 등 matplotlib 기본 모양 그대로)
- 그래프 종류: `line`, `scatter`, `bar`
- 그래프 크기(기본 16:9), 범례 표시 여부/위치, 계열별 색상을 옵션으로 직접 지정 가능
- 한글 라벨: 시스템에 한글 폰트(나눔고딕 등)가 있으면 자동으로 사용, 없으면 안내 경고 출력

## 설치

```bash
pip install -r academic_graph_generator/requirements.txt
```

## 사용 예

```bash
python -m academic_graph_generator academic_graph_generator/examples/sample_titration.csv \
  --style apa --kind line --trendline \
  --title "NaOH 적정에 따른 pH 변화" --xlabel "NaOH 부피 (mL)" --ylabel "pH" \
  --output titration_graph
```

`titration_graph.svg`, `titration_graph.png` 파일이 생성된다.

그래프 크기·범례·색상 지정 예시:

```bash
python -m academic_graph_generator data.csv \
  --style matplotlib --kind line \
  --figsize 9x5 --legend on --legend-loc "upper left" \
  --colors "#2b6cb0" "#c53030" \
  --output result
```

옵션 전체 목록은 `python -m academic_graph_generator --help` 참고.

## 테스트

```bash
pip install pytest
pytest academic_graph_generator/tests
```
