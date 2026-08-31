import { useEffect, useRef } from 'react'
import type * as THREE from 'three'
import type { Selection } from '../hooks/useThreeViewer'

interface Props {
  selection: Selection
  getScreenPosition: (pos: THREE.Vector3) => { x: number; y: number; visible: boolean } | null
  onClose: () => void
}

// How far the label sits from the thing it describes. Fixed-direction
// offsets (e.g. always up-right) tend to land the card right on top of the
// model when the pick is itself up-right of screen center -- pushing
// radially *away* from the viewport center instead means the label moves
// toward open space more often, since the model is usually roughly centered.
const OFFSET_DISTANCE = 90
const CENTER_DEAD_ZONE = 24 // px; below this, radial direction is too noisy to trust
const FALLBACK_DIR = { x: 0.6, y: -0.8 } // up-right, used when the pick is near dead-center
const EDGE_MARGIN = 8

/**
 * Floats the picked atom/bond's info next to its own position in the 3D
 * view instead of a fixed viewport corner, connected by a small leader
 * line. The world position never changes after picking (the model itself
 * never moves), so only the *screen* position needs updating -- this
 * re-projects it every animation frame to track camera orbit/zoom, writing
 * directly to DOM refs rather than React state so following the camera
 * stays smooth and doesn't re-render the rest of the app 60 times a second.
 */
export function AtomAnnotation({ selection, getScreenPosition, onClose }: Props) {
  const dotRef = useRef<HTMLDivElement | null>(null)
  const labelRef = useRef<HTMLDivElement | null>(null)
  const lineRef = useRef<SVGLineElement | null>(null)

  // Offset (in px, relative to the atom's own screen position) the label is
  // currently drawn at. Auto-computed every frame (radially away from
  // viewport center) until the user drags the card, at which point the drag
  // takes over as the source of truth; either way this ref always holds the
  // last *rendered* offset, which a new drag starts from. Resets to
  // auto-placement whenever a new atom/bond is picked.
  const offsetRef = useRef({ x: 0, y: 0 })
  const manualOffsetRef = useRef<{ x: number; y: number } | null>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; baseX: number; baseY: number } | null>(null)

  useEffect(() => {
    manualOffsetRef.current = null
  }, [selection])

  useEffect(() => {
    let frameId = 0

    const tick = () => {
      const dot = dotRef.current
      const label = labelRef.current
      const line = lineRef.current
      const screen = dot && label && line ? getScreenPosition(selection.position) : null

      if (dot && label && line) {
        if (!screen || !screen.visible) {
          dot.style.opacity = '0'
          label.style.opacity = '0'
          line.style.opacity = '0'
        } else {
          const container = dot.parentElement
          let ox: number
          let oy: number
          if (manualOffsetRef.current) {
            ox = manualOffsetRef.current.x
            oy = manualOffsetRef.current.y
          } else {
            const cx = container ? container.clientWidth / 2 : screen.x
            const cy = container ? container.clientHeight / 2 : screen.y
            const dx = screen.x - cx
            const dy = screen.y - cy
            const centerDist = Math.hypot(dx, dy)
            const dir = centerDist < CENTER_DEAD_ZONE ? FALLBACK_DIR : { x: dx / centerDist, y: dy / centerDist }
            ox = dir.x * OFFSET_DISTANCE
            oy = dir.y * OFFSET_DISTANCE
          }

          let lx = screen.x + ox
          let ly = screen.y + oy
          if (container) {
            lx = Math.min(Math.max(lx, EDGE_MARGIN), container.clientWidth - label.offsetWidth - EDGE_MARGIN)
            ly = Math.min(Math.max(ly, EDGE_MARGIN), container.clientHeight - label.offsetHeight - EDGE_MARGIN)
          }
          offsetRef.current = { x: lx - screen.x, y: ly - screen.y }

          dot.style.opacity = '1'
          dot.style.transform = `translate(${screen.x}px, ${screen.y}px)`
          label.style.opacity = '1'
          label.style.transform = `translate(${lx}px, ${ly}px)`
          line.style.opacity = '1'
          line.setAttribute('x1', String(screen.x))
          line.setAttribute('y1', String(screen.y))
          line.setAttribute('x2', String(lx))
          line.setAttribute('y2', String(ly))
        }
      }

      frameId = requestAnimationFrame(tick)
    }

    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [selection, getScreenPosition])

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.atom-annotation__close')) return
    labelRef.current?.setPointerCapture(e.pointerId)
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, baseX: offsetRef.current.x, baseY: offsetRef.current.y }
  }
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    manualOffsetRef.current = { x: drag.baseX + (e.clientX - drag.startX), y: drag.baseY + (e.clientY - drag.startY) }
  }
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null
  }

  return (
    <>
      <svg className="atom-annotation-lines" aria-hidden="true">
        <line ref={lineRef} className="atom-annotation__line" />
      </svg>
      <div className="atom-annotation__dot" ref={dotRef} />
      <div
        className="atom-annotation"
        ref={labelRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <button className="atom-annotation__close" onClick={onClose} aria-label="닫기">
          ✕
        </button>
        {selection.kind === 'atom' ? (
          <>
            <div className="atom-annotation__element">{selection.element}</div>
            <ul className="atom-annotation__detail">
              <li>
                <span>원자</span>
                <strong>{selection.atomName || '-'}</strong>
              </li>
              <li>
                <span>잔기</span>
                <strong>
                  {selection.resName} {selection.resSeq}
                </strong>
              </li>
              <li>
                <span>사슬</span>
                <strong>{selection.chain}</strong>
              </li>
              {selection.bondCount > 0 && (
                <li>
                  <span>결합</span>
                  <strong>{selection.bondCount}개</strong>
                </li>
              )}
            </ul>
          </>
        ) : (
          <>
            <div className="atom-annotation__element">
              {selection.atomA.element}–{selection.atomB.element} 결합
            </div>
            <ul className="atom-annotation__detail">
              <li>
                <span>원자 A</span>
                <strong>
                  {selection.atomA.atomName || selection.atomA.element} ({selection.atomA.resName} {selection.atomA.resSeq})
                </strong>
              </li>
              <li>
                <span>원자 B</span>
                <strong>
                  {selection.atomB.atomName || selection.atomB.element} ({selection.atomB.resName} {selection.atomB.resSeq})
                </strong>
              </li>
              <li>
                <span>길이</span>
                <strong>{selection.length.toFixed(2)} Å</strong>
              </li>
            </ul>
          </>
        )}
      </div>
    </>
  )
}
