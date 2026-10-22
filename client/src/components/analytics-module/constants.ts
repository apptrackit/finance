// CSS palette inputs keep Original colors and preserve category distinctions in Monochrome and provide native Red Filter tones.
export const COLORS = Array.from({ length: 15 }, (_, index) => `var(--chart-category-${index + 1})`)
