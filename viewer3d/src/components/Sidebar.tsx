import { useRef, useState } from 'react'
import { AxisSlider } from './AxisSlider'
import type { Axis, AxisState } from '../viewer/crossSection'
import type { PDBRenderMode, PDBSearchResult } from '../viewer/pdb'
import type { Background } from '../viewer/SceneManager'
import type { ModelInfo, ModelKind } from '../types'

const SAMPLE_BASE = `${import.meta.env.BASE_URL}samples/`

const PDB_SAMPLES = [
  { label: '크램빈 (단백질)', url: `${SAMPLE_BASE}crambin.pdb` },
  { label: '카페인', url: `${SAMPLE_BASE}caffeine.pdb` },
  { label: '니코틴', url: `${SAMPLE_BASE}nicotine.pdb` },
  { label: '콜레스테롤', url: `${SAMPLE_BASE}cholesterol.pdb` },
  { label: '포도당', url: `${SAMPLE_BASE}glucose.pdb` },
  { label: '아스피린', url: `${SAMPLE_BASE}aspirin.pdb` },
  { label: '에탄올', url: `${SAMPLE_BASE}ethanol.pdb` },
  { label: '풀러렌 (C60)', url: `${SAMPLE_BASE}buckyball.pdb` },
]

const STL_SAMPLES = [
  { label: '꽃병 (속이 빈 모형)', url: `${SAMPLE_BASE}vase.stl` },
  { label: '기어 브래킷', url: `${SAMPLE_BASE}gear-bracket.stl` },
  { label: '토러스 노트', url: `${SAMPLE_BASE}torus-knot.stl` },
  { label: '도넛 토러스', url: `${SAMPLE_BASE}torus.stl` },
]

const AXES: Axis[] = ['x', 'y', 'z']

interface SidebarProps {
  modelKind: ModelKind
  modelInfo: ModelInfo
  axisState: Record<Axis, AxisState>
  onAxisChange: (axis: Axis, patch: Partial<AxisState>) => void
  renderMode: PDBRenderMode
  onRenderModeChange: (mode: PDBRenderMode) => void
  wireframe: boolean
  onWireframeChange: (v: boolean) => void
  autoRotate: boolean
  onAutoRotateChange: (v: boolean) => void
  background: Background
  onBackgroundChange: (v: Background) => void
  showHelpers: boolean
  onShowHelpersChange: (v: boolean) => void
  onFile: (file: File) => void
  onLoadSample: (url: string, kind: 'pdb' | 'stl') => void
  onLoadFromInput: (value: string) => void
  searchResults: PDBSearchResult[]
  searching: boolean
  onSearch: (query: string) => void
  onResetView: () => void
  onScreenshot: () => void
}

