import { useRef, useState } from 'react'
import { AxisSlider } from './AxisSlider'
import type { Axis, AxisState } from '../viewer/crossSection'
import type { PDBRenderMode } from '../viewer/pdb'
import type { Background } from '../viewer/SceneManager'
import type { ModelInfo, ModelKind } from '../types'

const SAMPLE_BASE = `${import.meta.env.BASE_URL}samples/`

const PDB_SAMPLES = [
  { label: '카페인 (Caffeine)', url: `${SAMPLE_BASE}caffeine.pdb` },
  { label: '에탄올 (Ethanol)', url: `${SAMPLE_BASE}ethanol.pdb` },
  { label: '아스피린 (Aspirin)', url: `${SAMPLE_BASE}aspirin.pdb` },
]

const STL_SAMPLES = [
  { label: '토러스 노트', url: `${SAMPLE_BASE}torus-knot.stl` },
  { label: '기어 브래킷', url: `${SAMPLE_BASE}gear-bracket.stl` },
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
  onLoadPdbId: (id: string) => void
  onResetView: () => void
  onScreenshot: () => void
}

export function Sidebar(props: SidebarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [pdbId, setPdbId] = useState('1CRN')

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
            value={pdbId}
            onChange={(e) => setPdbId(e.target.value)}
            placeholder="PDB ID (예: 1CRN)"
            maxLength={8}
          />
          <button className="btn" onClick={() => pdbId.trim() && props.onLoadPdbId(pdbId.trim())}>
            RCSB에서 가져오기
          </button>
        </div>

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
