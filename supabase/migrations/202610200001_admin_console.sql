-- BIBU 运营与维护控制台：管理员身份、工单、审计、推送诊断。
-- 所有管理表默认对 anon/authenticated 完全撤权；管理 RPC 仅授予 service_role。
-- 用户工单 RPC 仅授予 authenticated，并始终以 auth.uid() 判定归属。
begin;

-- ---------------------------------------------------------------------------
-- 1. 管理员成员与角色
-- ---------------------------------------------------------------------------
create table public.admin_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'operator', 'support', 'maintainer')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  display_name text not null default '' check (char_length(display_name) <= 60),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz
);
create index admin_members_role_status on public.admin_members(role, status);

create table public.admin_user_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  body text not null check (char_length(btrim(body)) between 2 and 2000),
  created_at timestamptz not null default now()
);
create index admin_user_notes_user_time on public.admin_user_notes(user_id, created_at desc);

create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text not null,
  actor_label text not null,
  action text not null,
  target_type text not null,
  target_id text,
  reason text not null default '',
  success boolean not null,
  error_code text,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_logs_time on public.admin_audit_logs(created_at desc);
create index admin_audit_logs_actor_time on public.admin_audit_logs(actor_id, created_at desc);
create index admin_audit_logs_target on public.admin_audit_logs(target_type, target_id);

create function public.admin_audit_immutable() returns trigger
language plpgsql set search_path = '' as $fn$
begin
  raise exception '审计日志不可修改或删除' using errcode = '42501';
end;
$fn$;
create trigger admin_audit_no_update before update on public.admin_audit_logs
  for each row execute function public.admin_audit_immutable();
create trigger admin_audit_no_delete before delete on public.admin_audit_logs
  for each row execute function public.admin_audit_immutable();

create table public.admin_idempotency_keys (
  key uuid primary key,
  actor_id uuid not null references auth.users(id) on delete cascade,
  route text not null,
  request_hash text not null,
  response jsonb,
  status_code integer,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);
create index admin_idempotency_expiry on public.admin_idempotency_keys(expires_at);

create function public.admin_capabilities(p_role text) returns text[]
language sql immutable set search_path = '' as $fn$
  select case p_role
    when 'owner' then array[
      'overview.read', 'users.read', 'users.search_email', 'users.notes.write',
      'couples.read', 'tickets.read', 'tickets.write', 'diagnostics.read',
      'system.read', 'audit.read', 'admins.manage'
    ]::text[]
    when 'operator' then array[
      'overview.read', 'users.read', 'users.search_email', 'users.notes.write',
      'couples.read', 'tickets.read', 'tickets.write', 'diagnostics.read',
      'system.read', 'audit.read'
    ]::text[]
    when 'support' then array[
      'overview.read', 'users.read', 'users.notes.write',
      'couples.read', 'tickets.read', 'tickets.write'
    ]::text[]
    when 'maintainer' then array[
      'overview.read', 'diagnostics.read', 'system.read'
    ]::text[]
    else array[]::text[]
  end;
$fn$;

create function public.admin_actor(p_user_id uuid, p_session_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_admin public.admin_members;
  v_alive boolean := false;
begin
  if p_user_id is null then
    return jsonb_build_object('found', false);
  end if;
  select * into v_admin from public.admin_members where user_id = p_user_id;
  if v_admin.user_id is null then
    return jsonb_build_object('found', false);
  end if;
  if p_session_id is not null then
    select exists(
      select 1 from auth.sessions s
      where s.id = p_session_id
        and s.user_id = p_user_id
        and (s.not_after is null or s.not_after > now())
    ) into v_alive;
  end if;
  return jsonb_build_object(
    'found', true,
    'user_id', v_admin.user_id,
    'role', v_admin.role,
    'status', v_admin.status,
    'display_name', v_admin.display_name,
    'session_alive', v_alive,
    'capabilities', public.admin_capabilities(v_admin.role)
  );
end;
$fn$;

create function public.admin_assert_capability(p_actor uuid, p_capability text) returns text
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_role text;
begin
  select role into v_role
  from public.admin_members
  where user_id = p_actor and status = 'active';
  if v_role is null then
    raise exception '没有可用的管理员身份' using errcode = '42501';
  end if;
  if not (p_capability = any(public.admin_capabilities(v_role))) then
    raise exception '当前角色无权执行此操作' using errcode = '42501';
  end if;
  return v_role;
end;
$fn$;

create function public.admin_bootstrap_status() returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select jsonb_build_object(
    'initialized', exists(select 1 from public.admin_members),
    'active_admins', (select count(*) from public.admin_members where status = 'active')
  );
$fn$;

create function public.admin_bootstrap_owner(p_user_id uuid, p_display_name text default '') returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_email text;
  v_confirmed timestamptz;
  v_name text;
begin
  if exists(select 1 from public.admin_members) then
    raise exception '后台已初始化，不能重复授予首位 owner' using errcode = '23505';
  end if;
  select email, email_confirmed_at into v_email, v_confirmed from auth.users where id = p_user_id;
  if not found then
    raise exception '指定用户不存在' using errcode = '22023';
  end if;
  if v_email is not null and v_confirmed is null then
    raise exception '指定用户邮箱尚未验证' using errcode = '22023';
  end if;
  v_name := left(btrim(coalesce(p_display_name, '')), 60);
  insert into public.admin_members(user_id, role, status, display_name)
  values (p_user_id, 'owner', 'active', v_name);
  insert into public.admin_audit_logs(
    request_id, actor_id, actor_role, actor_label, action, target_type, target_id,
    reason, success, summary
  ) values (
    'bootstrap-' || gen_random_uuid()::text, null, 'system', 'trusted-bootstrap',
    'admin.bootstrap', 'admin_member', p_user_id::text,
    '首个 owner 由可信服务端脚本初始化', true,
    jsonb_build_object('role', 'owner')
  );
  return jsonb_build_object('user_id', p_user_id, 'role', 'owner', 'status', 'active');
end;
$fn$;

create function public.admin_record_system_action(
  p_action text, p_target_type text, p_target_id text, p_reason text,
  p_summary jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $fn$
declare
  v_id uuid;
begin
  insert into public.admin_audit_logs(
    request_id, actor_id, actor_role, actor_label, action, target_type, target_id,
    reason, success, summary
  ) values (
    'system-' || gen_random_uuid()::text, null, 'system', 'trusted-script',
    left(p_action, 80), left(p_target_type, 40), left(p_target_id, 120),
    left(coalesce(p_reason, ''), 500), true, coalesce(p_summary, '{}'::jsonb)
  ) returning id into v_id;
  return v_id;
end;
$fn$;

-- 失败审计：调用方已通过身份/能力校验，但业务执行失败时单独记录。
create function public.admin_record_failure(
  p_request_id text, p_actor uuid, p_action text, p_target_type text,
  p_target_id text, p_reason text, p_error_code text
) returns uuid
language plpgsql security definer set search_path = '' as $fn$
declare
  v_id uuid;
begin
  v_id := public.admin_audit_insert(
    p_request_id, p_actor, p_action, p_target_type, p_target_id,
    p_reason, false, p_error_code, jsonb_build_object('recorded_by', 'admin-api')
  );
  return v_id;
end;
$fn$;

-- 内部审计写入：由其他 security definer 管理函数在同一事务内调用。
create function public.admin_audit_insert(
  p_request_id text, p_actor uuid, p_action text, p_target_type text, p_target_id text,
  p_reason text, p_success boolean, p_error_code text, p_summary jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $fn$
declare
  v_role text := 'system';
  v_label text := 'system';
  v_display text;
  v_email text;
  v_id uuid;
begin
  if p_actor is not null then
    select a.role, a.display_name into v_role, v_display
    from public.admin_members a where a.user_id = p_actor;
    select email into v_email from auth.users where id = p_actor;
    v_label := coalesce(
      nullif(v_display, ''),
      case when v_email is null then p_actor::text
        else left(v_email, 1) || '***@' || split_part(v_email, '@', 2) end
    );
  end if;
  insert into public.admin_audit_logs(
    request_id, actor_id, actor_role, actor_label, action, target_type, target_id,
    reason, success, error_code, summary
  ) values (
    left(p_request_id, 120), p_actor, v_role, v_label, left(p_action, 80),
    left(p_target_type, 40), left(p_target_id, 120), left(coalesce(p_reason, ''), 500),
    p_success, left(p_error_code, 80), coalesce(p_summary, '{}'::jsonb)
  ) returning id into v_id;
  return v_id;
end;
$fn$;

-- 幂等占位：返回 true 表示首次请求，false 表示可重放已存响应。
create function public.admin_idempotency_begin(
  p_key uuid, p_actor uuid, p_route text, p_request_hash text
) returns boolean
language plpgsql security definer set search_path = '' as $fn$
declare
  v_rows integer;
  v_row public.admin_idempotency_keys;
begin
  insert into public.admin_idempotency_keys(key, actor_id, route, request_hash)
  values (p_key, p_actor, p_route, p_request_hash)
  on conflict (key) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 1 then
    return true;
  end if;
  select * into v_row from public.admin_idempotency_keys where key = p_key for update;
  if v_row.key is null then
    raise exception '幂等记录读取失败' using errcode = '40001';
  end if;
  if v_row.actor_id is distinct from p_actor or v_row.route is distinct from p_route
     or v_row.request_hash is distinct from p_request_hash then
    raise exception '幂等键与原请求不匹配' using errcode = '23505';
  end if;
  if v_row.response is null then
    raise exception '相同请求正在处理，请稍后重试' using errcode = '40001';
  end if;
  return false;
end;
$fn$;

create function public.admin_idempotency_read(p_key uuid) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select response from public.admin_idempotency_keys where key = p_key;
$fn$;

create function public.admin_idempotency_store(p_key uuid, p_response jsonb, p_status integer default 200)
returns void language sql security definer set search_path = '' as $fn$
  update public.admin_idempotency_keys
  set response = p_response, status_code = p_status
  where key = p_key;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. 客服工单
-- ---------------------------------------------------------------------------
create sequence public.support_ticket_seq;

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_no text not null unique default (
    'BIBU-' || to_char(now() at time zone 'Asia/Shanghai', 'YYYYMMDD') || '-' ||
    lpad(nextval('public.support_ticket_seq')::text, 5, '0')
  ),
  user_id uuid not null references auth.users(id) on delete cascade,
  couple_id uuid references public.couples(id) on delete set null,
  category text not null check (category in ('bug', 'account', 'notification', 'data', 'privacy', 'other')),
  description text not null check (char_length(btrim(description)) between 10 and 2000),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'waiting_user', 'resolved')),
  client_app_version text not null default 'unknown' check (char_length(client_app_version) <= 40),
  client_platform text not null default 'unknown' check (char_length(client_platform) <= 20),
  assigned_admin_id uuid references public.admin_members(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index support_tickets_user_time on public.support_tickets(user_id, created_at desc);
create index support_tickets_status_time on public.support_tickets(status, updated_at desc);
create index support_tickets_couple_time on public.support_tickets(couple_id, created_at desc);

create table public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_type text not null check (author_type in ('user', 'admin', 'system')),
  author_id uuid references auth.users(id) on delete set null,
  visibility text not null default 'user' check (visibility in ('user', 'internal')),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index support_ticket_messages_ticket_time on public.support_ticket_messages(ticket_id, created_at);

create function public.my_support_tickets() returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc), '[]'::jsonb)
  from (
    select
      t.id, t.ticket_no, t.category, t.status, t.created_at, t.updated_at, t.resolved_at,
      left(t.description, 80) as excerpt,
      (select count(*) from public.support_ticket_messages m
        where m.ticket_id = t.id and m.visibility = 'user') as reply_count
    from public.support_tickets t
    where t.user_id = (select auth.uid())
    order by t.updated_at desc
    limit 50
  ) x;
