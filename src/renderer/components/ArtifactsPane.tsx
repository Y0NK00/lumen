// src/renderer/components/ArtifactsPane.tsx

import React, { useRef, useEffect, useState, useCallback } from 'react'

export interface Artifact {
  id: string
  code: string
  language: string
  title?: string
  timestamp: number
}

interface ArtifactsPaneProps {
  artifact: Artifact | null
  onClose: () => void
}

// ─── Language wrappers ────────────────────────────────────────────────────────

function wrapReactArtifact(code: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; background: #0f0f1a; color: #e0e0e0; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
${code}
const ComponentToRender = typeof App !== 'undefined' ? App : () => React.createElement('div', {style:{color:'#f87171'}}, 'No App component found.');
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(ComponentToRender));
  </script>
</body>
</html>`
}

function wrapSvgArtifact(code: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #0f0f1a; }
    svg { max-width: 100%; max-height: 90vh; }
  </style>
</head>
<body>${code}</body>
</html>`
}

function wrapHtmlArtifact(code: string): string {
  // If the code already has a doctype/html tag, use as-is. Otherwise wrap.
  if (/^\s*<!DOCTYPE/i.test(code) || /^\s*<html/i.test(code)) return code
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;padding:16px;font-family:system-ui;background:#0f0f1a;color:#e0e0e0}</style></head><body>${code}</body></html>`
}

// ─── Language display meta ────────────────────────────────────────────────────

const LANG_META: Record<string, { label: string; color: string }> = {
  jsx:        { label: 'JSX',        color: '#61dafb' },
  tsx:        { label: 'TSX',        color: '#61dafb' },
  react:      { label: 'React',      color: '#61dafb' },
  html:       { label: 'HTML',       color: '#e34c26' },
  css:        { label: 'CSS',        color: '#264de4' },
  javascript: { label: 'JS',         color: '#f7df1e' },
  js:         { label: 'JS',         color: '#f7df1e' },
  typescript: { label: 'TS',         color: '#3178c6' },
  ts:         { label: 'TS',         color: '#3178c6' },
  python:     { label: 'Python',     color: '#3572A5' },
  svg:        { label: 'SVG',        color: '#ffb13b' },
  mermaid:    { label: 'Mermaid',    color: '#ff3670' },
  markdown:   { label: 'Markdown',   color: '#083fa1' },
  md:         { label: 'Markdown',   color: '#083fa1' },
}

// ─── Component ────────────────────────────────────────────────────────────────

export const ArtifactsPane: React.FC<ArtifactsPaneProps> = ({ artifact, onClose }) => {
  const iframeRef  = useRef<HTMLIFrameElement>(null)
  const [viewMode,    setViewMode]    = useState<'preview' | 'source'>('preview')
  const [refreshKey,  setRefreshKey]  = useState(0)
  const [fullscreen,  setFullscreen]  = useState(false)
  const [copyLabel,   setCopyLabel]   = useState('Copy')

  // Rebuild iframe srcdoc whenever artifact, viewMode, or refreshKey changes
  useEffect(() => {
    if (!artifact || !iframeRef.current || viewMode !== 'preview') return
    const lang = artifact.language.toLowerCase()
    let srcdoc = artifact.code
    if (['jsx', 'tsx', 'react'].includes(lang)) srcdoc = wrapReactArtifact(artifact.code)
    else if (lang === 'svg')                    srcdoc = wrapSvgArtifact(artifact.code)
    else if (lang === 'html')                   srcdoc = wrapHtmlArtifact(artifact.code)
    iframeRef.current.srcdoc = srcdoc
  }, [artifact, viewMode, refreshKey])

  // Reset view mode when artifact changes
  useEffect(() => { setViewMode('preview') }, [artifact?.id])

  const handleRefresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  const handleCopy = useCallback(() => {
    if (!artifact) return
    navigator.clipboard.writeText(artifact.code).then(() => {
      setCopyLabel('Copied!')
      setTimeout(() => setCopyLabel('Copy'), 2000)
    })
  }, [artifact])

  if (!artifact) return null

  const lang     = artifact.language.toLowerCase()
  const langMeta = LANG_META[lang] ?? { label: artifact.language.toUpperCase(), color: '#a0a0a0' }
  const isRenderable = ['jsx','tsx','react','html','svg'].includes(lang)

  // Derive a display title: prefer artifact.title, else language label
  const displayTitle = artifact.title || `${langMeta.label} Artifact`

  return (
    <div className={`flex flex-col bg-[#0a0a14] border-l border-white/10
                     ${fullscreen ? 'fixed inset-0 z-50' : 'h-full'}`}>

      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-black/20 shrink-0">

        {/* Language badge */}
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wider shrink-0"
          style={{ background: `${langMeta.color}22`, color: langMeta.color }}
        >
          {langMeta.label}
        </span>

        {/* Title */}
        <span className="text-sm text-white/60 truncate flex-1 min-w-0">{displayTitle}</span>

        {/* Preview / Source toggle — only for renderable languages */}
        {isRenderable && (
          <div className="flex items-center bg-white/5 rounded-lg p-0.5 shrink-0">
            {(['preview', 'source'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={`text-[11px] px-2.5 py-1 rounded-md capitalize transition-colors
                            ${viewMode === m ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'}`}
              >
                {m}
              </button>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded text-white/40
                       hover:text-white/80 hover:bg-white/8 transition-colors"
            title="Copy source"
          >
            {copyLabel === 'Copied!' ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round">
                <polyline points="1,5 4,8 9,2" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <rect x="3" y="3" width="6" height="6" rx="1" />
                <path d="M7 3V2a1 1 0 00-1-1H2a1 1 0 00-1 1v4a1 1 0 001 1h1" />
              </svg>
            )}
            <span>{copyLabel}</span>
          </button>

          <button
            onClick={handleRefresh}
            className="w-7 h-7 flex items-center justify-center rounded text-white/30
                       hover:text-white/70 hover:bg-white/8 transition-colors"
            title="Reload"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M1 5.5A4.5 4.5 0 109.5 2.5" />
              <polyline points="7,1 9.5,2.5 8,5" />
            </svg>
          </button>

          <button
            onClick={() => setFullscreen((v) => !v)}
            className="w-7 h-7 flex items-center justify-center rounded text-white/30
                       hover:text-white/70 hover:bg-white/8 transition-colors"
            title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {fullscreen ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <polyline points="3,1 1,1 1,3" /><polyline points="7,1 9,1 9,3" />
                <polyline points="1,7 1,9 3,9" /><polyline points="9,7 9,9 7,9" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <polyline points="1,3 1,1 3,1" /><polyline points="7,1 9,1 9,3" />
                <polyline points="1,7 1,9 3,9" /><polyline points="9,7 9,9 7,9" />
              </svg>
            )}
          </button>

          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded text-white/30
                       hover:text-white/70 hover:bg-white/8 transition-colors"
            title="Close"
          >
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="1" y1="1" x2="8" y2="8" /><line x1="8" y1="1" x2="1" y2="8" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-hidden">
        {!isRenderable || viewMode === 'source' ? (
          // Source view — monospaced, scrollable, line numbers
          <div className="h-full overflow-auto">
            <pre className="p-4 text-[12px] font-mono leading-relaxed whitespace-pre-wrap break-all"
                 style={{ color: '#c9d1d9' }}>
              {artifact.code}
            </pre>
          </div>
        ) : (
          // Preview iframe
          <iframe
            key={refreshKey}
            ref={iframeRef}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
            title="artifact-preview"
          />
        )}
      </div>

    </div>
  )
}
