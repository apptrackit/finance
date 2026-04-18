export const ErrorCode = {
  // Account errors
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
  ACCOUNT_HAS_TRANSACTIONS: 'ACCOUNT_HAS_TRANSACTIONS',

  // Transaction errors
  TRANSACTION_NOT_FOUND: 'TRANSACTION_NOT_FOUND',
  TRANSACTION_INVALID_AMOUNT: 'TRANSACTION_INVALID_AMOUNT',

  // Category errors
  CATEGORY_NOT_FOUND: 'CATEGORY_NOT_FOUND',
  CATEGORY_NAME_TAKEN: 'CATEGORY_NAME_TAKEN',
  CATEGORY_IN_USE: 'CATEGORY_IN_USE',

  // Budget errors
  BUDGET_NOT_FOUND: 'BUDGET_NOT_FOUND',

  // Transfer errors
  TRANSFER_SAME_ACCOUNT: 'TRANSFER_SAME_ACCOUNT',
  EXCHANGE_RATE_UNAVAILABLE: 'EXCHANGE_RATE_UNAVAILABLE',

  // Recurring schedule errors
  RECURRING_SCHEDULE_NOT_FOUND: 'RECURRING_SCHEDULE_NOT_FOUND',
  RECURRING_INVALID_FREQUENCY: 'RECURRING_INVALID_FREQUENCY',

  // Market data errors
  MARKET_DATA_UNAVAILABLE: 'MARKET_DATA_UNAVAILABLE',
  MARKET_RATE_LIMITED: 'MARKET_RATE_LIMITED',

  // Generic errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

export type ErrorCodeKey = keyof typeof ErrorCode

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCodeKey,
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message)
    this.name = 'AppError'
  }

  static notFound(code: ErrorCodeKey, message: string): AppError {
    return new AppError(code, message, 404)
  }

  static validation(message: string): AppError {
    return new AppError('VALIDATION_ERROR', message, 400)
  }

  static internal(message: string): AppError {
    return new AppError('INTERNAL_ERROR', message, 500)
  }
}
