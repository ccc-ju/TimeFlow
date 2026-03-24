<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'

import AppShell from '@/components/layout/app-shell.vue'
import { useAppStore } from '@/store/app'
import { useTaskStore } from '@/store/tasks'
import { formatClock, formatFocusMinutes, formatFullDate, formatMonthLabel, shiftMonth, toDayKey } from '@/utils/date'

const appStore = useAppStore()
const taskStore = useTaskStore()
const CELL_HEIGHT = 94
const CELL_GAP = 10
const WEEKDAY_HEIGHT = 42

const monthCursor = ref(toDayKey())
const selectedDay = ref(toDayKey())
const isCollapsed = ref(true)

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

onShow(async () => {
  if (!taskStore.initialized) {
    await taskStore.bootstrap()
  }
})

function taskModeSummary(timerMode: 'countup' | 'countdown' | 'notimer', durationSeconds: number) {
  if (timerMode === 'countdown') return formatClock(durationSeconds)
  if (timerMode === 'notimer') return appStore.t('noTimerMode')
  return appStore.t('countup')
}

function moveMonth(offset: number) {
  monthCursor.value = shiftMonth(monthCursor.value, offset)
}

function getMonthStart(dayKey: string) {
  const [year, month] = dayKey.split('-')
  return `${year}-${month}-01`
}

function selectDay(dayKey: string) {
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
</script>

<template>
  <AppShell :title="appStore.t('calendarTitle')" :subtitle="appStore.t('calendarSubtitle')" current-tab="calendar">
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
        <view v-for="task in tasksOfDay" :key="task.id" class="review__item">
          <view class="review__main">
            <text class="review__task">{{ task.title }}</text>
            <text class="review__meta">{{ taskModeSummary(task.timerMode, task.durationSeconds) }}</text>
          </view>
          <view class="review__side">
            <text class="review__status">{{ task.status === 'done' ? appStore.t('completed') : appStore.t('pending') }}</text>
            <text class="review__focus">{{ formatFocusMinutes(task.focusSeconds) }} {{ appStore.t('minutesUnit') }}</text>
          </view>
        </view>
      </view>
      <view v-else class="review__empty">
        <text>{{ appStore.t('noTasksOnDay') }}</text>
      </view>
    </view>
  </AppShell>
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

.review__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  padding: 20rpx 0;
  border-bottom: 1px solid rgba(123, 160, 191, 0.14);
}

.review__main,
.review__side {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.review__side {
  align-items: flex-end;
}

.review__task {
  color: var(--tf-text-primary);
  font-size: 30rpx;
  font-weight: 600;
}

.review__meta,
.review__status,
.review__focus,
.review__empty {
  color: var(--tf-text-secondary);
  font-size: 24rpx;
}

.review {
  margin-bottom: 24rpx;
}
</style>
