import { useEffect, useState } from 'react';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Plus,
  MessageSquare,
  AlertCircle,
  X,
  Download,
} from 'lucide-react';
import { api, ApiClientError } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type AdminUserSummary,
  type PaginationMeta,
  type TicketListItem,
} from '../shared/types';
import {
  formatPriorityLabel,
  formatRelativeTime,
  formatStatusLabel,
  getPriorityTextColor,
  getStatusTextColor,
} from '../utils/format';
import { buildTicketsCsv, downloadCsvFile } from '../utils/csv';

interface TicketsViewProps {
  refreshKey: number;
  initialStatusFilter?: string;
  onSelectTicket: (ticketId: number) => void;
  onOpenCreateModal: () => void;
}

export function TicketsView({
  refreshKey,
  initialStatusFilter = 'ALL',
  onSelectTicket,
  onOpenCreateModal,
}: TicketsViewProps) {
  const { user, token } = useAuth();
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [requesters, setRequesters] = useState<AdminUserSummary[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter);
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [requesterFilter, setRequesterFilter] = useState<string>('ALL');
  const [searchInput, setSearchInput] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [sortBy, setSortBy] = useState<'createdAt' | 'updatedAt' | 'priority'>(
    'createdAt'
  );
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState<number>(1);

  useEffect(() => {
    setStatusFilter(initialStatusFilter);
    setPage(1);
  }, [initialStatusFilter]);

  useEffect(() => {
    if (!token || user?.role !== 'ADMIN') return;
    api
      .listAdminUsers(token)
      .then((res) => setRequesters(res.users))
      .catch(() => undefined);
  }, [token, user?.role]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 220);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    setLoading(true);
    setError(null);

    api
      .listTickets(token, {
        status: statusFilter,
        priority: priorityFilter,
        category: categoryFilter,
        requesterId:
          user?.role === 'ADMIN' && requesterFilter !== 'ALL'
            ? requesterFilter
            : undefined,
        search: debouncedSearch,
        sortBy,
        sortOrder,
        page,
        limit: 8,
      })
      .then((res) => {
        if (active) {
          setTickets(res.tickets);
          setPagination(res.pagination);
        }
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof ApiClientError
              ? err.message
              : 'Failed to load tickets.'
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    token,
    user?.role,
    statusFilter,
    priorityFilter,
    categoryFilter,
    requesterFilter,
    debouncedSearch,
    sortBy,
    sortOrder,
    page,
    refreshKey,
  ]);

  const hasActiveFilters =
    statusFilter !== 'ALL' ||
    priorityFilter !== 'ALL' ||
    categoryFilter !== 'ALL' ||
    requesterFilter !== 'ALL' ||
    debouncedSearch.length > 0;

  const resetFilters = () => {
    setStatusFilter('ALL');
    setPriorityFilter('ALL');
    setCategoryFilter('ALL');
    setRequesterFilter('ALL');
    setSearchInput('');
    setDebouncedSearch('');
    setSortBy('createdAt');
    setSortOrder('desc');
    setPage(1);
  };

  const handleExportCsv = () => {
    if (tickets.length === 0) return;
    const csv = buildTicketsCsv(tickets);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsvFile(csv, `resolvedesk-tickets-${stamp}.csv`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            {user?.role === 'ADMIN' ? 'All Support Tickets' : 'My Support Tickets'}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {user?.role === 'ADMIN'
              ? 'Manage, triage, and resolve requests submitted across all users.'
              : 'View your submitted tickets, edit active requests, and track resolutions.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs font-mono text-slate-500 tabular-nums">
            {pagination.total} {pagination.total === 1 ? 'ticket' : 'tickets'} found
          </p>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={tickets.length === 0 || loading}
            className="h-8 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Status segmented filter tabs */}
          <div
            role="group"
            aria-label="Filter by ticket status"
            className="inline-flex flex-nowrap overflow-x-auto max-w-full items-center gap-1 p-1 bg-slate-100 rounded-lg"
          >
            {(['ALL', ...TICKET_STATUSES] as const).map((status) => {
              const active = statusFilter === status;
              const label =
                status === 'ALL' ? 'All' : formatStatusLabel(status);
              return (
                <button
                  key={status}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setStatusFilter(status);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Search input */}
          <div className="relative w-full lg:w-72">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <label htmlFor="ticket-search" className="sr-only">
              Search tickets
            </label>
            <input
              id="ticket-search"
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search code, title, or details..."
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
            />
          </div>
        </div>

        {/* Secondary select filters + sorting */}
        <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <label
              htmlFor="filter-priority"
              className="text-xs font-medium text-slate-500 whitespace-nowrap"
            >
              Priority
            </label>
            <select
              id="filter-priority"
              value={priorityFilter}
              onChange={(e) => {
                setPriorityFilter(e.target.value);
                setPage(1);
              }}
              className="h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-700 focus:outline-none focus:border-[#2563EB]"
            >
              <option value="ALL">All Priorities</option>
              {TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {formatPriorityLabel(p)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="filter-category"
              className="text-xs font-medium text-slate-500 whitespace-nowrap"
            >
              Category
            </label>
            <select
              id="filter-category"
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
              className="h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-700 focus:outline-none focus:border-[#2563EB]"
            >
              <option value="ALL">All Categories</option>
              {TICKET_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {user?.role === 'ADMIN' && requesters.length > 0 && (
            <div className="flex items-center gap-2">
              <label
                htmlFor="filter-requester"
                className="text-xs font-medium text-slate-500 whitespace-nowrap"
              >
                Requester
              </label>
              <select
                id="filter-requester"
                value={requesterFilter}
                onChange={(e) => {
                  setRequesterFilter(e.target.value);
                  setPage(1);
                }}
                className="h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-700 focus:outline-none focus:border-[#2563EB] max-w-[180px]"
              >
                <option value="ALL">All Users</option>
                {requesters.map((u) => (
                  <option key={u.id} value={String(u.id)}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <label
              htmlFor="sort-tickets"
              className="text-xs font-medium text-slate-500 whitespace-nowrap"
            >
              Sort
            </label>
            <select
              id="sort-tickets"
              value={`${sortBy}:${sortOrder}`}
              onChange={(e) => {
                const [field, dir] = e.target.value.split(':') as [
                  'createdAt' | 'updatedAt' | 'priority',
                  'asc' | 'desc',
                ];
                setSortBy(field);
                setSortOrder(dir);
                setPage(1);
              }}
              className="h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-700 focus:outline-none focus:border-[#2563EB]"
            >
              <option value="createdAt:desc">Newest first</option>
              <option value="createdAt:asc">Oldest first</option>
              <option value="updatedAt:desc">Recently updated</option>
              <option value="priority:desc">Highest priority</option>
              <option value="priority:asc">Lowest priority</option>
            </select>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="h-8 px-2.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 inline-flex items-center gap-1 whitespace-nowrap"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Data Grid */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {error ? (
          <div role="alert" className="p-8 flex items-center gap-3 text-sm text-red-700">
            <AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : loading ? (
          <div className="divide-y divide-slate-200" aria-busy="true">
            {[1, 2, 3, 4, 5].map((row) => (
              <div key={row} className="px-6 py-4 flex items-center gap-4 animate-pulse">
                <div className="h-4 w-20 bg-slate-200 rounded" />
                <div className="h-4 flex-1 bg-slate-200 rounded" />
                <div className="h-4 w-24 bg-slate-200 rounded hidden sm:block" />
                <div className="h-4 w-20 bg-slate-200 rounded" />
              </div>
            ))}
          </div>
        ) : tickets.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="text-sm font-semibold text-slate-900">
              {hasActiveFilters
                ? 'No tickets match your current filters'
                : 'No support tickets submitted yet'}
            </p>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              {hasActiveFilters
                ? 'Try clearing or adjusting your status, priority, category, or search criteria.'
                : 'Create your first support ticket to get help from the support team.'}
            </p>
            <div className="pt-2 flex items-center justify-center gap-3">
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Clear Filters
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpenCreateModal}
                  className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-medium inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  New Ticket
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="py-3 pl-6 pr-3 whitespace-nowrap">Ticket</th>
                    <th className="py-3 px-3">Subject</th>
                    {user?.role === 'ADMIN' && (
                      <th className="py-3 px-3 whitespace-nowrap hidden md:table-cell">
                        Requester
                      </th>
                    )}
                    <th className="py-3 px-3 whitespace-nowrap hidden sm:table-cell">
                      Category
                    </th>
                    <th className="py-3 px-3 whitespace-nowrap hidden sm:table-cell">
                      Priority
                    </th>
                    <th className="py-3 px-3 whitespace-nowrap">Status</th>
                    <th className="py-3 pl-3 pr-6 text-right whitespace-nowrap hidden sm:table-cell">
                      Updated
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {tickets.map((ticket) => (
                    <tr
                      key={ticket.id}
                      className="hover:bg-slate-50/90 transition-colors"
                    >
                      <td className="py-3.5 pl-4 sm:pl-6 pr-2 sm:pr-3 font-mono text-xs font-medium text-slate-700 whitespace-nowrap tabular-nums">
                        {ticket.ticketCode}
                      </td>
                      <td className="py-3.5 px-2 sm:px-3 max-w-md">
                        <button
                          type="button"
                          onClick={() => onSelectTicket(ticket.id)}
                          className="text-left font-medium text-slate-900 hover:text-[#2563EB] transition-colors line-clamp-1 focus-visible:outline-none focus-visible:underline"
                        >
                          {ticket.title}
                        </button>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                          <span
                            className={`sm:hidden ${getPriorityTextColor(ticket.priority)}`}
                          >
                            {formatPriorityLabel(ticket.priority)}
                          </span>
                          <span aria-hidden="true" className="sm:hidden">
                            ·
                          </span>
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <MessageSquare
                              className="w-3 h-3 text-slate-400"
                              aria-hidden="true"
                            />
                            {ticket.commentCount}
                          </span>
                          {ticket.assignedAdminName && (
                            <>
                              <span aria-hidden="true" className="hidden sm:inline">
                                ·
                              </span>
                              <span className="truncate hidden sm:inline">
                                Assigned to {ticket.assignedAdminName}
                              </span>
                            </>
                          )}
                        </div>
                      </td>
                      {user?.role === 'ADMIN' && (
                        <td className="py-3.5 px-3 text-xs text-slate-600 whitespace-nowrap hidden md:table-cell">
                          {ticket.requesterName}
                        </td>
                      )}
                      <td className="py-3.5 px-3 text-xs text-slate-600 whitespace-nowrap hidden sm:table-cell">
                        {ticket.category}
                      </td>
                      <td className="py-3.5 px-3 text-xs whitespace-nowrap hidden sm:table-cell">
                        <span className={getPriorityTextColor(ticket.priority)}>
                          {formatPriorityLabel(ticket.priority)}
                        </span>
                      </td>
                      <td className="py-3.5 pl-2 pr-4 sm:px-3 text-xs whitespace-nowrap">
                        <span className={getStatusTextColor(ticket.status)}>
                          {formatStatusLabel(ticket.status)}
                        </span>
                      </td>
                      <td className="py-3.5 pl-3 pr-6 text-right font-mono text-xs text-slate-500 whitespace-nowrap tabular-nums hidden sm:table-cell">
                        {formatRelativeTime(ticket.updatedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="px-6 py-3.5 border-t border-slate-200 flex items-center justify-between gap-4 bg-slate-50/40">
              <p className="text-xs text-slate-500 tabular-nums">
                Page {pagination.page} of {pagination.totalPages} ·{' '}
                {pagination.total} total
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pagination.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-8 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium text-slate-700 inline-flex items-center gap-1 whitespace-nowrap"
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
                  className="h-8 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium text-slate-700 inline-flex items-center gap-1 whitespace-nowrap"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
