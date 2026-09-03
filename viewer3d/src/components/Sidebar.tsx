import { useEffect, useRef, useState } from 'react'
import { AxisSlider } from './AxisSlider'
import type { Axis, AxisState } from '../viewer/crossSection'
import type { PDBColorMode, PDBRenderMode, PDBSearchResult } from '../viewer/pdb'
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

const AXES: Axis[] = ['x', 'y', 'z']

/**
 * A curated list of biomolecules students are likely to recognize by their
 * Korean name but not know the English search term for -- RCSB's search is
 * English-only (see the hint text below the search box), so typing the
 * Korean name here surfaces the matching English term to search with
 * instead of leaving the student stuck. Deliberately a static local list,
 * not a live API suggestion, so this works with zero network dependency.
 */
const SEARCH_SUGGESTIONS = [
  { ko: '헤모글로빈', en: 'hemoglobin' },
  { ko: '미오글로빈', en: 'myoglobin' },
  { ko: '인슐린', en: 'insulin' },
  { ko: '라이소자임', en: 'lysozyme' },
  { ko: '콜라겐', en: 'collagen' },
  { ko: '케라틴', en: 'keratin' },
  { ko: '액틴', en: 'actin' },
  { ko: '미오신', en: 'myosin' },
  { ko: 'DNA 중합효소', en: 'DNA polymerase' },
  { ko: 'RNA 중합효소', en: 'RNA polymerase' },
  { ko: 'ATP 합성효소', en: 'ATP synthase' },
  { ko: '리보솜', en: 'ribosome' },
  { ko: '항체', en: 'antibody' },
  { ko: '면역글로불린', en: 'immunoglobulin' },
  { ko: '카탈레이스', en: 'catalase' },
  { ko: '시토크롬 c', en: 'cytochrome c' },
  { ko: '트립신', en: 'trypsin' },
  { ko: '펩신', en: 'pepsin' },
  { ko: '아밀레이스', en: 'amylase' },
  { ko: '혈청알부민', en: 'serum albumin' },
  { ko: '튜불린', en: 'tubulin' },
  { ko: '알코올 탈수소효소', en: 'alcohol dehydrogenase' },
  { ko: '녹색형광단백질', en: 'green fluorescent protein' },
  { ko: '케이신', en: 'casein' },
  { ko: '페리틴', en: 'ferritin' },
  { ko: '헥소키네이스', en: 'hexokinase' },
  { ko: '리보뉴클레이스', en: 'ribonuclease' },
  { ko: '스파이크 단백질', en: 'spike protein' },
  { ko: 'ACE2 수용체', en: 'ACE2' },
  { ko: 'p53 단백질', en: 'p53' },
  { ko: '크리스퍼 카스9', en: 'CRISPR Cas9' },
]

const MAX_SUGGESTIONS = 6

function matchingSuggestions(query: string) {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return []
  return SEARCH_SUGGESTIONS.filter((s) => s.ko.toLowerCase().includes(trimmed) || s.en.toLowerCase().includes(trimmed)).slice(
    0,
    MAX_SUGGESTIONS,
  )
}

/** Hover text for a search result: title, experimental method, and which render modes it supports (best-effort -- see PDBSearchResult.hasProtein). */
function resultTooltip(r: PDBSearchResult): string {
  const lines = [r.title]
  if (r.method) lines.push(`실험 방법: ${r.method}`)
  if (r.hasProtein === true) lines.push('지원 모드: Cartoon, Ball & Stick, Spacefill')
  else if (r.hasProtein === false) lines.push('지원 모드: Ball & Stick, Spacefill (단백질 골격이 없어 Cartoon 불가)')
  return lines.join('\n')
}

