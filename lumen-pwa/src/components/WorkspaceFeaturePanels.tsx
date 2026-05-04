import { useEffect, useState } from 'react'
import {
  listProjects,
  createProject,
  deleteProject,
  listArtifacts,
  createArtifact,
  deleteArtifact,
  listScheduledTasks,
  createScheduledTask,
  deleteScheduledTask,
  updateScheduledTask,
  type Project,
  type Artifact,
  type ScheduledTask,
} from '../lib/api'

type Panel = 'projects' | 'artifacts' | 'dispatch'

export function WorkspaceFeaturePanels({
  open,
  onClose,
}: {
  open: Panel | null
  onClose: () => void
}) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="presentation"
    >
      <div
        className="w-full sm:max-w-lg max-h-[90dvh] sm:max-h-[85vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <p className="text-[15px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {open === 'projects' && 'Projects'}
            {open === 'artifacts' && 'Artifacts'}
            {open === 'dispatch' && 'Dispatch'}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[13px]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            ✕
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {open === 'projects' && <ProjectsBody onClose={onClose} />}
          {open === 'artifacts' && <ArtifactsBody onClose={onClose} />}
          {open === 'dispatch' && <DispatchBody onClose={onClose} />}
        </div>
      </div>
    </div>
  )
}

function ProjectsBody({ onClose: _onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<Project[]>([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)

  const load = () => {
    listProjects().then(setItems).catch(console.error).finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const add = async () => {
    const n = name.trim()
    if (!n) return
    setName('')
    try {
      await createProject({ name: n })
      load()
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
        Folders for organizing work. Conversations can be linked to a project from the server API; UI wiring comes next.
      </p>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New project name"
          className="flex-1 rounded-xl px-3 py-2 text-[14px] outline-none"
          style={{
            background: 'var(--color-surface-hover)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-primary)',
          }}
        />
        <button
          type="button"
          onClick={() => void add()}
          className="px-4 py-2 rounded-xl text-[13px] font-medium shrink-0"
          style={{ background: 'var(--color-accent)', color: '#fff' }}
        >
          Add
        </button>
      </div>
      {loading ? (
        <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>No projects yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl"
              style={{ background: 'var(--color-surface-hover)', border: '1px solid var(--color-border)' }}
            >
              <span className="text-[13px] truncate" style={{ color: 'var(--color-text-primary)' }}>{p.name}</span>
              <button
                type="button"
                className="text-[11px] shrink-0"
                style={{ color: 'var(--color-error)' }}
                onClick={() => { void deleteProject(p.id).then(load) }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ArtifactsBody({ onClose: _onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<Artifact[]>([])
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(true)

  const load = () => {
    listArtifacts().then(setItems).catch(console.error).finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const add = async () => {
    const t = title.trim()
    if (!t) return
    setTitle('')
    try {
      await createArtifact({ title: t, body: '', kind: 'note' })
      load()
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
        Notes and outputs saved to your account. Open Lumen on your phone to manage the same artifacts.
      </p>
      <div className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Artifact title"
          className="flex-1 rounded-xl px-3 py-2 text-[14px] outline-none"
          style={{
            background: 'var(--color-surface-hover)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-primary)',
          }}
        />
        <button
          type="button"
          onClick={() => void add()}
          className="px-4 py-2 rounded-xl text-[13px] font-medium shrink-0"
          style={{ background: 'var(--color-accent)', color: '#fff' }}
        >
          Create
        </button>
      </div>
      {loading ? (
        <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>No artifacts yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl"
              style={{ background: 'var(--color-surface-hover)', border: '1px solid var(--color-border)' }}
            >
              <span className="text-[13px] truncate" style={{ color: 'var(--color-text-primary)' }}>{a.title}</span>
              <button
                type="button"
                className="text-[11px] shrink-0"
                style={{ color: 'var(--color-error)' }}
                onClick={() => { void deleteArtifact(a.id).then(load) }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DispatchBody({ onClose: _onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<ScheduledTask[]>([])
  const [name, setName] = useState('')
  const [cronExpr, setCronExpr] = useState('0 9 * * *')
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(true)

  const load = () => {
    listScheduledTasks().then(setItems).catch(console.error).finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const add = async () => {
    const n = name.trim()
    const p = prompt.trim()
    if (!n || !p) return
    try {
      await createScheduledTask({
        name: n,
        cronExpr: cronExpr.trim() || '0 9 * * *',
        prompt: p,
        model: 'claude-sonnet-4-6',
        enabled: true,
      })
      setName('')
      setPrompt('')
      load()
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
        Scheduled prompts (cron). The server stores tasks; a worker must run them (not included here). Same list syncs on your phone via the PWA.
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Task name"
        className="rounded-xl px-3 py-2 text-[14px] outline-none"
        style={{
          background: 'var(--color-surface-hover)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-primary)',
        }}
      />
      <input
        value={cronExpr}
        onChange={(e) => setCronExpr(e.target.value)}
        placeholder="Cron e.g. 0 9 * * * (daily 9:00)"
        className="rounded-xl px-3 py-2 text-[14px] outline-none font-mono text-[13px]"
        style={{
          background: 'var(--color-surface-hover)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-primary)',
        }}
      />
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Prompt to send when the task runs"
        rows={3}
        className="rounded-xl px-3 py-2 text-[14px] outline-none resize-none"
        style={{
          background: 'var(--color-surface-hover)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-primary)',
        }}
      />
      <button
        type="button"
        onClick={() => void add()}
        className="px-4 py-2.5 rounded-xl text-[13px] font-medium"
        style={{ background: 'var(--color-accent)', color: '#fff' }}
      >
        Save dispatch task
      </button>
      {loading ? (
        <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>No scheduled tasks yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((t) => (
            <li
              key={t.id}
              className="px-3 py-2 rounded-xl flex flex-col gap-1"
              style={{ background: 'var(--color-surface-hover)', border: '1px solid var(--color-border)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium" style={{ color: 'var(--color-text-primary)' }}>{t.name}</span>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    className="text-[11px]"
                    style={{ color: 'var(--color-text-secondary)' }}
                    onClick={() => {
                      void updateScheduledTask(t.id, { enabled: !t.enabled }).then(load)
                    }}
                  >
                    {t.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    type="button"
                    className="text-[11px]"
                    style={{ color: 'var(--color-error)' }}
                    onClick={() => { void deleteScheduledTask(t.id).then(load) }}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <span className="text-[11px] font-mono" style={{ color: 'var(--color-text-muted)' }}>{t.cronExpr}</span>
              <span className="text-[12px] line-clamp-2" style={{ color: 'var(--color-text-secondary)' }}>{t.prompt}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
