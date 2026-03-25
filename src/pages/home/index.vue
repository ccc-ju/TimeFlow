<script setup lang="ts">
import { computed, getCurrentInstance, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'

import EchartBox from '@/components/charts/echart-box.vue'
import AddTaskSheet from '@/components/home/add-task-sheet.vue'
import TaskCard from '@/components/home/task-card.vue'
import CalendarPanel from '@/components/dashboard/calendar-panel.vue'
import ProfilePanel from '@/components/dashboard/profile-panel.vue'
import StatisticsPanel from '@/components/dashboard/statistics-panel.vue'
import AppShell from '@/components/layout/app-shell.vue'
import { fetchMotivationQuote } from '@/services/quote'
import { useAppStore } from '@/store/app'
import { useTaskStore } from '@/store/tasks'
import { formatHeaderDate } from '@/utils/date'
import { haptic } from '@/utils/feedback'

const appStore = useAppStore()
const taskStore = useTaskStore()
const instance = getCurrentInstance()

const sheetVisible = ref(false)
const posterVisible = ref(false)
const posterPath = ref('')
const posterBuilding = ref(false)
const activeTab = ref<'home' | 'calendar' | 'statistics' | 'profile'>('home')

const tabOrder = ['home', 'calendar', 'statistics', 'profile'] as const

onShow(async () => {
  if (!taskStore.initialized) {
    await taskStore.bootstrap()
  }
})

const todayStats = computed(() => taskStore.todayStats)
const todayTasks = computed(() => taskStore.todayTasks)
const completionRate = computed(() => taskStore.todayCompletionRate)
const todayDateLabel = computed(() => formatHeaderDate(new Date(`${taskStore.todayKey}T12:00:00`), appStore.locale))
const shellTitle = computed(() => {
  if (activeTab.value === 'calendar') return appStore.t('calendarTitle')
  if (activeTab.value === 'statistics') return appStore.t('statisticsTitle')
  if (activeTab.value === 'profile') return appStore.t('profileTitle')
  return appStore.t('homeTitle')
})
const shellSubtitle = computed(() => {
  if (activeTab.value === 'calendar') return appStore.t('calendarSubtitle')
  if (activeTab.value === 'statistics') return appStore.t('statisticsSubtitle')
  if (activeTab.value === 'profile') return appStore.t('profileSubtitle')
  return appStore.t('homeSubtitle')
})

const sharePieOption = computed(() => ({
  animation: false,
  series: [
    {
      type: 'pie',
      radius: ['68%', '90%'],
      silent: true,
      label: { show: false },
      data: [
        {
          value: Math.max(1, Math.round(completionRate.value * 100)),
          itemStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 1,
              y2: 1,
              colorStops: [
                { offset: 0, color: '#A8E6CF' },
                { offset: 1, color: '#7AB3EF' }
              ]
            }
          }
        },
        {
          value: Math.max(1, 100 - Math.round(completionRate.value * 100)),
          itemStyle: { color: 'rgba(148, 164, 184, 0.16)' }
        }
      ]
    }
  ]
}))

function openTask(taskId: string) {
  uni.navigateTo({
    url: `/pages/task-detail/index?id=${taskId}`
  })
}

async function createTask(payload: {
  title: string
  timerMode: 'countup' | 'countdown' | 'notimer'
  durationSeconds: number
  scheduledDate: string
}) {
  if (taskStore.creatingTask) return

  try {
    const task = await taskStore.addTask({
      ...payload,
      wallpaperUrl: appStore.wallpaper.url
    })

    if (!task) return
    sheetVisible.value = false
    haptic()
    uni.showToast({
      title: appStore.t('taskSaved'),
      icon: 'none'
    })
  } catch (error) {
    uni.showToast({
      title: appStore.t('createFailed'),
      icon: 'none'
    })
  }
}

async function toggleTask(taskId: string) {
  if (taskStore.isTaskPending(taskId)) return
  try {
    await taskStore.toggleTask(taskId)
    haptic('medium')
  } catch (error) {
    uni.showToast({
      title: appStore.t('updateFailed'),
      icon: 'none'
    })
  }
}

