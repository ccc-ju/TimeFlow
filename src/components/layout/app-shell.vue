<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onMounted, ref, watch } from 'vue'

import { useAppStore } from '@/store/app'

type TabKey = 'home' | 'calendar' | 'statistics' | 'profile'

const emit = defineEmits<{
  (event: 'scroll', payload: any): void
  (event: 'change-tab', key: TabKey): void
}>()

const props = withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    currentTab?: TabKey
    showDock?: boolean
    persistentTabs?: boolean
    scrollTop?: number
    scrollWithAnimation?: boolean
  }>(),
  {
    subtitle: '',
    currentTab: 'home',
    showDock: true,
    persistentTabs: false,
    scrollTop: 0,
    scrollWithAnimation: false
  }
)

const appStore = useAppStore()
const instance = getCurrentInstance()

const systemInfo = uni.getSystemInfoSync()
const safeTopInset = systemInfo.safeAreaInsets?.top ?? systemInfo.statusBarHeight ?? 0
const safeBottomInset = systemInfo.safeAreaInsets?.bottom ?? 0
const dockGapPx = uni.upx2px(12)

const scrollStyle = computed(() => ({
  paddingTop: `${safeTopInset + 16}px`
}))

const dockStyle = computed(() => ({
  bottom: `${safeBottomInset + 12}px`
}))

const reminderStyle = computed(() => ({
  top: `${safeTopInset + 10}px`
}))

const bottomFillStyle = computed(() => ({
  height: `${safeBottomInset + 30}px`
}))

const tabs = computed(() => [
  { key: 'home' as TabKey, label: appStore.t('homeTitle'), path: '/pages/home/index' },
  { key: 'calendar' as TabKey, label: appStore.t('calendarTitle'), path: '/pages/calendar/index' },
  { key: 'statistics' as TabKey, label: appStore.t('statisticsTitle'), path: '/pages/statistics/index' },
  { key: 'profile' as TabKey, label: appStore.t('profileTitle'), path: '/pages/profile/index' }
])

const currentIndex = computed(() => {
  const index = tabs.value.findIndex((item) => item.key === props.currentTab)
  return index >= 0 ? index : 0
})

const trackWidthPx = ref(Math.max(systemInfo.windowWidth - uni.upx2px(84), 0))
const animatedIndex = ref(currentIndex.value)
const navigating = ref(false)

const isDragging = ref(false)
const dragStartX = ref(0)
const dragStartLeft = ref(0)
const dragLeft = ref(0)
let dragFrame: ReturnType<typeof setTimeout> | number = 0
let pendingDragLeft: number | null = null

const tabWidthPx = computed(() => Math.max((trackWidthPx.value - dockGapPx * (tabs.value.length - 1)) / tabs.value.length, 0))
const slideStepPx = computed(() => tabWidthPx.value + dockGapPx)

const thumbStyle = computed(() => {
  const left = isDragging.value ? dragLeft.value : animatedIndex.value * slideStepPx.value
  return {
    width: `${tabWidthPx.value}px`,
    transform: `translate3d(${Math.max(0, left)}px, 0, 0)`
  }
})

function flushDragFrame() {
  if (pendingDragLeft === null) return
  dragLeft.value = pendingDragLeft
  pendingDragLeft = null
  dragFrame = 0
}

function requestFrame(callback: () => void) {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(callback)
  }
  return setTimeout(callback, 16)
}

function cancelFrame(frame: ReturnType<typeof setTimeout> | number) {
  if (!frame) return
  if (typeof cancelAnimationFrame === 'function' && typeof frame === 'number') {
    cancelAnimationFrame(frame)
    return
  }
  clearTimeout(frame as ReturnType<typeof setTimeout>)
}

function scheduleDragLeft(value: number) {
  pendingDragLeft = value
  if (dragFrame) return
  dragFrame = requestFrame(flushDragFrame)
}

function measureDockTrack() {
  nextTick(() => {
    setTimeout(() => {
      uni
        .createSelectorQuery()
        .in(instance?.proxy)
        .select('.app-shell__dock-track')
        .boundingClientRect((rect) => {
          const target = rect as { width?: number } | null
          if (target?.width) {
            trackWidthPx.value = target.width
          }
        })
        .exec()
    }, 30)
  })
}

function animateThumbTo(index: number) {
  animatedIndex.value = index
  dragLeft.value = index * slideStepPx.value
}

