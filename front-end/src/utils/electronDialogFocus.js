/* ============================================
   ELECTRON NATIVE DIALOG FOCUS FIX
   ============================================ */

// Install only once.
if (
  typeof window !== "undefined" &&
  window.magnoDesktop?.isDesktop &&
  typeof window.magnoDesktop.restoreInputFocus === "function" &&
  !window.__magnoDialogFocusInstalled
) {
  window.__magnoDialogFocusInstalled = true;

  const originalAlert = window.alert.bind(window);
  const originalConfirm = window.confirm.bind(window);

  const restoreFocus = () => {
    // Let the native dialog fully close before
    // asking Electron to restore keyboard focus.
    setTimeout(() => {
      window.magnoDesktop.restoreInputFocus();
    }, 0);
  };

  window.alert = (message) => {
    try {
      return originalAlert(message);
    } finally {
      restoreFocus();
    }
  };

  window.confirm = (message) => {
    try {
      return originalConfirm(message);
    } finally {
      restoreFocus();
    }
  };
}
