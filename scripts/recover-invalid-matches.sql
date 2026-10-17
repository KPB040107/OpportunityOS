-- Safe recovery script to reset failed matches caused by INVALID_MATCH and backfill missing requirements.
begin;

-- 1. Insert missing requirements for any opportunities created from catalog
insert into public.opportunity_requirements(user_id, opportunity_id, kind, value, mandatory, evidence_snippet)
select
  o.user_id,
  o.id,
  req->>'kind',
  req->>'value',
  coalesce((req->>'mandatory')::boolean, false),
  req->>'evidence'
from public.opportunities o
join opportunityos_private.catalog_opportunities cat on cat.id = o.catalog_id
cross join lateral jsonb_array_elements(coalesce(cat.structured_fields->'requirements', '[]'::jsonb)) req
where length(coalesce(req->>'evidence', '')) > 0
  and position(req->>'evidence' in coalesce(cat.raw_text, '')) > 0
  and not exists (
    select 1 from public.opportunity_requirements r
    where r.user_id = o.user_id
      and r.opportunity_id = o.id
      and r.kind = req->>'kind'
      and r.value = req->>'value'
  );

-- 2. Clear failed match_cache entries poisoned by INVALID_MATCH
delete from public.match_cache
where error_code = 'INVALID_MATCH';

-- 3. Reset failed matches caused by INVALID_MATCH to queued for clean re-evaluation
update public.matches
set status = 'queued',
    decision = null,
    error_code = null,
    claim_token = null,
    claimed_until = null,
    next_attempt_at = now(),
    revision = revision + 1,
    updated_at = now()
where status = 'failed' and error_code = 'INVALID_MATCH';

commit;
