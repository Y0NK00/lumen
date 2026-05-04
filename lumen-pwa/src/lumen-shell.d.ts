/** Exposed from `electron-preload.cjs` when running the Electron desktop shell. */
export interface LumenShell {
  readonly isElectron: true
  minimize(): void
  toggleMaximize(): void
  close(): void
}

declare global {
  interface Window {
    lumenShell?: LumenShell
  }
}

export {}