interface SidebarProps {
  className?: string
  modelKind: ModelKind
  modelInfo: ModelInfo
  axisState: Record<Axis, AxisState>
  onAxisChange: (axis: Axis, patch: Partial<AxisState>) => void
  renderMode: PDBRenderMode
  onRenderModeChange: (mode: PDBRenderMode) => void
  colorMode: PDBColorMode
  onColorModeChange: (mode: PDBColorMode) => void
  wireframe: boolean
  onWireframeChange: (v: boolean) => void
  autoRotate: boolean
  onAutoRotateChange: (v: boolean) => void
  background: Background
  onBackgroundChange: (v: Background) => void
  showHelpers: boolean
  onShowHelpersChange: (v: boolean) => void
  showCaption: boolean
  onShowCaptionChange: (v: boolean) => void
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
  // Thumbnails that failed to load (RCSB doesn't have an image for every
  // entry) -- tracked so that one broken image cleanly falls back to the
  // text-only result instead of showing a broken-image icon.
  const [failedThumbnails, setFailedThumbnails] = useState<Set<string>>(new Set())
  // Collapsible so a fresh set of results (each now with a thumbnail, so
  // noticeably taller) doesn't dominate the sidebar. Re-expands whenever a
  // new search actually returns results, since running a search implies
  // wanting to see what came back.
  const [resultsOpen, setResultsOpen] = useState(true)
  useEffect(() => {
    if (props.searchResults.length > 0) setResultsOpen(true)
  }, [props.searchResults])
  const [pdbSamplesOpen, setPdbSamplesOpen] = useState(true)
  const [colorLegendOpen, setColorLegendOpen] = useState(true)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const suggestions = matchingSuggestions(searchQuery)

  const runSearch = (query: string) => {
    setShowSuggestions(false)
    props.onSearch(query)
  }

