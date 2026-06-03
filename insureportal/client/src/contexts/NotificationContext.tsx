import React, { createContext, useContext, useState, type ReactNode } from "react";

interface NotificationContextType {
  notifications: Array<{ id: string; message: string; type: string }>;
  addNotification: (message: string, type?: string) => void;
  clearNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  addNotification: () => {},
  clearNotifications: () => {},
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Array<{ id: string; message: string; type: string }>>([]);

  const addNotification = (message: string, type = "info") => {
    setNotifications(prev => [...prev, { id: Date.now().toString(), message, type }]);
  };

  const clearNotifications = () => setNotifications([]);

  return (
    <NotificationContext.Provider value={{ notifications, addNotification, clearNotifications }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
