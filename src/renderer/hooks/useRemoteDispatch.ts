// src/renderer/hooks/useRemoteDispatch.ts
// Manages the remote dispatch HTTP server lifecycle and handles incoming messages.
// When a phone/script POSTs to the local HTTP server, main.js fires 'remote:dispatch'
// to the renderer. This hook listens, creates a new conversation, and emits a
// DOM event ('remote:sendMessage') that ChatPane's input handler picks up.

import React, { useEffect, useState, useCallback } from 'react'
import { useSettingsStore } from '../stores/settingsStore'
import { useChatStore } from '../stores/chatStore'

export interface UseRemoteDispatchReturn {
  serverIPs: string[]
  serverRunning: boolean
  startServer: () => void
  stopServer: () => void
}

export function useRemoteDispatch(): UseRemoteDispatchReturn {
  const { remoteDispatchEnabled, remoteDispatchPort } = useSettingsStore()
  const [serverRunning, setServerRunning] = useState(false)
  const [serverIPs, setServerIPs] = useState<string[]>([])

  // Create a new conversation then emit a DOM event so ChatPane can sendMessage
  const handleIncomingMessage = useCallback(async (text: string) => {
    const store = useChatStore.getState()

    // Create a fresh conversation for this remote task
    const convId = store.createConversation(`📱 ${text.slice(0, 50)}`)
    store.setActiveConversation(convId)

    // Let React re-render with the new active conversation before dispatching
    await new Promise<void>((r) => setTimeout(r, 100))

    window.dispatchEvent(
      new CustomEvent('remote:sendMessage', { detail: { text, convId } })
    )
  }, [])

  // Start/stop server when settings change
  useEffect(() => {
    const rd = window.tower?.remoteDispatch
    if (!rd) return

    if (remoteDispatchEnabled) {
      rd.start(remoteDispatchPort, '')
    } else {
      rd.stop()
      setServerRunning(false)
      setServerIPs([])
    }
  }, [remoteDispatchEnabled, remoteDispatchPort])

  // Subscribe to server lifecycle + incoming message events
  useEffect(() => {
    const rd = window.tower?.remoteDispatch
    if (!rd) return

    const cleanupStarted  = rd.onServerStarted(({ ips }) => {
      setServerRunning(true)
      setServerIPs(ips)
    })
    const cleanupError    = rd.onServerError(({ message }) => {
      console.error('[remote-dispatch]', message)
      setServerRunning(false)
    })
    const cleanupMessage  = rd.onMessage(({ text }) => {
      handleIncomingMessage(text)
    })
    // Mobile app created a new conversation — log for now, future: sync to zustand
    const cleanupNewConv  = rd.onNewConversation?.(({ id }) => {
      console.log('[remote-dispatch] Mobile created conversation:', id)
    })

    return () => {
      cleanupStarted()
      cleanupError()
      cleanupMessage()
      cleanupNewConv?.()
    }
  }, [handleIncomingMessage])

  const startServer = useCallback(() => {
    window.tower?.remoteDispatch?.start(remoteDispatchPort, '')
  }, [remoteDispatchPort])

  const stopServer = useCallback(() => {
    window.tower?.remoteDispatch?.stop()
    setServerRunning(false)
    setServerIPs([])
  }, [])

  return { serverIPs, serverRunning, startServer, stopServer }
}
