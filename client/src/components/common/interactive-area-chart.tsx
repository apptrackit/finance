import { useEffect, useId, useRef, useState } from 'react'
import type { PointerEvent, ReactNode } from 'react'
import { cn } from '../../lib/utils'

// Adapted from EasyUI's Interactive Area Chart (MIT; see licenses/easyui.txt).
// Keep original samples, time spacing and gaps instead of spline resampling or
// morphing financial observations into values that were never recorded.
export type AreaChartPoint = { date: string; value: number | null; reference?: number | null }
type Series = { label: string; color: string; dashed?: boolean; step?: boolean }
type InteractiveAreaChartProps = {
  data: AreaChartPoint[]
  label: string
  formatValue: (value: number | null) => string
  color?: string
  reference?: Series
  hidden?: boolean
  showReadout?: boolean
  className?: string
  activeIndex?: number | null
  onInspect?: (index: number | null) => void
  renderTooltip?: (index: number) => ReactNode
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
const finite = (value: number | null | undefined): value is number => value != null && Number.isFinite(value)
const shortDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const fullDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export function InteractiveAreaChart({ data, label, formatValue, color = 'hsl(var(--primary))', reference, hidden = false, showReadout = false, className, activeIndex, onInspect, renderTooltip }: InteractiveAreaChartProps) {
  const uid = useId().replaceAll(':', '')
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 640, height: 240 })
  const [selection, setSelection] = useState<{ data: AreaChartPoint[]; index: number } | null>(null)
  const internalIndex = selection?.data === data ? selection.index : null
  const index = activeIndex === undefined ? internalIndex : activeIndex
  const inspected = index != null && index >= 0 && index < data.length ? index : null
  const shown = data[inspected ?? data.length - 1]
  const hasData = data.length > 0

  useEffect(() => {
    const element = wrapRef.current
    if (!element || hidden) return
    const measure = () => {
      const rect = element.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) setSize({ width: rect.width, height: rect.height })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [hidden, hasData])

  const inspect = (next: number | null) => {
    setSelection(next === null ? null : { data, index: next })
    onInspect?.(next)
  }
  const { width, height } = size
  const pad = { top: 24, right: 12, bottom: 28, left: width < 400 ? 48 : 58 }
  const bottom = height - pad.bottom
  const innerWidth = Math.max(1, width - pad.left - pad.right)
  const values = data.flatMap(point => reference ? [point.value, point.reference] : [point.value]).filter(finite)
  const minimum = values.length ? Math.min(...values) : 0
  const maximum = values.length ? Math.max(...values) : 1
  const padding = Math.max((maximum - minimum) * 0.2, Math.max(Math.abs(minimum), Math.abs(maximum)) * 0.025, 1)
  const low = minimum - padding, high = maximum + padding
  const times = data.map(point => Date.parse(`${point.date}T00:00:00Z`))
  const start = times[0] ?? 0, span = (times.at(-1) ?? 0) - start
  const x = (i: number) => pad.left + (span > 0 ? (times[i] - start) / span : 0.5) * innerWidth
  const y = (value: number) => pad.top + (1 - (value - low) / (high - low)) * (bottom - pad.top)
  const ticks = [high, (high + low) / 2, low]
  const tooltipWidth = Math.min(renderTooltip ? 280 : 200, width)
  const labelCount = width < 400 ? 3 : 5
  const labels = [...new Set(Array.from({ length: labelCount }, (_, i) => Math.round(i / (labelCount - 1) * (data.length - 1))))]

  const paths = (key: 'value' | 'reference', step = false) => {
    const segments: { line: string; area: string; single: number | null }[] = []
    let segment: number[] = []
    const flush = () => {
      if (!segment.length) return
      const first = segment[0], last = segment[segment.length - 1]
      const line = `M${x(first)} ${y(data[first][key]!)}` + segment.slice(1).map(i => step
        ? ` H${x(i)} V${y(data[i][key]!)}`
        : ` L${x(i)} ${y(data[i][key]!)}`).join('')
      segments.push({ line, area: `${line} L${x(last)} ${bottom} L${x(first)} ${bottom} Z`, single: segment.length === 1 ? first : null })
      segment = []
    }
    data.forEach((point, i) => { if (finite(point[key])) segment.push(i); else flush() })
    flush()
    return segments
  }

  const scrub = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    if (!data.length || box.width === 0) return
    const target = (event.clientX - box.left) * width / box.width
    let nearest = 0
    for (let i = 1; i < data.length; i++) if (Math.abs(x(i) - target) < Math.abs(x(nearest) - target)) nearest = i
    inspect(nearest)
  }

  if (hidden) return <div className={cn('flex h-60 items-center justify-center text-sm text-muted-foreground', className)}>Chart hidden for privacy</div>
  if (!data.length) return <div className={cn('flex h-60 items-center justify-center text-sm text-muted-foreground', className)}>No data in this period</div>

  return <div className="min-w-0">
    {showReadout && <div className="mb-2 px-2 sm:px-0" aria-live="polite" aria-atomic="true">
      <p className="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{formatValue(shown.value)}</p>
      <p className="mt-1 text-xs text-muted-foreground">{fullDate(shown.date)}{inspected === null ? ' · latest in period' : ''}</p>
    </div>}
    <div ref={wrapRef} className={cn('relative h-60 min-w-0', className)}>
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} role="slider" tabIndex={0}
        aria-label={`${label}. Use arrow keys to inspect dates.`} aria-orientation="horizontal"
        aria-valuemin={0} aria-valuemax={data.length - 1} aria-valuenow={inspected ?? data.length - 1}
        aria-valuetext={`${fullDate(shown.date)} · ${formatValue(shown.value)}`}
        className="block select-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ touchAction: 'pan-y', cursor: 'crosshair' }}
        onPointerMove={scrub} onPointerDown={scrub} onPointerLeave={() => inspect(null)} onPointerCancel={() => inspect(null)}
        onBlur={() => inspect(null)} onKeyDown={event => {
          let next: number | null
          if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = clamp((inspected ?? data.length - 1) - 1, 0, data.length - 1)
          else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = clamp((inspected ?? data.length - 1) + 1, 0, data.length - 1)
          else if (event.key === 'Home') next = 0
          else if (event.key === 'End') next = data.length - 1
          else if (event.key === 'Escape') next = null
          else return
          event.preventDefault()
          inspect(next)
        }}>
        <defs><linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.2} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
        <g aria-hidden="true">
          {ticks.map((value, i) => <g key={i}>
            <line x1={pad.left} x2={width - pad.right} y1={y(value)} y2={y(value)} stroke="hsl(var(--border))" strokeOpacity={0.6} />
            <text x={pad.left - 10} y={y(value)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground text-[10px] tabular-nums">{Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)}</text>
          </g>)}
          {labels.map((i, j) => <text key={i} x={x(i)} y={height - 6} textAnchor={j === 0 ? 'start' : j === labels.length - 1 ? 'end' : 'middle'} className="fill-muted-foreground text-[10px]">{shortDate(data[i].date)}</text>)}
          {reference && <g data-series="reference">{paths('reference', reference.step).map((path, i) => <g key={i}>
            <path d={path.line} fill="none" stroke={reference.color} strokeWidth={1.5} strokeDasharray={reference.dashed ? '6 3' : undefined} />
            {path.single !== null && <circle cx={x(path.single)} cy={y(data[path.single].reference!)} r={2} fill={reference.color} />}
          </g>)}</g>}
          <g data-series="value">{paths('value').map((path, i) => <g key={i}>
            <path d={path.area} fill={`url(#${uid}-fill)`} />
            <path d={path.line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            {path.single !== null && <circle cx={x(path.single)} cy={y(data[path.single].value!)} r={3} fill={color} />}
          </g>)}</g>
          {inspected !== null && <g pointerEvents="none">
            <line x1={x(inspected)} x2={x(inspected)} y1={pad.top} y2={bottom} stroke={color} strokeOpacity={0.3} strokeDasharray="3 3" />
            {finite(shown.value) && <circle cx={x(inspected)} cy={y(shown.value)} r={4.5} fill="hsl(var(--card))" stroke={color} strokeWidth={2} />}
          </g>}
        </g>
      </svg>
      {inspected !== null && <div className="pointer-events-none absolute top-0 z-10 max-w-full [&>div]:max-w-full" style={{ width: tooltipWidth, left: clamp(x(inspected) - tooltipWidth / 2, 0, Math.max(0, width - tooltipWidth)) }}>
        {renderTooltip ? renderTooltip(inspected) : <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
          <p className="text-[11px] text-muted-foreground">{fullDate(shown.date)}</p>
          <p className="text-sm font-semibold tabular-nums" style={{ color }}>{formatValue(shown.value)}</p>
        </div>}
      </div>}
    </div>
    {reference && <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 px-2 text-xs text-muted-foreground sm:px-0">
      <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: color }} />{label}</span>
      <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t" style={{ borderColor: reference.color, borderStyle: reference.dashed ? 'dashed' : 'solid' }} />{reference.label}</span>
    </div>}
  </div>
}
