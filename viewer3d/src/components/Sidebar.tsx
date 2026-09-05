import { useEffect, useRef, useState } from 'react'
import { AxisSlider } from './AxisSlider'
import type { Axis, AxisState } from '../viewer/crossSection'
import type { PDBColorMode, PDBRenderMode, PDBSearchResult } from '../viewer/pdb'
import type { PubchemSearchResult } from '../viewer/pubchem'
import { FUNCTIONAL_GROUP_COLORS, FUNCTIONAL_GROUP_LABELS, type FunctionalGroup } from '../viewer/functionalGroups'
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
 * A curated list of biomolecules and everyday compounds students are likely
 * to recognize by their Korean name but not know the English search term
 * for -- both RCSB and PubChem are English-only (see the hint text below
 * the search box), so typing the Korean name here surfaces the matching
 * English term to search with instead of leaving the student stuck.
 * Deliberately a static local list, not a live API suggestion, so this
 * works with zero network dependency.
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
  { ko: '프탈산 다이뷰틸', en: 'dibutyl phthalate' },
  { ko: '톨루엔', en: 'toluene' },
  { ko: '벤젠', en: 'benzene' },
  { ko: '폼알데하이드', en: 'formaldehyde' },
  { ko: '메탄올', en: 'methanol' },
  { ko: '아세톤', en: 'acetone' },
  { ko: '클로로폼', en: 'chloroform' },
  { ko: '요소', en: 'urea' },
  { ko: '구연산', en: 'citric acid' },
  { ko: '자당', en: 'sucrose' },
  { ko: '이부프로펜', en: 'ibuprofen' },
  { ko: '아세트아미노펜', en: 'acetaminophen' },
  { ko: '아스코르브산', en: 'ascorbic acid' },
  { ko: '멘톨', en: 'menthol' },
  { ko: '바닐린', en: 'vanillin' },
]

const MAX_SUGGESTIONS = 6
/** Cap on how many chain-legend entries to list before collapsing the rest into a "+N more" note -- a large biological assembly can have dozens. */
const MAX_CHAIN_LEGEND_ITEMS = 20

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
  structureOverlay: boolean
  onStructureOverlayChange: (v: boolean) => void
  showAtomLabels: boolean
  onShowAtomLabelsChange: (v: boolean) => void
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
  compoundResults: PubchemSearchResult[]
  searching: boolean
  onSubmitQuery: (query: string) => void
  onResetView: () => void
  onScreenshot: () => void
}

