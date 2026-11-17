'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function SignUpPage() {
  const [name, setName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, workspaceName, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not create workspace.');
        setLoading(false);
        return;
      }
      window.location.assign('/onboarding');
    } catch {
      setError('Network error creating workspace.');
      setLoading(false);
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
            Create your agency workspace
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Start on the Solo tier and connect your repositories during onboarding.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="signup-name"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Your full name
              </label>
              <input
                id="signup-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jordan Taylor"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="signup-workspace"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Agency / studio name
              </label>
              <input
                id="signup-workspace"
                type="text"
                required
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="Kestrel Product Studio"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="signup-email"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Work email
              </label>
              <input
                id="signup-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jordan@kestrel.studio"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="signup-password"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Password (min 8 characters)
              </label>
              <input
                id="signup-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
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
              {loading ? 'Creating Workspace...' : 'Create Workspace'}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-slate-600">
          Already have an account?{' '}
          <Link href="/auth/signin" className="font-medium text-blue-800 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
