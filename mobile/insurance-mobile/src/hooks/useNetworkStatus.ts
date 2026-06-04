import { useState, useEffect } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

interface NetworkStatus {
  isConnected: boolean;
  connectionType: string;
  isInternetReachable: boolean;
  bandwidth: 'full' | 'reduced' | 'minimal' | 'none';
}

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    isConnected: true, connectionType: 'unknown', isInternetReachable: true, bandwidth: 'full',
  });

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      let bandwidth: NetworkStatus['bandwidth'] = 'full';
      if (!state.isConnected) bandwidth = 'none';
      else if (state.type === 'cellular') {
        const details = state.details as { cellularGeneration?: string } | null;
        if (details?.cellularGeneration === '2g') bandwidth = 'minimal';
        else if (details?.cellularGeneration === '3g') bandwidth = 'reduced';
      }
      setStatus({
        isConnected: !!state.isConnected,
        connectionType: state.type,
        isInternetReachable: !!state.isInternetReachable,
        bandwidth,
      });
    });
    return unsubscribe;
  }, []);

  return status;
}
