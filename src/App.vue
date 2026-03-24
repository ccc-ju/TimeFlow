<script setup lang="ts">
import { onHide, onLaunch, onShow } from '@dcloudio/uni-app'

import { useAppStore } from '@/store/app'
import { useTaskStore } from '@/store/tasks'

let daySyncTimer: ReturnType<typeof setInterval> | null = null

async function syncDailyState() {
  const appStore = useAppStore()
  const taskStore = useTaskStore()

  taskStore.syncToday()
  await appStore.syncTodayContext()
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
  const appStore = useAppStore()
  const taskStore = useTaskStore()

  await appStore.bootstrap()
  await taskStore.bootstrap()
  await syncDailyState()
  startDaySyncTicker()
})

onShow(async () => {
  await syncDailyState()
  startDaySyncTicker()
})

onHide(() => {
  stopDaySyncTicker()
})
</script>

<style lang="scss">
page {
  background:
    radial-gradient(circle at top right, rgba(122, 179, 239, 0.22), transparent 34%),
    radial-gradient(circle at left 20%, rgba(168, 230, 207, 0.3), transparent 26%),
    var(--tf-page-bg);
}
</style>
