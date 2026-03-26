# TimeFlow Project Spec

更新时间：2026-03-26

## 1. 文档目的

这份文档是当前项目的长期协作基线，后续无论是改功能、修 bug，还是重构通知、页面、存储层，都应先参考本文件。

建议遵循下面的使用方式：

- 改动前先确认相关模块是否已经在本文件中有约定。
- 改动后如果影响了目录结构、启动流程、数据模型或通知实现，需要同步更新本文件。
- 后续如果让我继续修改项目，可以先读取本文件，再定向进入对应代码。

## 2. 项目概览

`TimeFlow` 是一个基于 `uni-app + Vue 3 + TypeScript + Pinia` 的移动端自律应用，核心能力围绕以下几个场景展开：

- 今日任务管理
- 任务专注计时（正计时 / 倒计时 / 不计时）
- 日历回顾
- 数据统计
- 主题/语言/通知/壁纸设置
- 本地 SQLite 持久化
- Android / iOS 本地提醒

当前代码明显以 App 端体验为主，H5 更像调试和基础兼容环境。

## 3. 技术栈与运行环境

- UI/框架：`uni-app`、`Vue 3`
- 语言：`TypeScript`
- 状态管理：`Pinia`
- 样式：`SCSS`
- 图表：`ECharts`
- 本地数据：`plus.sqlite` + H5 fallback storage
- 原生通知扩展：`UTS` 自定义插件 `timeflow-local-notification`

关键配置：

- 路径别名：`@ -> src`，定义在 `vite.config.ts`
- 全局 SCSS 变量注入：`@/styles/variables.scss`
- App 权限与模块声明：`src/manifest.json`

## 4. 当前有效的主结构

### 4.1 启动入口

- `src/main.ts`
  - 创建 SSR App
  - 注册 Pinia
- `src/App.vue`
  - 应用级生命周期入口
  - 启动时执行 `appStore.bootstrap()` 和 `taskStore.bootstrap()`
  - 负责每日状态同步
  - 负责通知监听注册与前台提醒循环

### 4.2 当前有效页面

由 `src/pages.json` 注册的页面只有以下 5 个：

- `pages/home/index`
- `pages/calendar/index`
- `pages/statistics/index`
- `pages/profile/index`
- `pages/task-detail/index`

这 5 个页面才是当前运行时主路径。

### 4.3 页面组织方式

当前项目实际上有两套“展示层入口”并存：

1. 独立页面模式
   - `pages/calendar/index.vue`
   - `pages/statistics/index.vue`
   - `pages/profile/index.vue`

2. Home 页内嵌面板模式
   - `src/pages/home/index.vue` 中引入：
   - `components/dashboard/calendar-panel.vue`
   - `components/dashboard/statistics-panel.vue`
   - `components/dashboard/profile-panel.vue`

这意味着当前项目不是纯粹的标准 tabbar 路由模式，而是：

- 既有独立页面
- 又有 Home 内部的“伪多 tab”面板切换
- 两者复用同一套 store 数据，但视图逻辑有重复

后续如果做结构收敛，优先考虑统一为其中一种。

## 5. 目录与职责

### 5.1 核心目录

- `src/pages`
  - 页面入口
- `src/components`
  - 通用组件、首页组件、dashboard 面板、图表组件、布局壳组件
- `src/store`
  - 当前主状态管理
- `src/services`
  - 壁纸、通知、SQLite、语录等服务层
- `src/utils`
  - 日期、触感反馈、任务工厂函数
- `src/types`
  - 核心业务类型
- `src/constants`
  - 国际化文案
- `src/styles`
  - 全局主题与样式变量

### 5.2 最关键的文件

- `src/App.vue`
  - 应用级启动与通知协调
- `src/store/app.ts`
  - 全局设置、主题、语言、壁纸、通知设置与提醒横幅
- `src/store/tasks.ts`
  - 任务、计时器、专注记录、统计聚合
- `src/services/sqlite.ts`
  - 本地数据库与 fallback 存储封装
- `src/services/notification.ts`
  - 通知能力总入口，屏蔽 Android / iOS / H5 差异
- `src/components/layout/app-shell.vue`
  - 页面通用壳、顶部信息、底部 dock、应用内提醒横幅

