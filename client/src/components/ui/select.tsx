import * as React from "react"
import { cn } from "../../lib/utils"

const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-lg border border-border",
            "bg-background/50 pl-3 pr-9 py-2 text-sm text-foreground",
            "ring-offset-background transition-all duration-200",
            "placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0",
            "focus:border-primary/50 focus:bg-background",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "hover:border-border/80 hover:bg-background/80",
            "cursor-pointer leading-normal",
            "[-webkit-appearance:none] [-moz-appearance:none] [appearance:none]",
            "[&>option]:bg-card [&>option]:text-foreground [&>option]:py-2",
            "[&>optgroup]:bg-card [&>optgroup]:text-muted-foreground [&>optgroup]:font-semibold",
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5">
          <svg
            className="h-4 w-4 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    )
  }
)
Select.displayName = "Select"

export { Select }
