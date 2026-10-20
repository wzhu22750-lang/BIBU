-- BIBU 管理后台硬化（增量，不修改 202610200001 已发布内容）。
-- 1) 用户工单逻辑操作幂等（新版本化 RPC，旧调用保留）；
-- 2) 管理写操作使用服务端 request_id 写审计，并返回原操作请求编号；
-- 3) 管理员成员变更与 bootstrap 使用事务级 advisory lock，防止并发清空 owner。
begin;

-- ---------------------------------------------------------------------------
-- 1. 用户工单幂等
-- ---------------------------------------------------------------------------
create table public.support_idempotency_keys (
  key uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null,
  request_hash text not null,
  response jsonb,
  status_code integer,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);
create index support_idempotency_expiry on public.support_idempotency_keys(expires_at);
create index support_idempotency_user_time on public.support_idempotency_keys(user_id, created_at desc);
alter table public.support_idempotency_keys enable row level security;
revoke all on public.support_idempotency_keys from public, anon, authenticated, service_role;

create function public.support_idempotency_begin(
  p_key uuid, p_user_id uuid, p_operation text, p_request_hash text
) returns boolean
language plpgsql security definer set search_path = '' as $fn$
declare
  v_rows integer;
  v_row public.support_idempotency_keys;
begin
  if p_key is null or p_user_id is null then
    raise exception '缺少幂等键或用户身份' using errcode = '22023';
  end if;
  insert into public.support_idempotency_keys(key, user_id, operation, request_hash)
  values (p_key, p_user_id, left(p_operation, 80), p_request_hash)
  on conflict (key) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 1 then
    return true;
  end if;
  select * into v_row
  from public.support_idempotency_keys
  where key = p_key
  for update;
  if v_row.key is null then
    raise exception '幂等记录读取失败' using errcode = '40001';
  end if;
  if v_row.user_id is distinct from p_user_id
     or v_row.operation is distinct from left(p_operation, 80)
     or v_row.request_hash is distinct from p_request_hash then
    raise exception '幂等键与原请求不匹配或不属于当前账号' using errcode = '23505';
  end if;
  if v_row.response is null then
    raise exception '相同请求正在处理，请稍后重试' using errcode = '40001';
  end if;
  return false;
end;
$fn$;

