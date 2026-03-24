import type { FocusSession, Task } from '@/types/timeflow'

const DB_NAME = 'timeflow.db'
const DB_PATH = '_doc/timeflow.db'
const FALLBACK_STORAGE_KEY = 'TIMEFLOW_FALLBACK_DATABASE'

interface FallbackDatabase {
  tasks: Task[]
  focusSessions: FocusSession[]
  settings: Record<string, string>
}

let initialized = false
let nativeDatabaseAvailable = false
let nativeDatabasePrepared = false
let nativeDatabaseReadyPromise: Promise<boolean> | null = null
let plusReadyPromise: Promise<void> | null = null
let fallbackCache: FallbackDatabase | null = null
let fallbackMigrated = false

function isAppRuntime() {
  try {
    const systemInfo = uni.getSystemInfoSync() as { uniPlatform?: string }
    return systemInfo.uniPlatform === 'app'
  } catch (error) {
    return false
  }
}

function isAppDatabaseReady() {
  return typeof plus !== 'undefined' && !!plus.sqlite
}

function sqlValue(value: string | number | null) {
  if (value === null) return 'NULL'
  if (typeof value === 'number') return `${value}`
  return `'${value.replace(/'/g, "''")}'`
}

function getFallbackDatabase(): FallbackDatabase {
  if (fallbackCache) return fallbackCache

  const raw = uni.getStorageSync(FALLBACK_STORAGE_KEY)
  if (!raw) {
    fallbackCache = {
      tasks: [],
      focusSessions: [],
      settings: {}
    }
    return fallbackCache
  }

  try {
    fallbackCache = JSON.parse(raw) as FallbackDatabase
    return fallbackCache
  } catch (error) {
    fallbackCache = {
      tasks: [],
      focusSessions: [],
      settings: {}
    }
    return fallbackCache
  }
}

function saveFallbackDatabase(payload: FallbackDatabase) {
  fallbackCache = payload
  uni.setStorageSync(FALLBACK_STORAGE_KEY, JSON.stringify(payload))
}

function clearFallbackDatabase() {
  fallbackCache = {
    tasks: [],
    focusSessions: [],
    settings: {}
  }
  uni.removeStorageSync(FALLBACK_STORAGE_KEY)
}

function plusCall<T = any>(method: string, options: Record<string, any>) {
  return new Promise<T>((resolve, reject) => {
    plus.sqlite[method]({
      ...options,
      success: (result: T) => resolve(result),
      fail: (error: any) => reject(error)
    })
  })
}

async function waitForPlus(timeout = 10000) {
  if (!isAppRuntime()) return false
  if (isAppDatabaseReady()) return true
  if (plusReadyPromise) {
    await plusReadyPromise
    return isAppDatabaseReady()
  }

  plusReadyPromise = new Promise<void>((resolve) => {
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      resolve()
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('plusready', finish, { once: true })
    }

    const startedAt = Date.now()
    const timer = setInterval(() => {
      if (isAppDatabaseReady() || Date.now() - startedAt >= timeout) {
        clearInterval(timer)
        finish()
      }
    }, 120)
  })

  await plusReadyPromise
  plusReadyPromise = null
  return isAppDatabaseReady()
}

async function migrateFallbackToNative() {
  if (fallbackMigrated) return

  const fallback = getFallbackDatabase()
  if (!fallback.tasks.length && !fallback.focusSessions.length && !Object.keys(fallback.settings).length) {
    fallbackMigrated = true
    return
  }

  for (const task of fallback.tasks) {
    await plusCall('executeSql', {
      name: DB_NAME,
      sql: `INSERT OR REPLACE INTO tasks (
        id, title, scheduled_date, created_at, updated_at, timer_mode, duration_seconds, status, focus_seconds, wallpaper_url, completed_at
      ) VALUES (
        ${sqlValue(task.id)},
        ${sqlValue(task.title)},
        ${sqlValue(task.scheduledDate)},
        ${sqlValue(task.createdAt)},
        ${sqlValue(task.updatedAt)},
        ${sqlValue(task.timerMode)},
        ${sqlValue(task.durationSeconds)},
        ${sqlValue(task.status)},
        ${sqlValue(task.focusSeconds)},
        ${sqlValue(task.wallpaperUrl)},
        ${sqlValue(task.completedAt)}
      )`
    })
  }

  for (const session of fallback.focusSessions) {
    await plusCall('executeSql', {
      name: DB_NAME,
      sql: `INSERT OR REPLACE INTO focus_sessions (
        id, task_id, session_date, started_at, ended_at, seconds, mode
      ) VALUES (
        ${sqlValue(session.id)},
        ${sqlValue(session.taskId)},
        ${sqlValue(session.sessionDate)},
        ${sqlValue(session.startedAt)},
        ${sqlValue(session.endedAt)},
        ${sqlValue(session.seconds)},
        ${sqlValue(session.mode)}
      )`
    })
  }

  for (const [key, value] of Object.entries(fallback.settings)) {
    await plusCall('executeSql', {
      name: DB_NAME,
      sql: `INSERT OR REPLACE INTO settings (key, value) VALUES (${sqlValue(key)}, ${sqlValue(value)})`
    })
  }

  clearFallbackDatabase()
  fallbackMigrated = true
}

