import type { CSSProperties } from 'react'
import type { Axis, AxisState } from '../viewer/crossSection'

const AXIS_LABEL: Record<Axis, string> = { x: 'X', y: 'Y', z: 'Z' }
const AXIS_COLOR: Record<Axis, string> = { x: '#ff4d6d', y: '#4dff88', z: '#4d9dff' }

export function AxisSlider({
  axis,
  state,
  onChange,
}: {
  axis: Axis
  state: AxisState
  onChange: (patch: Partial<AxisState>) => void
}) {
  return (
    <div className={`axis-row ${state.enabled ? 'axis-row--on' : ''}`}>
      <label className="axis-toggle" style={{ '--axis-color': AXIS_COLOR[axis] } as CSSProperties}>
        <input type="checkbox" checked={state.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />
        <span className="axis-dot" />
        {AXIS_LABEL[axis]}
      </label>
      <input
        className="axis-range"
        type="range"
        min={-1}
        max={1}
        step={0.01}
        value={state.offset}
        disabled={!state.enabled}
        onChange={(e) => onChange({ offset: Number(e.target.value) })}
      />
      <button
        type="button"
        className={`axis-invert ${state.invert ? 'axis-invert--on' : ''}`}
        disabled={!state.enabled}
        onClick={() => onChange({ invert: !state.invert })}
        title="절단 방향 반전"
      >
        ⇄
      </button>
    </div>
  )
}
