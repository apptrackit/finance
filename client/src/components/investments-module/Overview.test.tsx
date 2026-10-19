import {useState} from 'react'
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react'
import {MemoryRouter} from 'react-router'
import {afterEach,expect,it,vi} from 'vitest'
import {HoldingsList} from './HoldingsList'
import {PortfolioAllocation} from './PortfolioAllocation'
import {InvestmentAttention} from './InvestmentAttention'
import {calculatePosition} from './utils'
import {initialOverview,allocationRows,sortHoldings} from './overview'
import type {OverviewView} from './overview'
import type {Account,Position} from './types'
import type {HoldingTrend} from '../../../../shared/investment-overview'
const quotes={AAA:{symbol:'AAA',regularMarketPrice:10,price:10,currency:'EUR',status:'ok' as const,change_percent:2,as_of:'2026-01-10T12:00:00Z'}}
const fixture=():Position[]=>[
 {id:'a',name:'European ETF',type:'investment',balance:2,currency:'SHARE',quote_currency:'EUR',asset_type:'etf',symbol:'AAA',updated_at:1},
 {id:'b',name:'Gold',type:'investment',balance:100,currency:'HUF',asset_type:'manual',pricing_method:'manual',updated_at:1},
 {id:'c',name:'Missing stock',type:'investment',balance:1,currency:'SHARE',quote_currency:'USD',asset_type:'stock',symbol:'ZZZ',updated_at:1},
].map(a=>calculatePosition(a as Account,[],quotes,{USD:1,EUR:1,HUF:400},undefined,'HUF'))
const open=vi.fn()
function Overview({hidden=false,positions=fixture()}:{hidden?:boolean;positions?:Position[]}) {
 const [view,setView]=useState(initialOverview),update=(p:Partial<OverviewView>)=>setView(v=>({...v,...p}))
 return <MemoryRouter><PortfolioAllocation positions={positions} view={view} onChange={update} onOpen={open} hidden={hidden} currency="HUF"/><HoldingsList positions={positions} quotes={quotes} view={view} onViewChange={update} privacyMode={hidden?'hidden':'visible'} onOpenDetail={open}/></MemoryRouter>
}
afterEach(()=>{cleanup();open.mockReset()})
it('filters only holdings from category or allocation selection and retains full-portfolio counts',()=>{
 render(<Overview/>)
 const filters=screen.getByRole('group',{name:'Holding categories'})
 fireEvent.click(within(filters).getByRole('button',{name:'ETF 1'}))
 expect(screen.getByRole('table',{name:'Investment holdings'})).toHaveTextContent('AAA')
 expect(screen.queryByRole('button',{name:'Open ZZZ details'})).not.toBeInTheDocument()
 expect(screen.getByRole('region',{name:'Portfolio allocation'})).toHaveTextContent('ZZZ')
 fireEvent.click(within(screen.getByRole('group',{name:'Allocation mode'})).getByRole('button',{name:'type'}))
 fireEvent.click(within(screen.getByRole('region',{name:'Portfolio allocation'})).getByRole('button',{name:/Stock/}))
 expect(screen.getByRole('button',{name:'Open ZZZ details'})).toBeVisible()
 expect(within(filters).getByRole('button',{name:'Stock 1'})).toHaveAttribute('aria-pressed','true')
})
it('sorts converted values and keeps missing values last in either direction',()=>{
 const positions=fixture()
 expect(sortHoldings(positions,quotes,{...initialOverview,direction:'asc'}).map(p=>p.account.id)).toEqual(['b','a','c'])
 expect(sortHoldings(positions,quotes,initialOverview).map(p=>p.account.id)).toEqual(['a','b','c'])
 render(<Overview/>)
 fireEvent.change(screen.getByRole('combobox',{name:'Sort holdings'}),{target:{value:'name:desc'}})
 const table=screen.getByRole('table',{name:'Investment holdings'})
 expect([...table.querySelectorAll('tbody tr')].map(r=>r.getAttribute('data-holding-id'))).toEqual(['c','b','a'])
 fireEvent.click(screen.getByRole('button',{name:'Open AAA details'}));expect(open).toHaveBeenCalledWith(expect.objectContaining({id:'a'}))
})
it('withholds complete allocation bars/weights when one holding has a missing value',()=>{
 const data=allocationRows(fixture(),'currency')
 expect(data.complete).toBe(false);expect(data.rows.every(r=>r.weight===null)).toBe(true)
 render(<Overview/>)
 expect(screen.getByText(/Complete weights unavailable/)).toBeVisible()
 expect(screen.queryByText(/50% of portfolio/)).not.toBeInTheDocument()
 fireEvent.click(within(screen.getByRole('group',{name:'Allocation mode'})).getByRole('button',{name:'currency'}))
 expect(screen.getByText(/not geographic exposure/)).toBeVisible()
})
it('masks amounts, weights, daily moves, return signals and all sparkline data in privacy mode',()=>{
 render(<Overview hidden/>)
 expect(screen.queryByText(/8.?000 HUF/)).not.toBeInTheDocument()
 expect(screen.queryByText(/2% today/)).not.toBeInTheDocument()
 expect(screen.queryByRole('img')).not.toBeInTheDocument()
 expect(screen.getAllByText('••••••').length).toBeGreaterThan(6)
})
it('offers recovery for missing values and opening coverage',()=>{
 const retry=vi.fn()
 render(<MemoryRouter><InvestmentAttention positions={fixture()} quotes={quotes} refreshing={false} onRefresh={retry} onOpen={open}/></MemoryRouter>)
 expect(screen.getByRole('region',{name:'Investment needs attention'})).toBeVisible()
 fireEvent.click(screen.getAllByRole('button',{name:'Retry prices'})[0]);expect(retry).toHaveBeenCalledOnce()
 expect(screen.getAllByRole('link',{name:'Review position'}).length).toBeGreaterThan(0)
})
it('renders a native manual step sparkline and preserves explicit gaps',()=>{
 const p=fixture().slice(0,1),trend:HoldingTrend={kind:'unit_price',method:'step',status:'ok',currency:'EUR',reasons:[],points:[{date:'2026-01-01',value:null,as_of:null,provisional:false},{date:'2026-01-02',value:10,as_of:'2026-01-02',provisional:false},{date:'2026-01-03',value:20,as_of:'2026-01-03',provisional:false}]}
 render(<MemoryRouter><HoldingsList positions={p} quotes={quotes} privacyMode="visible" onOpenDetail={open} trends={{a:trend}}/></MemoryRouter>)
 const svg=screen.getByRole('img',{name:/30-day unit price history in EUR/})
 expect(svg.querySelector('path')?.getAttribute('d')).toContain('H118V')
})

