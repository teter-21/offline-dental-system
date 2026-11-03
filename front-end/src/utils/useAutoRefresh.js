import { useEffect, useRef } from "react";

/*
 * Background refresh for clinic pages.
 *
 * Improvements:
 * - Refreshes every 30 seconds by default.
 * - Removes refresh-on-focus behavior.
 * - Debounces record-update notifications.
 * - Prevents overlapping requests.
 * - Avoids refreshing while the user is editing.
 * - Cleans up timers on unmount.
 */

export const useAutoRefresh = (loadData, interval = 30000) => {
  const loadRef = useRef(loadData);

  useEffect(() => {
    loadRef.current = loadData;
  }, [loadData]);

  useEffect(() => {
    let active = true;
    let pending = false;
    let debounceTimer = null;

    const isUserEditing = () => {
      const element = document.activeElement;

      if (!element) return false;

      const tag = element.tagName?.toLowerCase();

      if (element.isContentEditable) {
        return true;
      }

      if (tag === "textarea" || tag === "select") {
        return true;
      }

      if (tag === "input") {
        const type = (element.type || "text").toLowerCase();

        return ![
          "button",
          "submit",
          "reset",
          "checkbox",
          "radio",
          "hidden",
        ].includes(type);
      }

      return false;
    };

    const refresh = async () => {
      if (!active || pending) return;

      if (document.visibilityState === "hidden") {
        return;
      }

      // Do not interrupt the user while typing
      // or editing patient information.
      if (isUserEditing()) {
        return;
      }

      pending = true;

      try {
        await loadRef.current?.({
          background: true,
        });
      } catch (error) {
        console.error("Background refresh failed:", error);
      } finally {
        pending = false;
      }
    };

    // Batch multiple update events into one refresh.
    const handleDataUpdated = () => {
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void refresh();
      }, 500);
    };

    // Refresh when the tab becomes visible,
    // but not on every ordinary window focus.
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleDataUpdated();
      }
    };

    window.addEventListener("clinic:data-updated", handleDataUpdated);

    document.addEventListener("visibilitychange", handleVisibilityChange);

    const timer = setInterval(
      () => {
        void refresh();
      },
      Math.max(interval, 5000),
    );

    return () => {
      active = false;

      clearInterval(timer);

      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
      }

      window.removeEventListener("clinic:data-updated", handleDataUpdated);

      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [interval]);
};
