export const CURRENCIES = [
  { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'PLN', name: 'Polish Zloty', symbol: 'zł' },
  { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč' },
  { code: 'RON', name: 'Romanian Leu', symbol: 'lei' }
]

export const EMOJI_OPTIONS = [
  '💰', '💵', '💳', '💸', '🏦', '💼', '📊', '📈', '📉', '💹',
  '🛒', '🍕', '🍔', '🍜', '🥗', '🍱', '☕', '🍺', '🥤', '🧃',
  '🏠', '🏢', '🏪', '🏨', '🏥', '🏫', '⛽', '🚗', '🚕', '🚙',
  '✈️', '🚆', '🚌', '🚲', '🛴', '⚡', '💡', '🔌', '📱', '💻',
  '🎮', '🎬', '🎵', '🎸', '🎨', '📚', '📖', '✏️', '📝', '📦',
  '🎁', '🎉', '🎊', '🎈', '💐', '🌹', '🌺', '🌻', '🌷', '🌸',
  '👕', '👔', '👗', '👠', '👟', '💄', '💅', '💆', '💇', '🧴',
  '🏋️', '⚽', '🏀', '🎾', '🏐', '🏓', '🏸', '🥊', '🎯', '🎱',
  '🏥', '💊', '💉', '🩺', '🧬', '🔬', '🧪', '🧫', '🦷', '👓',
  '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
  '❤️', '💙', '💚', '💛', '🧡', '💜', '🖤', '🤍', '🤎', '💔',
  '⭐', '✨', '🌟', '💫', '🔥', '💥', '🎆', '🎇', '🌈', '☀️',
  '📌', '📍', '🔖', '🏷️', '🎫', '🎟️', '📮', '📬', '📭', '📪'
]

export const STORAGE_KEY = 'finance_master_currency'
export const MENU_STORAGE_KEY = 'finance_visible_menus'
export const MENU_VISIBILITY_EVENT = 'finance:menu-visibility'

export type MenuKey = 'dashboard' | 'analytics' | 'investments' | 'recurring'

export const DEFAULT_MENU_VISIBILITY: Record<MenuKey, boolean> = {
  dashboard: true,
  analytics: true,
  investments: true,
  recurring: true
}
