import { z } from 'zod'
import { validHoldingNumber, validLocalDate } from '../../../shared/holding'
import { tradeCurrencies, validSettlement } from '../../../shared/investment-trade'
export const InvestmentTradeSchema = z.object({
  idempotency_key: z.string().uuid(),
  expected_version:z.number().int().nonnegative().optional(),
  holding_account_id: z.string().min(1), cash_account_id: z.string().min(1),
  type: z.enum(['buy', 'sell']),
  quantity: z.number().positive().refine(validHoldingNumber, 'Unsupported quantity precision or range'),
  price: z.number().positive().refine(validHoldingNumber, 'Unsupported execution price precision or range'),
  execution_currency: z.enum(tradeCurrencies),
  cash_amount: z.number().positive().refine(validSettlement, 'Cash supports two decimal settlement digits'),
  fee_status: z.enum(['known', 'unknown']),
  fee_amount: z.number().refine(validSettlement, 'Fee supports two decimal settlement digits').nullable().optional(),
  date: z.string().refine(validLocalDate, 'Use a valid YYYY-MM-DD date'), notes: z.string().max(500).nullable().optional(),
}).strict()
