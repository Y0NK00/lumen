// src/renderer/components/ProjectsPane.tsx
// Full-pane Projects manager. Opens as an overlay over ChatPane when the user
// clicks "Projects" in the sidebar nav. Lets them create, edit, delete, and
// pick a project. A project is (name, rootPath, systemPrompt, color).

import { useState } from 'react'
import {
  useProjectsStore,
  type Project,
  type ProjectColor,
  PROJECT_COLOR_CLASSES,
} from '../stores/projectsStore'
import { useChatStore } from '../stores/chatStore'

// ─── Color swatch picker ──────────────────────────────────────────────────────

const COLORS: ProjectColor[] = ['violet', 'blue', 'emerald', 'amber', 'rose', 'slate']

function ColorSwatch({
  color, selected, onClick,
}: { color: ProjectColor; selected: boolean; onClick: () => void }) {
  const cls = PROJECT_COLOR_CLASSES[color]
  return (
    <button
      onClick={onClick}
      className={[
        'w-7 h-7 rounded-full transition-all',
        cls.dot,
        selected ? 'ring-2 ring-offset-2 ring-offset-sidebar ring-white/60 scale-110' : 'opacity-70 hover:opacity-100',
      ].join(' ')}
      title={color}
      aria-label={`Color ${color}`}
    />
  )
}

// ─── Project row in the list ──────────────────────────────────────────────────

function ProjectRow({
  project, isActive, onOpen, onEdit, onDelete,
}: {
  project: Project
  isActive: boolean
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const cls = PROJECT_COLOR_CLASSES[project.color]
  return (
    <div
      className={[
        'group rounded-xl border px-4 py-3 cursor-pointer transition-all',
        isActive
          ? `${cls.bg} ${cls.border}`
          : 'bg-surface border-border hover:border-accent/30',
      ].join(' ')}
      onClick={onOpen}
    >
      <div className="flex items-start gap-3">
        {/* Color badge / emoji */}
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${cls.bg} ${cls.border} border`}>
          <span className="text-base">{project.emoji || '📁'}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`text-[13.5px] font-semibold truncate ${isActive ? cls.text : 'text-text-primary'}`}>
              {project.name}
            </p>
            {isActive && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${cls.bg} ${cls.text} shrink-0`}>
                active
              </span>
            )}
          </div>
          <p className="text-[11.5px] text-text-muted font-mono truncate mt-0.5" title={project.rootPath}>
            {project.rootPath || <span className="italic">No folder set</span>}
          </p>
          {project.systemPrompt && (
            <p className="text-[11.5px] text-text-secondary mt-1.5 line-clamp-2 leading-snug">
              {project.systemPrompt}
            </p>
          )}
        </div>

        {/* Hover actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onEdit}
            className="px-2 py-1 rounded text-[11px] text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="px-2 py-1 rounded text-[11px] text-text-muted hover:text-error hover:bg-error/10 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Create/edit form ─────────────────────────────────────────────────────────

interface FormState {
  name: string
  rootPath: string
  systemPrompt: string
  color: ProjectColor
  emoji: string
}

const EMPTY_FORM: FormState = {
  name: '', rootPath: '', systemPrompt: '', color: 'violet', emoji: '',
}

const inputCls =
  'w-full bg-surface border border-border rounded-lg px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors'

function ProjectForm({
  editing, onCancel, onSave,
}: {
  editing: Project | null
  onCancel: () => void
  onSave: (form: FormState) => void
}) {
  const [form, setForm] = useState<FormState>(
    editing
      ? {
          name: editing.name,
          rootPath: editing.rootPath,
          systemPrompt: editing.systemPrompt,
          color: editing.color,
          emoji: editing.emoji ?? '',
        }
      : EMPTY_FORM
  )

  const pickFolder = async () => {
    if (!window.tower?.openFolderDialog) return
    const path = await window.tower.openFolderDialog()
    if (path) setForm((f) => ({ ...f, rootPath: path }))
  }

  const canSave = form.name.trim().length > 0

  return (
    <div className="border border-border rounded-xl bg-sidebar p-5 flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-text-primary">
        {editing ? 'Edit Project' : 'New Project'}
      </h3>

      {/* Name + emoji */}
      <div className="flex gap-3">
        <div className="w-16">
          <label className="text-[12px] font-medium text-text-secondary mb-1.5 block">Icon</label>
          <input
            type="text"
            maxLength={2}
            value={form.emoji}
            onChange={(e) => setForm({ ...form, emoji: e.target.value })}
            placeholder="📁"
            className={`${inputCls} text-center`}
          />
        </div>
        <div className="flex-1">
          <label className="text-[12px] font-medium text-text-secondary mb-1.5 block">Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Obsidian Vault, Tower AI, Home Lab…"
            className={inputCls}
            autoFocus
          />
        </div>
      </div>

      {/* Root path */}
      <div>
        <label className="text-[12px] font-medium text-text-secondary mb-1.5 block">Working Folder</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={form.rootPath}
            onChange={(e) => setForm({ ...form, rootPath: e.target.value })}
            placeholder="/path/to/folder"
            className={`${inputCls} flex-1 font-mono text-[12px]`}
          />
          <button
            onClick={pickFolder}
            className="px-3 rounded-lg border border-border bg-surface text-[12px] text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors"
          >
            Browse…
          </button>
        </div>
        <p className="text-[11px] text-text-muted mt-1.5">
          Tool calls in this project default to this folder. Leave blank to skip.
        </p>
      </div>

      {/* System prompt */}
      <div>
        <label className="text-[12px] font-medium text-text-secondary mb-1.5 block">System Prompt</label>
        <textarea
          value={form.systemPrompt}
          onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
          rows={4}
          placeholder="Prepended to every conversation in this project. E.g. 'You are helping me maintain my Obsidian vault…'"
          className={`${inputCls} resize-none leading-relaxed`}
        />
      </div>

      {/* Color */}
      <div>
        <label className="text-[12px] font-medium text-text-secondary mb-2 block">Color</label>
        <div className="flex gap-2">
          {COLORS.map((c) => (
            <ColorSwatch
              key={c}
              color={c}
              selected={form.color === c}
              onClick={() => setForm({ ...form, color: c })}
            />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-[12.5px] text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => canSave && onSave(form)}
          disabled={!canSave}
          className="px-4 py-2 rounded-lg bg-accent text-white text-[12.5px] font-medium hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {editing ? 'Save Changes' : 'Create Project'}
        </button>
      </div>
    </div>
  )
}