create function public.support_idempotency_read(p_key uuid, p_user_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select response from public.support_idempotency_keys
  where key = p_key and user_id = p_user_id;
$fn$;

create function public.support_idempotency_store(
  p_key uuid, p_user_id uuid, p_response jsonb, p_status integer default 200
) returns void
language sql security definer set search_path = '' as $fn$
  update public.support_idempotency_keys
  set response = p_response, status_code = p_status
  where key = p_key and user_id = p_user_id;
$fn$;

revoke all on function public.support_idempotency_begin(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.support_idempotency_read(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.support_idempotency_store(uuid, uuid, jsonb, integer)
  from public, anon, authenticated;

create function public.create_support_ticket_v2(
  p_idempotency_key uuid, p_category text, p_description text,
  p_app_version text default 'unknown', p_platform text default 'unknown'
) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_recent integer;
  v_version text;
  v_platform text;
  v_hash text;
  v_first boolean;
  v_row public.support_tickets;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception '请先登录' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception '缺少幂等键' using errcode = '22023';
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
  v_hash := md5('create_support_ticket|' || p_category || '|' || btrim(p_description)
    || '|' || v_version || '|' || v_platform);

  v_first := public.support_idempotency_begin(
    p_idempotency_key, v_uid, 'support.create', v_hash
  );
  if not v_first then
    v_result := public.support_idempotency_read(p_idempotency_key, v_uid);
    if v_result is null then
      raise exception '幂等记录不可用，请重新提交' using errcode = '40001';
    end if;
    return v_result;
  end if;

  select count(*) into v_recent
  from public.support_tickets
  where user_id = v_uid and created_at > now() - interval '1 hour';
  if v_recent >= 5 then
    raise exception '提交太频繁，请稍后再试' using errcode = '22023';
  end if;
  insert into public.support_tickets(
    user_id, couple_id, category, description, client_app_version, client_platform
  ) values (
    v_uid, public.my_couple_id(), p_category, btrim(p_description), v_version, v_platform
  ) returning * into v_row;
  v_result := public.my_support_ticket(v_row.id);
  perform public.support_idempotency_store(p_idempotency_key, v_uid, v_result, 201);
  return v_result;
end;
$fn$;

create function public.reply_my_support_ticket_v2(
  p_idempotency_key uuid, p_ticket_id uuid, p_body text
) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_row public.support_tickets;
  v_recent integer;
  v_hash text;
  v_first boolean;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception '请先登录' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception '缺少幂等键' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 2000 then
    raise exception '回复内容需为 1–2000 字' using errcode = '22023';
  end if;
  v_hash := md5('reply_support_ticket|' || p_ticket_id::text || '|' || btrim(p_body));
  v_first := public.support_idempotency_begin(
    p_idempotency_key, v_uid, 'support.reply', v_hash
  );
  if not v_first then
    v_result := public.support_idempotency_read(p_idempotency_key, v_uid);
    if v_result is null then
      raise exception '幂等记录不可用，请重新提交' using errcode = '40001';
    end if;
    return v_result;
  end if;

  select * into v_row
  from public.support_tickets
  where id = p_ticket_id and user_id = v_uid
  for update;
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
  v_result := public.my_support_ticket(p_ticket_id);
  perform public.support_idempotency_store(p_idempotency_key, v_uid, v_result, 200);
  return v_result;
end;
$fn$;

-- 旧版签名保留，供已上线客户端继续调用；每次旧调用生成独立幂等键，
-- 因此旧客户端仍不具备“响应丢失后重试复用”的能力。
create or replace function public.create_support_ticket(
  p_category text, p_description text,
  p_app_version text default 'unknown', p_platform text default 'unknown'
) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
begin
  return public.create_support_ticket_v2(
    gen_random_uuid(), p_category, p_description, p_app_version, p_platform
  );
end;
$fn$;

create or replace function public.reply_my_support_ticket(p_ticket_id uuid, p_body text)
returns jsonb
language plpgsql security definer set search_path = '' as $fn$
begin
  return public.reply_my_support_ticket_v2(gen_random_uuid(), p_ticket_id, p_body);
end;
$fn$;

revoke all on function public.create_support_ticket_v2(uuid, text, text, text, text)
  from public, anon;
revoke all on function public.reply_my_support_ticket_v2(uuid, uuid, text)
  from public, anon;
grant execute on function public.create_support_ticket_v2(uuid, text, text, text, text)
  to authenticated;
grant execute on function public.reply_my_support_ticket_v2(uuid, uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 2. 管理幂等：记录首次执行的 request_id，重放时返回原请求编号
-- ---------------------------------------------------------------------------
alter table public.admin_idempotency_keys
  add column if not exists request_id text not null default '',
  add column if not exists last_request_id text,
  add column if not exists replay_count integer not null default 0;
update public.admin_idempotency_keys
set request_id = 'legacy:' || key::text
where request_id = '';

drop function public.admin_idempotency_begin(uuid, uuid, text, text);
create function public.admin_idempotency_begin(
  p_key uuid, p_actor uuid, p_route text, p_request_hash text, p_request_id text
) returns boolean
language plpgsql security definer set search_path = '' as $fn$
declare
  v_rows integer;
  v_row public.admin_idempotency_keys;
  v_request_id text := left(btrim(coalesce(p_request_id, '')), 120);
begin
  if p_key is null or p_actor is null or v_request_id = '' then
    raise exception '缺少幂等键、操作者或请求编号' using errcode = '22023';
  end if;
  insert into public.admin_idempotency_keys(key, actor_id, route, request_hash, request_id)
  values (p_key, p_actor, left(p_route, 80), p_request_hash, v_request_id)
  on conflict (key) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 1 then
    return true;
  end if;
  select * into v_row from public.admin_idempotency_keys where key = p_key for update;
  if v_row.key is null then
    raise exception '幂等记录读取失败' using errcode = '40001';
  end if;
  if v_row.actor_id is distinct from p_actor
     or v_row.route is distinct from left(p_route, 80)
     or v_row.request_hash is distinct from p_request_hash then
    raise exception '幂等键与原请求不匹配' using errcode = '23505';
  end if;
  if v_row.response is null then
    raise exception '相同请求正在处理，请稍后重试' using errcode = '40001';
  end if;
  update public.admin_idempotency_keys
  set last_request_id = v_request_id, replay_count = replay_count + 1
  where key = p_key;
  return false;
end;
$fn$;

create function public.admin_idempotency_lookup(p_key uuid) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select jsonb_build_object(
    'response', response,
    'request_id', request_id,
    'last_request_id', last_request_id,
    'replay_count', replay_count
  )
  from public.admin_idempotency_keys
  where key = p_key;
$fn$;

revoke all on function public.admin_idempotency_begin(uuid, uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.admin_idempotency_lookup(uuid)
  from public, anon, authenticated;

-- 失败审计可以附带逻辑操作键；正文、工单全文与令牌仍不进入审计。
drop function public.admin_record_failure(text, uuid, text, text, text, text, text);
create function public.admin_record_failure(
  p_request_id text, p_actor uuid, p_action text, p_target_type text,
  p_target_id text, p_reason text, p_error_code text,
  p_idempotency_key uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $fn$
declare
  v_id uuid;
  v_summary jsonb := jsonb_build_object('recorded_by', 'admin-api');
begin
  if p_idempotency_key is not null then
    v_summary := v_summary || jsonb_build_object('idempotency_key', p_idempotency_key);
  end if;
  v_id := public.admin_audit_insert(
    coalesce(nullif(btrim(p_request_id), ''), 'missing-' || gen_random_uuid()::text),
    p_actor, p_action, p_target_type, p_target_id,
    p_reason, false, p_error_code, v_summary
  );
  return v_id;
end;
$fn$;
revoke all on function public.admin_record_failure(text, uuid, text, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_record_failure(text, uuid, text, text, text, text, text, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. 管理写操作：审计使用 API request_id，幂等重放返回原请求编号
-- ---------------------------------------------------------------------------
drop function public.admin_add_user_note(uuid, uuid, uuid, text, text);
create function public.admin_add_user_note(
  p_idempotency_key uuid, p_actor uuid, p_user_id uuid, p_body text, p_reason text,
  p_request_id text
) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_first boolean;
  v_note public.admin_user_notes;
  v_result jsonb;
  v_stored jsonb;
  v_request_id text := left(btrim(coalesce(p_request_id, '')), 120);
begin
  perform public.admin_assert_capability(p_actor, 'users.notes.write');
  if char_length(btrim(coalesce(p_body, ''))) not between 2 and 2000 then
    raise exception '备注需为 2–2000 字' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 2 and 300 then
    raise exception '请填写 2–300 字的操作理由' using errcode = '22023';
  end if;
  if p_idempotency_key is null then
    raise exception '缺少幂等键' using errcode = '22023';
  end if;
  if v_request_id = '' then
    raise exception '缺少请求编号' using errcode = '22023';
  end if;
  v_first := public.admin_idempotency_begin(
    p_idempotency_key, p_actor, 'user.note',
    md5(btrim(p_body) || '|' || btrim(p_reason) || '|' || p_user_id::text),
    v_request_id
  );
  if not v_first then
    v_stored := public.admin_idempotency_lookup(p_idempotency_key);
    if v_stored is null or v_stored->'response' is null then
      raise exception '幂等记录不可用，请稍后重试' using errcode = '40001';
    end if;
    return (v_stored->'response') || jsonb_build_object(
      'operation', jsonb_build_object(
        'idempotency_key', p_idempotency_key,
        'request_id', v_stored->>'request_id',
        'current_request_id', v_request_id,
        'replayed', true
      )
    );
  end if;
  if not exists(select 1 from auth.users where id = p_user_id) then
    raise exception '用户不存在' using errcode = '22023';
  end if;
  insert into public.admin_user_notes(user_id, author_id, body)
  values (p_user_id, p_actor, btrim(p_body))
  returning * into v_note;
  perform public.admin_audit_insert(
    v_request_id, p_actor, 'user.note.create', 'user', p_user_id::text,
    btrim(p_reason), true, null,
    jsonb_build_object(
      'note_id', v_note.id,
      'body_length', char_length(v_note.body),
      'idempotency_key', p_idempotency_key,
      'operation_request_id', v_request_id
    )
  );
  v_result := jsonb_build_object(
    'note', jsonb_build_object('id', v_note.id, 'body', v_note.body, 'created_at', v_note.created_at),
    'operation', jsonb_build_object(
      'idempotency_key', p_idempotency_key,
      'request_id', v_request_id,
      'current_request_id', v_request_id,
      'replayed', false
    )
  );
  perform public.admin_idempotency_store(p_idempotency_key, v_result, 201);
  return v_result;
end;
$fn$;
revoke all on function public.admin_add_user_note(uuid, uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_add_user_note(uuid, uuid, uuid, text, text, text)
  to service_role;

drop function public.admin_ticket_action(uuid, uuid, uuid, text, text, text, text, uuid);
create function public.admin_ticket_action(
  p_idempotency_key uuid, p_actor uuid, p_ticket_id uuid, p_action text,
  p_reason text default '', p_body text default null,
  p_status text default null, p_assignee_id uuid default null,
  p_request_id text default null
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
  v_stored jsonb;
  v_request_id text := left(btrim(coalesce(p_request_id, '')), 120);
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
  if v_request_id = '' then
    raise exception '缺少请求编号' using errcode = '22023';
  end if;
  v_first := public.admin_idempotency_begin(
    p_idempotency_key, p_actor, 'ticket.action',
    md5(p_action || '|' || coalesce(p_body, '') || '|' || coalesce(p_status, '') || '|' ||
        coalesce(p_assignee_id::text, '') || '|' || v_reason || '|' || p_ticket_id::text),
    v_request_id
  );
  if not v_first then
    v_stored := public.admin_idempotency_lookup(p_idempotency_key);
    if v_stored is null or v_stored->'response' is null then
      raise exception '幂等记录不可用，请稍后重试' using errcode = '40001';
    end if;
    return (v_stored->'response') || jsonb_build_object(
      'operation', jsonb_build_object(
        'idempotency_key', p_idempotency_key,
        'request_id', v_stored->>'request_id',
        'current_request_id', v_request_id,
        'replayed', true
      )
    );
  end if;
  select * into v_ticket from public.support_tickets where id = p_ticket_id for update;
  if v_ticket.id is null then
    raise exception '工单不存在' using errcode = '22023';
  end if;
  v_from_status := v_ticket.status;
  v_message.id := null;

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
      v_request_id, p_actor, 'ticket.reply', 'ticket', p_ticket_id::text,
      v_reason, true, null,
      jsonb_build_object('message_id', v_message.id, 'from_status', v_from_status,
        'to_status', v_to_status, 'visibility', 'user', 'body_length', char_length(v_message.body),
        'idempotency_key', p_idempotency_key, 'operation_request_id', v_request_id)
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
      v_request_id, p_actor, 'ticket.note', 'ticket', p_ticket_id::text,
      v_reason, true, null,
      jsonb_build_object('message_id', v_message.id, 'visibility', 'internal',
        'body_length', char_length(v_message.body),
        'idempotency_key', p_idempotency_key, 'operation_request_id', v_request_id)
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
      v_request_id, p_actor, 'ticket.status', 'ticket', p_ticket_id::text,
      v_reason, true, null,
      jsonb_build_object('from_status', v_from_status, 'to_status', v_to_status,
        'idempotency_key', p_idempotency_key, 'operation_request_id', v_request_id)
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
      v_request_id, p_actor, 'ticket.assign', 'ticket', p_ticket_id::text,
      v_reason, true, null,
      jsonb_build_object('from_assignee', v_ticket.assigned_admin_id, 'to_assignee', p_assignee_id,
        'idempotency_key', p_idempotency_key, 'operation_request_id', v_request_id)
    );
  end if;
  v_result := jsonb_build_object(
    'ticket', public.admin_ticket_detail(p_actor, p_ticket_id),
    'message', v_message.id,
    'operation', jsonb_build_object(
      'idempotency_key', p_idempotency_key,
      'request_id', v_request_id,
      'current_request_id', v_request_id,
      'replayed', false
    )
  );
  perform public.admin_idempotency_store(p_idempotency_key, v_result, 200);
  return v_result;
end;
$fn$;
revoke all on function public.admin_ticket_action(uuid, uuid, uuid, text, text, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_ticket_action(uuid, uuid, uuid, text, text, text, text, uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. 管理员全局约束：事务级 advisory lock
--    锁顺序：advisory(成员约束) -> 幂等行 -> 成员行/工单行。
--    所有会改变“是否存在有效 owner”的路径必须先拿同一把事务锁。
-- ---------------------------------------------------------------------------
drop function public.admin_upsert_member(uuid, uuid, uuid, text, text, text, text);
create function public.admin_upsert_member(
  p_idempotency_key uuid, p_actor uuid, p_user_id uuid, p_role text, p_status text,
  p_display_name text, p_reason text, p_request_id text
) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_first boolean;
  v_old public.admin_members;
  v_new public.admin_members;
  v_result jsonb;
  v_email text;
  v_active_owners integer;
  v_stored jsonb;
  v_request_id text := left(btrim(coalesce(p_request_id, '')), 120);
begin
  -- 7480135000000000001 是 BIBU 管理员成员约束的固定事务锁编号。
  perform pg_advisory_xact_lock(7480135000000000001::bigint);
  -- 等锁期间操作者可能已被降权/停用，必须在取得锁后重新校验。
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
  if p_idempotency_key is null then
    raise exception '缺少幂等键' using errcode = '22023';
  end if;
  if v_request_id = '' then
    raise exception '缺少请求编号' using errcode = '22023';
  end if;
  v_first := public.admin_idempotency_begin(
    p_idempotency_key, p_actor, 'admin.member.upsert',
    md5(p_role || '|' || p_status || '|' || coalesce(p_display_name, '') || '|' ||
        btrim(p_reason) || '|' || p_user_id::text),
    v_request_id
  );
  if not v_first then
    v_stored := public.admin_idempotency_lookup(p_idempotency_key);
    if v_stored is null or v_stored->'response' is null then
      raise exception '幂等记录不可用，请稍后重试' using errcode = '40001';
    end if;
    return (v_stored->'response') || jsonb_build_object(
      'operation', jsonb_build_object(
        'idempotency_key', p_idempotency_key,
        'request_id', v_stored->>'request_id',
        'current_request_id', v_request_id,
        'replayed', true
      )
    );
  end if;
  if not exists(select 1 from auth.users where id = p_user_id) then
    raise exception '目标用户不存在' using errcode = '22023';
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
    v_request_id, p_actor,
    case when v_old.user_id is null then 'admin.member.create' else 'admin.member.update' end,
    'admin_member', p_user_id::text, btrim(p_reason), true, null,
    jsonb_build_object(
      'old_role', v_old.role, 'new_role', v_new.role,
      'old_status', v_old.status, 'new_status', v_new.status,
      'idempotency_key', p_idempotency_key, 'operation_request_id', v_request_id
    )
  );
  v_result := jsonb_build_object(
    'member', jsonb_build_object(
      'user_id', v_new.user_id, 'role', v_new.role, 'status', v_new.status,
      'display_name', v_new.display_name, 'created_at', v_new.created_at,
      'email_masked', case
        when v_email is null then null
        when v_email like '%@auth.bibu.space' or v_email like '%@login.bibu.space' then '微信账号'
        else left(v_email, 1) || '***@' || split_part(v_email, '@', 2)
      end
    ),
    'operation', jsonb_build_object(
      'idempotency_key', p_idempotency_key,
      'request_id', v_request_id,
      'current_request_id', v_request_id,
      'replayed', false
    )
  );
  perform public.admin_idempotency_store(p_idempotency_key, v_result, 200);
  return v_result;
end;
$fn$;
revoke all on function public.admin_upsert_member(uuid, uuid, uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_upsert_member(uuid, uuid, uuid, text, text, text, text, text)
  to service_role;

create or replace function public.admin_bootstrap_owner(
  p_user_id uuid, p_display_name text default ''
) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_email text;
  v_confirmed timestamptz;
  v_name text;
begin
  perform pg_advisory_xact_lock(7480135000000000001::bigint);
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
    jsonb_build_object('role', 'owner', 'display_name', v_name)
  );
  return jsonb_build_object('user_id', p_user_id, 'role', 'owner', 'status', 'active');
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 5. 诊断/幂等保留清理
-- ---------------------------------------------------------------------------
create or replace function public.prune_admin_diagnostics(p_retention_days integer default 30)
returns integer
language plpgsql security definer set search_path = '' as $fn$
declare
  v_deleted integer;
begin
  if p_retention_days is null or p_retention_days < 7 or p_retention_days > 365 then
    raise exception '保留天数需为 7–365' using errcode = '22023';
  end if;
  delete from public.notification_delivery_logs
  where created_at < now() - make_interval(days => p_retention_days);
  get diagnostics v_deleted = row_count;
  delete from public.admin_idempotency_keys where expires_at < now();
  delete from public.support_idempotency_keys where expires_at < now();
  return v_deleted;
end;
$fn$;

notify pgrst, 'reload schema';
commit;
