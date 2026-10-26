import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { ThemeProvider } from '../../../context/ThemeContext'
import { ThemeCard } from './ThemeCard'

beforeEach(() => localStorage.clear())
afterEach(cleanup)

it('previews each palette independently, switches display modes, and gives the monochrome selection a contrasting checkmark', () => {
  render(<ThemeProvider><ThemeCard /></ThemeProvider>)
  const mono = screen.getByRole('button', { name: /Monochrome/ })
  const original = screen.getByRole('button', { name: /Original/ })
  fireEvent.click(mono)
  expect(mono).toHaveAttribute('aria-pressed', 'true')
  expect(original).toHaveAttribute('aria-pressed', 'false')
  expect(document.documentElement.style.getPropertyValue('--app-color-filter')).toBe('none')
  expect(within(mono).queryByText('GRAYSCALE')).not.toBeInTheDocument()
  expect(mono.querySelector('svg')).toHaveStyle({ color: '#171717' })
  expect(mono.querySelector('[style*="background-color: rgb(10, 10, 10)"]')).toBeInTheDocument()
  // The other theme's preview remains blue, since Mono does not filter the page.
  expect(original.querySelector('[style*="background-color: rgb(81, 137, 216)"]')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'light', exact: true }))
  expect(document.documentElement).toHaveAttribute('data-color-mode', 'light')
  expect(mono).toHaveAttribute('aria-pressed', 'true')
  expect(mono.querySelector('svg')).toHaveStyle({ color: '#ffffff' })
  expect(mono.querySelector('[style*="background-color: rgb(247, 247, 247)"]')).toBeInTheDocument()
})

it('previews the native red palette in both display modes without a filter', () => {
  render(<ThemeProvider><ThemeCard /></ThemeProvider>)
  const red = screen.getByRole('button', { name: /Red Filter/ })
  fireEvent.click(red)
  expect(red).toHaveAttribute('aria-pressed', 'true')
  expect(red.querySelector('[style*="background-color: rgb(17, 7, 7)"]')).toBeInTheDocument()
  expect(red.querySelector('[style*="filter:"]')).not.toBeInTheDocument()
  expect(red.querySelector('svg')).toHaveStyle({ color: '#280a0a' })
  fireEvent.click(screen.getByRole('button', { name: 'light', exact: true }))
  expect(red).toHaveAttribute('aria-pressed', 'true')
  expect(red.querySelector('[style*="background-color: rgb(255, 245, 245)"]')).toBeInTheDocument()
  expect(red.querySelector('svg')).toHaveStyle({ color: '#fffafa' })
  expect(document.documentElement.style.getPropertyValue('--app-color-filter')).toBe('none')
})