async function deleteTask(taskId: string) {
  const result = await uni.showModal({
    title: 'TimeFlow',
    content: appStore.t('confirmDelete'),
    confirmText: appStore.t('confirmDeleteAction'),
    cancelText: appStore.t('cancel'),
    confirmColor: '#FF8B94'
  })
  if (!result.confirm) return

  await taskStore.deleteTask(taskId)
  haptic('medium')
  uni.showToast({
    title: appStore.t('taskDeleted'),
    icon: 'none'
  })
}

function getImageInfo(src: string) {
  return new Promise<{ path: string; width: number; height: number } | null>((resolve) => {
    uni.getImageInfo({
      src,
      success: ({ path, width, height }) => resolve({ path, width, height }),
      fail: () => resolve(null)
    })
  })
}

function drawCoverImage(
  context: UniNamespace.CanvasContext,
  image: { path: string; width: number; height: number },
  x: number,
  y: number,
  width: number,
  height: number
) {
  const sourceRatio = image.width / image.height
  const targetRatio = width / height

  let sourceWidth = image.width
  let sourceHeight = image.height
  let sourceX = 0
  let sourceY = 0

  if (sourceRatio > targetRatio) {
    sourceWidth = image.height * targetRatio
    sourceX = (image.width - sourceWidth) / 2
  } else {
    sourceHeight = image.width / targetRatio
    sourceY = (image.height - sourceHeight) / 2
  }

  context.drawImage(image.path, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height)
}

function wrapTextByWidth(
  context: UniNamespace.CanvasContext,
  text: string,
  maxWidth: number,
  maxLines: number
) {
  const lines: string[] = []
  let current = ''
  let consumed = 0

  for (const char of text) {
    const next = `${current}${char}`
    const metrics = context.measureText ? context.measureText(next) : { width: next.length * 26 }
    if (metrics.width > maxWidth && current) {
      lines.push(current)
      consumed += current.length
      current = char
      if (lines.length === maxLines - 1) break
    } else {
      current = next
    }
  }

  const remaining = text.slice(consumed + current.length)
  const lastLine = lines.length === maxLines - 1 && remaining ? `${current}…` : current
  if (lastLine) {
    lines.push(lastLine)
  }

  return lines.slice(0, maxLines)
}

function fillCenteredText(
  context: UniNamespace.CanvasContext,
  text: string,
  centerX: number,
  y: number
) {
  const width = context.measureText ? context.measureText(text).width : text.length * 20
  context.fillText(text, centerX - width / 2, y)
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve(fallback)
    }, timeoutMs)

    promise
      .then((value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(value)
      })
      .catch(() => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(fallback)
      })
  })
}

