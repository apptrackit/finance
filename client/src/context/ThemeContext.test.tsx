import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ThemeProvider, useTheme } from './ThemeContext'

function Controls() {
  const { colorMode, setColorMode, theme, setTheme } = useTheme()
  return <><p>{colorMode} {theme}</p><button onClick={() => setColorMode(colorMode === 'dark' ? 'light' : 'dark')}>Change mode</button><button onClick={() => setTheme('mono')}>Monochrome</button><button onClick={() => setTheme('redfilter')}>Red Filter</button><button onClick={() => setTheme('emerald')}>Original</button></>
}
beforeEach(() => localStorage.clear())
afterEach(cleanup)
describe('independent display mode and color theme', () => {
  it('persists light mode while preserving the selected color theme on remount', () => {
    const view = render(<ThemeProvider><Controls /></ThemeProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Monochrome' }))
    fireEvent.click(screen.getByRole('button', { name: 'Change mode' }))
    expect(document.documentElement).toHaveAttribute('data-color-mode', 'light')
    expect(document.documentElement.style.getPropertyValue('--app-color-filter')).toBe('none')
    expect(document.documentElement).toHaveClass('theme-mono')
    expect(document.documentElement.style.filter).toBe('')
    view.unmount()
    render(<ThemeProvider><Controls /></ThemeProvider>)
    expect(screen.getByText('light mono')).toBeInTheDocument()
    expect(localStorage.getItem('finance_color_mode')).toBe('light')
  })
  it('replaces the old saved monochrome filter with the native palette and clears Red Filter when switching', () => {
    localStorage.setItem('finance_theme', 'mono')
    document.documentElement.style.setProperty('--app-color-filter', 'grayscale(1)')
    render(<ThemeProvider><Controls /></ThemeProvider>)
    expect(screen.getByText('dark mono')).toBeInTheDocument()
    expect(document.documentElement).toHaveClass('theme-mono')
    expect(document.documentElement.style.getPropertyValue('--app-color-filter')).toBe('none')
    fireEvent.click(screen.getByRole('button', { name: 'Red Filter' }))
    expect(document.documentElement).toHaveClass('theme-redfilter')
    expect(document.documentElement).not.toHaveClass('theme-mono')
    expect(document.documentElement.style.getPropertyValue('--app-color-filter')).toContain('sepia(1)')
    fireEvent.click(screen.getByRole('button', { name: 'Monochrome' }))
    expect(document.documentElement.style.getPropertyValue('--app-color-filter')).toBe('none')
    expect(document.documentElement).not.toHaveClass('theme-redfilter')
    fireEvent.click(screen.getByRole('button', { name: 'Original' }))
    expect(document.documentElement).not.toHaveClass('theme-mono')
    expect(document.documentElement.style.getPropertyValue('--app-color-filter')).toBe('none')
  })
  it('defaults to dark for unknown saved modes', () => {
    localStorage.setItem('finance_color_mode', 'invalid')
    render(<ThemeProvider><Controls /></ThemeProvider>)
    expect(document.documentElement).toHaveAttribute('data-color-mode', 'dark')
    expect(document.documentElement).toHaveClass('dark')
  })
})
