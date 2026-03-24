import type { Locale, NotificationSettings } from '@/types/timeflow'

const SETTINGS_DEFAULT: NotificationSettings = {
  enabled: false,
  time: '21:00'
}

const SERIES_DAYS = 30

function isAppPushReady() {
  try {
    return typeof plus !== 'undefined' && !!plus.push
  } catch (error) {
    return false
  }
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

function nextTriggerDate(time: string, offsetDays = 0) {
  const [hours, minutes] = normalizeTime(time).split(':').map(Number)
  const now = new Date()
  const target = new Date()
  target.setHours(hours, minutes, 0, 0)

  const isSameMinute =
    offsetDays === 0 && hours === now.getHours() && minutes === now.getMinutes()

  // If the user picks the current minute, treat it as an immediate test reminder.
  if (isSameMinute) {
    target.setTime(now.getTime() + 5000)
  } else if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1)
  }

  if (offsetDays > 0) {
    target.setDate(target.getDate() + offsetDays)
  }

  return target
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

function openNotificationSettings() {
  if (typeof plus === 'undefined' || plus.os?.name !== 'Android') return

  try {
    const main = plus.android.runtimeMainActivity()
    const Intent = plus.android.importClass('android.content.Intent')
    const Settings = plus.android.importClass('android.provider.Settings')
    const Uri = plus.android.importClass('android.net.Uri')

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

async function requestNotificationPermission() {
  if (typeof plus === 'undefined') return false

  if (plus.os?.name === 'Android') {
    try {
      const main = plus.android.runtimeMainActivity()
      const Build = plus.android.importClass('android.os.Build')
      let NotificationManagerCompat = plus.android.importClass('androidx.core.app.NotificationManagerCompat')
      if (!NotificationManagerCompat) {
        NotificationManagerCompat = plus.android.importClass('android.support.v4.app.NotificationManagerCompat')
      }
      const manager = NotificationManagerCompat.from(main)
      plus.android.importClass(manager)

      if (manager.areNotificationsEnabled()) {
        return true
      }

      const sdkInt = Number(Build.VERSION.SDK_INT || 0)
      if (sdkInt < 33) {
        openNotificationSettings()
        return false
      }

      return await new Promise<boolean>((resolve) => {
        plus.android.requestPermissions(
          ['android.permission.POST_NOTIFICATIONS'],
          () => {
            try {
              const enabled = manager.areNotificationsEnabled()
              if (!enabled) {
                openNotificationSettings()
              }
              resolve(enabled)
            } catch (error) {
              resolve(false)
            }
          },
          () => {
            openNotificationSettings()
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
    uni.getPushClientId({
      success: () => resolve(true),
      fail: () => resolve(false)
    })
  })
}

export async function syncDailyNotifications(settings: NotificationSettings, locale: Locale) {
  await waitForPlusReady()

  if (!isAppPushReady()) return

  try {
    plus.push.clear()
  } catch (error) {
    return
  }

  if (!settings.enabled) return

  const granted = await requestNotificationPermission()
  if (!granted) {
    throw new Error('notification-permission-denied')
  }

  const copy = reminderCopy(locale)
  const normalizedTime = normalizeTime(settings.time)

  for (let day = 0; day < SERIES_DAYS; day += 1) {
    const triggerAt = nextTriggerDate(normalizedTime, day)
    const delaySeconds = Math.max(0, Math.round((triggerAt.getTime() - Date.now()) / 1000))

    try {
      plus.push.createMessage(
        copy.content,
        JSON.stringify({
          type: 'timeflow_daily_reminder',
          dayOffset: day,
          at: triggerAt.toISOString()
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

export function getDefaultNotificationSettings() {
  return SETTINGS_DEFAULT
}
