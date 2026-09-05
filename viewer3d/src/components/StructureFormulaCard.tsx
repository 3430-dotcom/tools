import { useRef, useState } from 'react'
import { pubchemDepictionUrl } from '../viewer/pubchem'

interface Props {
  /** The compound name (see CompoundInfo.name / PDBInfo.depictionName) PubChem's flat-depiction PNG is fetched under. */
  name: string
  onClose: () => void
}

const SMALL_WIDTH = 200
const LARGE_WIDTH = 340

/**
 * A small reference card showing PubChem's own flat 2D structure drawing
 * alongside the 3D model -- the 3D formula overlay (see PDBModel.setFormulaOverlay)
 * is drawn in-scene instead of this image because a flat drawing's
 * coordinates don't correspond to the rotating 3D atom positions, but the
 * familiar PubChem-style picture is still useful as a side-by-side reference.
 *
 * Draggable like AtomAnnotation, but simpler: this card isn't anchored to a
 * moving 3D point, so a plain "write the new position on pointer move" drag
 * is enough -- no need for AtomAnnotation's per-frame re-projection loop.
 */
export function StructureFormulaCard({ name, onClose }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [large, setLarge] = useState(false)
  const [failed, setFailed] = useState(false)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; baseX: number; baseY: number } | null>(null)

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.structure-formula-card__btn')) return
    const card = cardRef.current
    if (!card) return
    card.setPointerCapture(e.pointerId)
    const rect = card.getBoundingClientRect()
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, baseX: rect.left, baseY: rect.top }
  }
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    const card = cardRef.current
    if (!drag || drag.pointerId !== e.pointerId || !card) return
    card.style.left = `${drag.baseX + (e.clientX - drag.startX)}px`
    card.style.top = `${drag.baseY + (e.clientY - drag.startY)}px`
    card.style.right = 'auto'
    card.style.bottom = 'auto'
  }
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null
  }

  return (
    <div
      className="structure-formula-card"
      ref={cardRef}
      style={{ width: large ? LARGE_WIDTH : SMALL_WIDTH }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="structure-formula-card__header">
        <span className="structure-formula-card__title">평면 구조식</span>
        <div className="structure-formula-card__actions">
          <button
            type="button"
            className="structure-formula-card__btn"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? '펼치기' : '접기'}
            aria-expanded={!collapsed}
          >
            {collapsed ? '▸' : '▾'}
          </button>
          <button type="button" className="structure-formula-card__btn" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="structure-formula-card__body">
          {failed ? (
            <p className="structure-formula-card__error">구조식을 불러오지 못했어요</p>
          ) : (
            <img
              className="structure-formula-card__image"
              src={pubchemDepictionUrl(name, 300)}
              alt={`${name} 평면 구조식`}
              onClick={() => setLarge((v) => !v)}
              onError={() => setFailed(true)}
            />
          )}
        </div>
      )}
    </div>
  )
}
