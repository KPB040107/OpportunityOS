-- Filter and rank the full owned catalog before pagination, not the visible page.
begin;
create or replace function public.get_opportunities_page(p_filters jsonb default '{}',p_limit int default 20,p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); result jsonb;
begin
 if uid is null then raise exception 'Unauthorized'; end if;
 with filtered as (
 select o.id,o.title,o.organization,o.type,o.location,o.deadline,o.application_url,o.skills,o.ambiguity_flags,o.trust_tier,o.source_badge,o.risk_signals,o.seniority_level,o.created_at,
 coalesce(i.is_saved,false) is_saved,coalesce(i.is_hidden,false) is_hidden,
 case when m.id is not null then jsonb_build_object('id',m.id,'decision',m.decision,'eligibility_status',m.eligibility_status,'match_score',m.match_score,'confidence',m.confidence,'explanation',m.explanation,'reason_codes',m.reason_codes) end as match,
 row_number() over(partition by lower(o.organization) order by m.match_score desc nulls last,o.created_at desc,o.id) employer_rank,
 m.match_score sort_score
 from public.opportunities o
 left join public.profiles p on p.user_id=uid
 left join public.matches m on m.opportunity_id=o.id and m.user_id=uid
 left join public.user_opportunity_interactions i on i.opportunity_id=o.id and i.user_id=uid
 left join public.user_source_preferences s on s.user_id=uid and s.source_identifier=lower(o.organization)
 where o.user_id=uid
 and (p_filters->>'hidden'='true' or not coalesce(i.is_hidden,false))
 and (coalesce(p_filters->>'saved','false')<>'true' or coalesce(i.is_saved,false))
 and (coalesce(p_filters->>'employer','all')<>'all' or coalesce(s.preference,'normal')<>'muted')
 and (coalesce(p_filters->>'type','all')='all' or o.type=p_filters->>'type')
 and (coalesce(p_filters->>'employer','all')='all' or lower(o.organization)=lower(p_filters->>'employer'))
 and (coalesce(p_filters->>'eligibility','all')='all' or coalesce(m.eligibility_status,'UNKNOWN')=p_filters->>'eligibility')
 and (coalesce(p_filters->>'decision','all')='all' or m.decision=p_filters->>'decision')
 and (coalesce(p_filters->>'trust','all')='all' or o.trust_tier=lower(p_filters->>'trust'))
 and (coalesce(p_filters->>'deadline','all')='all' or (p_filters->>'deadline'='unknown' and o.deadline is null) or (p_filters->>'deadline'='upcoming' and o.deadline>=current_date))
 and (coalesce(p_filters->>'location','all')='all' or (p_filters->>'location'='remote' and o.location ilike '%remote%') or (p_filters->>'location'='onsite' and o.location not ilike '%remote%'))
 and (coalesce(trim(p_filters->>'q'),'')='' or position(lower(trim(p_filters->>'q')) in lower(concat_ws(' ',o.title,o.organization,o.location,array_to_string(o.skills,' '))))>0)
 and (p_filters->>'field'='all' or public.profile_domain_matches(o.title,o.type,o.skills,p.branch,null))
 and (coalesce(p_filters->>'view','best')='all' or o.catalog_id is null or p.interest_types is null or cardinality(p.interest_types)=0 or o.type=any(p.interest_types))
 ), page as (
 select * from filtered
 order by case when coalesce(p_filters->>'view','best')='best' and coalesce(p_filters->>'employer','all')='all' and employer_rank>3 then 1 else 0 end,
 case when coalesce(p_filters->>'view','best')='best' then sort_score end desc nulls last,
 created_at desc,id
 limit greatest(1,least(coalesce(p_limit,20),50)) offset greatest(0,coalesce(p_offset,0))
 )
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page)-'employer_rank'-'sort_score') from page),'[]'::jsonb),
 'total',(select count(*) from filtered),
 'employers',(select coalesce(jsonb_agg(name order by name),'[]'::jsonb) from (select distinct organization name from public.opportunities where user_id=uid and organization is not null) names)) into result;
 return result;
end $$;
revoke all on function public.get_opportunities_page(jsonb,int,int) from public,anon;
grant execute on function public.get_opportunities_page(jsonb,int,int) to authenticated;
commit;
