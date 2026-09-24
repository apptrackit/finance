import { memo, useMemo, useState } from 'react'
import { GitFork } from 'lucide-react'
import { ResponsiveContainer, Sankey } from 'recharts'
import type { LinkProps as RechartsSankeyLinkProps, NodeProps as RechartsSankeyNodeProps } from 'recharts/types/chart/Sankey'
import { Card, CardContent, CardHeader, CardTitle } from '../common/card'
import { usePrivacy } from '../../context/PrivacyContext'

type CategoryData = {
  name: string
  icon: string
  value: number
  percentage: number
}

type FlowKind = 'income' | 'cash-flow' | 'expense' | 'surplus' | 'deficit'

type MoneyMapNode = {
  name: string
  label: string
  amount: number
  kind: FlowKind
}

type SankeyNodeProps = {
  x: number
  y: number
  width: number
  height: number
  index: number
  payload: MoneyMapNode
}

type SankeyLinkProps = {
  sourceX: number
  sourceY: number
  sourceControlX: number
  targetX: number
  targetY: number
  targetControlX: number
  linkWidth: number
  index: number
  payload: {
    source: MoneyMapNode
    target: MoneyMapNode
    value: number
  }
}

type HoveredEntry = {
  key: string
  label: string
  value: number
  kind: FlowKind
}

type MoneyMapChartProps = {
  incomeData: CategoryData[]
  expenseData: CategoryData[]
  totalIncome: number
  totalExpenses: number
  masterCurrency: string
}

const COLORS: Record<FlowKind, string> = {
  income: 'hsl(var(--success))',
  'cash-flow': 'hsl(var(--primary))',
  expense: 'hsl(var(--destructive))',
  surplus: 'hsl(var(--success))',
  deficit: 'hsl(38 92% 50%)',
}

function consolidateCategories(data: CategoryData[], maxItems: number) {
  if (data.length <= maxItems) return data
  const visible = data.slice(0, maxItems - 1)
  const remaining = data.slice(maxItems - 1)
  return [...visible, {
    name: 'Other',
    icon: '•••',
    value: remaining.reduce((sum, item) => sum + item.value, 0),
    percentage: remaining.reduce((sum, item) => sum + item.percentage, 0),
  }]
}

