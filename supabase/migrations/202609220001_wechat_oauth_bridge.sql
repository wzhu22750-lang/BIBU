-- 微信快捷登录：Supabase Custom OAuth（custom:wechat）的 OAuth compatibility bridge
-- 所需的服务端状态存储。
--
-- Bridge 的三个端点（supabase/functions/wechat-oauth）使用本表串起完整授权链路：
--   1. /authorize   —— 记录 GoTrue 发起的授权请求（PKCE challenge + 回跳地址 + state）
--   2. /callback    —— 微信授权完成回跳后，写入微信身份并签发一次性授权码
--   3. /token       —— GoTrue 用授权码 + code_verifier 换一次性 userinfo Bearer token
--   4. /userinfo    —— GoTrue 用 Bearer token 换标准 claims（sub/name/picture，无 email）
--
-- 表位于 private schema：不经过 PostgREST 暴露，也没有任何 RLS policy，
-- 只有 Edge Function 内的 service_role 凭据可以读写。
create schema if not exists private;

create table private.wechat_oauth_flows (
  id uuid primary key default gen_random_uuid(),
  -- 我们发给微信授权页的 state（随机 32 字节 hex），用于防 CSRF 与流程匹配
  state text not null unique,
  -- GoTrue 发起授权时带来的 PKCE 参数与回跳信息
  code_challenge text not null,
  code_challenge_method text not null default 'S256',
  redirect_uri text not null,
  original_state text not null,
  -- 微信授权完成后写入的标准身份（sub/name/picture），由 /callback 写入
  wechat_payload jsonb,
  -- 发给 GoTrue /auth/v1/callback 的一次性授权码（10 分钟有效，只能换一次 token）
  auth_code text unique,
  auth_code_expires_at timestamptz,
  -- GoTrue 换到的一次性 userinfo Bearer token（10 分钟有效）
  access_token text unique,
  access_token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);

create index wechat_oauth_flows_auth_code
  on private.wechat_oauth_flows (auth_code)
  where auth_code is not null;
create index wechat_oauth_flows_access_token
  on private.wechat_oauth_flows (access_token)
  where access_token is not null;
create index wechat_oauth_flows_created_at
  on private.wechat_oauth_flows (created_at);
