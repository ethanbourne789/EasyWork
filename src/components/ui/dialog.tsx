import { cn } from "@/lib/utils"
import { type HTMLAttributes, type ReactNode, useEffect, useRef, forwardRef } from "react"

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false)
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [open, onOpenChange])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div
        ref={ref}
        className="relative z-10 w-full max-w-md mx-4 rounded-xl bg-white shadow-2xl border border-surface-200 animate-in fade-in zoom-in-95"
      >
        {children}
      </div>
    </div>
  )
}

interface DialogContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn("p-6", className)} {...props}>
        {children}
      </div>
    )
  }
)
DialogContent.displayName = "DialogContent"

interface DialogHeaderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export function DialogHeader({ className, children, ...props }: DialogHeaderProps) {
  return (
    <div className={cn("mb-4", className)} {...props}>
      {children}
    </div>
  )
}

interface DialogTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  children: ReactNode
}

export function DialogTitle({ className, children, ...props }: DialogTitleProps) {
  return (
    <h2 className={cn("text-lg font-semibold text-surface-900", className)} {...props}>
      {children}
    </h2>
  )
}

interface DialogFooterProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export function DialogFooter({ className, children, ...props }: DialogFooterProps) {
  return (
    <div className={cn("mt-6 flex items-center justify-end gap-2", className)} {...props}>
      {children}
    </div>
  )
}
