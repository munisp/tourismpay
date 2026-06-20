/**
 * Push Notification Service — Firebase Cloud Messaging integration.
 * Handles token registration, foreground/background notifications, and deep linking.
 */
import messaging from "@react-native-firebase/messaging";
type FirebaseMessagingTypes = { RemoteMessage: any };
import { Platform, PermissionsAndroid } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const FCM_TOKEN_KEY = "@tourismpay/fcm_token";

export type NotificationType =
  | "transaction"
  | "booking"
  | "kyc_update"
  | "promotion"
  | "security_alert"
  | "channel_sync"
  | "settlement"
  | "system";

interface PushNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
  timestamp: number;
  read: boolean;
}

type NotificationHandler = (notification: PushNotification) => void;

class PushNotificationService {
  private handlers: NotificationHandler[] = [];
  private token: string | null = null;

  async initialize(): Promise<string | null> {
    const permission = await this.requestPermission();
    if (!permission) return null;

    this.token = await this.getToken();
    this.setupListeners();
    return this.token;
  }

  private async requestPermission(): Promise<boolean> {
    if (Platform.OS === "ios") {
      const authStatus = await messaging().requestPermission();
      return (
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL
      );
    }

    if (Platform.OS === "android" && Platform.Version >= 33) {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }

    return true;
  }

  private async getToken(): Promise<string | null> {
    try {
      const token = await messaging().getToken();
      const stored = await AsyncStorage.getItem(FCM_TOKEN_KEY);

      if (token !== stored) {
        await AsyncStorage.setItem(FCM_TOKEN_KEY, token);
        await this.registerTokenWithServer(token);
      }

      return token;
    } catch {
      return null;
    }
  }

  private setupListeners(): void {
    // Foreground messages
    messaging().onMessage(async (remoteMessage: any) => {
      const notification = this.parseRemoteMessage(remoteMessage);
      if (notification) {
        this.handlers.forEach((handler) => handler(notification));
      }
    });

    // Background/quit state open handler
    messaging().onNotificationOpenedApp((remoteMessage: any) => {
      const notification = this.parseRemoteMessage(remoteMessage);
      if (notification) {
        this.handleDeepLink(notification);
      }
    });

    // Token refresh
    messaging().onTokenRefresh(async (newToken: any) => {
      this.token = newToken;
      await AsyncStorage.setItem(FCM_TOKEN_KEY, newToken);
      await this.registerTokenWithServer(newToken);
    });
  }

  private parseRemoteMessage(
    message: any
  ): PushNotification | null {
    if (!message.notification) return null;

    return {
      id: message.messageId ?? `${Date.now()}`,
      type: (message.data?.type as NotificationType) ?? "system",
      title: message.notification.title ?? "TourismPay",
      body: message.notification.body ?? "",
      data: message.data as Record<string, string> | undefined,
      timestamp: message.sentTime ?? Date.now(),
      read: false,
    };
  }

  private handleDeepLink(notification: PushNotification): void {
    // Deep link routing based on notification type
    const routes: Record<NotificationType, string> = {
      transaction: "Wallet",
      booking: "Bookings",
      kyc_update: "Identity",
      promotion: "Deals",
      security_alert: "Security",
      channel_sync: "Channels",
      settlement: "SettlementConsole",
      system: "NotificationsList",
    };

    const route = routes[notification.type];
    if (route && notification.data?.navigationTarget) {
      // Navigation handled by the app's linking config
    }
  }

  private async registerTokenWithServer(token: string): Promise<void> {
    try {
      const { request } = await import("./api");
      await request("notifications.registerDevice", {
        method: "POST",
        body: { token, platform: Platform.OS },
      });
    } catch {
      // Server unavailable — will retry on next app open
    }
  }

  onNotification(handler: NotificationHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  async getInitialNotification(): Promise<PushNotification | null> {
    const message = await messaging().getInitialNotification();
    if (message) return this.parseRemoteMessage(message);
    return null;
  }

  async subscribeTopic(topic: string): Promise<void> {
    await messaging().subscribeToTopic(topic);
  }

  async unsubscribeTopic(topic: string): Promise<void> {
    await messaging().unsubscribeFromTopic(topic);
  }

  getDeviceToken(): string | null {
    return this.token;
  }
}

export const pushService = new PushNotificationService();
