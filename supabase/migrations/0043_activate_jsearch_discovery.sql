-- Migration 0043: Activate JSearch India Internships in source registry
begin;

update opportunityos_private.source_registry
set status = 'active',
    trust_tier = 'attributed',
    source_badge = 'JSearch India',
    next_attempt = now(),
    last_error = null,
    updated_at = now()
where adapter = 'jsearch-v1';

commit;
