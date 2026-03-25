<script setup lang="ts">
import { computed, ref } from 'vue'

import { useAppStore } from '@/store/app'
import { useTaskStore } from '@/store/tasks'
import type { Task } from '@/types/timeflow'
import { formatClock, formatFocusMinutes } from '@/utils/date'

const props = defineProps<{
  task: Task
  busy?: boolean
}>()

const emit = defineEmits<{
  (event: 'open'): void
  (event: 'delete'): void
}>()

const appStore = useAppStore()
const taskStore = useTaskStore()
const offset = ref(0)
const startX = ref(0)
const startY = ref(0)
const startOffset = ref(0)
const horizontalSwipeActive = ref(false)
const OPEN_OFFSET = 112
const MAX_DRAG = 156

const revealProgress = computed(() => Math.min(Math.abs(offset.value) / OPEN_OFFSET, 1))
const deleteStyle = computed(() => ({
  transform: `translateX(${(1 - revealProgress.value) * 42}rpx) scale(${0.9 + revealProgress.value * 0.1})`,
  opacity: `${0.36 + revealProgress.value * 0.64}`
}))
const runtime = computed(() => taskStore.taskRuntimeMap[props.task.id] || {
  running: false,
  liveSeconds: 0,
  effectiveFocusSeconds: props.task.focusSeconds,
  displaySeconds: props.task.timerMode === 'countdown' ? props.task.durationSeconds : props.task.focusSeconds
})
const isRunning = computed(() => runtime.value.running)

const timerModeLabel = computed(() =>
  props.task.timerMode === 'countdown'
    ? appStore.t('countdown')
    : props.task.timerMode === 'notimer'
      ? appStore.t('noTimerMode')
      : appStore.t('countup')
)

const detailLabel = computed(() => {
  if (props.task.timerMode === 'notimer') return appStore.t('noTimerMode')
  if (props.task.timerMode === 'countdown') return formatClock(runtime.value.displaySeconds)
  return formatClock(runtime.value.effectiveFocusSeconds)
})

function onTouchStart(event: TouchEvent) {
  if (props.busy) return
  startX.value = event.touches[0].clientX
  startY.value = event.touches[0].clientY
  startOffset.value = offset.value
  horizontalSwipeActive.value = false
}

function onTouchMove(event: TouchEvent) {
  if (props.busy) return
  const deltaX = event.touches[0].clientX - startX.value
  const deltaY = event.touches[0].clientY - startY.value

  if (!horizontalSwipeActive.value) {
    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      return
    }

    if (Math.abs(deltaX) < 8) {
      return
    }

    horizontalSwipeActive.value = true
  }

  event.preventDefault()
  const delta = deltaX + startOffset.value
  const limited = Math.max(-MAX_DRAG, Math.min(0, delta))
  offset.value = limited < -OPEN_OFFSET ? -OPEN_OFFSET + (limited + OPEN_OFFSET) * 0.35 : limited
}

function onTouchEnd() {
  if (props.busy) return
  offset.value = offset.value < -48 ? -OPEN_OFFSET : 0
  horizontalSwipeActive.value = false
}

function openCard() {
  if (props.busy) return
  if (offset.value < -20) {
    offset.value = 0
    return
  }

  emit('open')
}
</script>

<template>
  <view class="task-card">
    <view class="task-card__delete" :style="deleteStyle" @tap="!busy && emit('delete')">
      <text class="task-card__delete-icon">×</text>
      <text class="task-card__delete-text">{{ appStore.t('deleteAction') }}</text>
    </view>
    <view
      :class="['task-card__inner glass-card', { 'task-card__inner--busy': busy }]"
      :style="{ transform: `translateX(${offset}rpx)` }"
      @touchstart.passive="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @tap="openCard"
    >
      <view :class="['task-card__status', { 'task-card__status--done': task.status === 'done', 'task-card__status--busy': busy || isRunning }]">
        <view v-if="busy || isRunning" class="task-card__spinner" />
        <text v-else-if="task.status === 'done'" class="task-card__status-check">✓</text>
      </view>

      <view class="task-card__content">
        <text class="task-card__title">{{ task.title }}</text>
        <view class="task-card__meta">
          <text class="task-card__chip">{{ timerModeLabel }}</text>
          <text class="task-card__chip">{{ detailLabel }}</text>
          <text class="task-card__focus">{{ formatFocusMinutes(runtime.effectiveFocusSeconds) }} {{ appStore.t('minutesUnit') }}</text>
        </view>
      </view>

      <view class="task-card__pill">
        <text>{{ task.status === 'done' ? appStore.t('completed') : isRunning ? appStore.t('running') : appStore.t('pending') }}</text>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.task-card {
  position: relative;
  min-height: 170rpx;
  overflow: hidden;
  border-radius: 34rpx;
}

.task-card__delete {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 132rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  color: #fff;
  background: linear-gradient(180deg, #ff9ba2, #ff6f7d);
  transform-origin: right center;
  transition:
    transform 0.18s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.18s ease;
}

.task-card__delete-icon {
  font-size: 44rpx;
  line-height: 1;
}

.task-card__delete-text {
  font-size: 22rpx;
}

.task-card__inner {
  min-height: 170rpx;
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 22rpx 24rpx;
  transition: transform 0.22s ease;
}

.task-card__inner--busy {
  opacity: 0.78;
}

.task-card__status {
  width: 42rpx;
  height: 42rpx;
  border-radius: 999rpx;
  border: 2rpx solid rgba(122, 179, 239, 0.38);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--tf-control-surface);
}

.task-card__status--done {
  background: linear-gradient(135deg, #a8e6cf, #7ab3ef);
  border-color: transparent;
}

.task-card__status--busy {
  background: var(--tf-control-surface-strong);
  border-color: rgba(122, 179, 239, 0.2);
}

.task-card__status-check {
  color: #173349;
  font-size: 22rpx;
  font-weight: 700;
}

.task-card__spinner {
  width: 20rpx;
  height: 20rpx;
  border-radius: 999rpx;
  border: 3rpx solid rgba(122, 179, 239, 0.18);
  border-top-color: #7ab3ef;
  animation: status-spin 0.8s linear infinite;
}

.task-card__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.task-card__title {
  color: var(--tf-text-primary);
  font-size: 32rpx;
  font-weight: 600;
}

.task-card__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10rpx;
}

.task-card__chip,
.task-card__focus {
  padding: 8rpx 18rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  color: var(--tf-text-secondary);
  background: var(--tf-control-surface-strong);
}

.task-card__pill {
  padding: 12rpx 16rpx;
  border-radius: 20rpx;
  font-size: 22rpx;
  color: var(--tf-text-secondary);
  background: var(--tf-control-surface-strong);
}

@keyframes status-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>