## 6. 数据模型

定义在 `src/types/timeflow.ts`：

- `Task`
  - 任务主体
  - 包含标题、计划日期、计时模式、专注时长、完成状态、背景壁纸等
- `FocusSession`
  - 专注片段记录
  - 用于统计与累计专注时长
- `ActiveTaskTimer`
  - 运行中的内存计时器状态，额外持久化到本地 storage
- `NotificationSettings`
  - `enabled`
  - `time`
  - `repeatDays`

通知重复日使用 JS 的 `Date.getDay()` 语义：

- `0 = 周日`
- `1 = 周一`
- `...`
- `6 = 周六`

默认提醒配置：

- 开关关闭
- 时间 `21:00`
- 重复日为一周七天

## 7. 应用启动与运行链路

### 7.1 App 启动

`src/App.vue` 的 `onLaunch` 主流程：

1. `appStore.bootstrap()`
2. `taskStore.bootstrap()`
3. `syncDailyState()`
4. `syncForegroundReminderLoop()`
5. `startDaySyncTicker()`

### 7.2 App 回到前台

`onShow` 会做：

1. 再次同步当天状态
2. 对通知权限做 reconcile
3. 注册前台提醒监听
4. 重新启动前台提醒循环
5. 重启 day ticker

### 7.3 App 进入后台

`onHide` 会停止：

- 前台提醒循环
- 每日状态轮询 ticker

### 7.4 配置变更监听

`App.vue` 中 watch 以下字段：

- 通知开关
- 提醒时间
- 重复星期
- 通知权限状态
- 当前语言

这些变化会触发前台提醒循环重新同步。

## 8. Store 分层

### 8.1 `useAppStore`

职责：

- 主题模式
- 当前语言
- 壁纸缓存与刷新
- 通知设置
- 通知权限状态
- 应用内提醒 banner

核心方法：

- `bootstrap()`
  - 初始化数据库
  - 读取 settings
  - 读取/刷新壁纸
  - 初始化通知权限
  - 如果通知开关已开，则尝试同步通知
- `syncNotifications()`
  - 调用 `services/notification.ts`
- `setNotificationEnabled()`
- `setNotificationTime()`
- `setNotificationRepeatDays()`
- `reconcileNotificationPermission()`
- `presentReminder()`
  - 展示应用内顶部横幅提醒

### 8.2 `useTaskStore`

职责：

- 任务列表
- 专注记录
- 运行中的计时器
- 今日统计
- 日历与趋势数据聚合

关键实现方式：

- 任务和专注记录由 SQLite 持久化
- 正在运行的计时器通过 `uni.setStorageSync` 存本地
- 通过 1 秒 ticker 更新前台运行态
- 倒计时结束时自动完成任务

核心方法：

- `bootstrap()`
- `refresh()`
- `addTask()`
- `patchTask()`
- `toggleTask()`
- `deleteTask()`
- `startTaskTimer()`
- `pauseTaskTimer()`
- `finishTaskNow()`
- `appendFocusSession()`

## 9. 数据持久化实现

文件：`src/services/sqlite.ts`

### 9.1 App 端

App 端优先使用：

- `plus.sqlite`
- 数据库文件：`_doc/timeflow.db`
- 数据库名：`timeflow.db`

创建的表：

- `tasks`
- `focus_sessions`
- `settings`

还会建立索引：

- `idx_tasks_created_at`
- `idx_tasks_scheduled_date`
- `idx_sessions_started_at`
- `idx_sessions_session_date`

### 9.2 非 App 或 plus 不可用时

降级到本地 storage：

- storage key：`TIMEFLOW_FALLBACK_DATABASE`

fallback 中维护三类数据：

- `tasks`
- `focusSessions`
- `settings`

### 9.3 fallback 迁移策略

当 App 端 SQLite 可用后，会尝试把 fallback 数据迁移进原生数据库，然后清空 fallback。

这说明项目是按“先保证能跑，再在 App 中升级到 SQLite”思路实现的。

## 10. 页面实现方式

### 10.1 Home 页面

文件：`src/pages/home/index.vue`

特征：

