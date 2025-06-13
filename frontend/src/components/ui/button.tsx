import * as React from "react"
import { cn } from "@/lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "link"
}

const variantClasses = {
  default: "bg-primary text-white hover:bg-primary/90",
  outline: "border border-neutral-700 bg-transparent text-white hover:bg-neutral-800",
  ghost: "bg-transparent text-white hover:bg-neutral-800",
  link: "bg-transparent underline text-primary hover:text-primary/80 p-0 h-auto min-w-0"
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50 disabled:pointer-events-none h-9 px-4 py-2",
          variantClasses[variant],
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export default Button
