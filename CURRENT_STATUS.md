# BIBU！当前项目状态

> 更新日期：2026 年 9 月 25 日 · 分支：`main`
>
> 迁移与线上环境的最新状态以 [DATABASE.md](DATABASE.md) 为准，本文件不重复维护。

## 一、当前完成度概览

BIBU！已完成前端全功能、数据持久化与离线缓存、Supabase 后端架构（含增量加固与注销能力）、Capacitor Android 原生能力桥接及本地构建流水线。

| 模块                         | 完成度 | 状态说明                                                                                       |
| ---------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| **Web 前端功能**             | 100%   | 六大功能页（小窝、悄悄话、值得期待、照片墙、专注陪伴、萌宠衣橱）与设置、登录、绑定均可正常运行 |
| **账号体系与微信登录**       | 待上线 | 代码与数据库迁移已就绪，线上函数与微信凭据待部署；未部署时前端自动隐藏入口（见发布阻塞项 5）   |
| **离线与缓存能力**           | 98%    | IndexedDB 照片缓存 (LRU/64MB)、三套待发队列、离线快照、Service Worker 预缓存全部分片           |
| **Supabase 数据库与 RLS**    | 95%    | 初始迁移 + 增量迁移全部就绪（迁移清单与线上状态见 DATABASE.md）；线上已应用加固与行锁保护      |
| **Edge Functions 服务端**    | 90%    | `send-message-push`、`send-ping-push`、`delete-account` 已部署线上并通过鉴权断言               |
| **Android 原生能力层**       | 85%    | 通知、非精确定时提醒 (AlarmManager)、UsageStats 使用量、Deep Link 回调、本地构建通过           |
| **生产发布就绪度 (Release)** | 待验收 | 缺少正式 release keystore 签名环境变量，暂未进行物理双机个推验收                               |

---

## 二、已完成能力

### 1. 核心业务体验

- **双人专属空间**：基于 Supabase Auth 邮箱魔法链接（PKCE 流程），通过 24 小时单次邀请码实现双人原子绑定与第三人绝对隔离。
- **双向情感 Ping**：六种恋爱情绪（哔卟哔卟、想你、抱一下、快来、晚安、我回来啦），服务端 3 秒行锁冷却，支持音效、震动与全屏像素动画。
- **私密悄悄话**：文字/Emoji 聊天，中文输入法保护，支持游标历史分页，未发送内容支持本地草稿恢复与待发送队列重试。
- **恋爱里程碑与期待**：天数自然日计算（开始日为第 0 天，非闰年 2 月 29 日兼容），64 款复古全彩像素 SVG 图标与分类搜索。
- **照片回忆墙**：私有 Storage 存储桶，1 小时签名 URL 自动轮换；本地 IndexedDB Blob 持久缓存与 LRU 淘汰；支持发生日期、长故事、关联事件与关联聊天。
- **专注陪伴与小约定**：双方专注状态与授权免打扰机制；Android 原生 UsageStats 查询今日屏幕交互或指定 App 使用时长；AlarmManager 非精确定时提醒。
- **萌宠衣橱**：16 款复古像素小动物，逐角色像素级测量与锚点档案，支持 60+ 装备/套装自由试穿与角色兼容性矩阵校验。

### 2. 原生与系统适配

- **Android 原生能力层**：基于 Capacitor 8 + Kotlin 原生插件（`BiboDevicePlugin`），实现独立私密通知渠道、锁屏可见性为 PRIVATE、专用状态栏小图标。
- **应用内日期选择器**：全面采用自研像素化 `PixelDatePicker` / `PixelTimePicker` / `PixelDateTimePicker`，摆脱 OEM 原生 Picker 样式碎片化。
- **Android 物理返回键处理**：层级化关闭弹窗 / 菜单 → 路由回退 → 退出应用。
- **沉浸式与安全区**：EdgeToEdge 透明系统状态栏，全面适配 `env(safe-area-inset-*)`。

### 3. 数据生命周期与隐私

