begin;

create or replace function public.admin_capabilities(p_role text) returns text[]
language sql immutable set search_path = '' as $fn$
  select case p_role
    when 'owner' then array[
      'overview.read', 'users.read', 'users.search_email', 'users.notes.write',
      'couples.read', 'tickets.read', 'tickets.write', 'diagnostics.read',
      'system.read', 'audit.read', 'admins.manage', 'data.read'
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

create function public.admin_visible_email(p_actor uuid, p_email text) returns text
language sql stable security definer set search_path = '' as $fn$
  select case when exists(select 1 from public.admin_members where user_id=p_actor and role='owner' and status='active') then p_email
    when p_email is null then null
    when p_email like '%@auth.bibu.space' or p_email like '%@login.bibu.space' then '微信账号'
    else left(p_email,1)||'***@'||split_part(p_email,'@',2) end;
$fn$;
revoke all on function public.admin_visible_email(uuid,text) from public,anon,authenticated;
grant execute on function public.admin_visible_email(uuid,text) to service_role;

create or replace function public.admin_list_users(
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
      public.admin_visible_email(p_actor, u.email) as email_masked,
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

create or replace function public.admin_user_detail(p_actor uuid, p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_result jsonb;
begin
  perform public.admin_assert_capability(p_actor, 'users.read');
  select jsonb_build_object(
    'user_id', u.id,
    'name', coalesce(p.name, '新玩家'),
    'avatar', coalesce(p.avatar, 'cat'),
    'email_masked', public.admin_visible_email(p_actor, u.email),
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
            'email_masked', public.admin_visible_email(p_actor, mu.email),
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
        'token', case when 'data.read'=any(public.admin_capabilities((select role from public.admin_members where user_id=p_actor and status='active'))) then d.token else null end,
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

create or replace function public.admin_list_couples(
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
          'email_masked', public.admin_visible_email(p_actor, u.email)
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

create or replace function public.admin_couple_detail(
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
        'email_masked', public.admin_visible_email(p_actor, u.email),
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

create or replace function public.admin_list_tickets(
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
      public.admin_visible_email(p_actor, u.email) as email_masked,
      t.category, t.status, t.created_at, t.updated_at, t.resolved_at,
      t.assigned_admin_id, a.display_name as assignee_name,
      t.description as excerpt,
      case when t.status = 'resolved' then null
        when msg.admin_at is null then t.created_at
        else unanswered.first_at end as waiting_since,
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
    left join lateral (
      select min(created_at) as first_at
      from public.support_ticket_messages
      where ticket_id = t.id and author_type = 'user' and created_at > msg.admin_at
    ) unanswered on true
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

create or replace function public.admin_ticket_detail(p_actor uuid, p_ticket_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_result jsonb;
begin
  perform public.admin_assert_capability(p_actor, 'tickets.read');
  select jsonb_build_object(
    'id', t.id, 'ticket_no', t.ticket_no, 'user_id', t.user_id,
    'user_name', coalesce(p.name, '已注销用户'),
    'email_masked', public.admin_visible_email(p_actor, u.email),
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

create or replace function public.admin_list_members(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_rows jsonb;
begin
  perform public.admin_assert_capability(p_actor, 'admins.manage');
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', a.user_id, 'role', a.role, 'status', a.status,
    'display_name', a.display_name, 'created_at', a.created_at,
    'last_seen_at', a.last_seen_at,
    'email_masked', public.admin_visible_email(p_actor, u.email)
  ) order by a.created_at), '[]'::jsonb) into v_rows
  from public.admin_members a
  left join auth.users u on u.id = a.user_id;
  return jsonb_build_object('rows', v_rows);
end;
$fn$;

create or replace function public.admin_upsert_member(
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

create or replace function public.admin_overview(p_actor uuid, p_from date, p_to date) returns jsonb
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

create function public.admin_read_records(
  p_actor uuid, p_entity text, p_couple_id uuid default null, p_user_id uuid default null,
  p_query text default '', p_page integer default 1, p_page_size integer default 20,
  p_request_id text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_result jsonb;
  v_size int := least(greatest(coalesce(p_page_size,20),1),50);
  v_page int := greatest(coalesce(p_page,1),1);
begin
  perform public.admin_assert_capability(p_actor,'data.read');
  if p_entity is null or p_entity <> all(array['profiles','couples','couple_members','messages','pings','photos','events','daily_tasks','daily_task_completions','focus_sessions']) then
    raise exception '业务数据类型无效' using errcode='22023';
  end if;
  if char_length(coalesce(p_query,'')) > 100 then raise exception '搜索内容过长' using errcode='22023'; end if;
  execute format($q$
    with source as (select to_jsonb(t) as record from public.%I t), filtered as (
      select record from source where
        ($1 is null or record->>'couple_id'=$1::text or ($6='couples' and record->>'id'=$1::text))
        and ($2 is null or coalesce(record->>'sender_id',record->>'uploaded_by',record->>'user_id',record->>'created_by',case when $6='profiles' then record->>'id' end)=$2::text
          or ($6='couples' and exists(select 1 from public.couple_members m where m.couple_id::text=record->>'id' and m.user_id=$2)))
        and ($3='' or position(lower($3) in lower(record::text))>0)
    ), paged as (
      select record from filtered order by coalesce(record->>'created_at',record->>'completed_at',record->>'task_date',record->>'target_at',record->>'ends_at','') desc,
        coalesce(record->>'id',record->>'user_id') desc limit $4 offset $5
    ) select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(record) from paged),'[]'::jsonb))
  $q$,p_entity) into v_result using p_couple_id,p_user_id,btrim(coalesce(p_query,'')),v_size,(v_page-1)*v_size,p_entity;
  perform public.admin_audit_insert(coalesce(p_request_id,'data-read'),p_actor,'data.read',p_entity,coalesce(p_couple_id::text,p_user_id::text,'all'),'查看完整业务记录',true,null,
    jsonb_build_object('page',v_page,'page_size',v_size,'returned',jsonb_array_length(v_result->'rows')));
  return v_result || jsonb_build_object('page',v_page,'page_size',v_size,'entity',p_entity);
end;
$fn$;
revoke all on function public.admin_read_records(uuid,text,uuid,uuid,text,integer,integer,text) from public,anon,authenticated;
grant execute on function public.admin_read_records(uuid,text,uuid,uuid,text,integer,integer,text) to service_role;

create function public.admin_photo_path(p_actor uuid,p_photo_id uuid,p_request_id text default null) returns text
language plpgsql security definer set search_path = '' as $fn$
declare v_path text;
begin
  perform public.admin_assert_capability(p_actor,'data.read');
  select path into v_path from public.photos where id=p_photo_id;
  if v_path is null then return null; end if;
  perform public.admin_audit_insert(coalesce(p_request_id,'photo-read'),p_actor,'data.photo.read','photo',p_photo_id::text,'查看照片原图',true,null,'{}'::jsonb);
  return v_path;
end;
$fn$;
revoke all on function public.admin_photo_path(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_photo_path(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
