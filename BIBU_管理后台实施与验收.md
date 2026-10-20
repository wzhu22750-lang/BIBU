# BIBU！管理后台实施、验收与交接文档

> 更新日期：2026-10-20  
> 代码基线：`main` · `4043956` + 当前未提交工作区  
> 线上 Supabase 项目：`zqwzdoejxsfscisudacu`  
> 文档定位：实施/验收记录 + 后续维护交接。所有结论以本轮实际执行结果为准，不沿用上一轮测试数字。

---

## 1. 交接结论

本轮完成了代码与数据库层面的核心修复，但**生产管理后台仍不能直接登录使用**。

准确结论：

- **代码与数据库：有条件可发布。** `/session` 的真实 SDK 契约错误、工单详情竞态、逻辑操作幂等、owner 并发约束、请求 ID/审计关联、诊断写入生命周期均已修复，并有对应测试。
- **生产后台：仍被部署与初始化阻塞。** `admin-api` 尚未部署，管理台静态站未上线，线上 `admin_members = 0`，还没有首位 owner；本轮没有执行这些需要额外授权的动作。
- **真实 Auth + MFA + Edge Function 联调（E 层）未完成。** 浏览器验证使用 mock Auth 与 mock admin-api（D 层），不能替代线上联调。
- **owner 并发多连接验证未完成。** 当前环境没有可用的本地 PostgreSQL/psql，Docker daemon 未运行；PGlite 单连接测试只能验证顺序约束，不能冒充并发验证。

上一版文档中的“目前不能登录均属于部署/初始化事项，不是代码缺失”**不准确**。本轮确认 `/session` 存在真实的运行时契约缺陷；该缺陷已修复，剩余阻塞才是部署与初始化。

本轮只对线上执行了增量数据库迁移 `202610200002_admin_hardening.sql`。没有修改真实用户/情侣/工单数据，没有初始化 owner，没有停用真实管理员，没有发送消息、推送或邮件，没有部署前端或 Edge Function。

---

## 2. 当前状态一览

| 项目                | 当前状态                 | 证据 / 说明                                                                          | 下一步                                   |
| ------------------- | ------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------- |
| 用户端 / 后台 / API | 类型检查通过             | `npm run typecheck`、`npm run admin:typecheck`、`npx tsc -p tsconfig.admin-api.json` | 保持                                     |
| 全量测试            | 496 通过 / 1 跳过        | 57 个测试文件通过，1 个跳过；见第 10 节                                              | 后续改动继续跑                           |
| 用户端构建          | 通过                     | `npm run build`；入口约 313 kB（gzip 84 kB）                                         | 保持                                     |
| 后台构建            | 通过                     | `npm run admin:build`；JS 529.39 kB（gzip 146.74 kB），仍有 >500 kB 警告             | 可后续按路由拆包                         |
| 迁移 `...0001`      | 已上线并核验             | 管理、工单、审计、诊断对象                                                           | 不重跑                                   |
| 迁移 `...0002`      | 已上线并核验             | 用户幂等、请求 ID/审计、owner advisory lock、清理函数                                | 不重跑；保留文件                         |
| `admin-api`         | 未部署                   | 线上函数列表只有 `send-message-push`、`send-ping-push`、`delete-account`             | 部署新版 `admin-api`                     |
| 管理台静态站        | 未部署                   | `admin.515171.xyz` 当前未提供可用 TLS/站点                                           | 部署独立 Vercel 项目并绑定域名           |
| 首位 owner          | 未初始化                 | 线上 `admin_members = 0`、`admin_audit_logs = 0`                                     | 获得授权后用现有用户 UUID 执行 bootstrap |
| 用户反馈入口        | 代码完成，未随用户端发版 | `SupportFeedback` 已改为 v2 幂等 RPC                                                 | 随用户端下一次发版上线                   |
| 推送诊断采集端      | 未部署                   | 线上 v13/v14 源码中不含 `recordDelivery`；`notification_delivery_logs = 0`           | 部署两个推送函数后诊断页才会出现阶段记录 |
| 客户端送达/打开回执 | 不存在                   | 没有客户端 `client_received` / `opened` 上报                                         | 页面继续按“未采集”展示，不写成已送达     |
| 真实业务数据        | 未改动                   | 线上管理员/审计/工单/诊断/幂等计数均为 0                                             | 保持                                     |
| Git                 | 未提交、未推送、未部署   | 工作区仍有本任务及既有修改；见第 12 节                                               | 按文件边界人工提交，不使用 `git add -A`  |

---

## 3. 本轮修复的问题

