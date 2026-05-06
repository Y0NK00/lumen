import { useEffect, useMemo, useState } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { sql } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import { MarkdownRenderer } from './MarkdownRenderer'
import { exportFile, updateFile, type LumenFile } from '../lib/api'
import { useFilesStore } from '../stores/filesStore'

function extensionForLanguage(language: string) {
  if (language === 'markdown') return markdown()
  if (language === 'javascript') return javascript()
  if (language === 'typescript') return javascript({ typescript: true })
  if (language === 'python') return python()
  if (language === 'html') return html()
  if (language === 'css') return css()
  if (language === 'json') return json()
  if (language === 'sql') return sql()
  return []
}

const LANGUAGES = ['markdown', 'plaintext', 'javascript', 'typescript', 'python', 'bash', 'sh', 'json', 'yaml', 'toml', 'html', 'css', 'sql', 'rust', 'go', 'java', 'csharp', 'cpp', 'c', 'xml', 'dockerfile']

export function FileEditor({ file }: { file: LumenFile }) {
  const { setOpenFile, setEditorDirty, editorDirty, updateStub } = useFilesStore()
  const [name, setName] = useState(file.name)
  const [language, setLanguage] = useState(file.language)
  const [content, setContent] = useState(file.content)
  const [preview, setPreview] = useState(false)

  useEffect(() => {
    setName(file.name)
    setLanguage(file.language)
    setContent(file.content)
    setEditorDirty(false)
  }, [file, setEditorDirty])

  useEffect(() => {
    const t = setTimeout(() => {
      if (!editorDirty) return
      updateFile(file.id, { content, name, language })
        .then((updated) => {
          setEditorDirty(false)
          updateStub(updated)
        })
        .catch(console.error)
    }, 2000)
    return () => clearTimeout(t)
  }, [content, editorDirty, file.id, language, name, setEditorDirty, updateStub])

  const extensions = useMemo(() => [basicSetup, oneDark, extensionForLanguage(language)].flat(), [language])

  const saveNow = async () => {
    const updated = await updateFile(file.id, { content, name, language })
    setEditorDirty(false)
    updateStub(updated)
  }

  const download = async () => {
    const raw = await exportFile(file.id)
    const blob = new Blob([raw], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b flex items-center gap-2" style={{ borderColor: 'var(--color-border)' }}>
        <input value={name} onChange={(e) => { setName(e.target.value); setEditorDirty(true) }} className="px-2 py-1 rounded border text-[12px] bg-transparent" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }} />
        <select value={language} onChange={(e) => { setLanguage(e.target.value); setEditorDirty(true) }} className="px-2 py-1 rounded border text-[12px] bg-transparent" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}>
          {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        {editorDirty && <span className="text-[11px]" style={{ color: 'var(--color-accent)' }}>Unsaved changes</span>}
        <div className="ml-auto flex items-center gap-2">
          {language === 'markdown' && (
            <button type="button" onClick={() => setPreview((v) => !v)} className="px-2 py-1 text-[12px] rounded border" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}>
              {preview ? 'Edit only' : 'Split preview'}
            </button>
          )}
          <button type="button" onClick={() => void saveNow()} className="px-2 py-1 text-[12px] rounded" style={{ background: 'var(--color-accent)', color: '#fff' }}>Save</button>
          <button type="button" onClick={() => void download()} className="px-2 py-1 text-[12px] rounded border" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}>Download</button>
          <button type="button" onClick={() => setOpenFile(null)} className="px-2 py-1 text-[12px] rounded border" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}>Close</button>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex">
        <div className={preview ? 'w-1/2 border-r' : 'w-full'} style={{ borderColor: 'var(--color-border)' }}>
          <CodeEditor
            value={content}
            extensions={extensions}
            onChange={(v) => {
              setContent(v)
              setEditorDirty(true)
            }}
          />
        </div>
        {preview && (
          <div className="w-1/2 overflow-auto p-3">
            <MarkdownRenderer content={content} />
          </div>
        )}
      </div>
    </div>
  )
}

function CodeEditor({
  value,
  extensions,
  onChange,
}: {
  value: string
  extensions: unknown[]
  onChange: (value: string) => void
}) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!container) return
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          ...(extensions as []),
          EditorView.updateListener.of((v) => {
            if (v.docChanged) onChange(v.state.doc.toString())
          }),
        ],
      }),
      parent: container,
    })
    return () => view.destroy()
  }, [container, extensions, onChange, value])

  return <div ref={setContainer} className="h-full" />
}
