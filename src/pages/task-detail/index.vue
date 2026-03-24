<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'

import AddTaskSheet from '@/components/home/add-task-sheet.vue'
import { useAppStore } from '@/store/app'
import { useTaskStore } from '@/store/tasks'
import { formatClock, formatFocusMinutes } from '@/utils/date'
import { haptic, notifyDone } from '@/utils/feedback'

const appStore = useAppStore()
const taskStore = useTaskStore()

const systemInfo = uni.getSystemInfoSync()
const safeTopInset = systemInfo.safeAreaInsets?.top ?? systemInfo.statusBarHeight ?? 0
const safeBottomInset = systemInfo.safeAreaInsets?.bottom ?? 0

const navStyle = computed(() => ({
  paddingTop: `${safeTopInset + 16}px`
}))

const contentStyle = computed(() => ({
  paddingBottom: `${safeBottomInset + 16}px`
}))

const bottomFillStyle = computed(() => ({
  height: `${safeBottomInset + 24}px`
}))

const taskId = ref('')
const editVisible = ref(false)

const task = computed(() => taskStore.tasks.find((item) => item.id === taskId.value))
const runtime = computed(() => {
  if (!task.value) {
    return {
      running: false,
      liveSeconds: 0,
      effectiveFocusSeconds: 0,
      displaySeconds: 0
    }
  }

  return taskStore.taskRuntimeMap[task.value.id] || {
    running: false,
    liveSeconds: 0,
    effectiveFocusSeconds: task.value.focusSeconds,
    displaySeconds: task.value.timerMode === 'countdown' ? task.value.durationSeconds : task.value.focusSeconds
  }
})
const isCompletedTask = computed(() => task.value?.status === 'done')
const isNoTimerTask = computed(() => task.value?.timerMode === 'notimer')
const isFutureTask = computed(() => {
  if (!task.value) return false
  return task.value.scheduledDate > taskStore.todayKey
})
const running = computed(() => runtime.value.running)
const hasProgress = computed(() => {
  if (!task.value) return false
  return runtime.value.effectiveFocusSeconds > 0
})
const canEditTask = computed(() => {
  if (!task.value) return false
  return task.value.status === 'pending' && task.value.focusSeconds === 0 && runtime.value.liveSeconds === 0 && !running.value
})
const displaySeconds = computed(() => {
  if (!task.value) return 0
  return runtime.value.displaySeconds
})
const timerModeLabel = computed(() => {
  if (!task.value) return ''
  return task.value.timerMode === 'countdown'
    ? appStore.t('countdown')
    : task.value.timerMode === 'notimer'
      ? appStore.t('noTimerMode')
      : appStore.t('countup')
})
const detailPrimaryText = computed(() => {
  if (!task.value) return ''
  if (isCompletedTask.value) {
    return formatClock(task.value.focusSeconds)
  }
  return isNoTimerTask.value ? appStore.t('noTimerTitle') : formatClock(displaySeconds.value)
})
const detailSecondaryText = computed(() => {
  if (!task.value) return ''
  if (isCompletedTask.value) {
    return `${appStore.t('taskUsedTime')} · ${formatFocusMinutes(task.value.focusSeconds)} ${appStore.t('minutesUnit')}`
  }
  if (isNoTimerTask.value) {
    return appStore.t('noTimerHint')
  }
  return `${appStore.t('focusAccumulated')} · ${formatFocusMinutes(runtime.value.effectiveFocusSeconds)} ${appStore.t('minutesUnit')}`
})
const editFormValue = computed(() => {
  if (!task.value) return null
  return {
    title: task.value.title,
    timerMode: task.value.timerMode,
    durationSeconds: task.value.durationSeconds,
    scheduledDate: task.value.scheduledDate
  }
})

async function beginTimer() {
  if (!task.value || running.value || isCompletedTask.value || isNoTimerTask.value) return

  const started = await taskStore.startTaskTimer(task.value.id)
  if (!started) return
  haptic()
}

async function pauseTimer() {
  if (!running.value) return
  await taskStore.pauseTaskTimer(task.value!.id, false)
  uni.showToast({
    title: appStore.t('timerPaused'),
    icon: 'none'
  })
}

async function finishTask() {
  if (!task.value || isCompletedTask.value) return
  await taskStore.finishTaskNow(task.value.id)
  notifyDone()
  uni.showToast({
    title: appStore.t('taskCompleted'),
    icon: 'none'
  })
  setTimeout(() => {
    uni.navigateBack()
  }, 320)
}

function backToList() {
  uni.navigateBack()
}

async function submitEdit(payload: {
  title: string
  timerMode: 'countup' | 'countdown' | 'notimer'
  durationSeconds: number
  scheduledDate: string
}) {
  if (!task.value || !canEditTask.value) return
  await taskStore.patchTask({
    ...task.value,
    title: payload.title,
    timerMode: payload.timerMode,
    durationSeconds: payload.durationSeconds,
    scheduledDate: payload.scheduledDate
  })
  editVisible.value = false
  haptic()
  uni.showToast({
    title: appStore.t('saveChanges'),
    icon: 'none'
  })
}

onLoad((query) => {
  taskId.value = `${query?.id || ''}`
})
</script>

