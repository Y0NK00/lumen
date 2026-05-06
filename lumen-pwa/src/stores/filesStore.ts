import { create } from 'zustand'
import type { FileStub, LumenFile } from '../lib/api'

interface FilesState {
  files: FileStub[]
  openFile: LumenFile | null
  editorDirty: boolean
  setFiles: (files: FileStub[]) => void
  setOpenFile: (file: LumenFile | null) => void
  setEditorDirty: (dirty: boolean) => void
  updateStub: (file: FileStub) => void
  removeFile: (id: string) => void
}

export const useFilesStore = create<FilesState>((set) => ({
  files: [],
  openFile: null,
  editorDirty: false,
  setFiles: (files) => set({ files }),
  setOpenFile: (file) => set({ openFile: file, editorDirty: false }),
  setEditorDirty: (editorDirty) => set({ editorDirty }),
  updateStub: (file) =>
    set((s) => {
      const idx = s.files.findIndex((f) => f.id === file.id)
      if (idx === -1) return { files: [file, ...s.files] }
      const next = [...s.files]
      next[idx] = file
      return { files: next }
    }),
  removeFile: (id) => set((s) => ({ files: s.files.filter((f) => f.id !== id) })),
}))