async function buildPoster() {
  if (posterBuilding.value) return
  posterBuilding.value = true
  const canvasId = 'timeflowPoster'
  const context = uni.createCanvasContext(canvasId, instance?.proxy)
  const width = 900
  const height = 1560

  uni.showLoading({
    title: 'Generating...'
  })

  try {
    const quote = await withTimeout(fetchMotivationQuote(appStore.locale), 4000, {
      content:
        appStore.locale === 'zh-CN'
          ? '把今天认真过好，已经很了不起。'
          : 'A well-kept day is already a quiet win.',
      author: 'TimeFlow',
      provider: 'local' as const
    })
    const imageInfo = await withTimeout(getImageInfo(appStore.wallpaper.url), 4000, null)

    context.setFillStyle(appStore.appliedTheme === 'dark' ? '#101821' : '#eef7ff')
    context.fillRect(0, 0, width, height)

    if (imageInfo) {
      drawCoverImage(context, imageInfo, 0, 0, width, height)
    }

    context.setFillStyle('rgba(8, 14, 24, 0.5)')
    context.fillRect(0, 0, width, height)

    context.setFillStyle('#ffffff')
    context.setFontSize(48)
    fillCenteredText(context, appStore.t('todayReport'), width / 2, 186)

    context.setFillStyle('rgba(255,255,255,0.72)')
    context.setFontSize(28)
    fillCenteredText(context, todayDateLabel.value, width / 2, 236)

    const centerX = width / 2
    const centerY = 620
    const radius = 154
    const percent = completionRate.value

    context.setLineWidth(26)
    context.setStrokeStyle('rgba(255, 255, 255, 0.14)')
    context.beginPath()
    context.arc(centerX, centerY, radius, 0, Math.PI * 2)
    context.stroke()

    context.setStrokeStyle('#7AB3EF')
    context.beginPath()
    context.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + percent * Math.PI * 2)
    context.stroke()

    context.setFillStyle('#ffffff')
    context.setFontSize(78)
    fillCenteredText(context, `${Math.round(percent * 100)}%`, centerX, centerY + 24)

    context.setFillStyle('rgba(255,255,255,0.68)')
    context.setFontSize(28)
    fillCenteredText(context, appStore.t('ofTodayDone'), centerX, centerY + 82)

    context.setStrokeStyle('rgba(255,255,255,0.16)')
    context.setLineWidth(2)
    context.beginPath()
    context.moveTo(180, 872)
    context.lineTo(width - 180, 872)
    context.stroke()

    const summaryCards = [
      {
        label: appStore.t('totalPlan'),
        value: `${todayStats.value.totalPlanned}`
      },
      {
        label: appStore.t('completed'),
        value: `${todayStats.value.completedCount}`
      },
      {
        label: appStore.t('totalFocus'),
        value:
          appStore.locale === 'zh-CN'
            ? `${todayStats.value.totalFocusMinutes}${appStore.t('minutesUnit')}`
            : `${todayStats.value.totalFocusMinutes} ${appStore.t('minutesUnit')}`
      }
    ]
    const cardWidth = 188
    const cardHeight = 152
    const cardGap = 28
    const cardsStartX = (width - (cardWidth * summaryCards.length + cardGap * (summaryCards.length - 1))) / 2
    const cardTop = 926

    summaryCards.forEach((item, index) => {
      const x = cardsStartX + index * (cardWidth + cardGap)
      context.setFillStyle('rgba(255,255,255,0.1)')
      context.fillRect(x, cardTop, cardWidth, cardHeight)

      context.setStrokeStyle('rgba(255,255,255,0.14)')
      context.setLineWidth(2)
      context.strokeRect(x, cardTop, cardWidth, cardHeight)

      context.setFillStyle('#ffffff')
      context.setFontSize(48)
      fillCenteredText(context, item.value, x + cardWidth / 2, cardTop + 68)

      context.setFillStyle('rgba(255,255,255,0.66)')
      context.setFontSize(24)
      fillCenteredText(context, item.label, x + cardWidth / 2, cardTop + 116)
    })

    context.setFillStyle('rgba(255,255,255,0.92)')
    context.setFontSize(appStore.locale === 'zh-CN' ? 42 : 36)
    const quoteLines = wrapTextByWidth(context, quote.content, 640, appStore.locale === 'zh-CN' ? 3 : 4)
    quoteLines.forEach((line, index) => {
      fillCenteredText(context, line, centerX, 1188 + index * 70)
    })

    context.setFillStyle('rgba(255,255,255,0.7)')
    context.setFontSize(26)
    fillCenteredText(context, `- ${quote.author} -`, centerX, 1188 + quoteLines.length * 70 + 48)

    context.setFillStyle('rgba(255,255,255,0.5)')
    context.setFontSize(24)
    fillCenteredText(context, 'TimeFlow', centerX, 1452)

    const tempFilePath = await withTimeout(
      new Promise<string>((resolve, reject) => {
        context.draw(false, () => {
          setTimeout(() => {
            uni.canvasToTempFilePath(
              {
                canvasId,
                width,
                height,
                destWidth: width,
                destHeight: height,
                success: ({ tempFilePath }) => resolve(tempFilePath),
                fail: reject
              },
              instance?.proxy
            )
          }, 240)
        })
      }),
      6000,
      ''
    )

    if (!tempFilePath) {
      throw new Error('poster-timeout')
    }

    posterPath.value = tempFilePath
    posterVisible.value = true
  } catch (error) {
    uni.showToast({
      title: 'Poster failed',
      icon: 'none'
    })
  } finally {
    posterBuilding.value = false
    uni.hideLoading()
  }
}

