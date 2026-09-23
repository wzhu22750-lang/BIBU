# 微信快捷登录（Web）与身份绑定指南

BIBU 的微信快捷登录与身份绑定由 **BIBU 自身的服务端独立管理**，**不再依赖 Supabase Custom OAuth Provider**。
系统通过服务端直接对接微信开放平台授权与换码接口，在数据库层维护微信身份（`unionid` / `openid`）与 `bibu_user_id` 的唯一映射，并为客户端签发合法的 Supabase Session，实现：

- **邮箱与微信登录完全打通**：主动绑定后，两种登录方式进入同一个 `bibu_user_id`、加载同一个双人小宇宙。
- **无需 Supabase Custom OAuth**：摆脱 GoTrue OAuth Provider 限制，不依赖企业版/付费 Provider 配置。
- **数据安全与权限无缝集成**：前端获取的是合法的标准 Supabase 会话，RLS（`auth.uid()`）、Storage 鉴权、Realtime 订阅和账号注销均原生生效。

---

## 一、架构与数据流

### 1. 微信快捷登录数据流（Login Flow）

```
[ 用户点击「微信快捷登录」]
         │
         ▼
[ Web 客户端 ] ── POST /api/wechat/authorize (action: 'login') ──▶ [ BIBU wechat-auth 服务 ]
                                                                        │ 生成 state，写入 wechat_auth_flows
                                                                        ▼
[ 微信开放平台授权页 ] ◀────── 302 重定向 (或返回 qrconnect / oauth2 URL) ────────┘
   (扫码 / 微信内授权)
         │
         │ 用户确认授权，携带 code + state
         ▼
[ BIBU 服务端 /api/wechat/callback ]
         │ 1. 数据库原子消费 state (防重放、防 CSRF)
         │ 2. 服务端向微信换取 access_token, openid, unionid (微信 secret 绝不泄露)
         │ 3. 原子身份识别 (resolve_or_bind_wechat_identity):
         │    - 若已绑定: 命中已有 bibu_user_id (老用户)
         │    - 若未绑定: 服务端安全建档 auth.users + profiles，写入映射 (新用户)
         │ 4. 签发一次性 ticket (有效期 5 分钟)，写入 wechat_login_tickets
         ▼
[ 302 重定向回到前端 ] ──▶ https://www.515171.xyz/#auth?wechat_ticket=xxx
                                     │
                                     ▼
                      [ Web 前端 exchangeWechatTicket ]
                                     │ POST /api/wechat/exchange-ticket
                                     ▼
                            [ BIBU wechat-auth ]
                                     │ 原子消费 ticket (防重放、排他锁)
                                     │ 为 user_id 签发合法 Supabase Session
                                     ▼
                      [ supabase.auth.setSession ]
                                     │
                                     ▼
                      [ onAuthStateChange 触发 SIGNED_IN ]
                      [ session.user.id 驱动应用，进入小宇宙 ]
```

### 2. 账号安全绑定微信数据流（Bind Flow）

```
[ 已有邮箱用户在「设置 → 账号安全」点击「绑定微信」]
         │
         ▼
[ Web 客户端 ] ── POST /api/wechat/authorize (action: 'bind', Bearer token) ──▶ [ BIBU wechat-auth ]
                                                                                   │ 验证当前用户身份
                                                                                   ▼
[ 微信开放平台授权页 ] ◀────── 302 重定向 (携带 state) ──────────────────────────────┘
         │
         │ 授权回调 (code + state)
         ▼
[ BIBU 服务端 /api/wechat/callback ]
         │ 1. 换取微信身份 (openid, unionid)
         │ 2. 调用 resolve_or_bind_wechat_identity('bind', current_user_id, ...)
         │    - 若该微信已被他人绑定: 拒绝绑定，报 23505 冲突，保护原账号不受影响
         │    - 若未被绑定: 原子写入映射 wechat_identities
         ▼
[ 302 重定向回到设置页 ] ──▶ https://www.515171.xyz/#settings?wechat_bind=success
                                      │
                                      ▼
                        提示「微信绑定成功！后续可用微信快捷登录」
```

---

## 二、身份识别与映射机制

1. **统一不可变的 `bibu_user_id`**：
   - 系统的用户主键始终为 UUID（即 `auth.users.id` 与 `profiles.id`）。
   - 已有邮箱用户在绑定微信时，直接将微信身份挂在该用户的原有 UUID 上，绝对不创建第二个 BIBU 账号，原双人空间（`couple_id`）、聊天、相册、纪念日归属分毫不变。
2. **`unionid` 优先与平滑升级规则**：
   - 微信同一个开放平台主体下的多应用（网站应用、公众号、移动应用）共享 `unionid`；
   - 身份匹配优先以 `unionid` 为准；在未返回 `unionid` 时以 `(app_id, openid)` 为准；
   - 首次未返回 `unionid`、后续升级返回 `unionid` 时，系统自动平滑补全该记录的 `unionid`，保证同一微信在不同阶段、不同入口绝不裂变为两个账号。
3. **安全防冲突与防自动合并**：
   - 绝不通过昵称、头像或第三方邮箱字符串自动合并账号；
   - 绑定必须由用户在已登录状态下主动触发；
   - 若某微信已被账号 A 绑定，账号 B 尝试绑定时会被数据库排他锁与冲突检测直接拒绝，且账号 A 的绑定完好无损。
4. **解绑与注销安全**：
   - **解绑**：纯微信注册且未设置密码的用户禁止解绑，避免失去唯一登录途径；已设置自主密码或绑定真实邮箱的用户允许解绑。
   - **注销**：用户注销账号时，`wechat_identities` 表通过外键 `on delete cascade` 级联删除，同时在注销 RPC 中显式清理微信映射与票据。

