'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Role } from '@/domain/types';
import { formatUtcDate } from '@/lib/format';

interface MemberRow {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

interface InvitationRow {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}

export default function TeamClientView({
  initialMembers,
  initialInvitations,
  canInvite,
  canManageRoles,
  currentUserId,
}: {
  initialMembers: MemberRow[];
  initialInvitations: InvitationRow[];
  canInvite: boolean;
  canManageRoles: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [invitations, setInvitations] = useState(initialInvitations);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('DELIVERY_LEAD');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch('/api/workspace');
    if (res.ok) {
      const json = await res.json();
      setMembers(json.members);
      setInvitations(json.invitations);
    }
    router.refresh();
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatusMsg(null);
    setBusy(true);
    try {
      const res = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Could not send invitation.');
        return;
      }
      setEmail('');
      await refresh();
      setStatusMsg(`Invitation queued for ${email}.`);
    } finally {
      setBusy(false);
    }
  }

  async function handleRoleChange(membershipId: string, nextRole: Role) {
    setError(null);
    setStatusMsg(null);
    const res = await fetch('/api/workspace', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ membershipId, role: nextRole }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || 'Could not update role.');
      return;
    }
    await refresh();
    setStatusMsg('Member role updated.');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Team & Role-Based Access
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Centralized RBAC enforced server-side across Owner, Admin, Delivery Lead, Contributor, and Client Viewer roles.
        </p>
      </div>

      {statusMsg && (
        <div
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800"
        >
          {statusMsg}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-800"
        >
          {error}
        </div>
      )}

      {canInvite && (
        <form
          onSubmit={handleInvite}
          className="rounded-lg border border-slate-200 bg-white p-5 flex flex-wrap items-end gap-4"
        >
          <div className="flex-1 min-w-[220px]">
            <label
              htmlFor="invite-email"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Teammate email
            </label>
            <input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="lead@agency.example"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </div>
          <div>
            <label
              htmlFor="invite-role"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Role
            </label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="ADMIN">ADMIN</option>
              <option value="DELIVERY_LEAD">DELIVERY_LEAD</option>
              <option value="CONTRIBUTOR">CONTRIBUTOR</option>
              <option value="CLIENT_VIEWER">CLIENT_VIEWER</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-blue-800 px-4 py-2 text-sm font-medium text-white hover:bg-blue-900 disabled:opacity-50"
          >
            {busy ? 'Sending...' : 'Invite Member'}
          </button>
        </form>
      )}

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Workspace Members ({members.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {members.map((m) => (
                <tr key={m.membershipId}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{m.name}</div>
                    <div className="text-xs text-slate-500">{m.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    {canManageRoles && m.userId !== currentUserId ? (
                      <select
                        aria-label={`Role for ${m.email}`}
                        value={m.role}
                        onChange={(e) =>
                          handleRoleChange(
                            m.membershipId,
                            e.target.value as Role
                          )
                        }
                        className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-mono text-slate-900"
                      >
                        <option value="OWNER">OWNER</option>
                        <option value="ADMIN">ADMIN</option>
                        <option value="DELIVERY_LEAD">DELIVERY_LEAD</option>
                        <option value="CONTRIBUTOR">CONTRIBUTOR</option>
                        <option value="CLIENT_VIEWER">CLIENT_VIEWER</option>
                      </select>
                    ) : (
                      <span className="font-mono text-xs text-slate-800">
                        {m.role}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-500">
                    {formatUtcDate(m.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {invitations.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Pending Invitations ({invitations.length})
            </h2>
          </div>
          <ul className="divide-y divide-slate-200 text-xs">
            {invitations.map((inv) => (
              <li
                key={inv.id}
                className="px-5 py-3 flex items-center justify-between gap-3"
              >
                <span className="font-medium text-slate-900">{inv.email}</span>
                <span className="font-mono text-slate-600">
                  {inv.role} · Expires{' '}
                  {formatUtcDate(inv.expiresAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
