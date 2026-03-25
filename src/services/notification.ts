import type { Locale, NotificationSettings } from '@/types/timeflow'

type NativeReminderActionResult = {
  errMsg?: string
}

type NativeReminderModule = {
  isAvailable?: () => boolean
  syncReminderSchedule?: (options: {
    time: string
    repeatDays: number[]
    title: string
    content: string
    success?: () => void
    fail?: (result?: NativeReminderActionResult) => void
  }) => void
  clearReminderSchedule?: (options: {
    success?: () => void
    fail?: (result?: NativeReminderActionResult) => void
  }) => void
}

let nativeReminderModuleCache: NativeReminderModule | null | undefined

function getNativeReminderModule() {
  if (nativeReminderModuleCache !== undefined) {
    return nativeReminderModuleCache
  }

  try {
    const requireNativePlugin = (uni as any).requireNativePlugin
    if (typeof requireNativePlugin !== 'function') {
      nativeReminderModuleCache = null
      return nativeReminderModuleCache
    }

    const plugin = requireNativePlugin('timeflow-local-notification') as NativeReminderModule | null
    nativeReminderModuleCache = plugin && typeof plugin === 'object' ? plugin : null
    return nativeReminderModuleCache
  } catch (error) {
    nativeReminderModuleCache = null
    return nativeReminderModuleCache
  }
}

export const NOTIFICATION_REPEAT_DAYS = [1, 2, 3, 4, 5, 6, 0] as const

const SETTINGS_DEFAULT: NotificationSettings = {
  enabled: false,
  time: '21:00',
  repeatDays: [...NOTIFICATION_REPEAT_DAYS]
}

const SCHEDULE_WINDOW_DAYS = 180
const REMINDER_TYPE = 'timeflow_recurring_reminder'

let reminderReceiveListenerBound = false
let lastReminderToken = ''
let foregroundReminderTimer: ReturnType<typeof setTimeout> | null = null
let foregroundReminderToken = ''

export class NotificationPermissionError extends Error {
  constructor() {
    super('notification-permission-denied')
    this.name = 'NotificationPermissionError'
  }
}

export class NotificationPermissionUnsupportedError extends Error {
  constructor() {
    super('notification-permission-unsupported')
    this.name = 'NotificationPermissionUnsupportedError'
  }
}

function isAppPushReady() {
  try {
    return typeof plus !== 'undefined' && !!plus.push
  } catch (error) {
    return false
  }
}

function isAndroidNativeReminderBackend() {
  try {
    return typeof plus !== 'undefined' && plus.os?.name === 'Android' && !!getNativeReminderModule()?.isAvailable?.()
  } catch (error) {
    return false
  }
}

function isNativeReady() {
  try {
    return typeof plus !== 'undefined'
  } catch (error) {
    return false
  }
}

function waitForNativeReady() {
  return new Promise<void>((resolve) => {
    if (isNativeReady()) {
      resolve()
      return
    }

    if (typeof document !== 'undefined') {
      const finish = () => resolve()
      document.addEventListener('plusready', finish, { once: true })
      setTimeout(finish, 1200)
      return
    }

    setTimeout(resolve, 0)
  })
}

