-- Migration 0069: Add proposed_projects and proposed_experience_years to profile_drafts
-- Resolves PostgREST schema cache and upload route insert requirements for projects & experience years.

begin;

alter table public.profile_drafts
  add column if not exists proposed_projects jsonb default '[]'::jsonb,
  add column if not exists proposed_experience_years numeric;

notify pgrst, 'reload schema';

commit;
