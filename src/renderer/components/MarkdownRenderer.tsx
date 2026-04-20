// src/renderer/components/MarkdownRenderer.tsx
// Full markdown renderer with GFM tables, code highlighting, and artifacts support.
// Requires: npm install react-markdown remark-gfm

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';

interface MarkdownRendererProps {
  content: string;
  onOpenInArtifacts?: (code: string, language: string) => void;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  onOpenInArtifacts,
}) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // ── Code blocks ──────────────────────────────────────────────────
        code({ node, inline, className, children, ...props }: any) {
          const match = /language-(\w+)/.exec(className || '');
          const language = match ? match[1] : 'text';
          const code = String(children).replace(/\n$/, '');

          if (!inline && code.includes('\n')) {
            return (
              <CodeBlock
                code={code}
                language={language}
                onOpenInArtifacts={onOpenInArtifacts}
              />
            );
          }

          // Inline code
          return (
            <code
              className="bg-white/10 rounded-md px-1.5 py-0.5 text-[0.82em] font-mono text-sky-300 border border-white/10"
              {...props}
            >
              {children}
            </code>
          );
        },

        // ── Tables ────────────────────────────────────────────────────────
        table({ children }) {
          return (
            <div className="overflow-x-auto my-4 rounded-lg border border-white/10">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          );
        },
        thead({ children }) {
          return <thead className="bg-white/5">{children}</thead>;
        },
        th({ children }) {
          return (
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-white/70 uppercase tracking-wider border-b border-white/10">
              {children}
            </th>
          );
        },
        td({ children }) {
          return (
            <td className="px-4 py-2.5 text-white/65 border-b border-white/5 text-sm">
              {children}
            </td>
          );
        },
        tr({ children }) {
          return (
            <tr className="hover:bg-white/[0.03] transition-colors">{children}</tr>
          );
        },

        // ── Blockquote ────────────────────────────────────────────────────
        blockquote({ children }) {
          return (
            <blockquote className="border-l-[3px] border-blue-400/50 pl-4 py-1 my-3 bg-blue-400/5 rounded-r-lg">
              <div className="text-white/55 italic">{children}</div>
            </blockquote>
          );
        },

        // ── Headings ─────────────────────────────────────────────────────
        h1({ children }) {
          return (
            <h1 className="text-2xl font-bold text-white mt-6 mb-3 pb-2 border-b border-white/10">
              {children}
            </h1>
          );
        },
        h2({ children }) {
          return (
            <h2 className="text-xl font-semibold text-white mt-5 mb-2">{children}</h2>
          );
        },
        h3({ children }) {
          return (
            <h3 className="text-base font-semibold text-white/90 mt-4 mb-1.5">{children}</h3>
          );
        },
        h4({ children }) {
          return (
            <h4 className="text-sm font-semibold text-white/80 mt-3 mb-1">{children}</h4>
          );
        },

        // ── Text ──────────────────────────────────────────────────────────
        p({ children }) {
          return (
            <p className="text-white/80 leading-7 mb-3 text-[0.925rem] break-words">{children}</p>
          );
        },

        // ── Lists ─────────────────────────────────────────────────────────
        ul({ children }) {
          return (
            <ul className="space-y-1 mb-3 pl-5 text-white/80 text-[0.925rem]">
              {children}
            </ul>
          );
        },
        ol({ children }) {
          return (
            <ol className="list-decimal space-y-1 mb-3 pl-5 text-white/80 text-[0.925rem]">
              {children}
            </ol>
          );
        },
        li({ children }) {
          return (
            <li className="text-white/80 leading-6 marker:text-white/30 break-words">{children}</li>
          );
        },

        // ── Misc ──────────────────────────────────────────────────────────
        a({ href, children }) {
          return (
            <a
              href={href}
              className="text-blue-400 hover:text-blue-300 underline decoration-blue-400/40 underline-offset-2 transition-colors"
              target="_blank"
              rel="noreferrer"
            >
              {children}
            </a>
          );
        },
        hr() {
          return <hr className="border-white/15 my-5" />;
        },
        strong({ children }) {
          return <strong className="font-semibold text-white">{children}</strong>;
        },
        em({ children }) {
          return <em className="italic text-white/65">{children}</em>;
        },
        del({ children }) {
          return <del className="line-through text-white/40">{children}</del>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
};