async function ensureNativeDatabase() {
  if (nativeDatabasePrepared) return nativeDatabaseAvailable
  if (nativeDatabaseReadyPromise) return nativeDatabaseReadyPromise

  nativeDatabaseReadyPromise = (async () => {
    const plusReady = await waitForPlus()

    if (!plusReady || !isAppDatabaseReady()) {
      nativeDatabaseAvailable = false
      if (!isAppRuntime()) {
        nativeDatabasePrepared = true
      }
      nativeDatabaseReadyPromise = null
      return false
    }

    try {
      await plusCall('openDatabase', {
        name: DB_NAME,
        path: DB_PATH
      })
    } catch (error) {
      const message = JSON.stringify(error)
      if (!message.includes('opened')) {
        console.debug('open database skipped', error)
      }
    }

    await plusCall('executeSql', {
      name: DB_NAME,
      sql: `CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        scheduled_date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        timer_mode TEXT NOT NULL,
        duration_seconds INTEGER DEFAULT 0,
        status TEXT NOT NULL,
        focus_seconds INTEGER DEFAULT 0,
        wallpaper_url TEXT NOT NULL,
        completed_at TEXT
      )`
    })

    await plusCall('executeSql', {
      name: DB_NAME,
      sql: `CREATE TABLE IF NOT EXISTS focus_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        task_id TEXT NOT NULL,
        session_date TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        seconds INTEGER DEFAULT 0,
        mode TEXT NOT NULL
      )`
    })

    await plusCall('executeSql', {
      name: DB_NAME,
      sql: `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      )`
    })

    await plusCall('executeSql', {
      name: DB_NAME,
      sql: 'CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC)'
    })

    await plusCall('executeSql', {
      name: DB_NAME,
      sql: 'CREATE INDEX IF NOT EXISTS idx_tasks_scheduled_date ON tasks(scheduled_date)'
    })

    await plusCall('executeSql', {
      name: DB_NAME,
      sql: 'CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON focus_sessions(started_at DESC)'
    })

    await plusCall('executeSql', {
      name: DB_NAME,
      sql: 'CREATE INDEX IF NOT EXISTS idx_sessions_session_date ON focus_sessions(session_date)'
    })

    await migrateFallbackToNative()

    nativeDatabaseAvailable = true
    nativeDatabasePrepared = true
    return true
  })()

  return nativeDatabaseReadyPromise
}

async function executeSql(sql: string) {
  if (await ensureNativeDatabase()) {
    await plusCall('executeSql', {
      name: DB_NAME,
      sql
    })
    return
  }

  const fallback = getFallbackDatabase()

  if (sql.startsWith('INSERT_OR_REPLACE_TASK::')) {
    const task = JSON.parse(sql.replace('INSERT_OR_REPLACE_TASK::', '')) as Task
    const index = fallback.tasks.findIndex((item) => item.id === task.id)
    if (index >= 0) fallback.tasks.splice(index, 1, task)
    else fallback.tasks.unshift(task)
  }

  if (sql.startsWith('DELETE_TASK::')) {
    const taskId = sql.replace('DELETE_TASK::', '')
    fallback.tasks = fallback.tasks.filter((item) => item.id !== taskId)
    fallback.focusSessions = fallback.focusSessions.filter((item) => item.taskId !== taskId)
  }

  if (sql.startsWith('INSERT_SESSION::')) {
    const session = JSON.parse(sql.replace('INSERT_SESSION::', '')) as FocusSession
    const index = fallback.focusSessions.findIndex((item) => item.id === session.id)
    if (index >= 0) fallback.focusSessions.splice(index, 1, session)
    else fallback.focusSessions.unshift(session)
  }

  if (sql.startsWith('UPSERT_SETTING::')) {
    const payload = JSON.parse(sql.replace('UPSERT_SETTING::', '')) as { key: string; value: string }
    fallback.settings[payload.key] = payload.value
  }

  saveFallbackDatabase(fallback)
}

async function selectSql<T>(sql: string) {
  if (await ensureNativeDatabase()) {
    const result = await plusCall<T[]>('selectSql', {
      name: DB_NAME,
      sql
    })
    return result
  }

  const fallback = getFallbackDatabase()

  if (sql === 'SELECT_TASKS') return fallback.tasks as unknown as T[]
  if (sql === 'SELECT_SESSIONS') return fallback.focusSessions as unknown as T[]
  if (sql.startsWith('SELECT_SETTING::')) {
    const key = sql.replace('SELECT_SETTING::', '')
    const value = fallback.settings[key]
    return (value ? [{ value }] : []) as unknown as T[]
  }

  return []
}