| 问题                               | 根因                                                                                                    | 修改文件                                                                                                                       | 验证                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 管理员完成 MFA 后 `/session` 500   | supabase-js 的 `rpc()` 返回 PromiseLike/PostgREST 构造器，没有 `.catch()`；自定义客户端却声明为 Promise | `supabase/functions/admin-api/{handler,types,client,index}.ts`                                                                 | 真实 supabase-js + fake fetch 契约测试；`/session` 返回 200                    |
| 工单详情被慢请求覆盖、回复错对象   | 没有请求序号/当前工单核对；`detail` 与 `openId` 共享可变状态；草稿全局共享                              | `src/components/SupportFeedback.tsx`、`src/lib/supportTicketDetail.ts`                                                         | 8 个控制器测试：A 慢 B 快、A 快 B 慢、关闭后旧请求、重试、草稿隔离、提交中切换 |
| 响应丢失后重试产生重复写入         | 每次点击生成新幂等键；用户端 RPC 没有完整幂等机制                                                       | `apps/admin/src/lib/idempotency.ts`、`TicketDetail.tsx`、`UserDetail.tsx`、`Admins.tsx`、`SupportFeedback.tsx`、迁移 `...0002` | 浏览器验证失败重试复用同一 `Idempotency-Key`；数据库测试只产生一条业务记录     |
| 并发降级/停用 owner 可能清空 owner | `admin_upsert_member` 只锁目标成员行，再统计 owner；bootstrap 也是“先查后插”                            | 迁移 `...0002`：`pg_advisory_xact_lock` + 锁后复核                                                                             | 顺序降级最后一位 owner 被拒绝；失败事务无部分变更/成功审计；多连接并发未验证   |
| 请求 ID、审计与幂等键割裂          | 成功审计用 `req-<idempotency_key>`，失败审计用 API request_id；重放没有原请求编号元数据                 | `handler.ts`、迁移 `...0002`、后台三个写页面                                                                                   | 成功审计 request_id = API 请求 ID；重放返回原 request_id 与 replayed           |
| 诊断采集端未随后台发布             | 结构化诊断写在两个推送函数里，部署后台不会自动更新推送函数                                              | `_shared/diagnostics.ts`、发布文档                                                                                             | 线上函数源码核对：v13/v14 尚无诊断代码；发布顺序见第 8 节                      |
| `useApi` 切换对象时残留旧数据      | key 改变时只置 loading，仍返回上一次 `data`；详情页组件未按路由重挂载                                   | `apps/admin/src/lib/useApi.ts`、`App.tsx`、写页面                                                                              | 纯状态测试 + 浏览器 T1/T2 切换无旧内容                                         |

补充修复：

- `bootstrapStatus()` 不再把数据库/PostgREST 错误吞成 `initialized: false`，避免把“服务不可用”误判成“后台未初始化”。
- 失败审计写入失败时输出带 request_id 的服务端错误日志，不再完全静默。
- 诊断写入超时后会清理计时器，并在 Supabase Edge Runtime 存在时通过 `waitUntil` 保持旁路写入存活；诊断失败/超时不会改变推送响应。

---

## 4. 架构与数据流

```text
管理员浏览器
  └─ 独立管理台 apps/admin（React + Vite，dist-admin）
       ├─ Supabase Auth：邮箱密码 + TOTP MFA
       └─ 只调用 admin-api，不直接读管理表
            └─ Supabase Edge Function: admin-api
                 ├─ 校验 JWT、session_id、会话是否仍有效
                 ├─ 校验 admin_members 身份与角色能力（每次请求实时读取）
                 ├─ 强制 AAL2 + TOTP AMR
                 ├─ 校验 CORS 来源
                 ├─ 参数白名单 / 分页上限 / Idempotency-Key
                 └─ 以 service_role 调用 SECURITY DEFINER RPC
                      └─ PostgreSQL：聚合、脱敏、审计、幂等记录

用户端“帮助与反馈”
  └─ authenticated RPC：create_support_ticket_v2 / reply_my_support_ticket_v2
       └─ support_idempotency_keys（按用户 + 操作 + 内容哈希隔离）
```

关键边界不变：

- 浏览器只持有公开 URL 与 publishable/anon key；`service_role` 不进入前端产物。
- 管理表对 `anon` / `authenticated` 不开放；管理 RPC 只授予 `service_role`。
- 用户工单 RPC 只授予 `authenticated`，SQL 内用 `auth.uid()` 判定归属。
- 前端能力判断只隐藏入口；每个 API 独立校验。
- 后台与用户端是两个独立构建。

---

## 5. 权限与 API

### 5.1 角色能力矩阵

| 能力                 | owner | operator | support | maintainer |
| -------------------- | :---: | :------: | :-----: | :--------: |
| `overview.read`      |   ✓   |    ✓     |    ✓    |     ✓      |
| `users.read`         |   ✓   |    ✓     |    ✓    |     —      |
| `users.search_email` |   ✓   |    ✓     |    —    |     —      |
| `users.notes.write`  |   ✓   |    ✓     |    ✓    |     —      |
| `couples.read`       |   ✓   |    ✓     |    ✓    |     —      |
| `tickets.read`       |   ✓   |    ✓     |    ✓    |     —      |
| `tickets.write`      |   ✓   |    ✓     |    ✓    |     —      |
| `diagnostics.read`   |   ✓   |    ✓     |    —    |     ✓      |
| `system.read`        |   ✓   |    ✓     |    —    |     ✓      |
| `audit.read`         |   ✓   |    ✓     |    —    |     —      |
| `admins.manage`      |   ✓   |    —     |    —    |     —      |

