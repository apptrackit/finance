import { useState, useEffect } from 'react'
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  ReferenceLine,
  AreaChart,
  Area
} from 'recharts'
import { format } from 'date-fns'
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react'
import { API_BASE_URL, apiFetch } from '../config'

type ChartDataPoint = {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

type InvestmentChartProps = {
  symbol: string
  purchasePrice?: number
  currency: string
}

type TimeRange = '1d' | '5d' | '1mo' | '6mo' | '1y' | '5y' | 'max'

const RANGES: { label: string; value: TimeRange; interval: string }[] = [
  { label: '1D', value: '1d', interval: '5m' },
  { label: '5D', value: '5d', interval: '15m' },
  { label: '1M', value: '1mo', interval: '1d' },
  { label: '6M', value: '6mo', interval: '1d' },
  { label: '1Y', value: '1y', interval: '1wk' },
  { label: '5Y', value: '5y', interval: '1mo' },
  { label: 'All', value: 'max', interval: '3mo' },
]

export function InvestmentChart({ symbol, purchasePrice, currency }: InvestmentChartProps) {
  const [range, setRange] = useState<TimeRange>('1mo')
  const [data, setData] = useState<ChartDataPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hoveredPrice, setHoveredPrice] = useState<number | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const selectedRange = RANGES.find(r => r.value === range)
        const res = await apiFetch(
          `${API_BASE_URL}/market/chart?symbol=${encodeURIComponent(symbol)}&range=${range}&interval=${selectedRange?.interval || '1d'}`
        )
        
        if (!res.ok) throw new Error('Failed to fetch chart data')
        
        const json = await res.json()
        
        // Parse Yahoo Finance Chart response
        // Structure: { quotes: [{ date, open, high, low, close, volume, ... }], ... }
        // OR { timestamp: [], indicators: { quote: [{ open, ... }] } } depending on endpoint version
        // yahoo-finance2 usually returns a simplified object or the raw result.
        // Let's assume it returns the result object which has 'quotes' array if using 'chart' method wrapper properly,
        // OR it might return the raw structure.
        // Let's inspect the data structure in the component if needed, but usually 'quotes' is the array.
        
        let points: ChartDataPoint[] = []
        
        if (json.quotes && Array.isArray(json.quotes)) {
          points = json.quotes.map((q: any) => ({
            date: q.date, // ISO string or timestamp
            open: q.open,
            high: q.high,
            low: q.low,
            close: q.close,
            volume: q.volume
          })).filter((p: any) => p.close !== null) // Filter out nulls (market closed/no data)
        }
        
        setData(points)
      } catch (err) {
        console.error(err)
        setError('Could not load chart data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [symbol, range])

  const currentPrice = data.length > 0 ? data[data.length - 1].close : 0
  const startPrice = data.length > 0 ? data[0].close : 0
  const priceChange = currentPrice - startPrice
  const percentChange = (priceChange / startPrice) * 100
  const isPositive = priceChange >= 0

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const point = payload[0].payload
      return (
        <div className="bg-card/95 backdrop-blur border border-border p-3 rounded-lg shadow-xl text-xs">
          <p className="font-medium mb-1">{format(new Date(point.date), 'MMM d, yyyy HH:mm')}</p>
          <p className="text-foreground font-bold">
            {point.close.toLocaleString(undefined, { style: 'currency', currency })}
          </p>
          {purchasePrice && (
            <div className="mt-1 pt-1 border-t border-border/50">
              <p className="text-muted-foreground">Your Avg: {purchasePrice.toLocaleString(undefined, { style: 'currency', currency })}</p>
              <p className={`${point.close >= purchasePrice ? 'text-green-500' : 'text-red-500'}`}>
                {((point.close - purchasePrice) / purchasePrice * 100).toFixed(2)}%
              </p>
            </div>
          )}
        </div>
      )
    }
    return null
  }

  return (
    <div className="space-y-4">
      {/* Header with Price and Range Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-2xl font-bold">
            {(hoveredPrice ?? currentPrice).toLocaleString(undefined, { style: 'currency', currency })}
          </div>
          <div className={`flex items-center gap-1 text-sm ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
            {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            <span>{priceChange > 0 ? '+' : ''}{priceChange.toFixed(2)} ({percentChange.toFixed(2)}%)</span>
            <span className="text-muted-foreground ml-1">
              {RANGES.find(r => r.value === range)?.label}
            </span>
          </div>
        </div>
        
        <div className="flex bg-secondary/50 p-1 rounded-lg overflow-x-auto">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
                range === r.value
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Area */}
      <div className="h-[300px] w-full relative">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-card/50 backdrop-blur-sm z-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
            {error}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              onMouseMove={(e: any) => {
                if (e.activePayload) {
                  setHoveredPrice(e.activePayload[0].payload.close)
                }
              }}
              onMouseLeave={() => setHoveredPrice(null)}
            >
              <defs>
                <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis 
                dataKey="date" 
                hide 
                // tickFormatter={(date) => format(new Date(date), 'MMM d')}
              />
              <YAxis 
                domain={['auto', 'auto']} 
                hide 
                // tickFormatter={(val) => val.toFixed(2)}
              />
              <Tooltip content={<CustomTooltip />} />
              
              {purchasePrice && (
                <ReferenceLine 
                  y={purchasePrice} 
                  stroke="hsl(var(--muted-foreground))" 
                  strokeDasharray="3 3" 
                  label={{ 
                    value: 'Avg Buy', 
                    position: 'right', 
                    fill: 'hsl(var(--muted-foreground))',
                    fontSize: 10
                  }} 
                />
              )}
              
              <Area
                type="monotone"
                dataKey="close"
                stroke={isPositive ? '#22c55e' : '#ef4444'}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorPrice)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
