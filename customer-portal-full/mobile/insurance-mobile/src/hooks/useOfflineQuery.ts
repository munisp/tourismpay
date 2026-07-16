import { useQuery, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import { useOfflineSync } from '../services/offlineSync';
import { useNetworkStatus } from './useNetworkStatus';

export function useOfflineQuery<T>(
  key: string[],
  fetchFn: () => Promise<T>,
  options?: Partial<UseQueryOptions<T, Error>>
): UseQueryResult<T, Error> {
  const { getCachedData, setCachedData } = useOfflineSync();
  const { isConnected, bandwidth } = useNetworkStatus();
  const cacheKey = key.join(':');

  return useQuery<T, Error>({
    queryKey: key,
    queryFn: async () => {
      if (!isConnected || bandwidth === 'minimal') {
        const cached = await getCachedData<T>(cacheKey);
        if (cached) return cached;
        throw new Error('No cached data available offline');
      }
      try {
        const data = await fetchFn();
        const ttl = bandwidth === 'reduced' ? 120 * 60 * 1000 : 60 * 60 * 1000;
        await setCachedData(cacheKey, data, ttl);
        return data;
      } catch (err) {
        const cached = await getCachedData<T>(cacheKey);
        if (cached) return cached;
        throw err;
      }
    },
    staleTime: bandwidth === 'full' ? 5 * 60 * 1000 : 30 * 60 * 1000,
    ...options,
  });
}