function savePoster() {
  if (!posterPath.value) return
  uni.saveImageToPhotosAlbum({
    filePath: posterPath.value,
    success: () => {
      uni.showToast({
        title: 'Saved',
        icon: 'none'
      })
    }
  })
}

function closePoster() {
  posterVisible.value = false
}

function resetShellScroll() {
  setTimeout(() => {
    uni.pageScrollTo({
      scrollTop: 0,
      duration: 0
    })
  }, 0)
}

function handleTabChange(nextTab: 'home' | 'calendar' | 'statistics' | 'profile') {
  if (nextTab === activeTab.value) return

  activeTab.value = nextTab
  resetShellScroll()
}
</script>

<template>
  <AppShell
    :title="shellTitle"
    :subtitle="shellSubtitle"
    :current-tab="activeTab"
    :show-dock="!sheetVisible && !posterVisible"
    :persistent-tabs="true"
    @change-tab="handleTabChange"
  >
    <template #header-extra>
      <view v-if="activeTab === 'home'" class="report-card glass-card" @tap="buildPoster">
        <view class="report-card__chart">
          <EchartBox :option="sharePieOption" height="120rpx" />
        </view>
        <text class="report-card__caption">{{ Math.round(completionRate * 100) }}%</text>
      </view>
    </template>

    <view v-if="activeTab === 'home'" class="dashboard-page">
      <view class="hero glass-card">
        <image class="hero__wallpaper" :src="appStore.wallpaper.url" mode="aspectFill" />
        <view class="hero__mask" />
        <view class="hero__content">
          <text class="hero__eyebrow">{{ todayDateLabel }}</text>
          <text class="hero__title">{{ todayStats.completedCount }}/{{ todayStats.totalPlanned || 0 }}</text>
          <text class="hero__description">{{ appStore.t('ofTodayDone') }}</text>
        </view>
      </view>

      <view class="stats-row">
        <view class="stats-card glass-card">
          <text class="stats-card__value">{{ todayStats.totalPlanned }}</text>
          <text class="stats-card__label">{{ appStore.t('totalPlan') }}</text>
        </view>
        <view class="stats-card glass-card">
          <text class="stats-card__value">{{ todayStats.completedCount }}</text>
          <text class="stats-card__label">{{ appStore.t('completed') }}</text>
        </view>
        <view class="stats-card glass-card">
          <text class="stats-card__value">{{ todayStats.totalFocusMinutes }}</text>
          <text class="stats-card__label">{{ appStore.t('totalFocus') }}</text>
        </view>
      </view>

      <view v-if="todayTasks.length" class="task-list">
        <TaskCard
          v-for="task in todayTasks"
          :key="task.id"
          :task="task"
          :busy="taskStore.isTaskPending(task.id)"
          @open="openTask(task.id)"
          @delete="deleteTask(task.id)"
        />
      </view>

      <view v-else class="empty glass-card">
        <view class="empty__orb empty__orb--mint" />
        <view class="empty__orb empty__orb--blue" />
        <text class="empty__eyebrow">{{ appStore.t('addTask') }}</text>
        <text class="empty__title">{{ appStore.t('emptyToday') }}</text>
        <text class="empty__caption">{{ appStore.t('emptyTodayHint') }}</text>
      </view>

      <view class="fab" @tap="sheetVisible = true">
        <text class="fab__plus">+</text>
      </view>

      <AddTaskSheet
        :visible="sheetVisible"
        :submitting="taskStore.creatingTask"
        @close="sheetVisible = false"
        @submit="createTask"
      />

      <view v-if="posterVisible" class="poster-sheet">
        <view class="poster-sheet__mask" @tap="closePoster" />
        <image class="poster-sheet__backdrop" :src="appStore.wallpaper.url" mode="aspectFill" />
        <view class="poster-sheet__veil" />

        <view class="poster-sheet__panel">
          <view class="poster-sheet__ambient poster-sheet__ambient--mint" />
          <view class="poster-sheet__ambient poster-sheet__ambient--blue" />
          <view class="poster-sheet__topbar">
            <view class="poster-sheet__title-block">
              <text class="poster-sheet__eyebrow">{{ appStore.t('todayReport') }}</text>
              <text class="poster-sheet__headline">{{ todayDateLabel }}</text>
            </view>
            <view class="poster-sheet__close" @tap="closePoster">×</view>
          </view>

          <view class="poster-sheet__frame">
            <image class="poster-sheet__image" :src="posterPath" mode="aspectFit" />
          </view>

          <text class="poster-sheet__hint">{{ appStore.t('posterHint') }}</text>

          <view class="poster-sheet__actions">
            <button class="poster-sheet__ghost" @tap="buildPoster">{{ appStore.t('refreshPoster') }}</button>
            <button class="poster-sheet__button" @tap="savePoster">{{ appStore.t('savePoster') }}</button>
          </view>
        </view>
      </view>
    </view>

    <view v-else-if="activeTab === 'calendar'" class="dashboard-page">
      <CalendarPanel />
    </view>

    <view v-else-if="activeTab === 'statistics'" class="dashboard-page">
      <StatisticsPanel />
    </view>

    <view v-else class="dashboard-page">
      <ProfilePanel />
    </view>

    <canvas canvas-id="timeflowPoster" id="timeflowPoster" class="poster-canvas" />
  </AppShell>
