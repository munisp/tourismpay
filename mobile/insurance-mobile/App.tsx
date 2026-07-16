import React, { useEffect } from 'react';
import { StatusBar, LogBox } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { AppNavigator } from './src/navigation/AppNavigator';
import { AuthProvider } from './src/store/authStore';
import { OfflineSyncProvider } from './src/services/offlineSync';
import { NotificationService } from './src/services/notifications';
import { BiometricGate } from './src/components/BiometricGate';

LogBox.ignoreLogs(['Non-serializable values']);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
      networkMode: 'offlineFirst',
    },
    mutations: {
      networkMode: 'offlineFirst',
      retry: 2,
    },
  },
});

onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected);
  });
});

export default function App() {
  useEffect(() => {
    NotificationService.initialize();
    NotificationService.requestPermission();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <OfflineSyncProvider>
          <BiometricGate>
            <NavigationContainer>
              <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
              <AppNavigator />
            </NavigationContainer>
          </BiometricGate>
        </OfflineSyncProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