export const MoneyMapChart = memo(function MoneyMapChart({
  incomeData,
  expenseData,
  totalIncome,
  totalExpenses,
  masterCurrency,
}: MoneyMapChartProps) {
  const { privacyMode } = usePrivacy()
  const [hovered, setHovered] = useState<HoveredEntry | null>(null)

  const moneyMap = useMemo(() => {
    const income = consolidateCategories(incomeData.filter(item => item.value > 0), 6)
    const expenses = consolidateCategories(expenseData.filter(item => item.value > 0), 8)
    const nodes: MoneyMapNode[] = []
    const links: { source: number; target: number; value: number }[] = []

    const incomeNodeIndexes = income.map(item => {
      const index = nodes.length
      nodes.push({ name: `income-${item.name}`, label: `${item.icon} ${item.name}`, amount: item.value, kind: 'income' })
      return index
    })

    const deficit = Math.max(0, totalExpenses - totalIncome)
    if (deficit > 0) {
      nodes.push({ name: 'deficit', label: 'Deficit', amount: deficit, kind: 'deficit' })
    }

    const cashFlowIndex = nodes.length
    nodes.push({
      name: 'cash-flow',
      label: 'Cash Flow',
      amount: Math.max(totalIncome, totalExpenses),
      kind: 'cash-flow',
    })

    incomeNodeIndexes.forEach((source, index) => {
      links.push({ source, target: cashFlowIndex, value: income[index].value })
    })
    if (deficit > 0) {
      links.push({ source: cashFlowIndex - 1, target: cashFlowIndex, value: deficit })
    }

    expenses.forEach(item => {
      const target = nodes.length
      nodes.push({ name: `expense-${item.name}`, label: `${item.icon} ${item.name}`, amount: item.value, kind: 'expense' })
      links.push({ source: cashFlowIndex, target, value: item.value })
    })

    const surplus = Math.max(0, totalIncome - totalExpenses)
    if (surplus > 0) {
      const target = nodes.length
      nodes.push({ name: 'surplus', label: 'Surplus', amount: surplus, kind: 'surplus' })
      links.push({ source: cashFlowIndex, target, value: surplus })
    }

    return { nodes, links }
  }, [expenseData, incomeData, totalExpenses, totalIncome])

  const formatAmount = (value: number) => {
    if (privacyMode === 'hidden') return '••••••'
    return `${value.toLocaleString('hu-HU', { notation: 'compact', maximumFractionDigits: 1 })} ${masterCurrency}`
  }

  const renderNode = (rawProps: RechartsSankeyNodeProps) => {
    const props = rawProps as unknown as SankeyNodeProps
    const { x, y, width, height, index, payload } = props
    const isActive = hovered?.key === `node-${index}`
    const isTarget = payload.kind === 'expense' || payload.kind === 'surplus'
    const isCashFlow = payload.kind === 'cash-flow'
    const labelX = isCashFlow ? x + width / 2 : isTarget ? x - 7 : x + width + 7
    // The center node carries the widest flows, so reserve space above it for
    // its label instead of letting the value sit on top of the ribbon.
    const labelY = isCashFlow ? Math.max(18, y - 26) : y + height / 2 - 2
    const anchor = isCashFlow ? 'middle' : isTarget ? 'end' : 'start'
    const canShowLabel = height >= 13

    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={3}
          fill={COLORS[payload.kind]}
          fillOpacity={isActive ? 1 : 0.88}
          stroke={isActive ? 'hsl(var(--foreground))' : 'transparent'}
          strokeWidth={isActive ? 1 : 0}
        />
        {canShowLabel && (
          <text x={labelX} y={labelY} textAnchor={anchor} fill="hsl(var(--foreground))" fontSize={11} fontWeight={600} pointerEvents="none">
            <tspan x={labelX}>{payload.label}</tspan>
            <tspan x={labelX} dy={12} fill="hsl(var(--muted-foreground))" fontSize={10} fontWeight={500}>{formatAmount(payload.amount)}</tspan>
          </text>
        )}
      </g>
    )
  }

  const renderLink = (rawProps: RechartsSankeyLinkProps) => {
    const props = rawProps as unknown as SankeyLinkProps
    const { sourceX, sourceY, sourceControlX, targetX, targetY, targetControlX, linkWidth, index, payload } = props
    const isActive = hovered?.key === `link-${index}`
    const color = payload.target.kind === 'expense'
      ? COLORS.expense
      : payload.source.kind === 'deficit'
        ? COLORS.deficit
        : COLORS.income
    const path = `M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`

    return <path d={path} fill="none" stroke={color} strokeWidth={linkWidth} strokeOpacity={isActive ? 0.58 : 0.2} className="transition-opacity duration-150" />
  }

  if (!moneyMap.links.length) {
    return (
      <Card className="border-[0.5px] border-border/70">
        <CardHeader className="pb-2 px-4 sm:px-6"><div className="flex items-center gap-2"><GitFork className="h-4 w-4 text-muted-foreground" /><CardTitle className="text-sm sm:text-base">Money Map</CardTitle></div></CardHeader>
        <CardContent className="px-4 pb-6 sm:px-6"><div className="flex h-48 items-center justify-center text-sm text-muted-foreground">No cash flow data available</div></CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-[0.5px] border-border/70 hover:border-primary/40">
      <CardHeader className="gap-3 pb-2 px-4 sm:px-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <GitFork className="h-4 w-4 text-primary" />
          <div><CardTitle className="text-sm sm:text-base">Money Map</CardTitle><p className="text-[10px] text-muted-foreground sm:text-xs">How income moves through spending and savings</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground sm:text-xs">
          <Legend color="bg-success" label="Income" />
          <Legend color="bg-destructive" label="Expenses" />
          <Legend color="bg-success" label="Surplus" />
          {totalExpenses > totalIncome && <Legend color="bg-amber-500" label="Deficit" />}
        </div>
      </CardHeader>
      <CardContent className="px-2 pb-3 sm:px-4 sm:pb-4">
        <div className="relative h-[330px] sm:h-[420px]" aria-label="Money Map cash flow diagram. Hover a category or flow for its amount.">
          {hovered && (
            <div className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-lg border border-border bg-card/95 px-2.5 py-1.5 text-center shadow-lg backdrop-blur">
              <p className="text-[10px] font-semibold text-foreground">{hovered.label}</p>
              <p className="text-[10px] text-muted-foreground">{formatAmount(hovered.value)}</p>
            </div>
          )}
          <ResponsiveContainer width="100%" height="100%">
            <Sankey
              data={moneyMap}
              nodeWidth={10}
              nodePadding={12}
              linkCurvature={0.52}
              iterations={48}
              margin={{ top: 52, right: 110, bottom: 12, left: 110 }}
              node={renderNode as never}
              link={renderLink as never}
              onMouseEnter={((item: unknown, type: 'node' | 'link') => {
                const chartItem = item as unknown as { index: number; payload: MoneyMapNode | SankeyLinkProps['payload'] }
                if (type === 'link') {
                  const link = chartItem.payload as SankeyLinkProps['payload']
                  setHovered({ key: `link-${chartItem.index}`, label: `${link.source.label} → ${link.target.label}`, value: link.value, kind: link.target.kind })
                } else {
                  const node = chartItem.payload as MoneyMapNode
                  setHovered({ key: `node-${chartItem.index}`, label: node.label, value: node.amount, kind: node.kind })
                }
              }) as never}
              onMouseLeave={(() => setHovered(null)) as never}
            />
          </ResponsiveContainer>
        </div>
        <p className="px-2 text-center text-[10px] text-muted-foreground">Hover any category or flow to inspect its value.</p>
      </CardContent>
    </Card>
  )
})

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1"><i className={`h-2 w-2 rounded-full ${color}`} />{label}</span>
}
