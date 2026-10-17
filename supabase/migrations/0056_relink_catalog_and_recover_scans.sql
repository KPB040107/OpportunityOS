-- Preserve historical runs while routing existing catalog entries to canonical active sources.
begin;
update opportunityos_private.catalog_opportunities c
set source_id=s.superseded_by,updated_at=now()
from opportunityos_private.source_registry s
where c.source_id=s.id and s.superseded_by is not null;

with expired as (
 update opportunityos_private.discovery_runs
 set status='error',error_message='DISCOVERY_LEASE_EXPIRED',completed_at=now()
 where status='running' and claimed_until<now()
 returning source_id
)
update opportunityos_private.source_registry s
set last_error='DISCOVERY_LEASE_EXPIRED',error_count=s.error_count+1,next_attempt=now(),updated_at=now()
where s.id in (select source_id from expired) and s.status='active' and s.superseded_by is null;

select opportunityos_private.backfill_profile_catalog(p.user_id)
from public.profiles p join auth.users a on a.id=p.user_id
where a.created_at>=now()-interval '7 days' and 'hackathon'=any(p.interest_types);
commit;