export function Sidebar(props: SidebarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
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
  const [compoundResultsOpen, setCompoundResultsOpen] = useState(true)
  useEffect(() => {
    if (props.compoundResults.length > 0) setCompoundResultsOpen(true)
  }, [props.compoundResults])
  const [failedCompoundThumbnails, setFailedCompoundThumbnails] = useState<Set<string>>(new Set())
  // Collapsed by default: the samples are a starting point for someone with
  // nothing loaded yet, not something to keep in the way of the search box
  // above every result list.
  const [pdbSamplesOpen, setPdbSamplesOpen] = useState(false)
  const [colorLegendOpen, setColorLegendOpen] = useState(true)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const suggestions = matchingSuggestions(searchQuery)

  const submit = (query: string) => {
    setShowSuggestions(false)
    props.onSubmitQuery(query)
  }

  // A protein/polymer structure (real backbone, cartoon-capable) and a small
  // compound (no backbone at all) support meaningfully different rendering
  // options -- a compound has no secondary structure or multiple chains to
  // color by, but does benefit from compound-specific extras a protein has
  // no use for (a functional-group color mode, atom labels, a see-through
  // spacefill overlay), so the render-mode card's contents differ by which
  // kind of model is actually loaded rather than showing every option always.
  const isCompound = props.modelInfo?.kind === 'pdb' && !props.modelInfo.hasCartoon

  return (
    <aside className={`sidebar ${props.className ?? ''}`}>
      <section className="panel">
        <h2>모델 불러오기</h2>
        <button className="btn btn--primary" onClick={() => fileInputRef.current?.click()}>
          파일 열기 (.pdb / .sdf / .stl)
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdb,.ent,.sdf,.mol,.stl"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) props.onFile(file)
            e.target.value = ''
          }}
        />

        <div className="sample-group">
          <button
            type="button"
            className="collapsible-toggle"
            onClick={() => setPdbSamplesOpen((v) => !v)}
            aria-expanded={pdbSamplesOpen}
          >
            <span>샘플 분자</span>
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
              onKeyDown={(e) => e.key === 'Enter' && submit(searchQuery)}
              placeholder="이름·PDB ID·URL (예: aspirin, 1CRN)"
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
                        submit(s.en)
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
          <button className="btn" onClick={() => submit(searchQuery)} disabled={props.searching}>
            {props.searching ? '검색 중…' : '검색'}
          </button>
        </div>
        <p className="hint">
          이름으로 검색하면 RCSB와 PubChem을 함께 찾아 결과를 따로 보여드려요 — 같은 이름이어도 둘은 서로 다른 걸
          뜻해요: RCSB는 <strong>그 화합물이 결합된 단백질</strong>을, PubChem은 <strong>그 화합물 자체</strong>를
          보여줍니다. 둘 다 영문 데이터베이스라 한글 검색어는 결과가 나오지 않아요 (한글로 입력하면 영문 검색어를
          추천해드려요). <strong>PDB ID</strong>(4자리, 예: 1CRN)나 .pdb/.sdf/.stl 파일의 <strong>URL</strong>을 넣으면
          검색 없이 바로 불러옵니다.
        </p>
        {props.searchResults.length > 0 && (
          <>
            <button
              type="button"
              className="collapsible-toggle"
              onClick={() => setResultsOpen((v) => !v)}
              aria-expanded={resultsOpen}
            >
              <span>단백질 구조 결과 {props.searchResults.length}개 (RCSB)</span>
              <span className="collapsible-toggle__chevron">{resultsOpen ? '▾' : '▸'}</span>
            </button>
            {resultsOpen && (
              <>
                <p className="hint">이 화합물이 결합된 단백질·효소 구조예요 (원자 수천 개 이상, 화합물 자체보다 훨씬 커요).</p>
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
              </>
            )}
          </>
        )}

        {props.compoundResults.length > 0 && (
          <>
            <button
              type="button"
              className="collapsible-toggle"
              onClick={() => setCompoundResultsOpen((v) => !v)}
              aria-expanded={compoundResultsOpen}
            >
              <span>화합물 분자 결과 {props.compoundResults.length}개 (PubChem)</span>
              <span className="collapsible-toggle__chevron">{compoundResultsOpen ? '▾' : '▸'}</span>
            </button>
            {compoundResultsOpen && (
              <>
                <p className="hint">이 화합물 자체의 3D 구조예요 (단백질에 결합된 형태가 아니라 분자 하나만 보여줘요).</p>
                <ul className="search-results">
                  {props.compoundResults.map((c) => (
                    <li key={c.name}>
                      <button className="search-result" onClick={() => props.onLoadFromInput(c.name)} title={c.name}>
                        {!failedCompoundThumbnails.has(c.name) && (
                          <img
                            className="search-result__thumb search-result__thumb--compound"
                            src={c.thumbnailUrl}
                            alt=""
                            loading="lazy"
                            onError={() => setFailedCompoundThumbnails((prev) => new Set(prev).add(c.name))}
                          />
                        )}
                        <div className="search-result__text">
                          <span className="search-result__title">{c.name}</span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </section>

      {props.modelKind === 'pdb' && (
        <section className="panel">
          <h2>렌더링 모드</h2>
          <div className="segmented">
            {!isCompound && (
              <button
                className={props.renderMode === 'cartoon' ? 'active' : ''}
                onClick={() => props.onRenderModeChange('cartoon')}
              >
                Cartoon
              </button>
            )}
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

          {isCompound && props.renderMode !== 'cartoon' && (
            <>
              {props.renderMode === 'spacefill' && (
                <label className="switch-row">
                  <input
                    type="checkbox"
                    checked={props.structureOverlay}
                    onChange={(e) => props.onStructureOverlayChange(e.target.checked)}
                  />
                  골격 구조 덧씌우기 (반투명 스페이스필 + Ball &amp; Stick)
                </label>
              )}
              <label className="switch-row">
                <input
                  type="checkbox"
                  checked={props.showAtomLabels}
                  onChange={(e) => props.onShowAtomLabelsChange(e.target.checked)}
                />
                원소 기호 라벨 표시
              </label>
            </>
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
                {!isCompound && (
                  <button
                    className={props.colorMode === 'structure' ? 'active' : ''}
                    onClick={() => props.onColorModeChange('structure')}
                  >
                    2차 구조별
                  </button>
                )}
                {!isCompound && (
                  <button
                    className={props.colorMode === 'chain' ? 'active' : ''}
                    onClick={() => props.onColorModeChange('chain')}
                  >
                    체인별
                  </button>
                )}
                {isCompound && (
                  <button
                    className={props.colorMode === 'functional-group' ? 'active' : ''}
                    onClick={() => props.onColorModeChange('functional-group')}
                  >
                    작용기별
                  </button>
                )}
              </div>
              {(props.colorMode === 'structure' || props.colorMode === 'chain' || props.colorMode === 'functional-group') && (
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
                        <>
                          {/* A biological assembly (e.g. a 60-copy viral capsid) can have dozens of chains --
                              cap the legend so it doesn't dominate the sidebar; the color palette itself
                              still cycles through all of them in the 3D view. */}
                          {Object.entries(props.modelInfo.chainColors)
                            .slice(0, MAX_CHAIN_LEGEND_ITEMS)
                            .map(([chain, hex]) => (
                              <span key={chain} className="chain-legend__item">
                                <span style={{ color: `#${hex.toString(16).padStart(6, '0')}` }}>●</span> 체인 {chain}
                              </span>
                            ))}
                          {Object.keys(props.modelInfo.chainColors).length > MAX_CHAIN_LEGEND_ITEMS && (
                            <span className="chain-legend__item">
                              …외 {Object.keys(props.modelInfo.chainColors).length - MAX_CHAIN_LEGEND_ITEMS}개 (색상은 반복돼요)
                            </span>
                          )}
                        </>
                      ) : (
                        '체인 정보가 없어요.'
                      )}
                    </p>
                  )}
                  {colorLegendOpen && props.colorMode === 'functional-group' && (
                    <p className="hint chain-legend">
                      {props.modelInfo?.kind === 'pdb' && Object.keys(props.modelInfo.functionalGroupCounts).length > 0 ? (
                        (Object.entries(props.modelInfo.functionalGroupCounts) as [FunctionalGroup, number][]).map(([group, count]) => (
                          <span key={group} className="chain-legend__item">
                            <span style={{ color: `#${FUNCTIONAL_GROUP_COLORS[group].toString(16).padStart(6, '0')}` }}>●</span>{' '}
                            {FUNCTIONAL_GROUP_LABELS[group]} ({count})
                          </span>
                        ))
                      ) : (
                        '이 분자에서 인식된 작용기가 없어요. (결합 정보가 없거나 단순한 구조일 수 있어요.)'
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
        <>
          <ul className="info-list">
            {modelInfo.metadata.title && (
              <li className="info-list__wide">
                <span>이름</span>
                <strong>{modelInfo.metadata.title}</strong>
              </li>
            )}
            {modelInfo.compound?.molecularFormula && (
              <li>
                <span>분자식</span>
                <strong>{modelInfo.compound.molecularFormula}</strong>
              </li>
            )}
            {modelInfo.compound?.molecularWeight != null && (
              <li>
                <span>분자량</span>
                <strong>{modelInfo.compound.molecularWeight.toFixed(2)} g/mol</strong>
              </li>
            )}
            {modelInfo.compound?.iupacName && (
              <li className="info-list__wide">
                <span>IUPAC 이름</span>
                <strong>{modelInfo.compound.iupacName}</strong>
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
          {modelInfo.compound && !modelInfo.compound.is3d && (
            <p className="hint">
              PubChem에 이 화합물의 3D 구조가 없어서 2D 구조를 기반으로 평면에 가깝게 표시하고 있어요.
            </p>
          )}
        </>
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
