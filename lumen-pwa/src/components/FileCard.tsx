import { exportFile, getFile, type FileStub } from '../lib/api'
import { useFilesStore } from '../stores/filesStore'

function fmtBytes(v: number): string {
  if (v < 1024) return `${v} B`
  return `${(v / 1024).toFixed(1)} KB`
}

export function FileCard({ file }: { file: FileStub }) {
  const setOpenFile = useFilesStore((s) => s.setOpenFile)

  const open = async () => {
    const full = await getFile(file.id)
    setOpenFile(full)
  }

  const download = async () => {
    const raw = await exportFile(file.id)
    const blob = new Blob([raw], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = file.name
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="rounded-lg px-3 py-2 border mt-2" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
      <p className="text-[12px]" style={{ color: 'var(--color-text-primary)' }}>📄 {file.name} · {file.language} · {fmtBytes(file.sizeBytes)}</p>
      <div className="mt-1 flex items-center gap-2">
        <button type="button" className="text-[11px]" style={{ color: 'var(--color-accent)' }} onClick={() => void open()}>Open</button>
        <button type="button" className="text-[11px]" style={{ color: 'var(--color-accent)' }} onClick={() => void download()}>Download</button>
      </div>
    </div>
  )
}
