<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { Locale } from '@/types/timeflow'
import { createMonthGrid, formatFullDate, formatMonthLabel, shiftMonth, toDayKey } from '@/utils/date'

const props = withDefaults(
  defineProps<{
    visible: boolean
    value: string
    locale: Locale
    title: string
    cancelText: string
    confirmText: string
  }>(),
  {
    visible: false,
    value: '',
    locale: 'zh-CN',
    title: '',
    cancelText: 'Cancel',
    confirmText: 'Save'
  }
)

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'confirm', value: string): void
}>()

const monthFocus = ref(toDayKey())
const selectedDate = ref(toDayKey())

const weekdays = computed(() =>
  props.locale === 'en' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['日', '一', '二', '三', '四', '五', '六']
)

const monthLabel = computed(() => formatMonthLabel(monthFocus.value, props.locale))
const selectedLabel = computed(() => formatFullDate(selectedDate.value, props.locale))
const cells = computed(() => createMonthGrid(monthFocus.value))

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    const nextDate = props.value || toDayKey()
    selectedDate.value = nextDate
    monthFocus.value = nextDate
  },
  { immediate: true }
)

function close() {
  emit('close')
}

function changeMonth(offset: number) {
  monthFocus.value = shiftMonth(monthFocus.value, offset)
}

function selectDay(dayKey: string) {
  selectedDate.value = dayKey
  monthFocus.value = dayKey
}

function confirm() {
  emit('confirm', selectedDate.value)
}
</script>

<template>
  <view v-if="visible" class="date-sheet">
    <view class="date-sheet__mask" @tap="close" />
    <view class="date-sheet__panel glass-card" @tap.stop>
      <view class="date-sheet__handle" />
      <view class="date-sheet__topbar">
        <text class="date-sheet__action" @tap="close">{{ cancelText }}</text>
        <text class="date-sheet__title">{{ title }}</text>
        <text class="date-sheet__action date-sheet__action--confirm" @tap="confirm">{{ confirmText }}</text>
      </view>

      <view class="date-sheet__hero">
        <text class="date-sheet__hero-date">{{ selectedDate }}</text>
        <text class="date-sheet__hero-label">{{ selectedLabel }}</text>
      </view>

      <view class="date-sheet__calendar">
        <view class="date-sheet__calendar-head">
          <view class="date-sheet__nav" @tap="changeMonth(-1)">‹</view>
          <text class="date-sheet__month">{{ monthLabel }}</text>
          <view class="date-sheet__nav" @tap="changeMonth(1)">›</view>
        </view>

        <view class="date-sheet__weekdays">
          <text v-for="item in weekdays" :key="item" class="date-sheet__weekday">{{ item }}</text>
        </view>

        <view class="date-sheet__grid">
          <view
            v-for="cell in cells"
            :key="cell.dayKey"
            :class="[
              'date-sheet__cell',
              {
                'date-sheet__cell--muted': !cell.currentMonth,
                'date-sheet__cell--today': cell.isToday,
                'date-sheet__cell--active': cell.dayKey === selectedDate
              }
            ]"
            @tap="selectDay(cell.dayKey)"
          >
            {{ `${cell.label}`.padStart(2, '0') }}
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.date-sheet {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  align-items: flex-end;
}

.date-sheet__mask {
  position: absolute;
  inset: 0;
  background: rgba(10, 16, 24, 0.32);
}

.date-sheet__panel {
  position: relative;
  width: calc(100% - 40rpx);
  margin: 0 20rpx calc(18rpx + env(safe-area-inset-bottom));
  padding: 22rpx 24rpx calc(28rpx + env(safe-area-inset-bottom));
  animation: date-sheet-in 0.24s ease;
}

.date-sheet__handle {
  width: 88rpx;
  height: 10rpx;
  margin: 0 auto 20rpx;
  border-radius: 999rpx;
  background: rgba(123, 160, 191, 0.26);
}

.date-sheet__topbar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 16rpx;
}

.date-sheet__title {
  color: var(--tf-text-primary);
  font-size: 30rpx;
  font-weight: 700;
  text-align: center;
}

.date-sheet__action {
  color: var(--tf-text-secondary);
  font-size: 26rpx;
}

.date-sheet__action--confirm {
  color: #173349;
  font-weight: 700;
  text-align: right;
}

.date-sheet__hero {
  margin-top: 20rpx;
  padding: 22rpx 24rpx;
  border-radius: 26rpx;
  background: linear-gradient(135deg, rgba(168, 230, 207, 0.28), rgba(122, 179, 239, 0.18));
}

.date-sheet__hero-date {
  display: block;
  color: var(--tf-text-primary);
  font-size: 54rpx;
  line-height: 1;
  font-weight: 700;
}

.date-sheet__hero-label {
  display: block;
  margin-top: 12rpx;
  color: var(--tf-text-secondary);
  font-size: 24rpx;
}

.date-sheet__calendar {
  margin-top: 18rpx;
  padding: 22rpx 18rpx 10rpx;
  border-radius: 28rpx;
  background: var(--tf-control-surface);
}

.date-sheet__calendar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  margin-bottom: 14rpx;
}

.date-sheet__nav {
  width: 64rpx;
  height: 64rpx;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--tf-text-primary);
  font-size: 40rpx;
  background: rgba(255, 255, 255, 0.24);
}

.date-sheet__month {
  color: var(--tf-text-primary);
  font-size: 30rpx;
  font-weight: 700;
}

.date-sheet__weekdays,
.date-sheet__grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}

.date-sheet__weekdays {
  margin-bottom: 8rpx;
}

.date-sheet__weekday {
  text-align: center;
  color: var(--tf-text-muted);
  font-size: 22rpx;
  line-height: 56rpx;
}

.date-sheet__cell {
  height: 76rpx;
  margin: 4rpx;
  border-radius: 22rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--tf-text-primary);
  font-size: 25rpx;
  transition: all 0.22s ease;
}

.date-sheet__cell--muted {
  color: var(--tf-text-muted);
  opacity: 0.42;
}

.date-sheet__cell--today {
  background: rgba(122, 179, 239, 0.12);
}

.date-sheet__cell--active {
  color: #173349;
  font-weight: 700;
  background: linear-gradient(135deg, rgba(168, 230, 207, 0.96), rgba(122, 179, 239, 0.82));
  box-shadow: 0 12rpx 24rpx rgba(122, 179, 239, 0.18);
}

@keyframes date-sheet-in {
  from {
    opacity: 0;
    transform: translateY(24rpx);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
