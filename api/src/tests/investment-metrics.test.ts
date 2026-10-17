import {describe,expect,it} from 'vitest'
import examples from '../../../tests/fixtures/investment-accounting-v1.json'
import {holdingMetrics,estimatedReturn,portfolioMetrics} from '../../../shared/investment-metrics'
import type {MetricAccount,MetricTrade} from '../../../shared/investment-metrics'
import {missingQuote} from '../../../shared/market-data'
import {convertCurrency} from '../../../shared/currency'
const opening=(balance=0,cost:number|null=null,currency='USD'):MetricAccount=>({id:'holding',name:'Synthetic',type:'investment',balance,currency:'SHARE',quote_currency:currency,pricing_method:'manual',manual_price:100,asset_type:'etf',
  holding_position:{quantity:balance,activity_quantity:0,residual:0,history_status:'reconciled',coverage_reasons:[],anchor:{id:'opening',kind:'opening',effective_date:'2026-01-01',balance,cost_amount:cost,cost_currency:cost===null?null:currency,trade_rowid_boundary:0,created_at:1}}})
const convert=(amount:number,source:string,target:string)=>source===target?amount:null
const trade=(quantity:number,price:number,cash:number,type:'buy'|'sell'='buy',index=1):MetricTrade=>({id:`trade${index}`,account_id:'holding',type,quantity,price,total_amount:quantity*price,gross_amount:quantity*price,execution_currency:'USD',cash_currency:'USD',cash_amount:cash,fee_status:'known',fee_amount:Math.abs(cash-quantity*price),fee_currency:'USD',effective_order:index,date:`2026-01-${String(index+1).padStart(2,'0')}`})
const calculate=(account:MetricAccount,trades:MetricTrade[],currency='USD')=>holdingMetrics(account,trades,currency,undefined,convert,convert,'2026-10-17')
const close=(actual:number|null,expected:number|null)=>expected===null?expect(actual).toBeNull():expect(actual).toBeCloseTo(expected,8)
describe('production investment accounting against the reviewed golden fixtures',()=>{
 it('replays partial sale/rebuy/full liquidation without averaging all historical buys',()=>{
  const a=opening(),trades:MetricTrade[]=[]
  for(const [i,e] of examples.weighted_average.events.entries()) {
   trades.push(trade(e.quantity,e.price,e.net_cash,e.type as 'buy'|'sell',i+1));a.balance=e.expected.quantity;a.manual_price=e.mark
   const m=calculate(a,trades)
   for(const key of ['quantity','remaining_basis','realized_gain','net_invested','average_cost','value','unrealized_gain','total_gain'] as const) close(m[key],e.expected[key])
   expect(m.estimated_return_percent).toBeNull()
   expect(m.native.remaining_basis).toBe(m.remaining_basis)
  }
 })
 it('preserves observed current units independently of incomplete trades',()=>{
  const a=opening(5);a.holding_position!.anchor!.kind='observed';a.holding_position!.anchor!.trade_order_boundary=1;a.manual_price=20
  const m=calculate(a,[trade(2,10,20)])
  expect(m).toMatchObject({quantity:5,value:100,remaining_basis:null,net_invested:null,total_gain:null})
 })
 it('supports imported remaining basis without fabricating prior cash or realized gains',()=>{
  const a=opening(3,90);a.manual_price=40
  expect(calculate(a,[])).toMatchObject({remaining_basis:90,value:120,unrealized_gain:30,net_invested:null,realized_gain:null,total_gain:null})
  expect(calculate(a,[],'HUF')).toMatchObject({remaining_basis:null,value:null,native:{remaining_basis:90,unrealized_gain:30}})
 })
 it('recovers remaining basis only after completely disposing of unknown-cost units',()=>{
  const a=opening(3);a.balance=1;a.manual_price=20
  const m=calculate(a,[trade(3,30,90,'sell'),trade(1,20,20,'buy',2)])
  expect(m).toMatchObject({remaining_basis:20,average_cost:20,unrealized_gain:0,realized_gain:null,net_invested:null,total_gain:null})
 })
 it('uses exact cash and dated reporting FX, not current translation of native gain',()=>{
  const e=examples.cross_currency,a=opening();a.balance=e.quantity;a.quote_currency='EUR';a.manual_price=e.mark_price
  const t={...trade(e.quantity,e.execution_price,e.net_cash_paid),execution_currency:'EUR',cash_currency:'HUF',fee_currency:'HUF',fee_amount:e.included_fee_cash}
  const m=holdingMetrics(a,[t],'HUF',undefined,(n,s,r)=>convertCurrency(n,s,r,{EUR:1,HUF:e.mark_huf_per_eur},'EUR').value,convert,'2026-10-17')
  close(m.remaining_basis,e.expected.reporting_basis);close(m.native.remaining_basis,e.expected.native_basis)
  close(m.unrealized_gain,e.expected.reporting_unrealized_gain);close(m.native.unrealized_gain,e.expected.native_unrealized_gain)
  expect(m.unrealized_gain).not.toBe(e.expected.incorrect_current_fx_gain)
  const unknownFee=holdingMetrics(a,[{...t,fee_status:'unknown',fee_amount:null}],'HUF',undefined,()=>49200,convert,'2026-10-17')
  expect(unknownFee.remaining_basis).toBe(40400);expect(unknownFee.native.remaining_basis).toBeNull()
 })
 it('never counts a manual appraisal as new cost or cash',()=>{
  const a={...opening(),asset_type:'manual',currency:'USD',balance:1200,manual_ownership:'owned' as const}
  a.holding_position!.anchor!.owned=false
  const m=calculate(a,[{...trade(1,1000,1000),asset_event:'acquisition'}])
  expect(m).toMatchObject({quantity:1,value:1200,remaining_basis:1000,net_invested:1000,unrealized_gain:200,total_gain:200})
 })
 it('retains small crypto quantities without cash rounding',()=>{
  const e=examples.fractional_crypto,a=opening();a.balance=e.quantity;a.manual_price=e.mark_usd
  const m=calculate(a,[trade(e.quantity,e.price_usd,e.net_cash_usd)])
  close(m.value,e.expected.value_usd);close(m.remaining_basis,e.expected.remaining_basis_usd);close(m.average_cost,e.expected.average_cost_usd)
 })
 it('withholds derived gains across unsupported events, while retaining independently known value',()=>{
  const a=opening();a.balance=1
  const m=holdingMetrics(a,[trade(1,100,100)],'USD',undefined,convert,convert,'2026-10-17',true)
  expect(m.value).toBe(100);expect(m.total_gain).toBeNull();expect(m.coverage.cost).toContain('unsupported_event')
 })
 it('zero quantity needs neither quotes nor FX; unknown is never false zero',()=>{
  const a={...opening(),pricing_method:'market' as const,symbol:'TEST'}
  expect(holdingMetrics(a,[],'HUF',missingQuote('TEST',0),convert,convert,'2026-10-17')).toMatchObject({value:0,remaining_basis:0,average_cost:null})
  a.balance=2
  const m=holdingMetrics(a,[],'HUF',missingQuote('TEST',0),convert,convert,'2026-10-17')
  expect(m.value).toBeNull();expect(portfolioMetrics([m]).total_value).toBeNull()
  expect(m.unrealized_gain_percent).toBeNull()
 })
 it('rejects ambiguous order, inconsistent units and future rows without replacing current units',()=>{
  for(const patch of [{effective_order:null},{date:'2027-01-01'},{quantity:3}]) {
   const a=opening();a.balance=1
   const m=calculate(a,[{...trade(1,100,100),...patch}]);expect(m.quantity).toBe(1);expect(m.remaining_basis).toBeNull();expect(m.total_gain).toBeNull()
  }
 })
 it.each(examples.periods)('daily estimated return: $id',e=>{
  const m=estimatedReturn(e.start_value,e.days)
  close(m.gain,e.expected_gain);close(m.percent,e.expected_estimated_return===null?null:e.expected_estimated_return*100)
  e.days.forEach((d,i)=>close(m.factors[i],d.expected_factor))
 })
})
