import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { EllipsisVertical } from 'lucide-react'
import { cn } from '../../lib/utils'

export type ActionMenuItem = {
  label: string
  description: string
  icon: ReactNode
  onSelect: () => void
  disabled?: boolean
  destructive?: boolean
  separator?: boolean
}

export function ActionMenu({ label, items, disabled = false }: { label: string; items: ActionMenuItem[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const initialFocus = useRef<'first' | 'last'>('first')
  const id = useId()
  const close = (restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) trigger.current?.focus()
  }
  const menuItems = () => [...(panel.current?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not([disabled])') || [])]

  useLayoutEffect(() => {
    if (!open || !trigger.current || !panel.current) return
    const rect = trigger.current.getBoundingClientRect()
    const width = Math.min(288, window.innerWidth - 16)
    const height = Math.min(panel.current.scrollHeight || panel.current.getBoundingClientRect().height, window.innerHeight - 16)
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))
    const below = Math.max(8, rect.bottom + 4)
    const above = Math.min(window.innerHeight - 8, rect.top - 4)
    const spaceBelow = Math.max(0, window.innerHeight - 8 - below)
    const spaceAbove = Math.max(0, above - 8)
    const useBelow = height <= spaceBelow || spaceBelow >= spaceAbove
    const maxHeight = useBelow ? spaceBelow : spaceAbove
    const top = useBelow ? below : above - Math.min(height, maxHeight)
    setPosition(previous => previous?.top === top && previous.left === left && previous.width === width && previous.maxHeight === maxHeight
      ? previous : { top, left, width, maxHeight })
  }, [open, items])
  useEffect(() => {
    if (!open) return
    const dismissOutside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!trigger.current?.contains(target) && !panel.current?.contains(target)) close()
    }
    const dismissOnScroll = (event: Event) => {
      if (event.target instanceof Node && panel.current?.contains(event.target)) return
      close()
    }
    document.addEventListener('pointerdown', dismissOutside)
    window.addEventListener('resize', dismissOnScroll)
    window.addEventListener('scroll', dismissOnScroll, true)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside)
      window.removeEventListener('resize', dismissOnScroll)
      window.removeEventListener('scroll', dismissOnScroll, true)
    }
  }, [open])

  useEffect(() => {
    if (!open || !position) return
    const available = menuItems()
    ;(initialFocus.current === 'last' ? available.at(-1) : available[0])?.focus()
  }, [open, position])

  return <>
    <button ref={trigger} type="button" aria-label={`Actions for ${label}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      disabled={disabled} className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground disabled:cursor-default disabled:opacity-50"
      onClick={() => { initialFocus.current = 'first'; setOpen(!open) }}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          initialFocus.current = event.key === 'ArrowUp' ? 'last' : 'first'
          setOpen(true)
        }
      }}><EllipsisVertical className="h-4 w-4" /></button>
    {open && createPortal(<div ref={panel} id={id} role="menu" aria-label={`${label} actions`}
      className="fixed z-[80] overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-2xl"
      style={{ width: 288, maxWidth: 'calc(100vw - 16px)', maxHeight: 'calc(100dvh - 16px)', ...position, visibility: position ? 'visible' : 'hidden', filter: 'var(--app-color-filter, none)' }}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return }
        if (event.key === 'Tab') { close(true); return }
        const available = menuItems()
        const current = available.indexOf(document.activeElement as HTMLButtonElement)
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1
          : event.key === 'ArrowDown' ? (current + 1) % available.length : event.key === 'ArrowUp' ? (current - 1 + available.length) % available.length : null
        if (index !== null) { event.preventDefault(); available[index]?.focus() }
      }}>
      {items.map((item, index) => <div key={item.label}>
        {item.separator && <div role="separator" className="mx-2 my-1.5 border-t border-border" />}
        <button type="button" role="menuitem" aria-label={item.label} aria-describedby={`${id}-${index}`} disabled={item.disabled}
          className={cn('flex w-full cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-secondary focus:bg-secondary disabled:cursor-default disabled:opacity-45', item.destructive && 'text-destructive')}
          onClick={() => { close(true); item.onSelect() }}>
          <span className="mt-0.5 shrink-0">{item.icon}</span><span><span className="block text-sm font-medium">{item.label}</span>
            <span id={`${id}-${index}`} className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{item.description}</span></span>
        </button>
      </div>)}
    </div>, document.body)}
  </>
}
