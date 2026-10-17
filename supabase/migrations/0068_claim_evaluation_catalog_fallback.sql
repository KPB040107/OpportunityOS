-- 0068_claim_evaluation_catalog_fallback.sql
-- Ensure claim_evaluation automatically populates opportunity_requirements from catalog_opportunities
-- if the user's opportunity lacks requirement rows at evaluation claim time.

begin;

create or replace function public.claim_evaluation(p_id uuid default null) returns jsonb language plpgsql set search_path='' as $$
declare
  m public.matches%rowtype;
  data jsonb;
  stale public.matches%rowtype;
  today date:=(now() at time zone 'Asia/Kolkata')::date;
begin
  for stale in select * from public.matches where status='processing' and claimed_until<now() for update skip locked loop
    update public.matches set status='failed',error_code='EVALUATION_INTERRUPTED',claim_token=null,claimed_until=null,updated_at=now() where id=stale.id;
    update public.match_cache set status='failed',error_code='EVALUATION_INTERRUPTED' where user_id=stale.user_id and claim_token=stale.claim_token and status='running';
    insert into public.events(user_id,stage,level,message,metadata) values(stale.user_id,'decide','error','Opportunity evaluation was interrupted',jsonb_build_object('match_id',stale.id));
  end loop;

  select * into m from public.matches where ((status='queued' and next_attempt_at<=now()) or (status='complete' and evaluation_day<today)) and (p_id is null or opportunity_id=p_id) order by next_attempt_at,id limit 1 for update skip locked;
  if not found then return jsonb_build_object('claimed',false);end if;

  -- Resilient self-healing fallback: populate opportunity_requirements from catalog if empty
  if not exists (select 1 from public.opportunity_requirements r where r.user_id=m.user_id and r.opportunity_id=m.opportunity_id) then
    insert into public.opportunity_requirements(
      user_id, opportunity_id, kind, value, mandatory, evidence_snippet, requirement_class, quote, status
    )
    select
      m.user_id,
      m.opportunity_id,
      case
        when req->>'kind' in ('cgpa', 'academic_year', 'graduation_year', 'branch', 'degree', 'location', 'skill', 'other')
        then req->>'kind'
        else 'other'
      end,
      coalesce(req->>'value', req->>'quote', req->>'evidence'),
      coalesce((req->>'mandatory')::boolean, false),
      coalesce(req->>'evidence_snippet', req->>'quote', req->>'evidence', ''),
      coalesce(req->>'requirement_class', case when coalesce((req->>'mandatory')::boolean, false) then 'mandatory_eligibility' else 'preferred_skill' end),
      coalesce(req->>'quote', req->>'evidence', ''),
      'active'
    from public.opportunities opp
    join opportunityos_private.catalog_opportunities cat on cat.id = opp.catalog_id
    cross join lateral jsonb_array_elements(coalesce(cat.structured_fields->'requirements', '[]'::jsonb)) req
    where opp.id = m.opportunity_id and opp.user_id = m.user_id
      and length(coalesce(req->>'quote', req->>'evidence', '')) > 0
      and position(lower(coalesce(req->>'quote', req->>'evidence', '')) in lower(coalesce(cat.raw_text, opp.description, ''))) > 0
    on conflict do nothing;
  end if;

  select jsonb_build_object(
    'profile', coalesce((select to_jsonb(p)-'user_id'-'display_name'-'updated_at' from public.profiles p where p.user_id=m.user_id),'{}') || jsonb_build_object('skills',coalesce((select jsonb_agg(jsonb_build_object('name',s.canonical_name,'level',ps.level) order by s.canonical_name) from public.profile_skills ps join public.skills s on s.id=ps.skill_id where ps.user_id=m.user_id),'[]')),
    'opportunity', to_jsonb(o)-'user_id',
    'requirements', coalesce((select jsonb_agg(to_jsonb(r)-'id'-'user_id'-'opportunity_id' order by r.kind,r.value) from public.opportunity_requirements r where r.user_id=m.user_id and r.opportunity_id=m.opportunity_id),'[]')
  ) into data from public.opportunities o where o.id=m.opportunity_id and o.user_id=m.user_id;

  update public.matches set status='processing',claim_token=gen_random_uuid(),claimed_until=now()+interval '10 minutes',snapshot=data,error_code=null,decision=null,decided_at=null,updated_at=now() where id=m.id returning * into m;
  return jsonb_build_object('claimed',true,'match_id',m.id,'opportunity_id',m.opportunity_id,'user_id',m.user_id,'claim_token',m.claim_token,'revision',m.revision,'evaluation_day',today,'input',data);
end; $$;

commit;
