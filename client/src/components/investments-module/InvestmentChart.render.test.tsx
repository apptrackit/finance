import { cloneElement } from 'react'
import type { ReactElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { InvestmentChart, splitAdjustedTradePrice } from './InvestmentChart'
import { normalizeYahoo } from '../../../../shared/market-provider'
import { yahooFixture } from '../../../../tests/fixtures/market-data'
// Keep the real chart/axes/selectors. Only the physical container size needs a
// jsdom replacement; mocking the chart itself concealed mixed-series domains.
vi.mock('recharts', async (original) => ({
  ...(await original<typeof import('recharts')>()),
  ResponsiveContainer: ({
    children,
  }: {
    children: ReactElement<{ width: number; height: number }>
  }) => cloneElement(children, { width: 600, height: 240 }),
}))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
it('keeps daily prices in the visible axis domain when execution scatter data is supplied', async () => {
  const now = Date.now(),
    history = normalizeYahoo(
      yahooFixture(now),
      'TEST',
      new Date(now - 30 * 86400000).toISOString().slice(0, 10),
      now,
    ).history
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json(history)))
  render(
    <InvestmentChart
      symbol="TEST"
      averageCost={20}
      costCurrency="EUR"
      transactions={[
        {
          id: 'low-fill',
          date: history.points[1].date,
          amount: 10,
          quantity: 1,
          price: 10,
          execution_currency: 'EUR',
        },
      ]}
    />,
  )
  await screen.findByText(/110,00 EUR/)
  await waitFor(() => {
    const plot = screen.getByLabelText('Daily instrument price history')
    const ticks = [
      ...plot.querySelectorAll('.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value'),
    ].map((n) => Number(n.textContent?.replaceAll(',', '')))
    expect(Math.max(...ticks)).toBeGreaterThanOrEqual(110)
    expect(plot.querySelector('.recharts-area-curve')).toHaveAttribute(
      'd',
      expect.stringContaining('L'),
    )
    expect(plot.querySelectorAll('.recharts-scatter-symbol')).toHaveLength(1)
  })
})
it('renders daily history without inventing executions from empty scatter series', async () => {
  const now = Date.now(),
    history = normalizeYahoo(
      yahooFixture(now),
      'TEST',
      new Date(now - 30 * 86400000).toISOString().slice(0, 10),
      now,
    ).history
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json(history)))
  render(<InvestmentChart symbol="TEST" />)
  await screen.findByText(/110,00 EUR/)
  await waitFor(() =>
    expect(
      screen.getByLabelText('Daily instrument price history').querySelector('.recharts-area-curve'),
    ).not.toBeNull(),
  )
  expect(
    screen
      .getByLabelText('Daily instrument price history')
      .querySelectorAll('.recharts-scatter-symbol'),
  ).toHaveLength(0)
})

it.each(['dividend', 'split'] as const)(
  'only warns about split position review for %s history',
  async (type) => {
    const now = Date.now()
    const history = normalizeYahoo(
      yahooFixture(now),
      'TEST',
      new Date(now - 30 * 86400000).toISOString().slice(0, 10),
      now,
    ).history
    history.events = [
      {
        date: history.points[1].date,
        type,
        ...(type === 'split' ? { ratio: 2 } : {}),
      },
    ]
    history.requires_event_review = true
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json(history)))
    render(<InvestmentChart symbol="TEST" />)
    await screen.findByText(/110,00 EUR/)
    expect(screen.getByText(/excludes dividends/)).toBeVisible()
    if (type === 'split') expect(screen.getByText(/Prices and trade dots use the current share basis/)).toBeVisible()
    else expect(screen.queryByText(/Price history alone/)).not.toBeInTheDocument()
  },
)

