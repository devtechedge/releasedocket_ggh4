'use client';

import { Plus, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatUsdNumber } from '@/lib/format';
import type { ClientRecord } from '@/repositories/crm.repo';

export default function ClientsManager({
  initialClients,
  canWrite,
}: {
  initialClients: ClientRecord[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [clients, setClients] = useState(initialClients);
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [retainerMonthlyUsd, setRetainerMonthlyUsd] = useState('5000');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.contactName.toLowerCase().includes(query.toLowerCase()) ||
      c.contactEmail.toLowerCase().includes(query.toLowerCase())
  );

  async function handleCreateClient(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          contactName,
          contactEmail,
          retainerMonthlyUsd: Number(retainerMonthlyUsd) || 0,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not create client.');
        return;
      }
      setClients((prev) => [data.client, ...prev]);
      setName('');
      setContactName('');
      setContactEmail('');
      setRetainerMonthlyUsd('5000');
      setNotes('');
      setShowForm(false);
      setSuccess(`Client "${data.client.name}" added.`);
      router.refresh();
    } catch {
      setError('Network error creating client.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Clients
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Retainer client organizations and authorized receipt recipients.
          </p>
        </div>

        {canWrite && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-800 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-900 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>{showForm ? 'Close Form' : 'New Client'}</span>
          </button>
        )}
      </div>

      {success && (
        <div
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800"
        >
          {success}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleCreateClient}
          className="rounded-lg border border-slate-200 bg-white p-5 space-y-4"
        >
          <h2 className="font-display text-base font-semibold text-slate-900">
            Add retainer client
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="client-name"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Client organization name
              </label>
              <input
                id="client-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Logistics"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="client-retainer"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Monthly retainer (USD)
              </label>
              <input
                id="client-retainer"
                type="number"
                min={0}
                value={retainerMonthlyUsd}
                onChange={(e) => setRetainerMonthlyUsd(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900 focus:border-blue-800 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="client-contact-name"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Primary stakeholder name
              </label>
              <input
                id="client-contact-name"
                type="text"
                required
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Dana Rivera"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="client-contact-email"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Stakeholder email
              </label>
              <input
                id="client-contact-email"
                type="email"
                required
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="dana@acmelogistics.example"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="client-notes"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Internal cadence / delivery notes
            </label>
            <textarea
              id="client-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Weekly Friday summary; staging verification required before production."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
            >
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-blue-800 px-4 py-2 text-xs font-medium text-white hover:bg-blue-900 disabled:opacity-50"
            >
              {submitting ? 'Saving Client...' : 'Save Client'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Search Bar */}
      <div className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400"
          aria-hidden="true"
        />
        <input
          type="search"
          aria-label="Search clients"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search client or contact..."
          className="w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none"
        />
      </div>

      {/* Clients Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            {clients.length === 0
              ? 'No clients recorded yet. Add your first retainer client to create projects and delivery batches.'
              : 'No clients match your search filter.'}
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-4 py-3">Client Organization</th>
                <th className="px-4 py-3">Stakeholder</th>
                <th className="px-4 py-3 text-right">Monthly Retainer</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {c.name}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <div>{c.contactName}</div>
                    <div className="text-xs text-slate-500">{c.contactEmail}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-900 tabular-nums">
                    ${formatUsdNumber(c.retainerMonthlyUsd)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 max-w-xs truncate">
                    {c.notes || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