function navigate(path: string, key: TabKey) {
  if (props.currentTab === key || navigating.value) return
  const targetIndex = tabs.value.findIndex((item) => item.key === key)

  navigating.value = true
  animateThumbTo(targetIndex)

  if (props.persistentTabs) {
    setTimeout(() => {
      navigating.value = false
      emit('change-tab', key)
    }, 170)
    return
  }

  const direction = targetIndex >= currentIndex.value ? 'slide-in-right' : 'slide-in-left'

  uni.setStorageSync(
    'TIMEFLOW_DOCK_TRANSITION',
    JSON.stringify({
      to: key,
      fromIndex: currentIndex.value
    })
  )

  setTimeout(() => {
    uni.navigateTo({
      url: path,
      animationType: direction,
      animationDuration: 220,
      complete: () => {
        navigating.value = false
      }
    })
  }, 170)
}

function clampDrag(value: number) {
  return Math.min(Math.max(value, 0), slideStepPx.value * (tabs.value.length - 1))
}

function onDockTouchStart(event: { touches?: Array<{ clientX?: number }> }) {
  const clientX = event.touches?.[0]?.clientX
  if (typeof clientX !== 'number') return
  isDragging.value = true
  dragStartX.value = clientX
  dragStartLeft.value = animatedIndex.value * slideStepPx.value
  dragLeft.value = dragStartLeft.value
}

function onDockTouchMove(event: { touches?: Array<{ clientX?: number }> }) {
  if (!isDragging.value) return
  const clientX = event.touches?.[0]?.clientX
  if (typeof clientX !== 'number') return
  scheduleDragLeft(clampDrag(dragStartLeft.value + clientX - dragStartX.value))
}

function onDockTouchEnd() {
  if (!isDragging.value) return
  if (dragFrame) {
    cancelFrame(dragFrame)
    flushDragFrame()
  }
  const nextIndex = Math.round(clampDrag(dragLeft.value) / slideStepPx.value)
  isDragging.value = false
  animateThumbTo(nextIndex)

  const target = tabs.value[nextIndex]
  if (target) {
    navigate(target.path, target.key)
  }
}

onMounted(() => {
  if (props.persistentTabs) {
    measureDockTrack()
    animateThumbTo(currentIndex.value)
    return
  }

  measureDockTrack()

  const transitionRaw = uni.getStorageSync('TIMEFLOW_DOCK_TRANSITION')
  if (!transitionRaw) {
    animateThumbTo(currentIndex.value)
    return
  }

  try {
    const transition = JSON.parse(transitionRaw) as { to?: string; fromIndex?: number }
    if (transition.to === props.currentTab && typeof transition.fromIndex === 'number') {
      animatedIndex.value = transition.fromIndex
      dragLeft.value = transition.fromIndex * slideStepPx.value
      setTimeout(() => {
        animateThumbTo(currentIndex.value)
        uni.removeStorageSync('TIMEFLOW_DOCK_TRANSITION')
      }, 36)
      return
    }
  } catch (error) {
    console.debug('dock transition parse skipped', error)
  }

  animateThumbTo(currentIndex.value)
  uni.removeStorageSync('TIMEFLOW_DOCK_TRANSITION')
})

watch(
  currentIndex,
  (value) => {
    if (!isDragging.value && !navigating.value) {
      animateThumbTo(value)
    }
  },
  { immediate: true }
)

watch(trackWidthPx, () => {
  if (!isDragging.value && !navigating.value) {
    animateThumbTo(currentIndex.value)
  }
})
</script>

