import React, { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { api, ApiClientError } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  type TicketCategory,
  type TicketListItem,
  type TicketPriority,
} from '../shared/types';
import { formatPriorityLabel } from '../utils/format';

interface CreateTicketModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (ticket: TicketListItem) => void;
}

export function CreateTicketModal({
  open,
  onClose,
  onCreated,
}: CreateTicketModalProps) {
  const { token } = useAuth();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<TicketCategory>('Technical');
  const [priority, setPriority] = useState<TicketPriority>('MEDIUM');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (title.trim().length < 5) {
      setError('Please enter a ticket title of at least 5 characters.');
      return;
    }
    if (description.trim().length < 10) {
      setError('Please provide a detailed description (at least 10 characters).');
      return;
    }
    if (!token) return;

    setSubmitting(true);
    try {
      const res = await api.createTicket(token, {
        title: title.trim(),
        category,
        priority,
        description: description.trim(),
      });
      setTitle('');
      setCategory('Technical');
      setPriority('MEDIUM');
      setDescription('');
      onCreated(res.ticket);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Could not submit ticket. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-ticket-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2
              id="create-ticket-title"
              className="font-display text-lg font-semibold text-slate-900"
            >
              Submit Support Ticket
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Provide clear reproduction details so our support engineers can assist quickly.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close create ticket dialog"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-center"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4" noValidate>
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label
              htmlFor="new-ticket-title"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Subject
            </label>
            <input
              id="new-ticket-title"
              type="text"
              required
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Unable to export Q4 invoice summary to PDF"
              className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="new-ticket-category"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Category
              </label>
              <select
                id="new-ticket-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as TicketCategory)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
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
                htmlFor="new-ticket-priority"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Priority
              </label>
              <select
                id="new-ticket-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TicketPriority)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
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
              htmlFor="new-ticket-description"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Description
            </label>
            <textarea
              id="new-ticket-description"
              rows={5}
              required
              maxLength={4000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Include steps to reproduce, affected account or URL, and expected behavior..."
              className="w-full p-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] resize-y"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700 whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-9 px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-slate-300 text-white text-sm font-medium transition-colors whitespace-nowrap"
            >
              {submitting ? 'Submitting...' : 'Submit Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