it('shows every long-range buy/sell at its date, including date-only trades and same-day executions',async()=>{
 const history=normalizeYahoo(yahooFixture(Date.now()),'TEST','2021-10-19',Date.now()).history
 history.from='2021-10-19';history.to='2026-10-19'
 history.points=[{date:'2022-01-03',period_start:'2022-01-03T00:00:00Z',close:100,provider_close:100,provisional:false},
  {date:'2026-10-19',period_start:'2026-10-19T00:00:00Z',close:110,provider_close:110,provisional:false}]
 const fetcher=vi.fn<typeof fetch>().mockImplementation(async url=>Response.json(String(url).includes('range=5y')?history:{...history,from:'2026-09-19'}))
 vi.stubGlobal('fetch',fetcher)
 render(<InvestmentChart symbol="TEST" transactions={[
  {id:'old-buy',date:'2022-01-03',amount:100,quantity:1,price:100,execution_currency:'EUR'},
  {id:'same-day-buy',date:'2022-01-03',amount:101,quantity:1,price:101,execution_currency:'EUR'},
  {id:'sell',date:'2025-01-03',amount:-120,quantity:-1,price:120,execution_currency:'EUR'},
  {id:'foreign-buy',date:'2023-01-03',amount:110,quantity:1,price:110,execution_currency:'USD'},
  {id:'unknown-sell',date:'2024-01-03',amount:-1,quantity:-1},
 ]}/> )
 await screen.findByText(/110,00 EUR/)
 fireEvent.click(screen.getByRole('button',{name:'5Y',exact:true}))
 await screen.findByText('Buy · 3')
 expect(fetcher.mock.calls.some(([url])=>String(url).includes('range=5y'))).toBe(true)
 const plot=screen.getByLabelText('Daily instrument price history')
 await waitFor(()=>expect(plot.querySelectorAll('.recharts-scatter-symbol')).toHaveLength(5))
 const dots=[...plot.querySelectorAll('.recharts-scatter-symbol circle')]
 expect(dots.filter(dot=>dot.getAttribute('stroke')==='hsl(var(--success))')).toHaveLength(3)
 expect(dots.filter(dot=>dot.getAttribute('stroke')==='hsl(var(--destructive))')).toHaveLength(2)
 expect(dots.filter(dot=>dot.getAttribute('fill')==='hsl(var(--card))')).toHaveLength(2)
 const sale=dots.find(dot=>dot.querySelector('title')?.textContent==='Sell · 2025-01-03')!
 fireEvent.click(sale)
 expect(screen.getByRole('list',{name:'Executions on 2025-01-03'})).toHaveTextContent('120 EUR')
 fireEvent.change(screen.getByRole('combobox',{name:'Read instrument history by date'}),{target:{value:'2022-01-03'}})
 expect(screen.getByRole('list',{name:'Executions on 2022-01-03'}).children).toHaveLength(2)
 fireEvent.click(screen.getByRole('button',{name:'1Y',exact:true}))
 await waitFor(()=>expect(plot.querySelectorAll('.recharts-scatter-symbol')).toHaveLength(0))
 expect(fetcher.mock.calls.some(([url])=>String(url).includes('range=1y'))).toBe(true)
})

it('plots a continuous split-only series and adjusts trade dots without rewriting recorded executions',async()=>{
 const history=normalizeYahoo(yahooFixture(Date.now()),'TEST','2021-07-01',Date.now()).history
 history.from='2021-07-01';history.to='2026-10-20'
 history.events=[{date:'2021-07-20',type:'split',ratio:4},{date:'2024-06-10',type:'split',ratio:10},{date:'2024-07-01',type:'dividend'}]
 history.points=[['2021-07-19',2400,60],['2021-07-20',610,61],['2024-06-07',620,62],['2024-06-10',63,63]].map(([date,close,provider])=>({date:String(date),period_start:`${date}T00:00:00Z`,close:Number(close),provider_close:Number(provider),provisional:false}))
 const trades=[{id:'before-both',date:'2021-07-19',amount:2400,quantity:1,price:2400,execution_currency:'EUR'},
 {id:'before-second',date:'2024-06-07',amount:-620,quantity:-1,price:620,execution_currency:'EUR'}]
 const original=JSON.stringify({history,trades})
 expect(splitAdjustedTradePrice(trades[0],history)).toBe(60)
 expect(splitAdjustedTradePrice(trades[1],history)).toBe(62)
 expect(splitAdjustedTradePrice({date:'2024-06-10',price:63},history)).toBe(63)
 vi.stubGlobal('fetch',vi.fn<typeof fetch>().mockResolvedValue(Response.json(history)))
 render(<InvestmentChart symbol="TEST" transactions={trades}/>)
 await screen.findByText(/63,00 EUR/)
 expect(screen.getByText(/5.00%.*price change/)).toBeVisible()
 const plot=screen.getByLabelText('Daily instrument price history')
 await waitFor(()=>expect(plot.querySelectorAll('.recharts-scatter-symbol')).toHaveLength(2))
 const ticks=[...plot.querySelectorAll('.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value')].map(n=>Number(n.textContent?.replaceAll(',','')))
 expect(Math.max(...ticks)).toBeLessThan(100)
 expect(Math.min(...ticks)).toBeGreaterThan(0)
 fireEvent.change(screen.getByRole('combobox',{name:'Read instrument history by date'}),{target:{value:'2021-07-19'}})
 expect(screen.getByRole('list',{name:'Executions on 2021-07-19'})).toHaveTextContent('2400 EUR')
 expect(JSON.stringify({history,trades})).toBe(original)
})

it('supports reverse splits, ignores dividends and withholds invalid split-adjustment factors',()=>{
 const history=normalizeYahoo(yahooFixture(Date.now()),'TEST','2020-01-01',Date.now()).history
 history.events=[{date:'2024-01-01',type:'split',ratio:0.1},{date:'2024-02-01',type:'dividend'}]
 expect(splitAdjustedTradePrice({date:'2023-01-01',price:10},history)).toBe(100)
 history.events[0].ratio=0
 expect(splitAdjustedTradePrice({date:'2023-01-01',price:10},history)).toBeNull()
})

it('formats normal unit prices as cents without altering the source observation',async()=>{
 const history=normalizeYahoo(yahooFixture(Date.now()),'TEST','2026-01-01',Date.now()).history
 history.points.at(-1)!.close=214.130004882813
 history.points.at(-1)!.provider_close=214.130004882813
 vi.stubGlobal('fetch',vi.fn<typeof fetch>().mockResolvedValue(Response.json(history)))
 render(<InvestmentChart symbol="TEST"/>)
 expect(await screen.findByText('214,13 EUR')).toBeVisible()
 expect(history.points.at(-1)!.provider_close).toBe(214.130004882813)
})
