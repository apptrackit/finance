import { validHoldingNumber, validLocalDate } from '../../../shared/holding'
import { roundSettlement } from '../../../shared/investment-trade'
import type {
  LegacyDetails,
  LegacyDetailsInput,
} from '../../../shared/legacy-investment-details'
import { AppError } from '../errors/codes'
import { LegacyInvestmentDetailsRepository } from '../repositories/legacy-investment-details.repository'
const conflict = () =>
  new AppError(
    'TRADE_CONFLICT',
    'Historical details changed. Close this form and reopen it before saving.',
    409,
  )
export class LegacyInvestmentDetailsService {
  constructor(private repo: LegacyInvestmentDetailsRepository) {}
  private async snapshot(id: string, today: string, writing: boolean) {
    const s = await this.repo.snapshot(id),
      t = s.trade,
      a = s.account
    if (!t || !a)
      throw AppError.notFound(
        'TRANSACTION_NOT_FOUND',
        'Investment purchase/sale not found',
      )
    if (
      t.linked_transaction_id ||
      s.cash ||
      a.type !== 'investment' ||
      a.asset_type === 'manual'
    )
      throw new AppError(
        'TRADE_RECONCILIATION_REQUIRED',
        'This record is linked, ambiguous, or not a standalone unit trade. Use the linked trade editor or review its history.',
        409,
      )
    if (
      !validLocalDate(t.date) ||
      t.date > today ||
      !['buy', 'sell'].includes(t.type) ||
      !validHoldingNumber(t.quantity) ||
      t.quantity <= 0 ||
      !validHoldingNumber(t.price) ||
      t.price <= 0 ||
      !Number.isFinite(t.total_amount) ||
      Math.abs(t.total_amount - t.quantity * t.price) >
        Math.max(1e-10, Math.abs(t.total_amount) * Number.EPSILON * 8)
    )
      throw AppError.validation(
        'The saved date, quantity or price needs a separate history review before cost can be confirmed',
      )
    if (writing && a.archived_at != null)
      throw new AppError(
        'ACCOUNT_ARCHIVED',
        'Restore the holding before confirming historical details',
        409,
      )
    if (writing && a.is_locked)
      throw new AppError(
        'ACCOUNT_LOCKED',
        'Unlock the holding before confirming historical details',
        409,
      )
    return s
  }
  async read(id: string, today: string): Promise<LegacyDetails> {
    const s = await this.snapshot(id, today, false)
    if ((await this.repo.revision()) !== s.revision) throw conflict()
    return {
      trade: s.trade!,
      account: {
        name: s.account!.name,
        currency: s.account!.currency,
        is_locked: !!s.account!.is_locked,
        archived_at: s.account!.archived_at ?? null,
      },
    }
  }
  async save(id: string, input: LegacyDetailsInput, today: string) {
    const s = await this.snapshot(id, today, true),
      t = s.trade!
    if ((t.trade_version ?? 0) !== input.expected_version) throw conflict()
    if (input.fee_status === 'known') {
      if (input.fee_amount == null)
        throw AppError.validation(
          'Enter the included fee, including zero when confirmed',
        )
      if (input.execution_currency === input.cash_currency) {
        const expected = roundSettlement(
          t.quantity * t.price +
            (t.type === 'buy' ? input.fee_amount : -input.fee_amount),
        )
        if (expected <= 0 || Math.abs(expected - input.cash_amount) > 1e-8)
          throw AppError.validation(
            'Total paid/received must match the saved trade total plus the buy fee or minus the sale fee',
          )
      } else if (t.type === 'buy' && input.cash_amount <= input.fee_amount)
        throw AppError.validation(
          'The included fee must leave positive purchase cash',
        )
    } else if (input.fee_amount != null)
      throw AppError.validation(
        'Leave the fee empty when its breakdown is unknown',
      )
    if (!(await this.repo.save(s, input))) throw conflict()
    return {
      success: true,
      trade_version: input.expected_version + 1,
      cash_and_units_unchanged: true,
    }
  }
}
