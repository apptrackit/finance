export interface PaginationParams {
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface PaginationMeta {
  total: number
  page: number
  limit: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}

export interface PaginatedResponse<T> {
  data: T[]
  meta: PaginationMeta
}

export interface DateFilterParams {
  startDate?: string
  endDate?: string
}

export class PaginationHelper {
  static calculateOffset(page: number, limit: number): number {
    return (page - 1) * limit
  }

  static createMeta(total: number, page: number, limit: number): PaginationMeta {
    const totalPages = Math.ceil(total / limit)
    return {
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  }

  static validatePaginationParams(params: PaginationParams): { page: number; limit: number } {
    const page = Math.max(1, params.page || 1)
    const limit = Math.min(100, Math.max(1, params.limit || 20)) // Max 100, default 20
    return { page, limit }
  }
}
