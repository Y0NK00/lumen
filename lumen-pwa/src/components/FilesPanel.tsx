import { useEffect, useMemo, useState } from 'react'
import { createFile, getFile, listFiles, uploadFile, updateFile, listProjects, type FileStub } from '../lib/api'
import { useFilesStore } from '../stores/filesStore'

const LANGUAGES = [
  'markdown', 'plaintext', 'javascript', 'typescript', 'python',
  'bash', 'sh', 'json', 'yaml', 'toml', 'html', 'css', 'sql',
  'rust', 'go', 'java', 'csharp', 'cpp', 'c', 'xml', 'dockerfile',
]

function iconForLanguage(lang: string): string {
  if (lang === 'markdown') return 'M'
  if (lang === 'typescript' || lang === 'javascript') return 'JS'
  if (lang === 'python') return 'PY'
  if (lang === 'html') return 'HTML'
  if (lang === 'css') return 'CSS'
  if (lang === 'json') return '{}'
  if (lang === 'sql') return 'SQL'
  return 'TXT'
}

export function FilesPanel() {
  const { files, setFiles, setOpenFile, updateStub } = useFilesStore()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [language, setLanguage] = useState('markdown')
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    setLoading(true)
    listFiles()
      .then((items) => setFiles(items))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [setFiles])

  useEffect(() => {
    listProjects()
      .then((items) => setProjects(items.map((p) => ({ id: p.id, name: p.name }))))
      .catch(() => {})
  }, [])

  const sorted = useMemo(() => {
    const next = [...files]
    return next.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
  }, [files])

  const filtered = useMemo(() => {
    if (!search.trim()) return sorted
    const q = search.toLowerCase()
    return sorted.filter((f) => f.name.toLowerCase().includes(q))
  }, [search, sorted])

  const grouped = useMemo(() => {
    const map = new Map<string, FileStub[]>()
    for (const f of filtered) {
      const key = f.projectId ?? 'unfiled'
      const items = map.get(key) ?? []
      items.push(f)
      map.set(key, items)
    }
    return Array.from(map.entries())
  }, [filtered])

  const open = async (stub: FileStub) => {
    const full = await getFile(stub.id)
    setOpenFile(full)
  }

  const create = async () => {
    if (!name.trim()) return
    const file = await createFile({ name: name.trim(), language })
    updateStub(file)
    setOpenFile(file)
    setName('')
    setLanguage('markdown')
    setCreating(false)
  }

  const onUpload = async (file: File) => {
    const text = await file.text()
    const uploaded = await uploadFile(file.name, 'plaintext', text)
    updateStub(uploaded)
  }

  return (
    <div className="px-3 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-semibold tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Files</p>
        <div className="flex items-center gap-2">
          <label className="text-[11px] cursor-pointer" style={{ color: 'var(--color-accent)' }}>
            Upload
            <input
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onUpload(f)
                e.currentTarget.value = ''
              }}
            />
          </label>
          <button type="button" className="text-[11px]" style={{ color: 'var(--color-accent)' }} onClick={() => setCreating((v) => !v)}>New File</button>
        </div>
      </div>
      {creating && (
        <div className="mb-2 rounded-lg p-2 border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          <input className="w-full mb-1 px-2 py-1 rounded text-[12px] bg-transparent border" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }} value={name} onChange={(e) => setName(e.target.value)} placeholder="filename.ext" />
          <select className="w-full mb-1 px-2 py-1 rounded text-[12px] bg-transparent border" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }} value={language} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <button type="button" onClick={() => void create()} className="w-full rounded px-2 py-1 text-[12px]" style={{ background: 'var(--color-accent)', color: '#fff' }}>Create</button>
        </div>
      )}
      <input
        className="w-full mb-2 px-2 py-1 rounded text-[12px] bg-transparent border"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search files…"
      />
      <div className="max-h-[220px] overflow-y-auto space-y-1">
        {loading && <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>Loading files…</p>}
        {!loading && filtered.length === 0 && <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>No files yet.</p>}
        {grouped.map(([projectId, items]) => (
          <div key={projectId}>
            <p className="text-[10px] px-1 py-1 uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
              {projectId === 'unfiled' ? 'Unfiled' : projects.find((p) => p.id === projectId)?.name ?? 'Project'}
            </p>
            {items.map((f) => (
              <div key={f.id} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-[var(--color-surface-hover)]">
                <button type="button" onClick={() => void open(f)} className="flex flex-1 items-center gap-2 min-w-0">
                  <span className="text-[10px] w-8 h-5 rounded flex items-center justify-center" style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)' }}>{iconForLanguage(f.language)}</span>
                  <span className="flex-1 min-w-0 truncate text-[12px]" style={{ color: 'var(--color-text-primary)' }}>{f.name}</span>
                </button>
                <button
                  type="button"
                  className="text-[10px]"
                  style={{ color: f.pinned ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
                  onClick={() => void updateFile(f.id, { pinned: !f.pinned }).then(updateStub)}
                >
                  {f.pinned ? 'Unpin' : 'Pin'}
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
