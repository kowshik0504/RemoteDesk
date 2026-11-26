import { useEffect, useState } from 'react';
import { ArrowRight, RefreshCw, AlertCircle } from 'lucide-react';
import { api, ApiClientError } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { DashboardStatsResponse } from '../shared/types';
import {
  formatEventLabel,
  formatPriorityLabel,
  formatRelativeTime,
  formatStatusLabel,
  getEventTextColor,
  getPriorityTextColor,
  getStatusTextColor,
} from '../utils/format';

interface OverviewViewProps {
  refreshKey: number;
  onSelectTicket: (ticketId: number) => void;
  onNavigateTickets: (statusFilter?: string) => void;
  onNavigateActivity: () => void;
  onOpenCreateModal: () => void;
}

export function OverviewView({
  refreshKey,
  onSelectTicket,
  onNavigateTickets,
  onNavigateActivity,
  onOpenCreateModal,
}: OverviewViewProps) {
  const { user, token } = useAuth();
  const [data, setData] = useState<DashboardStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    setLoading(true);
    setError(null);
    api
      .getDashboardStats(token)
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof ApiClientError
              ? err.message
              : 'Could not load dashboard metrics.'
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, refreshKey]);

  if (loading && !data) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-28 rounded-xl bg-white border border-slate-200 p-5 animate-pulse"
            >
              <div className="h-3 w-24 bg-slate-200 rounded mb-4" />
              <div className="h-7 w-16 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
        <div className="h-72 rounded-xl bg-white border border-slate-200 animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="bg-white border border-red-200 rounded-xl p-6 flex items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!token) return;
            setLoading(true);
            setError(null);
            api
              .getDashboardStats(token)
              .then(setData)
              .catch(() => setError('Still unable to load dashboard metrics.'))
              .finally(() => setLoading(false));
          }}
          className="px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { summary, byPriority, byCategory, recentTickets, recentActivity } = data;
  const maxPriorityCount = Math.max(1, ...byPriority.map((p) => p.count));
  const maxCategoryCount = Math.max(1, ...byCategory.map((c) => c.count));

  return (
    <div className="space-y-8">
      {/* Header intro */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            {user?.role === 'ADMIN'
              ? 'Helpdesk Operations Overview'
              : `Welcome back, ${user?.name}`}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {user?.role === 'ADMIN'
              ? 'Live queue summary across all submitted tickets, resolutions, and recent system events.'
              : 'Track your active support requests, status changes, and recent team replies.'}
          </p>
        </div>
      </div>

      {/* 4-column single-elevation interactive KPI grid */}
      <section aria-label="Ticket summary statistics">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-xl overflow-hidden divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
          <button
            type="button"
            onClick={() => onNavigateTickets('ALL')}
            className="p-5 text-left hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2563EB]"
          >
            <p className="text-xs font-medium text-slate-500">Total Tickets</p>
            <p className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular-nums">
              {summary.total}
            </p>
            <p className="mt-1.5 text-xs text-slate-500 tabular-nums">
              {summary.open} open · {summary.closed} closed
            </p>
          </button>
          <button
            type="button"
            onClick={() => onNavigateTickets('OPEN')}
            className="p-5 text-left hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2563EB]"
          >
            <p className="text-xs font-medium text-slate-500">Open Queue</p>
            <p className="mt-2 font-mono text-3xl font-semibold text-[#2563EB] tabular-nums">
              {summary.open}
            </p>
            <p className="mt-1.5 text-xs text-slate-500 tabular-nums">
              {summary.urgent} urgent active
            </p>
          </button>
          <button
            type="button"
            onClick={() => onNavigateTickets('IN_PROGRESS')}
            className="p-5 text-left hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2563EB]"
          >
            <p className="text-xs font-medium text-slate-500">In Progress</p>
            <p className="mt-2 font-mono text-3xl font-semibold text-[#D97706] tabular-nums">
              {summary.inProgress}
            </p>
            <p className="mt-1.5 text-xs text-slate-500 tabular-nums">
              Under active investigation
            </p>
          </button>
          <button
            type="button"
            onClick={() => onNavigateTickets('RESOLVED')}
            className="p-5 text-left hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2563EB]"
          >
            <p className="text-xs font-medium text-slate-500">Resolution Rate</p>
            <p className="mt-2 font-mono text-3xl font-semibold text-[#16A34A] tabular-nums">
              {summary.resolutionRate}%
            </p>
            <p className="mt-1.5 text-xs text-slate-500 tabular-nums">
              {summary.resolved + summary.closed} resolved or closed
            </p>
          </button>
        </div>
      </section>

      {/* Main 2-column operational split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 8 cols: Recent Tickets */}
        <section className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              {user?.role === 'ADMIN' ? 'Recently Updated Tickets' : 'Your Recent Tickets'}
            </h2>
            <button
              type="button"
              onClick={() => onNavigateTickets('ALL')}
              className="text-xs font-medium text-[#2563EB] hover:text-[#1D4ED8] inline-flex items-center gap-1 whitespace-nowrap"
            >
              <span>View all tickets</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          {recentTickets.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <p className="text-sm font-medium text-slate-900">
                No support tickets yet
              </p>
              <p className="text-sm text-slate-500 max-w-sm mx-auto">
                Submit your first support ticket to start tracking status transitions
                and conversation history.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onOpenCreateModal}
                  className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-medium transition-colors"
                >
                  Create First Ticket
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {recentTickets.map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => onSelectTicket(ticket.id)}
                  className="w-full text-left px-6 py-3.5 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono font-medium text-slate-700 tabular-nums">
                        {ticket.ticketCode}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{ticket.category}</span>
                      {user?.role === 'ADMIN' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{ticket.requesterName}</span>
                        </>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm font-medium text-slate-900 truncate">
                      {ticket.title}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-xs tabular-nums">
                    <span className={getPriorityTextColor(ticket.priority)}>
                      {formatPriorityLabel(ticket.priority)}
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      /
                    </span>
                    <span className={getStatusTextColor(ticket.status)}>
                      {formatStatusLabel(ticket.status)}
                    </span>
                    <span className="text-slate-400 font-mono w-14 text-right">
                      {formatRelativeTime(ticket.updatedAt)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Right 4 cols: Distributions */}
        <section className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900 mb-4">
              Tickets by Priority
            </h2>
            <div className="space-y-3">
              {[...byPriority].reverse().map((item) => {
                const pct = Math.round((item.count / maxPriorityCount) * 100);
                const barColor =
                  item.priority === 'URGENT'
                    ? 'bg-[#DC2626]'
                    : item.priority === 'HIGH'
                    ? 'bg-[#D97706]'
                    : item.priority === 'MEDIUM'
                    ? 'bg-[#2563EB]'
                    : 'bg-slate-400';

                return (
                  <div key={item.priority} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className={getPriorityTextColor(item.priority)}>
                        {formatPriorityLabel(item.priority)}
                      </span>
                      <span className="font-mono text-slate-700 tabular-nums">
                        {item.count}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${barColor} transition-all duration-300`}
                        style={{ width: `${item.count > 0 ? Math.max(6, pct) : 0}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-slate-200 pt-5">
            <h2 className="font-display text-sm font-semibold text-slate-900 mb-4">
              Tickets by Category
            </h2>
            {byCategory.length === 0 ? (
              <p className="text-xs text-slate-500">No category data yet.</p>
            ) : (
              <div className="space-y-3">
                {byCategory.map((item) => {
                  const pct = Math.round((item.count / maxCategoryCount) * 100);
                  return (
                    <div key={item.category} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-700 font-medium">
                          {item.category}
                        </span>
                        <span className="font-mono text-slate-600 tabular-nums">
                          {item.count}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-slate-700 transition-all duration-300"
                          style={{ width: `${Math.max(6, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Event-Driven Activity Log Preview */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Recent Event Activity
          </h2>
          <button
            type="button"
            onClick={onNavigateActivity}
            className="text-xs font-medium text-[#2563EB] hover:text-[#1D4ED8] inline-flex items-center gap-1 whitespace-nowrap"
          >
            <span>Open full audit log</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        {recentActivity.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Activity events will appear here as tickets are created, updated, or resolved.
          </div>
        ) : (
          <ul className="divide-y divide-slate-200">
            {recentActivity.map((log) => (
              <li
                key={log.id}
                className="px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`font-medium ${getEventTextColor(log.eventType)}`}
                    >
                      {formatEventLabel(log.eventType)}
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="font-mono text-slate-600 tabular-nums">
                      {log.ticketCode}
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="text-slate-500">{log.actorName}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-700 truncate">
                    {log.summary}
                  </p>
                </div>
                <span className="text-xs font-mono text-slate-400 tabular-nums shrink-0">
                  {formatRelativeTime(log.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
