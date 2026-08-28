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

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files?.[0]
      if (file) viewer.loadFile(file)
    },
    [viewer],
  )

  return (
    <div className="app">
      <header className="app-header">
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
          onFile={viewer.loadFile}
          onLoadSample={viewer.loadSampleUrl}
          onLoadPdbId={viewer.loadPDBId}
          onResetView={viewer.resetView}
          onScreenshot={() => {
            const data = viewer.screenshot()
            if (data) download(data, `viewer3d-${Date.now()}.png`)
          }}
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
              <p>PDB 또는 STL 파일을 드래그 앤 드롭하거나, 왼쪽에서 샘플을 선택하세요.</p>
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
