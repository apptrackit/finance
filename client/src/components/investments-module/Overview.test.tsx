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
 expect(screen.getAllByRole('link',{name:'Review opening'}).length).toBeGreaterThan(0)
})
it('renders a native manual step sparkline and preserves explicit gaps',()=>{
 const p=fixture().slice(0,1),trend:HoldingTrend={kind:'unit_price',method:'step',status:'ok',currency:'EUR',reasons:[],points:[{date:'2026-01-01',value:null,as_of:null,provisional:false},{date:'2026-01-02',value:10,as_of:'2026-01-02',provisional:false},{date:'2026-01-03',value:20,as_of:'2026-01-03',provisional:false}]}
 render(<MemoryRouter><HoldingsList positions={p} quotes={quotes} privacyMode="visible" onOpenDetail={open} trends={{a:trend}}/></MemoryRouter>)
 const svg=screen.getByRole('img',{name:'30-day unit price history in EUR'})
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
