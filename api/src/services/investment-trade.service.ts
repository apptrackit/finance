import { valuationAt } from '../../../shared/manual-valuation'
import type { ManualValuation } from '../../../shared/manual-valuation'
import { AppError } from '../errors/codes'
import { validLocalDate } from '../../../shared/holding'
import type { PositionAnchor } from '../../../shared/holding'
import { addExact as addExactValue, roundSettlement, settlementDetails, unitInteger as unitIntegerValue, tradeCurrencies } from '../../../shared/investment-trade'
import type { TradeInput } from '../../../shared/investment-trade'
import { InvestmentTradeSchema } from '../validators/investment-trade.validator'
import type { Account } from '../models/Account'
import type { InvestmentTransaction } from '../models/InvestmentTransaction'
import type { TradeOperation, TradeResult, TradeState } from '../repositories/investment-trade.repository'
import { InvestmentTradeRepository } from '../repositories/investment-trade.repository'

const conflict = () => new AppError('TRADE_CONFLICT', 'Investment records changed; refresh and retry with the same request key.', 409)
const reconcile = (message: string) => new AppError('TRADE_RECONCILIATION_REQUIRED', message, 409)
const signed = (t: InvestmentTransaction) => t.type === 'buy' ? t.quantity : -t.quantity
const unitInteger = (value: number) => {
  try { return unitIntegerValue(value) } catch (e) { throw AppError.validation((e as Error).message) }
}
const addExact = (a: number,b: number) => {
  try { return addExactValue(a,b) } catch (e) { throw AppError.validation((e as Error).message) }
}
export class InvestmentTradeService {
  constructor(private repo: InvestmentTradeRepository) {}
  private today(value?: string) { return value && validLocalDate(value) ? value : new Date().toISOString().slice(0,10) }
  private async capacity(now: number) {
    if (!await this.repo.hasCapacity(now)) throw new AppError('RATE_LIMITED','The 24-hour trade retry receipt limit is full. Retry after receipts expire; no trade was changed.',429)
  }
  private async hash(value: unknown) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))
    return [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2,'0')).join('')
  }
  private async replay(key: string, hash: string, now: number): Promise<TradeResult | null> {
    const prior = await this.repo.replay(key,now)
    if (!prior) return null
    if (prior.request_hash !== hash) throw new AppError('TRADE_IDEMPOTENCY', 'This request key was already used for different trade details. Start a new submission.', 409)
    return JSON.parse(prior.response_json) as TradeResult
  }
  private account(state: TradeState, id: string, holding: boolean): Account {
    const a = state.accounts.find(a => a.id === id)
    if (!a) throw AppError.notFound('ACCOUNT_NOT_FOUND','Account not found')
    if (a.archived_at != null) throw new AppError('ACCOUNT_ARCHIVED','Restore both accounts before changing a trade.',409)
    if (a.is_locked) throw new AppError('ACCOUNT_LOCKED','Unlock both accounts before changing a trade.',409)
    if ((a.type === 'investment') !== holding) throw AppError.validation('A trade needs one cash account and one investment holding')
    return a
  }
  private timeline(state: TradeState, account: Account, before: InvestmentTransaction | undefined,
    after: InvestmentTransaction | undefined, today: string): { balance: number; baseline?: PositionAnchor } {
    if (account.asset_type === 'manual') throw AppError.validation('Use the manual ownership timeline')
    const oldEvents = state.trades.filter(t => t.account_id === account.id)
    const savedAnchor = account.holding_position?.anchor
    const baseline: PositionAnchor = savedAnchor ?? {
      id: crypto.randomUUID(),kind:'observed',effective_date:today,balance:account.balance,cost_amount:null,cost_currency:null,
      trade_rowid_boundary:0,trade_order_boundary:Math.max(0,...oldEvents.map(t => t.effective_order ?? 0)),created_at:Date.now(),
    }
    const included = (t: InvestmentTransaction) => baseline.kind === 'opening'
      ? t.date > baseline.effective_date : (t.effective_order ?? 0) > (baseline.trade_order_boundary ?? baseline.trade_rowid_boundary)
    for (const t of [before,after].filter((t): t is InvestmentTransaction => !!t && t.account_id === account.id)) {
      if (baseline.kind === 'opening' ? t.date <= baseline.effective_date : t.date < baseline.effective_date || !included(t)) {
        throw reconcile('This trade crosses the saved position boundary. Confirm a dated opening before this trade in Accounts before changing its unit impact.')
      }
    }
    const replay = (events: InvestmentTransaction[]) => {
      let quantity = unitInteger(baseline.balance)
      for (const t of events.filter(included).sort((a,b) => a.date.localeCompare(b.date) || (a.effective_order ?? 0)-(b.effective_order ?? 0) || a.id.localeCompare(b.id))) {
        if (!Number.isSafeInteger(t.effective_order) || (t.effective_order ?? 0)<1) throw reconcile('This legacy trade has ambiguous event order; reconcile its history before changing the position.')
        if (t.date < baseline.effective_date || t.date > today) throw reconcile('Resolve legacy activity outside the supported position dates before recording this trade.')
        quantity += unitInteger(signed(t))
        if (quantity < 0n) throw new AppError('TRADE_OVERSELL','This change would make the holding negative on this trade date or a later trade date.',409)
      }
      return quantity
    }
    if (replay(oldEvents) !== unitInteger(account.balance)) throw reconcile('Current units and supported activity do not reconcile. Confirm the opening or a current correction in Accounts first.')
    const next = oldEvents.filter(t => t.id !== before?.id)
    if (after?.account_id === account.id) next.push(after)
    const quantity = replay(next)
    const balance = Number(quantity)/1e12
    if (unitInteger(balance) !== quantity) throw AppError.validation('Result exceeds supported quantity precision')
    return { balance, ...(!savedAnchor ? { baseline } : {}) }
  }
  private manualTimeline(op: TradeOperation, account: Account, today: string) {
    const before = op.before?.trade, after = op.after?.trade
    const anchor = account.holding_position?.anchor
    if (!anchor) throw reconcile('Confirm an opening position in Accounts before acquiring or disposing of a manual asset.')
    const included = (t: InvestmentTransaction) => anchor.kind === 'opening' ? t.date > anchor.effective_date
      : (t.effective_order ?? 0) > (anchor.trade_order_boundary ?? anchor.trade_rowid_boundary)
    for (const t of [before,after].filter((t): t is InvestmentTransaction => !!t && t.account_id === account.id)) {
      if (!included(t) || t.date < anchor.effective_date) throw reconcile('This asset event crosses the saved opening/observation boundary.')
      if (t.quantity !== 1 || !t.asset_event) throw AppError.validation('Manual assets support one whole ITEM only; partial disposal is unsupported')
    }
    const oldEvents = op.state.trades.filter(t => t.account_id === account.id && included(t))
    const replay = (events: InvestmentTransaction[]) => {
      let owned: boolean | null = anchor.owned ?? (anchor.balance > 0 ? true : null)
      for (const t of events.sort((a,b) => a.date.localeCompare(b.date) || (a.effective_order??0)-(b.effective_order??0) || a.id.localeCompare(b.id))) {
        if (!t.asset_event || t.quantity !== 1 || t.date < anchor.effective_date || t.date > today) throw reconcile('Resolve unsupported legacy manual activity before changing ownership.')
        if (owned === null) throw reconcile('A legacy zero value does not establish ownership. Confirm a known opening in Accounts first.')
        if (t.asset_event === 'acquisition' ? owned : !owned) throw new AppError('MANUAL_ASSET_OWNED',t.asset_event==='acquisition'?'This asset is already owned on the event date.':'The complete asset must be owned before its disposal.',409)
        owned = t.asset_event === 'acquisition'
      }
      return owned
    }
    replay([...oldEvents])
    const nextEvents = oldEvents.filter(t => t.id !== before?.id)
    if (after?.account_id === account.id) nextEvents.push(after)
    const owned = replay(nextEvents)
    const removed = before?.asset_event === 'acquisition' ? op.state.valuations.filter(v => v.source_trade_id === before.id && v.source === 'acquisition') : []
    op.removeValuations = [...(op.removeValuations??[]),...removed.map(v => v.id)]
    const values = op.state.valuations.filter(v => v.account_id === account.id && !removed.includes(v))
    if (after?.account_id === account.id && after.asset_event === 'acquisition' && !values.some(v => v.effective_date === after.date)) {
      const v: ManualValuation = { id:crypto.randomUUID(),source_trade_id:after.id,account_id:account.id,effective_date:after.date,kind:'total',amount:after.price,
        currency:after.execution_currency!,source:'acquisition',version:1,created_at:op.now,updated_at:op.now }
      values.push(v); op.addValuations = [...(op.addValuations??[]),v]
    }
    const latest = valuationAt(values,today)
    if (owned && !latest) throw reconcile('A current manual appraisal is required before restoring ownership.')
    op.balances.set(account.id,owned ? latest!.amount : 0)
  }
  async save(input: TradeInput, clientDate?: string, id?: string): Promise<TradeResult> {
    return this.execute(input,clientDate,id,false)
  }
  async preview(input: TradeInput, clientDate?: string, id?: string) {
    return this.execute(input,clientDate,id,true)
  }
  private execute(input: TradeInput, clientDate: string | undefined, id: string | undefined, preview: false): Promise<TradeResult>
  private execute(input: TradeInput, clientDate: string | undefined, id: string | undefined, preview: true): Promise<{account: Account; trades: InvestmentTransaction[]; trade_id:string;revision:number}>
  private async execute(input: TradeInput, clientDate: string | undefined, id: string | undefined, preview: boolean) {
    const parsed = InvestmentTradeSchema.safeParse(input)
    if (!parsed.success) throw AppError.validation(parsed.error.issues.map(i => i.message).join('; '))
    const t = parsed.data
    const today = this.today(clientDate)
    if (t.date > today) throw AppError.validation('Future investment posting is unsupported; choose today or an earlier execution date')
    if (t.holding_account_id === t.cash_account_id) throw AppError.validation('Choose different cash and holding accounts')
    if ((t.fee_status === 'known') !== (t.fee_amount != null)) throw AppError.validation('Enter the included fee, including zero, or explicitly choose unknown')
    const facts = settlementDetails(t)
    if (!Number.isFinite(facts.gross_amount) || facts.gross_amount < 0 || facts.gross_amount > 1e12) throw AppError.validation('Gross execution amount exceeds the supported range')
    const hash = await this.hash([id ?? null,t.holding_account_id,t.cash_account_id,t.type,t.quantity,t.price,t.execution_currency,t.cash_amount,t.fee_status,t.fee_amount??null,t.date,t.notes??null,t.expected_version??null])
    const now = Date.now()
    for (let attempt=0; attempt<5; attempt++) {
      if (!preview) {
        const prior = await this.replay(t.idempotency_key,hash,now)
        if (prior) return prior
        await this.capacity(now)
      }
      const found = id ? await this.repo.findTrade(id) : null
      if (id && !found) throw AppError.notFound('TRANSACTION_NOT_FOUND','Investment trade not found')
      const state = await this.repo.state([...new Set([t.holding_account_id,...(found ? [found.account_id] : [])])])
      const existing = found ? state.trades.find(row => row.id === found.id) : undefined
      if (found && !existing) continue
      if (existing && t.expected_version !== existing.trade_version) throw conflict()
      const holding = this.account(state,t.holding_account_id,true)
      const cash = this.account(state,t.cash_account_id,false)
      const total = holding.asset_type === 'manual'
      const zeroDisposal = total && t.type === 'sell' && t.price === 0 && t.cash_amount === 0 && t.fee_status === 'known' && t.fee_amount === 0
      if (!zeroDisposal && (t.price === 0 || t.cash_amount === 0)) throw AppError.validation('A positive price and cash settlement are required, except a confirmed zero-proceeds full manual disposal')
      if (total && (t.quantity !== 1 || t.execution_currency !== holding.currency)) throw AppError.validation('A manual acquisition/disposal uses exactly one ITEM and a total executed price in the asset valuation currency')
      if (existing && ((existing.asset_event != null) !== total || (total && existing.account_id !== holding.id))) throw AppError.validation('Keep manual asset events on their original holding; do not convert unit trades into appraisals')
      if (!(tradeCurrencies as readonly string[]).includes(cash.currency)) throw AppError.validation('This cash currency has no supported settlement precision')
      if (t.execution_currency === cash.currency) {
        if (t.fee_status !== 'known') throw AppError.validation('Confirm the included fee, including zero, for a same-currency trade')
        const expected = roundSettlement(facts.gross_amount + (t.type === 'buy' ? t.fee_amount! : -t.fee_amount!))
        if ((!zeroDisposal && expected <= 0) || Math.abs(expected-t.cash_amount)>1e-8) throw AppError.validation('Exact cash must equal the settled gross amount plus the buy fee or minus the sale fee')
      } else if (!zeroDisposal && t.fee_status === 'known' && !facts.implied_settlement_rate) throw AppError.validation('The known included fee must leave positive gross settlement cash')
      const before = existing ? await this.pair(state,existing) : undefined
      const tradeId = existing?.id ?? crypto.randomUUID()
      const cashId = before?.cash.id ?? crypto.randomUUID()
      const trade: InvestmentTransaction = { id:tradeId,account_id:holding.id,type:t.type,quantity:t.quantity,price:t.price,total_amount:facts.gross_amount,
        date:t.date,notes:t.notes??undefined,created_at:existing?.created_at??now,linked_transaction_id:cashId,
        execution_currency:t.execution_currency,gross_amount:facts.gross_amount,fee_status:t.fee_status,
        fee_amount:t.fee_amount??null,fee_currency:t.fee_status==='known'?cash.currency:null,cash_amount:t.cash_amount,cash_currency:cash.currency,
        asset_event:total?(t.type==='buy'?'acquisition':'disposal'):null,
        effective_order:existing?.effective_order??Number.MAX_SAFE_INTEGER,trade_version:existing?(existing.trade_version??0)+1:1 }
      const cashRow = { id:cashId,account_id:cash.id,amount:t.type==='buy'?-t.cash_amount:t.cash_amount,
        date:t.date,description:`${t.type==='buy'?'Buy':'Sell'} ${holding.name}${t.notes?` - ${t.notes}`:''}`,linked_transaction_id:tradeId }
      const result: TradeResult = { trade_id:tradeId,cash_transaction_id:cashId,type:t.type }
      const op: TradeOperation = { key:t.idempotency_key,hash,now,state,result,before,after:{ trade,cash:cashRow },balances:new Map(),anchors:[] }
      for (const holdingId of new Set([holding.id,...(existing?[existing.account_id]:[])])) {
        const a = this.account(state,holdingId,true)
        if (a.asset_type === 'manual') { this.manualTimeline(op,a,today); continue }
        const position = this.timeline(state,a,existing,trade,today)
        op.balances.set(a.id,position.balance)
        if (position.baseline) op.anchors.push({ accountId:a.id,anchor:position.baseline })
      }
      if (before) op.balances.set(before.cash.account_id,addExact(this.account(state,before.cash.account_id,false).balance,-before.cash.amount))
      op.balances.set(cash.id,addExact(op.balances.get(cash.id)??cash.balance,cashRow.amount))
      if (preview) {
        const balance=op.balances.get(holding.id)!
        const baseline=op.anchors.find(a=>a.accountId===holding.id)?.anchor
        const account: Account={...holding,balance,
          ...(baseline?{holding_position:{...holding.holding_position!,anchor:baseline}}:{}),
          ...(total?{manual_ownership:t.type==='buy'?'owned' as const:'disposed' as const}:{})}
        return {account,trades:[...state.trades.filter(row=>row.account_id===holding.id && row.id!==existing?.id),trade],trade_id:trade.id,revision:state.revision}
      }
      if (await this.repo.commit(op)) return result
    }
    throw conflict()
  }
  private async pair(state: TradeState, trade: InvestmentTransaction) {
    const links = await this.repo.cashLinks(trade.id)
    if (!trade.linked_transaction_id || links.length!==1 || links[0].id!==trade.linked_transaction_id) throw reconcile('This legacy record has no consistent cash pair. Keep it read-only until its unit impact and cash history are reconciled.')
    const cash = links[0]
    if ((cash.status??'posted')!=='posted' || cash.date!==trade.date || (trade.type==='buy'?cash.amount>=0:cash.amount<0 || (cash.amount===0 && !(trade.asset_event==='disposal' && trade.cash_amount===0 && trade.price===0 && trade.fee_amount===0)))) throw reconcile('The linked cash and trade records disagree; reconcile the pair first')
    this.account(state,trade.account_id,true)
    const a = this.account(state,cash.account_id,false)
    if ((trade.cash_amount!=null && trade.cash_amount!==Math.abs(cash.amount)) || (trade.cash_currency!=null && trade.cash_currency!==a.currency)) throw reconcile('Recorded settlement cash no longer matches the linked cash ledger')
    return { trade,cash }
  }
  async remove(id: string, clientDate?: string): Promise<void> {
    for (let attempt=0;attempt<5;attempt++) {
      const found = await this.repo.findTrade(id)
      if (!found) return
      await this.capacity(Date.now())
      const state = await this.repo.state([found.account_id])
      const trade = state.trades.find(t => t.id===found.id)
      if (!trade) continue
      const before = await this.pair(state,trade)
      const holding = this.account(state,trade.account_id,true)
      const cash = this.account(state,before.cash.account_id,false)
      const position = holding.asset_type === 'manual' ? null : this.timeline(state,holding,trade,undefined,this.today(clientDate))
      const op: TradeOperation = { key:crypto.randomUUID(),hash:await this.hash(['delete',trade.id]),now:Date.now(),state,
        result:{trade_id:trade.id,cash_transaction_id:before.cash.id,type:trade.type,deleted:true},before,
        balances:new Map([[holding.id,position?.balance??holding.balance],[cash.id,addExact(cash.balance,-before.cash.amount)]]),
        anchors:position?.baseline?[{accountId:holding.id,anchor:position.baseline}]:[] }
      if (holding.asset_type === 'manual') this.manualTimeline(op,holding,this.today(clientDate))
      if (await this.repo.commit(op)) return
    }
    throw conflict()
  }
}
