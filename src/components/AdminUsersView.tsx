import { useCallback, useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { api, ApiClientError } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { AdminUserSummary, UserRole } from '../shared/types';
import { formatDateTime } from '../utils/format';

export function AdminUsersView() {
  const { user, token } = useAuth();
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.listAdminUsers(token);
      setUsers(res.users);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to load user directory.'
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleRoleToggle = async (target: AdminUserSummary) => {
    if (!token) return;
    const nextRole: UserRole = target.role === 'ADMIN' ? 'USER' : 'ADMIN';
    setUpdatingId(target.id);
    setError(null);
    try {
      await api.updateUserRole(token, target.id, nextRole);
      await loadUsers();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Could not update user role.'
      );
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
          Users &amp; Access Control
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage helpdesk requesters and administrator permissions.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading && users.length === 0 ? (
          <div className="p-6 space-y-3 animate-pulse">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-10 bg-slate-100 rounded" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-3 pl-6 pr-3">Name</th>
                  <th className="py-3 px-3">Email</th>
                  <th className="py-3 px-3 whitespace-nowrap">Role</th>
                  <th className="py-3 px-3 whitespace-nowrap text-right">
                    Tickets
                  </th>
                  <th className="py-3 px-3 whitespace-nowrap hidden md:table-cell">
                    Joined
                  </th>
                  <th className="py-3 pl-3 pr-6 text-right whitespace-nowrap">
                    Access Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {users.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/80">
                    <td className="py-3.5 pl-6 pr-3 font-medium text-slate-900 whitespace-nowrap">
                      {row.name}
                      {row.id === user?.id && (
                        <span className="ml-2 text-xs text-slate-400 font-normal">
                          (You)
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-3 text-xs text-slate-600">
                      {row.email}
                    </td>
                    <td className="py-3.5 px-3 text-xs whitespace-nowrap">
                      <span
                        className={
                          row.role === 'ADMIN'
                            ? 'text-[#2563EB] font-semibold'
                            : 'text-slate-600 font-medium'
                        }
                      >
                        {row.role === 'ADMIN' ? 'Administrator' : 'User'}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono text-xs text-slate-700 tabular-nums">
                      {row.ticketCount}
                    </td>
                    <td className="py-3.5 px-3 font-mono text-xs text-slate-500 whitespace-nowrap tabular-nums hidden md:table-cell">
                      {formatDateTime(row.createdAt)}
                    </td>
                    <td className="py-3.5 pl-3 pr-6 text-right whitespace-nowrap">
                      <button
                        type="button"
                        disabled={updatingId === row.id || row.authProvider === 'SEED'}
                        onClick={() => handleRoleToggle(row)}
                        className="h-8 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium text-slate-700 whitespace-nowrap"
                      >
                        {updatingId === row.id
                          ? 'Updating...'
                          : row.role === 'ADMIN'
                          ? 'Set as User'
                          : 'Make Admin'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
