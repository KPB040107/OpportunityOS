-- Keep the channel stable before the unique-request retry comparison.
begin;
create or replace function public.ingest_raw_item(p_user_id uuid,p_request_id uuid,p_source_type text,p_content text)
returns table(raw_item_id uuid,processing_status text,was_created boolean)
language plpgsql set search_path = '' as $$
declare v_id uuid; v_existing public.raw_items%rowtype;
begin
  if p_user_id is null or p_request_id is null then raise exception 'Identifiers required'; end if;
  if p_source_type not in ('text','url','email') or p_source_type is null
    or p_content is null or length(trim(p_content)) not between 1 and 20000 then raise exception 'Invalid intake'; end if;
  insert into public.raw_items(user_id,request_id,source_type,raw_content)
    values(p_user_id,p_request_id,p_source_type,p_content)
    on conflict(user_id,request_id) do nothing returning id into v_id;
  if v_id is not null then
    insert into public.events(user_id,stage,level,message,metadata)
      values(p_user_id,'ingest','info','Opportunity saved',jsonb_build_object('raw_item_id',v_id,'source_type',p_source_type));
    return query select v_id,'queued'::text,true;
  else
    select * into strict v_existing from public.raw_items where user_id=p_user_id and request_id=p_request_id;
    if v_existing.raw_content <> p_content or v_existing.source_type <> p_source_type then
      raise exception 'Request identifier already used for different content';
    end if;
    return query select v_existing.id,v_existing.status,false;
  end if;
end;
$$;
revoke all on function public.ingest_raw_item(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.ingest_raw_item(uuid,uuid,text,text) to service_role;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='events') then
    alter publication supabase_realtime add table public.events;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='raw_items') then
    alter publication supabase_realtime add table public.raw_items;
  end if;
end; $$;
create or replace function public.worker_ingest_email(p_alias text,p_request uuid,p_text text) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid;r record;
begin
 if p_alias !~ '^[a-f0-9]{32}$' or length(p_text)>20000 or length(p_text)<1 then return jsonb_build_object('accepted',false);end if;
 select user_id into owner_id from public.profiles where email_alias_token=p_alias;if not found then return jsonb_build_object('accepted',false);end if;
 select * into r from public.ingest_raw_item(owner_id,p_request,'email',p_text);
 update public.raw_items set source_type='email' where id=r.raw_item_id and user_id=owner_id;
 return jsonb_build_object('accepted',true,'raw_item_id',r.raw_item_id,'was_created',r.was_created);
end; $$;

commit;
