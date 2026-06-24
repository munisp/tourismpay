/**
 * Universal API data hook for mobile screens.
 * Handles loading, error, and refresh states for any tRPC endpoint.
 */
import { useState, useEffect, useCallback } from "react";
import { request } from "../services/api";

interface UseApiDataOptions<T> {
  endpoint: string;
  params?: Record<string, unknown>;
  defaultValue: T;
  enabled?: boolean;
}

interface UseApiDataResult<T> {
  data: T;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  refreshing: boolean;
}

export function useApiData<T>({
  endpoint,
  params,
  defaultValue,
  enabled = true,
}: UseApiDataOptions<T>): UseApiDataResult<T> {
  const [data, setData] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(
    async (isRefresh = false) => {
      if (!enabled) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const result = await request<{ result: { data: T } }>(endpoint, {
          method: params ? "POST" : "GET",
          body: params,
        });
        setData(result?.result?.data ?? defaultValue);
      } catch (err: any) {
        setError(err.message || "Failed to load data");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [endpoint, JSON.stringify(params), enabled]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refresh = useCallback(() => fetchData(true), [fetchData]);

  return { data, loading, error, refresh, refreshing };
}

export function useApiMutation<TInput, TResult>(endpoint: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(
    async (input: TInput): Promise<TResult | null> => {
      setLoading(true);
      setError(null);
      try {
        const result = await request<{ result: { data: TResult } }>(endpoint, {
          method: "POST",
          body: input,
        });
        return result?.result?.data ?? null;
      } catch (err: any) {
        setError(err.message || "Mutation failed");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [endpoint]
  );

  return { mutate, loading, error };
}