### 5.2 管理 API 路由

除 `/auth-context`、`/session` 外，业务路由均要求：有效 JWT、会话仍存在且未过期、`admin_members` 有效、AAL2、TOTP AMR、允许的 CORS 来源。

| 方法与路径                  | 能力                     | 说明                                  |
| --------------------------- | ------------------------ | ------------------------------------- |
| `GET /auth-context`         | 登录用户（不要求管理员） | 是否初始化、是否管理员、MFA 状态      |
| `GET /session`              | 登录用户                 | 后台会话；非管理员/MFA 不足时明确拒绝 |
| `GET /overview`             | `overview.read`          | 总览、趋势、异常、工单摘要            |
| `GET /users`                | `users.read`             | 用户分页、搜索、排序、筛选            |
| `GET /users/:id`            | `users.read`             | 用户详情                              |
| `POST /users/:id/notes`     | `users.notes.write`      | 写备注，必须带幂等键                  |
| `GET /couples`              | `couples.read`           | 空间列表与筛选                        |
| `GET /couples/:id`          | `couples.read`           | 空间详情与聚合                        |
| `GET /tickets`              | `tickets.read`           | 工单列表                              |
| `GET /tickets/:id`          | `tickets.read`           | 工单详情、用户可见线程与内部备注      |
| `POST /tickets/:id/actions` | `tickets.write`          | 回复/备注/状态/指派，必须带幂等键     |
| `GET /diagnostics`          | `diagnostics.read`       | 推送阶段与失败诊断                    |
| `GET /audit`                | `audit.read`             | 审计日志                              |
| `GET /system`               | `system.read`            | 系统状态与数据覆盖                    |
| `GET /admins`               | `admins.manage`          | 管理员列表                            |
| `POST /admins`              | `admins.manage`          | 新增/调整管理员，必须带幂等键         |

### 5.3 用户工单 RPC

| 函数                                                              | 调用方        | 说明                                                       |
| ----------------------------------------------------------------- | ------------- | ---------------------------------------------------------- |
| `create_support_ticket(...)`                                      | authenticated | 旧签名保留；内部生成新键，兼容已发版客户端，但无跨重试幂等 |
| `reply_my_support_ticket(...)`                                    | authenticated | 同上                                                       |
| `create_support_ticket_v2(p_idempotency_key, ...)`                | authenticated | 新客户端使用；逻辑操作级幂等                               |
| `reply_my_support_ticket_v2(p_idempotency_key, p_ticket_id, ...)` | authenticated | 新客户端使用；逻辑操作级幂等                               |
| `my_support_tickets()` / `my_support_ticket(uuid)`                | authenticated | 只返回本人、`visibility='user'` 的消息                     |

---

## 6. 幂等、请求 ID 与审计语义

### 6.1 管理端

- 浏览器以“一次逻辑提交”为单位生成 `Idempotency-Key`，不是每次 HTTP 尝试都换键。
- 内容不变时，网络错误、超时、响应丢失后的重试复用同一键。
- 内容变化（正文、理由、动作、目标等）会生成新键。
- 明确成功后结束该逻辑操作，下一次提交生成新键。
- 同一键携带不同内容：数据库返回 `23505`，API 映射为 409 `conflict`。
- 幂等记录与业务写入在同一数据库事务中；业务回滚时幂等占位也回滚。
- 幂等键不持久化到浏览器存储。**页面刷新后无法自动续用未确认操作的键**；页面明确提示：先刷新列表/审计确认是否已保存，再决定是否重发。
- 由于刷新后的新提交会使用新键，若上一次其实已成功且用户再次提交相同内容，仍可能形成第二条逻辑操作；这不是“重复重试”，而是用户未确认结果后的新操作。当前策略是明确提示，不做自动重放。

### 6.2 请求 ID 与审计

一次逻辑操作可能对应多次 HTTP 请求：

| 字段                                   | 含义                                                      |
| -------------------------------------- | --------------------------------------------------------- |
| 响应顶层 `request_id` / `X-Request-Id` | **本次 HTTP 请求**的服务端编号；失败审计使用它            |
| `data.operation.request_id`            | **首次成功执行**的请求编号；成功审计使用它                |
| `data.operation.current_request_id`    | 当前这次 HTTP 请求编号                                    |
| `data.operation.replayed`              | 本次响应是否来自幂等重放                                  |
| 审计 `summary.idempotency_key`         | 逻辑操作键，用于把重放与首次执行关联                      |
| 审计 `summary.operation_request_id`    | 首次成功执行请求编号（与管理 RPC 的 `p_request_id` 一致） |

