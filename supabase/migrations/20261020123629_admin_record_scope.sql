-- Keep user/space context when switching business record types.
begin;

create or replace function public.admin_read_records(
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
        ($1 is null or record->>'couple_id'=$1::text or ($6='couples' and record->>'id'=$1::text)
          or ($6='profiles' and exists(select 1 from public.couple_members m where m.user_id::text=record->>'id' and m.couple_id=$1)))
        and ($2 is null or coalesce(record->>'sender_id',record->>'uploaded_by',record->>'user_id',record->>'created_by',case when $6='profiles' then record->>'id' end)=$2::text
          or ($6 in ('couples','daily_tasks') and exists(select 1 from public.couple_members m where m.couple_id::text=case when $6='couples' then record->>'id' else record->>'couple_id' end and m.user_id=$2)))
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
notify pgrst,'reload schema';
commit;