it('keeps a provider price in its actual currency and retains tiny unit-price precision',()=>{
 const accounts=[{id:'mismatch',name:'Mapping mismatch',type:'investment',balance:1,currency:'SHARE',asset_type:'stock',quote_currency:'EUR',symbol:'USD-STOCK',updated_at:1},
  {id:'tiny',name:'Tiny coin',type:'investment',balance:1,currency:'COIN',asset_type:'crypto',quote_currency:'USD',symbol:'TINY',updated_at:1}] as Account[]
 const prices={'USD-STOCK':{symbol:'USD-STOCK',regularMarketPrice:100,currency:'USD'},TINY:{symbol:'TINY',regularMarketPrice:0.0000000158,currency:'USD'}}
 const positions=accounts.map(a=>calculatePosition(a,[],prices,{USD:1,EUR:1,HUF:400},undefined,'HUF'))
 render(<MemoryRouter><HoldingsList positions={positions} quotes={prices} privacyMode="visible" onOpenDetail={open}/></MemoryRouter>)
 expect(screen.getByText('100 USD')).toBeVisible();expect(screen.queryByText('100 EUR')).not.toBeInTheDocument()
 expect(screen.getByText('0,0000000158 USD')).toBeVisible()
})

it('opens manual valuation recovery rather than retrying prices when an appraisal is missing',()=>{
 const manual=fixture()[1]
 const position={...manual,currentValue:null,missingCurrencies:[]}
 render(<MemoryRouter><InvestmentAttention positions={[position]} quotes={{}} refreshing={false} onRefresh={vi.fn()} onOpen={open}/></MemoryRouter>)
 fireEvent.click(screen.getByRole('button',{name:'Update value'}))
 expect(open).toHaveBeenCalledWith(manual.account)
 expect(screen.queryByRole('button',{name:'Retry prices'})).not.toBeInTheDocument()
})