语义：

- 首次成功：写一条业务成功审计，`request_id` = 首次 API 请求编号。
- 失败：写一条失败审计，`request_id` = 本次失败请求编号。
- 幂等重放：不再写第二条业务成功审计；响应返回首次 `request_id`、当前请求编号与 `replayed=true`。
- 后台成功提示显示首次请求编号（前 8 位），失败提示显示本次请求编号；审计页可按请求 ID 搜索，展开行可复制完整编号与幂等键。
- 历史审计记录没有修改或删除。审计正文仍只记录长度、ID、状态等元数据，不写消息正文/工单全文/令牌。

### 6.3 用户端

- `support_idempotency_keys` 以 `key` 为主键，并记录 `user_id`、`operation`、`request_hash`、`response`、`expires_at`。
- 同一键必须匹配同一用户、同一操作、同一内容；否则拒绝。
- 其他用户使用同一 UUID 键会得到冲突错误，不能读取原用户响应。
- 响应丢失后，同一用户、同一内容、同一键重试会返回已存结果，只产生一条工单/一条回复。
- 幂等占位与业务写入在同一 RPC 事务中。
- 幂等记录 24 小时过期；清理函数会删除过期记录。

---

## 7. 数据库变更与线上核验

### 7.1 迁移文件

| 文件                                                   | 状态           | 内容                                                                           |
| ------------------------------------------------------ | -------------- | ------------------------------------------------------------------------------ |
| `supabase/migrations/202610200001_admin_console.sql`   | 上一轮已上线   | 管理表、工单、审计、诊断、后台 RPC、用户旧版工单 RPC                           |
| `supabase/migrations/202610200002_admin_hardening.sql` | **本轮已上线** | 用户幂等表/v2 RPC、管理幂等元数据、请求 ID 审计、owner advisory lock、清理函数 |

本轮没有修改 `...0001` 已发布内容；修复全部通过 `...0002` 追加完成。

### 7.2 `...0002` 的主要对象

- `public.support_idempotency_keys` + `support_idempotency_begin/read/store`
- `public.create_support_ticket_v2(...)`、`public.reply_my_support_ticket_v2(...)`
- 旧 `create_support_ticket` / `reply_my_support_ticket` 保留原签名并委托 v2
- `admin_idempotency_keys` 增加 `request_id`、`last_request_id`、`replay_count`
- `admin_idempotency_begin` 增加 `p_request_id`；新增 `admin_idempotency_lookup`
- `admin_add_user_note`、`admin_ticket_action`、`admin_upsert_member` 增加 `p_request_id`
- `admin_record_failure` 增加可选 `p_idempotency_key`
- `admin_upsert_member` / `admin_bootstrap_owner` 使用事务级 `pg_advisory_xact_lock(7480135000000000001)`
- `prune_admin_diagnostics` 增加清理过期用户幂等记录

### 7.3 线上核验（2026-10-20，本轮重新执行）

- 迁移通过 Management API 执行，HTTP 201。
- 线上 `pg_proc` 已存在新签名：
  - `create_support_ticket_v2(uuid,text,text,text,text)`
  - `reply_my_support_ticket_v2(uuid,uuid,text)`
  - `admin_add_user_note(...,text)`、`admin_ticket_action(...,text)`、`admin_upsert_member(...,text)`
  - `admin_idempotency_begin(...,text)`、`admin_idempotency_lookup(uuid)`
  - `admin_record_failure(...,uuid)`
- 所有相关函数为 `SECURITY DEFINER`，`proconfig = search_path=""`。
- 授权：
  - 新用户 v2 RPC：`authenticated` 可执行，`anon` 不可执行。
  - 管理写 RPC：仅 `service_role`（及 owner `postgres`）可执行，`authenticated` 不可执行。
  - 内部幂等辅助函数没有对 `anon` / `authenticated` 开放。
  - 旧用户 RPC 仍授予 `authenticated`，保持旧客户端兼容。
- 表：
  - `support_idempotency_keys`、`admin_idempotency_keys` 均启用 RLS。
  - 表 ACL 只有 `postgres`，没有 `anon` / `authenticated` / `service_role` 直接权限。
- 通过 PostgREST 匿名探测：
  - `create_support_ticket_v2` 返回 HTTP 401 / `42501 permission denied`，不是 `PGRST202`。
  - `admin_upsert_member` 返回 HTTP 401 / `42501 permission denied`，不是 `PGRST202`。
  - 说明 schema cache 已识别新签名，且未放宽匿名权限。
- `pg_get_functiondef` 核验 `admin_upsert_member` 与 `admin_bootstrap_owner` 均包含 `pg_advisory_xact_lock`。
- 线上计数仍为：`admin_members = 0`、`admin_audit_logs = 0`、`support_tickets = 0`、`notification_delivery_logs = 0`、两类幂等表均为 0。
- 本轮匿名探测只触发权限拒绝，没有写入业务数据。

