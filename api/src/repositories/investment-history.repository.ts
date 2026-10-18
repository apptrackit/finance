import {HOLDING_ACCOUNT_SELECT,mapHoldingAccount} from '../../../shared/holding'
import type {HistoryAnchor} from '../../../shared/investment-history'
import type {MetricAccount,MetricTrade} from '../../../shared/investment-metrics'
import type {ManualValuation} from '../../../shared/manual-valuation'
import {AppError} from '../errors/codes'
export class InvestmentHistoryRepository {
 constructor(private db:D1Database) {}
 async revision(){return (await this.db.prepare('SELECT revision FROM financial_data_revision WHERE id=1').first<number>('revision'))??0}
 async read(){
  const rows=await this.db.batch([
   this.db.prepare('SELECT revision FROM financial_data_revision WHERE id=1'),
   this.db.prepare(`${HOLDING_ACCOUNT_SELECT} WHERE a.type='investment' ORDER BY a.id LIMIT 101`),
   this.db.prepare('SELECT t.* FROM investment_transactions t JOIN accounts a ON a.id=t.account_id WHERE a.type=\'investment\' ORDER BY t.date,t.effective_order,t.id LIMIT 10001'),
   this.db.prepare('SELECT p.*,p.rowid AS record_order FROM investment_position_anchors p JOIN accounts a ON a.id=p.account_id WHERE a.type=\'investment\' ORDER BY p.rowid LIMIT 20001'),
   this.db.prepare('SELECT v.* FROM investment_valuations v JOIN accounts a ON a.id=v.account_id WHERE a.type=\'investment\' ORDER BY v.effective_date,v.id LIMIT 20001'),
  ])
  if(rows[1].results.length>100||rows[2].results.length>10000||rows[3].results.length>20000||rows[4].results.length>20000)
   throw new AppError('INVESTMENT_HISTORY_LIMIT','Portfolio history exceeds the supported fact limit; no history was truncated.',422)
  return {revision:(rows[0].results[0] as {revision:number}).revision,
   accounts:(rows[1].results as MetricAccount[]).map(a=>mapHoldingAccount(a)),trades:rows[2].results as MetricTrade[],
   anchors:(rows[3].results as HistoryAnchor[]).map(a=>({...a,owned:a.owned==null?null:Boolean(a.owned)})),valuations:rows[4].results as ManualValuation[]}
 }
}
