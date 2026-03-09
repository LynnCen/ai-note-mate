"use client";

import { useCallback, useState } from "react";

const KEY = "note-sidebar-collapsed";

export function useSidebarState() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(KEY) === "true";
  });

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(KEY, String(next));
      return next;
    });
  }, []);

  return { collapsed, toggle };
}
