<script setup lang="ts">
import { computed } from 'vue'

import { useAppStore } from '@/store/app'
import type { Locale, ThemeMode } from '@/types/timeflow'

const appStore = useAppStore()

const themes = computed(() => [
  { key: 'light' as ThemeMode, label: appStore.t('lightMode') },
  { key: 'dark' as ThemeMode, label: appStore.t('darkMode') },
  { key: 'system' as ThemeMode, label: appStore.t('systemMode') }
])

const locales = computed(() => [
  { key: 'zh-CN' as Locale, label: '简体中文' },
  { key: 'en' as Locale, label: 'English' }
])

const themeThumbStyle = computed(() => buildThumbStyle(themes.value.length, themes.value.findIndex((item) => item.key === appStore.themeMode)))
const localeThumbStyle = computed(() => buildThumbStyle(locales.value.length, locales.value.findIndex((item) => item.key === appStore.locale)))

function buildThumbStyle(total: number, index: number) {
  const safeIndex = Math.max(0, index)
  const gap = 14
  const inset = 10
  return {
    width: `calc((100% - ${inset * 2}rpx - ${(total - 1) * gap}rpx) / ${total})`,
    left: `calc(${inset}rpx + ${safeIndex} * ((100% - ${inset * 2}rpx - ${(total - 1) * gap}rpx) / ${total} + ${gap}rpx))`
  }
}

function selectTheme(mode: ThemeMode) {
  if (appStore.themeMode === mode) return
  appStore.setThemeMode(mode)
}

function selectLocale(locale: Locale) {
  if (appStore.locale === locale) return
  appStore.setLocale(locale)
}

async function toggleNotifications(value: boolean) {
  try {
    await appStore.setNotificationEnabled(value)
    uni.showToast({
      title: appStore.t(value ? 'notificationOn' : 'notificationOff'),
      icon: 'none'
    })
  } catch (error) {
    await appStore.setNotificationEnabled(false).catch(() => undefined)
    uni.showToast({
      title: appStore.t('notificationPermissionDenied'),
      icon: 'none'
    })
  }
}

async function updateNotificationTime(event: { detail?: { value?: string } }) {
  const nextTime = event.detail?.value || '21:00'
  try {
    await appStore.setNotificationTime(nextTime)
    uni.showToast({
      title: appStore.t('notificationUpdated'),
      icon: 'none'
    })
  } catch (error) {
    uni.showToast({
      title: appStore.t('notificationPermissionDenied'),
      icon: 'none'
    })
  }
}

function previewWallpaper() {
  uni.previewImage({
    urls: [appStore.wallpaper.url],
    current: appStore.wallpaper.url
  })
}

async function saveWallpaper() {
  try {
    const imageInfo = await uni.getImageInfo({
      src: appStore.wallpaper.url
    })

    await uni.saveImageToPhotosAlbum({
      filePath: imageInfo.path
    })

    uni.showToast({
      title: appStore.t('wallpaperSaved'),
      icon: 'none'
    })
  } catch (error) {
    uni.showToast({
      title: appStore.t('wallpaperSaveFailed'),
      icon: 'none'
    })
  }
}
</script>