- 是当前信息密度最高的页面
- 同时承担“今日任务主视图”和“内嵌多面板入口”
- 使用 `AppShell` 提供页面壳和底部 dock
- 任务创建、任务列表、战报海报、语录都集中在此

### 10.2 Task Detail 页面

文件：`src/pages/task-detail/index.vue`

特征：

- 沉浸式背景图页面
- 展示单任务计时状态
- 支持开始、暂停、完成
- 仅在任务未开始且无计时时允许编辑

### 10.3 Calendar / Statistics / Profile

这些独立页面本质上是对 dashboard 面板能力的页面化拆分，和 Home 内部面板存在重复。

## 11. 系统通知实现分析

文件主入口：`src/services/notification.ts`

### 11.1 总体设计

当前通知实现不是单一方案，而是“按平台/能力动态分流”：

1. Android 独立 App 且 UTS 原生插件可用
   - 走自定义原生提醒后端
2. 其他 App 场景
   - 走 `plus.push.createMessage` 本地消息方案
3. H5 / 原生能力不可用
   - 通知能力基本不可用，但代码会尽量安全降级

### 11.2 通知设置入口

通知设置由 `useAppStore` 持有，Profile 页面负责操作：

- 开关：`setNotificationEnabled`
- 时间：`setNotificationTime`
- 重复周期：`setNotificationRepeatDays`

设置持久化到 `settings` 表中的 key：

- `notificationEnabled`
- `notificationTime`
- `notificationRepeatDays`
- `notificationPermissionAskedOnce`
- `notificationPermissionPromptVersion`

### 11.3 权限处理方式

#### Android

主要通过以下手段判断/申请：

- `NotificationManagerCompat.areNotificationsEnabled()`
- Android 13+ 的 `POST_NOTIFICATIONS` 运行时权限
- `plus.android.requestPermissions(...)`

还处理了一个现实问题：

- 某些 Android ROM 在刚授权后，`areNotificationsEnabled()` 可能短时间内返回不准确
- 因此代码额外用运行时权限状态兜底，避免误判

#### iOS

没有自定义 iOS UTS 通知后端。

当前更偏向通过以下能力侧面判断：

- `plus.push.getClientInfoAsync`
- `uni.getPushClientId`

也就是说，iOS 端的权限和消息能力目前依赖 `plus.push` 侧能力，而不是项目内自己实现一套原生 iOS 通知调度。

#### HBuilder 调试基座

代码专门识别 HBuilder 调试基座包名：

- `io.dcloud.HBuilder`
- `io.dcloud.*`

在这个环境里，通知权限申请被视为不可靠，所以文案明确提示要用独立安装包测试。

### 11.4 Android 原生通知后端

Android 原生后端来自自定义插件：

- `src/uni_modules/timeflow-local-notification/utssdk/index.uts`
- `src/uni_modules/timeflow-local-notification/utssdk/app-android/index.uts`

注意：

- 仓库根目录存在空的 `uni_modules/`
- 实际插件源码在 `src/uni_modules/timeflow-local-notification`

#### Android 后端核心机制

插件使用：

- `AlarmManager`
- `BroadcastReceiver`
- `NotificationManagerCompat`
- `NotificationChannel`
- `SharedPreferences`

具体策略：

1. JS 层把提醒时间、重复日、标题、内容传给 UTS 插件
2. 插件把配置持久化到 `SharedPreferences`
3. 为每个星期几单独设置一个闹钟
4. 闹钟触发后：
   - 先重新安排下一周的同类提醒
   - `exact` 模式下，如果 App 不在前台，则弹系统通知；如果 App 在前台，则交给 JS 前台 banner
   - `inexact` 模式下，系统通知本身就是唯一可信提醒源，因此即使在前台也会直接弹系统通知

#### Android exact alarm 新逻辑

当前 Android 原生插件会区分两种后台调度模式：

- `exact`
  - 设备允许精确闹钟
  - 使用 `setExactAndAllowWhileIdle` / `setExact`
- `inexact`
  - 设备未授予精确闹钟能力
  - 自动降级为 `setAndAllowWhileIdle` / `set`
  - 后台提醒可能延后

App 侧会同时维护一份 `notificationRuntime` 状态，用来标记：