---

## 三、微信开放平台配置要求

如需开启生产环境真实微信扫码授权，需在微信开放平台完成以下配置：

1. **开发者资质认证**：
   登录 [微信开放平台](https://open.weixin.qq.com/)，确保开发者主体已完成认证。
2. **创建网站应用**：
   - 进入 **管理中心 → 网站应用 → 创建网站应用**；
   - 填写应用名称「BIBU！」、官网地址与授权回调域：
     - **授权回调域**：填写 `www.515171.xyz`（必须为已备案域名，不可带协议或端口）；
   - 审核通过后获得：
     - `AppID`（配置到环境变量 `WECHAT_APP_ID`）
     - `AppSecret`（配置到环境变量 `WECHAT_APP_SECRET`，**严禁提交至 Git 或前端代码**）。
3. **微信内网页授权（可选公众号）**：
   若希望支持用户在微信内浏览器无需扫码直接一键授权：
   - 在同一个微信开放平台账号下绑定一个已认证的服务号/公众号；
   - 将公众号的 AppID 配置到环境变量 `WECHAT_MP_APP_ID`。

---

## 四、服务端环境变量与部署

微信登录服务部署在 Supabase Edge Function `wechat-auth`，经 Vercel rewrite 统一由生产域名 `www.515171.xyz/api/wechat/*` 提供服务。

### 1. 设置 Edge Function Secrets

在终端执行（或在 Supabase 控制台 **Project Settings → Edge Functions → Secrets** 页面添加）：

```bash
supabase secrets set \
  WECHAT_APP_ID=wx_网站应用AppID \
  WECHAT_APP_SECRET=微信网站应用AppSecret \
  # 可选：微信内授权支持
  WECHAT_MP_APP_ID=wx_公众号AppID
```

> **注意**：不再需要配置 `WECHAT_OAUTH_CLIENT_ID` 或 `WECHAT_OAUTH_CLIENT_SECRET`，也不需要在 Supabase 控制台创建任何 Custom OAuth Provider。

### 2. 数据库迁移与生效核验

迁移文件已落盘在 `supabase/migrations/202609230001_wechat_auth_independent.sql`，并通过 Management API 部署至生产库。
包含以下核心数据表与 RPC：

- `public.wechat_identities`：微信身份与 `bibu_user_id` 映射表（含行级锁、唯一索引与 RLS）
- `public.wechat_auth_flows`：授权会话流表（防 CSRF `state`、回跳白名单、过期时间）
- `public.wechat_login_tickets`：一次性登录兑换票据表（防重放、防并发）
- `resolve_or_bind_wechat_identity(...)`：原子身份判定、建档与绑定 RPC
- `consume_wechat_auth_flow(...)` / `consume_wechat_login_ticket(...)`：原子排他锁消费 RPC
- `get_wechat_binding_status()` / `unbind_wechat_identity()`：绑定状态与解绑 RPC

---

## 五、Web 与 APK 平台适配规范

- **Web 网页版**：
  - 登录页提供「微信快捷登录」按钮；
  - 设置页「账号安全」提供「绑定微信」与「解除微信绑定」操作；
  - 授权流程通过标准浏览器 302 重定向闭环完成。
- **APK 原生 App 版**：
  - 由于原生环境当前未集成微信官方 OpenSDK 原生拉起，且网页回跳可能被 WebView 拦截，遵循「入口与实际回跳能力一致」原则：
  - 原生 App 内登录页保持原有邮箱 + 验证码/密码登录；
  - 原生 App 内设置页展示当前微信绑定状态（若已在网页端绑定，正常显示「微信快捷登录 已绑定」）；
  - 若在原生 App 内未绑定微信，不展示点击后无法完成的绑定按钮，而是清晰指引「微信绑定请在网页版 (www.515171.xyz) 完成，绑定后全平台通用」。

---

## 六、全链路测试与验证

项目提供完整的自动化测试套件与端到端真实数据库核验：

### 1. 本地单元测试

覆盖参数解析、清理、客户端 SDK 请求流程与各类错误翻译：

```bash
npm test
```

### 2. 端到端集成与安全边界核验

直接针对真实数据库环境执行 10 大核心场景全链路测试：

```bash
npm run test:wechat:e2e
```

**测试覆盖矩阵**：

1. 首次微信登录：新微信用户服务端安全建档，自动生成 profiles 记录，签发合法 Session。
2. 重复微信登录：幂等识别，返回完全一致的 `bibu_user_id`，不重复建档。
3. 邮箱账号注册并创建专属双人小宇宙。
4. **同一用户邮箱与微信登录同空间核验**：
   - 邮箱登录得到的 `bibu_user_id` 与微信登录换取的 `bibu_user_id` 100% 一致；
   - 微信登录换取的 Supabase 会话访问到的双人空间 `couple_id` 与邮箱空间完全一致。
5. 微信绑定冲突防御：已绑定微信尝试绑定他人账号，立即被安全拦截并报友好错误，原账号完好无损。
6. 微信身份标识平滑升级：首次无 unionid，后续补全 unionid，同一微信绝不变成两个账号。
7. 解绑逻辑与唯一登录方式保护：无密码账号禁止解绑，拥有邮箱密码后允许解绑。
8. 授权流程 state 与票据 ticket 防重放与过期拦截。
9. 高并发消费原子性测试：10 个并发竞争同一 ticket，排他锁保证仅且仅有 1 次成功。
10. 账号注销测试：注销账号后，微信身份映射记录被自动级联清理。
