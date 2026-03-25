<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import DateSelectSheet from '@/components/common/date-select-sheet.vue'
import { useAppStore } from '@/store/app'
import type { TimerMode } from '@/types/timeflow'
import { toDayKey } from '@/utils/date'

const props = withDefaults(
  defineProps<{
    visible: boolean
    initialValue?: {
      title: string
      timerMode: TimerMode
      durationSeconds: number
      scheduledDate: string
    } | null
    titleText?: string
    submitText?: string
    submitting?: boolean
  }>(),
  {
    initialValue: null,
    titleText: '',
    submitText: '',
    submitting: false
  }
)

const emit = defineEmits<{
  (event: 'close'): void
  (
    event: 'submit',
    payload: {
      title: string
      timerMode: TimerMode
      durationSeconds: number
      scheduledDate: string
    }
  ): void
}>()

const appStore = useAppStore()
const title = ref('')
const timerMode = ref<TimerMode>('countup')
const durationMinutes = ref('25')
const scheduledDate = ref(toDayKey())
const dateSheetVisible = ref(false)

const submitDisabled = computed(() => !title.value.trim() || props.submitting)
const isCountdown = computed(() => timerMode.value === 'countdown')

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    title.value = props.initialValue?.title || ''
    timerMode.value = props.initialValue?.timerMode || 'countup'
    durationMinutes.value = `${Math.max(1, Math.round((props.initialValue?.durationSeconds || 1500) / 60))}`
    scheduledDate.value = props.initialValue?.scheduledDate || toDayKey()
  }
)

function closeSheet() {
  if (props.submitting) return
  emit('close')
}

function openDateSheet() {
  if (props.submitting) return
  dateSheetVisible.value = true
}

function updateScheduledDate(value: string) {
  scheduledDate.value = value || toDayKey()
  dateSheetVisible.value = false
}

function submit() {
  if (submitDisabled.value) return
  emit('submit', {
    title: title.value.trim(),
    timerMode: timerMode.value,
    durationSeconds: isCountdown.value ? Number(durationMinutes.value || 25) * 60 : 0,
    scheduledDate: scheduledDate.value || toDayKey()
  })
}
</script>

<template>
  <view v-if="visible" class="sheet">
    <view class="sheet__mask" @tap="closeSheet" />
    <view class="sheet__panel glass-card" @tap.stop>
      <view v-if="submitting" class="sheet__loading-bar" />
      <view class="sheet__body">
        <view class="sheet__handle" />
        <text class="sheet__title">{{ titleText || appStore.t('addTask') }}</text>

        <view class="sheet__field">
          <text class="sheet__label">{{ appStore.t('taskName') }}</text>
          <input
            v-model="title"
            class="sheet__input"
            :placeholder="appStore.t('taskName')"
            maxlength="40"
          />
        </view>

        <view class="sheet__field">
          <text class="sheet__label">{{ appStore.t('taskDate') }}</text>
          <view class="sheet__picker" @tap="openDateSheet">
            <text class="sheet__picker-value">{{ scheduledDate }}</text>
          </view>
        </view>

        <view class="sheet__field">
          <text class="sheet__label">{{ appStore.t('taskMode') }}</text>
          <view class="sheet__segmented">
            <view
              :class="['sheet__option', { 'sheet__option--active': timerMode === 'countup' }]"
              @tap="timerMode = 'countup'"
            >
              {{ appStore.t('countup') }}
            </view>
            <view
              :class="['sheet__option', { 'sheet__option--active': timerMode === 'countdown' }]"
              @tap="timerMode = 'countdown'"
            >
              {{ appStore.t('countdown') }}
            </view>
            <view
              :class="['sheet__option', { 'sheet__option--active': timerMode === 'notimer' }]"
              @tap="timerMode = 'notimer'"
            >
              {{ appStore.t('noTimerMode') }}
            </view>
          </view>
        </view>

        <view v-if="isCountdown" class="sheet__field">
          <text class="sheet__label">{{ appStore.t('durationMinutes') }}</text>
          <input v-model="durationMinutes" class="sheet__input" type="number" maxlength="3" />
        </view>
      </view>

      <view class="sheet__actions">
        <button class="sheet__ghost" @tap="closeSheet">
          <view class="sheet__button-content">
            <text>{{ appStore.t('cancel') }}</text>
          </view>
        </button>
        <button :class="['sheet__primary', { 'sheet__primary--disabled': submitDisabled }]" @tap="submit">
          <view class="sheet__button-content">
            <view v-if="submitting" class="sheet__spinner" />
            <text>{{ submitting ? appStore.t('processing') : submitText || appStore.t('createTask') }}</text>
          </view>
        </button>
      </view>
    </view>

    <DateSelectSheet
      :visible="dateSheetVisible"
      :value="scheduledDate"
      :locale="appStore.locale"
      :title="appStore.t('taskDate')"
      :cancel-text="appStore.t('cancel')"
      :confirm-text="submitText || appStore.t('saveChanges')"
      @close="dateSheetVisible = false"
      @confirm="updateScheduledDate"
    />
  </view>
