-- Migration 0026: Connect finish_evaluation with Standing Rules & policy-v2
begin;

create or replace function public.finish_evaluation(
  p_id uuid,
  p_token uuid,
  p_revision bigint,
  p_day date,
  p_result jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  m public.matches%rowtype;
  v_final_decision text;
  v_rule_res jsonb;
begin
  select * into m from public.matches where id=p_id and status='processing' and claim_token=p_token and revision=p_revision and claimed_until>now() for update;
  if not found then return jsonb_build_object('saved',false,'reason','stale');end if;
  if p_day<>(now() at time zone 'Asia/Kolkata')::date then
    update public.matches set status='queued',claim_token=null,claimed_until=null,next_attempt_at=now(),updated_at=now() where id=m.id;
    return jsonb_build_object('saved',false,'reason','day_changed');
  end if;
  if p_result->>'decision' is null or p_result->>'decision' not in ('ACT','ASK','IGNORE') or p_result->>'eligibility_status' is null or p_result->>'eligibility_status' not in ('ELIGIBLE','INELIGIBLE','UNKNOWN') or p_result->>'policy_version' not in ('decision-v1','decision-v2') then
    raise exception 'Invalid decision';
  end if;
  if (p_result->>'decision'='ACT' and (p_result->>'eligibility_status'<>'ELIGIBLE' or (p_result->>'expired')::boolean or p_result->'match_score'='null'::jsonb or p_result->'confidence'='null'::jsonb)) or (p_result->>'eligibility_status'='UNKNOWN' and p_result->>'decision'<>'ASK' and not (p_result->>'expired')::boolean) then
    raise exception 'Eligibility gate bypass';
  end if;

  v_final_decision := p_result->>'decision';

  update public.matches set
    status='complete',
    eligibility_status=p_result->>'eligibility_status',
    eligibility_checks=p_result->'eligibility_checks',
    component_scores=p_result->'component_scores',
    match_score=(p_result->>'match_score')::numeric,
    confidence=(p_result->>'confidence')::numeric,
    confidence_inputs=p_result->'confidence_inputs',
    decision=v_final_decision,
    reason_codes=array(select jsonb_array_elements_text(p_result->'reason_codes')),
    explanation=p_result->>'explanation',
    semantic_evidence=p_result->'semantic_evidence',
    mode=p_result->>'mode',
    policy_version=p_result->>'policy_version',
    match_version=p_result->>'match_version',
    evaluation_day=p_day,
    decided_at=now(),
    claim_token=null,
    claimed_until=null,
    error_code=null,
    updated_at=now()
  where id=m.id;

  insert into public.events(user_id,stage,level,message,metadata)
  values(m.user_id,'decide','info','Decision: '||v_final_decision,jsonb_build_object('opportunity_id',m.opportunity_id,'match_id',m.id,'decision',v_final_decision,'eligibility',p_result->>'eligibility_status','score',p_result->'match_score','policy_version',p_result->>'policy_version'));

  -- Check if an active standing rule applies to upgrade ASK -> ACT (or IGNORE)
  if v_final_decision = 'ASK' then
    v_rule_res := public.apply_standing_rule_to_match(m.id);
    if (v_rule_res->>'applied')::boolean then
      v_final_decision := v_rule_res->>'decision';
    end if;
  end if;

  return jsonb_build_object('saved',true,'decision',v_final_decision,'match_id',m.id);
end; $$;

grant execute on function public.finish_evaluation(uuid, uuid, bigint, date, jsonb) to service_role;

commit;
