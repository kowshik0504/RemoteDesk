import React, { useCallback, useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Ticket,
  Activity,
  Bell,
  Users,
  Plus,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthScreen } from './components/AuthScreen';
import { OverviewView } from './components/OverviewView';
import { TicketsView } from './components/TicketsView';
import { TicketDetailView } from './components/TicketDetailView';
import { CreateTicketModal } from './components/CreateTicketModal';
import { ActivityView } from './components/ActivityView';
import { NotificationsView } from './components/NotificationsView';
import { AdminUsersView } from './components/AdminUsersView';
import { api } from './lib/api';
import type { NotificationItem } from './shared/types';

type ActiveSection =
  | 'overview'
  | 'tickets'
  | 'activity'
  | 'notifications'
  | 'users';

function WorkspaceShell() {
  const { user, token, initializing, logout } = useAuth();
  const [section, setSection] = useState<ActiveSection>('overview');
  const [ticketInitialStatus, setTicketInitialStatus] = useState<string>('ALL');
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  const loadNotifications = useCallback(
    async (silent = false) => {
      if (!token) return;
      if (!silent) setLoadingNotifications(true);
      try {
        const res = await api.listNotifications(token);
        setNotifications(res.notifications);
        setUnreadCount(res.unreadCount);
      } catch {
        // Keep previous state cleanly on transient error
      } finally {
        if (!silent) setLoadingNotifications(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (token) {
      loadNotifications();
      const pollId = window.setInterval(() => {
        loadNotifications(true);
      }, 30_000);
      return () => window.clearInterval(pollId);
    } else {
      setNotifications([]);
      setUnreadCount(0);
      setSelectedTicketId(null);
      setTicketInitialStatus('ALL');
      setSection('overview');
    }
  }, [token, refreshKey, loadNotifications]);

  if (initializing) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <p className="text-sm text-slate-500">Loading ResolveDesk...</p>
      </div>
    );
  }

  if (!user || !token) {
    return <AuthScreen />;
  }

  const triggerRefresh = () => setRefreshKey((k) => k + 1);

  const navigateTo = (next: ActiveSection, statusFilter?: string) => {
    if (next === 'tickets') {
      setTicketInitialStatus(statusFilter ?? 'ALL');
    }
    setSection(next);
    setSelectedTicketId(null);
    setMobileNavOpen(false);
  };

  const openTicket = (id: number) => {
    setSelectedTicketId(id);
    setSection('tickets');
    setMobileNavOpen(false);
  };

  const handleMarkNotificationRead = async (id: number) => {
    await api.markNotificationRead(token, id);
    await loadNotifications();
  };

  const handleMarkAllRead = async () => {
    await api.markAllNotificationsRead(token);
    await loadNotifications();
  };

  const navItems: Array<{
    id: ActiveSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
    adminOnly?: boolean;
  }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    {
      id: 'tickets',
      label: user.role === 'ADMIN' ? 'All Tickets' : 'My Tickets',
      icon: Ticket,
    },
    { id: 'activity', label: 'Activity Log', icon: Activity },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: Bell,
      badge: unreadCount > 0 ? unreadCount : undefined,
    },
    { id: 'users', label: 'Users', icon: Users, adminOnly: true },
  ];

  const visibleNavItems = navItems.filter(
    (item) => !item.adminOnly || user.role === 'ADMIN'
  );

  const breadcrumbLabel = selectedTicketId
    ? 'Tickets / Ticket Details'
    : visibleNavItems.find((n) => n.id === section)?.label ?? 'Overview';

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      <div className="h-16 px-5 border-b border-slate-200 flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigateTo('overview')}
          className="flex items-center gap-2.5 text-left focus-visible:outline-none"
        >
          <div className="w-8 h-8 rounded-lg bg-[#2563EB] text-white flex items-center justify-center shrink-0">
            <Ticket className="w-4 h-4" aria-hidden="true" />
          </div>
          <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            ResolveDesk
          </span>
        </button>

        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setMobileNavOpen(false)}
          className="lg:hidden w-8 h-8 rounded-lg text-slate-500 hover:bg-slate-100 flex items-center justify-center"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <nav
        aria-label="Primary workspace navigation"
        className="flex-1 px-3 py-4 space-y-1 overflow-y-auto"
      >
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => navigateTo(item.id)}
              className={`w-full h-10 px-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-between gap-2 whitespace-nowrap ${
                active
                  ? 'bg-blue-50 text-[#2563EB]'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span className="inline-flex items-center gap-2.5 truncate">
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </span>
              {item.badge !== undefined && (
                <span className="font-mono text-xs font-semibold text-[#2563EB] tabular-nums">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-200 space-y-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">
            {user.name}
          </p>
          <p className="text-xs text-slate-500 truncate">{user.email}</p>
          <p className="mt-0.5 text-xs font-medium text-[#2563EB]">
            {user.role === 'ADMIN' ? 'Administrator' : 'User Account'}
          </p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
        >
          <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Sidebar */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div className="w-64 max-w-[80vw] h-full shadow-xl relative z-10">
            {sidebarContent}
          </div>
          <button
            type="button"
            aria-label="Close navigation backdrop"
            onClick={() => setMobileNavOpen(false)}
            className="flex-1 bg-slate-900/40"
          />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Contextual Top Header Bar */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden w-9 h-9 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center justify-center shrink-0"
            >
              <Menu className="w-4 h-4" aria-hidden="true" />
            </button>
            <div className="flex items-center gap-2 text-sm text-slate-500 min-w-0">
              <span className="hidden sm:inline whitespace-nowrap">Workspace</span>
              <span className="hidden sm:inline text-slate-300" aria-hidden="true">
                /
              </span>
              <span className="font-medium text-slate-900 truncate">
                {breadcrumbLabel}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              aria-label={`Notifications${
                unreadCount > 0 ? ` (${unreadCount} unread)` : ''
              }`}
              onClick={() => navigateTo('notifications')}
              className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Bell className="w-4 h-4" aria-hidden="true" />
              {unreadCount > 0 && (
                <span className="font-mono text-xs font-semibold text-[#2563EB] tabular-nums">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              className="h-9 px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs sm:text-sm font-medium transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>New Ticket</span>
            </button>
          </div>
        </header>

        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-8 py-8">
          {selectedTicketId !== null ? (
            <TicketDetailView
              ticketId={selectedTicketId}
              onBack={() => setSelectedTicketId(null)}
              onMutated={triggerRefresh}
            />
          ) : section === 'overview' ? (
            <OverviewView
              refreshKey={refreshKey}
              onSelectTicket={openTicket}
              onNavigateTickets={(status) => navigateTo('tickets', status)}
              onNavigateActivity={() => navigateTo('activity')}
              onOpenCreateModal={() => setCreateModalOpen(true)}
            />
          ) : section === 'tickets' ? (
            <TicketsView
              refreshKey={refreshKey}
              initialStatusFilter={ticketInitialStatus}
              onSelectTicket={openTicket}
              onOpenCreateModal={() => setCreateModalOpen(true)}
            />
          ) : section === 'activity' ? (
            <ActivityView
              refreshKey={refreshKey}
              onSelectTicket={openTicket}
            />
          ) : section === 'notifications' ? (
            <NotificationsView
              notifications={notifications}
              unreadCount={unreadCount}
              loading={loadingNotifications}
              onMarkRead={handleMarkNotificationRead}
              onMarkAllRead={handleMarkAllRead}
              onSelectTicket={openTicket}
            />
          ) : section === 'users' && user.role === 'ADMIN' ? (
            <AdminUsersView />
          ) : (
            <OverviewView
              refreshKey={refreshKey}
              onSelectTicket={openTicket}
              onNavigateTickets={(status) => navigateTo('tickets', status)}
              onNavigateActivity={() => navigateTo('activity')}
              onOpenCreateModal={() => setCreateModalOpen(true)}
            />
          )}
        </main>
      </div>

      <CreateTicketModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={(created) => {
          triggerRefresh();
          openTicket(created.id);
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <WorkspaceShell />
    </AuthProvider>
  );
}
