"use client";

import { useEffect, useRef } from "react";
import { scrollMainToTop } from "@/lib/scroll-main";

/**
 * Scrolls the app main content to the top when `page` changes
 * (skips the initial mount so first load stays put).
 */
export function useScrollToTopOnPageChange(page: number) {
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    scrollMainToTop("smooth");
  }, [page]);
}
