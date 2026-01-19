import * as React from "react"
import { cn } from "../../lib/utils"

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'success'
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium",
          "ring-offset-background transition-all duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:pointer-events-none disabled:opacity-50",
          "active:scale-[0.98]",
          {
            'default': "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/25",
            'secondary': "bg-secondary text-secondary-foreground hover:bg-secondary/80",
            'outline': "border border-border bg-transparent hover:bg-accent hover:text-accent-foreground",
            'ghost': "hover:bg-accent hover:text-accent-foreground",
            'destructive': "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-lg shadow-destructive/25",
            'success': "bg-success text-success-foreground hover:bg-success/90 shadow-lg shadow-success/25",
          }[variant],
          {
            'default': "h-10 px-4 py-2",
            'sm': "h-9 px-3 text-xs",
            'lg': "h-11 px-8",
            'icon': "h-10 w-10",
          }[size],
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
