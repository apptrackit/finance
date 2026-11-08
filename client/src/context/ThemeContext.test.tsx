import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ThemeProvider, useTheme } from './ThemeContext'

function Controls() {
  const { colorMode, setColorMode, theme, setTheme } = useTheme()
  return <><p>{colorMode} {theme}</p><button onClick={() => setColorMode(colorMode === 'dark' ? 'light' : 'dark')}>Change mode</button><button onClick={() => setTheme('mono')}>Monochrome</button><button onClick={() => setTheme('redfilter')}>Red Filter</button><button onClick={() => setTheme('emerald')}>Original</button></>
}
function SystemControl() {
  const { setColorMode } = useTheme()
  return <button onClick={() => setColorMode('system')}>Use system</button>
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
  it('replaces the old saved monochrome filter and switches native palettes without filters', () => {
    localStorage.setItem('finance_theme', 'mono')
    document.documentElement.style.setProperty('--app-color-filter', 'grayscale(1)')
    render(<ThemeProvider><Controls /></ThemeProvider>)
    expect(screen.getByText('dark mono')).toBeInTheDocument()
    expect(document.documentElement).toHaveClass('theme-mono')
    expect(document.documentElement.style.getPropertyValue('--app-color-filter')).toBe('none')
    fireEvent.click(screen.getByRole('button', { name: 'Red Filter' }))
    expect(document.documentElement).toHaveClass('theme-redfilter')
    expect(document.documentElement).not.toHaveClass('theme-mono')
    expect(document.documentElement.style.getPropertyValue('--app-color-filter')).toBe('none')
    fireEvent.click(screen.getByRole('button', { name: 'Monochrome' }))
    expect(document.documentElement.style.getPropertyValue('--app-color-filter')).toBe('none')
    expect(document.documentElement).not.toHaveClass('theme-redfilter')
    fireEvent.click(screen.getByRole('button', { name: 'Original' }))
    expect(document.documentElement).not.toHaveClass('theme-mono')
    expect(document.documentElement.style.getPropertyValue('--app-color-filter')).toBe('none')
  })
  it('restores a saved Red Filter as a native palette in either display mode', () => {
    localStorage.setItem('finance_theme', 'redfilter')
    localStorage.setItem('finance_color_mode', 'light')
    document.documentElement.style.filter = 'sepia(1)'
    document.documentElement.style.setProperty('--app-color-filter', 'sepia(1) saturate(6) hue-rotate(315deg) brightness(0.75)')
    const view = render(<ThemeProvider><Controls /></ThemeProvider>)
    expect(screen.getByText('light redfilter')).toBeInTheDocument()
    expect(document.documentElement).toHaveClass('theme-redfilter')
    expect(document.documentElement.style.filter).toBe('')
    expect(document.documentElement.style.getPropertyValue('--app-color-filter')).toBe('none')
    fireEvent.click(screen.getByRole('button', { name: 'Change mode' }))
    view.unmount()
    render(<ThemeProvider><Controls /></ThemeProvider>)
    expect(screen.getByText('dark redfilter')).toBeInTheDocument()
    expect(document.documentElement).toHaveClass('theme-redfilter')
    expect(document.documentElement.style.getPropertyValue('--app-color-filter')).toBe('none')
  })
  it('follows the system appearance when nothing valid is saved, including live changes', () => {
    localStorage.setItem('finance_color_mode', 'invalid')
    const listeners: Array<() => void> = []
    const query = { matches: false, addEventListener: (_: string, fn: () => void) => listeners.push(fn), removeEventListener: () => {} }
    const original = window.matchMedia
    window.matchMedia = (() => query) as unknown as typeof window.matchMedia
    try {
      render(<ThemeProvider><Controls /></ThemeProvider>)
      expect(document.documentElement).toHaveAttribute('data-color-mode', 'light')
      query.matches = true
      act(() => listeners.forEach(fn => fn()))
      expect(document.documentElement).toHaveAttribute('data-color-mode', 'dark')
      expect(document.documentElement).toHaveClass('dark')
    } finally {
      window.matchMedia = original
    }
  })
  it('falls back to dark without matchMedia and clears the saved override for system', () => {
    const original = window.matchMedia
    // @ts-expect-error simulate an environment without matchMedia
    delete window.matchMedia
    try {
      localStorage.setItem('finance_color_mode', 'light')
      render(<ThemeProvider><SystemControl /></ThemeProvider>)
      fireEvent.click(screen.getByRole('button', { name: 'Use system' }))
      expect(localStorage.getItem('finance_color_mode')).toBeNull()
      expect(document.documentElement).toHaveAttribute('data-color-mode', 'dark')
    } finally {
      window.matchMedia = original
    }
  })
})
