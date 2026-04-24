// Ambient fallback declarations for packages whose .d.ts files may be absent
// in partial installs (e.g. CI sandbox or fresh clone before npm install).
// These are intentionally minimal — the real types ship with the packages.

// @sentry/node v8 ships its own types; this fallback only activates when they
// are missing (partial install). Remove once a full npm install has been run.
declare module '@sentry/node' {
  export function init(options: {
    dsn?: string;
    environment?: string;
    tracesSampleRate?: number;
    [key: string]: unknown;
  }): void;
  export function captureException(err: unknown): string;
}
