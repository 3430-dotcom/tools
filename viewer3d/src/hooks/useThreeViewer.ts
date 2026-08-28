import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { SceneManager, type Background } from '../viewer/SceneManager'
import { CrossSectionController, defaultAxisState, type Axis, type AxisState } from '../viewer/crossSection'
import { loadPDBFromText, fetchPDBById, type PDBModel, type PDBRenderMode } from '../viewer/pdb'
import { parseSTL, type STLModel } from '../viewer/stl'
import type { ModelInfo, ModelKind } from '../types'

export function useThreeViewer() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<SceneManager | null>(null)
  const crossSectionRef = useRef<CrossSectionController | null>(null)
  const materialsRef = useRef<THREE.Material[]>([])
  const pdbModelRef = useRef<PDBModel | null>(null)
  const stlModelRef = useRef<STLModel | null>(null)
  const axisStateRef = useRef<Record<Axis, AxisState>>(defaultAxisState())

  const [ready, setReady] = useState(false)
  const [modelKind, setModelKind] = useState<ModelKind>(null)
  const [modelInfo, setModelInfo] = useState<ModelInfo>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [axisState, setAxisStateState] = useState<Record<Axis, AxisState>>(defaultAxisState())
  const [renderMode, setRenderModeState] = useState<PDBRenderMode>('ball-stick')
  const [wireframe, setWireframeState] = useState(false)
  const [autoRotate, setAutoRotateState] = useState(false)
  const [background, setBackgroundState] = useState<Background>('dark')
  const [showHelpers, setShowHelpers] = useState(true)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const manager = new SceneManager()
    manager.mount(el)
    sceneRef.current = manager
    setReady(true)
    return () => {
      manager.dispose()
      sceneRef.current = null
    }
  }, [])

  const showHelpersRef = useRef(showHelpers)
  showHelpersRef.current = showHelpers

  const applyClipping = useCallback((materials: THREE.Material[], state: Record<Axis, AxisState>) => {
    crossSectionRef.current?.applyTo(materials, state)
    crossSectionRef.current?.setHelpersVisible(state, showHelpersRef.current)
  }, [])

  const installModel = useCallback(
    (object: THREE.Object3D, box: THREE.Box3, materials: THREE.Material[], capGeometry: THREE.BufferGeometry | null) => {
      const manager = sceneRef.current
      if (!manager) return
      if (crossSectionRef.current) {
        manager.scene.remove(crossSectionRef.current.helperGroup)
        crossSectionRef.current.dispose()
      }

      const wrapper = new THREE.Group()
      wrapper.add(object)

      const cs = new CrossSectionController(wrapper)
      manager.scene.add(cs.helperGroup)

      const radius = box.getBoundingSphere(new THREE.Sphere()).radius
      if (capGeometry) {
        cs.attachGeometry(capGeometry, radius)
      } else {
        cs.setRadius(radius)
      }

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
        const materials = model.group.children
          .filter((c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh)
          .map((c) => c.material as THREE.Material)
        installModel(model.group, model.box, materials, null)
        setModelKind('pdb')
        setModelInfo({ kind: 'pdb', atomCount: model.atomCount, bondCount: model.bondCount, elementCounts: model.elementCounts })
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
        setError(e instanceof Error ? e.message : 'PDB ID를 불러오지 못했습니다.')
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
        installModel(model.mesh, box, [model.mesh.material as THREE.Material], model.mesh.geometry)
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

  const setAxis = useCallback(
    (axis: Axis, patch: Partial<AxisState>) => {
      const next = { ...axisStateRef.current, [axis]: { ...axisStateRef.current[axis], ...patch } }
      axisStateRef.current = next
      setAxisStateState(next)
      applyClipping(materialsRef.current, next)
    },
    [applyClipping],
  )

  const setRenderMode = useCallback((mode: PDBRenderMode) => {
    setRenderModeState(mode)
    pdbModelRef.current?.setRenderMode(mode)
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
    wireframe,
    setWireframe,
    autoRotate,
    setAutoRotate,
    background,
    setBackground,
    showHelpers,
    toggleHelpers,
    loadFile,
    loadPDBId,
    loadSampleUrl,
    resetView,
    screenshot,
  }
}
