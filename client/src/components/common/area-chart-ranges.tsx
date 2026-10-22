import { useId } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

export function AreaChartRanges<T extends string>({ label, options, value, onChange }: {
  label: string
  options: readonly (readonly [T, string])[]
  value: T
  onChange: (value: T) => void
}) {
  const id = useId()
  const reduce = useReducedMotion()
  return <div role="group" aria-label={label} className="easyui-chart-ranges">
    {options.map(([key, text]) => <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)}>
      {value === key && <motion.span layoutId={`${id}-pill`} className="easyui-chart-pill" transition={{ type: 'spring', duration: reduce ? 0 : 0.3, bounce: 0.15 }} />}
      <span className="relative">{text}</span>
    </button>)}
  </div>
}
