"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { useIsMobile } from "@/components/ui/use-mobile"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, autoComplete, autoCorrect, enterKeyHint, ...props }, ref) => {
  const isMobile = useIsMobile()

  return (
    <textarea
      // data-gramm / data-gramm_editor / data-enable-grammarly disable the
      // Grammarly extension on this field. Grammarly hooks every textarea on
      // the page, runs heavy DOM analysis on every keystroke, and causes
      // visible typing lag in React-controlled forms. Callers can override
      // by passing their own data-gramm prop.
      data-gramm="false"
      data-gramm_editor="false"
      data-enable-grammarly="false"
      autoComplete={isMobile ? autoComplete ?? "off" : autoComplete}
      autoCorrect={isMobile ? autoCorrect ?? "off" : autoCorrect}
      enterKeyHint={isMobile ? enterKeyHint ?? "done" : enterKeyHint}
      data-lpignore={isMobile ? "true" : undefined}
      data-1p-ignore={isMobile ? "true" : undefined}
      data-form-type={isMobile ? "other" : undefined}
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