### 7.4 并发验证边界

- PGlite 测试验证了：顺序降级最后一位 owner 被拒绝；失败事务不留下成员变更或成功审计；bootstrap 顺序重复被拒绝。
- **没有进行真实 PostgreSQL 多连接并发测试。** 当前机器没有 `psql`/本地 PostgreSQL，Docker daemon 未运行，PGlite 只有单连接。
- 因此“两个事务并发降级不同 owner 后仍保留至少一位 owner”“并发 bootstrap 最多一个成功”属于**代码设计已具备、运行时并发未实测**。不能把 PGlite 顺序测试描述成并发通过。
- 最小下一步：在隔离 staging PostgreSQL 上用两个连接同时调用 `admin_upsert_member` 或 `admin_bootstrap_owner`，验证 advisory lock 串行化与失败回滚。

---

## 8. 推送诊断：发布顺序、可见性与保留

### 8.1 当前线上事实

- `send-message-push` v13、`send-ping-push` v14 为 ACTIVE，`verify_jwt=false`。
- 下载线上函数源码核对：**两个已部署版本都不包含 `recordDelivery` / `record_notification_delivery`**。
- 因此当前诊断页只能看到“事件存在但无诊断记录”（`unrecorded`），不会看到 webhook、供应商接受/拒绝等阶段。
- `notification_delivery_logs` 当前为 0 条。

### 8.2 部署采集端前后的页面差异

| 阶段                 | 诊断页可见内容                                                                           | 不能推断的内容                     |
| -------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------- |
| 仅部署后台/管理 API  | 消息/提醒事件可能显示 `unrecorded`；没有供应商阶段                                       | 不能判断推送是否发出或设备是否收到 |
| 部署两个推送函数后   | `webhook_received`、`skipped`、`provider_accepted`、`provider_rejected`、`invalid_token` | 仍不能证明设备收到或用户打开       |
| 未来接入客户端回执后 | 才可能出现 `client_received` / `opened`                                                  | 当前没有该采集链路                 |

供应商“接受”只代表服务端请求被供应商接收，不等于设备收到，更不等于用户打开。页面与文档继续分开表述。

### 8.3 建议发布顺序

依赖关系决定了顺序：

1. **增量迁移与权限核验**（`...0002`，本轮已完成）。
2. **部署两个推送采集端**（`send-message-push`、`send-ping-push`）。它们只依赖迁移中的诊断 RPC；先部署采集端不会影响后台登录，但会让诊断数据开始产生。
3. **部署 `admin-api`**。新版 handler 会向管理 RPC 传 `p_request_id`，必须在 `...0002` 之后部署；不要用旧版 `admin-api` 调新签名。
4. **部署后台静态站**并配置 CORS/域名。
5. **获得明确授权后初始化首位 owner**。
6. **真实 Auth + MFA + Edge Function 联调与验收**。
7. **启用保留期清理调度**（代码已准备，生产启用需单独授权）。

采集端命令（`verify_jwt=false` 与当前线上配置一致）：

```bash
npx supabase functions deploy send-message-push \
  --project-ref zqwzdoejxsfscisudacu --no-verify-jwt
npx supabase functions deploy send-ping-push \
  --project-ref zqwzdoejxsfscisudacu --no-verify-jwt
```

> 部署采集端前先确认迁移已生效；部署后可用一次隔离测试事件检查诊断写入，但**不得为了验证向真实情侣发送通知**。

### 8.4 保留策略与清理

- 诊断日志默认保留 **30 天**；`prune_admin_diagnostics(p_retention_days)` 允许 7–365 天。
- 同一次清理还会删除过期的 `admin_idempotency_keys` 与 `support_idempotency_keys`（24 小时过期）。
- 清理函数只授予 `service_role`；用户与普通管理员不能调用。
- 线上**没有安装 `pg_cron`**（已核验扩展列表），因此不能用数据库内定时任务；需要外部调度器（例如受信任 CI/定时任务）调用 RPC。
- 已提供 `scripts/prune-admin-diagnostics.mjs`：
  - 需要 `SUPABASE_URL`、临时注入的 `SUPABASE_SERVICE_ROLE_KEY`、可选 `RETENTION_DAYS`；
  - 必须带 `--yes`；
  - 失败时非零退出，供调度器告警；
  - 不打印 service key 或供应商原始响应。
- **本轮没有执行线上历史数据清理**，也没有启用任何生产调度。最小启用方式（需单独授权）：

```bash
SUPABASE_URL="https://zqwzdoejxsfscisudacu.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<临时注入，不写入仓库>" \
RETENTION_DAYS=30 \
node scripts/prune-admin-diagnostics.mjs --yes
```