$fn$;

create function public.my_support_ticket(p_ticket_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select jsonb_build_object(
    'id', t.id, 'ticket_no', t.ticket_no, 'category', t.category,
    'description', t.description, 'status', t.status,
    'created_at', t.created_at, 'updated_at', t.updated_at, 'resolved_at', t.resolved_at,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'author_type', m.author_type, 'body', m.body, 'created_at', m.created_at
      ) order by m.created_at)
      from public.support_ticket_messages m
      where m.ticket_id = t.id and m.visibility = 'user'
    ), '[]'::jsonb)
  )
  from public.support_tickets t
  where t.id = p_ticket_id and t.user_id = (select auth.uid());
$fn$;

create function public.create_support_ticket(
  p_category text, p_description text,
  p_app_version text default 'unknown', p_platform text default 'unknown'
) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_recent integer;
  v_version text;
  v_platform text;
  v_row public.support_tickets;
begin
  if v_uid is null then
    raise exception '请先登录' using errcode = '42501';
  end if;
  if p_category is null or p_category not in ('bug', 'account', 'notification', 'data', 'privacy', 'other') then
    raise exception '反馈分类无效' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_description, ''))) not between 10 and 2000 then
    raise exception '反馈内容需为 10–2000 字' using errcode = '22023';
  end if;
  v_version := left(btrim(coalesce(p_app_version, 'unknown')), 40);
  if v_version !~ '^[A-Za-z0-9._-]{1,40}$' then v_version := 'unknown'; end if;
  v_platform := case when p_platform in ('web', 'android', 'ios') then p_platform else 'unknown' end;
  select count(*) into v_recent
  from public.support_tickets
  where user_id = v_uid and created_at > now() - interval '1 hour';
  if v_recent >= 5 then
    raise exception '提交太频繁，请稍后再试' using errcode = '22023';
  end if;
  insert into public.support_tickets(user_id, couple_id, category, description, client_app_version, client_platform)
  values (v_uid, public.my_couple_id(), p_category, btrim(p_description), v_version, v_platform)
  returning * into v_row;
  return public.my_support_ticket(v_row.id);
end;
$fn$;

create function public.reply_my_support_ticket(p_ticket_id uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_row public.support_tickets;
  v_recent integer;
begin
  if v_uid is null then
    raise exception '请先登录' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 2000 then
    raise exception '回复内容需为 1–2000 字' using errcode = '22023';
  end if;
  select * into v_row from public.support_tickets
  where id = p_ticket_id and user_id = v_uid for update;
  if v_row.id is null then
    raise exception '工单不存在' using errcode = '42501';
  end if;
  if v_row.status = 'resolved' then
    raise exception '工单已解决，如仍有问题请提交新的反馈' using errcode = '22023';
  end if;
  select count(*) into v_recent
  from public.support_ticket_messages m
  join public.support_tickets t on t.id = m.ticket_id
  where t.user_id = v_uid and m.author_type = 'user' and m.created_at > now() - interval '1 hour';
  if v_recent >= 20 then
    raise exception '回复太频繁，请稍后再试' using errcode = '22023';
  end if;
  insert into public.support_ticket_messages(ticket_id, author_type, author_id, visibility, body)
  values (p_ticket_id, 'user', v_uid, 'user', btrim(p_body));
  update public.support_tickets
  set status = case when status = 'waiting_user' then 'pending' else status end,
      updated_at = now()
  where id = p_ticket_id;
  return public.my_support_ticket(p_ticket_id);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 3. 最小推送诊断（不含正文、完整 token 或供应商响应体）
-- ---------------------------------------------------------------------------
create table public.notification_delivery_logs (
  id bigint generated always as identity primary key,
  request_id uuid not null,
  event_type text not null check (event_type in ('message', 'ping')),
  event_id uuid not null,
  couple_id uuid,
  recipient_user_id uuid,
  channel text not null default 'getui' check (char_length(channel) <= 30),
  device_platform text not null default 'android' check (char_length(device_platform) <= 20),
  token_suffix text check (token_suffix is null or char_length(token_suffix) <= 8),
  stage text not null check (stage in (
    'webhook_received', 'skipped', 'provider_accepted', 'provider_rejected',
    'invalid_token', 'client_received', 'opened'
  )),
  error_code text check (error_code is null or char_length(error_code) <= 80),
  provider_http_status integer,
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 600000),
  created_at timestamptz not null default now()
);
create index notification_delivery_event on public.notification_delivery_logs(event_type, event_id);
create index notification_delivery_time on public.notification_delivery_logs(created_at desc);
create index notification_delivery_stage_time on public.notification_delivery_logs(stage, created_at desc);

-- Edge Function 只通过该函数写入诊断，避免直接暴露表；写入只保留末尾掩码。
create function public.record_notification_delivery(
  p_request_id uuid, p_event_type text, p_event_id uuid, p_couple_id uuid,
  p_recipient_user_id uuid, p_channel text, p_device_platform text,
  p_token_suffix text, p_stage text, p_error_code text,
  p_provider_http_status integer, p_duration_ms integer
) returns void
language plpgsql security definer set search_path = '' as $fn$
begin
  insert into public.notification_delivery_logs(
    request_id, event_type, event_id, couple_id, recipient_user_id,
    channel, device_platform, token_suffix, stage, error_code,
    provider_http_status, duration_ms
  ) values (
    p_request_id, p_event_type, p_event_id, p_couple_id, p_recipient_user_id,
    left(coalesce(p_channel, 'getui'), 30), left(coalesce(p_device_platform, 'unknown'), 20),
    case when p_token_suffix is null then null
      else right(p_token_suffix, 8) end,
    p_stage, left(p_error_code, 80), p_provider_http_status, p_duration_ms
  );
end;
$fn$;

create function public.admin_touch_actor(p_actor uuid) returns void
language sql security definer set search_path = '' as $fn$
  update public.admin_members set last_seen_at = now()
  where user_id = p_actor and status = 'active';
$fn$;

create function public.prune_admin_diagnostics(p_retention_days integer default 30) returns integer
language plpgsql security definer set search_path = '' as $fn$
declare
  v_deleted integer;
  v_old integer;
begin
  if p_retention_days is null or p_retention_days < 7 or p_retention_days > 365 then
    raise exception '保留天数需为 7–365' using errcode = '22023';
  end if;
  delete from public.notification_delivery_logs
  where created_at < now() - make_interval(days => p_retention_days);
  get diagnostics v_deleted = row_count;
  delete from public.admin_idempotency_keys where expires_at < now();
  get diagnostics v_old = row_count;
  return v_deleted;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 4. 指标口径与只读管理查询
