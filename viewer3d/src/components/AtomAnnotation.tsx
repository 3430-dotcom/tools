import { useEffect, useRef } from 'react'
import type * as THREE from 'three'
import type { SelectedAtomInfo } from '../hooks/useThreeViewer'

interface Props {
  atom: SelectedAtomInfo
  getScreenPosition: (pos: THREE.Vector3) => { x: number; y: number; visible: boolean } | null
  onClose: () => void
}

const LABEL_OFFSET_X = 26
const LABEL_OFFSET_Y = -18
const EDGE_MARGIN = 8

/**
 * Floats the picked atom's info next to its own position in the 3D view
 * instead of a fixed viewport corner, connected by a small leader line. The
 * atom's world position never changes after picking (the model itself never
 * moves), so only its *screen* position needs updating -- this re-projects
 * it every animation frame to track camera orbit/zoom, writing directly to
 * DOM refs rather than React state so following the camera stays smooth
 * and doesn't re-render the rest of the app 60 times a second.
 */
export function AtomAnnotation({ atom, getScreenPosition, onClose }: Props) {
  const dotRef = useRef<HTMLDivElement | null>(null)
  const labelRef = useRef<HTMLDivElement | null>(null)
  const lineRef = useRef<SVGLineElement | null>(null)

  useEffect(() => {
    let frameId = 0

    const tick = () => {
      const dot = dotRef.current
      const label = labelRef.current
      const line = lineRef.current
      const screen = dot && label && line ? getScreenPosition(atom.position) : null

      if (dot && label && line) {
        if (!screen || !screen.visible) {
          dot.style.opacity = '0'
          label.style.opacity = '0'
          line.style.opacity = '0'
        } else {
          const container = dot.parentElement
          let lx = screen.x + LABEL_OFFSET_X
          let ly = screen.y + LABEL_OFFSET_Y
          if (container) {
            lx = Math.min(Math.max(lx, EDGE_MARGIN), container.clientWidth - label.offsetWidth - EDGE_MARGIN)
            ly = Math.min(Math.max(ly, EDGE_MARGIN), container.clientHeight - label.offsetHeight - EDGE_MARGIN)
          }
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
  }, [atom, getScreenPosition])

  return (
    <>
      <svg className="atom-annotation-lines" aria-hidden="true">
        <line ref={lineRef} className="atom-annotation__line" />
      </svg>
      <div className="atom-annotation__dot" ref={dotRef} />
      <div className="atom-annotation" ref={labelRef}>
        <button className="atom-annotation__close" onClick={onClose} aria-label="닫기">
          ✕
        </button>
        <div className="atom-annotation__element">{atom.element}</div>
        <ul className="atom-annotation__detail">
          <li>
            <span>원자</span>
            <strong>{atom.atomName || '-'}</strong>
          </li>
          <li>
            <span>잔기</span>
            <strong>
              {atom.resName} {atom.resSeq}
            </strong>
          </li>
          <li>
            <span>사슬</span>
            <strong>{atom.chain}</strong>
          </li>
          {atom.bondCount > 0 && (
            <li>
              <span>결합</span>
              <strong>{atom.bondCount}개</strong>
            </li>
          )}
        </ul>
      </div>
    </>
  )
}
