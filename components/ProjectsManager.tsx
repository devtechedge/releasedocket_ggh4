'use client';

import { Link2, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ClientRecord, ProjectRecord } from '@/repositories/crm.repo';
import type { GitHubRepositoryRecord } from '@/repositories/github.repo';

interface MappingItem {
  id: string;
  projectId: string;
  repositoryId: string;
  repoFullName: string;
  mode: string;
}

export default function ProjectsManager({
  initialProjects,
  clients,
  initialMappings,
  repositories,
  canWrite,
}: {
  initialProjects: ProjectRecord[];
  clients: ClientRecord[];
  initialMappings: MappingItem[];
  repositories: GitHubRepositoryRecord[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [mappings, setMappings] = useState(initialMappings);
  const [showForm, setShowForm] = useState(false);

  const [clientId, setClientId] = useState(clients[0]?.id ?? '');
  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  const [environmentUrl, setEnvironmentUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [selectedRepoByProject, setSelectedRepoByProject] = useState<
    Record<string, string>
  >({});

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatusMsg(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, name, summary, environmentUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not create project.');
        return;
      }
      setProjects((prev) => [data.project, ...prev]);
      setName('');
      setSummary('');
      setEnvironmentUrl('');
      setShowForm(false);
      setStatusMsg(`Project "${data.project.name}" created.`);
      router.refresh();
    } catch {
      setError('Network error creating project.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMapRepo(projectId: string) {
    const repositoryId = selectedRepoByProject[projectId] || repositories[0]?.id;
    if (!repositoryId) return;
    setError(null);
    setStatusMsg(null);
    const res = await fetch('/api/projects/map-repo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, repositoryId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Could not map repository.');
      return;
    }
    const repo = repositories.find((r) => r.id === repositoryId);
    if (repo) {
      setMappings((prev) => {
        if (
          prev.some(
            (m) => m.projectId === projectId && m.repositoryId === repositoryId
          )
        ) {
          return prev;
        }
        return [
          {
            id: `tmp-${Date.now()}`,
            projectId,
            repositoryId,
            repoFullName: repo.fullName,
            mode: repo.mode,
          },
          ...prev,
        ];
      });
    }
    setStatusMsg('Repository mapped to project.');
    router.refresh();
  }

  async function handleUnmapRepo(projectId: string, repositoryId: string) {
    setError(null);
    const res = await fetch('/api/projects/map-repo', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, repositoryId }),
    });
    if (res.ok) {
      setMappings((prev) =>
        prev.filter(
          (m) => !(m.projectId === projectId && m.repositoryId === repositoryId)
        )
      );
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Projects & Repository Mappings
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Bind client projects to connected GitHub repositories so observations flow into delivery batches.
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            disabled={clients.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-800 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-900 disabled:opacity-50 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>{showForm ? 'Close Form' : 'New Project'}</span>
          </button>
        )}
      </div>

      {clients.length === 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          Create a client first before adding a project.
        </div>
      )}

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

      {showForm && (
        <form
          onSubmit={handleCreateProject}
          className="rounded-lg border border-slate-200 bg-white p-5 space-y-4"
        >
          <h2 className="font-display text-base font-semibold text-slate-900">
            Create project
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="proj-client"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Client
              </label>
              <select
                id="proj-client"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                required
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="proj-name"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Project name
              </label>
              <input
                id="proj-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Order Routing Engine"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="proj-env-url"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Target environment URL (optional)
              </label>
              <input
                id="proj-env-url"
                type="url"
                value={environmentUrl}
                onChange={(e) => setEnvironmentUrl(e.target.value)}
                placeholder="https://staging.client.example"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="proj-summary"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Scope summary
              </label>
              <input
                id="proj-summary"
                type="text"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Webhook ingestion and dispatch portal"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-blue-800 px-4 py-2 text-xs font-medium text-white hover:bg-blue-900 disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Project'}
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

      {projects.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No projects created yet. Create a project and map a GitHub repository to begin tracking delivery batches.
        </div>
      ) : (
        <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {projects.map((p) => {
            const projectMappings = mappings.filter((m) => m.projectId === p.id);
            return (
              <div key={p.id} className="p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-slate-500">
                      {p.clientName || 'Client'} · {p.status}
                    </div>
                    <h2 className="font-display text-base font-semibold text-slate-900 mt-0.5">
                      {p.name}
                    </h2>
                    {p.summary && (
                      <p className="text-xs text-slate-600 mt-1">{p.summary}</p>
                    )}
                  </div>
                  {p.environmentUrl && (
                    <span className="font-mono text-xs text-slate-500">
                      {p.environmentUrl}
                    </span>
                  )}
                </div>

                {/* Mapped repositories */}
                <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-medium text-slate-700">
                      Mapped Repositories:
                    </span>
                    {projectMappings.length === 0 ? (
                      <span className="text-slate-500">None mapped</span>
                    ) : (
                      projectMappings.map((m) => (
                        <span
                          key={m.id}
                          className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-800"
                        >
                          <span>{m.repoFullName}</span>
                          <span className="text-slate-400">
                            ({m.mode === 'demo_synthetic' ? 'DEMO' : 'Live'})
                          </span>
                          {canWrite && (
                            <button
                              type="button"
                              aria-label={`Unmap ${m.repoFullName} from ${p.name}`}
                              onClick={() =>
                                handleUnmapRepo(p.id, m.repositoryId)
                              }
                              className="text-slate-400 hover:text-red-700"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </span>
                      ))
                    )}
                  </div>

                  {canWrite && repositories.length > 0 && (
                    <div className="flex items-center gap-2">
                      <select
                        aria-label={`Select repository to map to ${p.name}`}
                        value={
                          selectedRepoByProject[p.id] || repositories[0]?.id
                        }
                        onChange={(e) =>
                          setSelectedRepoByProject((prev) => ({
                            ...prev,
                            [p.id]: e.target.value,
                          }))
                        }
                        className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-900"
                      >
                        {repositories.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.fullName}{' '}
                            {r.mode === 'demo_synthetic' ? '(DEMO)' : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleMapRepo(p.id)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                      >
                        <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Map Repo</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
