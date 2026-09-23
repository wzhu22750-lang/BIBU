# 微信快捷登录（Web）部署与配置指南

BIBU 的微信快捷登录基于 **Supabase Custom OAuth Provider**（`custom:wechat`）+
一个 **OAuth compatibility bridge** Edge Function 实现。微信官方 OAuth 接口与标准 OAuth2
有差异（token 端点为 GET、响应带 `openid`/`unionid`、userinfo 必须携带 `openid`、不返回
`sub`/`email`），bridge 负责把微信包装成 Supabase Custom OAuth 要求的标准接口。

```
BIBU Web ── signInWithOAuth ──▶ Supabase Auth (GoTrue)
                                     │ 标准授权码 + PKCE 请求
                                     ▼
                          Edge Function /wechat-oauth/authorize
                                     │ 302（appid + state）
                                     ▼
                              微信授权页（扫码 / 微信内）
                                     │ code + state
                                     ▼
                          Edge Function /wechat-oauth/callback
                          （换微信 token、取 unionid/openid、签发一次性授权码）
                                     │ code + state
                                     ▼
                            Supabase /auth/v1/callback
                                     │ POST /wechat-oauth/token（+ PKCE verifier）
                                     │ GET  /wechat-oauth/userinfo（Bearer）
                                     ▼
                               BIBU Web（session 建立）
```

## 身份识别规则（安全要求）

- **优先使用 `unionid`** 作为稳定身份标识（`sub = wxu_<unionid>`）；
  当前应用场景拿不到 `unionid` 时退回 `openid`（`sub = wxo_<openid>`）。
- `nickname`、微信头像只作为展示资料（写入 user metadata），**绝不**参与身份判定或账号匹配。
- 绝不通过昵称/头像/邮箱字符串自动合并账号。只有用户在「设置 → 账号安全」里主动点击
  **绑定微信**（Supabase Identity Linking）才会把微信 identity 挂到当前账号。
- 微信 `access_token` / `refresh_token` 只在 bridge 服务端短暂使用，绝不下发前端、
  绝不写入 localStorage；前端登录态完全由 Supabase Auth session 管理。

## 一、微信开放平台配置（需要你手动完成）

