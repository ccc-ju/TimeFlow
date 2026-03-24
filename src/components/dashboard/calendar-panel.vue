<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTaskStore } from '@/store/tasks'

import { useAppStore } from '@/store/app'
import { formatClock, formatFocusMinutes, formatFullDate, formatMonthLabel, shiftMonth, toDayKey } from '@/utils/date'
import { haptic } from '@/utils/feedback'
import type { Task } from '@/types/timeflow'

const appStore = useAppStore()
const taskStore = useTaskStore()
const CELL_HEIGHT = 94
const CELL_GAP = 10
const WEEKDAY_HEIGHT = 42

const monthCursor = ref(toDayKey())
const selectedDay = ref(toDayKey())
const isCollapsed = ref(true)
const rowOffsets = ref<Record<string, number>>({})
const activeSwipeId = ref('')
const touchStartX = ref(0)
const touchStartOffset = ref(0)
const deletingTaskId = ref('')

const OPEN_OFFSET = 112
const MAX_DRAG = 156

const calendarCells = computed(() => taskStore.monthGrid(monthCursor.value))
const tasksOfDay = computed(() => taskStore.tasksForDate(selectedDay.value))
const monthLabel = computed(() => formatMonthLabel(monthCursor.value, appStore.locale))
const dayLabel = computed(() => formatFullDate(selectedDay.value, appStore.locale))
const toggleCalendarLabel = computed(() => appStore.t(isCollapsed.value ? 'expandCalendar' : 'collapseCalendar'))
const collapseProgress = computed(() => (isCollapsed.value ? 1 : 0))
const rowCount = computed(() => Math.ceil(calendarCells.value.length / 7))
const selectedIndex = computed(() =>
  Math.max(
    0,
    calendarCells.value.findIndex((cell) => cell.dayKey === selectedDay.value)
  )
)
const selectedRow = computed(() => Math.floor(selectedIndex.value / 7))
const fullGridHeight = computed(() => rowCount.value * CELL_HEIGHT + (rowCount.value - 1) * CELL_GAP)
const collapsedGridHeight = CELL_HEIGHT
const gridHeight = computed(
  () => fullGridHeight.value - (fullGridHeight.value - collapsedGridHeight) * collapseProgress.value
)
const gridTranslate = computed(() => -selectedRow.value * (CELL_HEIGHT + CELL_GAP) * collapseProgress.value)
const weekdaysStyle = computed(() => ({
  opacity: `${1 - collapseProgress.value}`,
  height: `${WEEKDAY_HEIGHT - WEEKDAY_HEIGHT * collapseProgress.value}rpx`,
  marginBottom: `${12 - 12 * collapseProgress.value}rpx`
}))
const selectedSummary = computed(() => {
  const taskCount = tasksOfDay.value.length
  const focusMinutes = tasksOfDay.value.reduce((sum, task) => sum + Math.round(task.focusSeconds / 60), 0)
  return `${taskCount} ${appStore.t('tasksLabel')} · ${focusMinutes} ${appStore.t('minutesUnit')}`
})

function taskModeSummary(timerMode: 'countup' | 'countdown' | 'notimer', durationSeconds: number) {
  if (timerMode === 'countdown') return formatClock(durationSeconds)
  if (timerMode === 'notimer') return appStore.t('noTimerMode')
  return appStore.t('countup')
}

function taskRuntime(task: Task) {
  return taskStore.taskRuntimeMap[task.id] || {
    running: false,
    liveSeconds: 0,
    effectiveFocusSeconds: task.focusSeconds,
    displaySeconds: task.timerMode === 'countdown' ? task.durationSeconds : task.focusSeconds
  }
}

function taskDetailSummary(task: Task) {
  const runtime = taskRuntime(task)
  if (task.timerMode === 'notimer') return appStore.t('noTimerMode')
  if (task.timerMode === 'countdown') return formatClock(runtime.displaySeconds)
  return formatClock(runtime.effectiveFocusSeconds)
}

function taskFocusSummary(task: Task) {
  return `${formatFocusMinutes(taskRuntime(task).effectiveFocusSeconds)} ${appStore.t('minutesUnit')}`
}

function isTaskRunning(task: Task) {
  return taskRuntime(task).running
}

function moveMonth(offset: number) {
  resetSwipeRows()
  monthCursor.value = shiftMonth(monthCursor.value, offset)
}