  return (
    <aside className={`sidebar ${props.className ?? ''}`}>
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
          <div className="search-input-wrap">
            <input
              className="text-input"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setShowSuggestions(true)
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setShowSuggestions(false)}
              onKeyDown={(e) => e.key === 'Enter' && runSearch(searchQuery)}
              placeholder="영문으로 검색, 예: hemoglobin"
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul className="search-suggestions">
                {suggestions.map((s) => (
                  <li key={s.en}>
                    {/* onMouseDown (not onClick) fires before the input's onBlur closes this list. */}
                    <button
                      type="button"
                      onMouseDown={() => {
                        setSearchQuery(s.en)
                        runSearch(s.en)
                      }}
                    >
                      <span className="search-suggestions__ko">{s.ko}</span>
                      <span className="search-suggestions__en">{s.en}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button className="btn" onClick={() => runSearch(searchQuery)} disabled={props.searching}>
            {props.searching ? '검색 중…' : '검색'}
          </button>
        </div>
        <p className="hint">
          단백질/분자의 <strong>영문 이름</strong>으로 검색하세요 (예: hemoglobin, insulin, alcohol dehydrogenase). RCSB는
          영문 데이터베이스라 한글 검색어는 결과가 나오지 않습니다. 한글로 입력하면 아는 이름의 영문 검색어를
          추천해드려요.
        </p>
        {props.searchResults.length > 0 && (
          <>
            <button
              type="button"
              className="collapsible-toggle"
              onClick={() => setResultsOpen((v) => !v)}
              aria-expanded={resultsOpen}
            >
              <span>검색 결과 {props.searchResults.length}개</span>
              <span className="collapsible-toggle__chevron">{resultsOpen ? '▾' : '▸'}</span>
            </button>
            {resultsOpen && (
              <ul className="search-results">
                {props.searchResults.map((r) => (
                  <li key={r.id}>
                    <button className="search-result" onClick={() => props.onLoadFromInput(r.id)} title={resultTooltip(r)}>
                      {!failedThumbnails.has(r.id) && (
                        <img
                          className="search-result__thumb"
                          src={r.thumbnailUrl}
                          alt=""
                          loading="lazy"
                          onError={() => setFailedThumbnails((prev) => new Set(prev).add(r.id))}
                        />
                      )}
                      <div className="search-result__text">
                        <span className="search-result__id">{r.id}</span>
                        <span className="search-result__title">{r.title}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <div className="sample-group">
          <button
            type="button"
            className="collapsible-toggle"
            onClick={() => setPdbSamplesOpen((v) => !v)}
            aria-expanded={pdbSamplesOpen}
          >
            <span>단백질 샘플</span>
            <span className="collapsible-toggle__chevron">{pdbSamplesOpen ? '▾' : '▸'}</span>
          </button>
          {pdbSamplesOpen && (
            <div className="chip-row">
              {PDB_SAMPLES.map((s) => (
                <button key={s.url} className="chip" onClick={() => props.onLoadSample(s.url, 'pdb')}>
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {props.modelKind === 'pdb' && (
        <section className="panel">
          <h2>렌더링 모드</h2>
          <div className="segmented">
            <button
              className={props.renderMode === 'cartoon' ? 'active' : ''}
              onClick={() => props.onRenderModeChange('cartoon')}
            >
              Cartoon
            </button>
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
          {props.renderMode === 'cartoon' && (
            <p className="hint">
              척추를 리본으로 표시합니다. <span style={{ color: '#ff4d6d' }}>●</span> 알파 나선 &nbsp;
              <span style={{ color: '#ffd23f' }}>●</span> 베타 시트(화살표 방향이 N→C) &nbsp;
              <span style={{ color: '#dfe6f0' }}>●</span> 루프/코일
            </p>
          )}

          {props.renderMode !== 'cartoon' && (
            <>
              <h2>색상 기준</h2>
              <div className="segmented">
                <button
                  className={props.colorMode === 'element' ? 'active' : ''}
                  onClick={() => props.onColorModeChange('element')}
                >
                  원소별
                </button>
                <button
                  className={props.colorMode === 'structure' ? 'active' : ''}
                  onClick={() => props.onColorModeChange('structure')}
                >
                  2차 구조별
                </button>
                <button
                  className={props.colorMode === 'chain' ? 'active' : ''}
                  onClick={() => props.onColorModeChange('chain')}
                >
                  체인별
                </button>
              </div>
              {(props.colorMode === 'structure' || props.colorMode === 'chain') && (
                <>
                  <button
                    type="button"
                    className="collapsible-toggle"
                    onClick={() => setColorLegendOpen((v) => !v)}
                    aria-expanded={colorLegendOpen}
                  >
                    <span>범례</span>
                    <span className="collapsible-toggle__chevron">{colorLegendOpen ? '▾' : '▸'}</span>
                  </button>
                  {colorLegendOpen && props.colorMode === 'structure' && (
                    <p className="hint">
                      <span style={{ color: '#ff4d6d' }}>●</span> 알파 나선 &nbsp;
                      <span style={{ color: '#ffd23f' }}>●</span> 베타 시트 &nbsp;
                      <span style={{ color: '#dfe6f0' }}>●</span> 루프/코일
                    </p>
                  )}
                  {colorLegendOpen && props.colorMode === 'chain' && (
                    <p className="hint chain-legend">
                      {props.modelInfo?.kind === 'pdb' && Object.keys(props.modelInfo.chainColors).length > 0 ? (
                        Object.entries(props.modelInfo.chainColors).map(([chain, hex]) => (
                          <span key={chain} className="chain-legend__item">
                            <span style={{ color: `#${hex.toString(16).padStart(6, '0')}` }}>●</span> 체인 {chain}
                          </span>
                        ))
                      ) : (
                        '체인 정보가 없어요.'
                      )}
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </section>
      )}

      {props.modelKind === 'stl' && (
        <section className="panel">
          <h2>표면 표시</h2>
          <label className="switch-row">
            <input type="checkbox" checked={props.wireframe} onChange={(e) => props.onWireframeChange(e.target.checked)} />
            와이어프레임
          </label>
          {props.modelInfo?.kind === 'stl' && props.modelInfo.hasEmbeddedColor && (
            <p className="hint">이 STL 파일에 저장된 색상을 그대로 표시하고 있어요.</p>
          )}
        </section>
      )}

      {/* Cartoon ribbons aren't closed solids and never received clipping
          planes to begin with (only the atom/bond InstancedMeshes do), so
          the cross-section controls would silently do nothing here -- hide
          them rather than expose a broken control. */}
      {!(props.modelKind === 'pdb' && props.renderMode === 'cartoon') && (
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
      )}

      <section className="panel">
        <h2>뷰 옵션</h2>
        <label className="switch-row">
          <input type="checkbox" checked={props.autoRotate} onChange={(e) => props.onAutoRotateChange(e.target.checked)} />
          자동 회전 (360°)
        </label>
        <label className="switch-row">
          <input type="checkbox" checked={props.showCaption} onChange={(e) => props.onShowCaptionChange(e.target.checked)} />
          분자 이름/생물종 표시
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
          {modelInfo.metadata.title && (
            <li className="info-list__wide">
              <span>이름</span>
              <strong>{modelInfo.metadata.title}</strong>
            </li>
          )}
          {modelInfo.metadata.organism && (
            <li className="info-list__wide">
              <span>생물종</span>
              <strong>{modelInfo.metadata.organism}</strong>
            </li>
          )}
          {modelInfo.metadata.method && (
            <li>
              <span>실험 방법</span>
              <strong>{modelInfo.metadata.method}</strong>
            </li>
          )}
          {(modelInfo.metadata.helixCount > 0 || modelInfo.metadata.sheetCount > 0) && (
            <li>
              <span>2차 구조</span>
              <strong>
                나선 {modelInfo.metadata.helixCount} · 시트 {modelInfo.metadata.sheetCount}
              </strong>
            </li>
          )}
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
