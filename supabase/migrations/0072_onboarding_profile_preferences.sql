-- Migration 0072: Enable profile update and onboarding preferences RPC for authenticated students

grant update on public.profiles to authenticated;

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function public.save_onboarding_preferences(
  p_email_alerts boolean,
  p_calendar_sync boolean,
  p_autonomy_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_mode text;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'UNAUTHORIZED');
  end if;

  if p_autonomy_mode not in ('cautious', 'balanced', 'autopilot') then
    v_mode := 'balanced';
  else
    v_mode := p_autonomy_mode;
  end if;

  update public.profiles
  set email_notifications_enabled = coalesce(p_email_alerts, false),
      calendar_sync_enabled = coalesce(p_calendar_sync, false),
      autonomy_mode = v_mode,
      consent_recorded_at = now(),
      updated_at = now()
  where user_id = v_uid;

  insert into public.events(user_id, stage, level, message, metadata)
  values(
    v_uid,
    'onboarding',
    'info',
    'Student completed onboarding preferences',
    jsonb_build_object(
      'email_alerts', p_email_alerts,
      'calendar_sync', p_calendar_sync,
      'autonomy_mode', v_mode
    )
  );

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.save_onboarding_preferences(boolean, boolean, text) to authenticated;
