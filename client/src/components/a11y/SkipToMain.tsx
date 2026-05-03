/**
 * Accessibility Components — WCAG 2.1 AA compliance utilities.
 *
 * 1. SkipToMain: Keyboard-accessible skip navigation link
 * 2. AccessibleLabel: Screen reader only labels
 * 3. LiveRegion: ARIA live announcements
 * 4. FocusTrap: Focus management for modals/dialogs
 */
import React from "react";

/**
 * Skip navigation link — allows keyboard users to skip to main content.
 * Visually hidden until focused via Tab key.
 */
export function SkipToMain({ targetId = "main-content" }: { targetId?: string }) {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[10000] focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
      aria-label="Skip to main content"
    >
      Skip to main content
    </a>
  );
}

/**
 * Screen-reader only text — visually hidden but announced by screen readers.
 */
export function SrOnly({ children }: { children: React.ReactNode }) {
  return <span className="sr-only">{children}</span>;
}

/**
 * ARIA live region — announces dynamic content changes to screen readers.
 * Use for toast-like notifications, loading states, form errors, etc.
 */
export function LiveRegion({
  children,
  politeness = "polite",
  atomic = true,
}: {
  children: React.ReactNode;
  politeness?: "polite" | "assertive" | "off";
  atomic?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live={politeness}
      aria-atomic={atomic}
      className="sr-only"
    >
      {children}
    </div>
  );
}

/**
 * Keyboard-navigable wrapper — traps focus within a container.
 * Useful for modals, dialogs, and dropdown menus.
 */
export function useFocusTrap(containerRef: React.RefObject<HTMLElement | null>) {
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const focusableSelector =
      'a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])';

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const focusable = container!.querySelectorAll<HTMLElement>(focusableSelector);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    container.addEventListener("keydown", handleKeyDown);
    return () => container.removeEventListener("keydown", handleKeyDown);
  }, [containerRef]);
}

export default SkipToMain;
