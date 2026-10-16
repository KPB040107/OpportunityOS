-- Consolidate repeated seed rows without removing catalog items or run history.
-- Keep the validated Devpost registry active, and pause job-heavy demo sources.
begin;

do $$
begin
  if exists (
    select 1 from opportunityos_private.discovery_runs
    where status = 'running' and claimed_until > now()
  ) then
    raise exception 'Discovery scan is running; retry this migration after it finishes';
  end if;
end $$;

create temporary table discovery_registry_merge on commit drop as
select id,
       first_value(id) over (
         partition by adapter, config
         order by (last_successful_scan is not null) desc,
                  last_successful_scan desc nulls last,
                  item_count desc,
                  created_at asc,
                  id
       ) as keep_id
from opportunityos_private.source_registry;

update opportunityos_private.catalog_opportunities c
set source_id = m.keep_id
from discovery_registry_merge m
where c.source_id = m.id and m.id <> m.keep_id;

update opportunityos_private.discovery_runs r
set source_id = m.keep_id
from discovery_registry_merge m
where r.source_id = m.id and m.id <> m.keep_id;

update opportunityos_private.source_registry keep
set last_successful_scan = merged.last_scan,
    next_attempt = least(keep.next_attempt, merged.next_attempt),
    item_count = merged.catalog_count,
    error_count = merged.error_count,
    updated_at = now()
from (
  select m.keep_id,
         max(s.last_successful_scan) as last_scan,
         min(s.next_attempt) as next_attempt,
         sum(s.error_count)::int as error_count,
         (select count(*)::int
          from opportunityos_private.catalog_opportunities c
          where c.source_id = m.keep_id) as catalog_count
  from discovery_registry_merge m
  join opportunityos_private.source_registry s on s.id = m.id
  group by m.keep_id
) merged
where keep.id = merged.keep_id;

delete from opportunityos_private.source_registry s
using discovery_registry_merge m
where s.id = m.id and m.id <> m.keep_id;

create unique index if not exists discovery_registry_adapter_config_unique
  on opportunityos_private.source_registry (adapter, (config::text));

update opportunityos_private.source_registry
set status = 'paused', updated_at = now()
where adapter = 'lever-v1' and config->>'company' in ('cred', 'meesho');

update opportunityos_private.source_registry
set status = 'active',
    trust_tier = 'attributed',
    source_badge = 'Devpost',
    next_attempt = now(),
    last_error = null,
    updated_at = now()
where adapter = 'devpost-v1'
  and config->>'url' = 'https://devpost.com/api/hackathons';

commit;
