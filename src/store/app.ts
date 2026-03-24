import { defineStore } from 'pinia'

import { messages } from '@/constants/i18n'
import { getDefaultNotificationSettings, syncDailyNotifications } from '@/services/notification'
import { fetchDailyWallpaper, DEFAULT_WALLPAPER } from '@/services/bing'
import { getSetting, initDatabase, setSetting } from '@/services/sqlite'
import type { Locale, NotificationSettings, ThemeMode, WallpaperPayload } from '@/types/timeflow'
import { toDayKey } from '@/utils/date'

let mediaQueryCleanup: (() => void) | null = null

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
        time: (await getSetting('notificationTime')) || getDefaultNotificationSettings().time
      }
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
      await this.syncNotifications()
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
      try {
        await syncDailyNotifications(this.notificationSettings, this.locale)
      } catch (error) {
        console.warn('sync notifications skipped', error)
      }
    },
    async setNotificationEnabled(enabled: boolean) {
      this.notificationSettings = {
        ...this.notificationSettings,
        enabled
      }
      await setSetting('notificationEnabled', `${enabled}`)
      await this.syncNotifications()
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
    }
  }
})
