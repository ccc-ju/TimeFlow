<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    visible: boolean
    value: string
    title: string
    cancelText: string
    confirmText: string
  }>(),
  {
    visible: false,
    value: '21:00',
    title: '',
    cancelText: 'Cancel',
    confirmText: 'Save'
  }
)

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'confirm', value: string): void
}>()

const hours = Array.from({ length: 24 }, (_, index) => `${index}`.padStart(2, '0'))
const minutes = Array.from({ length: 60 }, (_, index) => `${index}`.padStart(2, '0'))
const minuteLoopCopies = 3
const minuteLoopOffset = minutes.length
const minuteLoopSize = minutes.length * minuteLoopCopies
const minuteLoopValues = Array.from({ length: minuteLoopSize }, (_, index) => minutes[index % minutes.length])

const pickerValue = ref([21, minuteLoopOffset])
const pickerAdjusting = ref(false)

function normalizeIndex(value: unknown, max: number, fallback: number) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(0, Math.round(numeric)))
}

function parseTimeValue(input: string) {
  const [hourText, minuteText] = (input || '21:00').split(':')
  return [
    normalizeIndex(hourText, 23, 21),
    normalizeIndex(minuteText, 59, 0) + minuteLoopOffset
  ] as [number, number]
}

const displayValue = computed(() => {
  const hourIndex = normalizeIndex(pickerValue.value[0], 23, 21)
  const minuteIndex = normalizeIndex(pickerValue.value[1], minuteLoopSize - 1, minuteLoopOffset) % minutes.length
  return `${hours[hourIndex]}:${minutes[minuteIndex]}`
})

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) return
    const nextValue = parseTimeValue(props.value)
    pickerValue.value = [...nextValue]
    await nextTick()
    pickerValue.value = [...nextValue]
  },
  { immediate: true }
)

function close() {
  emit('close')
}

function onPickerChange(event: { detail?: { value?: number[] } }) {
  if (pickerAdjusting.value) {
    pickerAdjusting.value = false
    return
  }

  const nextValue = event.detail?.value || [21, 0]
  const hourIndex = normalizeIndex(nextValue[0], 23, pickerValue.value[0])
  const rawMinuteIndex = normalizeIndex(nextValue[1], minuteLoopSize - 1, pickerValue.value[1])
  const minuteValue = rawMinuteIndex % minutes.length
  const stableMinuteIndex = minuteLoopOffset + minuteValue

  pickerValue.value = [hourIndex, stableMinuteIndex]

  if (rawMinuteIndex !== stableMinuteIndex) {
    pickerAdjusting.value = true
    nextTick(() => {
      pickerValue.value = [hourIndex, stableMinuteIndex]
    })
  }
}

function confirm() {
  emit('confirm', displayValue.value)
}
</script>

<template>
  <view v-if="visible" class="time-sheet">
    <view class="time-sheet__mask" @tap="close" />
    <view class="time-sheet__panel glass-card" @tap.stop>
      <view class="time-sheet__handle" />
      <view class="time-sheet__topbar">
        <text class="time-sheet__action" @tap="close">{{ cancelText }}</text>
        <text class="time-sheet__title">{{ title }}</text>
        <text class="time-sheet__action time-sheet__action--confirm" @tap="confirm">{{ confirmText }}</text>
      </view>

      <text class="time-sheet__value">{{ displayValue }}</text>

      <view class="time-sheet__picker-wrap">
        <view class="time-sheet__picker-overlay" />
        <picker-view
          class="time-sheet__picker"
          :value="pickerValue"
          indicator-style="height: 88rpx;"
          @change="onPickerChange"
        >
          <picker-view-column>
            <view v-for="item in hours" :key="item" class="time-sheet__option">{{ item }}</view>
          </picker-view-column>
          <picker-view-column>
            <view v-for="(item, index) in minuteLoopValues" :key="`${item}-${index}`" class="time-sheet__option">{{ item }}</view>
          </picker-view-column>
        </picker-view>
        <view class="time-sheet__divider">:</view>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.time-sheet {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  align-items: flex-end;
}

.time-sheet__mask {
  position: absolute;
  inset: 0;
  background: rgba(10, 16, 24, 0.28);
}

.time-sheet__panel {
  position: relative;
  width: calc(100% - 40rpx);
  margin: 0 20rpx calc(18rpx + env(safe-area-inset-bottom));
  padding: 22rpx 24rpx calc(28rpx + env(safe-area-inset-bottom));
  animation: time-sheet-in 0.24s ease;
}

.time-sheet__handle {
  width: 88rpx;
  height: 10rpx;
  margin: 0 auto 20rpx;
  border-radius: 999rpx;
  background: rgba(123, 160, 191, 0.26);
}

.time-sheet__topbar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 16rpx;
}

.time-sheet__title {
  color: var(--tf-text-primary);
  font-size: 30rpx;
  font-weight: 700;
  text-align: center;
}

.time-sheet__action {
  color: var(--tf-text-secondary);
  font-size: 26rpx;
}

.time-sheet__action--confirm {
  color: #173349;
  font-weight: 700;
  text-align: right;
}

.time-sheet__value {
  display: block;
  margin-top: 26rpx;
  margin-bottom: 20rpx;
  color: var(--tf-text-primary);
  text-align: center;
  font-size: 72rpx;
  line-height: 1;
  font-weight: 700;
  letter-spacing: 2rpx;
  font-family: 'SFMono-Regular', 'Roboto Mono', monospace;
}

.time-sheet__picker-wrap {
  position: relative;
  height: 360rpx;
  border-radius: 30rpx;
  overflow: hidden;
  background: var(--tf-control-surface);
}

.time-sheet__picker {
  width: 100%;
  height: 100%;
}

.time-sheet__picker-overlay {
  position: absolute;
  left: 24rpx;
  right: 24rpx;
  top: 50%;
  height: 88rpx;
  transform: translateY(-50%);
  border-radius: 24rpx;
  background: rgba(255, 255, 255, 0.3);
  pointer-events: none;
}

.time-sheet__divider {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: var(--tf-text-primary);
  font-size: 44rpx;
  font-weight: 700;
  pointer-events: none;
}

.time-sheet__option {
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--tf-text-primary);
  font-size: 38rpx;
  font-weight: 600;
  font-family: 'SFMono-Regular', 'Roboto Mono', monospace;
}

@keyframes time-sheet-in {
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