function normalizeTaskRecord(record: any): Task {
  return {
    id: record.id,
    title: record.title,
    scheduledDate: record.scheduled_date ?? record.scheduledDate,
    createdAt: record.created_at ?? record.createdAt,
    updatedAt: record.updated_at ?? record.updatedAt,
    timerMode: record.timer_mode ?? record.timerMode,
    durationSeconds: Number(record.duration_seconds ?? record.durationSeconds ?? 0),
    status: record.status,
    focusSeconds: Number(record.focus_seconds ?? record.focusSeconds ?? 0),
    wallpaperUrl: record.wallpaper_url ?? record.wallpaperUrl,
    completedAt: record.completed_at ?? record.completedAt ?? null
  }
}

function normalizeSessionRecord(record: any): FocusSession {
  return {
    id: record.id,
    taskId: record.task_id ?? record.taskId,
    sessionDate: record.session_date ?? record.sessionDate,
    startedAt: record.started_at ?? record.startedAt,
    endedAt: record.ended_at ?? record.endedAt,
    seconds: Number(record.seconds),
    mode: record.mode
  }
}

export async function initDatabase() {
  if (initialized) return
  await ensureNativeDatabase()
  initialized = true
}

export async function listTasks() {
  await initDatabase()

  if (isAppDatabaseReady()) {
    const rows = await selectSql<any>('SELECT * FROM tasks ORDER BY created_at DESC')
    return rows.map(normalizeTaskRecord)
  }

  const rows = await selectSql<Task>('SELECT_TASKS')
  return rows.map(normalizeTaskRecord)
}

export async function saveTask(task: Task) {
  await initDatabase()

  if (isAppDatabaseReady()) {
    await executeSql(`INSERT OR REPLACE INTO tasks (
      id, title, scheduled_date, created_at, updated_at, timer_mode, duration_seconds, status, focus_seconds, wallpaper_url, completed_at
    ) VALUES (
      ${sqlValue(task.id)},
      ${sqlValue(task.title)},
      ${sqlValue(task.scheduledDate)},
      ${sqlValue(task.createdAt)},
      ${sqlValue(task.updatedAt)},
      ${sqlValue(task.timerMode)},
      ${sqlValue(task.durationSeconds)},
      ${sqlValue(task.status)},
      ${sqlValue(task.focusSeconds)},
      ${sqlValue(task.wallpaperUrl)},
      ${sqlValue(task.completedAt)}
    )`)
    return
  }

  await executeSql(`INSERT_OR_REPLACE_TASK::${JSON.stringify(task)}`)
}

export async function removeTask(taskId: string) {
  await initDatabase()

  if (isAppDatabaseReady()) {
    await executeSql(`DELETE FROM focus_sessions WHERE task_id = ${sqlValue(taskId)}`)
    await executeSql(`DELETE FROM tasks WHERE id = ${sqlValue(taskId)}`)
    return
  }

  await executeSql(`DELETE_TASK::${taskId}`)
}

export async function listFocusSessions() {
  await initDatabase()

  if (isAppDatabaseReady()) {
    const rows = await selectSql<any>('SELECT * FROM focus_sessions ORDER BY started_at DESC')
    return rows.map(normalizeSessionRecord)
  }

  const rows = await selectSql<FocusSession>('SELECT_SESSIONS')
  return rows.map(normalizeSessionRecord)
}

export async function saveFocusSession(session: FocusSession) {
  await initDatabase()

  if (isAppDatabaseReady()) {
    await executeSql(`INSERT OR REPLACE INTO focus_sessions (
      id, task_id, session_date, started_at, ended_at, seconds, mode
    ) VALUES (
      ${sqlValue(session.id)},
      ${sqlValue(session.taskId)},
      ${sqlValue(session.sessionDate)},
      ${sqlValue(session.startedAt)},
      ${sqlValue(session.endedAt)},
      ${sqlValue(session.seconds)},
      ${sqlValue(session.mode)}
    )`)
    return
  }

  await executeSql(`INSERT_SESSION::${JSON.stringify(session)}`)
}

export async function getSetting(key: string) {
  await initDatabase()

  if (isAppDatabaseReady()) {
    const rows = await selectSql<{ value: string }>(`SELECT value FROM settings WHERE key = ${sqlValue(key)} LIMIT 1`)
    return rows[0]?.value
  }

  const rows = await selectSql<{ value: string }>(`SELECT_SETTING::${key}`)
  return rows[0]?.value
}

export async function setSetting(key: string, value: string) {
  await initDatabase()

  if (isAppDatabaseReady()) {
    await executeSql(`INSERT OR REPLACE INTO settings (key, value) VALUES (${sqlValue(key)}, ${sqlValue(value)})`)
    return
  }

  await executeSql(`UPSERT_SETTING::${JSON.stringify({ key, value })}`)
}
