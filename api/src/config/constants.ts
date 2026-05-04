import pkg from '../../../package.json'
export const APP_VERSION = pkg.version

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
