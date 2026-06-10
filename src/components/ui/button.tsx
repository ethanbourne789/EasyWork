import { cn } from "@/lib/utils"
import { type ButtonHTMLAttributes, forwardRef } from "react"

const variants = {
  primary: "bg-primary-600 text-white hover:bg-primary-700 shadow-sm",
  secondary: "bg-surface-100 text-surface-900 hover:bg-surface-200",
  ghost: "hover:bg-surface-100 text-surface-600 hover:text-surface-900",
  danger: "bg-red-600 text-white hover:bg-red-700 shadow-sm",
  outline: "border border-surface-300 hover:bg-surface-50 text-surface-700",
}

const sizes = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-md",
  md: "h-9 px-4 text-sm gap-2 rounded-lg",
  lg: "h-11 px-6 text-base gap-2.5 rounded-lg",
  icon: "h-9 w-9 rounded-lg",
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    )
  }
)

Button.displayName = "Button"
