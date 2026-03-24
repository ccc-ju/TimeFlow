import { defineStore } from 'pinia'

import { fetchDailyWallpaper } from '@/services/bing'
import { listFocusSessions, listTasks, removeTask, saveFocusSession, saveTask } from '@/services/sqlite'
import { useAppStore } from '@/store/app'
import type { ActiveTaskTimer, DailyStats, FocusSession, Task, TimerMode } from '@/types/timeflow'
import { createMonthGrid, getWeekKeys, toDayKey, toIsoString } from '@/utils/date'
import { notifyDone } from '@/utils/feedback'
import { createId, createTaskPayload } from '@/utils/task'

const ACTIVE_TIMERS_KEY = 'TIMEFLOW_ACTIVE_TIMERS'

let runtimeTicker: ReturnType<typeof setInterval> | null = null
let processingExpiredTimers = false

function getElapsedSeconds(startedAt: string, now = Date.now()) {
  const startedAtMs = new Date(startedAt).getTime()
  if (!Number.isFinite(startedAtMs)) return 0
  return Math.max(0, Math.floor((now - startedAtMs) / 1000))
}

function loadActiveTimers() {
  try {
    const raw = uni.getStorageSync(ACTIVE_TIMERS_KEY)
    if (!raw) return [] as ActiveTaskTimer[]
    const parsed = JSON.parse(raw) as ActiveTaskTimer[]
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    return [] as ActiveTaskTimer[]
  }
}

function saveActiveTimers(activeTimers: ActiveTaskTimer[]) {
  if (!activeTimers.length) {
    uni.removeStorageSync(ACTIVE_TIMERS_KEY)
    return
  }
  uni.setStorageSync(ACTIVE_TIMERS_KEY, JSON.stringify(activeTimers))
}

