/** Scroll the dashboard main content pane (or window) to the top. */
export function scrollMainToTop(behavior: ScrollBehavior = "smooth") {
  if (typeof document === "undefined") return;

  const el =
    document.getElementById("app-main-scroll") ||
    document.querySelector("main");

  if (el instanceof HTMLElement) {
    el.scrollTo({ top: 0, behavior });
    return;
  }

  window.scrollTo({ top: 0, behavior });
}
