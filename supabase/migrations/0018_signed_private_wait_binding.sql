-- Match the installed n8n signed Wait URL, bind its exact execution ID and allow only the internal origin.
begin;
create or replace function public.worker_create_approval(p_match uuid,p_execution text,p_resume text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb;m public.matches%rowtype;o public.opportunities%rowtype;a public.approvals%rowtype;expiry timestamptz;
begin
 if p_execution is null or p_execution !~ '^[0-9]+$' or p_resume is null or p_resume !~ ('^http://localhost:5678/webhook-waiting/'||p_execution||'/?([?]signature=[a-f0-9]{64})?$') then raise exception 'Invalid execution binding';end if;
 select * into m from public.matches where id=p_match and status='complete' and decision='ASK' for update;if not found then return jsonb_build_object('created',false);end if;
 select * into o from public.opportunities where id=m.opportunity_id and user_id=m.user_id;
 expiry:=least(now()+interval '48 hours',coalesce(o.deadline::timestamp at time zone 'Asia/Kolkata',now()+interval '48 hours'));
 if expiry<=now() then return jsonb_build_object('created',false);end if;
 update public.approvals set status='stale',resume_status='stale' where match_id=m.id and match_revision<>m.revision and status='pending';
 insert into public.approvals(user_id,match_id,reason,missing_info,match_revision,expires_at,requires_information,resume_status) values(m.user_id,m.id,m.explanation,m.reason_codes,m.revision,expiry,m.eligibility_status<>'ELIGIBLE','waiting') on conflict(user_id,match_id,match_revision) do nothing returning * into a;
 if a.id is null then return jsonb_build_object('created',false);end if;
 insert into opportunityos_private.approval_execution(approval_id,execution_id,resume_url) values(a.id,p_execution,p_resume);
 c:=public.worker_match_context(m.id,p_execution,'05-ask');
 perform public.worker_queue_action(m.id,'approval_notification',jsonb_build_object('approval_id',a.id,'expires_at',expiry,'requires_information',a.requires_information),'approval-'||a.id::text);
 insert into public.events(user_id,stage,level,message,metadata) values(m.user_id,'ask','info','Review requested; execution will wait',jsonb_build_object('approval_id',a.id,'match_id',m.id));
 return c||jsonb_build_object('created',true,'approval_id',a.id,'expires_at',expiry);
end; $$;

commit;
