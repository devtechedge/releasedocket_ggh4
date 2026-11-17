'use client';

import {
  Building2,
  ClipboardCheck,
  CreditCard,
  FileBarChart2,
  FolderGit2,
  GitPullRequest,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Role } from '@/domain/types';

export interface ShellSessionContext {
  user: { id: string; name: string; email: string };
  workspace: {
    id: string;
    name: string;
    isDemo: boolean;
    planTier: string;
    subscriptionStatus: string;
  };
  role: Role;
  memberships: Array<{
    workspaceId: string;
    workspaceName: string;
    role: Role;
    isDemo: boolean;
  }>;
}

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/clients', label: 'Clients', icon: Building2 },
  { href: '/dashboard/projects', label: 'Projects', icon: FolderGit2 },
  { href: '/dashboard/delivery', label: 'Delivery', icon: ClipboardCheck },
  { href: '/dashboard/reports', label: 'Reports', icon: FileBarChart2 },
  { href: '/dashboard/integrations', label: 'Integrations', icon: GitPullRequest },
  { href: '/dashboard/team', label: 'Team', icon: Users },
  { href: '/dashboard/billing', label: 'Billing', icon: CreditCard },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
] as const;

export default function DashboardShell({
  session,
  breadcrumb,
  primaryAction,
  children,
}: {
  session: ShellSessionContext;
  breadcrumb: string;
  primaryAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await fetch('/api/auth/signout', { method: 'POST' });
      window.location.assign('/auth/signin');
    } catch {
      setSigningOut(false);
    }
  }

  async function handleWorkspaceSwitch(workspaceId: string) {
    await fetch('/api/auth/session', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId }),
    });
    router.refresh();
  }

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between bg-white border-r border-slate-200">
      <div>
        <div className="flex h-14 items-center justify-between px-5 border-b border-slate-200">
          <Link
            href="/dashboard"
            className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap"
          >
            ReleaseDocket
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation menu"
            className="lg:hidden rounded-md p-2 text-slate-600 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70">
          <label
            htmlFor="workspace-select"
            className="block text-xs font-medium text-slate-500 mb-1"
          >
            Active Workspace
          </label>
          <select
            id="workspace-select"
            value={session.workspace.id}
            onChange={(e) => handleWorkspaceSwitch(e.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-blue-700 focus:outline-none"
          >
            {session.memberships.map((m) => (
              <option key={m.workspaceId} value={m.workspaceId}>
                {m.workspaceName}
                {m.isDemo ? ' (DEMO)' : ''}
              </option>
            ))}
          </select>
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
            <span>{session.role.replace('_', ' ')}</span>
            <span aria-hidden="true">·</span>
            <span className="capitalize">{session.workspace.planTier} plan</span>
            {session.workspace.isDemo && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-amber-700">DEMO</span>
              </>
            )}
          </div>
        </div>

        <nav aria-label="Workspace navigation" className="px-3 py-3 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-50 text-blue-800'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-slate-200 p-4">
        <div className="mb-3">
          <div className="text-sm font-medium text-slate-900 truncate">
            {session.user.name}
          </div>
          <div className="text-xs text-slate-500 truncate">
            {session.user.email}
          </div>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{signingOut ? 'Signing out...' : 'Sign out'}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-64 max-w-[80vw] h-full">
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="no-print sticky top-0 z-30 h-14 bg-white border-b border-slate-200 px-4 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden rounded-md border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="text-sm text-slate-500 truncate">
              <span>{session.workspace.name}</span>
              <span className="mx-2 text-slate-300">/</span>
              <span className="font-medium text-slate-900">{breadcrumb}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {primaryAction}
          </div>
        </header>

        {session.workspace.isDemo && (
          <div className="no-print border-b border-amber-200 bg-amber-50/90 px-4 lg:px-8 py-2 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong>Synthetic Demo Workspace:</strong> Repositories, PRs, CI runs, and client approvals shown here are labelled DEMO data and isolated from live GitHub integrations.
            </span>
            <Link
              href="/portal/demo-vanguard-v1-token"
              className="font-medium text-amber-900 underline underline-offset-2 hover:text-amber-950 whitespace-nowrap"
            >
              Inspect Sample Client Portal
            </Link>
          </div>
        )}

        <main className="flex-1 px-4 lg:px-8 py-6 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
