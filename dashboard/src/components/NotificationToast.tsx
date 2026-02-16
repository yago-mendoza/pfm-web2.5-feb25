import { X, Info, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import type { Notification } from '@/types';

const ICON_MAP = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
};

const STYLE_MAP = {
  info: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  error: 'border-red-500/30 bg-red-500/10 text-red-300',
};

interface NotificationToastProps {
  notifications: Notification[];
  onDismiss: (id: string) => void;
}

// 🍊 Toast notification component. Fixed position in the top-right corner.
// Each notification slides in, stays for 5 seconds, then fades out.
// The stack grows downward — newest at the bottom.
export default function NotificationToast({ notifications, onDismiss }: NotificationToastProps) {
  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {notifications.map(notification => {
        const Icon = ICON_MAP[notification.type];
        const style = STYLE_MAP[notification.type];

        return (
          <div
            key={notification.id}
            className={`flex items-start gap-3 p-3 rounded-lg border ${style}
                       shadow-lg backdrop-blur-sm animate-in slide-in-from-right
                       transition-all duration-300`}
          >
            <Icon className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{notification.title}</p>
              <p className="text-xs opacity-80 mt-0.5 break-words">{notification.message}</p>
            </div>
            <button
              onClick={() => onDismiss(notification.id)}
              className="text-slate-500 hover:text-slate-300 transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