- **关系封存**：支持解除关系并封存空间，撤销双人成员关系并封闭空间，历史数据保留但双方均不可再访问。
- **账户注销恢复**：提供注销前本地 marker 机制与服务端 `delete-account` Edge Function（自动清理本人照片文件、匿名化共同记录、删除 Auth 用户），防止网络中断假成功。

### 4. 账号体系扩展（微信）

- **微信快捷登录与身份绑定**：`supabase/functions/wechat-auth` 独立服务端直接对接微信开放平台，服务端换取 `openid` / `unionid` 并维护与 `bibu_user_id` 的唯一映射，签发一次性 ticket（5 分钟）供客户端换取标准 Supabase 会话，RLS / Storage / Realtime / 注销流程原生生效。
- **不依赖 Supabase Custom OAuth Provider**：无需 GoTrue OAuth Provider 或付费配置，微信 secret 只存在于服务端。
- **上线状态**：相关迁移（`202609220001_wechat_oauth_bridge`、`202609230001_wechat_auth_independent`）已应用到线上库；Edge Function `wechat-auth` 与 `WECHAT_*` 凭据尚未部署，前端会探测接口可用性并自动隐藏「微信快捷登录」入口（详见发布阻塞项 5 与 [docs/wechat-web-login.md](docs/wechat-web-login.md)）。

---

## 三、当前已知问题（已知且接受）

1. **首访后台预缓存**：页面已按路由懒加载（首屏只下载小窝所需分片，主包 1.1MB → ~310kB），Service Worker 会在首次访问后于后台预缓存全部分片与样式（约 400KB gzip），用于换取断网后进入任意页面；弱网下首访流量略高于纯按需加载。
2. **Android 编译警告**：Kotlin 编译时存在 `VIBRATOR_SERVICE` 和 `unsafeCheckOpNoThrow` 等已过时系统 API 警告，因需向前兼容老旧 Android 版本刻意保留。
3. **部分小动物同色系装扮对比度偏低**：小鸭穿嫩黄渔夫帽、白羊戴白厨师帽等像素艺术配色对比度偏低，有黑色硬轮廓描边兜底。

---

## 四、尚未完成事项（非阻塞）

1. **多语言 / 国际化扩展**：目前原生文本与 UI 仅面向中文。
2. **头像相册自由上传**：目前统一采用 16 款复古像素小动物形象与衣橱定制，尚未提供自定义用户相片作为头像。
3. **页面切换过渡**：切换页面时若对应分片尚未缓存，会短暂显示像素心加载态（正常联网下分片已由 Service Worker 预缓存，几乎不可见）。

---

## 五、发布前阻塞项 (Release Blockers)

在正式打出面向终端用户的生产 Release APK 之前，必须完成以下前置配置：

1. **正式签名凭据**：创建并配置 `.env.release`（或环境变量）中的 `BIBU_RELEASE_KEYSTORE`、`BIBU_RELEASE_STORE_PASSWORD`、`BIBU_RELEASE_KEY_ALIAS`、`BIBU_RELEASE_KEY_PASSWORD`。
2. **个推凭据配置**：在 `.env.release` 与 Supabase Edge Function Secrets 中配置 `GETUI_APP_ID`、`GETUI_APP_KEY`、`GETUI_MASTER_SECRET`。
3. **真实物理设备个推送达验收**：在两台真实物理 Android 设备上完成前台、后台、锁屏、进程被杀后的 Push 唤醒与点击跳转验收。
4. **线上 Supabase 触发器端到端核验**：确保远程 Database Webhook 对 `public.pings` 与 `public.messages` 的 AFTER INSERT 触发器稳定调用 Edge Function。
5. **微信登录服务上线**：线上尚未部署 Edge Function `wechat-auth`，也未配置 `WECHAT_APP_ID` / `WECHAT_APP_SECRET` / `WECHAT_MP_APP_ID` 等 Secrets（数据库侧 wechat 表与函数已就绪）。前端已按接口探测自动隐藏「微信快捷登录」入口（`checkWechatLoginAvailable`），函数部署后无需改代码即恢复展示；上线前仍需在微信开放平台完成回调域名配置并做端到端验收。