<template>
  <view class="panel glass-card">
    <text class="panel__title">{{ appStore.t('themeMode') }}</text>
    <view class="selector">
      <view class="selector__thumb" :style="themeThumbStyle" />
      <view
        v-for="item in themes"
        :key="item.key"
        :class="['selector__item', { 'selector__item--active': appStore.themeMode === item.key }]"
        @tap="selectTheme(item.key)"
      >
        {{ item.label }}
      </view>
    </view>
  </view>

  <view class="panel glass-card">
    <text class="panel__title">{{ appStore.t('language') }}</text>
    <view class="selector">
      <view class="selector__thumb" :style="localeThumbStyle" />
      <view
        v-for="item in locales"
        :key="item.key"
        :class="['selector__item', { 'selector__item--active': appStore.locale === item.key }]"
        @tap="selectLocale(item.key)"
      >
        {{ item.label }}
      </view>
    </view>
  </view>

  <view class="panel glass-card">
    <view class="panel__row">
      <view class="panel__copy">
        <text class="panel__title panel__title--compact">{{ appStore.t('notificationTitle') }}</text>
        <text class="panel__description">{{ appStore.t('notificationDesc') }}</text>
      </view>
      <switch
        :checked="appStore.notificationSettings.enabled"
        color="#7AB3EF"
        @change="toggleNotifications($event.detail.value)"
      />
    </view>

    <picker mode="time" :value="appStore.notificationSettings.time" @change="updateNotificationTime">
      <view
        v-if="appStore.notificationSettings.enabled"
        :class="['notification-time', { 'notification-time--disabled': !appStore.notificationSettings.enabled }]"
      >
        <view class="notification-time__copy">
          <text class="notification-time__label">{{ appStore.t('notificationTime') }}</text>
          <text class="notificationTime__hint">{{ appStore.t('notificationTimeHint') }}</text>
        </view>
        <text class="notification-time__value">{{ appStore.notificationSettings.time }}</text>
      </view>
    </picker>
  </view>

  <view class="wallpaper glass-card" @tap="previewWallpaper" @longpress="saveWallpaper">
    <text class="panel__title">{{ appStore.t('wallpaperTitle') }}</text>
    <image class="wallpaper__image" :src="appStore.wallpaper.url" mode="aspectFill" />
    <text class="wallpaper__hint">{{ appStore.t('wallpaperHint') }}</text>
  </view>
</template>

<style scoped lang="scss">
.panel,
.wallpaper {
  padding: 26rpx;
  margin-bottom: 22rpx;
}

.panel__title {
  display: block;
  margin-bottom: 18rpx;
  color: var(--tf-text-primary);
  font-size: 32rpx;
  font-weight: 700;
}

.panel__title--compact {
  margin-bottom: 8rpx;
}

.panel__description {
  color: var(--tf-text-secondary);
  font-size: 26rpx;
  line-height: 1.7;
}

.panel__row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20rpx;
}

.panel__copy {
  flex: 1;
}

.selector {
  position: relative;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 14rpx;
  padding: 10rpx;
  border-radius: 30rpx;
  background: var(--tf-control-surface);
  overflow: hidden;
}

.selector__thumb {
  position: absolute;
  top: 10rpx;
  bottom: 10rpx;
  border-radius: 22rpx;
  background: linear-gradient(135deg, #a8e6cf, #7ab3ef);
  box-shadow: 0 16rpx 34rpx rgba(122, 179, 239, 0.22);
  transition:
    left 0.3s cubic-bezier(0.22, 1, 0.36, 1),
    width 0.3s ease;
}

.selector__item {
  position: relative;
  z-index: 1;
  min-height: 88rpx;
  border-radius: 22rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--tf-text-secondary);
  transition:
    color 0.26s ease,
    transform 0.26s ease;
}

.selector__item--active {
  color: #173349;
  transform: translateY(-1rpx);
}

.notification-time {
  margin-top: 22rpx;
  padding: 22rpx 24rpx;
  border-radius: 24rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  background: var(--tf-control-surface);
}

.notification-time--disabled {
  opacity: 0.54;
}

.notification-time__copy {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.notification-time__label {
  color: var(--tf-text-primary);
  font-size: 28rpx;
  font-weight: 600;
}

.notificationTime__hint {
  color: var(--tf-text-secondary);
  font-size: 22rpx;
  line-height: 1.5;
}

.notification-time__value {
  color: var(--tf-text-primary);
  font-size: 38rpx;
  font-weight: 700;
}

.wallpaper__image {
  width: 100%;
  height: 300rpx;
  border-radius: 28rpx;
}

.wallpaper__hint {
  display: block;
  margin-top: 14rpx;
  color: var(--tf-text-secondary);
  font-size: 22rpx;
}
</style>
