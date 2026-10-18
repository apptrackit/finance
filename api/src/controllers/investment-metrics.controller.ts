import type { Context } from 'hono'
import { createInvestmentMetricsReader, MetricsReadError } from '../../../shared/investment-metrics-reader'
import { tradeCurrencies } from '../../../shared/investment-trade'
import type { TradeInput } from '../../../shared/investment-trade'
import { AppError } from '../errors/codes'
import type { InvestmentTradeService } from '../services/investment-trade.service'
export class InvestmentMetricsController {
  constructor(private db:D1Database,private trades:InvestmentTradeService) {}
  private options(c:Context) {
    const currencies=(c.req.query('currencies')||'HUF,USD').split(',')
    if(currencies.length>2 || !currencies.length || currencies.some(v=>!(tradeCurrencies as readonly string[]).includes(v))) throw AppError.validation('Choose one or two supported reporting currencies')
    const scope=c.req.query('scope')??'investments'
    if(scope!=='investments' && scope!=='net_worth') throw AppError.validation('Unknown investment scope')
    return {currencies:[...new Set(currencies)],scope,date:c.req.header('X-Client-Date'),signal:c.req.raw.signal} satisfies import('../../../shared/investment-metrics-reader').MetricsReadOptions
  }
  private async respond(c:Context,run:()=>Promise<unknown>) {
    c.header('Cache-Control','no-store')
    try {return c.json(await run())} catch(error) {
      if(error instanceof MetricsReadError) throw new AppError(error.code==='conflict'?'INVESTMENT_METRICS_CONFLICT':'INVESTMENT_METRICS_LIMIT',error.message,error.code==='conflict'?409:422)
      throw error
    }
  }
  async read(c:Context) {
    const overview=c.req.query('overview')
    if(overview!==undefined&&overview!=='1'&&overview!=='0')throw AppError.validation('overview must be 1 or 0')
    return this.respond(c,()=>createInvestmentMetricsReader(this.db).read({...this.options(c),includeOverview:overview==='1'}))
  }
  async preview(c:Context) {
    c.header('Cache-Control','no-store')
    const options=this.options(c)
    const state=await this.trades.preview(c.get('validatedBody') as TradeInput,c.req.header('X-Client-Date'),c.req.query('trade_id'))
    return this.respond(c,async()=>{
      const result=await createInvestmentMetricsReader(this.db).read({...options,scope:'investments'},state)
      return {...result,preview_trade_id:state.trade_id,preview_cash_after:state.cash_after,preview_only:true}
    })
  }
}
