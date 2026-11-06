"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";

/**
 * Width of the referenced element in CSS pixels. Charts draw at this width
 * instead of scaling a fixed viewBox, so 12px axis labels stay 12px on any screen.
 * The fallback is used for the server render. The referenced element needs
 * `contain-inline-size`: without it the fallback-width chart sets the element's
 * own width inside a grid or flex track, and the measurement reads that back.
 * `overflow-hidden` clips the fallback-width chart until hydration measures it.
 */
export function useMeasuredWidth<T extends HTMLElement>(fallback: number): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(fallback);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const apply = (value: number) => {
      if (value > 0) setWidth(Math.round(value));
    };
    apply(element.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) apply(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}
