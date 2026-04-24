// src/renderer/components/ThinkingBlock.tsx
// Collapsible display for Claude's extended thinking content.
// Usage: Render this ABOVE the assistant message bubble when thinking content is detected.

import React, { useState } from 'react';

interface ThinkingBlockProps {
  content: string;
  durationMs?: number; // optional: show how long Claude thought
}

export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({ content, durationMs }) => {
  const [expanded, setExpanded] = useState(false);

  const wordCount = content.trim().split(/\s+/).length;
  const label = durationMs
    ? `Thought for ${(durationMs / 1000).toFixed(1)}s`
    : `${wordCount} words of reasoning`;

  return (
    <div className="mb-2 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-amber-400/5 transition-colors"
        aria-expanded={expanded}
      >
        {/* Animated thinking dot when not expanded */}
        {!expanded ? (
          <span className="flex gap-0.5 items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400/60 animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400/60 animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400/60 animate-bounce [animation-delay:300ms]" />
          </span>
        ) : (
          <span className="text-amber-400/60 text-xs">▼</span>
        )}

        <span className="text-xs font-medium text-amber-400/60 tracking-wide">
          Thinking
        </span>

        <span className="text-xs text-amber-400/35 ml-1">{label}</span>

        <span className="ml-auto text-xs text-amber-400/30">
          {expanded ? 'collapse' : 'show'}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-amber-400/10 px-4 pb-4 pt-3">
          <pre className="text-xs text-amber-300/45 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY: Extract thinking content from a raw assistant message string.
// Claude sometimes wraps thinking in <thinking>...</thinking> tags.
// Returns { thinking: string | null, mainContent: string }
// ─────────────────────────────────────────────────────────────────────────────
export function extractThinkingFromMessage(raw: string): {
  thinking: string | null;
  mainContent: string;
} {
  const thinkingMatch = raw.match(/^<thinking>([\s\S]*?)<\/thinking>\s*/);
  if (thinkingMatch) {
    return {
      thinking: thinkingMatch[1].trim(),
      mainContent: raw.slice(thinkingMatch[0].length).trim(),
    };
  }
  return { thinking: null, mainContent: raw };
}
