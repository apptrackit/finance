import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../common/card'
import { Button } from '../../common/button'
import { Input } from '../../common/input'
import { Label } from '../../common/label'
import { Select } from '../../common/select'
import { Plus, Trash2, Tag, Pencil, Check, X, ChevronDown } from 'lucide-react'
import { API_BASE_URL, apiFetch } from '../../../config'
import { useAlert } from '../../../context/AlertContext'
import { EmojiPicker } from './EmojiPicker'
import type { Category } from '../types'

export function CategoriesCard() {
  const { showAlert, confirm } = useAlert()

  const [categories, setCategories] = useState<Category[]>([])
  const [isLoadingCategories, setIsLoadingCategories] = useState(true)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryType, setNewCategoryType] = useState<'income' | 'expense'>('expense')
  const [newCategoryIcon, setNewCategoryIcon] = useState('📌')
  const [isAddingCategory, setIsAddingCategory] = useState(false)

  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editCategoryName, setEditCategoryName] = useState('')
  const [editCategoryType, setEditCategoryType] = useState<'income' | 'expense'>('expense')
  const [editCategoryIcon, setEditCategoryIcon] = useState('📌')
  const [isUpdatingCategory, setIsUpdatingCategory] = useState(false)
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null)

  const [showNewEmojiPicker, setShowNewEmojiPicker] = useState(false)
  const [showEditEmojiPicker, setShowEditEmojiPicker] = useState<string | null>(null)

  const [showIncomeCategoryList, setShowIncomeCategoryList] = useState(false)
  const [showExpenseCategoryList, setShowExpenseCategoryList] = useState(false)

  useEffect(() => {
    loadCategories()
  }, [])

  const loadCategories = async () => {
    try {
      setIsLoadingCategories(true)
      const res = await apiFetch(`${API_BASE_URL}/categories`)
      const data = await res.json()
      setCategories(data)
    } catch (error) {
      console.error('Failed to load categories:', error)
    } finally {
      setIsLoadingCategories(false)
    }
  }

  const extractSingleEmoji = (str: string): string => {
    const emojiRegex = /\p{Emoji_Presentation}|\p{Emoji}\uFE0F/gu
    const matches = str.match(emojiRegex)
    return matches ? matches[0] : '📌'
  }

  const handleNewIconChange = (value: string) => {
    if (value === '') {
      setNewCategoryIcon('📌')
    } else {
      setNewCategoryIcon(extractSingleEmoji(value))
    }
  }

  const handleEditIconChange = (value: string) => {
    if (value === '') {
      setEditCategoryIcon('📌')
    } else {
      setEditCategoryIcon(extractSingleEmoji(value))
    }
  }

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      showAlert({
        type: 'warning',
        title: 'Missing Information',
        message: 'Please enter a category name'
      })
      return
    }

    setIsAddingCategory(true)
    try {
      const res = await apiFetch(`${API_BASE_URL}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCategoryName.trim(),
          type: newCategoryType,
          icon: newCategoryIcon
        })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create category')
      }

      const newCategory = await res.json()
      setCategories([...categories, newCategory])

      setNewCategoryName('')
      setNewCategoryIcon('📌')
      setNewCategoryType('expense')

      showAlert({
        type: 'success',
        title: 'Category Added',
        message: `"${newCategory.name}" has been created successfully`
      })
    } catch (error) {
      console.error('Failed to add category:', error)
      showAlert({
        type: 'error',
        title: 'Failed to Add Category',
        message: error instanceof Error ? error.message : 'Failed to add category'
      })
    } finally {
      setIsAddingCategory(false)
    }
  }

  const handleDeleteCategory = async (id: string, name: string) => {
    const confirmed = await confirm({
      title: 'Delete Category',
      message: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel'
    })

    if (!confirmed) {
      return
    }

    setDeletingCategoryId(id)
    try {
      const res = await apiFetch(`${API_BASE_URL}/categories/${id}`, {
        method: 'DELETE'
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete category')
      }

      setCategories(categories.filter(c => c.id !== id))

      showAlert({
        type: 'success',
        title: 'Category Deleted',
        message: `"${name}" has been removed`
      })
    } catch (error) {
      console.error('Failed to delete category:', error)
      showAlert({
        type: 'error',
        title: 'Failed to Delete Category',
        message: error instanceof Error ? error.message : 'Failed to delete category'
      })
    } finally {
      setDeletingCategoryId(null)
    }
  }

  const handleStartEdit = (category: Category) => {
    setEditingCategoryId(category.id)
    setEditCategoryName(category.name)
    setEditCategoryType(category.type)
    setEditCategoryIcon(category.icon || '📌')
  }

  const handleCancelEdit = () => {
    setEditingCategoryId(null)
    setEditCategoryName('')
    setEditCategoryType('expense')
    setEditCategoryIcon('📌')
  }

  const handleUpdateCategory = async (id: string) => {
    if (!editCategoryName.trim()) {
      showAlert({
        type: 'warning',
        title: 'Missing Information',
        message: 'Please enter a category name'
      })
      return
    }

    setIsUpdatingCategory(true)
    try {
      const res = await apiFetch(`${API_BASE_URL}/categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editCategoryName.trim(),
          type: editCategoryType,
          icon: editCategoryIcon
        })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update category')
      }

      const updatedCategory = await res.json()
      setCategories(categories.map(c => (c.id === id ? updatedCategory : c)))

      handleCancelEdit()

      showAlert({
        type: 'success',
        title: 'Category Updated',
        message: `"${updatedCategory.name}" has been updated successfully`
      })
    } catch (error) {
      console.error('Failed to update category:', error)
      showAlert({
        type: 'error',
        title: 'Failed to Update Category',
        message: error instanceof Error ? error.message : 'Failed to update category'
      })
    } finally {
      setIsUpdatingCategory(false)
    }
  }

  const incomeCategories = categories.filter(c => c.type === 'income')
  const expenseCategories = categories.filter(c => c.type === 'expense')

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
            <Tag className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <CardTitle>Categories</CardTitle>
            <CardDescription>Manage your income and expense categories</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Add New Category</h3>
          <div className="flex flex-col sm:grid sm:grid-cols-[auto_1fr_auto_auto] gap-3 sm:gap-2 sm:items-end">
            <div className="space-y-2 relative">
              <Label htmlFor="category-icon">Icon</Label>
              <div className="relative">
                <Input
                  id="category-icon"
                  type="text"
                  value={newCategoryIcon}
                  onChange={e => handleNewIconChange(e.target.value)}
                  onClick={() => setShowNewEmojiPicker(!showNewEmojiPicker)}
                  placeholder="📌"
                  maxLength={4}
                  className="w-16 h-10 text-center text-2xl p-0 cursor-pointer"
                  title="Click to choose emoji"
                />
                {showNewEmojiPicker && (
                  <EmojiPicker
                    onChange={(emoji) => {
                      setNewCategoryIcon(emoji)
                      setShowNewEmojiPicker(false)
                    }}
                    onClose={() => setShowNewEmojiPicker(false)}
                  />
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="category-name">Name</Label>
              <Input
                id="category-name"
                type="text"
                placeholder="e.g., Dining Out"
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category-type">Type</Label>
              <Select
                id="category-type"
                value={newCategoryType}
                onChange={e => setNewCategoryType(e.target.value as 'income' | 'expense')}
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </Select>
            </div>
            <Button
              onClick={handleAddCategory}
              disabled={isAddingCategory || !newCategoryName.trim()}
              className="w-full sm:w-auto"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-green-600">Income Categories</h3>
            {!isLoadingCategories && incomeCategories.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowIncomeCategoryList(!showIncomeCategoryList)}
                className="text-xs"
              >
                {showIncomeCategoryList ? 'Collapse' : 'Expand List'}
                <ChevronDown className={`ml-1 h-3 w-3 transition-transform ${showIncomeCategoryList ? 'rotate-180' : ''}`} />
              </Button>
            )}
          </div>
          {isLoadingCategories ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : incomeCategories.length === 0 ? (
            <p className="text-sm text-muted-foreground">No income categories yet</p>
          ) : showIncomeCategoryList ? (
            <div className="space-y-2">
              {incomeCategories.map(category => (
                editingCategoryId === category.id ? (
                  <div
                    key={category.id}
                    className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 items-center p-3 rounded-lg border bg-accent"
                  >
                    <div className="relative">
                      <Input
                        type="text"
                        value={editCategoryIcon}
                        onChange={e => handleEditIconChange(e.target.value)}
                        onClick={() => setShowEditEmojiPicker(showEditEmojiPicker === category.id ? null : category.id)}
                        placeholder="📌"
                        maxLength={4}
                        className="w-14 h-10 text-center text-2xl p-0 cursor-pointer"
                        title="Click to choose emoji"
                      />
                      {showEditEmojiPicker === category.id && (
                        <EmojiPicker
                          onChange={(emoji) => {
                            setEditCategoryIcon(emoji)
                            setShowEditEmojiPicker(null)
                          }}
                          onClose={() => setShowEditEmojiPicker(null)}
                        />
                      )}
                    </div>
                    <Input
                      type="text"
                      value={editCategoryName}
                      onChange={e => setEditCategoryName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleUpdateCategory(category.id)}
                    />
                    <Select
                      value={editCategoryType}
                      onChange={e => setEditCategoryType(e.target.value as 'income' | 'expense')}
                    >
                      <option value="expense">Expense</option>
                      <option value="income">Income</option>
                    </Select>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleUpdateCategory(category.id)}
                      disabled={isUpdatingCategory}
                      className="text-green-600 hover:text-green-700 hover:bg-green-50"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCancelEdit}
                      disabled={isUpdatingCategory}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div
                    key={category.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{category.icon}</span>
                      <span className="font-medium">{category.name}</span>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleStartEdit(category)}
                        className="hover:bg-accent"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={deletingCategoryId === category.id}
                        onClick={() => handleDeleteCategory(category.id, category.name)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-red-600">Expense Categories</h3>
            {!isLoadingCategories && expenseCategories.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowExpenseCategoryList(!showExpenseCategoryList)}
                className="text-xs"
              >
                {showExpenseCategoryList ? 'Collapse' : 'Expand List'}
                <ChevronDown className={`ml-1 h-3 w-3 transition-transform ${showExpenseCategoryList ? 'rotate-180' : ''}`} />
              </Button>
            )}
          </div>
          {isLoadingCategories ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : expenseCategories.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expense categories yet</p>
          ) : showExpenseCategoryList ? (
            <div className="space-y-2">
              {expenseCategories.map(category => (
                editingCategoryId === category.id ? (
                  <div
                    key={category.id}
                    className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 items-center p-3 rounded-lg border bg-accent"
                  >
                    <div className="relative">
                      <Input
                        type="text"
                        value={editCategoryIcon}
                        onChange={e => handleEditIconChange(e.target.value)}
                        onClick={() => setShowEditEmojiPicker(showEditEmojiPicker === category.id ? null : category.id)}
                        placeholder="📌"
                        maxLength={4}
                        className="w-14 h-10 text-center text-2xl p-0 cursor-pointer"
                        title="Click to choose emoji"
                      />
                      {showEditEmojiPicker === category.id && (
                        <EmojiPicker
                          onChange={(emoji) => {
                            setEditCategoryIcon(emoji)
                            setShowEditEmojiPicker(null)
                          }}
                          onClose={() => setShowEditEmojiPicker(null)}
                        />
                      )}
                    </div>
                    <Input
                      type="text"
                      value={editCategoryName}
                      onChange={e => setEditCategoryName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleUpdateCategory(category.id)}
                    />
                    <Select
                      value={editCategoryType}
                      onChange={e => setEditCategoryType(e.target.value as 'income' | 'expense')}
                    >
                      <option value="expense">Expense</option>
                      <option value="income">Income</option>
                    </Select>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleUpdateCategory(category.id)}
                      disabled={isUpdatingCategory}
                      className="text-green-600 hover:text-green-700 hover:bg-green-50"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCancelEdit}
                      disabled={isUpdatingCategory}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div
                    key={category.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{category.icon}</span>
                      <span className="font-medium">{category.name}</span>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleStartEdit(category)}
                        className="hover:bg-accent"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={deletingCategoryId === category.id}
                        onClick={() => handleDeleteCategory(category.id, category.name)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              ))}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
