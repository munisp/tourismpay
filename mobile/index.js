/**
 * TourismPay Mobile — Entry point.
 * Registers the app component and background message handler.
 */
import { AppRegistry } from "react-native";
import messaging from "@react-native-firebase/messaging";
import App from "./src/App";
import { name as appName } from "./app.json";

// Register background message handler (runs when app is killed)
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  // Handle data-only notifications in background
  console.log("Background message:", remoteMessage.data);
});

AppRegistry.registerComponent(appName, () => App);
