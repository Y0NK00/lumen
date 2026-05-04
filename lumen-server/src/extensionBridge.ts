/**
 * Chrome "Lumen Browser" extension bridge — same protocol as legacy Electron main.js.
 * Extension connects to ws://localhost:EXTENSION_WS_PORT (default 7745); Fastify API stays on PORT.
 */
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { logger } from './lib/logger.js';

const EXTENSION_WS_PORT = Number(process.env.EXTENSION_WS_PORT) || 7745;

let extensionSocket: WebSocket | null = null;
const pendingBrowserCommands = new Map<
  string,
  { resolve: (v: unknown) => void; reject: (e: Error) => void }
>();

export function startExtensionBridge(): void {
  const wss = new WebSocketServer({ port: EXTENSION_WS_PORT });

  wss.on('listening', () => {
    logger.info({ port: EXTENSION_WS_PORT }, 'browser-extension WebSocket listening');
  });

  wss.on('connection', (socket) => {
    logger.info('browser-extension connected');
    extensionSocket = socket;

    socket.on('message', (data) => {
      let message: unknown;
      try {
        message = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (!message || typeof message !== 'object') return;
      const m = message as Record<string, unknown>;

      if (m.type === 'hello') {
        logger.info({ source: m.source }, 'browser-extension hello');
        return;
      }

      const id = m.id as string | undefined;
      if (!id) return;
      const pending = pendingBrowserCommands.get(id);
      if (!pending) return;
      pendingBrowserCommands.delete(id);

      if (m.success) pending.resolve(m.result);
      else pending.reject(new Error((m.error as string) ?? 'Browser command failed'));
    });

    socket.on('close', () => {
      logger.info('browser-extension disconnected');
      if (extensionSocket === socket) extensionSocket = null;
      for (const [cmdId, p] of pendingBrowserCommands) {
        pendingBrowserCommands.delete(cmdId);
        p.reject(new Error('Browser extension disconnected'));
      }
    });

    socket.on('error', (err) => {
      logger.warn({ err: (err as Error).message }, 'browser-extension socket error');
    });
  });

  wss.on('error', (err) => {
    logger.error({ err: (err as Error).message, port: EXTENSION_WS_PORT }, 'browser-extension WebSocketServer error');
  });
}

export function isExtensionSocketReady(): boolean {
  return extensionSocket !== null && extensionSocket.readyState === 1;
}

/** Send a command to the extension; resolves with `result` or rejects on error / disconnect / timeout. */
export function executeExtensionCommand(
  command: string,
  payload: Record<string, unknown> = {},
  timeoutMs = 30_000,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!extensionSocket || extensionSocket.readyState !== 1) {
      reject(
        new Error(
          'Browser extension not connected. Install the Lumen Browser extension in Chrome and start lumen-server.',
        ),
      );
      return;
    }

    const id = randomUUID();
    const timer = setTimeout(() => {
      pendingBrowserCommands.delete(id);
      reject(new Error(`Browser command timed out after ${timeoutMs / 1000}s: ${command}`));
    }, timeoutMs);

    pendingBrowserCommands.set(id, {
      resolve: (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });

    extensionSocket.send(JSON.stringify({ id, command, payload }));
  });
}
