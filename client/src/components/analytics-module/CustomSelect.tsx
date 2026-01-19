import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'

type CustomSelectProps = {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string; icon?: string }[]
  variant?: 'default' | 'success' | 'destructive'
}

export function CustomSelect({ 
  value, 
  onChange, 
  options,
  variant = 'default'
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  
  const selectedOption = options.find(o => o.value === value)
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const variantStyles = {
    default: 'hover:bg-secondary/80 focus:ring-primary/50',
    success: 'hover:bg-success/10 focus:ring-success/50',
    destructive: 'hover:bg-destructive/10 focus:ring-destructive/50'
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 text-xs bg-secondary/50 border border-border rounded-lg px-3 py-1.5 text-foreground cursor-pointer transition-colors focus:outline-none focus:ring-2 ${variantStyles[variant]}`}
      >
        {selectedOption?.icon && <span>{selectedOption.icon}</span>}
        <span>{selectedOption?.label}</span>
        <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <div className="absolute right-0 left-auto top-full mt-1 z-50 min-w-[140px] max-w-[calc(100vw-2rem)] bg-card border border-border rounded-lg shadow-xl py-1 animate-in fade-in-0 zoom-in-95">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value)
                setIsOpen(false)
              }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-secondary/50 transition-colors ${
                value === option.value ? 'text-foreground bg-secondary/30' : 'text-muted-foreground'
              }`}
            >
              {option.icon && <span>{option.icon}</span>}
              <span className="flex-1">{option.label}</span>
              {value === option.value && <Check className="h-3 w-3" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
