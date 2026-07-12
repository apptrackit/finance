import * as React from 'react'
import {
  formatAmount,
  getAmountIntegerDigitCount,
  normalizeAmountDraft,
} from '../../lib/amount'
import { Input, type InputProps } from './input'

export interface AmountInputProps extends Omit<
  InputProps,
  'defaultValue' | 'inputMode' | 'onChange' | 'type' | 'value'
> {
  value: string
  onValueChange?: (value: string) => void
  onChange?: React.ChangeEventHandler<HTMLInputElement>
  allowNegative?: boolean
}

type PendingSelection = {
  start: number
  end: number
  value: string
}

const isGroupSeparator = (character: string) => /[\s\u00a0\u202f]/.test(character)

function logicalCharacterCount(value: string, end: number): number {
  let count = 0
  for (const character of value.slice(0, end)) {
    if (!isGroupSeparator(character)) count += 1
  }
  return count
}

function positionAfterLogicalCharacters(value: string, logicalCount: number): number {
  if (logicalCount === 0) return 0

  let seen = 0
  for (let index = 0; index < value.length; index += 1) {
    if (!isGroupSeparator(value[index])) seen += 1
    if (seen === logicalCount) return index + 1
  }

  return value.length
}

function mapSelection(
  candidate: string,
  formatted: string,
  selectionStart: number,
  selectionEnd: number,
): Pick<PendingSelection, 'start' | 'end'> {
  if (candidate === formatted) {
    return { start: selectionStart, end: selectionEnd }
  }

  return {
    start: positionAfterLogicalCharacters(
      formatted,
      logicalCharacterCount(candidate, selectionStart),
    ),
    end: positionAfterLogicalCharacters(
      formatted,
      logicalCharacterCount(candidate, selectionEnd),
    ),
  }
}

function assignRef<T>(ref: React.ForwardedRef<T>, value: T | null) {
  if (typeof ref === 'function') {
    ref(value)
  } else if (ref) {
    ref.current = value
  }
}

export const AmountInput = React.forwardRef<HTMLInputElement, AmountInputProps>(
  (
    {
      allowNegative = false,
      onBlur,
      onChange,
      onFocus,
      onValueChange,
      value,
      ...props
    },
    forwardedRef,
  ) => {
    const inputRef = React.useRef<HTMLInputElement | null>(null)
    const focusedRef = React.useRef(false)
    const originalIntegerDigitsRef = React.useRef(getAmountIntegerDigitCount(value))
    const pendingSelectionRef = React.useRef<PendingSelection | null>(null)
    const lastRenderedValueRef = React.useRef(value)
    const lastEmittedValueRef = React.useRef<string | null>(null)

    const setInputRef = React.useCallback((node: HTMLInputElement | null) => {
      inputRef.current = node
      assignRef(forwardedRef, node)
    }, [forwardedRef])

    React.useLayoutEffect(() => {
      const pending = pendingSelectionRef.current
      const input = inputRef.current
      if (!pending || !input || input.value !== pending.value) return

      input.setSelectionRange(pending.start, pending.end)
      pendingSelectionRef.current = null
    })

    React.useEffect(() => {
      if (value === lastEmittedValueRef.current) {
        lastEmittedValueRef.current = null
      } else if (focusedRef.current && value !== lastRenderedValueRef.current) {
        originalIntegerDigitsRef.current = getAmountIntegerDigitCount(value)
      }

      lastRenderedValueRef.current = value
    }, [value])

    const emitValue = React.useCallback((nextValue: string) => {
      lastEmittedValueRef.current = nextValue
      lastRenderedValueRef.current = nextValue
      onValueChange?.(nextValue)
    }, [onValueChange])

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const candidate = normalizeAmountDraft(event.currentTarget.value, { allowNegative })
      if (candidate === null) return

      const integerDigits = getAmountIntegerDigitCount(candidate)
      const selectionStart = event.currentTarget.selectionStart ?? candidate.length
      const selectionEnd = event.currentTarget.selectionEnd ?? selectionStart

      let nextValue: string

      if (candidate === '') {
        originalIntegerDigitsRef.current = 0
        nextValue = ''
      } else {
        // Keep the user's existing group scaffold only while the value is below
        // the precision it had when this edit started. If it grew first and is
        // then reduced back to that original precision, canonicalize it again.
        if (
          candidate.includes(' ') &&
          integerDigits < originalIntegerDigitsRef.current
        ) {
          nextValue = candidate
        } else {
          nextValue = formatAmount(candidate, { allowNegative })
        }
      }

      const mapped = mapSelection(candidate, nextValue, selectionStart, selectionEnd)
      pendingSelectionRef.current = { ...mapped, value: nextValue }

      event.currentTarget.value = nextValue
      emitValue(nextValue)
      onChange?.(event)
      event.currentTarget.setSelectionRange(mapped.start, mapped.end)
    }

    const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
      focusedRef.current = true
      originalIntegerDigitsRef.current = getAmountIntegerDigitCount(event.currentTarget.value)
      lastRenderedValueRef.current = event.currentTarget.value
      onFocus?.(event)
    }

    const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
      const canonical = formatAmount(event.currentTarget.value, { allowNegative })

      focusedRef.current = false
      originalIntegerDigitsRef.current = getAmountIntegerDigitCount(canonical)

      if (canonical !== value) {
        event.currentTarget.value = canonical
        emitValue(canonical)
        onChange?.(event as unknown as React.ChangeEvent<HTMLInputElement>)
      }

      onBlur?.(event)
    }

    return (
      <Input
        {...props}
        ref={setInputRef}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
    )
  },
)

AmountInput.displayName = 'AmountInput'
