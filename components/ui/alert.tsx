import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva("relative w-full rounded-xl border p-4 text-sm leading-6", {
  variants: {
    variant: {
      default: "border-border bg-card text-foreground shadow-[var(--shadow-xs)]",
      warning: "border-amber-200 bg-amber-50 text-amber-900 shadow-[var(--shadow-xs)]",
      destructive: "border-red-200 bg-red-50 text-red-900 shadow-[var(--shadow-xs)]",
      success: "border-emerald-200 bg-emerald-50 text-emerald-900 shadow-[var(--shadow-xs)]"
    }
  },
  defaultVariants: {
    variant: "default"
  }
});

const Alert = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>>(({ className, variant, ...props }, ref) => <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />);
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => <h5 ref={ref} className={cn("mb-1 font-medium text-current", className)} {...props} />);
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(({ className, ...props }, ref) => <div ref={ref} className={cn("text-current/90", className)} {...props} />);
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertDescription, AlertTitle };
