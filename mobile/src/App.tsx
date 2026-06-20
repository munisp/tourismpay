/**
 * TourismPay Mobile — Root App component.
 * Initializes navigation, authentication, push notifications, and offline manager.
 */
import React, { useEffect } from "react";
import { StatusBar, LogBox } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { RootNavigator } from "./navigation/RootNavigator";
import { LoginScreen } from "./screens/auth/LoginScreen";
import { linking } from "./navigation/linking";
import { offlineManager } from "./services/offline";
import { pushService } from "./services/pushNotifications";

LogBox.ignoreLogs(["Non-serializable values were found in the navigation state"]);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      refetchOnWindowFocus: true,
    },
  },
});

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    offlineManager.initialize();
    if (isAuthenticated) {
      pushService.initialize();
    }
    return () => {
      offlineManager.destroy();
    };
  }, [isAuthenticated]);

  if (isLoading) {
    return null; // Splash screen handled by native layer
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <NavigationContainer linking={linking}>
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StatusBar barStyle="light-content" backgroundColor="#0f0f1a" />
        <AppContent />
      </AuthProvider>
    </QueryClientProvider>
  );
}