- 失败告警建议：调度器对非零退出码告警；同时在“系统状态”页观察诊断覆盖与近期失败。当前没有单独的“清理成功/失败”审计表，这是可接受的轻量方案，但调度器日志必须保留。
- 诊断写入是旁路：失败/超时不会改变推送响应；超时后若运行在 Edge Runtime，会通过 `waitUntil` 保持写入存活，否则允许其随运行时结束。采集端故障的代价是诊断缺失，不是推送失败。

---

## 9. 上线步骤（尚未执行）

以下动作需要额外授权；本轮只完成了第 1 项。

### 9.1 迁移（已完成）

- `...0001` 与 `...0002` 均已落盘并线上执行。
- 不重跑；后续修复继续追加迁移。

### 9.2 部署推送采集端

见 8.3。部署后确认函数版本变化，并用隔离测试数据观察诊断阶段；不要向真实情侣发通知。

### 9.3 部署 `admin-api`

```bash
npx supabase functions deploy admin-api \
  --project-ref zqwzdoejxsfscisudacu \
  --no-verify-jwt
```

- `verify_jwt=false` 只是网关配置；函数内部仍校验 JWT、会话、管理员身份、AAL2/TOTP 与能力。
- 新版 handler 依赖 `...0002` 的新签名，必须在迁移之后部署。
- 如需修改允许来源/环境标签，使用 `ADMIN_ALLOWED_ORIGINS`、`ADMIN_ENV_LABEL` secrets；不要把 service_role 写入前端变量。

### 9.4 部署管理台静态站

```bash
npm run admin:typecheck
npm run admin:build
# 产物：dist-admin/
```

- 使用独立 Vercel 项目，构建命令 `npm run admin:build`，输出 `dist-admin`。
- 绑定 `admin.515171.xyz`，同步 `ADMIN_ALLOWED_ORIGINS`。
- 前端环境变量只允许公开值：
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`
  - `VITE_ADMIN_API_URL`
- 不要用根目录 `vercel.json`（用户端 `dist`）部署后台。

### 9.5 初始化首位 owner（需明确授权）

前置条件：

- 目标用户已在主站注册，邮箱已验证（或为无邮箱的微信账号）；
- 已有用户 UUID；
- 线上 `admin_members` 为空；
- service_role 只在受信任 shell/CI 中临时注入。

```bash
SUPABASE_URL="https://zqwzdoejxsfscisudacu.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<临时注入，不写入仓库>" \
ADMIN_USER_ID="<现有用户 UUID>" \
ADMIN_DISPLAY_NAME="<审计显示名>" \
node scripts/admin-bootstrap.mjs --yes
```

本轮**没有**执行该步骤，没有创建默认密码，没有提升任何普通用户。

### 9.6 真实联调与验收

需要管理员账号 + TOTP + 已部署的 `admin-api` 和静态站。最小验收：

- [ ] `GET /auth-context` 未登录返回 401，而不是 404/网络错误。
- [ ] 管理员登录后完成 TOTP；普通用户被拒绝为 `not_admin`。
- [ ] 未完成 MFA 的管理员访问业务接口返回 `mfa_required`。
- [ ] `/session` 在合法管理员 + 有效会话 + AAL2 下返回 200（本轮仅在 B/D 层验证）。
- [ ] 停用管理员或撤销会话后，下一次请求立即失败。
- [ ] 总览日期/指标口径符合北京时间与文档定义。
- [ ] 用户列表默认邮箱脱敏；support 不能按完整邮箱搜索。
- [ ] 空间详情不返回聊天正文、照片原图、任务答案、邀请码、私密寄语。
- [ ] 用户只能看到自己的工单与 `visibility='user'` 消息。
- [ ] 工单回复用户可见；刷新/重试不产生重复消息。
- [ ] 审计可按请求 ID 搜索，展开可见完整请求 ID 与幂等键。
- [ ] 诊断页区分供应商接受与客户端收到/打开，未采集阶段如实标注。
- [ ] 用户端设置页可提交反馈，后台出现工单。
- [ ] 用户端配对、聊天、ping、照片、每日任务、离线缓存、注销流程回归通过。
- [ ] `capacitor.config.json` 的 `server.url` 仍为 `https://www.515171.xyz`。

---

## 10. 本轮实际验证结果

### 10.1 类型检查与构建

| 检查                                 | 实际结果                                                             |
| ------------------------------------ | -------------------------------------------------------------------- |
| `npm run typecheck`                  | 通过                                                                 |
| `npm run admin:typecheck`            | 通过                                                                 |
| `npx tsc -p tsconfig.admin-api.json` | 通过                                                                 |
| `npm run build`                      | 通过；入口 313.18 kB（gzip 84.08 kB）                                |
| `npm run admin:build`                | 通过；JS 529.39 kB（gzip 146.74 kB），单 chunk >500 kB 警告          |
| `npm test`                           | **57 个测试文件通过、1 个跳过；496 个用例通过、1 个跳过**            |
| 变更文件 Prettier 检查               | 通过（仅检查本轮修改文件；全仓 `format:check` 仍有既有文档格式问题） |

