<script setup lang="ts">
import { onHide, onLaunch, onShow } from '@dcloudio/uni-app'
import { watch } from 'vue'

import {
  registerForegroundReminderListener,
  startForegroundReminderLoop,
  stopForegroundReminderLoop,
  usesNativeForegroundReminderLoop
} from '@/services/notification'
import { useAppStore } from '@/store/app'
import { useTaskStore } from '@/store/tasks'
import { haptic } from '@/utils/feedback'

let daySyncTimer: ReturnType<typeof setInterval> | null = null
let reminderListenerReady = false
const appStore = useAppStore()
const taskStore = useTaskStore()

function triggerForegroundReminder(payload: { title: string; content: string; at: string }) {
  haptic('light')
  appStore.presentReminder(payload)
}

async function syncDailyState() {
  taskStore.syncToday()
  await appStore.syncTodayContext()
}

async function ensureReminderListener() {
  if (reminderListenerReady) return

  const appStore = useAppStore()
  if (!appStore.notificationSettings.enabled || !appStore.notificationPermissionGranted) {
    return
  }
  await registerForegroundReminderListener(
    () => appStore.locale,
    triggerForegroundReminder
  )
  reminderListenerReady = true
}

function syncForegroundReminderLoop() {
  if (!usesNativeForegroundReminderLoop()) {
    stopForegroundReminderLoop()
    return
  }

  if (!appStore.notificationSettings.enabled || !appStore.notificationPermissionGranted) {
    stopForegroundReminderLoop()
    return
  }

  startForegroundReminderLoop(
    appStore.notificationSettings,
    appStore.locale,
    triggerForegroundReminder
  )
}

function startDaySyncTicker() {
  if (daySyncTimer) return
  daySyncTimer = setInterval(() => {
    syncDailyState().catch((error) => {
      console.warn('sync daily state skipped', error)
    })
  }, 30 * 1000)
}

function stopDaySyncTicker() {
  if (!daySyncTimer) return
  clearInterval(daySyncTimer)
  daySyncTimer = null
}

onLaunch(async () => {
  await appStore.bootstrap()
  await taskStore.bootstrap()
  await syncDailyState()
  syncForegroundReminderLoop()
  startDaySyncTicker()
})

onShow(async () => {
  const appStore = useAppStore()
  await syncDailyState()
  await appStore.reconcileNotificationPermission().catch((error) => {
    console.warn('reconcile notification permission skipped', error)
  })
  await ensureReminderListener()
  syncForegroundReminderLoop()
  startDaySyncTicker()
})

onHide(() => {
  stopForegroundReminderLoop()
  stopDaySyncTicker()
})

watch(
  () => [
    appStore.notificationSettings.enabled,
    appStore.notificationSettings.time,
    appStore.notificationSettings.repeatDays.join(','),
    appStore.notificationPermissionGranted,
    appStore.locale
  ],
  () => {
    syncForegroundReminderLoop()
  }
)
</script>

<style lang="scss">
page {
  background:
    radial-gradient(circle at top right, rgba(122, 179, 239, 0.22), transparent 34%),
    radial-gradient(circle at left 20%, rgba(168, 230, 207, 0.3), transparent 26%),
    var(--tf-page-bg);
}
</style>