function getMonthStart(dayKey: string) {
  const [year, month] = dayKey.split('-')
  return `${year}-${month}-01`
}

function selectDay(dayKey: string) {
  resetSwipeRows()
  selectedDay.value = dayKey
  const monthStart = getMonthStart(dayKey)
  if (monthStart !== monthCursor.value) {
    monthCursor.value = monthStart
  }
}

function cellStyle(index: number) {
  const row = Math.floor(index / 7)
  const distance = Math.abs(row - selectedRow.value)
  const fade = row === selectedRow.value ? 1 : Math.max(0, 1 - collapseProgress.value * (0.9 + distance * 0.16))
  const scale = row === selectedRow.value ? 1 : 1 - collapseProgress.value * 0.08
  return {
    opacity: `${fade}`,
    transform: `scale(${scale})`
  }
}

function openTask(taskId: string) {
  if ((rowOffsets.value[taskId] || 0) < -20) {
    setRowOffset(taskId, 0)
    activeSwipeId.value = ''
    return
  }

  uni.navigateTo({
    url: `/pages/task-detail/index?id=${taskId}`
  })
}

function setRowOffset(taskId: string, value: number) {
  rowOffsets.value = {
    ...rowOffsets.value,
    [taskId]: value
  }
}

function resetSwipeRows(exceptId = '') {
  rowOffsets.value = Object.keys(rowOffsets.value).reduce<Record<string, number>>((accumulator, taskId) => {
    accumulator[taskId] = taskId === exceptId ? rowOffsets.value[taskId] || 0 : 0
    return accumulator
  }, {})
}

function rowOffset(taskId: string) {
  return rowOffsets.value[taskId] || 0
}

function rowRevealStyle(taskId: string) {
  const progress = Math.min(Math.abs(rowOffset(taskId)) / OPEN_OFFSET, 1)
  return {
    transform: `translateX(${(1 - progress) * 42}rpx) scale(${0.9 + progress * 0.1})`,
    opacity: `${0.36 + progress * 0.64}`
  }
}

function onRowTouchStart(event: TouchEvent, taskId: string) {
  if (deletingTaskId.value) return
  if (activeSwipeId.value && activeSwipeId.value !== taskId) {
    resetSwipeRows(taskId)
  }

  activeSwipeId.value = taskId
  touchStartX.value = event.touches[0].clientX
  touchStartOffset.value = rowOffset(taskId)
}

function onRowTouchMove(event: TouchEvent, taskId: string) {
  if (deletingTaskId.value) return

  const delta = event.touches[0].clientX - touchStartX.value + touchStartOffset.value
  const limited = Math.max(-MAX_DRAG, Math.min(0, delta))
  const nextOffset = limited < -OPEN_OFFSET ? -OPEN_OFFSET + (limited + OPEN_OFFSET) * 0.35 : limited

  resetSwipeRows(taskId)
  setRowOffset(taskId, nextOffset)
}

function onRowTouchEnd(taskId: string) {
  if (deletingTaskId.value) return
  const nextOffset = rowOffset(taskId) < -48 ? -OPEN_OFFSET : 0
  setRowOffset(taskId, nextOffset)
  activeSwipeId.value = nextOffset ? taskId : ''
}

async function deleteTask(taskId: string) {
  if (deletingTaskId.value || taskStore.isTaskPending(taskId)) return

  const result = await uni.showModal({
    title: 'TimeFlow',
    content: appStore.t('confirmDelete'),
    confirmText: appStore.t('confirmDeleteAction'),
    cancelText: appStore.t('cancel'),
    confirmColor: '#FF8B94'
  })

  if (!result.confirm) {
    setRowOffset(taskId, 0)
    activeSwipeId.value = ''
    return
  }

  deletingTaskId.value = taskId

  try {
    await taskStore.deleteTask(taskId)
    haptic('medium')
    uni.showToast({
      title: appStore.t('taskDeleted'),
      icon: 'none'
    })
  } catch (error) {
    uni.showToast({
      title: appStore.t('updateFailed'),
      icon: 'none'
    })
  } finally {
    deletingTaskId.value = ''
    resetSwipeRows()
    activeSwipeId.value = ''
  }
}
</script>