export function Sidebar(props: SidebarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [idOrUrl, setIdOrUrl] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  return (
    <aside className="sidebar">
      <section className="panel">
        <h2>모델 불러오기</h2>
        <button className="btn btn--primary" onClick={() => fileInputRef.current?.click()}>
          파일 열기 (.pdb / .stl)
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdb,.ent,.stl"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) props.onFile(file)
            e.target.value = ''
          }}
        />

        <div className="pdb-id-row">
          <input
            className="text-input"
            value={idOrUrl}
            onChange={(e) => setIdOrUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && idOrUrl.trim() && props.onLoadFromInput(idOrUrl.trim())}
            placeholder="예: 1CRN 또는 https://.../model.stl"
          />
          <button className="btn" onClick={() => idOrUrl.trim() && props.onLoadFromInput(idOrUrl.trim())}>
            불러오기
          </button>
        </div>
        <p className="hint">
          PDB ID(4자리, 예: 1CRN)를 입력하면 RCSB 단백질 데이터뱅크에서 바로 불러옵니다. 또는 .pdb/.stl 파일을
          직접 가리키는 URL을 붙여넣으세요 (예: NASA 3D Resources, GitHub 등). 사이트가 CORS를 막아두면 실패할 수
          있어요 — 그럴 땐 파일을 받아서 "파일 열기"로 올려주세요.
        </p>

        <div className="pdb-id-row">
          <input
            className="text-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && props.onSearch(searchQuery)}
            placeholder="영문으로 검색, 예: hemoglobin"
          />
          <button className="btn" onClick={() => props.onSearch(searchQuery)} disabled={props.searching}>
            {props.searching ? '검색 중…' : '검색'}
          </button>
        </div>
        <p className="hint">
          단백질/분자의 <strong>영문 이름</strong>으로 검색하세요 (예: hemoglobin, insulin, alcohol dehydrogenase). RCSB는
          영문 데이터베이스라 한글 검색어는 결과가 나오지 않습니다.
        </p>
        {props.searchResults.length > 0 && (
          <ul className="search-results">
            {props.searchResults.map((r) => (
              <li key={r.id}>
                <button className="search-result" onClick={() => props.onLoadFromInput(r.id)}>
                  <span className="search-result__id">{r.id}</span>
                  <span className="search-result__title">{r.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="sample-group">
          <span className="sample-label">단백질 샘플</span>
          <div className="chip-row">
            {PDB_SAMPLES.map((s) => (
              <button key={s.url} className="chip" onClick={() => props.onLoadSample(s.url, 'pdb')}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="sample-group">
          <span className="sample-label">3D 프린팅 샘플</span>
          <div className="chip-row">
            {STL_SAMPLES.map((s) => (
              <button key={s.url} className="chip" onClick={() => props.onLoadSample(s.url, 'stl')}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {props.modelKind === 'pdb' && (
        <section className="panel">
          <h2>렌더링 모드</h2>
          <div className="segmented">
            <button
              className={props.renderMode === 'ball-stick' ? 'active' : ''}
              onClick={() => props.onRenderModeChange('ball-stick')}
            >
              Ball &amp; Stick
            </button>
            <button
              className={props.renderMode === 'spacefill' ? 'active' : ''}
              onClick={() => props.onRenderModeChange('spacefill')}
            >
              Spacefill
            </button>
          </div>
        </section>
      )}

      {props.modelKind === 'stl' && (
        <section className="panel">
          <h2>표면 표시</h2>
          <label className="switch-row">
            <input type="checkbox" checked={props.wireframe} onChange={(e) => props.onWireframeChange(e.target.checked)} />
            와이어프레임
          </label>
        </section>
      )}

      <section className="panel">
        <h2>단면 분석 (Cross-Section)</h2>
        <p className="hint">축을 활성화하고 슬라이더로 절단면을 이동하세요.</p>
        {AXES.map((axis) => (
          <AxisSlider key={axis} axis={axis} state={props.axisState[axis]} onChange={(patch) => props.onAxisChange(axis, patch)} />
        ))}
        <label className="switch-row">
          <input type="checkbox" checked={props.showHelpers} onChange={(e) => props.onShowHelpersChange(e.target.checked)} />
          절단 평면 가이드 표시
        </label>
      </section>

      <section className="panel">
        <h2>뷰 옵션</h2>
        <label className="switch-row">
          <input type="checkbox" checked={props.autoRotate} onChange={(e) => props.onAutoRotateChange(e.target.checked)} />
          자동 회전 (360°)
        </label>
        <div className="segmented">
          <button className={props.background === 'dark' ? 'active' : ''} onClick={() => props.onBackgroundChange('dark')}>
            다크
          </button>
          <button className={props.background === 'light' ? 'active' : ''} onClick={() => props.onBackgroundChange('light')}>
            라이트
          </button>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={props.onResetView}>
            뷰 초기화
          </button>
          <button className="btn" onClick={props.onScreenshot}>
            스크린샷 저장
          </button>
        </div>
      </section>

      <InfoPanel modelInfo={props.modelInfo} />
    </aside>
  )
}

function InfoPanel({ modelInfo }: { modelInfo: ModelInfo }) {
  if (!modelInfo) return null
  return (
    <section className="panel">
      <h2>모델 정보</h2>
      {modelInfo.kind === 'pdb' ? (
        <ul className="info-list">
          <li>
            <span>원자 수</span>
            <strong>{modelInfo.atomCount.toLocaleString()}</strong>
          </li>
          <li>
            <span>결합 수</span>
            <strong>{modelInfo.bondCount.toLocaleString()}</strong>
          </li>
          <li className="info-list__wide">
            <span>구성 원소</span>
            <strong>
              {Object.entries(modelInfo.elementCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([el, count]) => `${el}×${count}`)
                .join('  ')}
            </strong>
          </li>
        </ul>
      ) : (
        <ul className="info-list">
          <li>
            <span>삼각형 수</span>
            <strong>{modelInfo.triangleCount.toLocaleString()}</strong>
          </li>
          <li>
            <span>크기 (X×Y×Z)</span>
            <strong>
              {modelInfo.size.x.toFixed(1)} × {modelInfo.size.y.toFixed(1)} × {modelInfo.size.z.toFixed(1)} mm
            </strong>
          </li>
          <li>
            <span>부피 (근사)</span>
            <strong>{(modelInfo.volumeMm3 / 1000).toFixed(2)} cm³</strong>
          </li>
        </ul>
      )}
    </section>
  )
}
