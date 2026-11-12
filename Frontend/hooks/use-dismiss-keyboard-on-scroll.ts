"use client"

import { useEffect } from "react"

function isTouchUi() {
  if (typeof window === "undefined") return false
  return window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768
}

function isTextField(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable) return true
  if (el instanceof HTMLTextAreaElement) return true
  if (!(el instanceof HTMLInputElement)) return false
  const type = (el.type || "text").toLowerCase()
  return ![
    "button",
    "checkbox",
    "color",
    "file",
    "hidden",
    "image",
    "radio",
    "range",
    "reset",
    "submit",
    "password",
  ].includes(type)
}

function suppressMobileAutofill(el: HTMLElement) {
  if (el instanceof HTMLInputElement && el.type === "password") return
  if (!el.getAttribute("autocomplete") || el.getAttribute("autocomplete") === "on") {
    el.setAttribute("autocomplete", "off")
  }
  el.setAttribute("autocorrect", "off")
  el.setAttribute("data-lpignore", "true")
  el.setAttribute("data-1p-ignore", "true")
  el.setAttribute("data-form-type", "other")
  if (!el.getAttribute("enterkeyhint")) {
    const type = el instanceof HTMLInputElement ? (el.type || "text").toLowerCase() : "text"
    el.setAttribute("enterkeyhint", type === "search" ? "search" : "done")
  }
}

function shouldKeepKeyboard(el: HTMLElement) {
  // Never dismiss mid-edit sale / search fields — blur closes the phone keyboard
  // and would also commit half-typed qty/price values.
  return Boolean(
    el.closest('[data-quantity-input="true"]') ||
      el.closest('[data-price-input="true"]') ||
      el.closest('[data-amount-input="true"]') ||
      el.closest('[data-quick-qty="true"]') ||
      el.closest('[data-discount-select="true"]') ||
      el.closest('[data-product-search="true"]') ||
      el.closest('[data-keep-keyboard="true"]'),
  )
}

function blurActiveField() {
  const active = document.activeElement
  if (!isTextField(active)) return
  if (shouldKeepKeyboard(active)) return
  active.blur()
}

/**
 * Phones only: hide the keyboard when the user intentionally swipes away from
 * a field. Do NOT listen to generic scroll / visualViewport events — product
 * search reflow and scrollIntoView fire those on every keystroke and would
 * close the keyboard after each character.
 */
export function useDismissKeyboardOnScroll() {
  useEffect(() => {
    let ignoreUntil = 0
    let startY = 0
    let startX = 0
    let startOnField = false

    const onFocusIn = (event: FocusEvent) => {
      ignoreUntil = Date.now() + 500
      if (!isTouchUi()) return
      const target = event.target
      if (target instanceof HTMLElement && isTextField(target)) {
        suppressMobileAutofill(target)
      }
    }

    const onTouchStart = (event: TouchEvent) => {
      if (!isTouchUi()) return
      const touch = event.touches[0]
      if (!touch) return
      startY = touch.clientY
      startX = touch.clientX
      const active = document.activeElement
      const target = event.target
      startOnField =
        isTextField(active) &&
        target instanceof Node &&
        (active === target || active.contains(target))
    }

    const onTouchMove = (event: TouchEvent) => {
      if (!isTouchUi() || Date.now() < ignoreUntil) return
      if (!isTextField(document.activeElement)) return
      const touch = event.touches[0]
      if (!touch) return
      const dy = Math.abs(touch.clientY - startY)
      const dx = Math.abs(touch.clientX - startX)
      if (dy < 12 || dy < dx) return
      // Dragging on the field itself is caret/text selection — keep keyboard.
      if (startOnField) return
      blurActiveField()
    }

    document.addEventListener("focusin", onFocusIn, true)
    document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true })
    document.addEventListener("touchmove", onTouchMove, { capture: true, passive: true })

    return () => {
      document.removeEventListener("focusin", onFocusIn, true)
      document.removeEventListener("touchstart", onTouchStart, true)
      document.removeEventListener("touchmove", onTouchMove, true)
    }
  }, [])
}

/** Extra attributes so Chrome/Android does not treat search as a login/address field. */
export const searchFieldDomProps = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "none",
  spellCheck: false,
  inputMode: "search" as const,
  enterKeyHint: "search" as const,
  "data-lpignore": "true",
  "data-1p-ignore": "true",
  "data-form-type": "other",
} as const
