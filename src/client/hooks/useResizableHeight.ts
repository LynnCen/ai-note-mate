"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "note-editor-height";
const MIN_HEIGHT = 200;

export function useResizableHeight(storageKey = STORAGE_KEY) {
  const [height, setHeight] = useState<number>(() => {
    if (typeof window === "undefined") return 400;
    const stored = localStorage.getItem(storageKey);
    return stored ? parseInt(stored, 10) : Math.round(window.innerHeight * 0.55);
  });
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  const onHandleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startY.current = e.clientY;
    startH.current = height;
  }, [height]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!isDragging.current) return;
      const delta = e.clientY - startY.current;
      const newH = Math.max(MIN_HEIGHT, startH.current + delta);
      setHeight(newH);
    }
    function onMouseUp() {
      if (isDragging.current) {
        isDragging.current = false;
        setHeight((h) => {
          localStorage.setItem(storageKey, String(h));
          return h;
        });
      }
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [storageKey]);

  return { height, onHandleMouseDown };
}
