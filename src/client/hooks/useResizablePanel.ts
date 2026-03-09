"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MIN_WIDTH = 280;
const MAX_WIDTH = 620;
const DEFAULT_WIDTH = 380;
const STORAGE_KEY = "agent-panel-width";

export function useResizablePanel() {
  const [panelWidth, setPanelWidth] = useState<number>(DEFAULT_WIDTH);

  // Hydrate from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const n = Number(stored);
      if (!isNaN(n)) {
        setPanelWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, n)));
      }
    }
  }, []);

  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startWidth.current = panelWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [panelWidth]
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      // Dragging left = wider panel (panel is on the right side)
      const delta = startX.current - e.clientX;
      const newWidth = Math.max(
        MIN_WIDTH,
        Math.min(MAX_WIDTH, startWidth.current + delta)
      );
      setPanelWidth(newWidth);
    };

    const onMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      // Persist after drag ends
      setPanelWidth((w) => {
        localStorage.setItem(STORAGE_KEY, String(w));
        return w;
      });
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  return { panelWidth, onDividerMouseDown };
}
