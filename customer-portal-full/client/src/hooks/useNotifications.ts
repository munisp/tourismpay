import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";

interface Notification {
  type: 'claim_update' | 'payment_reminder' | 'policy_renewal' | 'general' | 'system' | 'maintenance' | 'connected';
  title: string;
  message: string;
  timestamp: string;
  data?: any;
}

export function useNotifications(enabled: boolean = true) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [connected, setConnected] = useState(false);

  const showToast = useCallback((notification: Notification) => {
    switch (notification.type) {
      case 'claim_update':
        toast.info(notification.title, {
          description: notification.message,
        });
        break;
      case 'payment_reminder':
        toast.warning(notification.title, {
          description: notification.message,
        });
        break;
      case 'policy_renewal':
        toast.success(notification.title, {
          description: notification.message,
        });
        break;
      case 'system':
      case 'maintenance':
        toast.error(notification.title, {
          description: notification.message,
        });
        break;
      default:
        toast(notification.title, {
          description: notification.message,
        });
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout;

    const connect = () => {
      try {
        eventSource = new EventSource('/api/notifications/stream');

        eventSource.onopen = () => {
          console.log('[Notifications] Connected to notification stream');
          setConnected(true);
        };

        eventSource.onmessage = (event) => {
          try {
            const notification: Notification = JSON.parse(event.data);
            
            if (notification.type === 'connected') {
              console.log('[Notifications]', notification.message);
              return;
            }

            setNotifications(prev => [notification, ...prev].slice(0, 50)); // Keep last 50
            showToast(notification);
          } catch (error) {
            console.error('[Notifications] Failed to parse notification:', error);
          }
        };

        eventSource.onerror = (error) => {
          console.error('[Notifications] Connection error:', error);
          setConnected(false);
          eventSource?.close();
          
          // Reconnect after 5 seconds
          reconnectTimeout = setTimeout(() => {
            console.log('[Notifications] Attempting to reconnect...');
            connect();
          }, 5000);
        };
      } catch (error) {
        console.error('[Notifications] Failed to establish connection:', error);
        setConnected(false);
      }
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (eventSource) {
        eventSource.close();
        setConnected(false);
      }
    };
  }, [enabled, showToast]);

  return {
    notifications,
    connected,
  };
}
