// src/renderer/hooks/useHelmSync.ts
// Subscribes to main-process cron IPC events and writes results into helmStore.
// Mount once in App.tsx — works transparently in the background.

import { useEffect } from 'react'
import { useHelmStore, type TaskResult } from '../stores/helmStore'

export function useHelmSync() {
  const { recordTaskRan, recordTaskResult } = useHelmStore()

  useEffect(() => {
    const tower = (window as any).tower
    if (!tower) return

    // cron:task-ran fires immediately when execution starts — updates lastRunAt live
    const unsubRan = tower.onCronTaskRan?.((data: { taskId: string; ranAt: number }) => {
      recordTaskRan(data.taskId, data.ranAt)
    })

    // cron:task-result fires when the Claude response finishes
    const unsubResult = tower.onCronTaskResult?.((data: {
      taskId: string
      label: string
      prompt: string
      result: string
      ranAt: number
    }) => {
      const result: TaskResult = {
        taskId: data.taskId,
        label:  data.label,
        prompt: data.prompt,
        result: data.result,
        ranAt:  data.ranAt,
      }
      recordTaskResult(result)
    })

    return () => {
      unsubRan?.()
      unsubResult?.()
    }
  }, []) // eslint-disable-line
}
