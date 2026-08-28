import { useCallback, useState } from 'react'
import './App.css'
import { useThreeViewer } from './hooks/useThreeViewer'
import { Sidebar } from './components/Sidebar'

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
          className={sidebarOpen ? 'sidebar--open' : ''}
          modelKind={viewer.modelKind}
          modelInfo={viewer.modelInfo}
          axisState={viewer.axisState}
          onAxisChange={viewer.setAxis}
          renderMode={viewer.renderMode}
          onRenderModeChange={viewer.setRenderMode}
          wireframe={viewer.wireframe}
          onWireframeChange={viewer.setWireframe}
          autoRotate={viewer.autoRotate}
          onAutoRotateChange={viewer.setAutoRotate}
          background={viewer.background}
          onBackgroundChange={viewer.setBackground}
          showHelpers={viewer.showHelpers}
          onShowHelpersChange={viewer.toggleHelpers}
          onFile={loadFile}
          onLoadSample={loadSampleUrl}
          onLoadFromInput={loadFromInput}
          searchResults={viewer.searchResults}
          searching={viewer.searching}
          onSearch={viewer.searchPDBByName}
          onResetView={viewer.resetView}
          onScreenshot={() => {
            const data = viewer.screenshot()
            if (data) download(data, `viewer3d-${Date.now()}.png`)
          }}
        />

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
          <div className="canvas-host" ref={viewer.containerRef} />

          {!viewer.modelKind && !viewer.status && (
            <div className="empty-state">
              <p>PDB 또는 STL 파일을 드래그 앤 드롭하거나, 메뉴에서 샘플을 선택하세요.</p>
            </div>
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
