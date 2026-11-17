'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Sign in failed.');
        setLoading(false);
        return;
      }
      window.location.assign('/dashboard');
    } catch {
      setError('Network error while signing in.');
      setLoading(false);
    }
  }

  async function handleDemoSignIn() {
    setError(null);
    setDemoLoading(true);
    try {
      const res = await fetch('/api/auth/demo', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Demo workspace is unavailable.');
        setDemoLoading(false);
        return;
      }
      window.location.assign('/dashboard');
    } catch {
      setError('Network error launching demo workspace.');
      setDemoLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center px-4 py-12">
      <div className="mx-auto w-full max-w-md">
        <Link
          href="/"
          className="font-display text-lg font-bold tracking-tight text-slate-900"
        >
          ReleaseDocket
        </Link>
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
          <h1 className="font-display text-xl font-bold text-slate-900">
            Sign in to your agency workspace
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Enter your account credentials to manage delivery receipts.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="signin-email"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Work email
              </label>
              <input
                id="signin-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="lead@youragency.com"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="signin-password"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Password
              </label>
              <input
                id="signin-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
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

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-blue-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-900 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-5 border-t border-slate-200 pt-5">
            <button
              type="button"
              onClick={handleDemoSignIn}
              disabled={demoLoading}
              className="w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50"
            >
              {demoLoading
                ? 'Opening Northstar Digital Studio (DEMO)...'
                : 'Open Non-Prod Demo Workspace (Northstar Digital Studio)'}
            </button>
            <p className="mt-2 text-xs text-slate-500">
              Demo mode is isolated, clearly labelled, and disabled automatically in production.
            </p>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-slate-600">
          Need a new agency workspace?{' '}
          <Link href="/auth/signup" className="font-medium text-blue-800 hover:underline">
            Create workspace
          </Link>
        </p>
      </div>
    </div>
  );
}
