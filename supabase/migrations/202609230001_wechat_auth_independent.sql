-- 微信登录体系自建改造：独立于 Supabase Custom OAuth Provider。
-- 由 BIBU 服务端直接管理微信授权、回调、换码、身份映射与一次性登录凭据。
-- 邮箱与微信共用同一个 bibu_user_id（auth.users.id），已有空间归属保持不变。

begin;

-- 1. 清理旧版未使用的 OAuth bridge 状态表（若存在）
drop table if exists private.wechat_oauth_flows cascade;

-- 2. 微信身份映射表：记录微信身份 (unionid / openid) 与 bibu_user_id 的映射
create table if not exists public.wechat_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  unionid text,
  openid text not null,
  app_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wechat_identities_user_id_key unique (user_id),
  constraint wechat_identities_app_openid_key unique (app_id, openid)
);

create unique index if not exists wechat_identities_unionid_idx
  on public.wechat_identities (unionid)
  where unionid is not null;

create index if not exists wechat_identities_user_id_idx
  on public.wechat_identities (user_id);

create index if not exists wechat_identities_app_openid_idx
  on public.wechat_identities (app_id, openid);

alter table public.wechat_identities enable row level security;
revoke all on public.wechat_identities from anon, authenticated;
grant select on public.wechat_identities to authenticated;

drop policy if exists wechat_identities_read_own on public.wechat_identities;
create policy wechat_identities_read_own on public.wechat_identities
  for select to authenticated using (user_id = (select auth.uid()));