<template>
  <view :class="['detail', appStore.themeClass]">
    <image class="detail__background" :src="task?.wallpaperUrl || appStore.wallpaper.url" mode="aspectFill" />
    <view class="detail__overlay" />
    <view class="detail__bottom-fill" :style="bottomFillStyle" />

    <view class="detail__nav" :style="navStyle">
      <text class="detail__back" @tap="backToList">‹</text>
      <text class="detail__nav-title">{{ appStore.t('taskDetail') }}</text>
      <text v-if="canEditTask" class="detail__edit" @tap="editVisible = true">{{ appStore.t('editTask') }}</text>
      <view v-else class="detail__spacer" />
    </view>

    <view v-if="task" :class="['detail__content', { 'detail__content--notimer': isNoTimerTask }]" :style="contentStyle">
      <text class="detail__task">{{ task.title }}</text>
      <text class="detail__mode">{{ timerModeLabel }}</text>

      <view v-if="!isNoTimerTask" class="detail__timer glass-card">
        <text :class="['detail__clock', { mono: !isNoTimerTask, 'detail__clock--text': isNoTimerTask }]">{{ detailPrimaryText }}</text>
        <text class="detail__focus">{{ detailSecondaryText }}</text>
      </view>

      <view v-if="!isCompletedTask && !isNoTimerTask && !isFutureTask" class="detail__actions">
        <button class="detail__secondary" @tap="running ? pauseTimer() : beginTimer()">
          {{ running ? appStore.t('pause') : hasProgress ? appStore.t('resume') : appStore.t('start') }}
        </button>
        <button class="detail__primary" @tap="finishTask">{{ appStore.t('finishTask') }}</button>
      </view>

      <view v-if="!isCompletedTask && isNoTimerTask && !isFutureTask" class="detail__actions">
        <button class="detail__secondary" @tap="backToList">{{ appStore.t('backToList') }}</button>
        <button class="detail__primary" @tap="finishTask">{{ appStore.t('finishTask') }}</button>
      </view>

      <button v-if="isCompletedTask || !isNoTimerTask || isFutureTask" class="detail__ghost" @tap="backToList">
        {{ appStore.t('backToList') }}
      </button>
    </view>

    <AddTaskSheet
      :visible="editVisible"
      :initial-value="editFormValue"
      :title-text="appStore.t('editTask')"
      :submit-text="appStore.t('saveChanges')"
      @close="editVisible = false"
      @submit="submitEdit"
    />
  </view>
</template>

<style scoped lang="scss">
.detail {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
}

.detail__background,
.detail__overlay {
  position: absolute;
  inset: 0;
}

.detail__background {
  width: 100%;
  height: 100%;
  filter: blur(24rpx);
  transform: scale(1.08);
}

.detail__overlay {
  background:
    linear-gradient(180deg, rgba(8, 13, 22, 0.28), rgba(8, 13, 22, 0.68)),
    radial-gradient(circle at top, rgba(122, 179, 239, 0.12), transparent 28%);
}

.detail__bottom-fill {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1;
  background: linear-gradient(180deg, rgba(8, 13, 22, 0), rgba(8, 13, 22, 0.74) 42%);
  pointer-events: none;
}

.detail__nav {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 32rpx 28rpx 0;
  color: #fff;
}

.detail__back,
.detail__spacer {
  width: 66rpx;
}

.detail__edit {
  min-width: 66rpx;
  color: rgba(255, 255, 255, 0.88);
  font-size: 26rpx;
  text-align: right;
}

.detail__back {
  font-size: 56rpx;
  line-height: 1;
}

.detail__nav-title {
  font-size: 28rpx;
  color: rgba(255, 255, 255, 0.78);
}

.detail__content {
  position: relative;
  z-index: 2;
  min-height: calc(100vh - 120rpx);
  padding: 160rpx 34rpx 32rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.detail__content--notimer {
  justify-content: space-between;
  padding-top: 220rpx;
}

.detail__task {
  color: #fff;
  font-size: 44rpx;
  font-weight: 700;
  text-align: center;
}

.detail__mode {
  margin-top: 12rpx;
  color: rgba(255, 255, 255, 0.74);
  font-size: 26rpx;
}

.detail__timer {
  width: 100%;
  margin-top: 68rpx;
  padding: 72rpx 24rpx;
  text-align: center;
}

.detail__clock {
  display: block;
  color: #fff;
  font-size: 88rpx;
  font-weight: 700;
}

.detail__clock--text {
  font-size: 56rpx;
  letter-spacing: 0;
}

.detail__focus {
  display: block;
  margin-top: 22rpx;
  color: rgba(255, 255, 255, 0.76);
  font-size: 26rpx;
}

.detail__actions {
  width: 100%;
  display: flex;
  gap: 18rpx;
  margin-top: 34rpx;
}

.detail__primary,
.detail__secondary,
.detail__ghost {
  width: 100%;
  height: 92rpx;
  padding: 0 24rpx;
  border-radius: 28rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  text-align: center;
  line-height: 1.1;
  font-size: 30rpx;
  font-weight: 600;
}

.detail__primary::after,
.detail__secondary::after,
.detail__ghost::after {
  border: 0;
}

.detail__secondary {
  flex: 1;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
}

.detail__primary {
  flex: 1;
  color: #173349;
  background: linear-gradient(135deg, #a8e6cf, #7ab3ef);
}

.detail__ghost {
  margin-top: 18rpx;
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.08);
}
</style>
