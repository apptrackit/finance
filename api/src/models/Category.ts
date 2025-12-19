export type CategoryType = 'income' | 'expense'

export interface Category {
  id: string
  name: string
  icon?: string
  type: CategoryType
}
