-- Preserve the start of an unanswered conversation when users add more information.
begin;

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
      case
        when u.email is null then null
        when u.email like '%@auth.bibu.space' or u.email like '%@login.bibu.space' then '微信账号'
        else left(u.email, 1) || '***@' || split_part(u.email, '@', 2)
      end as email_masked,
      t.category, t.status, t.created_at, t.updated_at, t.resolved_at,
      t.assigned_admin_id, a.display_name as assignee_name,
      left(t.description, 100) as excerpt,
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

notify pgrst, 'reload schema';
commit;
