// CSS palette inputs keep Original colors and preserve category distinctions across all app themes.
export const COLORS = Array.from({ length: 15 }, (_, index) => `var(--chart-category-${index + 1})`)
