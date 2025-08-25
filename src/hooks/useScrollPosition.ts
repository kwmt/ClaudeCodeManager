import { useCallback, useRef } from "react";

interface ScrollPosition {
  top: number;
  left: number;
}

interface UseScrollPositionReturn {
  saveScrollPosition: () => void;
  restoreScrollPosition: () => void;
  getScrollPosition: () => ScrollPosition | null;
  setScrollPosition: (position: ScrollPosition) => void;
}

/**
 * Custom hook for managing scroll position preservation during updates
 * Maintains scroll position when content changes, ensuring smooth UX
 */
export const useScrollPosition = (
  containerRef: React.RefObject<HTMLElement>,
): UseScrollPositionReturn => {
  const savedPositionRef = useRef<ScrollPosition | null>(null);

  const saveScrollPosition = useCallback(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    savedPositionRef.current = {
      top: container.scrollTop,
      left: container.scrollLeft,
    };
  }, [containerRef]);

  const restoreScrollPosition = useCallback(() => {
    if (!containerRef.current || !savedPositionRef.current) return;

    const container = containerRef.current;
    const position = savedPositionRef.current;

    // Use requestAnimationFrame to ensure DOM has been updated
    requestAnimationFrame(() => {
      container.scrollTo({
        top: position.top,
        left: position.left,
        behavior: "auto", // Instant restore, no animation
      });
    });
  }, [containerRef]);

  const getScrollPosition = useCallback((): ScrollPosition | null => {
    if (!containerRef.current) return null;

    const container = containerRef.current;
    return {
      top: container.scrollTop,
      left: container.scrollLeft,
    };
  }, [containerRef]);

  const setScrollPosition = useCallback(
    (position: ScrollPosition) => {
      if (!containerRef.current) return;

      const container = containerRef.current;
      container.scrollTo({
        top: position.top,
        left: position.left,
        behavior: "smooth",
      });
    },
    [containerRef],
  );

  return {
    saveScrollPosition,
    restoreScrollPosition,
    getScrollPosition,
    setScrollPosition,
  };
};
