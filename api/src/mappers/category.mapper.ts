import { Category } from '../models/Category'
import { CategoryResponseDto } from '../dtos/category.dto'

export class CategoryMapper {
  static toResponseDto(category: Category): CategoryResponseDto {
    return {
      id: category.id,
      name: category.name,
      icon: category.icon,
      type: category.type
    }
  }
}
