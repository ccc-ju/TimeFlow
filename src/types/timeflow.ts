export type TimerMode = 'countup' | 'countdown' | 'notimer'
export type TaskStatus = 'pending' | 'done'
export type ThemeMode = 'light' | 'dark' | 'system'
export type Locale = 'zh-CN' | 'en'

export interface NotificationSettings {
  enabled: boolean
  time: string
  repeatDays: number[]
}

export interface WallpaperPayload {
  date: string
  url: string
  title: string
  sourceDate?: string
}

export interface Task {
  id: string
  title: string
  scheduledDate: string
  createdAt: string
  updatedAt: string
  timerMode: TimerMode
  durationSeconds: number
  status: TaskStatus
  focusSeconds: number
  wallpaperUrl: string
  completedAt: string | null
}

export interface FocusSession {
  id: string
  taskId: string
  sessionDate: string
  startedAt: string
  endedAt: string
  seconds: number
  mode: TimerMode
}

export interface ActiveTaskTimer {
  taskId: string
  startedAt: string
  startedFocusSeconds: number
  timerMode: Exclude<TimerMode, 'notimer'>
  durationSeconds: number
}

export interface DailyStats {
  totalPlanned: number
  completedCount: number
  totalFocusMinutes: number
}

export interface MonthCell {
  dayKey: string
  label: number
  currentMonth: boolean
  isToday: boolean
}
