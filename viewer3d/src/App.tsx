import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { useThreeViewer } from './hooks/useThreeViewer'
import { Sidebar } from './components/Sidebar'
import { AtomAnnotation } from './components/AtomAnnotation'

function download(dataUrl: string, filename: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
}

function App() {
  const viewer = useThreeViewer()
  const [dragOver, setDragOver] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Desktop-only "collapse the whole sidebar" toggle -- separate from
  // sidebarOpen, which drives the mobile slide-in drawer below the 860px
  // breakpoint and must keep working independently of this.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [hintVisible, setHintVisible] = useState(false)
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null)
  const draggingPlane = useRef(false)

  // Show the "click an atom" hint only briefly right after a model loads --
  // modelInfo gets a fresh object on every load, so this effect re-fires
  // per load (including reloading the same file) and not on unrelated
  // state changes like render/color mode.
  useEffect(() => {
    if (viewer.modelKind !== 'pdb' || !viewer.modelInfo) return
    setHintVisible(true)
    const timer = setTimeout(() => setHintVisible(false), 10000)
    return () => clearTimeout(timer)
  }, [viewer.modelInfo, viewer.modelKind])

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files?.[0]
      if (file) viewer.loadFile(file)
    },
    [viewer],
  )

  // On mobile the sidebar is a drawer over the canvas -- close it once a
  // model actually starts loading so the result is immediately visible.
  const loadFile = useCallback(
    (file: File) => {
      viewer.loadFile(file)
      setSidebarOpen(false)
    },
    [viewer],
  )
  const loadSampleUrl = useCallback(
    (url: string, kind: 'pdb' | 'stl') => {
      viewer.loadSampleUrl(url, kind)
      setSidebarOpen(false)
    },
    [viewer],
  )
  const loadFromInput = useCallback(
    (value: string) => {
      viewer.loadFromInput(value)
      setSidebarOpen(false)
    },
    [viewer],
  )

  return (
    <div className="app">
      <header className="app-header">
        <button
          className="menu-toggle"
          aria-label={sidebarOpen ? '메뉴 닫기' : '메뉴 열기'}
          onClick={() => setSidebarOpen((v) => !v)}
        >
          {sidebarOpen ? '✕' : '☰'}
        </button>
        <div className="brand">
          <span className="brand-mark">◈</span>
          <div>
            <h1>3D Molecule &amp; Object Viewer</h1>
            <p>PDB 단백질 구조 &amp; STL 3D 프린팅 파일을 브라우저에서 회전·단면 분석</p>
          </div>
        </div>
      </header>

      <main className="app-body">
        <Sidebar
          className={`${sidebarOpen ? 'sidebar--open' : ''} ${sidebarCollapsed ? 'sidebar--collapsed' : ''}`}
          modelKind={viewer.modelKind}
          modelInfo={viewer.modelInfo}
          axisState={viewer.axisState}
          onAxisChange={viewer.setAxis}
          renderMode={viewer.renderMode}
          onRenderModeChange={viewer.setRenderMode}
          colorMode={viewer.colorMode}
          onColorModeChange={viewer.setColorMode}
          wireframe={viewer.wireframe}
          onWireframeChange={viewer.setWireframe}
          autoRotate={viewer.autoRotate}
          onAutoRotateChange={viewer.setAutoRotate}
          background={viewer.background}
          onBackgroundChange={viewer.setBackground}
          showHelpers={viewer.showHelpers}
          onShowHelpersChange={viewer.toggleHelpers}
          showCaption={viewer.showCaption}
          onShowCaptionChange={viewer.setShowCaption}
          onFile={loadFile}
          onLoadSample={loadSampleUrl}
          onLoadFromInput={loadFromInput}
          searchResults={viewer.searchResults}
          compoundResults={viewer.compoundResults}
          searching={viewer.searching}
          onSearch={viewer.searchPDBByName}
          onResetView={viewer.resetView}
          onScreenshot={() => {
            const data = viewer.screenshot()
            if (data) download(data, `viewer3d-${Date.now()}.png`)
          }}
        />

        <button
          type="button"
          className="sidebar-collapse-btn"
          aria-label={sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
          onClick={() => setSidebarCollapsed((v) => !v)}
        >
          {sidebarCollapsed ? '▸' : '◂'}
        </button>

        <div
          className={`sidebar-backdrop ${sidebarOpen ? 'sidebar-backdrop--visible' : ''}`}
          onClick={() => setSidebarOpen(false)}
        />

        <div
          className={`viewport ${dragOver ? 'viewport--drag' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <div
            className="canvas-host"
            ref={viewer.containerRef}
            onPointerDown={(e) => {
              pointerDownPos.current = { x: e.clientX, y: e.clientY }
              // Grabbing a cut plane's own handle takes over this gesture
              // entirely -- orbiting is disabled for the duration (see
              // startPlaneDrag) and the click-vs-drag pick logic below is
              // skipped so an atom/bond doesn't also get picked underneath.
              draggingPlane.current = viewer.startPlaneDrag(e.clientX, e.clientY)
              if (draggingPlane.current) e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
              if (draggingPlane.current) viewer.updatePlaneDrag(e.clientX, e.clientY)
            }}
            onPointerUp={(e) => {
              if (draggingPlane.current) {
                draggingPlane.current = false
                pointerDownPos.current = null
                viewer.endPlaneDrag()
                return
              }
              const down = pointerDownPos.current
              pointerDownPos.current = null
              // Only treat this as a pick if the pointer barely moved --
              // otherwise every orbit-drag would also try to select something.
              if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) {
                viewer.pickTarget(e.clientX, e.clientY)
              }
            }}
            onPointerCancel={() => {
              if (draggingPlane.current) {
                draggingPlane.current = false
                viewer.endPlaneDrag()
              }
              pointerDownPos.current = null
            }}
          />

          {viewer.showCaption &&
            viewer.modelInfo?.kind === 'pdb' &&
            (viewer.modelInfo.metadata.title || viewer.modelInfo.metadata.organism) && (
            <div className="viewport-caption">
              {viewer.modelInfo.metadata.title && <div className="viewport-caption__title">{viewer.modelInfo.metadata.title}</div>}
              {viewer.modelInfo.metadata.organism && (
                <div className="viewport-caption__sub">{viewer.modelInfo.metadata.organism}</div>
              )}
            </div>
          )}

          {viewer.selection && (
            <AtomAnnotation selection={viewer.selection} getScreenPosition={viewer.getScreenPosition} onClose={viewer.clearSelection} />
          )}

          {!viewer.modelKind && !viewer.status && (
            <div className="empty-state">
              <p>PDB 또는 STL 파일을 드래그 앤 드롭하거나, 메뉴에서 샘플을 선택하세요.</p>
            </div>
          )}

          {viewer.modelInfo?.kind === 'pdb' && viewer.renderMode === 'cartoon' && !viewer.modelInfo.hasCartoon && (
            <div className="empty-state">
              <p>
                이 파일에는 단백질 골격(연속된 CA 원자)이 없어 카툰으로 표시할 게 없어요. 작은 분자는 Ball &amp; Stick
                또는 Spacefill을 사용해보세요.
              </p>
            </div>
          )}

          {viewer.modelKind === 'pdb' && !viewer.selection && hintVisible && (
            <div className="viewport-hint">원자나 결합을 클릭하면 정보가 표시됩니다</div>
          )}

          {viewer.status && <div className="status-toast">{viewer.status}</div>}
          {viewer.error && <div className="status-toast status-toast--error">{viewer.error}</div>}

          <div className="drag-hint">파일을 여기에 놓으세요</div>
        </div>
      </main>
    </div>
  )
}

export default App
