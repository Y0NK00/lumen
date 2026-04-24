// src/renderer/components/CodeBlock.tsx
// DROP-IN replacement for raw <pre><code> blocks.
// Requires: npm install react-syntax-highlighter @types/react-syntax-highlighter

import React, { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface CodeBlockProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  onOpenInArtifacts?: (code: string, language: string) => void;
}

const RENDERABLE_LANGUAGES = ['html', 'jsx', 'tsx', 'react', 'svg'];

export const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language = 'text',
  showLineNumbers = false,
  onOpenInArtifacts,
}) => {
  const [copied, setCopied] = useState(false);
  const lang = language.toLowerCase().replace(/^(lang-|language-)/, '');
  const canRender = RENDERABLE_LANGUAGES.includes(lang) && !!onOpenInArtifacts;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for Electron context without clipboard perms
      const el = document.createElement('textarea');
      el.value = code;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="relative rounded-xl overflow-hidden border border-white/10 my-3 group max-w-full">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-black/50 border-b border-white/10">
        <span className="text-xs text-white/30 font-mono tracking-wider uppercase">
          {lang || 'code'}
        </span>
        <div className="flex items-center gap-3">
          {canRender && (
            <button
              onClick={() => onOpenInArtifacts!(code, lang)}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
            >
              <span>⚡</span>
              <span>Preview</span>
            </button>
          )}
          <button
            onClick={handleCopy}
            className="text-xs text-white/30 hover:text-white/70 transition-colors"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Syntax highlighted code — overflow-x-auto lets wide code scroll instead of overflowing */}
      <div className="overflow-x-auto">
      <SyntaxHighlighter
        style={oneDark}
        language={lang}
        showLineNumbers={showLineNumbers}
        wrapLines={false}
        wrapLongLines={false}
        customStyle={{
          margin: 0,
          borderRadius: 0,
          background: 'rgba(0, 0, 0, 0.35)',
          fontSize: '0.83rem',
          padding: '1rem 1.25rem',
          lineHeight: '1.6',
          minWidth: '100%',
        }}
        codeTagProps={{
          style: {
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
          },
        }}
      >
        {code}
      </SyntaxHighlighter>
      </div>
    </div>
  );
};
