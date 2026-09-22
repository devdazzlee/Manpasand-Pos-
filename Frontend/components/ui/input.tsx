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
      onWheel,
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
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-0 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/25 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          // Hide browser spinner arrows on number fields (and stop scroll changing the value).
          type === "number" &&
            "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
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
        onWheel={(event) => {
          if (type === "number") {
            // Focused number inputs otherwise change value when the page is scrolled.
            event.currentTarget.blur()
          }
          onWheel?.(event)
        }}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
