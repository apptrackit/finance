export const API_VERSION = '1.2.2'

export const DEFAULT_CATEGORIES = [
  { name: 'Salary', type: 'income', icon: '💰' },
  { name: 'Groceries', type: 'expense', icon: '🛒' },
  { name: 'Rent', type: 'expense', icon: '🏠' },
  { name: 'Lifestyle', type: 'expense', icon: '✨' },
  { name: 'Utilities', type: 'expense', icon: '💡' },
  { name: 'Subscription', type: 'expense', icon: '📱' },
  { name: 'Transportation', type: 'expense', icon: '🚗' },
  { name: 'Other', type: 'expense', icon: '📦' },
] as const
