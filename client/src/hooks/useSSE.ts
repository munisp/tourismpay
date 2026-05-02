/**
 * useSSE — React hook for consuming Server-Sent Events streams.
 * Handles connection, reconnection, and event parsing automatically.
 */
import { useEffect, useRef, useState, useCallback } from "react";

export type SSEStatus = "connecting" | "connected" | "disconnected" | "error";

export type SSEEvent<T = unknown> = {
  type: string;
  data: T;
  timestamp: string;
};

type UseSSEOptions = {
  /** Auto-reconnect on disconnect (default: true) */
  autoReconnect?: boolean;
  /** Reconnect delay in ms (default: 3000) */
  reconnectDelay?: number;
  /** Maximum reconnect attempts (default: 10) */
  maxRetries?: number;
};

export function useSSE<T = unknown>(
  url: string,
  options: UseSSEOptions = {}
) {
  const { autoReconnect = true, reconnectDelay = 3000, maxRetries = 10 } = options;

  const [status, setStatus] = useState<SSEStatus>("connecting");
  const [events, setEvents] = useState<SSEEvent<T>[]>([]);
  const [lastEvent, setLastEvent] = useState<SSEEvent<T> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const retriesRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    setStatus("connecting");
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      if (!mountedRef.current) return;
      setStatus("connected");
      setError(null);
      retriesRef.current = 0;
    };

    es.onerror = () => {
      if (!mountedRef.current) return;
      setStatus("error");
      es.close();

      if (autoReconnect && retriesRef.current < maxRetries) {
        retriesRef.current++;
        setStatus("disconnected");
        reconnectTimerRef.current = setTimeout(connect, reconnectDelay);
      } else {
        setError(`Connection failed after ${retriesRef.current} retries`);
      }
    };

    // Listen for all named events
    const handleEvent = (eventType: string) => (e: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const parsed = JSON.parse(e.data) as T;
        const sseEvent: SSEEvent<T> = {
          type: eventType,
          data: parsed,
          timestamp: new Date().toISOString(),
        };
        setLastEvent(sseEvent);
        setEvents((prev) => [sseEvent, ...prev].slice(0, 100)); // keep last 100
      } catch {
        // Malformed event — ignore
      }
    };

    es.addEventListener("connected", handleEvent("connected"));
    es.addEventListener("snapshot", handleEvent("snapshot"));
    es.addEventListener("new_alerts", handleEvent("new_alerts"));
    es.addEventListener("status_updates", handleEvent("status_updates"));
    es.addEventListener("error_event", handleEvent("error_event"));
  }, [url, autoReconnect, reconnectDelay, maxRetries]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      esRef.current?.close();
    };
  }, [connect]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    esRef.current?.close();
    setStatus("disconnected");
  }, []);

  const clearEvents = useCallback(() => setEvents([]), []);

  return { status, events, lastEvent, error, disconnect, clearEvents };
}
