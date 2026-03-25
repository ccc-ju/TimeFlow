import { defineStore } from 'pinia'

import { messages } from '@/constants/i18n'
import {
  ensureNotificationPermission,
  getDefaultNotificationSettings,
  hasNotificationPermission,
  isHBuilderDebugBase,
  normalizeNotificationRepeatDays,
  NotificationPermissionError,
  syncDailyNotifications
} from '@/services/notification'
import { fetchDailyWallpaper, DEFAULT_WALLPAPER } from '@/services/bing'
import { getSetting, initDatabase, setSetting } from '@/services/sqlite'
import type { Locale, NotificationSettings, ThemeMode, WallpaperPayload } from '@/types/timeflow'
import { toDayKey } from '@/utils/date'

let mediaQueryCleanup: (() => void) | null = null
let reminderBannerTimer: ReturnType<typeof setTimeout> | null = null
const NOTIFICATION_PERMISSION_PROMPT_VERSION = '2026-03-25-1'

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function parseStoredRepeatDays(raw: string | null | undefined) {
  if (!raw) return getDefaultNotificationSettings().repeatDays

  try {
    return normalizeNotificationRepeatDays(JSON.parse(raw))
  } catch (error) {
    return getDefaultNotificationSettings().repeatDays
  }
}

function isNotificationPermissionError(error: unknown) {
  return error instanceof NotificationPermissionError || (error instanceof Error && error.message === 'notification-permission-denied')
}

function getSystemTheme(): 'light' | 'dark' {
  try {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    const systemInfo = uni.getSystemInfoSync()
    return systemInfo.theme === 'dark' ? 'dark' : 'light'
  } catch (error) {
    return 'light'
  }
}

function applyThemeToDocument(theme: 'light' | 'dark') {
  if (typeof document === 'undefined') return

  document.documentElement.classList.remove('theme-light', 'theme-dark')
  document.body?.classList.remove('theme-light', 'theme-dark')
  document.documentElement.classList.add(`theme-${theme}`)
  document.body?.classList.add(`theme-${theme}`)

  const themeColor = theme === 'dark' ? '#141b22' : '#f7fbff'
  let meta = document.querySelector('meta[name="theme-color"]')

  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    document.head.appendChild(meta)
  }

  meta.setAttribute('content', themeColor)
}

function bindSystemThemeChange(onChange: (theme: 'light' | 'dark') => void) {
  if (mediaQueryCleanup) {
    mediaQueryCleanup()
    mediaQueryCleanup = null
  }

  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = (event: MediaQueryListEvent | MediaQueryList) => {
    onChange(event.matches ? 'dark' : 'light')
  }

  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', handler)
    mediaQueryCleanup = () => media.removeEventListener('change', handler)
  } else if (typeof media.addListener === 'function') {
    media.addListener(handler)
    mediaQueryCleanup = () => media.removeListener(handler)
  }
}

