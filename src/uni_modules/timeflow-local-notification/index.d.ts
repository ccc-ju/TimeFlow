export interface ReminderActionResult {
  errMsg: string
  backend: string
  scheduledCount: number
}

export interface ReminderActionOptions {
  success?: (res: ReminderActionResult) => void
  fail?: (res: ReminderActionResult) => void
  complete?: (res: ReminderActionResult) => void
}

export interface ReminderScheduleOptions extends ReminderActionOptions {
  time: string
  repeatDays: number[]
  title: string
  content: string
}

export function isAvailable(): boolean
export function syncReminderSchedule(options: ReminderScheduleOptions): void
export function clearReminderSchedule(options?: ReminderActionOptions): void
