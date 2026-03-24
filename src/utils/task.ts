import type { Task, TimerMode } from '@/types/timeflow'

import { toDayKey, toIsoString } from './date'

export function createId(prefix = 'tf') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function createTaskPayload(payload: {
  title: string
  timerMode: TimerMode
  durationSeconds: number
  wallpaperUrl: string
  scheduledDate: string
}): Task {
  const now = toIsoString()
  return {
    id: createId('task'),
    title: payload.title.trim(),
    scheduledDate: payload.scheduledDate || toDayKey(),
    createdAt: now,
    updatedAt: now,
    timerMode: payload.timerMode,
    durationSeconds: payload.durationSeconds,
    status: 'pending',
    focusSeconds: 0,
    wallpaperUrl: payload.wallpaperUrl,
    completedAt: null
  }
}
