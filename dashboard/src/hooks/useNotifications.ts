import { useState, useCallback } from 'react';
import type { Notification } from '@/types';
import { generateId } from '@/utils/id';

const AUTO_DISMISS_MS = 5000;

// 🍊 Hook for managing toast-style notifications.
// Notifications auto-dismiss after 5 seconds but can be manually dismissed.
// They stack vertically and animate out — the component handles the visuals.
export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback((
    type: Notification['type'],
    title: string,
    message: string
  ) => {
    const id = generateId();
    const notification: Notification = {
      id,
      type,
      title,
      message,
      timestamp: new Date(),
      dismissed: false,
    };

    setNotifications(prev => [...prev, notification]);

    // Auto-dismiss after timeout
    setTimeout(() => {
      dismiss(id);
    }, AUTO_DISMISS_MS);
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, dismissed: true } : n)
    );
    // Remove from DOM after animation completes
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 300);
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  // Convenience methods
  const info = useCallback((title: string, message: string) => addNotification('info', title, message), [addNotification]);
  const success = useCallback((title: string, message: string) => addNotification('success', title, message), [addNotification]);
  const warning = useCallback((title: string, message: string) => addNotification('warning', title, message), [addNotification]);
  const error = useCallback((title: string, message: string) => addNotification('error', title, message), [addNotification]);

  return {
    notifications: notifications.filter(n => !n.dismissed),
    addNotification,
    dismiss,
    clearAll,
    info,
    success,
    warning,
    error,
  };
}
