import { cva, type VariantProps } from "class-variance-authority";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-muted text-muted-foreground",
        success: "bg-success/20 text-success dark:bg-success/20 dark:text-success",
        warning: "bg-warning/20 text-warning dark:bg-warning/20 dark:text-warning",
        danger: "bg-destructive/10 text-destructive dark:bg-destructive/10 dark:text-destructive",
        outline: "border border-border text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

const badgeIcons = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  showIcon?: boolean;
}

export function Badge({ className, variant, showIcon = true, children, ...props }: BadgeProps) {
  const Icon = variant && (variant in badgeIcons) ? badgeIcons[variant as keyof typeof badgeIcons] : undefined;
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {Icon && showIcon && <Icon size={12} />}
      {children}
    </span>
  );
}
