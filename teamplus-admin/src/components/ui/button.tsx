import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { ButtonBase } from "@/components/ui/core/ButtonBase"

/**
 * TEAMPLUS Button Component
 *
 * === Design 7 Principles ===
 * 1. 휴먼 디자인: solid 색상, gradient 미사용
 * 2. 일관성: Ice Blue (#1E40AF) primary
 * 3. Dark mode 완벽 지원
 */

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Primary (Ice Blue)
        default:
          "bg-primary text-white shadow-sm hover:bg-primary-dark dark:bg-primary dark:hover:bg-primary-dark",

        // Destructive (Red)
        destructive:
          "bg-red-600 text-white shadow-sm hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700",

        // Outline
        outline:
          "border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200",

        // Secondary (Slate)
        secondary:
          "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-200 dark:hover:bg-slate-600",

        // Ghost (Transparent)
        ghost:
          "hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200",

        // Link
        link:
          "text-primary dark:text-primary-light underline-offset-4 hover:underline",

        // Success (Green)
        success:
          "bg-green-600 text-white shadow-sm hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700",

        // Warning (Amber)
        warning:
          "bg-amber-500 text-white shadow-sm hover:bg-amber-600 dark:bg-amber-500 dark:hover:bg-amber-600",

        // --- Action Icon Button Variants ---
        // 보기/수정 액션
        "ghost-primary":
          "hover:bg-primary/10 dark:hover:bg-primary/20 text-primary dark:text-primary-light",

        // 승인 액션
        "ghost-success":
          "hover:bg-green-50 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400",

        // 삭제/거절 액션
        "ghost-destructive":
          "hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400",

        // 추가 액션
        "ghost-info":
          "hover:bg-cyan-50 dark:hover:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400",

        // 경고 액션
        "ghost-warning":
          "hover:bg-amber-50 dark:hover:bg-amber-900/30 text-amber-600 dark:text-amber-400",

        // 연락 액션
        "ghost-violet":
          "hover:bg-violet-50 dark:hover:bg-violet-900/30 text-violet-600 dark:text-violet-400",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3 text-xs",
        lg: "h-11 rounded-lg px-8",
        xl: "h-12 rounded-lg px-10 text-base",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8 rounded-lg",
        "icon-lg": "h-11 w-11 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    return (
      <ButtonBase
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        asChild={asChild}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