-- ---------------------------------------------------------------------------
-- 统一口径：
-- * 日期窗口按 Asia/Shanghai 自然日，[from, to+1)；
-- * “双向互动空间”要求当前恰好 2 名成员，且两人各至少产生一次
--   message / ping / daily_task_completion / photo 服务端写入；
-- * 双人任务完成率只统计当前 2 名成员的空间，要求两人各有完成记录。
create function public.admin_range_metrics(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_start timestamptz;
  v_end timestamptz;
begin
  v_start := (p_from::timestamp at time zone 'Asia/Shanghai');
  v_end := ((p_to + 1)::timestamp at time zone 'Asia/Shanghai');
  return (
    with two_member_spaces as (
      select couple_id from public.couple_members group by couple_id having count(*) = 2
    ),
    current_members as (
      select couple_id, user_id from public.couple_members
    ),
    actions as (
      select m.couple_id, m.sender_id as user_id
      from public.messages m
      join current_members cm on cm.couple_id = m.couple_id and cm.user_id = m.sender_id
      where m.created_at >= v_start and m.created_at < v_end and m.sender_id is not null
      union all
      select p.couple_id, p.sender_id
      from public.pings p
      join current_members cm on cm.couple_id = p.couple_id and cm.user_id = p.sender_id
      where p.created_at >= v_start and p.created_at < v_end and p.sender_id is not null
      union all
      select c.couple_id, c.user_id
      from public.daily_task_completions c
      join current_members cm on cm.couple_id = c.couple_id and cm.user_id = c.user_id
      where c.completed_at >= v_start and c.completed_at < v_end
      union all
      select ph.couple_id, ph.uploaded_by
      from public.photos ph
      join current_members cm on cm.couple_id = ph.couple_id and cm.user_id = ph.uploaded_by
      where ph.created_at >= v_start and ph.created_at < v_end and ph.uploaded_by is not null
    ),
    mutual as (
      select couple_id from actions group by couple_id having count(distinct user_id) >= 2
    ),
    task_scoped as (
      select t.id, t.couple_id
      from public.daily_tasks t
      join two_member_spaces s on s.couple_id = t.couple_id
      where t.task_date between p_from and p_to
    ),
    task_done as (
      select t.id from task_scoped t
      where (
        select count(distinct c.user_id)
        from public.daily_task_completions c
        join current_members cm on cm.couple_id = t.couple_id and cm.user_id = c.user_id
        where c.task_id = t.id
      ) >= 2
    )
    select jsonb_build_object(
      'new_users', (select count(*) from auth.users u where u.created_at >= v_start and u.created_at < v_end),
      'new_couples', (select count(*) from public.couples c where c.created_at >= v_start and c.created_at < v_end),
      'mutual_spaces', (select count(*) from mutual),
      'task_denominator', (select count(*) from task_scoped),
      'task_numerator', (select count(*) from task_done)
    )
  );
end;
$fn$;

create function public.admin_overview(p_actor uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_role text;
  v_days integer;
  v_prev_from date;
  v_prev_to date;
  v_start timestamptz;
  v_end timestamptz;
  v_current jsonb;
  v_previous jsonb;
  v_series jsonb;
  v_rate numeric;
  v_prev_rate numeric;
begin
  v_role := public.admin_assert_capability(p_actor, 'overview.read');
  if p_from is null or p_to is null or p_to < p_from then
    raise exception '日期范围无效' using errcode = '22023';
  end if;
  v_days := (p_to - p_from) + 1;
  if v_days > 92 then
    raise exception '日期范围不能超过 92 天' using errcode = '22023';
  end if;
  v_prev_from := p_from - v_days;
  v_prev_to := p_from - 1;
  v_start := (p_from::timestamp at time zone 'Asia/Shanghai');
  v_end := ((p_to + 1)::timestamp at time zone 'Asia/Shanghai');
  v_current := public.admin_range_metrics(p_from, p_to);
  v_previous := public.admin_range_metrics(v_prev_from, v_prev_to);
  v_rate := case when (v_current->>'task_denominator')::int = 0 then null
    else round((v_current->>'task_numerator')::numeric * 100 / (v_current->>'task_denominator')::numeric, 1) end;
  v_prev_rate := case when (v_previous->>'task_denominator')::int = 0 then null
    else round((v_previous->>'task_numerator')::numeric * 100 / (v_previous->>'task_denominator')::numeric, 1) end;

  with days as (
    select generate_series(p_from, p_to, interval '1 day')::date as d
  ),
  two_member_spaces as (
    select couple_id from public.couple_members group by couple_id having count(*) = 2
  ),
  current_members as (
    select couple_id, user_id from public.couple_members
  ),
  actions as (
    select m.couple_id, m.sender_id as user_id,
      (m.created_at at time zone 'Asia/Shanghai')::date as d
    from public.messages m
    join current_members cm on cm.couple_id = m.couple_id and cm.user_id = m.sender_id
    where m.created_at >= v_start and m.created_at < v_end and m.sender_id is not null
    union all
    select p.couple_id, p.sender_id, (p.created_at at time zone 'Asia/Shanghai')::date
    from public.pings p
    join current_members cm on cm.couple_id = p.couple_id and cm.user_id = p.sender_id
    where p.created_at >= v_start and p.created_at < v_end and p.sender_id is not null
    union all
    select c.couple_id, c.user_id, (c.completed_at at time zone 'Asia/Shanghai')::date
    from public.daily_task_completions c
    join current_members cm on cm.couple_id = c.couple_id and cm.user_id = c.user_id
    where c.completed_at >= v_start and c.completed_at < v_end
    union all
    select ph.couple_id, ph.uploaded_by, (ph.created_at at time zone 'Asia/Shanghai')::date
    from public.photos ph
    join current_members cm on cm.couple_id = ph.couple_id and cm.user_id = ph.uploaded_by
    where ph.created_at >= v_start and ph.created_at < v_end and ph.uploaded_by is not null
  ),
  daily_mutual as (
    select d, count(*)::int as n from (
      select d, couple_id from actions where user_id is not null
      group by d, couple_id having count(distinct user_id) >= 2
    ) x group by d
  ),
  daily_tasks as (
    select t.task_date as d, t.id, t.couple_id
    from public.daily_tasks t
    join two_member_spaces s on s.couple_id = t.couple_id
    where t.task_date between p_from and p_to
  ),
  daily_task_done as (
    select t.d, count(*)::int as n
    from daily_tasks t
    where (
      select count(distinct c.user_id)
      from public.daily_task_completions c
      join current_members cm on cm.couple_id = t.couple_id and cm.user_id = c.user_id
      where c.task_id = t.id
    ) >= 2
    group by t.d
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', days.d,
    'new_users', (select count(*) from auth.users u
      where u.created_at >= v_start and u.created_at < v_end
        and (u.created_at at time zone 'Asia/Shanghai')::date = days.d),
    'new_couples', (select count(*) from public.couples c
      where c.created_at >= v_start and c.created_at < v_end
        and (c.created_at at time zone 'Asia/Shanghai')::date = days.d),
    'mutual_spaces', coalesce((select n from daily_mutual dm where dm.d = days.d), 0),
    'task_denominator', (select count(*) from daily_tasks t where t.d = days.d),
    'task_numerator', coalesce((select n from daily_task_done td where td.d = days.d), 0)
  ) order by days.d), '[]'::jsonb)
  into v_series
  from days;

  return jsonb_build_object(
    'timezone', 'Asia/Shanghai',
    'from', p_from,
    'to', p_to,
    'data_updated_at', now(),
    'current', v_current || jsonb_build_object(
      'task_rate', v_rate,
      'task_rate_denominator', (v_current->>'task_denominator')::int,
      'task_rate_numerator', (v_current->>'task_numerator')::int
    ),
    'previous', v_previous || jsonb_build_object(
      'task_rate', v_prev_rate,
      'from', v_prev_from,
      'to', v_prev_to
    ),
    'series', v_series,
    'small_sample', (v_current->>'task_denominator')::int > 0
      and (v_current->>'task_denominator')::int < 5,
    'alerts', jsonb_build_object(
      'ticket_pending', (select count(*) from public.support_tickets where status = 'pending'),
      'ticket_in_progress', (select count(*) from public.support_tickets where status = 'in_progress'),
      'ticket_waiting_user', (select count(*) from public.support_tickets where status = 'waiting_user'),
      'push_failures_24h', (
        select count(distinct (event_type || ':' || event_id))
        from public.notification_delivery_logs
        where stage in ('provider_rejected', 'invalid_token')
          and created_at > now() - interval '24 hours'
      ),
      'deletion_jobs', (select count(*) from public.account_deletion_jobs where status = 'prepared')
    ),
    'recent_tickets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'ticket_no', t.ticket_no, 'category', t.category,
        'status', t.status, 'created_at', t.created_at,
        'excerpt', left(t.description, 60)
      ) order by t.updated_at desc)
      from (
        select * from public.support_tickets
        where status <> 'resolved'
        order by updated_at desc limit 5
      ) t
    ), '[]'::jsonb),
    'recent_failures', case
      when 'diagnostics.read' = any(public.admin_capabilities(v_role)) then coalesce((
        select jsonb_agg(x order by x.last_at desc)
        from (
          select event_type, event_id, count(*)::int as attempts,
            max(created_at) as last_at,
            (array_agg(error_code order by created_at desc))[1] as error_code
          from public.notification_delivery_logs
          where stage in ('provider_rejected', 'invalid_token')
            and created_at > now() - interval '24 hours'
          group by event_type, event_id
          order by max(created_at) desc
          limit 5
        ) x
      ), '[]'::jsonb)
      else null
    end,
    'unavailable', jsonb_build_array(
      '客户端送达回执（未采集）',
      '用户主动打开回执（未采集）',
      '实时在线人数（未采集）',
      'D7 / D28 留存（当前数据不足以还原历史群组）'
    )
  );
end;
$fn$;

