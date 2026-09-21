/** Scroll the dashboard main content pane (or window) to the top. */
export function scrollMainToTop(behavior: ScrollBehavior = "smooth") {
  if (typeof document === "undefined") return;

  const el =
    document.getElementById("app-main-scroll") ||
    document.querySelector("main");

  if (el instanceof HTMLElement) {
    el.scrollTo({ top: 0, behavior });
  }

  // On phones the document itself scrolls (so the keyboard does not freeze
  // a nested overflow box). Keep window in sync with the main pane.
  window.scrollTo({ top: 0, behavior });
}
