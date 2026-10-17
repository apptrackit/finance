import { tradeCurrencies } from '../../../shared/investment-trade'
import { usesMarketPricing, validLocalDate } from '../../../shared/holding'
import { manualValuationStatus } from '../../../shared/manual-valuation'
import type { ManualValuation, ValuationInput } from '../../../shared/manual-valuation'
import { AppError } from '../errors/codes'
import { ManualValuationRepository } from '../repositories/manual-valuation.repository'

export class ManualValuationService {
  constructor(private repo: ManualValuationRepository) {}
  private today(date?: string) { return date && validLocalDate(date) ? date : new Date().toISOString().slice(0,10) }
  private async account(id: string, writing = false) {
    const a = await this.repo.account(id)
    if (!a) throw AppError.notFound('ACCOUNT_NOT_FOUND','Account not found')
    if (a.type !== 'investment' || usesMarketPricing(a)) throw AppError.validation('Choose a manually priced holding')
    if (writing && a.archived_at != null) throw new AppError('ACCOUNT_ARCHIVED','Restore the holding before updating its value.',409)
    if (writing && a.is_locked) throw new AppError('ACCOUNT_LOCKED','Unlock the holding before updating its value.',409)
    if (!(tradeCurrencies as readonly string[]).includes((a.asset_type === 'manual' ? a.currency : a.quote_currency)??'')) throw AppError.validation('A saved fiat valuation currency is required')
    return a
  }
  async history(id: string, query: Record<string,string>, clientDate?: string) {
    const today = this.today(clientDate)
    const at = query.at ?? today, before = query.before ?? '9999-12-31'
    const limit = query.limit === undefined ? 100 : Number(query.limit)
    if (!validLocalDate(at) || at > today || !validLocalDate(before) || !Number.isInteger(limit) || limit < 1 || limit > 200) throw AppError.validation('Use past/current dates and a history limit from 1 to 200')
    await this.account(id)
    const result = await this.repo.history(id,at,before,limit)
    return { ...result, at, valuation_status: manualValuationStatus(result.valuation_at,at) }
  }
  async save(id: string, input: ValuationInput, clientDate?: string) {
    const today = this.today(clientDate)
    if (input.effective_date > today) throw AppError.validation('A valuation cannot be dated in the future')
    const revision = await this.repo.revision()
    const a = await this.account(id,true)
    const before = await this.repo.observation(id,input.effective_date)
    // A lost successful response may be retried, but cannot overwrite a later correction.
    if (before && (input.expected_id === before.id || (input.expected_id === null && input.expected_version === 0)) && before.version === input.expected_version + 1 && before.amount === input.amount && before.source === 'user') return before
    if ((before?.version??0) !== input.expected_version || (before?.id??null) !== input.expected_id) throw new AppError('VALUATION_CONFLICT','This observation changed. Reload its history before correcting it.',409)
    const now = Date.now()
    const after: ManualValuation = { id:before?.id??crypto.randomUUID(),account_id:id,effective_date:input.effective_date,
      kind:a.asset_type==='manual'?'total':'per_unit',amount:input.amount,currency:a.asset_type==='manual'?a.currency:a.quote_currency!,
      source:'user',source_trade_id:before?.source_trade_id??null,version:(before?.version??0)+1,created_at:before?.created_at??now,updated_at:now }
    if (!await this.repo.save(revision,a,before,after)) throw new AppError('VALUATION_CONFLICT','Holding or valuation records changed. Refresh before saving.',409)
    return after
  }
}