create function public.admin_list_users(
  p_actor uuid, p_query text default '', p_search text default 'name',
  p_page integer default 1, p_page_size integer default 20,
  p_sort text default 'created_at_desc', p_filter text default 'all',
  p_created_from date default null, p_created_to date default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_role text;
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_size integer := least(greatest(coalesce(p_page_size, 20), 1), 50);
  v_query text := left(btrim(coalesce(p_query, '')), 100);
  v_search text := coalesce(p_search, 'name');
  v_sort text := coalesce(p_sort, 'created_at_desc');
  v_filter text := coalesce(p_filter, 'all');
  v_created_start timestamptz;
  v_created_end timestamptz;
  v_total bigint;
  v_rows jsonb;
begin
  v_role := public.admin_assert_capability(p_actor, 'users.read');
  if p_created_from is not null and p_created_to is not null
     and (p_created_to < p_created_from or (p_created_to - p_created_from) > 365) then
    raise exception '注册日期范围无效或超过 365 天' using errcode = '22023';
  end if;
  v_created_start := case when p_created_from is null then null
    else (p_created_from::timestamp at time zone 'Asia/Shanghai') end;
  v_created_end := case when p_created_to is null then null
    else ((p_created_to + 1)::timestamp at time zone 'Asia/Shanghai') end;
  if v_search not in ('name', 'id', 'email') then
    raise exception '检索类型无效' using errcode = '22023';
  end if;
  if v_search = 'email' and not ('users.search_email' = any(public.admin_capabilities(v_role))) then
    raise exception '当前角色不能按账号邮箱检索' using errcode = '42501';
  end if;
  if v_sort not in ('created_at_desc', 'created_at_asc', 'name_asc', 'name_desc', 'devices_desc') then
    raise exception '排序方式无效' using errcode = '22023';
  end if;
  if v_filter not in ('all', 'paired', 'unpaired', 'deletion_pending', 'banned') then
    raise exception '筛选条件无效' using errcode = '22023';
  end if;

  with filtered as (
    select
      u.id as user_id,
      coalesce(p.name, '新玩家') as name,
      coalesce(p.avatar, 'cat') as avatar,
      case
        when u.email is null then null
        when u.email like '%@auth.bibu.space' or u.email like '%@login.bibu.space' then '微信账号'
        else left(u.email, 1) || '***@' || split_part(u.email, '@', 2)
      end as email_masked,
      u.created_at,
      u.last_sign_in_at,
      case
        when u.banned_until is not null and u.banned_until > now() then 'banned'
        when exists(select 1 from public.account_deletion_jobs j where j.user_id = u.id and j.status = 'prepared') then 'deletion_pending'
        else 'active'
      end as account_status,
      cm.couple_id,
      c.closed_at as couple_closed_at,
      (select count(*) from public.couple_members x where x.couple_id = cm.couple_id)::int as couple_member_count,
      (select count(*) from public.device_installations d where d.user_id = u.id)::int as device_count,
      (select count(*) from public.support_tickets t where t.user_id = u.id and t.status <> 'resolved')::int as open_ticket_count
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.couple_members cm on cm.user_id = u.id
    left join public.couples c on c.id = cm.couple_id
    where
      (v_query = ''
        or (v_search = 'id' and u.id::text = lower(v_query))
        or (v_search = 'email' and lower(coalesce(u.email, '')) = lower(v_query))
        or (v_search = 'name' and position(lower(v_query) in lower(coalesce(p.name, '新玩家'))) > 0))
      and (v_filter = 'all'
        or (v_filter = 'paired' and cm.couple_id is not null)
        or (v_filter = 'unpaired' and cm.couple_id is null)
        or (v_filter = 'deletion_pending' and exists(
          select 1 from public.account_deletion_jobs j where j.user_id = u.id and j.status = 'prepared'))
        or (v_filter = 'banned' and u.banned_until is not null and u.banned_until > now()))
      and (v_created_start is null or u.created_at >= v_created_start)
      and (v_created_end is null or u.created_at < v_created_end)
  ),
  paged as (
    select *,
      row_number() over (
        order by
          case when v_sort = 'created_at_asc' then created_at end asc nulls last,
          case when v_sort = 'name_asc' then name end asc nulls last,
          case when v_sort = 'name_desc' then name end desc nulls last,
          case when v_sort = 'devices_desc' then device_count end desc nulls last,
          created_at desc, user_id
      ) as row_no
    from filtered
    limit v_size offset (v_page - 1) * v_size
  )
  select
    (select count(*) from filtered),
    coalesce((select jsonb_agg(jsonb_build_object(
      'user_id', user_id, 'name', name, 'avatar', avatar,
      'email_masked', email_masked, 'created_at', created_at,
      'last_sign_in_at', last_sign_in_at, 'account_status', account_status,
      'couple_id', couple_id, 'couple_closed_at', couple_closed_at,
      'couple_member_count', couple_member_count,
      'device_count', device_count, 'open_ticket_count', open_ticket_count
    ) order by row_no) from paged), '[]'::jsonb)
  into v_total, v_rows;

  return jsonb_build_object(
    'total', v_total,
    'page', v_page,
    'page_size', v_size,
    'rows', v_rows
  );
end;
$fn$;

create function public.admin_user_detail(p_actor uuid, p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_result jsonb;
begin
  perform public.admin_assert_capability(p_actor, 'users.read');
  select jsonb_build_object(
    'user_id', u.id,
    'name', coalesce(p.name, '新玩家'),
    'avatar', coalesce(p.avatar, 'cat'),
    'email_masked', case
      when u.email is null then null
      when u.email like '%@auth.bibu.space' or u.email like '%@login.bibu.space' then '微信账号'
      else left(u.email, 1) || '***@' || split_part(u.email, '@', 2)
    end,
    'email_confirmed', u.email_confirmed_at is not null,
    'created_at', u.created_at,
    'last_sign_in_at', u.last_sign_in_at,
    'banned_until', u.banned_until,
    'account_status', case
      when u.banned_until is not null and u.banned_until > now() then 'banned'
      when exists(select 1 from public.account_deletion_jobs j where j.user_id = u.id and j.status = 'prepared') then 'deletion_pending'
      else 'active'
    end,
    'couple', (
      select jsonb_build_object(
        'id', c.id, 'name', c.name, 'created_at', c.created_at, 'closed_at', c.closed_at,
        'members', coalesce((
          select jsonb_agg(jsonb_build_object(
            'user_id', mp.id, 'name', mp.name, 'avatar', mp.avatar,
            'email_masked', case
              when mu.email is null then null
              when mu.email like '%@auth.bibu.space' or mu.email like '%@login.bibu.space' then '微信账号'
              else left(mu.email, 1) || '***@' || split_part(mu.email, '@', 2)
            end,
            'slot', cm2.slot
          ) order by cm2.slot)
          from public.couple_members cm2
          join public.profiles mp on mp.id = cm2.user_id
          join auth.users mu on mu.id = cm2.user_id
          where cm2.couple_id = c.id
        ), '[]'::jsonb)
      )
      from public.couple_members mine
      join public.couples c on c.id = mine.couple_id
      where mine.user_id = u.id
    ),
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'platform', d.platform, 'app_version', d.app_version,
        'token_suffix', right(d.token, 6), 'last_seen_at', d.last_seen_at, 'created_at', d.created_at,
        'last_delivery_stage', (
          select l.stage from public.notification_delivery_logs l
          where l.recipient_user_id = u.id order by l.created_at desc limit 1
        ),
        'last_delivery_at', (
          select l.created_at from public.notification_delivery_logs l
          where l.recipient_user_id = u.id order by l.created_at desc limit 1
        )
      ) order by d.last_seen_at desc)
      from public.device_installations d where d.user_id = u.id
    ), '[]'::jsonb),
    'deletion_job', (
      select jsonb_build_object('status', j.status, 'prepared_at', j.prepared_at)
      from public.account_deletion_jobs j
      where j.user_id = u.id and j.status = 'prepared' limit 1
    ),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id, 'body', n.body, 'created_at', n.created_at,
        'author_label', coalesce(nullif(a.display_name, ''), '管理员')
      ) order by n.created_at desc)
      from public.admin_user_notes n
      left join public.admin_members a on a.user_id = n.author_id
      where n.user_id = u.id
    ), '[]'::jsonb),
    'tickets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'ticket_no', t.ticket_no, 'category', t.category,
        'status', t.status, 'created_at', t.created_at, 'updated_at', t.updated_at
      ) order by t.updated_at desc)
      from (
        select * from public.support_tickets where user_id = u.id
        order by updated_at desc limit 10
      ) t
    ), '[]'::jsonb),
    'diagnostics_30d', jsonb_build_object(
      'attempts', (select count(*) from public.notification_delivery_logs l
        where l.recipient_user_id = u.id and l.created_at > now() - interval '30 days'),
      'failures', (select count(*) from public.notification_delivery_logs l
        where l.recipient_user_id = u.id and l.stage in ('provider_rejected', 'invalid_token')
          and l.created_at > now() - interval '30 days')
    )
  ) into v_result
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = p_user_id;
  return v_result;
end;
$fn$;

create function public.admin_list_couples(
  p_actor uuid, p_from date, p_to date, p_state text default 'all',
  p_pair text default 'all', p_page integer default 1, p_page_size integer default 20,
  p_sort text default 'created_at_desc',
  p_created_from date default null, p_created_to date default null,
  p_mutual boolean default null, p_task text default 'all'
) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_size integer := least(greatest(coalesce(p_page_size, 20), 1), 50);
  v_task text := coalesce(p_task, 'all');
  v_start timestamptz;
  v_end timestamptz;
  v_created_start timestamptz;
  v_created_end timestamptz;
  v_total bigint;
  v_rows jsonb;
