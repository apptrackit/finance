import { describe, it, expect } from 'vitest'
import { AppError, ErrorCode } from '../errors/codes'

describe('AppError', () => {
  it('creates an error with code and message', () => {
    const err = new AppError('ACCOUNT_NOT_FOUND', 'Account not found', 404)
    expect(err.message).toBe('Account not found')
    expect(err.code).toBe('ACCOUNT_NOT_FOUND')
    expect(err.statusCode).toBe(404)
    expect(err.name).toBe('AppError')
  })

  it('defaults to 400 status code', () => {
    const err = new AppError('VALIDATION_ERROR', 'Bad input')
    expect(err.statusCode).toBe(400)
  })

  it('AppError.notFound creates 404 error', () => {
    const err = AppError.notFound('TRANSACTION_NOT_FOUND', 'Transaction missing')
    expect(err.statusCode).toBe(404)
    expect(err.code).toBe('TRANSACTION_NOT_FOUND')
  })

  it('AppError.validation creates 400 error', () => {
    const err = AppError.validation('Invalid amount')
    expect(err.statusCode).toBe(400)
    expect(err.code).toBe('VALIDATION_ERROR')
  })

  it('AppError.internal creates 500 error', () => {
    const err = AppError.internal('Something went wrong')
    expect(err.statusCode).toBe(500)
    expect(err.code).toBe('INTERNAL_ERROR')
  })

  it('is instanceof Error', () => {
    const err = new AppError('UNAUTHORIZED', 'Not allowed', 401)
    expect(err instanceof Error).toBe(true)
    expect(err instanceof AppError).toBe(true)
  })

  it('ErrorCode contains all expected keys', () => {
    expect(ErrorCode.ACCOUNT_NOT_FOUND).toBe('ACCOUNT_NOT_FOUND')
    expect(ErrorCode.VALIDATION_ERROR).toBe('VALIDATION_ERROR')
    expect(ErrorCode.UNAUTHORIZED).toBe('UNAUTHORIZED')
    expect(ErrorCode.RATE_LIMITED).toBe('RATE_LIMITED')
  })
})
