import { Context } from 'hono'
import { CategoryService } from '../services/category.service'
import { CategoryMapper } from '../mappers/category.mapper'
import { CreateCategoryDto, UpdateCategoryDto } from '../dtos/category.dto'

export class CategoryController {
  constructor(private categoryService: CategoryService) {}

  async getAll(c: Context) {
    try {
      const categories = await this.categoryService.getAllCategories()
      return c.json(categories.map(CategoryMapper.toResponseDto))
    } catch (error: any) {
      return c.json({ error: error.message }, 500)
    }
  }

  async create(c: Context) {
    try {
      const body = await c.req.json<CreateCategoryDto>()
      const category = await this.categoryService.createCategory(body)
      return c.json(CategoryMapper.toResponseDto(category), 201)
    } catch (error: any) {
      const status = error.message.includes('already exists') ? 409 : 400
      return c.json({ error: error.message }, status)
    }
  }

  async update(c: Context) {
    try {
      const id = c.req.param('id')
      const body = await c.req.json<UpdateCategoryDto>()
      const category = await this.categoryService.updateCategory(id, body)
      return c.json(CategoryMapper.toResponseDto(category))
    } catch (error: any) {
      const status = error.message.includes('not found') ? 404 
                   : error.message.includes('already exists') ? 409 
                   : 400
      return c.json({ error: error.message }, status)
    }
  }

  async delete(c: Context) {
    try {
      const id = c.req.param('id')
      await this.categoryService.deleteCategory(id)
      return c.json({ message: 'Category deleted successfully' })
    } catch (error: any) {
      return c.json({ 
        error: error.message,
        transactionCount: error.message.match(/\d+/)?.[0] 
      }, 400)
    }
  }

  async reset(c: Context) {
    try {
      const categories = await this.categoryService.resetToDefaults()
      return c.json(categories.map(CategoryMapper.toResponseDto))
    } catch (error: any) {
      return c.json({ error: error.message }, 500)
    }
  }
}