- 当前通知后端
- 当前调度模式是 `exact` 还是 `inexact`
- Android 是否支持 exact alarm
- 当前是否已授予 exact alarm

Android 配置上已补充：

- `android.permission.SCHEDULE_EXACT_ALARM`
- `android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED`

这样在用户授予 exact alarm 后，原生层可以自动重建闹钟。

#### Android Studio `simpleDemo` 集成说明

当前项目除了 uni-app / HBuilder 原生插件路径，还额外兼容 Android Studio 的 `simpleDemo` 集成壳。

已知问题是：

- 仅把 HBuilder 发行后的 `www` 资源复制到 `simpleDemo/src/main/assets/apps/.../www`
- 并不能自动同步 Android Manifest、receiver、exact alarm 权限或原生通知代码

因此现在的实现增加了一层兼容：

- 优先使用 `requireNativePlugin('timeflow-local-notification')`
- 如果 Android Studio 壳里拿不到该插件
- JS 会退回检测 `com.timeflow.selfdiscipline.reminder.ReminderScheduler`
- 通过 `plus.android.importClass(...)` 直接调用壳内 Java reminder 实现

也就是说，在 `simpleDemo` 模式下：

- 前端资源更新仍然要复制到 `assets/apps/.../www`
- 但通知相关原生改动必须同步到壳源码层
- 然后重新打 APK 才会生效

#### Android 调度特点

- requestCode 按星期几固定：`42000 + day`
- 优先使用 `setExactAndAllowWhileIdle`
- 兼容降级到 `setAndAllowWhileIdle` / `setExact` / `set`
- 通知渠道：
  - channel id: `timeflow_daily_reminder`
  - importance: `HIGH`

#### Android 恢复机制

插件在 `AndroidManifest.xml` 注册了两个 receiver：

- `ReminderAlarmReceiver`
  - 处理单次提醒触发
- `ReminderRestoreReceiver`
  - 处理恢复调度

恢复监听的系统事件：

- `BOOT_COMPLETED`
- `TIME_SET`
- `TIMEZONE_CHANGED`
- `MY_PACKAGE_REPLACED`
- `SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED`

这说明当前 Android 通知实现已经考虑了：

- 重启丢闹钟
- 手动改时间
- 改时区
- App 升级后重新注册提醒

### 11.5 非 Android 原生后端的实现

在非 Android 原生插件路径下，`syncDailyNotifications()` 会：

1. 等待 `plus.push` 可用
2. 清空历史本地消息
3. 如果通知开关未开，直接返回
4. 申请通知权限
5. 调用 `plus.push.setAutoNotification(true)`
6. 计算未来 180 天的提醒时间点
7. 对每个时间点调用 `plus.push.createMessage(...)`

消息 payload 中包含：

- `type: timeflow_recurring_reminder`
- `at`
- `scheduleId`
- `title`
- `content`

也就是说，当前非 Android 原生路径不是“系统级循环调度”，而是“一次性预排未来 180 天全部消息”。

### 11.6 前台提醒实现

前台提醒不是完全依赖系统通知 UI，而是额外实现了应用内横幅。

涉及文件：

- `src/App.vue`
- `src/services/notification.ts`
- `src/components/layout/app-shell.vue`
- `src/store/app.ts`

有两种实现路径：

#### 路径 A：`plus.push` 接收监听

用于非 Android 原生插件路径：

- `registerForegroundReminderListener()`
- 监听 `plus.push.addEventListener('receive', ...)`
- 收到属于 `timeflow_recurring_reminder` 的 payload 后
- 调用 `appStore.presentReminder(...)`
- 在页面顶部展示应用内 banner

#### 路径 B：前台定时循环

用于 Android 原生插件路径：

- 因为 Android `AlarmReceiver` 在 App 前台时不会主动发系统通知
- 所以 JS 层额外维护一个 `setTimeout` 循环
- 到达下一次触发时间时，直接在前台弹应用内 banner

这就是为什么 `App.vue` 里有：

- `usesNativeForegroundReminderLoop()`
- `startForegroundReminderLoop()`
- `stopForegroundReminderLoop()`

注意：现在前台循环只会在 Android 原生后端的 `exact` 模式下启用。

这意味着：

