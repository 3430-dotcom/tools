# 3D Molecule & Object Viewer

브라우저에서 바로 열리는 3D 뷰어 포트폴리오 프로젝트입니다. **PDB**(단백질/분자 구조) 파일과 **STL**(3D 프린팅) 파일을 불러와 360도로 회전시키고, 절단면을 움직여가며 내부 구조를 살펴볼 수 있습니다.

## 주요 기능

- **PDB 뷰어**: Ball & Stick / Spacefill 렌더링, CPK 원소 색상, RCSB PDB에서 ID로 직접 다운로드
- **STL 뷰어**: 솔리드 / 와이어프레임 표시, 삼각형 수·크기·부피 정보
- **단면 분석 (Cross-Section)**: X/Y/Z 축별 절단 평면을 켜고 슬라이더로 이동, 방향 반전. STL 모델은 스텐실 버퍼 기법으로 절단면에 실제 단면(캡)이 채워져 렌더링됩니다.
- **360도 회전**: OrbitControls 기반 자유 회전 + 자동 회전 토글
- 파일 드래그 앤 드롭 업로드, 내장 샘플 모델(카페인/아스피린/에탄올 PDB, 기어·토러스 노트 STL)
- 스크린샷 저장, 다크/라이트 배경 전환

## 기술 스택

- React + TypeScript + Vite
- three.js (`PDBLoader`, `STLLoader`, `OrbitControls`, 스텐실 클리핑)

## 실행 방법

```bash
npm install
npm run dev
```

## 샘플 자산 재생성

`public/samples/*.stl`은 `scripts/gen-samples.mjs`로 생성되었습니다:

```bash
node scripts/gen-samples.mjs
```
