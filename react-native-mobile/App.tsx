import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import AppNavigator from "./src/navigation/AppNavigator";
import { offlineStore } from "./src/services/offlineStore";
import { api } from "./src/services/api";

export default function App() {
  useEffect(() => {
    api.init();
    offlineStore.init();
    return () => offlineStore.destroy();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <AppNavigator />
    </GestureHandlerRootView>
  );
}