it('sends missing cash details to trade review rather than asking for another opening',()=>{
 const p=fixture()[0]
 const position={...p,account:{...p.account,holding_position:{quantity:2,activity_quantity:2,residual:0,history_status:'reconciled' as const,coverage_reasons:['unknown_cost'],anchor:null,recorded_history:{quantity:2,effective_date:'2026-01-01',first_trade_date:'2026-01-02',trade_count:1}}},metrics:{...p.metrics,coverage:{...p.metrics.coverage,cost:['unknown_cash_flow']}}}
 render(<MemoryRouter><InvestmentAttention positions={[position]} quotes={quotes} refreshing={false} onRefresh={vi.fn()} onOpen={open}/></MemoryRouter>)
 expect(screen.queryByRole('link',{name:'Review position'})).not.toBeInTheDocument()
 expect(screen.getByText(/Purchase cash details are missing/)).toBeVisible()
 fireEvent.click(screen.getByRole('button',{name:'Review trades'}));expect(open).toHaveBeenCalledWith(position.account)
})

it('retries missing historical FX after payment confirmation rather than asking to edit the saved trade again',()=>{
 const p=fixture()[0]
 const position={...p,reportingCurrency:'HUF',account:{...p.account,holding_position:{quantity:2,activity_quantity:2,residual:0,history_status:'reconciled' as const,coverage_reasons:[],anchor:null}},metrics:{...p.metrics,coverage:{...p.metrics.coverage,cost:['missing_dated_fx','unknown_cost']}}}
 const retry=vi.fn()
 render(<MemoryRouter><InvestmentAttention positions={[position]} quotes={quotes} refreshing={false} onRefresh={retry} onOpen={open}/></MemoryRouter>)
 expect(screen.getByText(/Historical exchange rate unavailable for HUF reporting/)).toBeVisible()
 expect(screen.queryByRole('button',{name:'Review trades'})).not.toBeInTheDocument()
 expect(screen.queryByText('Purchase cash details are missing')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Retry exchange rates'}));expect(retry).toHaveBeenCalledOnce();expect(open).not.toHaveBeenCalled()
})
it('does not warn for the same confirmed holding when its reporting currency needs no historical conversion',()=>{
 const p=fixture()[0]
 const position={...p,reportingCurrency:'USD',account:{...p.account,holding_position:{quantity:2,activity_quantity:2,residual:0,history_status:'reconciled' as const,coverage_reasons:[],anchor:null}},metrics:{...p.metrics,coverage:{...p.metrics.coverage,cost:[]}}}
 render(<MemoryRouter><InvestmentAttention positions={[position]} quotes={quotes} refreshing={false} onRefresh={vi.fn()} onOpen={open}/></MemoryRouter>)
 expect(screen.queryByRole('region',{name:'Investment needs attention'})).not.toBeInTheDocument()
})

it.each([26,61])('keeps a %s-minute quote visible while separating delayed prices from attention',minutes=>{
 const now=Date.now(),q={...quotes.AAA,status:'stale' as const,as_of:new Date(now-minutes*60_000).toISOString(),change:null,change_percent:null}
 const p=fixture()[0];p.account.holding_position={quantity:2,activity_quantity:2,residual:0,history_status:'reconciled',coverage_reasons:[],anchor:null};p.metrics.coverage.cost=[]
 render(<MemoryRouter><HoldingsList positions={[p]} quotes={{AAA:q}} privacyMode="visible" onOpenDetail={open}/><InvestmentAttention positions={[p]} quotes={{AAA:q}} refreshing={false} onRefresh={vi.fn()} onOpen={open}/></MemoryRouter>)
 expect(screen.getByText(/10 EUR/)).toBeVisible();expect(screen.getByText('Today move unavailable')).toBeVisible()
 if(minutes===26){expect(screen.getByText(/Delayed price · updated 26 minutes ago/)).toBeVisible();expect(screen.queryByRole('region',{name:'Investment needs attention'})).not.toBeInTheDocument()}
 else expect(screen.getByRole('region',{name:'Investment needs attention'})).toHaveTextContent('Market price is stale')
})

it('preserves purchase review independently of a modest quote delay, including in privacy mode',()=>{
 const p=fixture()[0];p.account.holding_position={quantity:2,activity_quantity:2,residual:0,history_status:'reconciled',coverage_reasons:[],anchor:null};p.metrics.coverage.cost=['unknown_cash_flow']
 const q={...quotes.AAA,status:'stale' as const,as_of:new Date(Date.now()-26*60_000).toISOString()}
 render(<MemoryRouter><HoldingsList positions={[p]} quotes={{AAA:q}} privacyMode="hidden" onOpenDetail={open}/><InvestmentAttention positions={[p]} quotes={{AAA:q}} refreshing={false} onRefresh={vi.fn()} onOpen={open}/></MemoryRouter>)
 expect(screen.getByRole('region',{name:'Investment needs attention'})).toHaveTextContent('Purchase cash details are missing')
 expect(screen.queryByText('Market price is stale')).not.toBeInTheDocument()
 expect(screen.getByText(/Delayed price/)).toBeVisible();expect(screen.queryByText(/10 EUR/)).not.toBeInTheDocument()
})

it('puts the accessible detail arrow in the trailing cell and shows a matching unrealized gain/percentage after sales',()=>{
 const p=fixture()[0];Object.assign(p.metrics,{remaining_basis:100,unrealized_gain:20,unrealized_gain_percent:20,total_gain:70,realized_gain:50});p.gainLoss=70;p.gainLossPercent=null
 render(<MemoryRouter><HoldingsList positions={[p]} quotes={quotes} privacyMode="visible" onOpenDetail={open}/></MemoryRouter>)
 const row=screen.getByRole('button',{name:'View AAA details'}).closest('tr')!
 expect(row.lastElementChild).toContainElement(screen.getByRole('button',{name:'View AAA details'}))
 expect(row.firstElementChild?.querySelector('svg')).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'View AAA details'}));expect(open).toHaveBeenCalledWith(p.account)
 expect(within(row).getByText('+20 HUF')).toBeVisible();expect(within(row).getByText('+20%')).toBeVisible()
 expect(within(row).queryByText('+70 HUF')).not.toBeInTheDocument();expect(within(row).queryByText('Estimated return unavailable')).not.toBeInTheDocument()
 const time=row.querySelector('time')!;expect(time).toHaveAttribute('datetime',quotes.AAA.as_of);expect(time.textContent).not.toContain('T12:00:00');expect(time.title).toContain(quotes.AAA.as_of)
})
it('keeps return unavailable for missing or zero basis and hides the new return signals in privacy mode',()=>{
 const p=fixture()[0];Object.assign(p.metrics,{unrealized_gain:20,unrealized_gain_percent:null,remaining_basis:0})
 const view=render(<MemoryRouter><HoldingsList positions={[p]} quotes={quotes} privacyMode="visible" onOpenDetail={open}/></MemoryRouter>)
 expect(screen.getByText('Return unavailable')).toBeVisible()
 p.metrics.unrealized_gain_percent=20
 view.rerender(<MemoryRouter><HoldingsList positions={[p]} quotes={quotes} privacyMode="hidden" onOpenDetail={open}/></MemoryRouter>)
 expect(screen.queryByText('+20%')).not.toBeInTheDocument();expect(screen.queryByText('+20 HUF')).not.toBeInTheDocument()
})
it('sorts the displayed unrealized gain independently of total realized-plus-unrealized gain',()=>{
 const [a,b]=fixture();a.metrics.unrealized_gain=10;b.metrics.unrealized_gain=20;a.gainLoss=100;b.gainLoss=0
 expect(sortHoldings([a,b],quotes,{...initialOverview,sort:'return'}).map(p=>p.account.id)).toEqual(['b','a'])
})
