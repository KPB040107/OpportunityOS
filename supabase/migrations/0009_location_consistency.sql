-- Historical extraction versions may lack normalized_location; compare aliases consistently.
begin;
create function public.material_location(p_value text) returns text language sql immutable set search_path='' as $$ select case lower(trim(p_value)) when 'bangalore' then 'bengaluru' when 'bombay' then 'mumbai' else lower(trim(p_value)) end; $$;
revoke all on function public.material_location(text) from public,anon,authenticated;
grant execute on function public.material_location(text) to service_role;
create or replace function public.opportunity_material(p_item jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('title',lower(p_item->>'title'),'organization',lower(p_item->>'organization'),'deadline',p_item->'deadline','location',public.material_location(coalesce(p_item->>'normalized_location',p_item->>'location')),'type',p_item->'type','application_url',p_item->'application_url','skills',(select coalesce(jsonb_agg(v order by v),'[]') from jsonb_array_elements_text(coalesce(p_item->'skills','[]')) v),'requirements',(select coalesce(jsonb_agg(v order by v::text),'[]') from (select jsonb_build_object('kind',r->'kind','value',case when r->'normalized_value' is null or r->'normalized_value'='null'::jsonb then to_jsonb(lower(r->>'value')) else r->'normalized_value' end,'experience',case when r->>'evidence' ~* 'experience|years? of|months? of' then regexp_replace(lower(r->>'evidence'),'\s+',' ','g') else null end) v from jsonb_array_elements(coalesce(p_item->'requirements','[]')) r where (r->>'mandatory')::boolean) q));
$$;
update public.opportunities o set ambiguity_flags=array(select f from unnest(o.ambiguity_flags) f where f<>'source_variation') || case when exists(select 1 from public.opportunity_sources s where s.user_id=o.user_id and s.opportunity_id=o.id and public.opportunity_material(s.extracted_json)<>public.opportunity_material(o.extracted_json)) then array['source_variation'] else '{}'::text[] end;
commit;