<template>
  <view class="calendar-wrap">
    <view class="calendar glass-card">
      <view class="calendar__header">
        <view class="calendar__title-group">
          <text class="calendar__month">{{ monthLabel }}</text>
          <text class="calendar__summary" :style="{ opacity: `${collapseProgress}` }">{{ selectedSummary }}</text>
        </view>
        <view class="calendar__actions">
          <view class="calendar__toggle" @tap="isCollapsed = !isCollapsed">
            <text class="calendar__toggle-icon">{{ isCollapsed ? '↓' : '↑' }}</text>
            <text class="calendar__toggle-text">{{ toggleCalendarLabel }}</text>
          </view>
          <text class="calendar__arrow" @tap="moveMonth(-1)">‹</text>
          <text class="calendar__arrow" @tap="moveMonth(1)">›</text>
        </view>
      </view>

      <view class="calendar__weekdays" :style="weekdaysStyle">
        <text v-for="item in ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']" :key="item">{{ item }}</text>
      </view>

      <view class="calendar__viewport" :style="{ height: `${gridHeight}rpx` }">
        <view class="calendar__grid" :style="{ transform: `translateY(${gridTranslate}rpx)` }">
          <view
            v-for="(cell, index) in calendarCells"
            :key="cell.dayKey"
            :class="[
              'calendar__cell',
              {
                'calendar__cell--muted': !cell.currentMonth,
                'calendar__cell--active': selectedDay === cell.dayKey,
                'calendar__cell--today': cell.isToday
              }
            ]"
            :style="cellStyle(index)"
            @tap="selectDay(cell.dayKey)"
          >
            <text>{{ cell.label }}</text>
            <view v-if="taskStore.completedDateMap[cell.dayKey]" class="calendar__dot" />
          </view>
        </view>
      </view>
    </view>
  </view>

  <view class="review glass-card">
    <text class="review__title">{{ dayLabel }}</text>
    <view v-if="tasksOfDay.length" class="review__list">
      <view v-for="task in tasksOfDay" :key="task.id" class="review__row">
        <view class="review__delete" :style="rowRevealStyle(task.id)" @tap.stop="deleteTask(task.id)">
          <text class="review__delete-icon">×</text>
          <text class="review__delete-text">{{ appStore.t('deleteAction') }}</text>
        </view>
        <view
          :class="['review__item', 'glass-card', { 'review__item--busy': deletingTaskId === task.id || taskStore.isTaskPending(task.id) }]"
          :style="{ transform: `translateX(${rowOffset(task.id)}rpx)` }"
          @touchstart.passive="onRowTouchStart($event, task.id)"
          @touchmove.prevent="onRowTouchMove($event, task.id)"
          @touchend="onRowTouchEnd(task.id)"
          @tap="openTask(task.id)"
        >
          <view :class="['review__status-dot', { 'review__status-dot--done': task.status === 'done', 'review__status-dot--busy': deletingTaskId === task.id || isTaskRunning(task) }]">
            <view v-if="deletingTaskId === task.id || isTaskRunning(task)" class="review__spinner" />
            <text v-else-if="task.status === 'done'" class="review__status-check">✓</text>
          </view>

          <view class="review__content">
            <text class="review__task">{{ task.title }}</text>
            <view class="review__meta-row">
              <text class="review__chip">{{ taskModeSummary(task.timerMode, task.durationSeconds) }}</text>
              <text class="review__chip">{{ taskDetailSummary(task) }}</text>
              <text class="review__focus">{{ taskFocusSummary(task) }}</text>
            </view>
          </view>

          <view class="review__pill">
            <text>{{ task.status === 'done' ? appStore.t('completed') : isTaskRunning(task) ? appStore.t('running') : appStore.t('pending') }}</text>
          </view>
        </view>
      </view>
    </view>
    <view v-else class="review__empty">
      <text>{{ appStore.t('noTasksOnDay') }}</text>
    </view>
  </view>
</template>

<style scoped lang="scss">
.calendar-wrap {
  margin-bottom: 24rpx;
  padding-top: 4rpx;
}

.calendar,
.review {
  padding: 26rpx;
}

.calendar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18rpx;
  gap: 18rpx;
}

