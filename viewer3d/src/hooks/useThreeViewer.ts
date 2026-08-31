import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { SceneManager, type Background } from '../viewer/SceneManager'
import { CrossSectionController, defaultAxisState, AXES, AXIS_NORMALS, type Axis, type AxisState, type CapSource } from '../viewer/crossSection'
import {
  loadPDBFromText,
  fetchPDBById,
  searchPDB,
  BOND_COLOR_HEX,
  type AtomDetail,
  type PDBColorMode,
  type PDBModel,
  type PDBRenderMode,
  type PDBSearchResult,
} from '../viewer/pdb'
import { parseSTL, type STLModel } from '../viewer/stl'
import type { ModelInfo, ModelKind } from '../types'

/** True for a raw browser fetch failure (CORS block, DNS, offline) as opposed to an app-thrown error with a real message. */
function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError
}

/** The atom-click info shown as a viewport annotation: AtomDetail plus what's needed to anchor/describe it in-scene. */
export interface SelectedAtomInfo extends AtomDetail {
  kind: 'atom'
  index: number
  position: THREE.Vector3
  bondCount: number
}

/** The bond-click info shown as a viewport annotation: its two endpoint atoms plus its length, anchored at its midpoint. */
export interface SelectedBondInfo {
  kind: 'bond'
  index: number
  position: THREE.Vector3
  /** Bond length in Angstroms (PDB coordinates are already in that unit). */
  length: number
  atomA: AtomDetail
  atomB: AtomDetail
}

export type Selection = SelectedAtomInfo | SelectedBondInfo

/**
 * Which meshes should count toward the generic (flat, single-color) stencil
 * cap for a given PDB render mode. Atoms are deliberately excluded here --
 * PDBModel.updateAtomCaps builds an exact, per-atom-colored disc cap for
 * them instead, so a cut spacefill/ball-stick model reads as each atom's
 * own color rather than one flat accent color smeared across all of them.
 * Bonds still use the generic flat cap (colored to match the bond's own
 * gray, see BOND_COLOR_HEX) since a cut bond's cross-section is a small
 * ellipse we don't compute exactly. Cartoon ribbons aren't closed solids,
 * so they get plane clipping only.
 */
function pdbCapSources(model: PDBModel, mode: PDBRenderMode): CapSource[] | null {
  if (mode === 'ball-stick') return [model.bondMesh]
  return null
}

