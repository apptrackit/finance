import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {MemoryRouter} from 'react-router'
import {InvestmentChart} from './InvestmentChart'
import {HoldingsList} from './HoldingsList'
import {calculatePosition} from './utils'
import {yahooFixture} from '../../../../tests/fixtures/market-data'
import {normalizeYahoo} from '../../../../shared/market-provider'
vi.mock('recharts',()=>({
  ResponsiveContainer:({children}:{children:React.ReactNode})=><div>{children}</div>,
  ComposedChart:({data}:{data:unknown[]})=><div data-testid="instrument-chart" data-points={data.length}/>,
  ReferenceLine:()=>null,Area:()=>null,Scatter:()=>null,Tooltip:()=>null,XAxis:()=>null,YAxis:()=>null,CartesianGrid:()=>null,
}))
afterEach(()=>vi.unstubAllGlobals())
const now=Date.now()
const value=normalizeYahoo(yahooFixture(now),'TEST',new Date(now-30*86400000).toISOString().slice(0,10),now).history
it('shows native currency/daily bounds and preserves a matching chart on failed refresh',async()=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json(value))
  vi.stubGlobal('fetch',fetcher)
  render(<InvestmentChart symbol="TEST"/>)
  expect(await screen.findByText(/110 EUR/)).toBeInTheDocument()
  expect(screen.getByText(/daily unadjusted close/)).toBeInTheDocument()
  expect(String(fetcher.mock.calls[0][0])).toContain('interval=1d')
  expect(screen.getByTestId('instrument-chart')).toHaveAttribute('data-points','3')
  fetcher.mockRejectedValue(new Error('private error'))
  fireEvent.click(screen.getByRole('button',{name:'5D'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Price history could not be refreshed')
  expect(screen.queryByText(/private error/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'1M'}))
  expect(screen.getByTestId('instrument-chart')).toHaveAttribute('data-points','3')
  fireEvent.click(screen.getByRole('button',{name:'Refresh history'}))
  await waitFor(()=>expect(screen.getByText(/Saved history; refresh unavailable/)).toBeInTheDocument())
  expect(screen.getByTestId('instrument-chart')).toHaveAttribute('data-points','3')
})
it('aborts superseded chart reads and ignores their late result',async()=>{
  let release:(response:Response)=>void=()=>{},oldSignal:AbortSignal|undefined
  const fetcher=vi.fn<typeof fetch>().mockImplementationOnce(async(_url,options)=>{
    oldSignal=options?.signal as AbortSignal;return new Promise(resolve=>{release=resolve})
  }).mockImplementation(async()=>Response.json({...value,symbol:'OTHER',currency:'HUF'}))
  vi.stubGlobal('fetch',fetcher)
  const view=render(<InvestmentChart symbol="TEST"/>)
  await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1))
  view.rerender(<InvestmentChart symbol="OTHER"/>)
  expect(await screen.findByText(/110 HUF/)).toBeInTheDocument();expect(oldSignal?.aborted).toBe(true)
  await act(async()=>release(Response.json(value)))
  expect(screen.queryByText(/110 EUR/)).not.toBeInTheDocument()
})
it('shows a stale source time without inventing a daily zero move and masks privacy badges',()=>{
  const account={id:'holding',name:'Synthetic',type:'investment' as const,balance:2,currency:'SHARE',quote_currency:'EUR',asset_type:'stock' as const,symbol:'TEST',updated_at:1}
  const quotes={TEST:{symbol:'TEST',regularMarketPrice:100,currency:'EUR',as_of:'2026-10-16T16:00:00Z',status:'stale' as const,regularMarketChangePercent:null}}
  const position=calculatePosition(account,[],quotes,{USD:1,EUR:1})
  const props={positions:[position],quotes,loading:false,refreshing:false,privacyMode:'off',onRefresh:vi.fn(),onOpenDetail:vi.fn()}
  const view=render(<MemoryRouter><HoldingsList {...props}/></MemoryRouter>)
  expect(screen.getByText(/Stale price 2026-10-16/)).toBeInTheDocument()
  expect(screen.queryByText('+0.00%')).not.toBeInTheDocument()
  view.rerender(<MemoryRouter><HoldingsList {...props} privacyMode="hidden" quotes={{TEST:{...quotes.TEST,regularMarketChangePercent:12.34}}}/></MemoryRouter>)
  expect(screen.queryByText(/12.34%/)).not.toBeInTheDocument()
})

it('withholds a misleading raw range change across stock splits',async()=>{
  vi.stubGlobal('fetch',vi.fn<typeof fetch>().mockResolvedValue(Response.json({...value,events:[{date:value.points[1].date,type:'split',ratio:2}],requires_event_review:true})))
  render(<InvestmentChart symbol="TEST"/>)
  expect(await screen.findByText('Range change unavailable across split events.')).toBeInTheDocument()
  expect(screen.queryByText(/selected range/)).not.toBeInTheDocument()
})

it('retains every same-day execution, its actual date/currency and the current remaining-cost reference',async()=>{
 const date=value.points[1].date
 const trades=[{id:'buy1',date,amount:100,quantity:1,price:101,execution_currency:'EUR'},
  {id:'buy2',date,amount:200,quantity:2,price:102,execution_currency:'EUR'},
  {id:'sell',date,amount:-110,quantity:-1,price:110,execution_currency:'EUR'},
  {id:'other-currency',date,amount:100,quantity:1,price:99,execution_currency:'USD'}]
 vi.stubGlobal('fetch',vi.fn<typeof fetch>().mockResolvedValue(Response.json(value)))
 render(<InvestmentChart symbol="TEST" transactions={trades} averageCost={98.5} costCurrency="EUR"/>)
 await screen.findByRole('combobox',{name:'Read instrument history by date'})
 fireEvent.change(screen.getByRole('combobox',{name:'Read instrument history by date'}),{target:{value:date}})
 const list=screen.getByRole('list',{name:`Executions on ${date}`})
 expect(list.children).toHaveLength(4)
 expect(list).toHaveTextContent('101 EUR');expect(list).toHaveTextContent('102 EUR');expect(list).toHaveTextContent('110 EUR');expect(list).toHaveTextContent('99 USD')
 expect(screen.getByText(/Current average remaining cost: 98,5 EUR/)).toBeVisible()
})
it('reuses an owned detail cache until its source key changes',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json(value)),cache=new Map()
 vi.stubGlobal('fetch',fetcher)
 const first=render(<InvestmentChart symbol="TEST" cache={cache} revisionKey="one"/>);await screen.findByText(/110 EUR/);first.unmount()
 const second=render(<InvestmentChart symbol="TEST" cache={cache} revisionKey="one"/>);await screen.findByText(/110 EUR/)
 expect(fetcher).toHaveBeenCalledTimes(1)
 second.rerender(<InvestmentChart symbol="TEST" cache={cache} revisionKey="two"/>);await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2))
})
