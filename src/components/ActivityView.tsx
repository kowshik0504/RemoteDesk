import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Mail,
  Activity,
  AlertCircle,
} from 'lucide-react';
import { api, ApiClientError } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  TICKET_EVENT_TYPES,
  type ActivityLogItem,
  type EmailOutboxItem,
  type PaginationMeta,
  type TicketEventType,
} from '../shared/types';
import {
  formatDateTime,
  formatEventLabel,
  getEventTextColor,
} from '../utils/format';

interface ActivityViewProps {
  refreshKey: number;
  onSelectTicket: (ticketId: number) => void;
}

export function ActivityView({
  refreshKey,
  onSelectTicket,
}: ActivityViewProps) {
  const { user, token } = useAuth();
  const [tab, setTab] = useState<'activity' | 'emails'>('activity');
  const [eventFilter, setEventFilter] = useState<TicketEventType | 'ALL'>('ALL');
  const [page, setPage] = useState(1);

  const [logs, setLogs] = useState<ActivityLogItem[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 15,
    total: 0,
    totalPages: 1,
  });
  const [emails, setEmails] = useState<EmailOutboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    setLoading(true);
    setError(null);

    if (tab === 'activity') {
      api
        .listActivity(token, { eventType: eventFilter, page, limit: 15 })
        .then((res) => {
          if (active) {
            setLogs(res.logs);
            setPagination(res.pagination);
          }
        })
        .catch((err) => {
          if (active) {
            setError(
              err instanceof ApiClientError
                ? err.message
                : 'Failed to load activity log.'
            );
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    } else {
      api
        .listEmailOutbox(token)
        .then((res) => {
          if (active) setEmails(res.emails);
        })
        .catch((err) => {
          if (active) {
            setError(
              err instanceof ApiClientError
                ? err.message
                : 'Failed to load email notification outbox.'
            );
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }

    return () => {
      active = false;
    };
  }, [token, tab, eventFilter, page, refreshKey]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Events &amp; Audit Log
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {user?.role === 'ADMIN'
              ? 'Real-time event-driven audit trail and dispatched email notifications across all tickets.'
              : 'Event history and email dispatches triggered on your support tickets.'}
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Event log views"
          className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'activity'}
            onClick={() => setTab('activity')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              tab === 'activity'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Activity className="w-3.5 h-3.5" aria-hidden="true" />
            Activity Log
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'emails'}
            onClick={() => setTab('emails')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              tab === 'emails'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Mail className="w-3.5 h-3.5" aria-hidden="true" />
            Email Dispatches
          </button>
        </div>
      </div>

      {tab === 'activity' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div
              role="group"
              aria-label="Filter by event type"
              className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg"
            >
              <button
                type="button"
                aria-pressed={eventFilter === 'ALL'}
                onClick={() => {
                  setEventFilter('ALL');
                  setPage(1);
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  eventFilter === 'ALL'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Events
              </button>
              {TICKET_EVENT_TYPES.map((ev) => (
                <button
                  key={ev}
                  type="button"
                  aria-pressed={eventFilter === ev}
                  onClick={() => {
                    setEventFilter(ev);
                    setPage(1);
                  }}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    eventFilter === ev
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {formatEventLabel(ev)}
                </button>
              ))}
            </div>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {pagination.total} events
            </span>
          </div>

          {error ? (
            <div role="alert" className="p-8 flex items-center gap-3 text-sm text-red-700">
              <AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : loading ? (
            <div className="p-6 space-y-3 animate-pulse">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="h-10 bg-slate-100 rounded" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              No recorded events match this filter.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                      <th className="py-3 pl-6 pr-3 whitespace-nowrap">Event</th>
                      <th className="py-3 px-3 whitespace-nowrap">Ticket</th>
                      <th className="py-3 px-3">Summary</th>
                      <th className="py-3 px-3 whitespace-nowrap">Actor</th>
                      <th className="py-3 pl-3 pr-6 text-right whitespace-nowrap">
                        Timestamp
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/80">
                        <td className="py-3 pl-6 pr-3 text-xs whitespace-nowrap">
                          <span
                            className={`font-medium ${getEventTextColor(log.eventType)}`}
                          >
                            {formatEventLabel(log.eventType)}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono text-xs whitespace-nowrap tabular-nums">
                          {log.ticketId ? (
                            <button
                              type="button"
                              onClick={() => onSelectTicket(log.ticketId!)}
                              className="text-[#2563EB] hover:underline font-medium"
                            >
                              {log.ticketCode}
                            </button>
                          ) : (
                            <span className="text-slate-500">{log.ticketCode}</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-700 max-w-md">
                          {log.summary}
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-600 whitespace-nowrap">
                          {log.actorName}{' '}
                          <span className="text-slate-400">({log.actorRole})</span>
                        </td>
                        <td className="py-3 pl-3 pr-6 text-right font-mono text-xs text-slate-500 whitespace-nowrap tabular-nums">
                          {formatDateTime(log.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="px-6 py-3.5 border-t border-slate-200 flex items-center justify-between bg-slate-50/40">
                <span className="text-xs text-slate-500 tabular-nums">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={pagination.page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="h-8 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 text-xs font-medium text-slate-700 inline-flex items-center gap-1"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() =>
                      setPage((p) => Math.min(pagination.totalPages, p + 1))
                    }
                    className="h-8 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 text-xs font-medium text-slate-700 inline-flex items-center gap-1"
                  >
                    Next
                    <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'emails' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {error ? (
            <div role="alert" className="p-8 flex items-center gap-3 text-sm text-red-700">
              <AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : loading ? (
            <div className="p-6 space-y-3 animate-pulse">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-16 bg-slate-100 rounded" />
              ))}
            </div>
          ) : emails.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              No email notifications have been dispatched yet.
            </div>
          ) : (
            <ul className="divide-y divide-slate-200">
              {emails.map((email) => (
                <li key={email.id} className="px-6 py-4 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`font-medium ${getEventTextColor(email.eventType)}`}
                      >
                        {formatEventLabel(email.eventType)}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className="text-slate-600">
                        To: {email.recipientName} ({email.recipientEmail})
                      </span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className="text-[#16A34A] font-medium">
                        {email.deliveryStatus}
                      </span>
                    </div>
                    <span className="font-mono text-slate-400 tabular-nums">
                      {formatDateTime(email.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">
                    {email.subject}
                  </p>
                  <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">
                    {email.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