begin
  perform public.admin_assert_capability(p_actor, 'couples.read');
  if p_from is null or p_to is null or p_to < p_from or (p_to - p_from) > 92 then
    raise exception '日期范围无效或超过 92 天' using errcode = '22023';
  end if;
  if p_created_from is not null and p_created_to is not null
     and (p_created_to < p_created_from or (p_created_to - p_created_from) > 365) then
    raise exception '创建日期范围无效或超过 365 天' using errcode = '22023';
  end if;
  if coalesce(p_state, 'all') not in ('all', 'active', 'sealed')
     or coalesce(p_pair, 'all') not in ('all', 'complete', 'incomplete')
     or v_task not in ('all', 'double', 'single', 'assigned', 'none')
     or coalesce(p_sort, 'created_at_desc') not in ('created_at_desc', 'created_at_asc', 'name_asc') then
    raise exception '筛选或排序条件无效' using errcode = '22023';
  end if;
  v_start := (p_from::timestamp at time zone 'Asia/Shanghai');
  v_end := ((p_to + 1)::timestamp at time zone 'Asia/Shanghai');
  v_created_start := case when p_created_from is null then null
    else (p_created_from::timestamp at time zone 'Asia/Shanghai') end;
  v_created_end := case when p_created_to is null then null
    else ((p_created_to + 1)::timestamp at time zone 'Asia/Shanghai') end;

  with base as (
    select c.id, c.name, c.together_since, c.created_at, c.closed_at,
      (select count(*) from public.couple_members cm where cm.couple_id = c.id)::int as member_count
    from public.couples c
  ),
  filtered as (
    select b.*,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'user_id', p.id, 'name', p.name, 'avatar', p.avatar, 'slot', cm.slot,
          'email_masked', case
            when u.email is null then null
            when u.email like '%@auth.bibu.space' or u.email like '%@login.bibu.space' then '微信账号'
            else left(u.email, 1) || '***@' || split_part(u.email, '@', 2)
          end
        ) order by cm.slot)
        from public.couple_members cm
        join public.profiles p on p.id = cm.user_id
        join auth.users u on u.id = cm.user_id
        where cm.couple_id = b.id
      ), '[]'::jsonb) as members,
      (select count(*) from public.messages m where m.couple_id = b.id and m.created_at >= v_start and m.created_at < v_end)::int as messages,
      (select count(*) from public.pings p where p.couple_id = b.id and p.created_at >= v_start and p.created_at < v_end)::int as pings,
      (select count(*) from public.photos ph where ph.couple_id = b.id and ph.created_at >= v_start and ph.created_at < v_end)::int as photos_in_range,
      (select count(*) from public.photos ph where ph.couple_id = b.id)::int as photos_total,
      (select count(*) from public.daily_tasks t where t.couple_id = b.id and t.task_date between p_from and p_to)::int as tasks_assigned,
      (select count(*) from public.daily_tasks t
        where t.couple_id = b.id and t.task_date between p_from and p_to
          and (select count(distinct x.user_id) from public.daily_task_completions x
            join public.couple_members cm on cm.couple_id = t.couple_id and cm.user_id = x.user_id
            where x.task_id = t.id) = 1)::int as tasks_single,
      (select count(*) from public.daily_tasks t
        where t.couple_id = b.id and t.task_date between p_from and p_to
          and (select count(distinct x.user_id) from public.daily_task_completions x
            join public.couple_members cm on cm.couple_id = t.couple_id and cm.user_id = x.user_id
            where x.task_id = t.id) >= 2)::int as tasks_double,
      (b.member_count = 2 and (
        select count(distinct a.user_id) >= 2
        from (
          select m.sender_id as user_id from public.messages m
            where m.couple_id = b.id and m.created_at >= v_start and m.created_at < v_end
          union all
          select p.sender_id from public.pings p
            where p.couple_id = b.id and p.created_at >= v_start and p.created_at < v_end
          union all
          select c.user_id from public.daily_task_completions c
            where c.couple_id = b.id and c.completed_at >= v_start and c.completed_at < v_end
          union all
          select ph.uploaded_by from public.photos ph
            where ph.couple_id = b.id and ph.created_at >= v_start and ph.created_at < v_end
        ) a
        where a.user_id is not null
          and exists(select 1 from public.couple_members cmx
            where cmx.couple_id = b.id and cmx.user_id = a.user_id)
      )) as mutual,
      (select count(*) from public.support_tickets t where t.couple_id = b.id and t.status <> 'resolved')::int as tickets_open,
      greatest(
        coalesce((select max(m.created_at) from public.messages m where m.couple_id = b.id), b.created_at),
        coalesce((select max(p.created_at) from public.pings p where p.couple_id = b.id), b.created_at),
        coalesce((select max(ph.created_at) from public.photos ph where ph.couple_id = b.id), b.created_at),
        coalesce((select max(t.created_at) from public.daily_tasks t where t.couple_id = b.id), b.created_at)
      ) as last_activity_at
    from base b
    where (coalesce(p_state, 'all') = 'all'
        or (p_state = 'active' and b.closed_at is null)
        or (p_state = 'sealed' and b.closed_at is not null))
      and (coalesce(p_pair, 'all') = 'all'
        or (p_pair = 'complete' and b.member_count = 2)
        or (p_pair = 'incomplete' and b.member_count < 2))
      and (v_created_start is null or b.created_at >= v_created_start)
      and (v_created_end is null or b.created_at < v_created_end)
  ),
  selected as (
    select * from filtered
    where (p_mutual is null or mutual = p_mutual)
      and (v_task = 'all'
        or (v_task = 'double' and tasks_double > 0)
        or (v_task = 'single' and tasks_single > 0)
        or (v_task = 'assigned' and tasks_assigned > 0)
        or (v_task = 'none' and tasks_assigned = 0))
  ),
  paged as (
    select *,
      row_number() over (
        order by
          case when p_sort = 'created_at_asc' then created_at end asc nulls last,
          case when p_sort = 'name_asc' then name end asc nulls last,
          created_at desc, id
      ) as row_no
    from selected
    limit v_size offset (v_page - 1) * v_size
  )
  select
    (select count(*) from selected),
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'together_since', together_since,
      'created_at', created_at, 'closed_at', closed_at,
      'member_count', member_count, 'members', members,
      'messages', messages, 'pings', pings,
      'photos_in_range', photos_in_range, 'photos_total', photos_total,
      'tasks_assigned', tasks_assigned, 'tasks_single', tasks_single,
      'tasks_double', tasks_double, 'mutual', mutual,
      'tickets_open', tickets_open,
      'last_activity_at', last_activity_at
    ) order by row_no) from paged), '[]'::jsonb)
  into v_total, v_rows;

  return jsonb_build_object(
    'total', v_total, 'page', v_page, 'page_size', v_size,
    'from', p_from, 'to', p_to, 'rows', v_rows
  );
end;
$fn$;

create function public.admin_couple_detail(
  p_actor uuid, p_couple_id uuid, p_from date, p_to date
) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_result jsonb;
  v_start timestamptz;
  v_end timestamptz;
begin
  perform public.admin_assert_capability(p_actor, 'couples.read');
  if p_from is null or p_to is null or p_to < p_from or (p_to - p_from) > 92 then
    raise exception '日期范围无效或超过 92 天' using errcode = '22023';
  end if;
  v_start := (p_from::timestamp at time zone 'Asia/Shanghai');
  v_end := ((p_to + 1)::timestamp at time zone 'Asia/Shanghai');
  select jsonb_build_object(
    'id', c.id, 'name', c.name, 'created_at', c.created_at, 'closed_at', c.closed_at,
    'together_since', c.together_since,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', p.id, 'name', p.name, 'avatar', p.avatar, 'slot', cm.slot,
        'email_masked', case
          when u.email is null then null
          when u.email like '%@auth.bibu.space' or u.email like '%@login.bibu.space' then '微信账号'
          else left(u.email, 1) || '***@' || split_part(u.email, '@', 2)
        end,
        'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at
      ) order by cm.slot)
      from public.couple_members cm
      join public.profiles p on p.id = cm.user_id
      join auth.users u on u.id = cm.user_id
      where cm.couple_id = c.id
    ), '[]'::jsonb),
    'stats', jsonb_build_object(
      'messages', (select count(*) from public.messages m where m.couple_id = c.id and m.created_at >= v_start and m.created_at < v_end),
      'pings', (select count(*) from public.pings p where p.couple_id = c.id and p.created_at >= v_start and p.created_at < v_end),
      'photos_in_range', (select count(*) from public.photos ph where ph.couple_id = c.id and ph.created_at >= v_start and ph.created_at < v_end),
      'photos_total', (select count(*) from public.photos ph where ph.couple_id = c.id),
      'tasks_assigned', (select count(*) from public.daily_tasks t where t.couple_id = c.id and t.task_date between p_from and p_to),
      'tasks_single', (select count(*) from public.daily_tasks t
        where t.couple_id = c.id and t.task_date between p_from and p_to
          and (select count(*) from public.daily_task_completions x where x.task_id = t.id) = 1),
      'tasks_double', (select count(*) from public.daily_tasks t
        where t.couple_id = c.id and t.task_date between p_from and p_to
          and (select count(distinct x.user_id) from public.daily_task_completions x where x.task_id = t.id) >= 2),
      'tickets_open', (select count(*) from public.support_tickets t where t.couple_id = c.id and t.status <> 'resolved'),
      'push_failures_30d', (select count(*) from public.notification_delivery_logs l
        where l.couple_id = c.id and l.stage in ('provider_rejected', 'invalid_token')
          and l.created_at > now() - interval '30 days')
    ),
    'last_activity', jsonb_build_object(
      'message_at', (select max(m.created_at) from public.messages m where m.couple_id = c.id),
      'ping_at', (select max(p.created_at) from public.pings p where p.couple_id = c.id),
      'photo_at', (select max(ph.created_at) from public.photos ph where ph.couple_id = c.id),
      'task_at', (select max(t.created_at) from public.daily_tasks t where t.couple_id = c.id)
    ),
    'tickets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'ticket_no', t.ticket_no, 'category', t.category,
        'status', t.status, 'created_at', t.created_at, 'updated_at', t.updated_at
      ) order by t.updated_at desc)
      from (
        select * from public.support_tickets where couple_id = c.id
        order by updated_at desc limit 10
      ) t
    ), '[]'::jsonb)
  ) into v_result
  from public.couples c where c.id = p_couple_id;
  return v_result;
end;
$fn$;

