"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { useIsMobile } from "@/components/ui/use-mobile"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  (
    {
      className,
      type,
      autoComplete,
      autoCorrect,
      enterKeyHint,
      ...props
    },
    ref,
  ) => {
    const isMobile = useIsMobile()
    const guardMobileAutofill =
      isMobile &&
      type !== "password" &&
      type !== "file" &&
      type !== "hidden" &&
      type !== "checkbox" &&
      type !== "radio" &&
      type !== "button" &&
      type !== "submit"

    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        autoComplete={guardMobileAutofill ? autoComplete ?? "off" : autoComplete}
        autoCorrect={guardMobileAutofill ? autoCorrect ?? "off" : autoCorrect}
        enterKeyHint={
          guardMobileAutofill
            ? enterKeyHint ?? (type === "search" ? "search" : "done")
            : enterKeyHint
        }
        data-lpignore={guardMobileAutofill ? "true" : undefined}
        data-1p-ignore={guardMobileAutofill ? "true" : undefined}
        data-form-type={guardMobileAutofill ? "other" : undefined}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
