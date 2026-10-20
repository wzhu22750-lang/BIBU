-- Admin workflow: contextual queues, atomic reply/resolve and exact diagnostics.
begin;

drop function public.admin_list_tickets(uuid,text,text,text,integer,integer,text);

create function public.admin_list_tickets(
  p_actor uuid, p_status text default 'open', p_category text default 'all',
  p_query text default '', p_page integer default 1, p_page_size integer default 20,
  p_sort text default 'updated_desc', p_view text default 'all'
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
     or v_sort not in ('updated_desc', 'created_desc', 'waiting_asc')
     or coalesce(p_view, 'all') not in ('all', 'mine', 'unassigned', 'user_replied') then
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
      left(t.description, 100) as excerpt,
      case when coalesce(msg.user_at, t.created_at) > coalesce(msg.admin_at, '-infinity'::timestamptz)
        and t.status <> 'resolved' then coalesce(msg.user_at, t.created_at) end as waiting_since,
      (msg.user_at > coalesce(msg.admin_at, '-infinity'::timestamptz) and t.status <> 'resolved') is true as user_replied
    from public.support_tickets t
    left join public.profiles p on p.id = t.user_id
    left join auth.users u on u.id = t.user_id
    left join public.admin_members a on a.user_id = t.assigned_admin_id
    left join lateral (
      select max(created_at) filter (where author_type = 'user') as user_at,
        max(created_at) filter (where author_type = 'admin' and visibility = 'user') as admin_at
      from public.support_ticket_messages where ticket_id = t.id
    ) msg on true
    where (coalesce(p_view, 'all') = 'all'
      or (p_view = 'mine' and t.assigned_admin_id = p_actor)
      or (p_view = 'unassigned' and t.assigned_admin_id is null)
      or (p_view = 'user_replied' and t.status <> 'resolved' and msg.user_at > coalesce(msg.admin_at, '-infinity'::timestamptz)))
      and (v_status = 'all'
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
          case when v_sort = 'waiting_asc' then waiting_since end asc nulls last,
          case when v_sort = 'created_desc' then created_at end desc nulls last,
          updated_at desc, id
      ) as row_no
    from filtered
    order by row_no
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
      'excerpt', excerpt, 'waiting_since', waiting_since, 'user_replied', user_replied
    ) order by row_no) from paged), '[]'::jsonb)
  into v_total, v_rows;

  return jsonb_build_object(
    'total', v_total, 'page', v_page, 'page_size', v_size, 'rows', v_rows
  );
end;
$fn$;

revoke all on function public.admin_list_tickets(uuid,text,text,text,integer,integer,text,text) from public, anon, authenticated;

grant execute on function public.admin_list_tickets(uuid,text,text,text,integer,integer,text,text) to service_role;

drop function public.admin_ticket_action(uuid,uuid,uuid,text,text,text,text,uuid,text);

create function public.admin_ticket_action(
  p_idempotency_key uuid, p_actor uuid, p_ticket_id uuid, p_action text,
  p_reason text default '', p_body text default null,
  p_status text default null, p_assignee_id uuid default null,
  p_request_id text default null, p_expected_updated_at timestamptz default null
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
        coalesce(p_assignee_id::text, '') || '|' || v_reason || '|' || p_ticket_id::text ||
        case when p_expected_updated_at is null then '' else '|' || p_expected_updated_at::text end),
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
  if p_expected_updated_at is not null and v_ticket.updated_at <> p_expected_updated_at then
    raise exception '工单已更新，请刷新后确认再提交' using errcode = '40001';
  end if;
  v_from_status := v_ticket.status;
  v_message.id := null;

  if p_action = 'reply' then
    if p_status is not null and p_status not in ('waiting_user', 'resolved') then
      raise exception '回复后状态无效' using errcode = '22023';
    end if;
    if v_ticket.status = 'resolved' then
      raise exception '已解决的工单不能直接回复，请先重新打开' using errcode = '22023';
    end if;
    insert into public.support_ticket_messages(ticket_id, author_type, author_id, visibility, body)
    values (p_ticket_id, 'admin', p_actor, 'user', btrim(p_body))
    returning * into v_message;
    v_to_status := coalesce(p_status, 'waiting_user');
    update public.support_tickets
    set status = v_to_status, updated_at = clock_timestamp(),
        resolved_at = case when v_to_status = 'resolved' then now() else null end,
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
    set updated_at = clock_timestamp(), assigned_admin_id = coalesce(assigned_admin_id, p_actor)
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
        updated_at = clock_timestamp()
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
    set assigned_admin_id = p_assignee_id, updated_at = clock_timestamp()
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

revoke all on function public.admin_ticket_action(uuid,uuid,uuid,text,text,text,text,uuid,text,timestamptz) from public, anon, authenticated;

grant execute on function public.admin_ticket_action(uuid,uuid,uuid,text,text,text,text,uuid,text,timestamptz) to service_role;

drop function public.admin_list_diagnostics(uuid,date,date,text,text,integer,integer);

create function public.admin_list_diagnostics(
  p_actor uuid, p_from date, p_to date, p_event_type text default 'all',
  p_status text default 'all', p_page integer default 1, p_page_size integer default 20,
  p_event_id uuid default null, p_request_id text default null, p_couple_id uuid default null
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
    where (p_event_id is not null or nullif(p_request_id, '') is not null or (m.created_at >= v_start and m.created_at < v_end))
      and (p_event_id is null or m.id = p_event_id)
      and (p_couple_id is null or m.couple_id = p_couple_id)
      and (nullif(p_request_id, '') is null or exists (select 1 from public.notification_delivery_logs l where l.event_type = 'message' and l.event_id = m.id and l.request_id::text = lower(p_request_id)))
      and coalesce(p_event_type, 'all') in ('all', 'message')
    union all
    select 'ping', p.id, p.couple_id, p.sender_id, p.created_at
    from public.pings p
    where (p_event_id is not null or nullif(p_request_id, '') is not null or (p.created_at >= v_start and p.created_at < v_end))
      and (p_event_id is null or p.id = p_event_id)
      and (p_couple_id is null or p.couple_id = p_couple_id)
      and (nullif(p_request_id, '') is null or exists (select 1 from public.notification_delivery_logs l where l.event_type = 'ping' and l.event_id = p.id and l.request_id::text = lower(p_request_id)))
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
    order by row_no
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

revoke all on function public.admin_list_diagnostics(uuid,date,date,text,text,integer,integer,uuid,text,uuid) from public, anon, authenticated;

grant execute on function public.admin_list_diagnostics(uuid,date,date,text,text,integer,integer,uuid,text,uuid) to service_role;

notify pgrst, 'reload schema';
commit;