</template>

<style scoped lang="scss">
.sheet {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: flex-end;
}

.sheet__mask {
  position: absolute;
  inset: 0;
  background: rgba(12, 18, 28, 0.28);
}

.sheet__panel {
  position: relative;
  width: calc(100% - 40rpx);
  margin: 0 20rpx calc(18rpx + env(safe-area-inset-bottom));
  overflow: hidden;
  max-height: calc(100vh - 180rpx);
  display: flex;
  flex-direction: column;
  padding: 22rpx 24rpx 20rpx;
  animation: sheet-enter 0.26s ease;
}

.sheet__loading-bar {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 6rpx;
  background: linear-gradient(90deg, rgba(168, 230, 207, 0.2), rgba(122, 179, 239, 0.9), rgba(168, 230, 207, 0.2));
  animation: loading-bar 1.2s linear infinite;
}

.sheet__body {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 12rpx;
}

.sheet__handle {
  width: 92rpx;
  height: 10rpx;
  border-radius: 999rpx;
  margin: 0 auto 18rpx;
  background: rgba(123, 160, 191, 0.22);
}

.sheet__title {
  display: block;
  margin-bottom: 24rpx;
  color: var(--tf-text-primary);
  font-size: 38rpx;
  font-weight: 700;
}

.sheet__field {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  margin-bottom: 18rpx;
}

.sheet__label {
  color: var(--tf-text-secondary);
  font-size: 24rpx;
}

.sheet__input {
  height: 92rpx;
  padding: 0 24rpx;
  border-radius: 24rpx;
  background: var(--tf-surface-soft);
  color: var(--tf-text-primary);
  font-size: 30rpx;
}

.sheet__picker {
  min-height: 92rpx;
  padding: 0 24rpx;
  border-radius: 24rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--tf-surface-soft);
}

.sheet__picker::after {
  content: '';
  width: 14rpx;
  height: 14rpx;
  border-right: 2px solid rgba(29, 43, 59, 0.42);
  border-bottom: 2px solid rgba(29, 43, 59, 0.42);
  transform: rotate(45deg);
  margin-top: -8rpx;
}

.sheet__picker-value {
  color: var(--tf-text-primary);
  font-size: 30rpx;
}

.sheet__segmented {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16rpx;
  padding: 4rpx 0 8rpx;
}

.sheet__option {
  min-height: 92rpx;
  border-radius: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--tf-text-secondary);
  background: var(--tf-surface-soft);
  transition: all 0.22s ease;
}

.sheet__option--active {
  color: #173349;
  background: linear-gradient(135deg, #a8e6cf, #7ab3ef);
  box-shadow:
    0 14rpx 26rpx rgba(122, 179, 239, 0.18),
    0 6rpx 14rpx rgba(168, 230, 207, 0.12);
}

.sheet__actions {
  position: sticky;
  bottom: 0;
  display: flex;
  gap: 16rpx;
  margin-top: 12rpx;
  padding-top: 20rpx;
  padding-bottom: calc(8rpx + env(safe-area-inset-bottom));
  background: transparent;
}

.sheet__ghost,
.sheet__primary {
  flex: 1;
  height: 92rpx;
  padding: 0;
  border: 0;
  border-radius: 28rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30rpx;
  font-weight: 600;
  line-height: 1;
  text-align: center;
  box-sizing: border-box;
  appearance: none;
  -webkit-appearance: none;
}

.sheet__ghost::after,
.sheet__primary::after {
  border: 0;
}

.sheet__ghost {
  color: var(--tf-text-primary);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.58));
  border: 1px solid rgba(122, 179, 239, 0.18);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.52),
    0 12rpx 28rpx rgba(148, 163, 184, 0.14);
}

.sheet__ghost:active {
  transform: scale(0.985);
  opacity: 0.94;
}

.sheet__primary:active {
  transform: scale(0.985);
  opacity: 0.96;
}

.sheet__ghost .sheet__button-content,
.sheet__primary .sheet__button-content {
  color: inherit;
  font-size: 30rpx;
  font-weight: 600;
}

.sheet__ghost .sheet__button-content {
  color: var(--tf-text-primary);
}

.sheet__primary {
  color: #173349;
  background: linear-gradient(135deg, #a8e6cf, #7ab3ef);
  box-shadow: 0 18rpx 38rpx rgba(122, 179, 239, 0.24);
}

.sheet__primary--disabled {
  opacity: 0.5;
}

.sheet__button-content {
  width: 100%;
  height: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
}

.sheet__spinner {
  width: 26rpx;
  height: 26rpx;
  border-radius: 999rpx;
  border: 3rpx solid rgba(23, 51, 73, 0.18);
  border-top-color: #173349;
  animation: spin 0.75s linear infinite;
}

@keyframes sheet-enter {
  from {
    transform: translateY(40rpx);
    opacity: 0;
  }

  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

@keyframes loading-bar {
  0% {
    transform: translateX(-45%);
  }

  100% {
    transform: translateX(45%);
  }
}
</style>
