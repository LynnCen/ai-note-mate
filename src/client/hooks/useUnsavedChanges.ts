"use client";

import { useEffect } from "react";

/**
 * 有未保存更改时，在用户关闭/刷新标签页前弹出浏览器原生确认框。
 * 应用内跳转不受此 hook 影响，需在跳转前手动判断 isDirty。
 */
export function useUnsavedChanges(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
}