### 10.2 新增/更新的重点测试

| 测试                                      | 数量 | 覆盖                                                                                        |
| ----------------------------------------- | ---- | ------------------------------------------------------------------------------------------- |
| `supabase/tests/admin_api_sdk.test.ts`    | 4    | 真实 supabase-js + fake fetch；构造器无 `.catch`；`/session` 200；touch 失败/网络异常仍 200 |
| `supabase/tests/admin_api.test.ts`        | 14   | 身份、MFA、能力、参数、写审计、请求 ID/幂等键透传                                           |
| `supabase/tests/admin_console.test.ts`    | 12   | 迁移/RLS、工单隐私、用户 v2 幂等、审计关联、清理、owner 顺序约束                            |
| `supabase/tests/push_diagnostics.test.ts` | 4    | token 掩码、错误/异常/超时非阻断                                                            |
| `src/lib/supportTicketDetail.test.ts`     | 8    | A/B 乱序、关闭、重试、草稿隔离、提交中切换、重试同键/新操作新键                             |
| `apps/admin/src/lib/idempotency.test.ts`  | 4    | 同内容复用、内容变化换键、成功后清零、请求元数据                                            |
| `apps/admin/src/lib/useApi.test.ts`       | 3    | key 变化立即隐藏旧实体、同 key 刷新保留数据、旧请求不回写新 key                             |

### 10.3 验证层级

| 层级 | 内容                                                                  | 状态       |
| ---- | --------------------------------------------------------------------- | ---------- |
| A    | 纯单元测试（控制器、幂等键、useApi、诊断）                            | 完成       |
| B    | 真实 supabase-js + fake fetch 契约测试                                | 完成       |
| C    | PGlite 集成测试（迁移、RLS、RPC、事务、顺序约束）                     | 完成       |
| D    | 浏览器 + mock Auth/admin-api（登录、MFA、拒绝页、工单、审计、幂等键） | 完成       |
| E    | 真实 Auth + MFA + 已部署 Edge Function 联调                           | **未完成** |

D 层不能称为 E 层通过。E 层最小阻塞条件：

1. 获得生产部署授权，部署两个推送采集端、`admin-api`、管理台静态站；
2. 获得明确授权并指定一个现有用户 UUID，初始化首位 owner；
3. 该管理员能提供本机 TOTP 验证器（不要把 secret 发到聊天里）；
4. 然后按 9.6 在真实环境完成验收。

### 10.4 浏览器验证记录（D 层，mock）

- 登录页正常渲染，截图：`scripts/qa/admin-hardening-2026-10-20/login.png`。
- 使用 mock Supabase Auth + mock admin-api 完成登录，实际请求链：
  - `POST /auth/v1/token?grant_type=password` → 200
  - `GET /functions/v1/admin-api/auth-context` → 200
  - `GET /functions/v1/admin-api/session` → 200
  - `GET /functions/v1/admin-api/overview` → 200
- 登录后总览页正常渲染，截图：`scripts/qa/admin-hardening-2026-10-20/session-overview.png`。
- MFA challenge 页渲染“输入动态验证码”，未提供跳过入口。
- `not_admin` 与 `session_alive=false` 分别渲染“没有后台权限”“登录会话已失效”。
- 工单 T1/T2 切换：标题、描述与 `hasA/hasB` 断言均只显示当前工单，无旧内容残留。
- 回复请求带 `Idempotency-Key`；模拟 503 后重试相同内容，两次请求键一致；成功后的新操作生成新键。
- 审计页显示请求 ID，展开行可见完整请求 ID 与 `idempotency_key`。
- 说明：自动化截图在部分含持续动画的页面超时，因此这些页面以快照、DOM 断言和网络请求记录为准；两张成功截图已归档在 QA 目录。

### 10.5 未验证项

- 真实管理员登录、TOTP 挑战、会话巡检与权限撤销的 E 层联调。
- `admin-api` 在线上 Edge Runtime 的实际部署与冷启动行为。
- 线上推送采集端的实际诊断写入（当前 v13/v14 不含采集代码，未部署新版）。
- 真实 PostgreSQL 多连接 owner 并发。
- Vercel 子项目部署、域名与 CORS 实际配置。
- 真实用户工单/回复（没有向真实用户发送消息）。
- 客户端 `client_received` / `opened` 回执采集（当前不存在）。

---

## 11. 已知限制与风险