export function useThreeViewer() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<SceneManager | null>(null)
  const crossSectionRef = useRef<CrossSectionController | null>(null)
  const materialsRef = useRef<THREE.Material[]>([])
  const pdbModelRef = useRef<PDBModel | null>(null)
  const stlModelRef = useRef<STLModel | null>(null)
  const axisStateRef = useRef<Record<Axis, AxisState>>(defaultAxisState())
  const radiusRef = useRef(1)
  const planeDragRef = useRef<{
    axis: Axis
    startOffset: number
    startMouse: { x: number; y: number }
    screenAxisDir: { x: number; y: number }
    pixelsPerWorldUnit: number
  } | null>(null)

  const [ready, setReady] = useState(false)
  const [modelKind, setModelKind] = useState<ModelKind>(null)
  const [modelInfo, setModelInfo] = useState<ModelInfo>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [axisState, setAxisStateState] = useState<Record<Axis, AxisState>>(defaultAxisState())
  const [renderMode, setRenderModeState] = useState<PDBRenderMode>('spacefill')
  const [colorMode, setColorModeState] = useState<PDBColorMode>('element')
  const [wireframe, setWireframeState] = useState(false)
  const [autoRotate, setAutoRotateState] = useState(false)
  const [background, setBackgroundState] = useState<Background>('dark')
  const [showHelpers, setShowHelpers] = useState(true)
  const [showCaption, setShowCaption] = useState(true)
  const [searchResults, setSearchResults] = useState<PDBSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selection, setSelection] = useState<Selection | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const manager = new SceneManager()
    manager.setErrorHandler((err) => {
      console.error('Render loop error:', err)
      setError(`3D 렌더링 중 오류가 발생했습니다: ${err instanceof Error ? err.message : String(err)}`)
      setStatus(null)
    })
    manager.mount(el)
    sceneRef.current = manager
    setReady(true)
    return () => {
      manager.dispose()
      sceneRef.current = null
    }
  }, [])

  // Last-resort net: without this, an error thrown outside our own
  // try/catch blocks (a stray event handler, an unhandled promise
  // rejection) fails completely silently -- no banner, no console access
  // on a locked-down browser, nothing. Force it onto the screen instead.
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      console.error('Unhandled error:', e.error ?? e.message)
      setError(`예상치 못한 오류가 발생했습니다: ${e.message}`)
    }
    const onRejection = (e: PromiseRejectionEvent) => {
      console.error('Unhandled rejection:', e.reason)
      const reason = e.reason instanceof Error ? e.reason.message : String(e.reason)
      setError(`예상치 못한 오류가 발생했습니다: ${reason}`)
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  const showHelpersRef = useRef(showHelpers)
  showHelpersRef.current = showHelpers

  const applyClipping = useCallback((materials: THREE.Material[], state: Record<Axis, AxisState>) => {
    crossSectionRef.current?.applyTo(materials, state)
    crossSectionRef.current?.setHelpersVisible(state, showHelpersRef.current)
  }, [])

  const installModel = useCallback(
    (
      object: THREE.Object3D,
      box: THREE.Box3,
      materials: THREE.Material[],
      capSources: CapSource | CapSource[] | null,
      capColor?: THREE.ColorRepresentation,
    ) => {
      const manager = sceneRef.current
      if (!manager) return
      setSelection(null)
      if (crossSectionRef.current) {
        manager.scene.remove(crossSectionRef.current.helperGroup)
        crossSectionRef.current.dispose()
      }

      const wrapper = new THREE.Group()
      wrapper.add(object)

      const cs = new CrossSectionController(wrapper)
      manager.scene.add(cs.helperGroup)

      const radius = box.getBoundingSphere(new THREE.Sphere()).radius
      radiusRef.current = radius
      cs.attachGeometry(capSources, radius, capColor)

      const resetAxis = defaultAxisState()
      cs.applyTo(materials, resetAxis)
      cs.setHelpersVisible(resetAxis, showHelpersRef.current)

      manager.setModel(wrapper)
      manager.frameObject(box)

      crossSectionRef.current = cs
      materialsRef.current = materials
      axisStateRef.current = resetAxis
      setAxisStateState(resetAxis)
    },
    [],
  )

  const loadPDBText = useCallback(
    async (text: string) => {
      setError(null)
      setStatus('PDB 구조 분석 중...')
      try {
        const model = await loadPDBFromText(text, renderMode)
        pdbModelRef.current = model
        stlModelRef.current = null
        setColorModeState('element')
        const materials = model.group.children
          .filter((c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh)
          .map((c) => c.material as THREE.Material)
        installModel(model.group, model.box, materials, pdbCapSources(model, renderMode), BOND_COLOR_HEX)
        if (crossSectionRef.current) model.updateAtomCaps(crossSectionRef.current.planes, axisStateRef.current)
        setModelKind('pdb')
        setModelInfo({
          kind: 'pdb',
          atomCount: model.atomCount,
          bondCount: model.bondCount,
          elementCounts: model.elementCounts,
          metadata: model.metadata,
          hasCartoon: model.hasCartoon,
        })
        setStatus(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'PDB 파일을 불러오지 못했습니다.')
        setStatus(null)
      }
    },
    [installModel, renderMode],
  )

  const loadPDBId = useCallback(
    async (id: string) => {
      setError(null)
      setStatus(`RCSB에서 ${id.toUpperCase()} 다운로드 중...`)
      try {
        const text = await fetchPDBById(id)
        await loadPDBText(text)
      } catch (e) {
        setError(
          isNetworkError(e)
            ? 'RCSB 서버에 연결할 수 없습니다 (브라우저 CORS 정책이거나 네트워크 문제일 수 있어요).'
            : e instanceof Error
              ? e.message
              : 'PDB ID를 불러오지 못했습니다.',
        )
        setStatus(null)
      }
    },
    [loadPDBText],
  )

  const loadSTLBuffer = useCallback(
    (buffer: ArrayBuffer) => {
      setError(null)
      setStatus('STL 메시 분석 중...')
      try {
        const model = parseSTL(buffer)
        stlModelRef.current = model
        pdbModelRef.current = null
        if (wireframe) (model.mesh.material as THREE.MeshStandardMaterial).wireframe = true
        const box = new THREE.Box3().setFromObject(model.mesh)
        installModel(model.mesh, box, [model.mesh.material as THREE.Material], model.mesh, (model.mesh.material as THREE.MeshStandardMaterial).color)
        setModelKind('stl')
        setModelInfo({
          kind: 'stl',
          triangleCount: model.triangleCount,
          size: { x: model.size.x, y: model.size.y, z: model.size.z },
          volumeMm3: model.volumeMm3,
        })
        setStatus(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'STL 파일을 불러오지 못했습니다.')
        setStatus(null)
      }
    },
    [installModel, wireframe],
  )

  const loadFile = useCallback(
    async (file: File) => {
      const lower = file.name.toLowerCase()
      if (lower.endsWith('.stl')) {
        const buffer = await file.arrayBuffer()
        loadSTLBuffer(buffer)
      } else if (lower.endsWith('.pdb') || lower.endsWith('.ent')) {
        const text = await file.text()
        await loadPDBText(text)
      } else {
        setError('지원하지 않는 파일 형식입니다. .pdb 또는 .stl 파일을 사용하세요.')
      }
    },
    [loadPDBText, loadSTLBuffer],
  )

  const loadSampleUrl = useCallback(
    async (url: string, kind: 'pdb' | 'stl') => {
      setError(null)
      setStatus('샘플 불러오는 중...')
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`샘플을 불러오지 못했습니다 (${res.status})`)
        if (kind === 'stl') {
          loadSTLBuffer(await res.arrayBuffer())
        } else {
          await loadPDBText(await res.text())
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '샘플을 불러오지 못했습니다.')
        setStatus(null)
      }
    },
    [loadPDBText, loadSTLBuffer],
  )

  const loadFromUrl = useCallback(
    async (url: string) => {
      const lower = url.toLowerCase()
      const kind = lower.endsWith('.stl') ? 'stl' : lower.endsWith('.pdb') || lower.endsWith('.ent') ? 'pdb' : null
      if (!kind) {
        setError('URL은 .pdb 또는 .stl 파일을 직접 가리켜야 합니다.')
        return
      }
      setError(null)
      setStatus('URL에서 불러오는 중...')
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`파일을 불러오지 못했습니다 (${res.status})`)
        if (kind === 'stl') {
          loadSTLBuffer(await res.arrayBuffer())
        } else {
          await loadPDBText(await res.text())
        }
      } catch (e) {
        // A failed fetch here is almost always the source site not sending
        // CORS headers for cross-origin requests -- the browser blocks it
        // before we ever see a real HTTP status.
        setError(
          isNetworkError(e)
            ? '이 주소는 브라우저에서 직접 불러올 수 없습니다 (CORS 정책). 파일을 다운로드한 뒤 "파일 열기"로 업로드해보세요.'
            : (e as Error).message,
        )
        setStatus(null)
      }
    },
    [loadPDBText, loadSTLBuffer],
  )

  const loadFromInput = useCallback(
    async (value: string) => {
      const trimmed = value.trim()
      if (/^https?:\/\//i.test(trimmed)) {
        await loadFromUrl(trimmed)
      } else if (/^[0-9][a-zA-Z0-9]{3}$/.test(trimmed)) {
        await loadPDBId(trimmed)
      } else {
        setError('PDB ID(예: 1CRN) 또는 .pdb/.stl 파일의 URL을 입력하세요.')
      }
    },
    [loadFromUrl, loadPDBId],
  )

  const searchPDBByName = useCallback(async (query: string) => {
    const trimmed = query.trim()
    if (!trimmed) {
      setSearchResults([])
      return
    }
    setSearching(true)
    setError(null)
    try {
      const results = await searchPDB(trimmed)
      setSearchResults(results)
      if (results.length === 0) setError(`"${trimmed}"에 대한 검색 결과가 없습니다.`)
    } catch (e) {
      setSearchResults([])
      setError(isNetworkError(e) ? 'RCSB 검색 서버에 연결할 수 없습니다. 네트워크 상태를 확인해주세요.' : (e as Error).message)
    } finally {
      setSearching(false)
    }
  }, [])

  const setAxis = useCallback(
    (axis: Axis, patch: Partial<AxisState>) => {
      const next = { ...axisStateRef.current, [axis]: { ...axisStateRef.current[axis], ...patch } }
      axisStateRef.current = next
      setAxisStateState(next)
      applyClipping(materialsRef.current, next)
      // Only this axis's discs can have changed -- recomputing all three on
      // every slider tick would be wasted work on large models.
      if (crossSectionRef.current) pdbModelRef.current?.updateAtomCaps(crossSectionRef.current.planes, next, axis)
    },
    [applyClipping],
  )

  const setRenderMode = useCallback(
    (mode: PDBRenderMode) => {
      setRenderModeState(mode)
      const model = pdbModelRef.current
      if (!model) return
      model.setRenderMode(mode)
      // Ball-and-stick vs. spacefill draw a different solid (bonds included
      // or not), so the cross-section cap has to be rebuilt for the new
      // mode -- otherwise a mode switch keeps capping whatever solid was
      // loaded first while clipping planes silently apply to the new one.
      crossSectionRef.current?.attachGeometry(pdbCapSources(model, mode), radiusRef.current, BOND_COLOR_HEX)
      applyClipping(materialsRef.current, axisStateRef.current)
      // Atom radius depends on render mode (spacefill vs. ball-and-stick),
      // which changes where the plane intersects each atom's sphere.
      if (crossSectionRef.current) model.updateAtomCaps(crossSectionRef.current.planes, axisStateRef.current)
      // Cartoon ribbon materials never receive clipping planes (see
      // pdbCapSources), so the cut guide planes would float there doing
      // nothing -- keep them hidden while in cartoon mode regardless of the
      // showHelpers setting, restoring on the next mode switch.
      if (mode === 'cartoon') crossSectionRef.current?.setHelpersVisible(axisStateRef.current, false)
      // Atoms and bonds aren't rendered in cartoon mode, so a lingering
      // selection would leave the annotation pointing at nothing visible.
      // Safe to call unconditionally -- a no-op if nothing was selected.
      if (mode === 'cartoon') {
        model.setSelectedAtom(null)
        model.setSelectedBond(null)
        setSelection(null)
      }
    },
    [applyClipping],
  )

  const setColorMode = useCallback((mode: PDBColorMode) => {
    setColorModeState(mode)
    const model = pdbModelRef.current
    model?.setColorMode(mode)
    // The disc caps' colors are read from each atom's current display
    // color, which just changed.
    if (model && crossSectionRef.current) model.updateAtomCaps(crossSectionRef.current.planes, axisStateRef.current)
  }, [])

  const setWireframe = useCallback((value: boolean) => {
    setWireframeState(value)
    const mat = stlModelRef.current?.mesh.material as THREE.MeshStandardMaterial | undefined
    if (mat) mat.wireframe = value
  }, [])

  const setAutoRotate = useCallback((value: boolean) => {
    setAutoRotateState(value)
    sceneRef.current?.setAutoRotate(value)
  }, [])

  const setBackground = useCallback((mode: Background) => {
    setBackgroundState(mode)
    sceneRef.current?.setBackground(mode)
  }, [])

  const toggleHelpers = useCallback(
    (value: boolean) => {
      setShowHelpers(value)
      showHelpersRef.current = value
      crossSectionRef.current?.setHelpersVisible(axisStateRef.current, value)
    },
    [],
  )

  const resetView = useCallback(() => {
    const manager = sceneRef.current
    const kind = pdbModelRef.current ? 'pdb' : stlModelRef.current ? 'stl' : null
    if (!manager || !kind) return
    const box =
      kind === 'pdb'
        ? pdbModelRef.current!.box
        : new THREE.Box3().setFromObject(stlModelRef.current!.mesh)
    manager.frameObject(box)
  }, [])

  const screenshot = useCallback(() => sceneRef.current?.screenshot() ?? null, [])

  /** Picks whichever of an atom or a bond is closer to the camera under this viewport coordinate. */
  const pickTarget = useCallback((clientX: number, clientY: number) => {
    const manager = sceneRef.current
    const model = pdbModelRef.current
    if (!manager || !model) return
    const hit = manager.pickNearest(clientX, clientY, [model.atomMesh, model.bondMesh])

    if (!hit) {
      model.setSelectedAtom(null)
      model.setSelectedBond(null)
      setSelection(null)
      return
    }

    if (hit.mesh === model.atomMesh) {
      const index = hit.instanceId
      model.setSelectedBond(null)
      model.setSelectedAtom(index)
      setSelection({
        kind: 'atom',
        ...model.atomDetails[index],
        index,
        position: model.positions[index].clone(),
        bondCount: model.bondsForAtom(index).length,
      })
    } else {
      const index = hit.instanceId
      const [a, b] = model.bondAtomIndices[index]
      const posA = model.positions[a]
      const posB = model.positions[b]
      model.setSelectedAtom(null)
      model.setSelectedBond(index)
      setSelection({
        kind: 'bond',
        index,
        position: posA.clone().add(posB).multiplyScalar(0.5),
        length: posA.distanceTo(posB),
        atomA: model.atomDetails[a],
        atomB: model.atomDetails[b],
      })
    }
  }, [])

  const clearSelection = useCallback(() => {
    const model = pdbModelRef.current
    model?.setSelectedAtom(null)
    model?.setSelectedBond(null)
    setSelection(null)
  }, [])

  /** Projects a world-space point (e.g. the selected atom's position) to viewport-relative pixel coordinates. */
  const getScreenPosition = useCallback((pos: THREE.Vector3) => sceneRef.current?.projectToScreen(pos) ?? null, [])

  /**
   * If this viewport coordinate hits one of the currently-enabled axes' cut
   * planes, starts dragging that plane's offset and returns true (so the
   * caller can skip its usual click/orbit handling for this gesture).
   *
   * The drag itself works by comparing screen-space movement against how
   * far, in pixels, moving the plane by one full world unit along its own
   * normal would move it on screen at the current camera angle/zoom --
   * i.e. it projects two reference points (the plane's current position and
   * one unit further along its normal) to get a pixel-per-world-unit scale
   * and a 2D screen direction, then every subsequent mouse position is
   * projected onto that 2D direction to get how far along the plane's own
   * axis the mouse has moved. This tracks correctly regardless of viewing
   * angle, without needing a full 3D ray/ray closest-point solve.
   */
  const startPlaneDrag = useCallback((clientX: number, clientY: number): boolean => {
    const manager = sceneRef.current
    const cs = crossSectionRef.current
    if (!manager || !cs) return false

    const state = axisStateRef.current
    const enabledAxes = AXES.filter((a) => state[a].enabled)
    if (enabledAxes.length === 0) return false

    const hitObj = manager.pickObject(
      clientX,
      clientY,
      enabledAxes.map((a) => cs.dragHandles[a]),
    )
    if (!hitObj) return false
    const axis = enabledAxes.find((a) => cs.dragHandles[a] === hitObj)
    if (!axis) return false

    const radius = radiusRef.current
    const moveDir = AXIS_NORMALS[axis].clone().negate()
    const startOffset = state[axis].offset
    const basePoint = moveDir.clone().multiplyScalar(startOffset * radius)
    const refPoint = basePoint.clone().addScaledVector(moveDir, radius)
    const p0 = manager.projectToScreen(basePoint)
    const p1 = manager.projectToScreen(refPoint)
    if (!p0 || !p1) return false

    const dx = p1.x - p0.x
    const dy = p1.y - p0.y
    const screenDist = Math.hypot(dx, dy)
    // Looking nearly straight down this axis -- moving it can't visibly
    // project onto the screen, so a drag couldn't track it meaningfully.
    if (screenDist < 1e-3) return false

    planeDragRef.current = {
      axis,
      startOffset,
      startMouse: { x: clientX, y: clientY },
      screenAxisDir: { x: dx / screenDist, y: dy / screenDist },
      pixelsPerWorldUnit: screenDist / radius,
    }
    manager.controls.enabled = false
    return true
  }, [])

  const updatePlaneDrag = useCallback(
    (clientX: number, clientY: number) => {
      const drag = planeDragRef.current
      if (!drag) return
      const dx = clientX - drag.startMouse.x
      const dy = clientY - drag.startMouse.y
      const alongAxisPixels = dx * drag.screenAxisDir.x + dy * drag.screenAxisDir.y
      const deltaOffset = alongAxisPixels / drag.pixelsPerWorldUnit / radiusRef.current
      const newOffset = Math.min(1, Math.max(-1, drag.startOffset + deltaOffset))
      setAxis(drag.axis, { offset: newOffset })
    },
    [setAxis],
  )

  const endPlaneDrag = useCallback(() => {
    if (!planeDragRef.current) return
    planeDragRef.current = null
    if (sceneRef.current) sceneRef.current.controls.enabled = true
  }, [])

  return {
    containerRef,
    ready,
    modelKind,
    modelInfo,
    status,
    error,
    axisState,
    setAxis,
    renderMode,
    setRenderMode,
    colorMode,
    setColorMode,
    wireframe,
    setWireframe,
    autoRotate,
    setAutoRotate,
    background,
    setBackground,
    showHelpers,
    toggleHelpers,
    showCaption,
    setShowCaption,
    loadFile,
    loadFromInput,
    loadSampleUrl,
    searchResults,
    searching,
    searchPDBByName,
    selection,
    pickTarget,
    clearSelection,
    getScreenPosition,
    startPlaneDrag,
    updatePlaneDrag,
    endPlaneDrag,
    resetView,
    screenshot,
  }
}
