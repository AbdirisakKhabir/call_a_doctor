"use client";

import { useEffect } from "react";

const DEFAULT_MESSAGE = "You have unsaved clinic note data. Leave without saving?";

/**
 * Warns on tab close/refresh and intercepts in-app link clicks when `isDirty` is true.
 * Hold Ctrl/Cmd/Shift while clicking a link to open in a new tab without the prompt.
 */
export function useUnsavedChangesPrompt(isDirty: boolean, message: string = DEFAULT_MESSAGE) {
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = message;
      return message;
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty, message]);

  useEffect(() => {
    if (!isDirty) return;
    const onClickCapture = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const a = t.closest("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      if (a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      try {
        const u = new URL(href, window.location.origin);
        if (u.origin !== window.location.origin) return;
        const next = `${u.pathname}${u.search}`;
        const here = `${window.location.pathname}${window.location.search}`;
        if (next === here) return;
      } catch {
        return;
      }
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("click", onClickCapture, true);
    return () => document.removeEventListener("click", onClickCapture, true);
  }, [isDirty, message]);
}