1. **生产后台不可用**：`admin-api`、静态站、首位 owner 三者都未完成。代码修复不等于线上可登录。
2. **管理 API 签名变更**：`...0002` 删除并重建了管理写 RPC 签名。当前线上没有已部署的旧 `admin-api`，因此没有线上兼容问题；但**必须部署新版 `admin-api`**，不能把旧构建直接部署到新迁移之上。
3. **用户旧客户端**：旧 `create_support_ticket` / `reply_my_support_ticket` 仍可用，但没有跨重试幂等；只有新前端使用 v2。旧版本客户端在响应丢失后仍可能重复提交，这是兼容性边界。
4. **页面刷新后的未确认操作**：幂等键不持久化，刷新后无法自动续用。页面已明确提示先确认再重发；这是有意的隐私/复杂度取舍。
5. **并发 owner 验证缺口**：advisory lock 代码与顺序约束已验证，但多连接并发未实测；发布前建议在隔离 staging 补测。
6. **诊断阶段缺口**：没有客户端回执采集；供应商接受不等于设备收到或用户打开。
7. **诊断采集端未部署**：当前线上推送函数版本不含结构化诊断，诊断页会显示大量 `unrecorded`。
8. **保留清理未启用**：线上无 `pg_cron`，需要外部调度；本轮没有执行清理或创建调度。
9. **后台单包较大**：529 kB 对内部工具可接受，但后续增加模块建议按路由拆包。
10. **全仓格式检查**：`format:check` 仍会报若干既有、与本任务无关的 Markdown/JSON 文件；本轮只格式化了改动文件，没有顺手改无关文档。
11. **工作区有既有未提交改动**：`AGENTS.md`、AI 上下文记录、`.qoder/settings.local.json` 等不属于本任务；不要用 `git add -A` 打包。

---

## 12. 回滚策略

默认**不做自动数据库回滚**：

- 管理表、工单、审计、幂等表都是增量新增；保留不会影响现有用户功能。
- 工单与审计是用户/管理数据；直接 drop 会丢失用户反馈与审计。
- 审计日志禁止 UPDATE/DELETE，不应为回滚破坏审计。
- `...0002` 的旧用户 RPC 签名仍保留，用户端可以回退到旧前端版本继续工作。

建议降级顺序：

1. 撤下管理台域名或停止静态站；
2. 撤销/停用 `admin-api`；
3. 如需回退推送采集端，重新部署上一版本函数；诊断日志保留；
4. 如需回退管理 API 代码，必须同时评估 `...0002` 新签名；不要直接部署旧 handler 调新/旧混合签名；
5. 保留数据库表、工单、审计与幂等记录；
6. 如确需移除后台对象，先导出审计与工单，再在明确授权下逐个处理；不要整库 reset。

保留期清理可以随时通过移除外部调度器停用；已经删除的过期日志不可恢复，这是保留策略的预期行为。

---

## 13. 工作区与后续交接

### 13.1 本轮修改的主要文件

- 管理 API：`supabase/functions/admin-api/{handler,types,client,index}.ts`
- 诊断：`supabase/functions/_shared/diagnostics.ts`
- 数据库：`supabase/migrations/202610200002_admin_hardening.sql`
- 用户反馈：`src/components/SupportFeedback.tsx`、`SupportFeedback.css`、`src/lib/supportTicketDetail.ts`
- 后台幂等：`apps/admin/src/lib/idempotency.ts`
- 后台数据加载：`apps/admin/src/lib/useApi.ts`
- 后台页面：`apps/admin/src/pages/{TicketDetail,UserDetail,Admins}.tsx`、`App.tsx`、`lib/api.ts`
- 测试：`supabase/tests/{admin_api,admin_api_sdk,admin_console,push_diagnostics}.test.ts`、`src/lib/supportTicketDetail.test.ts`、`apps/admin/src/lib/{idempotency,useApi}.test.ts`
- 运维脚本：`scripts/prune-admin-diagnostics.mjs`
- 文档：本文件

### 13.2 Git / 部署状态

- **没有 commit、push 或生产部署。**
- 没有初始化真实 owner，没有提升普通用户，没有停用真实管理员。
- 没有修改/删除真实情侣、用户、工单数据。
- 没有向真实用户发送消息、推送或邮件。
- 保留了工作区原有的与本任务无关的修改（`AGENTS.md`、`.qoder/settings.local.json`、AI 上下文记录等）。
- 线上唯一变更是数据库迁移 `...0002`；迁移文件与线上执行内容一致。

### 13.3 最小解锁顺序

```text
（已完成）增量迁移 ...0002 并核验
  -> 部署 send-message-push / send-ping-push（诊断采集）
  -> 部署 admin-api（必须在 ...0002 之后）
  -> 部署 admin 静态站并绑定 admin.515171.xyz / CORS
  -> 获得授权，用现有用户 UUID 执行 admin-bootstrap
  -> 管理员登录并绑定 TOTP
  -> 按第 9.6 节完成真实浏览器验收
  -> 获得授权后启用诊断保留清理调度
```

完成以上步骤后，才能说“后台已经上线并可用”。在此之前，准确状态是：

> 代码与数据库修复已完成并通过 A–D 层验证；生产部署、首位 owner 初始化与 E 层真实联调仍未完成，因此生产后台仍被阻塞。
