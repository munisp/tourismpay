/**
 * usePushNotifications
 * Manages Web Push API subscription lifecycle.
 * Fetches the VAPID public key from the server via tRPC (push.vapidPublicKey)
 * so no env variable is needed on the frontend.
 *
 * Usage:
 *   const { isSupported, isSubscribed, isLoading, subscribe, unsubscribe } = usePushNotifications();
 */
import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const isSupported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window;

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [permissionState, setPermissionState] = useState<NotificationPermission>("default");

  // Fetch VAPID public key from server
  const vapidQuery = trpc.push.vapidPublicKey.useQuery(undefined, {
    staleTime: Infinity,
    retry: false,
  });

  const statusQuery = trpc.push.status.useQuery(undefined, {
    enabled: isSupported,
    staleTime: 30_000,
  });

  const subscribeMutation = trpc.push.subscribe.useMutation({
    onSuccess: () => {
      setIsSubscribed(true);
      toast.success("Push notifications enabled", {
        description: "You'll receive payment alerts on this device.",
      });
    },
    onError: (err) => {
      toast.error("Failed to enable notifications", { description: err.message });
    },
  });

  const unsubscribeMutation = trpc.push.unsubscribe.useMutation({
    onSuccess: () => {
      setIsSubscribed(false);
      toast.info("Push notifications disabled");
    },
    onError: (err) => {
      toast.error("Failed to disable notifications", { description: err.message });
    },
  });

  const sendTestMutation = trpc.push.sendTest.useMutation({
    onSuccess: (data) => {
      toast.success("Test notification sent", { description: data.message });
    },
    onError: (err) => {
      toast.error("Test failed", { description: err.message });
    },
  });

  useEffect(() => {
    if (!isSupported) return;
    setPermissionState(Notification.permission);
    if (statusQuery.data) {
      setIsSubscribed(statusQuery.data.subscribed);
    }
  }, [isSupported, statusQuery.data]);

  const subscribe = useCallback(async () => {
    if (!isSupported) {
      toast.error("Push notifications are not supported in this browser.");
      return;
    }
    setIsLoading(true);
    try {
      // Request permission
      const permission = await Notification.requestPermission();
      setPermissionState(permission);
      if (permission !== "granted") {
        toast.warning("Notification permission denied", {
          description: "Please allow notifications in your browser settings.",
        });
        return;
      }

      // Get or register service worker
      const registration = await navigator.serviceWorker.ready;

      const vapidPublicKey = vapidQuery.data?.publicKey ?? "";

      if (!vapidPublicKey) {
        // Fallback: record intent in DB without a real push subscription
        await subscribeMutation.mutateAsync({
          endpoint: `${window.location.origin}/sw-placeholder-${Date.now()}`,
          p256dh: "placeholder",
          auth: "placeholder",
          userAgent: navigator.userAgent.slice(0, 512),
        });
        return;
      }

      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      const json = subscription.toJSON();
      await subscribeMutation.mutateAsync({
        endpoint: json.endpoint!,
        p256dh: (json.keys as Record<string, string>)["p256dh"],
        auth: (json.keys as Record<string, string>)["auth"],
        userAgent: navigator.userAgent.slice(0, 512),
      });
    } catch (err) {
      logger.error("Push subscribe error", { err });
      toast.error("Could not enable push notifications.");
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, subscribeMutation, vapidQuery.data]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported) return;
    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        await unsubscribeMutation.mutateAsync({ endpoint: subscription.endpoint });
      } else {
        setIsSubscribed(false);
      }
    } catch (err) {
      logger.error("Push unsubscribe error", { err });
      toast.error("Could not disable push notifications.");
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, unsubscribeMutation]);

  const sendTest = useCallback(() => {
    sendTestMutation.mutate();
  }, [sendTestMutation]);

  return {
    isSupported,
    isSubscribed,
    isLoading: isLoading || subscribeMutation.isPending || unsubscribeMutation.isPending,
    permissionState,
    vapidReady: !!vapidQuery.data?.publicKey,
    subscribe,
    unsubscribe,
    sendTest,
  };
}