create function public.admin_add_user_note(
  p_idempotency_key uuid, p_actor uuid, p_user_id uuid, p_body text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_first boolean;
  v_note public.admin_user_notes;
  v_result jsonb;
begin
  perform public.admin_assert_capability(p_actor, 'users.notes.write');
  if char_length(btrim(coalesce(p_body, ''))) not between 2 and 2000 then
    raise exception '备注需为 2–2000 字' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 2 and 300 then
    raise exception '请填写 2–300 字的操作理由' using errcode = '22023';
  end if;
  if not exists(select 1 from auth.users where id = p_user_id) then
    raise exception '用户不存在' using errcode = '22023';
  end if;
  if p_idempotency_key is null then
    raise exception '缺少幂等键' using errcode = '22023';
  end if;
  v_first := public.admin_idempotency_begin(
    p_idempotency_key, p_actor, 'user.note', md5(btrim(p_body) || '|' || btrim(p_reason) || '|' || p_user_id::text)
  );
  if not v_first then
    return public.admin_idempotency_read(p_idempotency_key);
  end if;
  insert into public.admin_user_notes(user_id, author_id, body)
  values (p_user_id, p_actor, btrim(p_body))
  returning * into v_note;
  perform public.admin_audit_insert(
    'req-' || p_idempotency_key::text, p_actor, 'user.note.create', 'user', p_user_id::text,
    btrim(p_reason), true, null,
    jsonb_build_object('note_id', v_note.id, 'body_length', char_length(v_note.body))
  );
  v_result := jsonb_build_object(
    'note', jsonb_build_object('id', v_note.id, 'body', v_note.body, 'created_at', v_note.created_at)
  );
  perform public.admin_idempotency_store(p_idempotency_key, v_result, 201);
  return v_result;
end;
$fn$;

create function public.admin_list_tickets(
  p_actor uuid, p_status text default 'open', p_category text default 'all',
  p_query text default '', p_page integer default 1, p_page_size integer default 20,
  p_sort text default 'updated_desc'
) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_size integer := least(greatest(coalesce(p_page_size, 20), 1), 50);
  v_status text := coalesce(p_status, 'open');
  v_category text := coalesce(p_category, 'all');
  v_sort text := coalesce(p_sort, 'updated_desc');
  v_query text := left(btrim(coalesce(p_query, '')), 100);
  v_total bigint;
  v_rows jsonb;
begin
  perform public.admin_assert_capability(p_actor, 'tickets.read');
  if v_status not in ('open', 'all', 'pending', 'in_progress', 'waiting_user', 'resolved')
     or v_category not in ('all', 'bug', 'account', 'notification', 'data', 'privacy', 'other')
     or v_sort not in ('updated_desc', 'created_desc') then
    raise exception '筛选或排序条件无效' using errcode = '22023';
  end if;

  with filtered as (
    select
      t.id, t.ticket_no, t.user_id,
      coalesce(p.name, '已注销用户') as user_name,
      case
        when u.email is null then null
        when u.email like '%@auth.bibu.space' or u.email like '%@login.bibu.space' then '微信账号'
        else left(u.email, 1) || '***@' || split_part(u.email, '@', 2)
      end as email_masked,
      t.category, t.status, t.created_at, t.updated_at, t.resolved_at,
      t.assigned_admin_id, a.display_name as assignee_name,
      left(t.description, 100) as excerpt
    from public.support_tickets t
    left join public.profiles p on p.id = t.user_id
    left join auth.users u on u.id = t.user_id
    left join public.admin_members a on a.user_id = t.assigned_admin_id
    where (v_status = 'all'
        or (v_status = 'open' and t.status <> 'resolved')
        or t.status = v_status)
      and (v_category = 'all' or t.category = v_category)
      and (v_query = ''
        or position(lower(v_query) in lower(t.ticket_no)) > 0
        or position(lower(v_query) in lower(t.description)) > 0
        or t.user_id::text = lower(v_query))
  ),
  paged as (
    select *,
      row_number() over (
        order by
          case when v_sort = 'created_desc' then created_at end desc nulls last,
          updated_at desc, id
      ) as row_no
    from filtered
    limit v_size offset (v_page - 1) * v_size
  )
  select
    (select count(*) from filtered),
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'ticket_no', ticket_no, 'user_id', user_id,
      'user_name', user_name, 'email_masked', email_masked,
      'category', category, 'status', status,
      'created_at', created_at, 'updated_at', updated_at, 'resolved_at', resolved_at,
      'assigned_admin_id', assigned_admin_id, 'assignee_name', assignee_name,
      'excerpt', excerpt
    ) order by row_no) from paged), '[]'::jsonb)
  into v_total, v_rows;

  return jsonb_build_object(
    'total', v_total, 'page', v_page, 'page_size', v_size, 'rows', v_rows
  );
end;
$fn$;

create function public.admin_ticket_detail(p_actor uuid, p_ticket_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_result jsonb;
begin
  perform public.admin_assert_capability(p_actor, 'tickets.read');
  select jsonb_build_object(
    'id', t.id, 'ticket_no', t.ticket_no, 'user_id', t.user_id,
    'user_name', coalesce(p.name, '已注销用户'),
    'email_masked', case
      when u.email is null then null
      when u.email like '%@auth.bibu.space' or u.email like '%@login.bibu.space' then '微信账号'
      else left(u.email, 1) || '***@' || split_part(u.email, '@', 2)
    end,
    'couple_id', t.couple_id,
    'category', t.category, 'description', t.description, 'status', t.status,
    'client_app_version', t.client_app_version, 'client_platform', t.client_platform,
    'assigned_admin_id', t.assigned_admin_id,
    'assignee_name', (select display_name from public.admin_members where user_id = t.assigned_admin_id),
    'created_at', t.created_at, 'updated_at', t.updated_at, 'resolved_at', t.resolved_at,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'author_type', m.author_type, 'author_id', m.author_id,
        'author_label', case
          when m.author_type = 'user' then coalesce(p.name, '用户')
          when m.author_type = 'admin' then coalesce(a.display_name, '管理员')
          else '系统'
        end,
        'visibility', m.visibility, 'body', m.body, 'created_at', m.created_at
      ) order by m.created_at)
      from public.support_ticket_messages m
      left join public.admin_members a on a.user_id = m.author_id
      where m.ticket_id = t.id
    ), '[]'::jsonb)
  ) into v_result
  from public.support_tickets t
  left join public.profiles p on p.id = t.user_id
  left join auth.users u on u.id = t.user_id
  where t.id = p_ticket_id;
  return v_result;
end;
$fn$;