// ─── Main pane ────────────────────────────────────────────────────────────────

export function ProjectsPane({ onClose }: { onClose: () => void }) {
  const {
    projects, activeProjectId,
    createProject, updateProject, deleteProject, setActiveProject,
  } = useProjectsStore()
  const { activeConversationId, setConversationProject } = useChatStore()

  const [mode, setMode] = useState<'list' | 'form'>('list')
  const [editing, setEditing] = useState<Project | null>(null)

  const list = Object.values(projects).sort((a, b) => b.updatedAt - a.updatedAt)

  const openForm = (project: Project | null) => {
    setEditing(project)
    setMode('form')
  }

  const handleSave = (form: FormState) => {
    if (editing) {
      updateProject(editing.id, {
        name:         form.name.trim(),
        rootPath:     form.rootPath.trim(),
        systemPrompt: form.systemPrompt,
        color:        form.color,
        emoji:        form.emoji || undefined,
      })
    } else {
      createProject({
        name:         form.name.trim(),
        rootPath:     form.rootPath.trim(),
        systemPrompt: form.systemPrompt,
        color:        form.color,
        emoji:        form.emoji || undefined,
      })
    }
    setMode('list')
    setEditing(null)
  }

  const handleSetActive = (id: string) => {
    setActiveProject(id)
    // If there's an active conversation, scope it to this project.
    if (activeConversationId) setConversationProject(activeConversationId, id)
  }

  const handleDelete = (id: string) => {
    // Unscope any conversations pointing to this project happens implicitly —
    // the projectId lookup fails and the conversation falls back to unscoped.
    deleteProject(id)
  }

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-base font-semibold text-text-primary">Projects</h1>
          <p className="text-[11.5px] text-text-muted mt-0.5">
            Scope a conversation to a folder and system prompt.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {mode === 'list' && (
            <button
              onClick={() => openForm(null)}
              className="px-3 py-1.5 rounded-lg bg-accent text-white text-[12.5px] font-medium hover:bg-accent-hover transition-colors"
            >
              + New Project
            </button>
          )}
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
            title="Close"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="1" y1="1" x2="10" y2="10" /><line x1="10" y1="1" x2="1" y2="10" />
            </svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[760px] mx-auto px-6 py-6">
          {mode === 'form' ? (
            <ProjectForm
              editing={editing}
              onCancel={() => { setMode('list'); setEditing(null) }}
              onSave={handleSave}
            />
          ) : list.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">📁</span>
              </div>
              <h2 className="text-sm font-semibold text-text-primary mb-1">No projects yet</h2>
              <p className="text-[12px] text-text-muted mb-5 max-w-sm mx-auto">
                Create a project to anchor conversations to a folder — like your Obsidian vault or a code repo.
              </p>
              <button
                onClick={() => openForm(null)}
                className="px-4 py-2 rounded-lg bg-accent text-white text-[12.5px] font-medium hover:bg-accent-hover transition-colors"
              >
                + Create Your First Project
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {list.map((p) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  isActive={activeProjectId === p.id}
                  onOpen={() => handleSetActive(p.id)}
                  onEdit={() => openForm(p)}
                  onDelete={() => handleDelete(p.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