export const useTaskStore = defineStore('tasks', {
  state: () => ({
    initialized: false,
    creatingTask: false,
    todayKey: toDayKey(),
    nowTick: Date.now(),
    activeTimers: [] as ActiveTaskTimer[],
    pendingTaskIds: [] as string[],
    tasks: [] as Task[],
    focusSessions: [] as FocusSession[]
  }),
  getters: {
    todayTasks: (state) => {
      return state.tasks
        .filter((task) => task.scheduledDate === state.todayKey)
        .sort((left, right) => {
          if (left.status !== right.status) return left.status === 'pending' ? -1 : 1
          return right.createdAt.localeCompare(left.createdAt)
        })
    },
    todayStats(): DailyStats {
      const todayTasks = this.tasks.filter((task) => task.scheduledDate === this.todayKey)
      const todaySessions = this.focusSessions.filter((session) => session.sessionDate === this.todayKey)
      const liveFocusSeconds = todayTasks.reduce((sum, task) => {
        return sum + (this.taskRuntimeMap[task.id]?.liveSeconds || 0)
      }, 0)
      return {
        totalPlanned: todayTasks.length,
        completedCount: todayTasks.filter((task) => task.status === 'done').length,
        totalFocusMinutes: Math.round((todaySessions.reduce((sum, item) => sum + item.seconds, 0) + liveFocusSeconds) / 60)
      }
    },
    todayCompletionRate(): number {
      return this.todayStats.totalPlanned
        ? this.todayStats.completedCount / this.todayStats.totalPlanned
        : 0
    },
    completedDateMap() {
      return this.tasks.reduce<Record<string, boolean>>((accumulator, task) => {
        if (task.completedAt) {
          accumulator[toDayKey(task.completedAt)] = true
        }
        return accumulator
      }, {})
    },
    focusTrend() {
      return getWeekKeys().map((dayKey) => ({
        dayKey,
        seconds: this.focusSessions
          .filter((session) => session.sessionDate === dayKey)
          .reduce((sum, item) => sum + item.seconds, 0)
      }))
    },
    taskRuntimeMap(state) {
      const now = state.nowTick
      const activeTimers = state.activeTimers.reduce<Record<string, ActiveTaskTimer>>((accumulator, timer) => {
        accumulator[timer.taskId] = timer
        return accumulator
      }, {})

      return state.tasks.reduce<
        Record<
          string,
          {
            running: boolean
            liveSeconds: number
            effectiveFocusSeconds: number
            displaySeconds: number
          }
        >
      >((accumulator, task) => {
        const timer = activeTimers[task.id]
        const liveSeconds = timer ? getElapsedSeconds(timer.startedAt, now) : 0
        const effectiveFocusSeconds = task.status === 'done' ? task.focusSeconds : task.focusSeconds + liveSeconds
        const displaySeconds =
          task.status === 'done'
            ? task.focusSeconds
            : task.timerMode === 'notimer'
              ? 0
              : task.timerMode === 'countdown'
                ? Math.max(task.durationSeconds - task.focusSeconds - liveSeconds, 0)
                : task.focusSeconds + liveSeconds

        accumulator[task.id] = {
          running: !!timer,
          liveSeconds,
          effectiveFocusSeconds,
          displaySeconds
        }

        return accumulator
      }, {})
    },
    isTaskPending: (state) => (taskId: string) => state.pendingTaskIds.includes(taskId)
  },
  actions: {
    syncNowTick() {
      this.nowTick = Date.now()
    },
    persistActiveTimers() {
      saveActiveTimers(this.activeTimers)
    },
    syncActiveTimersFromStorage() {
      const timers = loadActiveTimers()
      const activeTaskIds = new Set(
        this.tasks
          .filter((task) => task.status === 'pending' && task.timerMode !== 'notimer')
          .map((task) => task.id)
      )

      this.activeTimers = timers.filter((timer) => activeTaskIds.has(timer.taskId))
      this.persistActiveTimers()
    },
    ensureRuntimeTicker() {
      if (runtimeTicker || !this.activeTimers.length) return
      runtimeTicker = setInterval(() => {
        this.syncNowTick()
        void this.processExpiredCountdowns()
      }, 1000)
    },
    stopRuntimeTicker() {
      if (!runtimeTicker || this.activeTimers.length) return
      clearInterval(runtimeTicker)
      runtimeTicker = null
    },
    clearActiveTimer(taskId: string) {
      this.activeTimers = this.activeTimers.filter((timer) => timer.taskId !== taskId)
      this.persistActiveTimers()
      this.stopRuntimeTicker()
    },
    async processExpiredCountdowns() {
      if (processingExpiredTimers || !this.activeTimers.length) return

      const expiredTimers = this.activeTimers.filter((timer) => {
        if (timer.timerMode !== 'countdown') return false
        const task = this.tasks.find((item) => item.id === timer.taskId)
        if (!task || task.status === 'done') return false
        const elapsedSeconds = getElapsedSeconds(timer.startedAt, this.nowTick)
        return task.durationSeconds - task.focusSeconds - elapsedSeconds <= 0
      })

      if (!expiredTimers.length) return

      processingExpiredTimers = true
      try {
        const appStore = useAppStore()
        for (const timer of expiredTimers) {
          await this.pauseTaskTimer(timer.taskId, true)
          notifyDone()
          uni.showToast({
            title: appStore.t('taskCompleted'),
            icon: 'none'
          })
        }
      } finally {
        processingExpiredTimers = false
      }
    },
    async startTaskTimer(taskId: string) {
      const task = this.tasks.find((item) => item.id === taskId)
      if (!task || task.status === 'done' || task.timerMode === 'notimer') return false
      if (this.activeTimers.some((timer) => timer.taskId === taskId)) return false

      this.syncNowTick()
      this.activeTimers = [
        ...this.activeTimers,
        {
          taskId,
          startedAt: new Date().toISOString(),
          startedFocusSeconds: task.focusSeconds,
          timerMode: task.timerMode,
          durationSeconds: task.durationSeconds
        }
      ]
      this.persistActiveTimers()
      this.ensureRuntimeTicker()
      return true
    },
    async pauseTaskTimer(taskId: string, autoComplete = false) {
      const activeTimer = this.activeTimers.find((timer) => timer.taskId === taskId)
      if (!activeTimer) return 0

      const task = this.tasks.find((item) => item.id === taskId)
      const elapsedSeconds = getElapsedSeconds(activeTimer.startedAt, Date.now())
      const cappedElapsedSeconds =
        activeTimer.timerMode === 'countdown'
          ? Math.max(0, Math.min(elapsedSeconds, activeTimer.durationSeconds - activeTimer.startedFocusSeconds))
          : elapsedSeconds
      const endedAt = new Date().toISOString()

      this.clearActiveTimer(taskId)
      this.syncNowTick()

      if (!task || cappedElapsedSeconds <= 0) {
        if (autoComplete && task && task.status !== 'done') {
          await this.toggleTask(task.id, 'done')
        }
        return cappedElapsedSeconds
      }

      await this.appendFocusSession({
        taskId,
        seconds: cappedElapsedSeconds,
        startedAt: activeTimer.startedAt,
        endedAt,
        mode: activeTimer.timerMode,
        autoComplete
      })

      return cappedElapsedSeconds
    },
    async finishTaskNow(taskId: string) {
      if (this.activeTimers.some((timer) => timer.taskId === taskId)) {
        await this.pauseTaskTimer(taskId, false)
      }
      await this.toggleTask(taskId, 'done')
    },
    syncToday() {
      const nextDayKey = toDayKey()
      if (this.todayKey === nextDayKey) return false
      this.todayKey = nextDayKey
      return true
    },
    setTaskPending(taskId: string, pending: boolean) {
      if (pending) {
        if (!this.pendingTaskIds.includes(taskId)) {
          this.pendingTaskIds.push(taskId)
        }
        return
      }

      this.pendingTaskIds = this.pendingTaskIds.filter((item) => item !== taskId)
    },
    async bootstrap() {
      if (this.initialized) return
      this.syncToday()
      await this.refresh()
      this.syncActiveTimersFromStorage()
      this.ensureRuntimeTicker()
      await this.processExpiredCountdowns()
      this.initialized = true
    },
    async refresh() {
      this.syncToday()
      const [tasks, focusSessions] = await Promise.all([listTasks(), listFocusSessions()])
      this.tasks = tasks
      this.focusSessions = focusSessions
      this.syncNowTick()
    },
    async addTask(payload: {
      title: string
      timerMode: TimerMode
      durationSeconds: number
      wallpaperUrl?: string
      scheduledDate: string
    }) {
      if (this.creatingTask) return null

      this.creatingTask = true
      const wallpaper = payload.wallpaperUrl ? { url: payload.wallpaperUrl } : await fetchDailyWallpaper()
      const task = createTaskPayload({
        ...payload,
        wallpaperUrl: wallpaper.url
      })

      this.tasks.unshift(task)
      try {
        await saveTask(task)
        return task
      } catch (error) {
        this.tasks = this.tasks.filter((item) => item.id !== task.id)
        throw error
      } finally {
        this.creatingTask = false
      }
    },
    async patchTask(task: Task) {
      const previousTasks = [...this.tasks]
      const updatedTask = {
        ...task,
        updatedAt: toIsoString()
      }

      const index = this.tasks.findIndex((item) => item.id === task.id)
      if (index >= 0) {
        this.tasks.splice(index, 1, updatedTask)
      } else {
        this.tasks.unshift(updatedTask)
      }

      try {
        await saveTask(updatedTask)
        return updatedTask
      } catch (error) {
        this.tasks = previousTasks
        throw error
      }
    },
    async toggleTask(taskId: string, forceStatus?: Task['status']) {
      if (this.isTaskPending(taskId)) return
      const currentTask = this.tasks.find((item) => item.id === taskId)
      if (!currentTask) return
      if (currentTask.status === 'done' && !forceStatus) return

      this.setTaskPending(taskId, true)
      try {
        const status = forceStatus || 'done'
        return await this.patchTask({
          ...currentTask,
          status,
          completedAt: status === 'done' ? toIsoString() : null
        })
      } finally {
        this.setTaskPending(taskId, false)
      }
    },
    async deleteTask(taskId: string) {
      if (this.isTaskPending(taskId)) return
      this.clearActiveTimer(taskId)
      this.setTaskPending(taskId, true)
      const previousTasks = [...this.tasks]
      const previousSessions = [...this.focusSessions]

      this.tasks = this.tasks.filter((item) => item.id !== taskId)
      this.focusSessions = this.focusSessions.filter((item) => item.taskId !== taskId)

      try {
        await removeTask(taskId)
      } catch (error) {
        this.tasks = previousTasks
        this.focusSessions = previousSessions
        throw error
      } finally {
        this.setTaskPending(taskId, false)
      }
    },
    async appendFocusSession(payload: {
      taskId: string
      seconds: number
      startedAt: string
      endedAt: string
      mode: TimerMode
      autoComplete?: boolean
    }) {
      if (payload.seconds <= 0) return
      const task = this.tasks.find((item) => item.id === payload.taskId)
      if (!task) return

      const session: FocusSession = {
        id: createId('session'),
        taskId: payload.taskId,
        sessionDate: toDayKey(payload.endedAt),
        startedAt: payload.startedAt,
        endedAt: payload.endedAt,
        seconds: payload.seconds,
        mode: payload.mode
      }

      const previousSessions = [...this.focusSessions]
      this.focusSessions.unshift(session)

      try {
        await saveFocusSession(session)
      } catch (error) {
        this.focusSessions = previousSessions
        throw error
      }

      await this.patchTask({
        ...task,
        focusSeconds: task.focusSeconds + payload.seconds,
        status: payload.autoComplete ? 'done' : task.status,
        completedAt: payload.autoComplete ? payload.endedAt : task.completedAt
      })
    },
    tasksForDate(dayKey: string) {
      return this.tasks
        .filter((task) => task.scheduledDate === dayKey)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    },
    monthGrid(dayKey: string) {
      return createMonthGrid(dayKey)
    }
  }
})
