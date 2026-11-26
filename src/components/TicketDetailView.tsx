import { type FormEvent, useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Send,
  AlertCircle,
  Check,
  Lock,
  UserCheck,
  CheckCircle2,
} from 'lucide-react';
import { api, ApiClientError } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type AdminUserSummary,
  type TicketCategory,
  type TicketDetailResponse,
  type TicketPriority,
  type TicketStatus,
} from '../shared/types';
import {
  formatDateTime,
  formatEventLabel,
  formatPriorityLabel,
  formatRelativeTime,
  formatStatusLabel,
  getEventTextColor,
  getPriorityTextColor,
  getStatusTextColor,
} from '../utils/format';

interface TicketDetailViewProps {
  ticketId: number;
  onBack: () => void;
  onMutated: () => void;
}

export function TicketDetailView({
  ticketId,
  onBack,
  onMutated,
}: TicketDetailViewProps) {
  const { user, token } = useAuth();
  const [detail, setDetail] = useState<TicketDetailResponse | null>(null);
  const [admins, setAdmins] = useState<AdminUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inline Edit Mode
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState<TicketCategory>('Technical');
  const [editPriority, setEditPriority] = useState<TicketPriority>('MEDIUM');
  const [savingEdit, setSavingEdit] = useState(false);

  // Admin Triage Controls
  const [adminStatus, setAdminStatus] = useState<TicketStatus>('OPEN');
  const [adminPriority, setAdminPriority] = useState<TicketPriority>('MEDIUM');
  const [adminCategory, setAdminCategory] = useState<TicketCategory>('Technical');
  const [adminAssignee, setAdminAssignee] = useState<string>('');
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [adminSavedMsg, setAdminSavedMsg] = useState<string | null>(null);

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Comment composer
  const [commentBody, setCommentBody] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getTicketDetail(token, ticketId);
      setDetail(res);
      setEditTitle(res.ticket.title);
      setEditDescription(res.ticket.description);
      setEditCategory(res.ticket.category);
      setEditPriority(res.ticket.priority);

      setAdminStatus(res.ticket.status);
      setAdminPriority(res.ticket.priority);
      setAdminCategory(res.ticket.category);
      setAdminAssignee(
        res.ticket.assignedAdminId ? String(res.ticket.assignedAdminId) : ''
      );
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to load ticket details.'
      );
    } finally {
      setLoading(false);
    }
  }, [token, ticketId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (!token || user?.role !== 'ADMIN') return;
    api
      .listAdminUsers(token)
      .then((res) => setAdmins(res.users.filter((u) => u.role === 'ADMIN')))
      .catch(() => undefined);
  }, [token, user?.role]);

  if (loading && !detail) {
    return (
      <div className="space-y-6 animate-pulse" aria-busy="true">
        <div className="h-8 w-40 bg-slate-200 rounded" />
        <div className="h-64 bg-white border border-slate-200 rounded-xl" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back to tickets
        </button>
        <div
          role="alert"
          className="bg-white border border-red-200 rounded-xl p-6 flex items-center gap-3 text-sm text-red-700"
        >
          <AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span>{error ?? 'Ticket not found.'}</span>
        </div>
      </div>
    );
  }

  const { ticket, comments, activityLogs } = detail;
  const isAdmin = user?.role === 'ADMIN';
  const isOwner = user?.id === ticket.requesterId;
  const canEdit =
    isAdmin ||
    (isOwner && (ticket.status === 'OPEN' || ticket.status === 'IN_PROGRESS'));
  const canDelete = isAdmin || (isOwner && ticket.status === 'OPEN');

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setActionError(null);
    if (editTitle.trim().length < 5) {
      setActionError('Title must be at least 5 characters.');
      return;
    }
    if (editDescription.trim().length < 10) {
      setActionError('Description must be at least 10 characters.');
      return;
    }

    setSavingEdit(true);
    try {
      const updatedRes = await api.updateTicketDetails(token, ticket.id, {
        title: editTitle.trim(),
        description: editDescription.trim(),
        category: editCategory,
        priority: editPriority,
      });
      setDetail((prev) => (prev ? { ...prev, ticket: updatedRes.ticket } : prev));
      setEditing(false);
      await loadDetail();
      onMutated();
    } catch (err) {
      setActionError(
        err instanceof ApiClientError ? err.message : 'Failed to update ticket.'
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const handleAdminTriageSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !isAdmin) return;
    setActionError(null);
    setAdminSavedMsg(null);
    setSavingAdmin(true);
    try {
      const updatedRes = await api.adminUpdateTicket(token, ticket.id, {
        status: adminStatus,
        priority: adminPriority,
        category: adminCategory,
        assignedAdminId: adminAssignee ? Number(adminAssignee) : null,
      });
      setDetail((prev) => (prev ? { ...prev, ticket: updatedRes.ticket } : prev));
      setAdminSavedMsg('Ticket updated and event logged.');
      await loadDetail();
      onMutated();
    } catch (err) {
      setActionError(
        err instanceof ApiClientError
          ? err.message
          : 'Could not save administrative changes.'
      );
    } finally {
      setSavingAdmin(false);
    }
  };

  const handleQuickAdminAction = async (
    payload: { status?: TicketStatus; assignedAdminId?: number | null },
    successText: string
  ) => {
    if (!token || !isAdmin) return;
    setActionError(null);
    setAdminSavedMsg(null);
    setSavingAdmin(true);
    try {
      const updatedRes = await api.adminUpdateTicket(token, ticket.id, payload);
      setDetail((prev) => (prev ? { ...prev, ticket: updatedRes.ticket } : prev));
      setAdminSavedMsg(successText);
      await loadDetail();
      onMutated();
    } catch (err) {
      setActionError(
        err instanceof ApiClientError
          ? err.message
          : 'Could not apply quick triage action.'
      );
    } finally {
      setSavingAdmin(false);
    }
  };

  const handleDelete = async () => {
    if (!token) return;
    setDeleting(true);
    setActionError(null);
    try {
      await api.deleteTicket(token, ticket.id);
      onMutated();
      onBack();
    } catch (err) {
      setActionError(
        err instanceof ApiClientError
          ? err.message
          : 'Could not delete ticket.'
      );
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const handleAddComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setActionError(null);
    if (commentBody.trim().length < 2) {
      setActionError('Please enter a response before posting.');
      return;
    }

    setPostingComment(true);
    try {
      const commentRes = await api.addComment(token, ticket.id, {
        body: commentBody.trim(),
        isInternal: isAdmin ? isInternal : false,
      });
      setDetail((prev) =>
        prev ? { ...prev, comments: [...prev.comments, commentRes.comment] } : prev
      );
      setCommentBody('');
      setIsInternal(false);
      await loadDetail();
      onMutated();
    } catch (err) {
      setActionError(
        err instanceof ApiClientError
          ? err.message
          : 'Could not post comment.'
      );
    } finally {
      setPostingComment(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top breadcrumb & actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back to tickets
        </button>

        <div className="flex items-center gap-2">
          {canEdit && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="h-9 px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              Edit Ticket
            </button>
          )}
          {canDelete && !confirmDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="h-9 px-3.5 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-xs font-medium text-red-700 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              Delete
            </button>
          )}
          {confirmDelete && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
              <span className="text-xs font-medium text-red-800">
                Confirm delete?
              </span>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDelete}
                className="px-2.5 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-xs font-medium whitespace-nowrap"
              >
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {actionError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{actionError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Main content (8 cols): Ticket Details + Conversation Thread */}
        <div className="lg:col-span-8 space-y-6">
          {/* Ticket Body */}
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            {editing ? (
              <form onSubmit={handleSaveEdit} className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    Edit {ticket.ticketCode}
                  </h2>
                </div>
                <div>
                  <label
                    htmlFor="edit-ticket-title"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Subject
                  </label>
                  <input
                    id="edit-ticket-title"
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-[#2563EB]"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="edit-ticket-category"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Category
                    </label>
                    <select
                      id="edit-ticket-category"
                      value={editCategory}
                      onChange={(e) =>
                        setEditCategory(e.target.value as TicketCategory)
                      }
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:border-[#2563EB]"
                    >
                      {TICKET_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="edit-ticket-priority"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Priority
                    </label>
                    <select
                      id="edit-ticket-priority"
                      value={editPriority}
                      onChange={(e) =>
                        setEditPriority(e.target.value as TicketPriority)
                      }
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:border-[#2563EB]"
                    >
                      {TICKET_PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {formatPriorityLabel(p)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="edit-ticket-description"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Description
                  </label>
                  <textarea
                    id="edit-ticket-description"
                    rows={5}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full p-3 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-[#2563EB]"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="h-9 px-4 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="h-9 px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-medium"
                  >
                    {savingEdit ? 'Saving...' : 'Save Ticket Details'}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono font-semibold text-slate-800 tabular-nums">
                    {ticket.ticketCode}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className={getStatusTextColor(ticket.status)}>
                    {formatStatusLabel(ticket.status)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className={getPriorityTextColor(ticket.priority)}>
                    {formatPriorityLabel(ticket.priority)} Priority
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{ticket.category}</span>
                </div>

                <h1 className="mt-2 font-display text-xl sm:text-2xl font-bold text-slate-900 leading-snug">
                  {ticket.title}
                </h1>

                <p className="mt-2 text-xs text-slate-500">
                  Submitted by{' '}
                  <span className="font-medium text-slate-700">
                    {ticket.requesterName}
                  </span>{' '}
                  ({ticket.requesterEmail}) on{' '}
                  <span className="font-mono tabular-nums">
                    {formatDateTime(ticket.createdAt)}
                  </span>
                </p>

                {/* 4-Step Lifecycle Status Progress Tracker */}
                <div
                  aria-label="Ticket status progress"
                  className="mt-5 pt-4 border-t border-slate-200"
                >
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-3">
                    Resolution Progress
                  </p>
                  <ol className="grid grid-cols-4 gap-2">
                    {TICKET_STATUSES.map((stepStatus, idx) => {
                      const currentIdx = TICKET_STATUSES.indexOf(ticket.status);
                      const isCompleted = idx < currentIdx;
                      const isCurrent = idx === currentIdx;
                      return (
                        <li key={stepStatus} className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-mono font-semibold shrink-0 ${
                                isCompleted
                                  ? 'bg-[#16A34A] text-white'
                                  : isCurrent
                                  ? 'bg-[#2563EB] text-white'
                                  : 'bg-slate-100 text-slate-400'
                              }`}
                              aria-hidden="true"
                            >
                              {isCompleted ? (
                                <Check className="w-3 h-3" />
                              ) : (
                                idx + 1
                              )}
                            </span>
                            {idx < TICKET_STATUSES.length - 1 && (
                              <span
                                className={`h-0.5 flex-1 ${
                                  idx < currentIdx
                                    ? 'bg-[#16A34A]'
                                    : 'bg-slate-200'
                                }`}
                                aria-hidden="true"
                              />
                            )}
                          </div>
                          <p
                            aria-current={isCurrent ? 'step' : undefined}
                            className={`mt-1.5 text-xs truncate ${
                              isCurrent
                                ? 'font-semibold text-slate-900'
                                : isCompleted
                                ? 'font-medium text-slate-600'
                                : 'text-slate-400'
                            }`}
                          >
                            {formatStatusLabel(stepStatus)}
                          </p>
                        </li>
                      );
                    })}
                  </ol>
                </div>

                <div className="mt-5 pt-5 border-t border-slate-200 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {ticket.description}
                </div>
              </>
            )}
          </section>

          {/* Comments Thread */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Conversation ({comments.length})
              </h2>
            </div>

            {comments.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-slate-500">
                No replies yet. Add a comment below to update this ticket.
              </div>
            ) : (
              <ul className="divide-y divide-slate-200">
                {comments.map((comment) => (
                  <li
                    key={comment.id}
                    className={`px-6 py-4 ${
                      comment.isInternal ? 'bg-amber-50/40' : 'bg-white'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">
                          {comment.authorName}
                        </span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span
                          className={
                            comment.authorRole === 'ADMIN'
                              ? 'text-[#2563EB] font-medium'
                              : 'text-slate-500'
                          }
                        >
                          {comment.authorRole === 'ADMIN'
                            ? 'Support Admin'
                            : 'Requester'}
                        </span>
                        {comment.isInternal && (
                          <>
                            <span aria-hidden="true" className="text-slate-300">
                              ·
                            </span>
                            <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                              <Lock className="w-3 h-3" aria-hidden="true" />
                              Internal Note
                            </span>
                          </>
                        )}
                      </div>
                      <span className="font-mono text-slate-400 tabular-nums">
                        {formatDateTime(comment.createdAt)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {comment.body}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {/* Add Comment Composer */}
            <form
              onSubmit={handleAddComment}
              className="p-6 border-t border-slate-200 bg-slate-50/50 space-y-3"
            >
              <label
                htmlFor="comment-composer"
                className="block text-xs font-medium text-slate-700"
              >
                {isAdmin ? 'Respond to ticket' : 'Add a comment'}
              </label>
              <textarea
                id="comment-composer"
                rows={3}
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder={
                  isAdmin
                    ? 'Write a response to the requester or an internal triage note...'
                    : 'Share additional context or reply to support...'
                }
                className="w-full p-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] resize-y"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                {isAdmin ? (
                  <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                      className="rounded border-slate-300 text-[#2563EB] focus:ring-[#2563EB]"
                    />
                    <span>Internal note (visible to administrators only)</span>
                  </label>
                ) : (
                  <span className="text-xs text-slate-500">
                    Visible to you and assigned support administrators
                  </span>
                )}
                <button
                  type="submit"
                  disabled={postingComment}
                  className="h-9 px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-slate-300 text-white text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Send className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{postingComment ? 'Posting...' : 'Post Reply'}</span>
                </button>
              </div>
            </form>
          </section>
        </div>

        {/* Right sidebar (4 cols): Admin Management + Metadata + Event History */}
        <aside className="lg:col-span-4 space-y-6">
          {isAdmin && (
            <section className="bg-white border border-slate-200 rounded-xl p-5">
              <h2 className="font-display text-sm font-semibold text-slate-900 mb-3">
                Admin Triage Controls
              </h2>

              {/* One-click quick triage actions */}
              {(ticket.assignedAdminId !== user?.id ||
                ticket.status === 'OPEN' ||
                ticket.status === 'IN_PROGRESS') && (
                <div className="mb-4 pb-4 border-b border-slate-100 flex flex-wrap gap-2">
                  {ticket.assignedAdminId !== user?.id && user?.id && (
                    <button
                      type="button"
                      disabled={savingAdmin}
                      onClick={() =>
                        handleQuickAdminAction(
                          { assignedAdminId: user.id },
                          'Ticket assigned to you.'
                        )
                      }
                      className="flex-1 min-w-[120px] h-8 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-xs font-medium text-slate-700 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                      <UserCheck className="w-3.5 h-3.5 text-[#2563EB]" aria-hidden="true" />
                      Assign to me
                    </button>
                  )}
                  {(ticket.status === 'OPEN' ||
                    ticket.status === 'IN_PROGRESS') && (
                    <button
                      type="button"
                      disabled={savingAdmin}
                      onClick={() =>
                        handleQuickAdminAction(
                          { status: 'RESOLVED' },
                          'Ticket marked as resolved.'
                        )
                      }
                      className="flex-1 min-w-[120px] h-8 px-3 rounded-lg border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 disabled:opacity-50 text-xs font-medium text-[#16A34A] inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      Mark Resolved
                    </button>
                  )}
                </div>
              )}

              <form onSubmit={handleAdminTriageSave} className="space-y-3.5">
                <div>
                  <label
                    htmlFor="admin-status-select"
                    className="block text-xs font-medium text-slate-600 mb-1"
                  >
                    Status
                  </label>
                  <select
                    id="admin-status-select"
                    value={adminStatus}
                    onChange={(e) =>
                      setAdminStatus(e.target.value as TicketStatus)
                    }
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:border-[#2563EB]"
                  >
                    {TICKET_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {formatStatusLabel(s)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="admin-priority-select"
                    className="block text-xs font-medium text-slate-600 mb-1"
                  >
                    Priority
                  </label>
                  <select
                    id="admin-priority-select"
                    value={adminPriority}
                    onChange={(e) =>
                      setAdminPriority(e.target.value as TicketPriority)
                    }
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:border-[#2563EB]"
                  >
                    {TICKET_PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {formatPriorityLabel(p)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="admin-category-select"
                    className="block text-xs font-medium text-slate-600 mb-1"
                  >
                    Category
                  </label>
                  <select
                    id="admin-category-select"
                    value={adminCategory}
                    onChange={(e) =>
                      setAdminCategory(e.target.value as TicketCategory)
                    }
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:border-[#2563EB]"
                  >
                    {TICKET_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="admin-assignee-select"
                    className="block text-xs font-medium text-slate-600 mb-1"
                  >
                    Assigned Administrator
                  </label>
                  <select
                    id="admin-assignee-select"
                    value={adminAssignee}
                    onChange={(e) => setAdminAssignee(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:border-[#2563EB]"
                  >
                    <option value="">Unassigned</option>
                    {admins.map((a) => (
                      <option key={a.id} value={String(a.id)}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                {adminSavedMsg && (
                  <p className="text-xs text-[#16A34A] flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{adminSavedMsg}</span>
                  </p>
                )}

                <button
                  type="submit"
                  disabled={savingAdmin}
                  className="w-full h-9 px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-slate-300 text-white text-xs font-medium transition-colors whitespace-nowrap"
                >
                  {savingAdmin ? 'Updating...' : 'Update Ticket Status & Priority'}
                </button>
              </form>
            </section>
          )}

          {/* Ticket Metadata */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Ticket Properties
            </h2>
            <dl className="divide-y divide-slate-100 text-xs">
              <div className="py-2 flex items-center justify-between gap-2">
                <dt className="text-slate-500">Reference</dt>
                <dd className="font-mono font-medium text-slate-800 tabular-nums">
                  {ticket.ticketCode}
                </dd>
              </div>
              <div className="py-2 flex items-center justify-between gap-2">
                <dt className="text-slate-500">Status</dt>
                <dd className={getStatusTextColor(ticket.status)}>
                  {formatStatusLabel(ticket.status)}
                </dd>
              </div>
              <div className="py-2 flex items-center justify-between gap-2">
                <dt className="text-slate-500">Priority</dt>
                <dd className={getPriorityTextColor(ticket.priority)}>
                  {formatPriorityLabel(ticket.priority)}
                </dd>
              </div>
              <div className="py-2 flex items-center justify-between gap-2">
                <dt className="text-slate-500">Category</dt>
                <dd className="text-slate-800">{ticket.category}</dd>
              </div>
              <div className="py-2 flex items-center justify-between gap-2">
                <dt className="text-slate-500">Assignee</dt>
                <dd className="text-slate-800">
                  {ticket.assignedAdminName ?? 'Unassigned'}
                </dd>
              </div>
              <div className="py-2 flex items-center justify-between gap-2">
                <dt className="text-slate-500">Last Updated</dt>
                <dd className="font-mono text-slate-600 tabular-nums">
                  {formatRelativeTime(ticket.updatedAt)}
                </dd>
              </div>
              {ticket.resolvedAt && (
                <div className="py-2 flex items-center justify-between gap-2">
                  <dt className="text-slate-500">Resolved At</dt>
                  <dd className="font-mono text-[#16A34A] tabular-nums">
                    {formatDateTime(ticket.resolvedAt)}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {/* Ticket Event Audit History */}
          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="font-display text-sm font-semibold text-slate-900 mb-3">
              Event Timeline
            </h2>
            {activityLogs.length === 0 ? (
              <p className="text-xs text-slate-500">No events recorded yet.</p>
            ) : (
              <ul className="space-y-3">
                {activityLogs.map((ev) => (
                  <li
                    key={ev.id}
                    className="pb-3 border-b border-slate-100 last:border-b-0 last:pb-0"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span
                        className={`font-medium ${getEventTextColor(ev.eventType)}`}
                      >
                        {formatEventLabel(ev.eventType)}
                      </span>
                      <span className="font-mono text-slate-400 tabular-nums">
                        {formatRelativeTime(ev.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                      {ev.summary}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
