<script setup lang="ts">
import { computed, ref } from 'vue'

import TimeSelectSheet from '@/components/common/time-select-sheet.vue'
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
const repeatOptions = computed(() => [
  { value: 1, label: appStore.t('weekdayMonShort') },
  { value: 2, label: appStore.t('weekdayTueShort') },
  { value: 3, label: appStore.t('weekdayWedShort') },
  { value: 4, label: appStore.t('weekdayThuShort') },
  { value: 5, label: appStore.t('weekdayFriShort') },
  { value: 6, label: appStore.t('weekdaySatShort') },
  { value: 0, label: appStore.t('weekdaySunShort') }
])

const themeThumbStyle = computed(() => buildThumbStyle(themes.value.length, themes.value.findIndex((item) => item.key === appStore.themeMode)))
const localeThumbStyle = computed(() => buildThumbStyle(locales.value.length, locales.value.findIndex((item) => item.key === appStore.locale)))
const timeSheetVisible = ref(false)
const notificationLocked = computed(() => !appStore.notificationPermissionGranted)

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

function showNotificationLockedToast() {
  uni.showToast({
    title: appStore.t('notificationPermissionLocked'),
    icon: 'none'
  })
}

async function toggleNotifications(value: boolean) {
  if (notificationLocked.value) {
    showNotificationLockedToast()
    return
  }

  if (value) {
    appStore.setNotificationPermissionPending(true)
  } else {
    appStore.setNotificationPermissionPending(false)
  }

  try {
    await appStore.setNotificationEnabled(value)
    appStore.setNotificationPermissionPending(false)
    uni.showToast({
      title: appStore.t(value ? 'notificationOn' : 'notificationOff'),
      icon: 'none'
    })
  } catch (error) {
    await appStore.forceNotificationDisabled(value).catch(() => undefined)
    uni.showToast({
      title: appStore.t('notificationPermissionDenied'),
      icon: 'none'
    })
  }
}

async function updateNotificationTime(nextTime: string) {
  try {
    await appStore.setNotificationTime(nextTime)
    timeSheetVisible.value = false
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

function openTimeSheet() {
  if (notificationLocked.value) {
    showNotificationLockedToast()
    return
  }
  timeSheetVisible.value = true
}

async function toggleRepeatDay(day: number) {
  if (notificationLocked.value) {
    showNotificationLockedToast()
    return
  }

  const current = appStore.notificationSettings.repeatDays
  const hasDay = current.includes(day)
  const nextDays = hasDay ? current.filter((item) => item !== day) : [...current, day]

  if (!nextDays.length) {
    uni.showToast({
      title: appStore.t('notificationRepeatRequired'),
      icon: 'none'
    })
    return
  }

  try {
    await appStore.setNotificationRepeatDays(nextDays)
    uni.showToast({
      title: appStore.t('notificationRepeatUpdated'),
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
    <view class="panel__row" @tap="notificationLocked ? showNotificationLockedToast() : undefined">
      <view class="panel__copy">
        <text class="panel__title panel__title--compact">{{ appStore.t('notificationTitle') }}</text>
        <text class="panel__description">{{ appStore.t('notificationDesc') }}</text>
      </view>
      <switch
        :checked="appStore.notificationSettings.enabled"
        :disabled="notificationLocked"
        color="#7AB3EF"
        @change="toggleNotifications($event.detail.value)"
      />
    </view>
    <text v-if="notificationLocked" class="panel__permission-tip">{{ appStore.t('notificationPermissionLocked') }}</text>

    <view v-if="appStore.notificationSettings.enabled" class="notification-time" @tap="openTimeSheet">
      <text class="notification-time__label">{{ appStore.t('notificationTime') }}</text>
      <view class="notification-time__value-wrap">
        <text class="notification-time__value">{{ appStore.notificationSettings.time }}</text>
      </view>
    </view>

    <view v-if="appStore.notificationSettings.enabled" class="notification-repeat">
      <text class="notification-time__label">{{ appStore.t('notificationRepeat') }}</text>

      <view class="notification-repeat__grid">
        <view
          v-for="item in repeatOptions"
          :key="item.value"
          :class="[
            'notification-repeat__chip',
            { 'notification-repeat__chip--active': appStore.notificationSettings.repeatDays.includes(item.value) }
          ]"
          @tap="toggleRepeatDay(item.value)"
        >
          {{ item.label }}
        </view>
      </view>
    </view>
  </view>

  <view class="wallpaper glass-card" @tap="previewWallpaper" @longpress="saveWallpaper">
    <text class="panel__title">{{ appStore.t('wallpaperTitle') }}</text>
    <image class="wallpaper__image" :src="appStore.wallpaper.url" mode="aspectFill" />
    <text class="wallpaper__hint">{{ appStore.t('wallpaperHint') }}</text>
  </view>

  <TimeSelectSheet
    :visible="timeSheetVisible"
    :value="appStore.notificationSettings.time"
    :title="appStore.t('notificationTime')"
    :cancel-text="appStore.t('cancel')"
    :confirm-text="appStore.t('saveChanges')"
    @close="timeSheetVisible = false"
    @confirm="updateNotificationTime"
  />
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
  margin-bottom: 4rpx;
}

.panel__description {
  color: var(--tf-text-secondary);
  font-size: 24rpx;
  line-height: 1.42;
}

.panel__permission-tip {
  display: block;
  margin-top: 10rpx;
  color: #ff8b94;
  font-size: 22rpx;
  line-height: 1.5;
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
  margin-top: 8rpx;
  padding: 14rpx 20rpx;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  background: var(--tf-control-surface);
}

.notification-time__label {
  color: var(--tf-text-primary);
  font-size: 27rpx;
  font-weight: 600;
}

.notification-time__value-wrap {
  min-width: 132rpx;
  padding: 10rpx 14rpx;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.2);
}

.notification-time__value {
  color: var(--tf-text-primary);
  font-size: 30rpx;
  font-weight: 700;
}

.notification-repeat {
  margin-top: 0;
  padding: 12rpx 20rpx 20rpx;
  border-radius: 20rpx;
  background: var(--tf-control-surface);
}

.notification-repeat__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10rpx;
  margin-top: 10rpx;
}

.notification-repeat__chip {
  min-height: 62rpx;
  border-radius: 18rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--tf-text-secondary);
  font-size: 22rpx;
  background: rgba(255, 255, 255, 0.16);
  transition:
    transform 0.24s ease,
    color 0.24s ease,
    background 0.24s ease;
}

.notification-repeat__chip--active {
  color: #173349;
  background: linear-gradient(135deg, rgba(168, 230, 207, 0.96), rgba(122, 179, 239, 0.82));
  transform: translateY(-1rpx);
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
