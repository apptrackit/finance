import { CategoryType } from '../models/Category'

export interface CreateCategoryDto {
  name: string
  type: CategoryType
  icon?: string
}

export interface UpdateCategoryDto {
  name?: string
  type?: CategoryType
  icon?: string
}

export interface CategoryResponseDto {
  id: string
  name: string
  icon?: string
  type: CategoryType
}