<template>
  <view :class="['app-shell', appStore.themeClass]">
    <view class="app-shell__orb app-shell__orb--mint" />
    <view class="app-shell__orb app-shell__orb--blue" />
    <view class="app-shell__bottom-fill" :style="bottomFillStyle" />
    <view
      v-if="appStore.reminderBanner.visible"
      class="app-shell__reminder glass-card"
      :style="reminderStyle"
      @tap="appStore.hideReminderBanner()"
    >
      <view class="app-shell__reminder-copy">
        <text class="app-shell__reminder-title">{{ appStore.reminderBanner.title }}</text>
        <text class="app-shell__reminder-content">{{ appStore.reminderBanner.content }}</text>
      </view>
      <text class="app-shell__reminder-action">{{ appStore.t('notificationAcknowledge') }}</text>
    </view>
    <view class="app-shell__scroll" :style="scrollStyle">
      <view class="app-shell__header">
        <view class="app-shell__heading">
          <text v-if="subtitle" class="app-shell__subtitle">{{ subtitle }}</text>
          <text class="app-shell__title">{{ title }}</text>
        </view>
        <slot name="header-extra" />
      </view>
      <slot />
      <view class="safe-bottom-space" />
    </view>

    <view
      v-if="showDock"
      class="app-shell__dock glass-card"
      :style="dockStyle"
      @touchstart="onDockTouchStart"
      @touchmove.stop.prevent="onDockTouchMove"
      @touchend="onDockTouchEnd"
      @touchcancel="onDockTouchEnd"
    >
      <view class="app-shell__dock-track">
        <view class="app-shell__dock-thumb" :style="thumbStyle" />
        <view
          v-for="item in tabs"
          :key="item.key"
          :class="['dock-item', { 'dock-item--active': currentTab === item.key }]"
          @tap="navigate(item.path, item.key)"
        >
          <view class="dock-item__icon">
            <view class="dock-item__icon-dot" />
          </view>
          <text class="dock-item__label">{{ item.label }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.app-shell {
  position: relative;
  min-height: 100vh;
  color: var(--tf-text-primary);
  background:
    radial-gradient(circle at top right, var(--tf-page-gradient-blue), transparent 34%),
    radial-gradient(circle at left 20%, var(--tf-page-gradient-mint), transparent 26%),
    var(--tf-page-bg);
}

.app-shell__scroll {
  min-height: 100vh;
  padding-left: 28rpx;
  padding-right: 28rpx;
  padding-bottom: 0;
}

.app-shell__reminder {
  position: fixed;
  left: 28rpx;
  right: 28rpx;
  z-index: 45;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 22rpx 24rpx;
  animation: reminder-in 0.22s ease;
}

.app-shell__reminder-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.app-shell__reminder-title {
  color: var(--tf-text-primary);
  font-size: 28rpx;
  font-weight: 700;
}

.app-shell__reminder-content {
  color: var(--tf-text-secondary);
  font-size: 24rpx;
  line-height: 1.5;
}

.app-shell__reminder-action {
  flex-shrink: 0;
  color: #173349;
  font-size: 24rpx;
  font-weight: 700;
  padding: 12rpx 18rpx;
  border-radius: 999rpx;
  background: linear-gradient(135deg, rgba(168, 230, 207, 0.9), rgba(122, 179, 239, 0.82));
}

.app-shell__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20rpx;
  margin-bottom: 28rpx;
}

.app-shell__heading {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.app-shell__subtitle {
  color: var(--tf-text-secondary);
  font-size: 24rpx;
  letter-spacing: 2rpx;
}

.app-shell__title {
  color: var(--tf-text-primary);
  font-size: 56rpx;
  font-weight: 700;
  letter-spacing: -1rpx;
}

.app-shell__orb {
  position: absolute;
  border-radius: 999rpx;
  filter: blur(20rpx);
  opacity: 0.88;
}

.app-shell__orb--mint {
  top: 120rpx;
  left: -90rpx;
  width: 280rpx;
  height: 280rpx;
  background: var(--tf-page-gradient-mint);
}

.app-shell__orb--blue {
  top: 50rpx;
  right: -60rpx;
  width: 330rpx;
  height: 330rpx;
  background: var(--tf-page-gradient-blue);
}

.app-shell__bottom-fill {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1;
  background:
    linear-gradient(180deg, rgba(0, 0, 0, 0), var(--tf-page-bg) 38%),
    var(--tf-page-bg);
  pointer-events: none;
}

.app-shell__dock {
  position: fixed;
  right: 28rpx;
  left: 28rpx;
  padding: 14rpx;
  z-index: 30;
  overflow: hidden;
}

.app-shell__dock-track {
  position: relative;
  display: flex;
  gap: 12rpx;
}

.app-shell__dock-thumb {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  border-radius: 24rpx;
  background: linear-gradient(135deg, rgba(168, 230, 207, 0.36), rgba(122, 179, 239, 0.26));
  will-change: transform;
  transition:
    transform 0.28s cubic-bezier(0.22, 1, 0.36, 1),
    width 0.24s ease;
}

.dock-item {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
  padding: 14rpx 0;
  border-radius: 24rpx;
  color: var(--tf-text-muted);
  transition: color 0.24s ease;
}

.dock-item--active {
  color: var(--tf-text-primary);
}

.dock-item__icon {
  width: 42rpx;
  height: 42rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16rpx;
  background: var(--tf-control-surface);
}

.dock-item__icon-dot {
  width: 18rpx;
  height: 18rpx;
  border-radius: 999rpx;
  background: currentColor;
}

.dock-item__label {
  font-size: 22rpx;
  line-height: 1;
}

@keyframes reminder-in {
  from {
    opacity: 0;
    transform: translateY(-16rpx) scale(0.98);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