export const useAppStore = defineStore('app', {
  state: () => ({
    ready: false,
    locale: 'zh-CN' as Locale,
    themeMode: 'system' as ThemeMode,
    appliedTheme: 'light' as 'light' | 'dark',
    notificationSettings: getDefaultNotificationSettings() as NotificationSettings,
    notificationPermissionGranted: false,
    notificationPermissionAskedOnce: false,
    notificationPermissionPromptVersion: '',
    notificationPermissionPending: false,
    reminderBanner: {
      visible: false,
      title: '',
      content: '',
      at: ''
    },
    wallpaper: {
      date: '',
      url: DEFAULT_WALLPAPER,
      title: 'TimeFlow'
    } as WallpaperPayload
  }),
  getters: {
    themeClass: (state) => (state.appliedTheme === 'dark' ? 'theme-dark' : 'theme-light')
  },
  actions: {
    t(key: string) {
      return messages[this.locale][key] || messages['zh-CN'][key] || key
    },
    syncTheme() {
      this.appliedTheme = this.themeMode === 'system' ? getSystemTheme() : this.themeMode
      applyThemeToDocument(this.appliedTheme)
    },
    async bootstrap() {
      if (this.ready) return

      await initDatabase()
      this.themeMode = ((await getSetting('themeMode')) as ThemeMode) || 'system'
      this.locale = ((await getSetting('locale')) as Locale) || 'zh-CN'
      this.notificationSettings = {
        enabled: (await getSetting('notificationEnabled')) === 'true',
        time: (await getSetting('notificationTime')) || getDefaultNotificationSettings().time,
        repeatDays: parseStoredRepeatDays(await getSetting('notificationRepeatDays'))
      }
      this.notificationPermissionAskedOnce = (await getSetting('notificationPermissionAskedOnce')) === 'true'
      this.notificationPermissionPromptVersion = (await getSetting('notificationPermissionPromptVersion')) || ''
      this.syncTheme()

      if (typeof uni.onThemeChange === 'function') {
        uni.onThemeChange(({ theme }) => {
          if (this.themeMode === 'system') {
            this.appliedTheme = theme === 'dark' ? 'dark' : 'light'
            applyThemeToDocument(this.appliedTheme)
          }
        })
      }

      bindSystemThemeChange((theme) => {
        if (this.themeMode === 'system') {
          this.appliedTheme = theme
          applyThemeToDocument(this.appliedTheme)
        }
      })

      this.wallpaper = await fetchDailyWallpaper()
      await this.initializeNotificationPermission()
      if (this.notificationSettings.enabled) {
        try {
          await this.syncNotifications()
        } catch (error) {
          if (isNotificationPermissionError(error)) {
            this.notificationSettings = {
              ...this.notificationSettings,
              enabled: false
            }
            await setSetting('notificationEnabled', 'false')
          } else {
            console.warn('sync notifications skipped', error)
          }
        }
      }
      this.ready = true
    },
    async setThemeMode(mode: ThemeMode) {
      this.themeMode = mode
      this.syncTheme()
      await setSetting('themeMode', mode)
    },
    async setLocale(locale: Locale) {
      this.locale = locale
      await setSetting('locale', locale)
      if (this.notificationSettings.enabled) {
        await this.syncNotifications()
      }
    },
    async refreshWallpaper() {
      this.wallpaper = await fetchDailyWallpaper()
    },
    async syncTodayContext() {
      const today = toDayKey()
      if (
        this.wallpaper.date !== today ||
        !this.wallpaper.sourceDate ||
        this.wallpaper.sourceDate !== today
      ) {
        await this.refreshWallpaper()
      }
    },
    async syncNotifications() {
      await syncDailyNotifications(this.notificationSettings, this.locale)
    },
    async resolveNotificationPermission(retryIfDenied = false) {
      let granted = await hasNotificationPermission()
      if (!granted && retryIfDenied) {
        const retryDelays = [220, 420, 760]
        for (const delay of retryDelays) {
          await sleep(delay)
          granted = await hasNotificationPermission()
          if (granted) break
        }
      }
      this.notificationPermissionGranted = granted
      return granted
    },
    async initializeNotificationPermission() {
      const granted = await this.resolveNotificationPermission(false)
      const shouldPromptOnLaunch =
        !granted &&
        !isHBuilderDebugBase() &&
        this.notificationPermissionPromptVersion !== NOTIFICATION_PERMISSION_PROMPT_VERSION

      if (!this.notificationPermissionAskedOnce || shouldPromptOnLaunch) {
        this.notificationPermissionAskedOnce = true
        await setSetting('notificationPermissionAskedOnce', 'true')
        this.notificationPermissionPromptVersion = NOTIFICATION_PERMISSION_PROMPT_VERSION
        await setSetting('notificationPermissionPromptVersion', NOTIFICATION_PERMISSION_PROMPT_VERSION)

        if (shouldPromptOnLaunch) {
          try {
            await ensureNotificationPermission({ openSettingsOnFail: false })
            await this.resolveNotificationPermission(true)
          } catch (error) {
            this.notificationPermissionGranted = false
            await this.forceNotificationDisabled(false)
          }
          return
        }
      }

      if (!granted) {
        await this.forceNotificationDisabled(false)
      }
    },
    setNotificationPermissionPending(pending: boolean) {
      this.notificationPermissionPending = pending
    },
    async forceNotificationDisabled(preservePending = false) {
      this.notificationSettings = {
        ...this.notificationSettings,
        enabled: false
      }
      await setSetting('notificationEnabled', 'false')
      await this.syncNotifications().catch((error) => {
        console.warn('clear notifications skipped', error)
      })
      if (!preservePending) {
        this.notificationPermissionPending = false
      }
    },
    async reconcileNotificationPermission() {
      const granted = await this.resolveNotificationPermission(true)

      if (granted) {
        this.notificationPermissionPending = false

        if (!this.notificationSettings.enabled) {
          return 'granted'
        }

        return 'enabled'
      }

      if (this.notificationSettings.enabled) {
        await this.setNotificationEnabled(false)
      } else {
        await this.forceNotificationDisabled(true)
      }

      return 'disabled'
    },
    async setNotificationEnabled(enabled: boolean) {
      if (enabled) {
        try {
          await ensureNotificationPermission({ openSettingsOnFail: isHBuilderDebugBase() })
          await this.resolveNotificationPermission(true)
        } catch (error) {
          this.notificationPermissionGranted = false
          throw new NotificationPermissionError()
        }
      } else {
        await this.resolveNotificationPermission(false)
      }

      this.notificationSettings = {
        ...this.notificationSettings,
        enabled
      }
      await setSetting('notificationEnabled', `${enabled}`)
      if (!enabled) {
        this.notificationPermissionPending = false
      }

      try {
        await this.syncNotifications()
      } catch (error) {
        await this.forceNotificationDisabled(false)
        throw error
      }
    },
    async setNotificationTime(time: string) {
      this.notificationSettings = {
        ...this.notificationSettings,
        time
      }
      await setSetting('notificationTime', time)
      if (this.notificationSettings.enabled) {
        await this.syncNotifications()
      }
    },
    async setNotificationRepeatDays(days: number[]) {
      const repeatDays = normalizeNotificationRepeatDays(days)
      this.notificationSettings = {
        ...this.notificationSettings,
        repeatDays
      }
      await setSetting('notificationRepeatDays', JSON.stringify(repeatDays))
      if (this.notificationSettings.enabled) {
        await this.syncNotifications()
      }
    },
    presentReminder(payload: { title: string; content: string; at?: string }) {
      this.reminderBanner = {
        visible: true,
        title: payload.title,
        content: payload.content,
        at: payload.at || ''
      }

      if (reminderBannerTimer) {
        clearTimeout(reminderBannerTimer)
      }

      reminderBannerTimer = setTimeout(() => {
        this.hideReminderBanner()
      }, 5200)
    },
    hideReminderBanner() {
      this.reminderBanner = {
        ...this.reminderBanner,
        visible: false
      }
    }
  }
})