-- 3. 微信授权流程表：防 CSRF、回跳白名单校验与授权码换码防重放
create table if not exists public.wechat_auth_flows (
  id uuid primary key default gen_random_uuid(),
  state text not null unique,
  action text not null check (action in ('login', 'bind')),
  user_id uuid references auth.users(id) on delete cascade,
  redirect_to text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists wechat_auth_flows_state_idx
  on public.wechat_auth_flows (state);

alter table public.wechat_auth_flows enable row level security;
revoke all on public.wechat_auth_flows from anon, authenticated;

-- 4. 微信一次性登录凭据表：换取 Supabase Session 用
create table if not exists public.wechat_login_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists wechat_login_tickets_ticket_idx
  on public.wechat_login_tickets (ticket);

alter table public.wechat_login_tickets enable row level security;
revoke all on public.wechat_login_tickets from anon, authenticated;

-- 5. 流程状态消费函数：原子行级排他锁，杜绝重放与并发
create or replace function public.consume_wechat_auth_flow(p_state text)
returns table (
  id uuid,
  action text,
  user_id uuid,
  redirect_to text
) language plpgsql security definer set search_path = '' as $$
declare
  v_flow record;
begin
  select f.id, f.action, f.user_id, f.redirect_to
    into v_flow
    from public.wechat_auth_flows f
   where f.state = p_state
     and f.consumed_at is null
     and f.expires_at > now()
     for update;

  if not found then
    return;
  end if;

  update public.wechat_auth_flows
     set consumed_at = now()
   where public.wechat_auth_flows.id = v_flow.id;

  return query select v_flow.id, v_flow.action, v_flow.user_id, v_flow.redirect_to;
end;
$$;

-- 6. 票据消费函数：原子行级排他锁换取 user_id
create or replace function public.consume_wechat_login_ticket(p_ticket text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid;
begin
  select t.user_id
    into v_user_id
    from public.wechat_login_tickets t
   where t.ticket = p_ticket
     and t.consumed_at is null
     and t.expires_at > now()
     for update;

  if not found then
    return null;
  end if;

  update public.wechat_login_tickets
     set consumed_at = now()
   where public.wechat_login_tickets.ticket = p_ticket;

  return v_user_id;
end;
$$;

-- 7. 微信身份判定、自动补全与原子绑定函数
create or replace function public.resolve_or_bind_wechat_identity(
  p_action text,
  p_bind_user_id uuid,
  p_app_id text,
  p_openid text,
  p_unionid text default null,
  p_new_user_id uuid default null
) returns table (
  resolved_user_id uuid,
  is_new_user boolean,
  status text
) language plpgsql security definer set search_path = '' as $$
declare
  v_row public.wechat_identities%rowtype;
  v_conflict public.wechat_identities%rowtype;
  v_matched boolean := false;
begin
  if p_action not in ('login', 'bind') then
    raise exception '无效的 action 类型' using errcode = '22000';
  end if;
  if p_app_id is null or btrim(p_app_id) = '' or p_openid is null or btrim(p_openid) = '' then
    raise exception '缺少微信 app_id 或 openid' using errcode = '22000';
  end if;

  -- 尝试通过 unionid（优先）查找现有绑定记录
  if p_unionid is not null and btrim(p_unionid) <> '' then
    select * into v_row
      from public.wechat_identities
     where unionid = p_unionid
       for update;
    if found then
      v_matched := true;
    end if;
  end if;

  -- 若未通过 unionid 命中，尝试通过 (app_id, openid) 查找
  if not v_matched then
    select * into v_row
      from public.wechat_identities
     where app_id = p_app_id and openid = p_openid
       for update;
    if found then
      v_matched := true;
    end if;
  end if;

  -- 分支 1：存在已有微信映射
  if v_matched then
    if p_action = 'bind' then
      if v_row.user_id = p_bind_user_id then
        -- 本人已绑定过该微信；若此前无 unionid 而本次带了 unionid，补齐 unionid
        if v_row.unionid is null and p_unionid is not null and btrim(p_unionid) <> '' then
          update public.wechat_identities
             set unionid = p_unionid, updated_at = now()
           where id = v_row.id;
        end if;
        return query select p_bind_user_id, false, 'already_bound_self';
      else
        -- 冲突：该微信已被其他账号绑定，严禁覆盖或篡改原账号
        raise exception '这个微信已经绑定了另一个 BIBU 账号，请先登录原账号处理绑定。' using errcode = '23505';
      end if;
    else
      -- 微信登录：命中已有账号
      -- 首次未返回 unionid，后又返回 unionid 时的平滑升级规则：
      if v_row.unionid is null and p_unionid is not null and btrim(p_unionid) <> '' then
        -- 确保没有其他账号占用了此 unionid
        select * into v_conflict
          from public.wechat_identities
         where unionid = p_unionid and id <> v_row.id;
        if not found then
          update public.wechat_identities
             set unionid = p_unionid, updated_at = now()
           where id = v_row.id;
        end if;
      end if;
      return query select v_row.user_id, false, 'existing_user';
    end if;
  end if;

  -- 分支 2：不存在已有微信映射
  if p_action = 'bind' then
    if p_bind_user_id is null then
      raise exception '绑定操作必须指定当前用户' using errcode = '42501';
    end if;
    if not exists (select 1 from auth.users where id = p_bind_user_id) then
      raise exception '绑定用户不存在' using errcode = '23503';
    end if;
    -- 检查当前用户是否已绑定了其他微信
    if exists (select 1 from public.wechat_identities where user_id = p_bind_user_id) then
      raise exception '当前账号已绑定过微信，请先解绑原微信后再绑定新微信' using errcode = '23505';
    end if;

    insert into public.wechat_identities (user_id, unionid, openid, app_id)
    values (
      p_bind_user_id,
      nullif(btrim(p_unionid), ''),
      p_openid,
      p_app_id
    );
    return query select p_bind_user_id, false, 'bound_new';
  else
    -- 首次微信登录，建档关联
    if p_new_user_id is null then
      -- 未指定新用户 ID 时直接返回空结果集
      return;
    end if;
    if not exists (select 1 from auth.users where id = p_new_user_id) then
      raise exception '新用户尚未在系统建档' using errcode = '23503';
    end if;

    insert into public.wechat_identities (user_id, unionid, openid, app_id)
    values (
      p_new_user_id,
      nullif(btrim(p_unionid), ''),
      p_openid,
      p_app_id
    );
    return query select p_new_user_id, true, 'created_new';
  end if;
end;
$$;

-- 8. 微信解绑函数
create or replace function public.unbind_wechat_identity(p_user_id uuid default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_has_password boolean := false;
  v_email text;
  v_is_placeholder_email boolean := false;
begin
  if v_uid is null then
    raise exception '请先登录' using errcode = '42501';
  end if;

  if auth.uid() is not null and auth.uid() <> v_uid then
    raise exception '无权操作其他用户账号' using errcode = '42501';
  end if;

  if not exists (select 1 from public.wechat_identities where user_id = v_uid) then
    raise exception '当前账号未绑定微信' using errcode = 'P0002';
  end if;

  select (encrypted_password is not null and length(encrypted_password) > 0),
         email
    into v_has_password, v_email
    from auth.users
   where id = v_uid;

  v_is_placeholder_email := (v_email like 'wx_%@auth.bibu.space' or v_email like 'wx_%@login.bibu.space');

  if v_is_placeholder_email or v_email is null or v_email = '' then
    raise exception '当前账号尚未绑定有效邮箱，解绑微信将导致无法登录；请先在账号安全中设置密码或绑定邮箱' using errcode = '23514';
  end if;

  if not v_has_password then
    raise exception '当前账号尚未设置登录密码，无法解绑微信' using errcode = '23514';
  end if;

  delete from public.wechat_identities where user_id = v_uid;
  return true;
end;
$$;

-- 9. 获取当前用户微信绑定状态函数
create or replace function public.get_wechat_binding_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_row public.wechat_identities%rowtype;
  v_has_password boolean := false;
  v_email text;
  v_is_placeholder_email boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('bound', false, 'has_email_auth', false, 'can_unbind', false);
  end if;

  select (encrypted_password is not null and length(encrypted_password) > 0), email
    into v_has_password, v_email
    from auth.users
   where id = v_uid;

  v_is_placeholder_email := (v_email like 'wx_%@auth.bibu.space' or v_email like 'wx_%@login.bibu.space');

  select *
    into v_row
    from public.wechat_identities
   where user_id = v_uid;

  if not found then
    return jsonb_build_object(
      'bound', false,
      'has_email_auth', (not v_is_placeholder_email and v_email is not null and v_email <> ''),
      'can_unbind', false
    );
  end if;

  return jsonb_build_object(
    'bound', true,
    'bound_at', v_row.created_at,
    'has_unionid', (v_row.unionid is not null),
    'openid_masked', case
      when length(v_row.openid) > 6 then '***' || substring(v_row.openid from length(v_row.openid) - 3)
      else '***'
    end,
    'has_email_auth', (not v_is_placeholder_email and v_email is not null and v_email <> ''),
    'can_unbind', (not v_is_placeholder_email and v_email is not null and v_email <> '' and v_has_password)
  );
end;
$$;

-- 10. 增强现有账号注销准备逻辑：级联清理微信绑定与会话状态
create or replace function public.prepare_account_deletion(p_expected_space uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); cid uuid; job_id uuid; job_space uuid; paths jsonb;
begin
  if uid is null then raise exception '请先登录' using errcode='42501'; end if;
  perform 1 from public.profiles where id=uid for update;
  -- A retry after Storage/admin failure must reuse the same captured paths.
  select id, expected_space into job_id, job_space from public.account_deletion_jobs where user_id=uid and status='prepared' for update;
  if job_id is not null then
    if p_expected_space is not null and p_expected_space is distinct from job_space then raise exception '空间已变化，请刷新后确认' using errcode='42501'; end if;
    return job_id;
  end if;
  select couple_id into cid from public.couple_members where user_id=uid;
  if p_expected_space is not null and cid is distinct from p_expected_space then
    raise exception '空间已变化，请刷新后确认' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(path), '[]'::jsonb) into paths from public.photos where uploaded_by=uid;
  insert into public.account_deletion_jobs(user_id,expected_space,storage_paths)
    values(uid,cid,paths) returning id into job_id;
  if cid is not null then
    perform 1 from public.couples where id=cid for update;
    delete from public.focus_sessions where user_id=uid;
    delete from public.couple_members where user_id=uid;
    if not exists(select 1 from public.couple_members where couple_id=cid) then
      update public.couples set closed_at=coalesce(closed_at,now()) where id=cid;
      delete from public.invitations where couple_id=cid;
    end if;
  end if;
  update public.messages set sender_id=null where sender_id=uid;
  update public.events set created_by=null where created_by=uid;
  update public.photos set uploaded_by=null where uploaded_by=uid;
  update public.pings set sender_id=null where sender_id=uid;

  -- 立即解除微信绑定与相关的临时流程/票据
  delete from public.wechat_identities where user_id = uid;
  delete from public.wechat_login_tickets where user_id = uid;
  delete from public.wechat_auth_flows where user_id = uid;

  return job_id;
end;
$$;

-- 11. 权限授予与保护
revoke all on function public.consume_wechat_auth_flow(text) from public, anon, authenticated;
revoke all on function public.consume_wechat_login_ticket(text) from public, anon, authenticated;
revoke all on function public.resolve_or_bind_wechat_identity(text, uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.unbind_wechat_identity(uuid) from public, anon;
revoke all on function public.get_wechat_binding_status() from public, anon;

grant execute on function public.unbind_wechat_identity(uuid) to authenticated;
grant execute on function public.get_wechat_binding_status() to authenticated;

commit;

notify pgrst, 'reload schema';