create function public.admin_ticket_action(
  p_idempotency_key uuid, p_actor uuid, p_ticket_id uuid, p_action text,
  p_reason text default '', p_body text default null,
  p_status text default null, p_assignee_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_first boolean;
  v_ticket public.support_tickets;
  v_message public.support_ticket_messages;
  v_reason text;
  v_from_status text;
  v_to_status text;
  v_result jsonb;
  v_role text;
begin
  v_role := public.admin_assert_capability(p_actor, 'tickets.write');
  if p_action is null or p_action not in ('reply', 'note', 'status', 'assign') then
    raise exception '工单操作无效' using errcode = '22023';
  end if;
  v_reason := left(btrim(coalesce(p_reason, '')), 300);
  if p_action in ('status', 'assign') and char_length(v_reason) < 2 then
    raise exception '请填写至少 2 个字的操作理由' using errcode = '22023';
  end if;
  if p_action in ('reply', 'note') then
    if char_length(btrim(coalesce(p_body, ''))) not between 1 and 2000 then
      raise exception '内容需为 1–2000 字' using errcode = '22023';
    end if;
    if v_reason = '' then
      v_reason := case when p_action = 'reply' then '回复用户工单' else '记录内部处理备注' end;
    end if;
  end if;
  if p_idempotency_key is null then
    raise exception '缺少幂等键' using errcode = '22023';
  end if;
  v_first := public.admin_idempotency_begin(
    p_idempotency_key, p_actor, 'ticket.action',
    md5(p_action || '|' || coalesce(p_body, '') || '|' || coalesce(p_status, '') || '|' ||
        coalesce(p_assignee_id::text, '') || '|' || v_reason || '|' || p_ticket_id::text)
  );
  if not v_first then
    return public.admin_idempotency_read(p_idempotency_key);
  end if;
  select * into v_ticket from public.support_tickets where id = p_ticket_id for update;
  if v_ticket.id is null then
    raise exception '工单不存在' using errcode = '22023';
  end if;
  v_from_status := v_ticket.status;

  if p_action = 'reply' then
    if v_ticket.status = 'resolved' then
      raise exception '已解决的工单不能直接回复，请先重新打开' using errcode = '22023';
    end if;
    insert into public.support_ticket_messages(ticket_id, author_type, author_id, visibility, body)
    values (p_ticket_id, 'admin', p_actor, 'user', btrim(p_body))
    returning * into v_message;
    v_to_status := case when v_ticket.status in ('pending', 'in_progress') then 'waiting_user' else v_ticket.status end;
    update public.support_tickets
    set status = v_to_status, updated_at = now(),
        assigned_admin_id = coalesce(assigned_admin_id, p_actor)
    where id = p_ticket_id;
    perform public.admin_audit_insert(
      'req-' || p_idempotency_key::text, p_actor, 'ticket.reply', 'ticket', p_ticket_id::text,
      v_reason, true, null,
      jsonb_build_object('message_id', v_message.id, 'from_status', v_from_status,
        'to_status', v_to_status, 'visibility', 'user', 'body_length', char_length(v_message.body))
    );
  elsif p_action = 'note' then
    insert into public.support_ticket_messages(ticket_id, author_type, author_id, visibility, body)
    values (p_ticket_id, 'admin', p_actor, 'internal', btrim(p_body))
    returning * into v_message;
    update public.support_tickets
    set updated_at = now(), assigned_admin_id = coalesce(assigned_admin_id, p_actor)
    where id = p_ticket_id;
    v_to_status := v_from_status;
    perform public.admin_audit_insert(
      'req-' || p_idempotency_key::text, p_actor, 'ticket.note', 'ticket', p_ticket_id::text,
      v_reason, true, null,
      jsonb_build_object('message_id', v_message.id, 'visibility', 'internal',
        'body_length', char_length(v_message.body))
    );
  elsif p_action = 'status' then
    if p_status is null or p_status not in ('pending', 'in_progress', 'waiting_user', 'resolved') then
      raise exception '目标状态无效' using errcode = '22023';
    end if;
    if p_status = v_ticket.status then
      raise exception '工单已处于该状态' using errcode = '22023';
    end if;
    if not (
      (v_ticket.status = 'pending' and p_status in ('in_progress', 'waiting_user', 'resolved'))
      or (v_ticket.status = 'in_progress' and p_status in ('waiting_user', 'resolved'))
      or (v_ticket.status = 'waiting_user' and p_status in ('in_progress', 'resolved'))
      or (v_ticket.status = 'resolved' and p_status = 'in_progress')
    ) then
      raise exception '工单状态不能从 % 变更为 %', v_ticket.status, p_status using errcode = '22023';
    end if;
    update public.support_tickets
    set status = p_status,
        assigned_admin_id = coalesce(assigned_admin_id, p_actor),
        resolved_at = case when p_status = 'resolved' then now() else null end,
        updated_at = now()
    where id = p_ticket_id;
    v_to_status := p_status;
    perform public.admin_audit_insert(
      'req-' || p_idempotency_key::text, p_actor, 'ticket.status', 'ticket', p_ticket_id::text,
      v_reason, true, null,
      jsonb_build_object('from_status', v_from_status, 'to_status', v_to_status)
    );
  else
    if p_assignee_id is null then
      p_assignee_id := p_actor;
    end if;
    if p_assignee_id <> p_actor and v_role not in ('owner', 'operator') then
      raise exception '当前角色只能将工单指派给自己' using errcode = '42501';
    end if;
    if not exists(select 1 from public.admin_members where user_id = p_assignee_id and status = 'active') then
      raise exception '指派人不是有效管理员' using errcode = '22023';
    end if;
    update public.support_tickets
    set assigned_admin_id = p_assignee_id, updated_at = now()
    where id = p_ticket_id;
    v_to_status := v_from_status;
    perform public.admin_audit_insert(
      'req-' || p_idempotency_key::text, p_actor, 'ticket.assign', 'ticket', p_ticket_id::text,
      v_reason, true, null,
      jsonb_build_object('from_assignee', v_ticket.assigned_admin_id, 'to_assignee', p_assignee_id)
    );
  end if;
  v_result := jsonb_build_object(
    'ticket', public.admin_ticket_detail(p_actor, p_ticket_id),
    'message', v_message.id
  );
  perform public.admin_idempotency_store(p_idempotency_key, v_result, 200);
  return v_result;
end;
$fn$;

create function public.admin_list_diagnostics(
  p_actor uuid, p_from date, p_to date, p_event_type text default 'all',
  p_status text default 'all', p_page integer default 1, p_page_size integer default 20
) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_size integer := least(greatest(coalesce(p_page_size, 20), 1), 50);
  v_start timestamptz;
  v_end timestamptz;
  v_total bigint;
  v_rows jsonb;
begin
  perform public.admin_assert_capability(p_actor, 'diagnostics.read');
  if p_from is null or p_to is null or p_to < p_from or (p_to - p_from) > 92 then
    raise exception '日期范围无效或超过 92 天' using errcode = '22023';
  end if;
  if coalesce(p_event_type, 'all') not in ('all', 'message', 'ping')
     or coalesce(p_status, 'all') not in ('all', 'accepted', 'failed', 'skipped', 'unrecorded') then
    raise exception '筛选条件无效' using errcode = '22023';
  end if;
  v_start := (p_from::timestamp at time zone 'Asia/Shanghai');
  v_end := ((p_to + 1)::timestamp at time zone 'Asia/Shanghai');

  with events as (
    select 'message'::text as event_type, m.id as event_id, m.couple_id, m.sender_id as sender_id, m.created_at
    from public.messages m
    where m.created_at >= v_start and m.created_at < v_end
      and coalesce(p_event_type, 'all') in ('all', 'message')
    union all
    select 'ping', p.id, p.couple_id, p.sender_id, p.created_at
    from public.pings p
    where p.created_at >= v_start and p.created_at < v_end
      and coalesce(p_event_type, 'all') in ('all', 'ping')
  ),
  summarized as (
    select e.*,
      coalesce(agg.attempt_count, 0)::int as attempt_count,
      coalesce(agg.accepted_count, 0)::int as accepted_count,
      coalesce(agg.failed_count, 0)::int as failed_count,
      coalesce(agg.skipped_count, 0)::int as skipped_count,
      agg.last_attempt_at,
      agg.duration_ms,
      agg.error_code,
      agg.token_suffix,
      agg.device_platform,
      agg.request_id,
      agg.attempts
    from events e
    left join lateral (
      select
        count(*)::int as attempt_count,
        count(*) filter (where l.stage = 'provider_accepted')::int as accepted_count,
        count(*) filter (where l.stage in ('provider_rejected', 'invalid_token'))::int as failed_count,
        count(*) filter (where l.stage = 'skipped')::int as skipped_count,
        max(l.created_at) as last_attempt_at,
        (array_agg(l.duration_ms order by l.created_at desc))[1] as duration_ms,
        (array_agg(l.error_code order by l.created_at desc))[1] as error_code,
        (array_agg(l.token_suffix order by l.created_at desc))[1] as token_suffix,
        (array_agg(l.device_platform order by l.created_at desc))[1] as device_platform,
        (array_agg(l.request_id order by l.created_at desc))[1] as request_id,
        coalesce(jsonb_agg(jsonb_build_object(
          'request_id', l.request_id, 'stage', l.stage, 'error_code', l.error_code,
          'provider_http_status', l.provider_http_status, 'duration_ms', l.duration_ms,
          'token_suffix', l.token_suffix, 'device_platform', l.device_platform,
          'recipient_user_id', l.recipient_user_id, 'created_at', l.created_at
        ) order by l.created_at desc), '[]'::jsonb) as attempts
      from public.notification_delivery_logs l
      where l.event_type = e.event_type and l.event_id = e.event_id
    ) agg on true
  ),
  filtered as (
    select s.*,
      case
        when s.failed_count > 0 then 'failed'
        when s.accepted_count > 0 then 'accepted'
        when s.skipped_count > 0 then 'skipped'
        else 'unrecorded'
      end as delivery_status
    from summarized s
  ),
  paged as (
    select *,
      row_number() over (order by created_at desc, event_id) as row_no
    from filtered
    where coalesce(p_status, 'all') = 'all' or delivery_status = p_status
    limit v_size offset (v_page - 1) * v_size
  )
  select
    (select count(*) from filtered
      where coalesce(p_status, 'all') = 'all' or delivery_status = p_status),
    coalesce((select jsonb_agg(jsonb_build_object(
      'event_type', event_type, 'event_id', event_id,
      'couple_id', couple_id, 'sender_id', sender_id, 'created_at', created_at,
      'delivery_status', delivery_status,
      'attempt_count', attempt_count, 'accepted_count', accepted_count,
      'failed_count', failed_count, 'skipped_count', skipped_count,
      'last_attempt_at', last_attempt_at, 'duration_ms', duration_ms,
      'error_code', error_code, 'token_suffix', token_suffix,
      'device_platform', device_platform, 'request_id', request_id,
      'attempts', attempts
    ) order by row_no) from paged), '[]'::jsonb)
  into v_total, v_rows;

  return jsonb_build_object(
    'total', v_total, 'page', v_page, 'page_size', v_size, 'rows', v_rows,
    'collected_stages', jsonb_build_array(
      '数据库已保存', '推送服务已接受或拒绝', '推送被跳过（无设备/未配置）'
    ),
    'uncollected_stages', jsonb_build_array('客户端收到回执', '用户主动打开回执')
  );
end;
$fn$;

create function public.admin_list_audit(
  p_actor uuid, p_query text default '', p_success text default 'all',
  p_from date default null, p_to date default null,
  p_page integer default 1, p_page_size integer default 20
) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_size integer := least(greatest(coalesce(p_page_size, 20), 1), 50);
  v_query text := left(btrim(coalesce(p_query, '')), 100);
  v_start timestamptz;
  v_end timestamptz;
  v_total bigint;
  v_rows jsonb;
begin
  perform public.admin_assert_capability(p_actor, 'audit.read');
  if coalesce(p_success, 'all') not in ('all', 'success', 'failure') then
    raise exception '筛选条件无效' using errcode = '22023';
  end if;
  if p_from is not null and p_to is not null and (p_to < p_from or (p_to - p_from) > 365) then
    raise exception '日期范围无效或超过 365 天' using errcode = '22023';
  end if;
  v_start := case when p_from is null then null
    else (p_from::timestamp at time zone 'Asia/Shanghai') end;
  v_end := case when p_to is null then null
    else ((p_to + 1)::timestamp at time zone 'Asia/Shanghai') end;

  with filtered as (
    select l.*
    from public.admin_audit_logs l
    where (coalesce(p_success, 'all') = 'all'
        or (p_success = 'success' and l.success)
        or (p_success = 'failure' and not l.success))
      and (v_start is null or l.created_at >= v_start)
      and (v_end is null or l.created_at < v_end)
      and (v_query = ''
        or position(lower(v_query) in lower(l.action)) > 0
        or position(lower(v_query) in lower(coalesce(l.target_id, ''))) > 0
        or position(lower(v_query) in lower(l.actor_label)) > 0
        or position(lower(v_query) in lower(l.request_id)) > 0
        or position(lower(v_query) in lower(coalesce(l.error_code, ''))) > 0)
  ),
  paged as (
    select *,
      row_number() over (order by created_at desc, id) as row_no
    from filtered
    limit v_size offset (v_page - 1) * v_size
  )
  select
    (select count(*) from filtered),
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'request_id', request_id, 'actor_id', actor_id,
      'actor_role', actor_role, 'actor_label', actor_label,
      'action', action, 'target_type', target_type, 'target_id', target_id,
      'reason', reason, 'success', success, 'error_code', error_code,
      'summary', summary, 'created_at', created_at
    ) order by row_no) from paged), '[]'::jsonb)
  into v_total, v_rows;

  return jsonb_build_object(
    'total', v_total, 'page', v_page, 'page_size', v_size, 'rows', v_rows
  );
end;
$fn$;

create function public.admin_list_members(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_rows jsonb;
begin
  perform public.admin_assert_capability(p_actor, 'admins.manage');
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', a.user_id, 'role', a.role, 'status', a.status,
    'display_name', a.display_name, 'created_at', a.created_at,
    'last_seen_at', a.last_seen_at,
    'email_masked', case
      when u.email is null then null
      when u.email like '%@auth.bibu.space' or u.email like '%@login.bibu.space' then '微信账号'
      else left(u.email, 1) || '***@' || split_part(u.email, '@', 2)
    end
  ) order by a.created_at), '[]'::jsonb) into v_rows
  from public.admin_members a
  left join auth.users u on u.id = a.user_id;
  return jsonb_build_object('rows', v_rows);
end;
$fn$;

