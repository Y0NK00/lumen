// src/renderer/components/DiffViewer.tsx
// Before/after diff display for write_file tool results.
// Requires: npm install diff @types/diff

import React, { useState, useMemo } from 'react';
import * as Diff from 'diff';

interface DiffViewerProps {
  oldContent: string;
  newContent: string;
  filename?: string;
}

type DiffLineType = 'added' | 'removed' | 'context' | 'header';

interface DiffLine {
  type: DiffLineType;
  content: string;
  lineNum?: number;
}

function buildDiffLines(oldContent: string, newContent: string): DiffLine[] {
  const changes = Diff.diffLines(oldContent, newContent);
  const lines: DiffLine[] = [];

  for (const change of changes) {
    const raw = change.value.replace(/\n$/, '');
    const parts = raw.split('\n');

    for (const part of parts) {
      if (change.added) {
        lines.push({ type: 'added', content: part });
      } else if (change.removed) {
        lines.push({ type: 'removed', content: part });
      } else {
        lines.push({ type: 'context', content: part });
      }
    }
  }

  return lines;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  oldContent,
  newContent,
  filename,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const diffLines = useMemo(
    () => buildDiffLines(oldContent, newContent),
    [oldContent, newContent]
  );

  const added = diffLines.filter((l) => l.type === 'added').length;
  const removed = diffLines.filter((l) => l.type === 'removed').length;

  if (oldContent === newContent) {
    return (
      <div className="text-xs text-white/30 italic px-2 py-1">
        No changes detected.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 overflow-hidden my-2 font-mono text-xs">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-white/5 border-b border-white/10 cursor-pointer hover:bg-white/[0.07] transition-colors"
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="flex items-center gap-3">
          <span className="text-white/40">
            {collapsed ? '▶' : '▼'}
          </span>
          {filename && (
            <span className="text-white/60 text-xs">{filename}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {added > 0 && (
            <span className="text-green-400 font-semibold">+{added}</span>
          )}
          {removed > 0 && (
            <span className="text-red-400 font-semibold">-{removed}</span>
          )}
        </div>
      </div>

      {/* Diff lines */}
      {!collapsed && (
        <div className="overflow-x-auto max-h-64 overflow-y-auto">
          {diffLines.map((line, i) => {
            const styles: Record<DiffLineType, string> = {
              added: 'bg-green-500/10 text-green-400 border-l-2 border-green-500/50',
              removed: 'bg-red-500/10 text-red-400 border-l-2 border-red-500/50',
              context: 'text-white/35',
              header: 'bg-blue-500/10 text-blue-400/70',
            };
            const prefix: Record<DiffLineType, string> = {
              added: '+',
              removed: '-',
              context: ' ',
              header: ' ',
            };

            return (
              <div
                key={i}
                className={`flex px-3 py-[1px] leading-5 whitespace-pre ${styles[line.type]}`}
              >
                <span className="w-4 shrink-0 select-none opacity-60 mr-2">
                  {prefix[line.type]}
                </span>
                <span className="flex-1">{line.content || ' '}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
