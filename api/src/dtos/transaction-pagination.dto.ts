import { Transaction } from '../models/Transaction'
import { PaginatedResponse, PaginationParams, DateFilterParams } from '../models/Pagination'

export interface TransactionPaginatedDto extends PaginatedResponse<Transaction> {}

export interface TransactionDateFilterDto extends DateFilterParams {
  account_id?: string
  category_id?: string
}