</template>

<style scoped lang="scss">
.dashboard-page {
  width: 100%;
}

.report-card {
  width: 128rpx;
  padding: 10rpx 0 12rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}

.report-card__chart {
  width: 88rpx;
  height: 88rpx;
}

.report-card__caption {
  color: var(--tf-text-primary);
  font-size: 24rpx;
  font-weight: 600;
}

.hero {
  position: relative;
  overflow: hidden;
  min-height: 280rpx;
  margin-bottom: 24rpx;
}

.hero__wallpaper,
.hero__mask {
  position: absolute;
  inset: 0;
}

.hero__wallpaper {
  width: 100%;
  height: 100%;
}

.hero__mask {
  background: linear-gradient(135deg, rgba(16, 24, 33, 0.28), rgba(19, 37, 54, 0.12));
}

.hero__content {
  position: relative;
  padding: 32rpx;
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.hero__eyebrow {
  color: rgba(255, 255, 255, 0.86);
  font-size: 24rpx;
}

.hero__title {
  color: #fff;
  font-size: 88rpx;
  font-weight: 700;
  line-height: 1;
}

.hero__description {
  color: rgba(255, 255, 255, 0.82);
  font-size: 26rpx;
}

.stats-row {
  display: flex;
  gap: 16rpx;
  margin-bottom: 24rpx;
}

.stats-card {
  flex: 1;
  padding: 24rpx 18rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.stats-card__value {
  color: var(--tf-text-primary);
  font-size: 46rpx;
  font-weight: 700;
}

.stats-card__label {
  color: var(--tf-text-secondary);
  font-size: 22rpx;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.empty {
  position: relative;
  overflow: hidden;
  padding: 40rpx 30rpx;
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.empty__orb {
  position: absolute;
  border-radius: 999rpx;
  filter: blur(18rpx);
  opacity: 0.75;
}

.empty__orb--mint {
  left: -30rpx;
  bottom: -40rpx;
  width: 180rpx;
  height: 180rpx;
  background: rgba(168, 230, 207, 0.18);
}

.empty__orb--blue {
  top: -20rpx;
  right: 12rpx;
  width: 140rpx;
  height: 140rpx;
  background: rgba(122, 179, 239, 0.12);
}

.empty__eyebrow {
  position: relative;
  color: var(--tf-text-muted);
  font-size: 22rpx;
  letter-spacing: 2rpx;
}

.empty__title {
  position: relative;
  color: var(--tf-text-primary);
  font-size: 28rpx;
  line-height: 1.7;
  font-weight: 600;
}

.empty__caption {
  position: relative;
  max-width: 520rpx;
  color: var(--tf-text-secondary);
  font-size: 23rpx;
  line-height: 1.8;
  opacity: 0.88;
}

.fab {
  position: fixed;
  right: 34rpx;
  bottom: calc(166rpx + env(safe-area-inset-bottom));
  width: 112rpx;
  height: 112rpx;
  border-radius: 999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #a8e6cf, #7ab3ef);
  box-shadow: 0 24rpx 60rpx rgba(122, 179, 239, 0.36);
  z-index: 40;
}

.fab__plus {
  color: #173349;
  font-size: 66rpx;
  line-height: 1;
}

.poster-sheet {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 24rpx;
}

.poster-sheet__mask {
  position: absolute;
  inset: 0;
  background: rgba(7, 12, 20, 0.52);
}

.poster-sheet__backdrop,
.poster-sheet__veil {
  position: absolute;
  inset: 0;
}

.poster-sheet__backdrop {
  width: 100%;
  height: 100%;
  filter: blur(24rpx);
  transform: scale(1.06);
}

.poster-sheet__veil {
  background:
    radial-gradient(circle at top right, rgba(122, 179, 239, 0.22), transparent 28%),
    radial-gradient(circle at left 18%, rgba(168, 230, 207, 0.22), transparent 26%),
    rgba(12, 18, 28, 0.44);
}

.poster-sheet__panel {
  position: relative;
  width: 100%;
  max-height: calc(100vh - 80rpx);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 28rpx 24rpx calc(24rpx + env(safe-area-inset-bottom));
  border-radius: 40rpx;
  background: rgba(16, 24, 36, 0.48);
  border: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow: 0 36rpx 100rpx rgba(4, 10, 20, 0.32);
  backdrop-filter: blur(40rpx) saturate(145%);
}

.poster-sheet__ambient {
  position: absolute;
  border-radius: 999rpx;
  filter: blur(40rpx);
  opacity: 0.78;
  pointer-events: none;
}

.poster-sheet__ambient--mint {
  top: -48rpx;
  left: -28rpx;
  width: 220rpx;
  height: 220rpx;
  background: rgba(168, 230, 207, 0.24);
}

.poster-sheet__ambient--blue {
  right: -36rpx;
  top: 180rpx;
  width: 260rpx;
  height: 260rpx;
  background: rgba(122, 179, 239, 0.22);
}

.poster-sheet__topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
}

.poster-sheet__title-block {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.poster-sheet__eyebrow {
  color: rgba(255, 255, 255, 0.64);
  font-size: 22rpx;
  letter-spacing: 2rpx;
}

.poster-sheet__headline {
  color: #fff;
  font-size: 40rpx;
  font-weight: 700;
}

.poster-sheet__close {
  width: 64rpx;
  height: 64rpx;
  border-radius: 999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 38rpx;
  background: rgba(255, 255, 255, 0.08);
}

.poster-sheet__frame {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 24rpx;
  padding: 14rpx;
  border-radius: 38rpx;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  overflow: hidden;
  backdrop-filter: blur(20rpx);
}

.poster-sheet__image {
  position: relative;
  width: 100%;
  height: 960rpx;
  border-radius: 30rpx;
  box-shadow: 0 28rpx 80rpx rgba(2, 8, 18, 0.36);
}

.poster-sheet__hint {
  display: block;
  margin-top: 18rpx;
  color: rgba(255, 255, 255, 0.7);
  text-align: center;
  font-size: 24rpx;
  line-height: 1.5;
}

.poster-sheet__actions {
  display: flex;
  gap: 16rpx;
  margin-top: 20rpx;
}

.poster-sheet__ghost,
.poster-sheet__button {
  flex: 1;
  height: 90rpx;
  border-radius: 26rpx;
  padding: 0;
  border: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  font-weight: 600;
  line-height: 1;
}

.poster-sheet__ghost::after,
.poster-sheet__button::after {
  border: 0;
}

.poster-sheet__ghost {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(20rpx);
}

.poster-sheet__button {
  color: #173349;
  background: linear-gradient(135deg, #a8e6cf, #7ab3ef);
  box-shadow: 0 20rpx 40rpx rgba(122, 179, 239, 0.24);
}

.poster-canvas {
  position: fixed;
  left: -2000px;
  top: -2000px;
  width: 900px;
  height: 1560px;
}
</style>
