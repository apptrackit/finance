import { useEffect, useRef } from 'react'
import { EMOJI_OPTIONS } from '../constants'

export function EmojiPicker({
  onChange,
  onClose
}: {
  onChange: (emoji: string) => void
  onClose: () => void
}) {
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  return (
    <div
      ref={pickerRef}
      className="absolute z-50 mt-1 p-3 bg-popover border rounded-lg shadow-lg w-64 max-w-[calc(100vw-2rem)] left-0 right-auto"
      style={{ maxHeight: '300px', overflowY: 'auto' }}
    >
      <div className="grid grid-cols-8 gap-1">
        {EMOJI_OPTIONS.map((emoji, index) => (
          <button
            key={index}
            type="button"
            onClick={() => {
              onChange(emoji)
              onClose()
            }}
            className="w-8 h-8 flex items-center justify-center text-xl hover:bg-accent rounded transition-colors"
            title={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
