/**
 * TourismPay Mobile — Root Layout
 * Wraps the entire app with tRPC + React Query providers.
 */
import React, { useState } from "react";
import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpc, buildTRPCClient } from "../lib/trpc";

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { retry: 2, staleTime: 30_000 },
    },
  }));
  const [trpcClient] = useState(() => buildTRPCClient());

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="bis/[id]" options={{ title: "Investigation Detail" }} />
          <Stack.Screen name="payment/qr-scan" options={{ title: "Scan QR Code" }} />
          <Stack.Screen name="biometric/register" options={{ title: "Register Biometric" }} />
          <Stack.Screen name="identity/did" options={{ title: "DID Wallet" }} />
          <Stack.Screen name="loyalty/rewards" options={{ title: "Loyalty Rewards" }} />
          <Stack.Screen name="finance/apply" options={{ title: "Apply for Finance" }} />
          <Stack.Screen name="africa/kyb" options={{ title: "KYB Onboarding" }} />
          <Stack.Screen name="merchant/revenue" options={{ title: "Revenue Dashboard" }} />
          <Stack.Screen name="merchant/kyb-onboarding" options={{ title: "Merchant Onboarding" }} />
        </Stack>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
