import type { MonthCell } from '@/types/timeflow'

const weekMs = 24 * 60 * 60 * 1000
const zhWeekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const enWeekdaysShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const enWeekdaysLong = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const zhMonthsLong = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
const enMonthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const enMonthsLong = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function supportsIntl() {
  return typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function'
}

function isEnglish(locale: string) {
  return locale.toLowerCase().startsWith('en')
}

export function pad(value: number) {
  return `${value}`.padStart(2, '0')
}

export function toDayKey(input: Date | string | number = new Date()) {
  const date = typeof input === 'string' || typeof input === 'number' ? new Date(input) : input
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function toIsoString(date = new Date()) {
  return date.toISOString()
}

export function formatMonthLabel(dayKey: string, locale: string) {
  const date = new Date(`${dayKey}T00:00:00`)
  if (supportsIntl()) {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'long'
    }).format(date)
  }

  if (isEnglish(locale)) {
    return `${enMonthsLong[date.getMonth()]} ${date.getFullYear()}`
  }

  return `${date.getFullYear()}年${zhMonthsLong[date.getMonth()]}`
}

export function formatFullDate(dayKey: string, locale: string) {
  const date = new Date(`${dayKey}T00:00:00`)
  if (supportsIntl()) {
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      weekday: 'short'
    }).format(date)
  }

  if (isEnglish(locale)) {
    return `${enWeekdaysShort[date.getDay()]}, ${enMonthsShort[date.getMonth()]} ${date.getDate()}`
  }

  return `${zhMonthsLong[date.getMonth()]}${date.getDate()}日 ${zhWeekdays[date.getDay()]}`
}

export function formatHeaderDate(date = new Date(), locale = 'zh-CN') {
  if (supportsIntl()) {
    return new Intl.DateTimeFormat(locale, {
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    }).format(date)
  }

  if (isEnglish(locale)) {
    return `${enWeekdaysLong[date.getDay()]}, ${enMonthsLong[date.getMonth()]} ${date.getDate()}`
  }

  return `${zhMonthsLong[date.getMonth()]}${date.getDate()}日 ${zhWeekdays[date.getDay()]}`
}

export function formatClock(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

export function formatFocusMinutes(totalSeconds: number) {
  return Math.round(totalSeconds / 60)
}

export function getWeekKeys(reference = new Date()) {
  return Array.from({ length: 7 }, (_, index) => {
    const value = new Date(reference.getTime() - (6 - index) * weekMs)
    return toDayKey(value)
  })
}

export function createMonthGrid(dayKey: string): MonthCell[] {
  const focusDate = new Date(`${dayKey}T00:00:00`)
  const monthStart = new Date(focusDate.getFullYear(), focusDate.getMonth(), 1)
  const gridStart = new Date(monthStart)
  gridStart.setDate(monthStart.getDate() - monthStart.getDay())

  return Array.from({ length: 42 }, (_, index) => {
    const cellDate = new Date(gridStart)
    cellDate.setDate(gridStart.getDate() + index)
    return {
      dayKey: toDayKey(cellDate),
      label: cellDate.getDate(),
      currentMonth: cellDate.getMonth() === focusDate.getMonth(),
      isToday: toDayKey(cellDate) === toDayKey()
    }
  })
}

export function shiftMonth(dayKey: string, offset: number) {
  const date = new Date(`${dayKey}T00:00:00`)
  date.setMonth(date.getMonth() + offset)
  return toDayKey(new Date(date.getFullYear(), date.getMonth(), 1))
}