.calendar__title-group {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.calendar__summary {
  color: var(--tf-text-secondary);
  font-size: 22rpx;
  transition: opacity 0.22s ease;
}

.calendar__actions {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.calendar__toggle {
  min-height: 68rpx;
  padding: 0 20rpx;
  border-radius: 999rpx;
  display: flex;
  align-items: center;
  gap: 8rpx;
  color: var(--tf-text-primary);
  background: var(--tf-control-surface-strong);
}

.calendar__toggle-icon {
  font-size: 22rpx;
  line-height: 1;
}

.calendar__toggle-text {
  font-size: 22rpx;
  font-weight: 600;
  line-height: 1;
}

.calendar__arrow {
  width: 68rpx;
  height: 68rpx;
  border-radius: 999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--tf-text-primary);
  background: var(--tf-control-surface-strong);
  font-size: 42rpx;
}

.calendar__month {
  color: var(--tf-text-primary);
  font-size: 36rpx;
  font-weight: 700;
}

.calendar__weekdays,
.calendar__grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}

.calendar__weekdays {
  overflow: hidden;
  color: var(--tf-text-muted);
  font-size: 22rpx;
  text-align: center;
  transition:
    opacity 0.22s ease,
    height 0.22s cubic-bezier(0.22, 1, 0.36, 1),
    margin-bottom 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}

.calendar__viewport {
  overflow: hidden;
  transition: height 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}

.calendar__grid {
  gap: 10rpx;
  transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}

.calendar__cell {
  min-height: 94rpx;
  padding: 14rpx 0;
  border-radius: 24rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  color: var(--tf-text-primary);
  background: var(--tf-control-surface);
  transform-origin: center center;
  transition:
    opacity 0.22s ease,
    transform 0.22s cubic-bezier(0.22, 1, 0.36, 1),
    background 0.24s ease;
}

.calendar__cell--muted {
  color: var(--tf-text-muted);
}

.calendar__cell--active {
  background: linear-gradient(135deg, rgba(168, 230, 207, 0.48), rgba(122, 179, 239, 0.38));
}

.calendar__cell--today {
  border: 1px solid rgba(122, 179, 239, 0.28);
}

.calendar__dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 999rpx;
  background: #7ab3ef;
}

.review__title {
  display: block;
  margin-bottom: 20rpx;
  color: var(--tf-text-primary);
  font-size: 34rpx;
  font-weight: 700;
}

.review__list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.review__row {
  position: relative;
  min-height: 170rpx;
  overflow: hidden;
  border-radius: 34rpx;
}

.review__delete {
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

.review__delete-icon {
  font-size: 44rpx;
  line-height: 1;
}

.review__delete-text {
  font-size: 22rpx;
}

.review__item {
  width: 100%;
  min-height: 170rpx;
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 22rpx 24rpx;
  border-radius: 34rpx;
  transition:
    transform 0.22s ease,
    opacity 0.2s ease;
}

.review__item--busy {
  opacity: 0.72;
}

.review__status-dot {
  width: 42rpx;
  height: 42rpx;
  border-radius: 999rpx;
  border: 2rpx solid rgba(122, 179, 239, 0.38);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--tf-control-surface);
  flex-shrink: 0;
}

.review__status-dot--done {
  background: linear-gradient(135deg, #a8e6cf, #7ab3ef);
  border-color: transparent;
}

.review__status-dot--busy {
  background: var(--tf-control-surface-strong);
  border-color: rgba(122, 179, 239, 0.2);
}

.review__status-check {
  color: #173349;
  font-size: 22rpx;
  font-weight: 700;
}

.review__spinner {
  width: 20rpx;
  height: 20rpx;
  border-radius: 999rpx;
  border: 3rpx solid rgba(122, 179, 239, 0.18);
  border-top-color: #7ab3ef;
  animation: review-status-spin 0.8s linear infinite;
}

.review__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.review__task {
  color: var(--tf-text-primary);
  font-size: 32rpx;
  font-weight: 600;
}

.review__meta-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10rpx;
}

.review__chip,
.review__focus {
  padding: 8rpx 18rpx;
  border-radius: 999rpx;
  color: var(--tf-text-secondary);
  font-size: 22rpx;
  background: var(--tf-control-surface-strong);
}

.review__pill {
  padding: 12rpx 16rpx;
  border-radius: 20rpx;
  font-size: 22rpx;
  color: var(--tf-text-secondary);
  background: var(--tf-control-surface-strong);
  flex-shrink: 0;
}

.review__empty {
  padding: 24rpx 0 8rpx;
  color: var(--tf-text-secondary);
  font-size: 24rpx;
}

@keyframes review-status-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>
