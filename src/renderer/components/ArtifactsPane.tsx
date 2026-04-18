// src/renderer/components/ArtifactsPane.tsx

import React, { useRef, useEffect, useState, useCallback } from 'react';

export interface Artifact {
  id: string;
  code: string;
  language: string;
  title?: string;
  timestamp: number;
}

interface ArtifactsPaneProps {
  artifact: Artifact | null;
  onClose: () => void;
}

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
</html>`;
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
</html>`;
}

export const ArtifactsPane: React.FC<ArtifactsPaneProps> = ({ artifact, onClose }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [viewMode, setViewMode] = useState<'preview' | 'source'>('preview');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!artifact || !iframeRef.current || viewMode !== 'preview') return;
    const lang = artifact.language.toLowerCase();
    let srcdoc = artifact.code;
    if (['jsx', 'tsx', 'react'].includes(lang)) {
      srcdoc = wrapReactArtifact(artifact.code);
    } else if (lang === 'svg') {
      srcdoc = wrapSvgArtifact(artifact.code);
    }
    iframeRef.current.srcdoc = srcdoc;
  }, [artifact, viewMode, refreshKey]);

  const handleRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  if (!artifact) return null;

  const langLabel = artifact.language.toUpperCase();

  return (
    <div className="flex flex-col h-full border-l border-white/10 bg-[#0a0a14]">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-black/30 shrink-0">

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-orange-500/20 text-orange-400">
            {langLabel}
          </span>
          <span className="text-sm text-white/50">Artifact</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewMode('preview')}
            className={`text-xs px-3 py-1 rounded transition-colors ${viewMode === 'preview' ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60'}`}
          >
            Preview
          </button>
          <button
            onClick={() => setViewMode('source')}
            className={`text-xs px-3 py-1 rounded transition-colors ${viewMode === 'source' ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60'}`}
          >
            Source
          </button>
          <button
            onClick={handleRefresh}
            className="text-xs px-2 py-1 text-white/30 hover:text-white/60 transition-colors"
          >
            Reload
          </button>
          <button
            onClick={onClose}
            className="text-xs px-2 py-1 text-white/30 hover:text-white/60 transition-colors"
          >
            Close
          </button>
        </div>

      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'preview' ? (
          <iframe
            key={refreshKey}
            ref={iframeRef}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms"
            title="artifact-preview"
          />
        ) : (
          <div className="h-full overflow-auto p-4">
            <pre className="text-xs font-mono text-white/60 whitespace-pre-wrap break-all leading-relaxed">
              {artifact.code}
            </pre>
          </div>
        )}
      </div>

    </div>
  );
};
