import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { useState } from 'react'

interface MarkdownRendererProps {
  content: string
  isStreaming?: boolean
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1800)
        })
      }}
      className="text-[11px] text-text-muted hover:text-text-primary transition-colors px-2 py-0.5 rounded"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

export function MarkdownRenderer({ content, isStreaming }: MarkdownRendererProps) {
  return (
    <div className={`prose-lumen text-[14px] leading-[1.7] text-text-primary ${isStreaming ? 'streaming-cursor' : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          code({ className, children, ...props }) {
            const isBlock = className?.startsWith('language-')
            const lang = className?.replace('language-', '') ?? ''
            const codeText = String(children).replace(/\n$/, '')

            if (!isBlock) {
              return (
                <code
                  className="px-[5px] py-[2px] rounded-md text-[13px] font-mono bg-code-inline text-text-primary"
                  {...props}
                >
                  {children}
                </code>
              )
            }

            return (
              <div className="rounded-xl overflow-hidden border border-border my-3 text-[13px]">
                <div className="flex items-center justify-between px-4 py-1.5 bg-code-header border-b border-border">
                  <span className="text-[11px] text-text-muted font-mono">{lang || 'code'}</span>
                  <CopyButton text={codeText} />
                </div>
                <div className="bg-code-bg overflow-x-auto">
                  <pre className="p-4 m-0">
                    <code className={`${className} font-mono`} {...props}>{children}</code>
                  </pre>
                </div>
              </div>
            )
          },
          p({ children }) {
            return <p className="mb-3 last:mb-0 text-text-primary">{children}</p>
          },
          ul({ children }) {
            return <ul className="list-disc pl-5 mb-3 space-y-1 text-text-primary">{children}</ul>
          },
          ol({ children }) {
            return <ol className="list-decimal pl-5 mb-3 space-y-1 text-text-primary">{children}</ol>
          },
          li({ children }) {
            return <li className="text-text-primary">{children}</li>
          },
          h1({ children }) {
            return <h1 className="text-[18px] font-semibold text-text-primary mt-4 mb-2">{children}</h1>
          },
          h2({ children }) {
            return <h2 className="text-[16px] font-semibold text-text-primary mt-3 mb-1.5">{children}</h2>
          },
          h3({ children }) {
            return <h3 className="text-[14px] font-semibold text-text-primary mt-2 mb-1">{children}</h3>
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-2 border-accent/40 pl-3.5 text-text-secondary my-3 italic">
                {children}
              </blockquote>
            )
          },
          a({ href, children }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer"
                className="text-accent hover:underline underline-offset-2">
                {children}
              </a>
            )
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-3">
                <table className="text-[13px] border-collapse w-full">{children}</table>
              </div>
            )
          },
          th({ children }) {
            return <th className="border border-border px-3 py-1.5 text-left font-medium bg-surface text-text-primary">{children}</th>
          },
          td({ children }) {
            return <td className="border border-border px-3 py-1.5 text-text-secondary">{children}</td>
          },
          hr() {
            return <hr className="border-border my-4" />
          },
          strong({ children }) {
            return <strong className="font-semibold text-text-primary">{children}</strong>
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
