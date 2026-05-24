import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva("relative w-full rounded-xl border p-4 text-sm leading-6", {
  variants: {
    variant: {
      default: "border-herb-border bg-black/20 text-white/70",
      warning: "border-amber-500/30 bg-amber-500/10 text-amber-100",
      destructive: "border-red-500/30 bg-red-500/10 text-red-100",
      success: "border-green-500/30 bg-green-500/10 text-green-100"
    }
  },
  defaultVariants: {
    variant: "default"
  }
});

const Alert = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>>(({ className, variant, ...props }, ref) => <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />);
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => <h5 ref={ref} className={cn("mb-1 font-medium text-white", className)} {...props} />);
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(({ className, ...props }, ref) => <div ref={ref} className={cn("text-current/90", className)} {...props} />);
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertDescription, AlertTitle };