create function public.admin_upsert_member(
  p_idempotency_key uuid, p_actor uuid, p_user_id uuid, p_role text, p_status text,
  p_display_name text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_first boolean;
  v_old public.admin_members;
  v_new public.admin_members;
  v_result jsonb;
  v_email text;
  v_active_owners integer;
begin
  perform public.admin_assert_capability(p_actor, 'admins.manage');
  if p_role is null or p_role not in ('owner', 'operator', 'support', 'maintainer') then
    raise exception '角色无效' using errcode = '22023';
  end if;
  if p_status is null or p_status not in ('active', 'suspended') then
    raise exception '成员状态无效' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 2 and 300 then
    raise exception '请填写 2–300 字的操作理由' using errcode = '22023';
  end if;
  if not exists(select 1 from auth.users where id = p_user_id) then
    raise exception '目标用户不存在' using errcode = '22023';
  end if;
  if p_idempotency_key is null then
    raise exception '缺少幂等键' using errcode = '22023';
  end if;
  v_first := public.admin_idempotency_begin(
    p_idempotency_key, p_actor, 'admin.member.upsert',
    md5(p_role || '|' || p_status || '|' || coalesce(p_display_name, '') || '|' ||
        btrim(p_reason) || '|' || p_user_id::text)
  );
  if not v_first then
    return public.admin_idempotency_read(p_idempotency_key);
  end if;
  select * into v_old from public.admin_members where user_id = p_user_id for update;
  insert into public.admin_members(user_id, role, status, display_name, created_by, updated_at)
  values (
    p_user_id, p_role, p_status, left(btrim(coalesce(p_display_name, '')), 60),
    case when v_old.user_id is null then p_actor else v_old.created_by end, now()
  )
  on conflict (user_id) do update set
    role = excluded.role, status = excluded.status,
    display_name = excluded.display_name, updated_at = now()
  returning * into v_new;

  select count(*) into v_active_owners
  from public.admin_members where role = 'owner' and status = 'active';
  if v_active_owners = 0 then
    raise exception '至少需要保留一位有效 owner' using errcode = '22023';
  end if;

  select email into v_email from auth.users where id = p_user_id;
  perform public.admin_audit_insert(
    'req-' || p_idempotency_key::text, p_actor,
    case when v_old.user_id is null then 'admin.member.create' else 'admin.member.update' end,
    'admin_member', p_user_id::text, btrim(p_reason), true, null,
    jsonb_build_object(
      'old_role', v_old.role, 'new_role', v_new.role,
      'old_status', v_old.status, 'new_status', v_new.status
    )
  );
  v_result := jsonb_build_object('member', jsonb_build_object(
    'user_id', v_new.user_id, 'role', v_new.role, 'status', v_new.status,
    'display_name', v_new.display_name, 'created_at', v_new.created_at,
    'email_masked', case
      when v_email is null then null
      when v_email like '%@auth.bibu.space' or v_email like '%@login.bibu.space' then '微信账号'
      else left(v_email, 1) || '***@' || split_part(v_email, '@', 2)
    end
  ));
  perform public.admin_idempotency_store(p_idempotency_key, v_result, 200);
  return v_result;
end;
$fn$;

create function public.admin_system_health(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  perform public.admin_assert_capability(p_actor, 'system.read');
  return jsonb_build_object(
    'database', 'ok',
    'database_time', now(),
    'pg_version', current_setting('server_version'),
    'counts', jsonb_build_object(
      'users', (select count(*) from auth.users),
      'couples', (select count(*) from public.couples),
      'open_tickets', (select count(*) from public.support_tickets where status <> 'resolved'),
      'push_attempts_24h', (select count(*) from public.notification_delivery_logs where created_at > now() - interval '24 hours'),
      'push_failures_24h', (select count(*) from public.notification_delivery_logs where stage in ('provider_rejected', 'invalid_token') and created_at > now() - interval '24 hours'),
      'audit_failures_7d', (select count(*) from public.admin_audit_logs where not success and created_at > now() - interval '7 days')
    ),
    'recent_audit_failures', coalesce((
      select jsonb_agg(jsonb_build_object(
        'action', l.action, 'target_type', l.target_type, 'target_id', l.target_id,
        'error_code', l.error_code, 'created_at', l.created_at, 'request_id', l.request_id
      ) order by l.created_at desc)
      from (
        select * from public.admin_audit_logs where not success
        order by created_at desc limit 5
      ) l
    ), '[]'::jsonb),
    'recent_push_failures', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_type', event_type, 'event_id', event_id,
        'attempts', attempts, 'last_at', last_at, 'error_code', error_code
      ) order by last_at desc)
      from (
        select event_type, event_id, count(*)::int as attempts, max(created_at) as last_at,
          (array_agg(error_code order by created_at desc))[1] as error_code
        from public.notification_delivery_logs
        where stage in ('provider_rejected', 'invalid_token')
          and created_at > now() - interval '24 hours'
        group by event_type, event_id
        order by max(created_at) desc limit 5
      ) x
    ), '[]'::jsonb),
    'diagnostic_retention_days', 30,
    'diagnostic_coverage', jsonb_build_object(
      'collected', jsonb_build_array('数据库保存', 'Webhook 处理', '个推通道接受/拒绝', '无效 CID 清理'),
      'not_collected', jsonb_build_array('客户端收到', '用户打开', 'CPU', '内存', '实时在线人数')
    )
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 5. 授权：管理表与 RPC 仅 service_role；用户工单 RPC 仅 authenticated
-- ---------------------------------------------------------------------------
alter table public.admin_members enable row level security;
alter table public.admin_user_notes enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.admin_idempotency_keys enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
alter table public.notification_delivery_logs enable row level security;

revoke all on public.admin_members, public.admin_user_notes, public.admin_audit_logs,
  public.admin_idempotency_keys, public.support_tickets, public.support_ticket_messages,
  public.notification_delivery_logs from public, anon, authenticated, service_role;
revoke all on sequence public.support_ticket_seq from public, anon, authenticated;

revoke all on function public.admin_audit_immutable() from public, anon, authenticated;
revoke all on function public.admin_capabilities(text) from public, anon, authenticated;
revoke all on function public.admin_actor(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_assert_capability(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_bootstrap_status() from public, anon, authenticated;
revoke all on function public.admin_bootstrap_owner(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_record_system_action(text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.admin_record_failure(text, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_audit_insert(text, uuid, text, text, text, text, boolean, text, jsonb) from public, anon, authenticated;
revoke all on function public.admin_idempotency_begin(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_idempotency_read(uuid) from public, anon, authenticated;
revoke all on function public.admin_idempotency_store(uuid, jsonb, integer) from public, anon, authenticated;
revoke all on function public.admin_range_metrics(date, date) from public, anon, authenticated;
revoke all on function public.admin_overview(uuid, date, date) from public, anon, authenticated;
revoke all on function public.admin_list_users(uuid, text, text, integer, integer, text, text, date, date) from public, anon, authenticated;
revoke all on function public.admin_user_detail(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_list_couples(uuid, date, date, text, text, integer, integer, text, date, date, boolean, text) from public, anon, authenticated;
revoke all on function public.admin_couple_detail(uuid, uuid, date, date) from public, anon, authenticated;
revoke all on function public.admin_add_user_note(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_list_tickets(uuid, text, text, text, integer, integer, text) from public, anon, authenticated;
revoke all on function public.admin_ticket_detail(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_ticket_action(uuid, uuid, uuid, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.admin_list_diagnostics(uuid, date, date, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_list_audit(uuid, text, text, date, date, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_list_members(uuid) from public, anon, authenticated;
revoke all on function public.admin_upsert_member(uuid, uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_system_health(uuid) from public, anon, authenticated;
revoke all on function public.prune_admin_diagnostics(integer) from public, anon, authenticated;
revoke all on function public.record_notification_delivery(uuid, text, uuid, uuid, uuid, text, text, text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_touch_actor(uuid) from public, anon, authenticated;
revoke all on function public.my_support_tickets() from public, anon;
revoke all on function public.my_support_ticket(uuid) from public, anon;
revoke all on function public.create_support_ticket(text, text, text, text) from public, anon;
revoke all on function public.reply_my_support_ticket(uuid, text) from public, anon;

grant execute on function public.admin_actor(uuid, uuid) to service_role;
grant execute on function public.admin_bootstrap_status() to service_role;
grant execute on function public.admin_bootstrap_owner(uuid, text) to service_role;
grant execute on function public.admin_record_system_action(text, text, text, text, jsonb) to service_role;
grant execute on function public.admin_record_failure(text, uuid, text, text, text, text, text) to service_role;
grant execute on function public.admin_overview(uuid, date, date) to service_role;
grant execute on function public.admin_list_users(uuid, text, text, integer, integer, text, text, date, date) to service_role;
grant execute on function public.admin_user_detail(uuid, uuid) to service_role;
grant execute on function public.admin_list_couples(uuid, date, date, text, text, integer, integer, text, date, date, boolean, text) to service_role;
grant execute on function public.admin_couple_detail(uuid, uuid, date, date) to service_role;
grant execute on function public.admin_add_user_note(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.admin_list_tickets(uuid, text, text, text, integer, integer, text) to service_role;
grant execute on function public.admin_ticket_detail(uuid, uuid) to service_role;
grant execute on function public.admin_ticket_action(uuid, uuid, uuid, text, text, text, text, uuid) to service_role;
grant execute on function public.admin_list_diagnostics(uuid, date, date, text, text, integer, integer) to service_role;
grant execute on function public.admin_list_audit(uuid, text, text, date, date, integer, integer) to service_role;
grant execute on function public.admin_list_members(uuid) to service_role;
grant execute on function public.admin_upsert_member(uuid, uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.admin_system_health(uuid) to service_role;
grant execute on function public.prune_admin_diagnostics(integer) to service_role;
grant execute on function public.record_notification_delivery(uuid, text, uuid, uuid, uuid, text, text, text, text, text, integer, integer) to service_role;
grant execute on function public.admin_touch_actor(uuid) to service_role;
grant execute on function public.my_support_tickets() to authenticated;
grant execute on function public.my_support_ticket(uuid) to authenticated;
grant execute on function public.create_support_ticket(text, text, text, text) to authenticated;
grant execute on function public.reply_my_support_ticket(uuid, text) to authenticated;

-- 统计查询索引（只增不减，不影响用户端语义）。
create index if not exists pings_created_at_idx on public.pings(created_at desc);
create index if not exists photos_created_at_idx on public.photos(created_at desc);
create index if not exists daily_task_completions_completed_at_idx on public.daily_task_completions(completed_at desc);
create index if not exists couples_created_at_idx on public.couples(created_at desc);
create index if not exists messages_sender_time_idx on public.messages(sender_id, created_at desc);

notify pgrst, 'reload schema';
commit;
