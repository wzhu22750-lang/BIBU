# BIBU！开发者指南

本文档记录 BIBU！项目的本地开发、常用指令、分支规范、架构设计以及 Android 原生调试与构建流程。

---

## 一、环境准备

- **Node.js**：`>= 22.12.0`（建议使用 LTS）
- **npm**：`>= 10.x`
- **Android SDK**（如需原生开发）：建议安装 Android Studio，并配置环境变量 `ANDROID_HOME`（如 `~/Library/Android/sdk`）
- **JDK**：Java 21（Android Gradle 必须）

---

## 二、常用命令

### 1. 常用开发与检查命令

```bash
# 安装依赖
npm ci

# 启动 Web 本地开发服务器（默认端口 5173，全接口监听 0.0.0.0）
npm run dev

# 静态类型检查
npm run typecheck

# 运行自动化测试套件（Vitest）
npm test

# 生产环境打包构建
npm run build

# 预览生产构建结果
npm run preview

# 代码格式化与规范检查
npm run format
npm run format:check

# 重生成 README 配图（先起 npm run dev，截图落到 docs/media/）
node scripts/qa/shoot-readme.mjs
```

### 2. Android 相关命令

```bash
# 将 Web 构建产物同步到 Android 工程 assets
npm run android:sync

# 编译并生成 Android Debug APK
npm run android:build

# 发布前配置门禁检查（检查签名、通知图标、google-services.json 等）
npm run android:release:check

# 构建正式签名 Release APK（依赖 .env.release 或签名环境变量）
npm run android:release:build
```

---

## 三、工程目录结构

```text
.
├── android/                  # Capacitor Android 原生工程（Gradle、Kotlin 源码、资源）
│   ├── app/src/main/java/    # Android 原生代码（MainActivity、BiboDevicePlugin、提醒逻辑）
│   └── app/src/main/res/     # 应用图标、状态栏通知图标、Strings、XML 配置
├── public/                   # 静态公开资源（favicon、本地预置字体、演示素材）
├── scripts/                  # 辅助脚本（发布打包、Release 检查、图标生成、QA 截图）
├── src/                      # 前端核心业务源码
│   ├── components/           # UI 组件库（弹窗、选择器、导航栏、像素艺术、提醒特效）
│   │   └── pet/              # 萌宠衣橱角色渲染与适配组件
│   ├── hooks/                # 状态与业务 Hooks（useSpace、useBibu、useNow、待发送队列等）
│   ├── lib/                  # 基础类库（Supabase 客户端、IndexedDB 缓存、路由、时间、通知）
│   │   └── pet/              # 角色视觉档案、装备兼容性矩阵与位置计算
│   ├── native/               # Android 原生能力桥接合同与 Web Fallback 兜底层
│   ├── pages/                # 核心页面（小窝、聊天、纪念日、照片、专注、衣橱、设置、认证）
│   ├── styles.css            # 全局像素设计系统样式与通用 Token
│   └── expectations.css      # 纪念日、彩色图标与情绪底栏样式
├── supabase/                 # Supabase 数据库迁移、Edge Functions 与权限测试
│   ├── functions/            # Deno Edge Functions（消息推送、Ping 推送、账户注销、微信登录服务 wechat-auth）
│   ├── migrations/           # 顺序 SQL 增量迁移脚本
│   └── tests/                # 基于 PGlite 的本地 RLS 与 RPC 自动化测试套件
├── capacitor.config.json     # Capacitor 跨平台核心配置
├── package.json              # 项目依赖与 Scripts
└── vite.config.ts            # Vite 配置文件
```

---

## 四、前端分包与离线缓存

- **路由级懒加载**：`src/App.tsx` 中的六个功能页与 `Auth` / `Onboarding` 均通过 `React.lazy` 按需加载，并用 `Suspense` 包裹（页内加载态为 `.page-loading`）。新增页面时保持同样的懒加载写法，避免首屏主包重新膨胀。
- **第三方库分包**：`vite.config.ts` 的 `output.codeSplitting.groups` 将 `node_modules` 按包拆分为 `vendor-*` 分片，改动业务代码不会连带刷新依赖缓存。
- **Service Worker 预缓存**：`public/sw.js` 在 `install` 阶段读取 `/precache-manifest.json` 预缓存壳层与全部分片；该清单由 `vite.config.ts` 的 `serviceWorkerPrecache` 插件在构建后写入 `dist/`，同时把 `__BIBU_RELEASE__` 占位符替换为当次 commit。**不要手工改动 `sw.js` 里的 `RELEASE`**，发版时它会自动变化，从而触发 SW 更新与旧缓存清理。
- **分片失效兜底**：新版本发布后旧分片会被清理，`src/main.tsx` 监听 `vite:preloadError` 并在 60 秒内最多整页刷新一次，避免用户看到空白页。

---

## 五、本地开发流程

### 1. 本地演示模式 (Demo Mode)

不需要配置任何后端数据库即可直接探索 BIBU！。
当未检测到外部环境变量时，应用自动以 Demo 模式启动，所有数据存储在浏览器本地 `localStorage` 的 `bibu-demo-v1` 中，支持双开浏览器标签页测试广播同步。

### 2. 连接真实 Supabase 后端

项目默认内置了共享开发数据库。若要切换为你个人的 Supabase 项目：

1. 复制 `.env.example` 为 `.env.local`。
2. 填写你的 `VITE_SUPABASE_URL` 和公开的 `VITE_SUPABASE_PUBLISHABLE_KEY`。
3. 在 Supabase 后台配置 Redirect URLs：
   - `http://localhost:5173`（本地开发）
   - `https://你的域名`（Web 生产站）
   - `love.bibu.space://`（Android 原生深度链接）

---

## 六、Android 原生开发流程

1. **首次配置 SDK 路径**：
   在 `android/` 目录下创建 `local.properties`（已被 Git 忽略）：
   ```properties
   sdk.dir=/Users/你的用户名/Library/Android/sdk
   ```
2. **Web 资源同步**：
   修改了前端代码后，必须执行 `npm run android:sync` 将编译后的 `dist/` 内容同步至 Android 工程的 `assets/public/` 目录。
3. **原生调试**：
   可通过 Android Studio 打开 `android/` 目录进行真机或模拟器调试，也可以直接运行命令行编译 `npm run android:build`。
4. **编译产物位置**：
   - Debug APK：`android/app/build/outputs/apk/debug/app-debug.apk`
   - Release APK：`android/app/build/outputs/apk/release/app-release.apk`

---

## 七、分支与提交规范

1. **主干分支**：`main` 为核心稳定分支，所有发版与构建基于该分支。
2. **特性与修复分支**：基于 `main` 分支检出，命名建议为 `feat/feature-name` 或 `fix/bug-name`。
3. **Commit 信息规范**：采用常规 Conventional Commits 风格，如：
   - `feat: 新增...`
   - `fix: 修复...`
   - `refactor: 重构...`
   - `docs: 文档更新`
   - `chore: 构建或配置调整`
4. **合并前检查**：合并进 `main` 之前，必须确保以下指令全部成功执行：
   ```bash
   npm run typecheck
   npm test
   npm run format:check
   npm run build
   ```
