/**
 * Session timeout & auto-logout hook.
 *
 * Monitors user activity (mouse, keyboard, touch, scroll) and shows a
 * warning dialog before automatically logging the user out after inactivity.
 *
 * Default: 15 min idle → warning, 16 min → logout.
 */
import { useState, useEffect, useCallback, useRef } from "react";

const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll", "mousemove"] as const;

interface SessionTimeoutOptions {
  timeoutMs?: number;        // Total inactivity before logout (default: 15 min)
  warningBeforeMs?: number;  // Show warning this many ms before logout (default: 60s)
  onLogout: () => void;
}

export function useSessionTimeout({
  timeoutMs = 15 * 60 * 1000,
  warningBeforeMs = 60 * 1000,
  onLogout,
}: SessionTimeoutOptions) {
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const lastActivityRef = useRef(Date.now());
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = useCallback(() => {
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  const resetTimers = useCallback(() => {
    clearTimers();
    setShowWarning(false);
    lastActivityRef.current = Date.now();

    warningTimerRef.current = setTimeout(() => {
      setShowWarning(true);
      setSecondsLeft(Math.ceil(warningBeforeMs / 1000));
      countdownRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, timeoutMs - warningBeforeMs);

    logoutTimerRef.current = setTimeout(() => {
      onLogout();
    }, timeoutMs);
  }, [clearTimers, timeoutMs, warningBeforeMs, onLogout]);

  const extendSession = useCallback(() => {
    resetTimers();
  }, [resetTimers]);

  useEffect(() => {
    const handleActivity = () => {
      if (!showWarning) {
        lastActivityRef.current = Date.now();
        resetTimers();
      }
    };

    for (const event of ACTIVITY_EVENTS) {
      document.addEventListener(event, handleActivity, { passive: true });
    }

    resetTimers();

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        document.removeEventListener(event, handleActivity);
      }
      clearTimers();
    };
  }, [resetTimers, clearTimers, showWarning]);

  return { showWarning, secondsLeft, extendSession };
}
