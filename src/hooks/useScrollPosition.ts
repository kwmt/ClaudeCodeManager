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
  scrollToTop: () => void;
  scrollToBottom: () => void;
  isAtTop: () => boolean;
  isAtBottom: () => boolean;
}

/**
 * Custom hook for managing scroll position preservation during updates
 * Maintains scroll position when content changes, ensuring smooth UX
 */
export const useScrollPosition = (
  containerRef: React.RefObject<HTMLElement | null>,
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

  const scrollToTop = useCallback(() => {
    if (!containerRef.current) return;

    containerRef.current.scrollTo({
      top: 0,
      left: 0,
      behavior: "smooth",
    });
  }, [containerRef]);

  const scrollToBottom = useCallback(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    container.scrollTo({
      top: container.scrollHeight,
      left: 0,
      behavior: "smooth",
    });
  }, [containerRef]);

  const isAtTop = useCallback((): boolean => {
    if (!containerRef.current) return true;
    return containerRef.current.scrollTop <= 5; // Small threshold for smooth scrolling
  }, [containerRef]);

  const isAtBottom = useCallback((): boolean => {
    if (!containerRef.current) return false;

    const container = containerRef.current;
    const threshold = 5; // Small threshold for smooth scrolling
    return (
      container.scrollTop + container.clientHeight >=
      container.scrollHeight - threshold
    );
  }, [containerRef]);

  return {
    saveScrollPosition,
    restoreScrollPosition,
    getScrollPosition,
    setScrollPosition,
    scrollToTop,
    scrollToBottom,
    isAtTop,
    isAtBottom,
  };
};