1. 登录 [微信开放平台](https://open.weixin.qq.com/)，账号需完成开发者资质认证。
2. **管理中心 → 网站应用 → 创建网站应用**，填写 BIBU 的站点信息。审核通过后获得：
   - `AppID`（对应 Secret `WECHAT_APP_ID`）
   - `AppSecret`（对应 Secret `WECHAT_APP_SECRET`，**只配到 Supabase Edge Function
     Secrets，绝不提交到 Git、绝不放进前端**）
3. 在该网站应用的 **授权回调域** 中填写 bridge 对外的域名：
   - 生产环境推荐：`www.515171.xyz`（bridge 经 Vercel rewrite 代理到 Edge Function，
     域名需 ICP 备案，`*.supabase.co` 无法作为授权回调域）。
   - 若回调域填了其它域名，需要保证该域名能访问 `/wechat-oauth/authorize|callback`。
4. （可选）若希望用户**在微信内浏览器**直接授权（不扫码），再绑定一个**公众号**到
   **同一个开放平台账号**下（同一开放平台主体下的应用共享 `unionid`），把它的 AppID
   配置为 Secret `WECHAT_MP_APP_ID`。
5. 微信官方接口以 [网站应用微信登录开发指南](https://developers.weixin.qq.com/doc/offiaccount/OA_Web_Apps/Wechat_webpage_authorization.html)
   为准：本实现使用 `open.weixin.qq.com/connect/qrconnect`（PC 扫码，`snsapi_login`）
   与可选的 `connect/oauth2/authorize`（微信内，`snsapi_userinfo`）、
   `api.weixin.qq.com/sns/oauth2/access_token`、`api.weixin.qq.com/sns/userinfo`。

## 二、Supabase Edge Function 配置

### 1. 数据库迁移

执行 `supabase/migrations/202609220001_wechat_oauth_bridge.sql`（创建
`private.wechat_oauth_flows` 表；该 schema 不经 PostgREST 暴露，仅 service_role 可读写）。

### 2. 部署函数

```bash
supabase functions deploy wechat-oauth   # 部署后自动按 supabase/config.toml 关闭 verify_jwt
```

`supabase/config.toml` 已配置 `[functions.wechat-oauth] verify_jwt = false`
（GoTrue 调用 `/token`、`/userinfo` 时不带用户 JWT；浏览器跳 `/authorize` 时用户也未登录）。

### 3. 设置 Edge Function Secrets

```bash
supabase secrets set \
  WECHAT_APP_ID=wxxxxxxxxxxxxxxxxx \
  WECHAT_APP_SECRET=微信网站应用AppSecret \
  WECHAT_OAUTH_CLIENT_ID=bibu-wechat-bridge \
  WECHAT_OAUTH_CLIENT_SECRET=自定义一段强随机字符串 \
  # 可选：WECHAT_MP_APP_ID=公众号AppID
```

| Secret | 说明 |
| --- | --- |
| `WECHAT_APP_ID` | 微信开放平台「网站应用」AppID |
| `WECHAT_APP_SECRET` | 微信网站应用 AppSecret（**绝不能进前端/Git**） |
| `WECHAT_OAUTH_CLIENT_ID` | bridge 校验的 OAuth client ID，与 Supabase Custom OAuth 表单里填的一致 |
| `WECHAT_OAUTH_CLIENT_SECRET` | bridge 校验的 OAuth client secret，同上（建议强随机） |
| `WECHAT_MP_APP_ID` | 可选；公众号 AppID，微信内浏览器授权用 |

## 三、Supabase Custom OAuth Provider 配置

Dashboard → **Authentication → Sign In / Up → Custom OAuth Providers → New Provider →
Manual configuration**：

| 表单项 | 填写内容 |
| --- | --- |
| Identifier | `custom:wechat` |
| Client ID | 与 `WECHAT_OAUTH_CLIENT_ID` 一致 |
| Client Secret | 与 `WECHAT_OAUTH_CLIENT_SECRET` 一致 |
| Authorization URL | `https://www.515171.xyz/wechat-oauth/authorize` |
| Token URL | `https://www.515171.xyz/wechat-oauth/token` |
| UserInfo URL | `https://www.515171.xyz/wechat-oauth/userinfo` |
| Scopes | `snsapi_login`（bridge 不依赖该参数，会自动选择正确的微信 scope） |

**必须同时把 provider 设为 email 可选**（微信用户没有 email，否则登录会失败）。
Dashboard 表单若无此项，用服务端调用一次 Admin API（需 `service_role` key，勿在前端执行）：

```js
import { createClient } from '@supabase/supabase-js'
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
await admin.auth.admin.customProviders.updateProvider('custom:wechat', { email_optional: true })
```

### Auth → URL Configuration（Redirect URLs）

加入以下地址（Site URL 保持现有正式域名 `https://www.515171.xyz/` 不变）：

- `https://www.515171.xyz/**`（生产 + Vercel 预览域按需收紧）
- `http://localhost:5173/**`（本地开发）
- `http://127.0.0.1:5173/**`
- `love.bibu.space://`（现有 Android 深链接，保持不动）

> bridge 的 `/authorize` 会校验 GoTrue 传来的 `redirect_uri` 必须是
> `https://<project-ref>.supabase.co/auth/v1/callback`，不接受其它回调地址。

## 四、验证：邮箱和微信确实是同一个 BIBU User

1. 用邮箱登录账号 A。
2. 设置 → 账号安全 → 登录方式：显示「邮箱登录 已绑定 / 微信快捷登录 未绑定」→ 点 **绑定微信**
   → 微信授权 → 回跳后显示「微信快捷登录 已绑定」。
3. 退出登录 → 点登录页 **微信快捷登录** → 授权 → 应直接进入账号 A 的同一个 Space
   （聊天 / 相册 / 纪念日与邮箱登录时完全一致）。
4. Supabase Dashboard → Authentication → Users：账号 A 下应只有一个 User，其
   **Identities** 同时包含 `email` 与 `custom:wechat` 两条 identity。
5. 反向验证：换一个全新微信扫码登录 → 会创建新的 BIBU User 并进入 onboarding；
   再次微信登录 → 回到同一个账号。
6. 冲突验证：用已绑定到账号 B 的微信，在账号 A 里点「绑定微信」→ 回跳后应提示
   「这个微信已经绑定了另一个 BIBU 账号，请先登录原账号处理绑定。」，账号 B 不受影响。

## 五、本地开发测试

微信授权回调域必须是备案域名，无法直接指向 `localhost`，因此本地完整链路有两种方式：

1. **借助生产 bridge**：本地 `npm run dev`，登录页点「微信快捷登录」。由于 Supabase
   Custom OAuth 的 Authorization URL 指向正式域名，微信回跳后最终会 302 回
   GoTrue，再回到 `redirectTo`（即发起时的 origin）。若希望回到 localhost，可在
   Dashboard 把 Authorization URL 指向 `http://localhost:5173/wechat-oauth/authorize`
   并用 `vercel dev` 或内网穿透让微信回调域对应的域名代理到本地。
2. **仅验证前端**：不配置 provider 时点微信登录会得到「微信登录暂未开放，请先使用邮箱
   登录」，可据此确认错误处理正常。

## 六、错误场景覆盖

前端统一由 `src/lib/wechatAuth.ts` 翻译：取消授权、state 失效、授权码过期/重放、
微信接口超时/错误、provider 未配置、identity 已绑定其它账号、session 创建失败等，
均展示为普通用户可理解的文案，不暴露 secret、access_token 或内部堆栈。
