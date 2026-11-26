import { CheckCheck, Check } from 'lucide-react';
import type { NotificationItem } from '../shared/types';
import {
  formatDateTime,
  formatEventLabel,
  getEventTextColor,
} from '../utils/format';

interface NotificationsViewProps {
  notifications: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  onMarkRead: (id: number) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
  onSelectTicket: (ticketId: number) => void;
}

export function NotificationsView({
  notifications,
  unreadCount,
  loading,
  onMarkRead,
  onMarkAllRead,
  onSelectTicket,
}: NotificationsViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Automatic alerts triggered when tickets are created, updated, commented on, or resolved.
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="h-9 px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 self-start whitespace-nowrap"
          >
            <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
            Mark all as read ({unreadCount})
          </button>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading && notifications.length === 0 ? (
          <div className="p-6 space-y-3 animate-pulse">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-14 bg-slate-100 rounded" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <p className="text-sm font-medium text-slate-900">
              You are all caught up
            </p>
            <p className="text-sm text-slate-500">
              Event notifications will appear here when ticket updates occur.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-200">
            {notifications.map((item) => (
              <li
                key={item.id}
                className={`px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  item.isRead ? 'bg-white' : 'bg-blue-50/40'
                }`}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`font-medium ${getEventTextColor(item.eventType)}`}
                    >
                      {formatEventLabel(item.eventType)}
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="font-mono text-slate-400 tabular-nums">
                      {formatDateTime(item.createdAt)}
                    </span>
                    {!item.isRead && (
                      <>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span className="text-[#2563EB] font-semibold">
                          Unread
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-slate-900">
                    {item.title}
                  </p>
                  <p className="text-sm text-slate-600">{item.message}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {item.ticketId && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!item.isRead) {
                          onMarkRead(item.id);
                        }
                        onSelectTicket(item.ticketId!);
                      }}
                      className="h-8 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 whitespace-nowrap"
                    >
                      Open Ticket
                    </button>
                  )}
                  {!item.isRead && (
                    <button
                      type="button"
                      onClick={() => onMarkRead(item.id)}
                      aria-label={`Mark notification ${item.title} as read`}
                      className="h-8 px-2.5 rounded-lg text-xs font-medium text-[#2563EB] hover:bg-blue-50 inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      Mark read
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