- `exact` 模式：后台靠原生精确闹钟，前台靠 JS banner 补齐体验
- `inexact` 模式：前后台都以原生 inexact alarm 为准，不再让 JS 前台循环“看起来很准”

### 11.7 当前通知实现的结论

当前系统通知实现已经不是简单 demo，而是比较明确的双轨架构：

- Android：自研 UTS + AlarmManager，控制力更强，可靠性更高
- iOS / 其他：依赖 `plus.push.createMessage` 预排消息
- 前台展示：统一走应用内 banner 体验

### 11.8 当前通知实现的注意点

1. iOS 原生插件后端仍是空实现
   - `src/uni_modules/timeflow-local-notification/utssdk/app-ios/index.uts`
   - 当前返回 `unsupported`
   - 所以 iOS 侧实际上依赖 `plus.push` 路径，而不是自定义 UTS 调度

2. Android 插件源码位置不标准
   - 插件在 `src/uni_modules`
   - 根目录 `uni_modules` 为空
   - 后续如果升级 uni-app / HBuilderX，需要优先确认这种放置方式是否仍被正确识别

3. Home 面板和独立页面存在重复通知设置 UI
   - `pages/profile/index.vue`
   - `components/dashboard/profile-panel.vue`
   - 后续改通知设置时，通常需要同时检查这两处

4. 非 Android 原生路径采用“未来 180 天预排”
   - 逻辑简单
   - 但在极端情况下，若系统对本地消息保留策略有变动，可能需要重新验证长期可靠性

5. Android 即使已经补了 exact alarm 能力判断，仍然要接受一个现实：
   - 当设备未授予 exact alarm 时，项目会显式降级为 `inexact`
   - 这比“看起来成功但后台不准时”更可靠，但不代表后台一定能完全准点

## 12. 国际化与主题实现方式

### 12.1 国际化

- 文案定义：`src/constants/i18n.ts`
- 当前支持：
  - `zh-CN`
  - `en`
- `appStore.t(key)` 是统一取词入口

### 12.2 主题

- 主题模式：`light | dark | system`
- `appStore` 负责决定当前应用主题
- H5 场景下还会同步 `document.documentElement` 和 `meta[name="theme-color"]`

## 13. 当前确认的遗留/非主路径代码

以下文件或模块看起来不是当前主产品路径的一部分，后续修改时不要默认它们在运行：

- `src/pages/index/index.vue`
  - 未在 `pages.json` 中注册
  - 更像旧模板 demo 页
- `src/api/*`
  - 旧接口层
- `src/lib/request/*`
  - 旧请求封装
- `src/store/user.ts`
  - 旧 demo store
- `src/components/global/*`
  - 与旧 demo 页配套

此外还有一个值得注意的现象：

- `src/pages/index/index.vue` 仍在引用旧 store 组织方式
- 但当前 `src/store/index.ts` 只导出 `setupPinia()`

这进一步说明上述代码属于历史遗留，而不是当前主运行链路。

## 14. 后续改动建议

如果后面继续迭代当前项目，建议优先遵循下面的策略：

1. 任何业务改动优先落在 `app store / task store / services` 这条主链上
2. 先判断是改独立页面，还是也要同步 Home 内嵌 dashboard 面板
3. 改通知时优先区分：
   - Android 原生插件路径
   - plus.push 路径
4. 如果要做通知重构，优先补齐 iOS 原生实现或统一调度策略
5. 如果要做页面收敛，优先处理 profile/calendar/statistics 的“双实现”问题

## 15. 快速索引

后续最常访问的文件建议从这里开始：

- 启动入口：`src/App.vue`
- 全局状态：`src/store/app.ts`
- 任务状态：`src/store/tasks.ts`
- 通知服务：`src/services/notification.ts`
- SQLite 服务：`src/services/sqlite.ts`
- 主页面：`src/pages/home/index.vue`
- 任务详情：`src/pages/task-detail/index.vue`
- 个人中心：`src/pages/profile/index.vue`
- Android 通知插件：`src/uni_modules/timeflow-local-notification/utssdk/app-android/index.uts`
- Android 通知注册：`src/uni_modules/timeflow-local-notification/utssdk/app-android/AndroidManifest.xml`
