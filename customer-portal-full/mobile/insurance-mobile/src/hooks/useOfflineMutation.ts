import { useMutation, UseMutationOptions } from '@tanstack/react-query';
import { useOfflineSync } from '../services/offlineSync';
import { useNetworkStatus } from './useNetworkStatus';

interface OfflineMutationOptions<TData, TVariables> extends Omit<UseMutationOptions<TData, Error, TVariables>, 'mutationFn'> {
  entity: string;
  type: 'CREATE' | 'UPDATE' | 'DELETE';
  priority?: 'critical' | 'high' | 'normal' | 'low';
  onlineFn: (variables: TVariables) => Promise<TData>;
}

export function useOfflineMutation<TData, TVariables extends Record<string, unknown>>({
  entity, type, priority = 'normal', onlineFn, ...options
}: OfflineMutationOptions<TData, TVariables>) {
  const { enqueue } = useOfflineSync();
  const { isConnected } = useNetworkStatus();

  return useMutation<TData, Error, TVariables>({
    mutationFn: async (variables) => {
      if (isConnected) {
        try { return await onlineFn(variables); }
        catch (err) {
          await enqueue({ type, entity, payload: variables, maxRetries: 10, priority, conflictStrategy: 'client-wins' });
          return { queued: true, offlineId: `op_${Date.now()}` } as unknown as TData;
        }
      }
      await enqueue({ type, entity, payload: variables, maxRetries: 10, priority, conflictStrategy: 'client-wins' });
      return { queued: true, offlineId: `op_${Date.now()}` } as unknown as TData;
    },
    ...options,
  });
}
