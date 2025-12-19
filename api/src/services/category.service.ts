import { Category } from '../models/Category'
import { CategoryRepository } from '../repositories/category.repository'
import { CreateCategoryDto, UpdateCategoryDto } from '../dtos/category.dto'
import { DEFAULT_CATEGORIES } from '../config/constants'

export class CategoryService {
  constructor(private categoryRepo: CategoryRepository) {}

  async getAllCategories(): Promise<Category[]> {
    const categories = await this.categoryRepo.findAll()

    // Seed defaults if empty
    if (categories.length === 0) {
      const defaults = DEFAULT_CATEGORIES.map(d => ({
        id: crypto.randomUUID(),
        name: d.name,
        type: d.type as 'income' | 'expense',
        icon: d.icon
      }))

      await this.categoryRepo.batchCreate(defaults)
      return defaults
    }

    return categories
  }

  async createCategory(dto: CreateCategoryDto): Promise<Category> {
    // Validate required fields
    if (!dto.name || !dto.type) {
      throw new Error('Name and type are required')
    }

    if (dto.type !== 'income' && dto.type !== 'expense') {
      throw new Error('Type must be either "income" or "expense"')
    }

    // Check if category name already exists
    const existing = await this.categoryRepo.findByName(dto.name)
    if (existing) {
      throw new Error('A category with this name already exists')
    }

    const category: Category = {
      id: crypto.randomUUID(),
      name: dto.name,
      type: dto.type,
      icon: dto.icon || '📌'
    }

    await this.categoryRepo.create(category)
    return category
  }

  async updateCategory(id: string, dto: UpdateCategoryDto): Promise<Category> {
    // Validate at least one field is provided
    if (!dto.name && !dto.type && !dto.icon) {
      throw new Error('At least one field (name, type, or icon) must be provided')
    }

    // Validate type if provided
    if (dto.type && dto.type !== 'income' && dto.type !== 'expense') {
      throw new Error('Type must be either "income" or "expense"')
    }

    // Check if category exists
    const existing = await this.categoryRepo.findById(id)
    if (!existing) {
      throw new Error('Category not found')
    }

    // If updating name, check if new name already exists (excluding current category)
    if (dto.name) {
      const duplicate = await this.categoryRepo.findByNameExcludingId(dto.name, id)
      if (duplicate) {
        throw new Error('A category with this name already exists')
      }
    }

    await this.categoryRepo.update(id, dto)

    // Fetch and return updated category
    const updated = await this.categoryRepo.findById(id)
    return updated!
  }

  async deleteCategory(id: string): Promise<void> {
    // Check if category is being used by any transactions
    const count = await this.categoryRepo.countUsageInTransactions(id)
    if (count > 0) {
      throw new Error(`Cannot delete category that is being used by ${count} transactions`)
    }

    await this.categoryRepo.delete(id)
  }

  async resetToDefaults(): Promise<Category[]> {
    // Delete all existing categories
    await this.categoryRepo.deleteAll()

    // Insert defaults
    const defaults = DEFAULT_CATEGORIES.map(d => ({
      id: crypto.randomUUID(),
      name: d.name,
      type: d.type as 'income' | 'expense',
      icon: d.icon
    }))

    await this.categoryRepo.batchCreate(defaults)
    return defaults
  }
}