function waitForPlusReady() {
  return new Promise<void>((resolve) => {
    if (isAppPushReady()) {
      resolve()
      return
    }

    if (typeof document !== 'undefined') {
      const finish = () => resolve()
      document.addEventListener('plusready', finish, { once: true })
      setTimeout(finish, 1200)
      return
    }

    setTimeout(resolve, 0)
  })
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function getAndroidNotificationManager() {
  if (typeof plus === 'undefined' || plus.os?.name !== 'Android') return null

  const main = plus.android.runtimeMainActivity()
  let NotificationManagerCompat = plus.android.importClass('androidx.core.app.NotificationManagerCompat')
  if (!NotificationManagerCompat) {
    NotificationManagerCompat = plus.android.importClass('android.support.v4.app.NotificationManagerCompat')
  }

  return NotificationManagerCompat.from(main)
}

function getAndroidSystemProperty(key: string) {
  try {
    if (typeof plus === 'undefined' || plus.os?.name !== 'Android') return ''
    const SystemProperties = plus.android.importClass('android.os.SystemProperties')
    return String(SystemProperties.get(key) || '')
  } catch (error) {
    return ''
  }
}

function isMiuiOrHyperOS() {
  try {
    if (typeof plus === 'undefined' || plus.os?.name !== 'Android') return false
    const Build = plus.android.importClass('android.os.Build')
    const manufacturer = String(Build.MANUFACTURER || '').toLowerCase()
    const brand = String(Build.BRAND || '').toLowerCase()
    if (manufacturer.includes('xiaomi') || brand.includes('xiaomi') || brand.includes('redmi')) {
      return true
    }

    return Boolean(
      getAndroidSystemProperty('ro.miui.ui.version.name') ||
      getAndroidSystemProperty('ro.mi.os.version.name') ||
      getAndroidSystemProperty('ro.mi.os.version.code')
    )
  } catch (error) {
    return false
  }
}

function hasAndroidNotificationRuntimePermission() {
  try {
    if (typeof plus === 'undefined' || plus.os?.name !== 'Android') return false
    const main = plus.android.runtimeMainActivity()
    const Build = plus.android.importClass('android.os.Build')
    const sdkInt = Number(Build.VERSION.SDK_INT || 0)

    if (sdkInt < 33) {
      return true
    }

    const PackageManager = plus.android.importClass('android.content.pm.PackageManager')
    const permission = 'android.permission.POST_NOTIFICATIONS'

    if (typeof main.checkSelfPermission === 'function') {
      return Number(main.checkSelfPermission(permission)) === Number(PackageManager.PERMISSION_GRANTED)
    }

    return Number(PackageManager.checkPermission(permission, main.getPackageName())) === Number(PackageManager.PERMISSION_GRANTED)
  } catch (error) {
    return false
  }
}

function areAndroidNotificationsEnabled() {
  try {
    const manager = getAndroidNotificationManager()
    const enabled = !!manager?.areNotificationsEnabled()
    if (enabled) {
      return true
    }

    // Some Android ROMs, including HyperOS and occasionally stock Android flows,
    // may lag when reflecting the notification toggle immediately after grant.
    // Fallback to the Android 13+ runtime permission state to avoid false negatives.
    if (hasAndroidNotificationRuntimePermission()) {
      return true
    }

    return false
  } catch (error) {
    return false
  }
}

function getAndroidPackageName() {
  try {
    if (typeof plus === 'undefined' || plus.os?.name !== 'Android') return ''
    const main = plus.android.runtimeMainActivity()
    return String(main?.getPackageName?.() || '')
  } catch (error) {
    return ''
  }
}

export function isHBuilderDebugBase() {
  const packageName = getAndroidPackageName()
  return packageName === 'io.dcloud.HBuilder' || packageName.startsWith('io.dcloud.')
}

function pad(value: number) {
  return `${value}`.padStart(2, '0')
}

function normalizeTime(input?: string) {
  if (!input || !/^\d{2}:\d{2}$/.test(input)) return SETTINGS_DEFAULT.time
  const [hours, minutes] = input.split(':').map(Number)
  const safeHours = Math.min(23, Math.max(0, hours))
  const safeMinutes = Math.min(59, Math.max(0, minutes))
  return `${pad(safeHours)}:${pad(safeMinutes)}`
}

export function normalizeNotificationRepeatDays(input?: number[]) {
  const unique = Array.from(new Set((input || []).filter((value) => Number.isInteger(value) && value >= 0 && value <= 6)))
  const ordered = NOTIFICATION_REPEAT_DAYS.filter((value) => unique.includes(value))
  return ordered.length ? ordered : [...NOTIFICATION_REPEAT_DAYS]
}

function buildScheduleDates(time: string, repeatDays: number[]) {
  const [hours, minutes] = normalizeTime(time).split(':').map(Number)
  const now = new Date()
  const normalizedRepeatDays = normalizeNotificationRepeatDays(repeatDays)
  const dates: Date[] = []

  for (let offset = 0; offset < SCHEDULE_WINDOW_DAYS; offset += 1) {
    const target = new Date(now)
    target.setDate(now.getDate() + offset)

    if (!normalizedRepeatDays.includes(target.getDay())) {
      continue
    }

    target.setHours(hours, minutes, 0, 0)

    const isCurrentMinute =
      offset === 0 && hours === now.getHours() && minutes === now.getMinutes()

    if (isCurrentMinute) {
      target.setTime(now.getTime() + 5000)
    }

    if (target.getTime() <= now.getTime()) {
      continue
    }

    dates.push(target)
  }

  return dates
}

function buildScheduleMinuteToken(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}-${pad(date.getMinutes())}`
}

function nextForegroundTriggerDate(time: string, repeatDays: number[], skipToken = '') {
  const dates = buildScheduleDates(time, repeatDays)
  return dates.find((item) => buildScheduleMinuteToken(item) !== skipToken) || null
}

function reminderCopy(locale: Locale) {
  if (locale === 'en') {
    return {
      title: 'TimeFlow Reminder',
      content: 'Take a moment to review today and keep your focus streak going.'
    }
  }

  return {
    title: '时光自律提醒',
    content: '今晚记得回顾今天的计划，也别忘了给明天留出专注时间。'
  }
}

function parseReminderPayload(message: Record<string, any> | undefined | null, locale: Locale) {
  if (!message) return null

  const rawPayload = typeof message.payload === 'string' ? message.payload : ''
  let parsedPayload: Record<string, any> = {}

  if (rawPayload) {
    try {
      parsedPayload = JSON.parse(rawPayload)
    } catch (error) {
      parsedPayload = {}
    }
  } else if (message.payload && typeof message.payload === 'object') {
    parsedPayload = message.payload
  }

  if (parsedPayload.type !== REMINDER_TYPE) {
    return null
  }

  const fallbackCopy = reminderCopy(locale)
  const title = message.title || parsedPayload.title || fallbackCopy.title
  const content = message.content || parsedPayload.content || fallbackCopy.content
  const token = `${parsedPayload.scheduleId || parsedPayload.at || content}:${title}`

  return {
    token,
    title,
    content,
    at: parsedPayload.at || ''
  }
}

function openNotificationSettings() {
  if (typeof plus === 'undefined') return

  if (plus.os?.name === 'iOS') {
    try {
      plus.runtime.openURL('app-settings:')
      return
    } catch (error) {
      console.warn('open ios notification settings skipped', error)
      return
    }
  }

  if (plus.os?.name !== 'Android') return

  try {
    const main = plus.android.runtimeMainActivity()
    const Intent = plus.android.importClass('android.content.Intent')
    const Settings = plus.android.importClass('android.provider.Settings')

    const intent = new Intent()
    intent.setAction(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
    intent.putExtra('android.provider.extra.APP_PACKAGE', main.getPackageName())
    intent.putExtra('app_package', main.getPackageName())
    intent.putExtra('app_uid', main.getApplicationInfo().uid)
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    main.startActivity(intent)
  } catch (error) {
    try {
      const main = plus.android.runtimeMainActivity()
      const Intent = plus.android.importClass('android.content.Intent')
      const Settings = plus.android.importClass('android.provider.Settings')
      const Uri = plus.android.importClass('android.net.Uri')
      const intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
      intent.setData(Uri.parse(`package:${main.getPackageName()}`))
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      main.startActivity(intent)
    } catch (fallbackError) {
      console.warn('open notification settings skipped', fallbackError)
    }
  }
}

async function requestNotificationPermission(options?: { openSettingsOnFail?: boolean }) {
  if (typeof plus === 'undefined') return false
  const openSettingsOnFail = options?.openSettingsOnFail ?? false

  if (plus.os?.name === 'Android') {
    try {
      const Build = plus.android.importClass('android.os.Build')
      const main = plus.android.runtimeMainActivity()

      if (areAndroidNotificationsEnabled()) {
        return true
      }

      const sdkInt = Number(Build.VERSION.SDK_INT || 0)
      if (sdkInt < 33) {
        if (openSettingsOnFail) {
          openNotificationSettings()
        }
        return false
      }

      return await new Promise<boolean>((resolve) => {
        plus.android.requestPermissions(
          ['android.permission.POST_NOTIFICATIONS'],
          async () => {
            await delay(180)
            const enabled = areAndroidNotificationsEnabled()
            if (!enabled && openSettingsOnFail) {
              openNotificationSettings()
            }
            resolve(enabled)
          },
          () => {
            if (openSettingsOnFail) {
              openNotificationSettings()
            }
            resolve(false)
          }
        )
      })
    } catch (error) {
      return false
    }
  }

  if (typeof uni.getPushClientId !== 'function') return true

  return new Promise<boolean>((resolve) => {
    if (typeof plus !== 'undefined' && plus.push?.getClientInfoAsync) {
      plus.push.getClientInfoAsync(
        () => resolve(true),
        () => {
          if (openSettingsOnFail) {
            openNotificationSettings()
          }
          resolve(false)
        }
      )
      return
    }

    uni.getPushClientId({
      success: () => resolve(true),
      fail: () => {
        if (openSettingsOnFail) {
          openNotificationSettings()
        }
        resolve(false)
      }
    })
  })
}

export async function hasNotificationPermission() {
  await waitForNativeReady()

  if (typeof plus === 'undefined') return false

  if (plus.os?.name === 'Android') {
    return areAndroidNotificationsEnabled()
  }

  if (!isAppPushReady()) return false

  return new Promise<boolean>((resolve) => {
    if (plus.push?.getClientInfoAsync) {
      plus.push.getClientInfoAsync(
        (result) => resolve(!!(result?.clientid || result?.token || result?.id)),
        () => resolve(false)
      )
      return
    }

    try {
      const client = plus.push?.getClientInfo?.()
      resolve(!!(client?.clientid || client?.token || client?.id))
    } catch (error) {
      resolve(false)
    }
  })
}

export async function ensureNotificationPermission(options?: { openSettingsOnFail?: boolean }) {
  await waitForNativeReady()

  if (typeof plus === 'undefined') return false

  if (isHBuilderDebugBase() && plus.os?.name === 'Android') {
    const granted = areAndroidNotificationsEnabled()
    if (!granted && (options?.openSettingsOnFail ?? false)) {
      openNotificationSettings()
    }
    if (!granted) {
      throw new NotificationPermissionError()
    }
    return true
  }

  if (plus.os?.name !== 'Android' && !isAppPushReady()) return false

  const granted = await requestNotificationPermission(options)
  if (!granted) {
    throw new NotificationPermissionError()
  }

  return true
}

function clearLegacyPushMessages() {
  if (!isAppPushReady()) return

  try {
    plus.push.clear()
  } catch (error) {
    console.debug('clear legacy push messages skipped', error)
  }
}

function syncAndroidNativeReminderSchedule(
  settings: NotificationSettings,
  locale: Locale
) {
  return new Promise<void>((resolve, reject) => {
    const copy = reminderCopy(locale)

    getNativeReminderModule()?.syncReminderSchedule?.({
      time: normalizeTime(settings.time),
      repeatDays: normalizeNotificationRepeatDays(settings.repeatDays),
      title: copy.title,
      content: copy.content,
      success: () => resolve(),
      fail: (result) => reject(new Error(result?.errMsg || 'syncReminderSchedule failed'))
    })
  })
}

function clearAndroidNativeReminderSchedule() {
  return new Promise<void>((resolve, reject) => {
    getNativeReminderModule()?.clearReminderSchedule?.({
      success: () => resolve(),
      fail: (result) => reject(new Error(result?.errMsg || 'clearReminderSchedule failed'))
    })
  })
}

export async function syncDailyNotifications(settings: NotificationSettings, locale: Locale) {
  await waitForNativeReady()

  if (isAndroidNativeReminderBackend()) {
    clearLegacyPushMessages()

    if (!settings.enabled) {
      await clearAndroidNativeReminderSchedule()
      return
    }

    await ensureNotificationPermission()
    await syncAndroidNativeReminderSchedule(settings, locale)
    return
  }

  await waitForPlusReady()

  if (!isAppPushReady()) return

  clearLegacyPushMessages()

  if (!settings.enabled) return

  await ensureNotificationPermission()

  try {
    plus.push.setAutoNotification(true)
  } catch (error) {
    console.debug('set auto notification skipped', error)
  }

  const copy = reminderCopy(locale)
  const normalizedTime = normalizeTime(settings.time)
  const scheduleDates = buildScheduleDates(normalizedTime, settings.repeatDays)

  for (const triggerAt of scheduleDates) {
    const delaySeconds = Math.max(0, Math.round((triggerAt.getTime() - Date.now()) / 1000))
    const scheduleId = `${triggerAt.getFullYear()}-${pad(triggerAt.getMonth() + 1)}-${pad(triggerAt.getDate())}-${pad(triggerAt.getHours())}-${pad(triggerAt.getMinutes())}`

    try {
      plus.push.createMessage(
        copy.content,
        JSON.stringify({
          type: REMINDER_TYPE,
          at: triggerAt.toISOString(),
          scheduleId,
          title: copy.title,
          content: copy.content
        }),
        {
          appid: plus.runtime.appid,
          title: copy.title,
          cover: false,
          sound: 'system',
          delay: delaySeconds
        }
      )
    } catch (error) {
      return
    }
  }
}

export async function registerForegroundReminderListener(
  getLocale: () => Locale,
  onReceive: (payload: { title: string; content: string; at: string }) => void
) {
  await waitForNativeReady()

  if (isAndroidNativeReminderBackend()) return

  await waitForPlusReady()

  if (!isAppPushReady() || reminderReceiveListenerBound) return

  plus.push.addEventListener(
    'receive',
    (message: Record<string, any>) => {
      const payload = parseReminderPayload(message, getLocale())
      if (!payload || payload.token === lastReminderToken) return
      lastReminderToken = payload.token
      onReceive({
        title: payload.title,
        content: payload.content,
        at: payload.at
      })
    },
    false
  )

  reminderReceiveListenerBound = true
}

export function stopForegroundReminderLoop() {
  if (foregroundReminderTimer) {
    clearTimeout(foregroundReminderTimer)
    foregroundReminderTimer = null
  }
}

export function usesNativeForegroundReminderLoop() {
  return isAndroidNativeReminderBackend()
}

export function startForegroundReminderLoop(
  settings: NotificationSettings,
  locale: Locale,
  onTrigger: (payload: { title: string; content: string; at: string }) => void
) {
  stopForegroundReminderLoop()

  if (!settings.enabled) return

  const nextTrigger = nextForegroundTriggerDate(settings.time, settings.repeatDays, foregroundReminderToken)
  if (!nextTrigger) return

  const delay = Math.max(0, nextTrigger.getTime() - Date.now())

  foregroundReminderTimer = setTimeout(() => {
    const copy = reminderCopy(locale)
    const token = buildScheduleMinuteToken(nextTrigger)

    if (token !== foregroundReminderToken) {
      foregroundReminderToken = token
      onTrigger({
        title: copy.title,
        content: copy.content,
        at: nextTrigger.toISOString()
      })
    }

    startForegroundReminderLoop(settings, locale, onTrigger)
  }, delay)
}

export function getDefaultNotificationSettings() {
  return {
    enabled: SETTINGS_DEFAULT.enabled,
    time: SETTINGS_DEFAULT.time,
    repeatDays: [...SETTINGS_DEFAULT.repeatDays]
  }
}
