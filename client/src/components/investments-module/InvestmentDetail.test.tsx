import {cleanup,fireEvent,render,screen,within} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {InvestmentDetailModal} from './InvestmentDetailModal'
import {holdingMetrics} from '../../../../shared/investment-metrics'
import type {Account,Transaction} from './types'
const actions=vi.hoisted(()=>({confirm:vi.fn(),showAlert:vi.fn()}))
vi.mock('../../context/AlertContext',()=>({useAlert:()=>actions}))
vi.mock('recharts',()=>({ResponsiveContainer:()=>null,Line:()=>null,LineChart:()=>null,ReferenceLine:()=>null,Tooltip:()=>null,XAxis:()=>null,YAxis:()=>null}))
const base:Account={id:'holding',name:'Synthetic holding',type:'investment',asset_type:'stock',pricing_method:'manual',balance:2,currency:'SHARE',quote_currency:'EUR',manual_price:110,manual_price_date:'2026-01-10',updated_at:1}
const trade=(id:string,order:number):Transaction=>({id,account_id:'holding',date:'2026-01-10',effective_order:order,amount:100,quantity:1,price:100,execution_currency:'EUR',cash_amount:101,cash_currency:'EUR',fee_amount:1,fee_currency:'EUR',fee_status:'known',trade_version:1,linked_transaction_id:`cash-${id}`,is_recurring:false})
const edit=vi.fn(),openTrade=vi.fn()
const props={account:base,allTransactions:[trade('first',1),trade('second',2)],quotes:{},exchangeRates:{USD:1,EUR:1,HUF:400},privacyMode:'visible',reportingCurrency:'HUF',onClose:vi.fn(),onTrade:openTrade,onEdit:edit,canTrade:true,chartCache:new Map(),revisionKey:'one',editing:false,editError:null}
afterEach(()=>{cleanup();vi.unstubAllGlobals();edit.mockReset();openTrade.mockReset()})
it('orders the complete trade history by date and durable order and opens the canonical row',()=>{
 vi.stubGlobal('fetch',vi.fn<typeof fetch>().mockResolvedValue(Response.json({observations:[],valuation_at:null,next_cursor:null})))
 render(<InvestmentDetailModal {...props}/>)
 const list=screen.getByRole('region',{name:'Holding trade history'})
 const buttons=within(list).getAllByRole('button',{name:/Edit buy/})
 expect(buttons[0]).toHaveAccessibleName('Edit buy on 2026-01-10, trade 1');fireEvent.click(buttons[0]);expect(edit).toHaveBeenCalledWith(expect.objectContaining({id:'second',trade_version:1}))
 fireEvent.click(screen.getByRole('button',{name:'Sell',exact:true}));expect(openTrade).toHaveBeenCalledWith('sell')
 expect(screen.queryByText('$')).not.toBeInTheDocument()
})
it('shows a manual total once, its known cost and last valuation, with Update value instead of Buy/Sell',async()=>{
 const account:Account={...base,id:'manual',name:'Synthetic gold',asset_type:'manual',currency:'HUF',balance:1200,manual_ownership:'owned',manual_price:undefined,
  holding_position:{has_history:false,quantity:null,activity_quantity:0,residual:null,history_status:'reconciled',coverage_reasons:[],anchor:{id:'opening',kind:'opening',effective_date:'2026-01-01',balance:1000,owned:true,cost_amount:1000,cost_currency:'HUF',trade_rowid_boundary:0,created_at:1}},manual_valuation:{observation:null,as_of:'2026-01-10',age_days:100,stale_after_days:90,status:'stale'}}
 const metrics=holdingMetrics(account,[],'HUF',undefined,(n,s,t)=>s===t?n:null,(n,s,t)=>s===t?n:null,'2026-01-15')
 vi.stubGlobal('fetch',vi.fn<typeof fetch>().mockResolvedValue(Response.json({observations:[],valuation_at:null,next_cursor:null})))
 render(<InvestmentDetailModal {...props} account={account} allTransactions={[]} metrics={metrics}/>)
 expect(screen.getByText('1200 HUF')).toBeVisible();expect(screen.getByText('Remaining cost').parentElement).toHaveTextContent('1000 HUF')
 expect(screen.getByRole('button',{name:'Update value'})).toBeEnabled();expect(screen.queryByRole('button',{name:'Buy',exact:true})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Sell',exact:true})).not.toBeInTheDocument()
 expect(await screen.findByText(/Last valued 2026-01-10/)).toBeVisible()
})
it('withholds a missing manual unit price instead of showing a zero, and disables locked mutations',()=>{
 vi.stubGlobal('fetch',vi.fn<typeof fetch>().mockResolvedValue(Response.json({observations:[],valuation_at:null,next_cursor:null})))
 render(<InvestmentDetailModal {...props} account={{...base,manual_price:null,is_locked:true}}/>)
 const price=screen.getByText('Native price').closest('div')!
 expect(price).toHaveTextContent('Unavailable');expect(price).not.toHaveTextContent('0 EUR')
 expect(screen.getByRole('button',{name:'Buy',exact:true})).toBeDisabled();expect(screen.getByRole('button',{name:'Update value'})).toBeDisabled()
})
it('removes values, native prices, gain colors, fee amounts and execution descriptions in privacy mode',()=>{
 vi.stubGlobal('fetch',vi.fn<typeof fetch>().mockResolvedValue(Response.json({observations:[],valuation_at:null,next_cursor:null})))
 render(<InvestmentDetailModal {...props} privacyMode="hidden"/>)
 expect(screen.queryByText(/110 EUR|101 EUR|100 EUR|1 EUR|2 SHARE/)).not.toBeInTheDocument()
 expect(screen.getAllByText('••••••').length).toBeGreaterThan(4)
 expect(screen.getByRole('button',{name:'Buy',exact:true})).toBeDisabled()
 expect(screen.getAllByRole('button',{name:/Edit buy/}).every(b=>(b as HTMLButtonElement).disabled)).toBe(true)
})
it('opens historical details for an unlinked legacy purchase without presenting it as a new cash trade',()=>{
 vi.stubGlobal('fetch',vi.fn<typeof fetch>().mockResolvedValue(Response.json({observations:[],valuation_at:null,next_cursor:null})))
 const legacy={...trade('old',1),linked_transaction_id:undefined,execution_currency:undefined,cash_amount:null,trade_version:0}
 render(<InvestmentDetailModal {...props} allTransactions={[legacy]}/>);
 fireEvent.click(screen.getByRole('button',{name:/Confirm historical details for buy/}));expect(edit).toHaveBeenCalledWith(expect.objectContaining({id:'old',trade_version:0}));expect(screen.queryByText('Legacy record · read only')).not.toBeInTheDocument()
})

it.each([26,61])('uses the same delayed-price policy for a %s-minute quote in holding details',minutes=>{
 vi.stubGlobal('fetch',vi.fn<typeof fetch>().mockResolvedValue(Response.json({points:[],events:[]})))
 const q={symbol:'TEST',price:110,regularMarketPrice:110,currency:'EUR',status:'stale' as const,as_of:new Date(Date.now()-minutes*60_000).toISOString()}
 render(<InvestmentDetailModal {...props} account={{...base,pricing_method:'market',symbol:'TEST'}} quotes={{TEST:q}}/>)
 expect(screen.getByText('Native price').closest('div')).toHaveTextContent('110 EUR')
 if(minutes===26){expect(screen.getByText(/Delayed price · updated 26 minutes ago/)).toBeVisible();expect(screen.queryByText(/Market price is stale/)).not.toBeInTheDocument()}
 else expect(screen.getByText(/Market price is stale/)).toBeVisible()
})
