-- Hackathon eligibility is evaluated later; discovery should not require a role keyword in its title.
begin;
create or replace function public.profile_domain_matches(p_title text,p_type text,p_skills text[],p_branch text,p_profile_skills text[] default '{}') returns boolean
language plpgsql immutable set search_path='' as $$
declare b text:=lower(coalesce(p_branch,'')); t text:=lower(coalesce(p_title,'')||' '||array_to_string(coalesce(p_skills,'{}'),' ')); pattern text;
begin
 if p_type='hackathon' or b='' then return true; end if;
 pattern:=case
 when b ~ '(computer|software|cse|information technology|data science|artificial intelligence|machine learning)' then '(software|developer|programming|data |data$|machine learning|artificial intelligence|cyber|devops|cloud|frontend|backend|full.?stack|web |mobile|android|ios|python|javascript|sql|coding|sde|swe)'
 when b ~ '(mechanical|automobile|aerospace)' then '(mechanical|automotive|automobile|manufacturing|cad|solidworks|aerospace|robotics|thermal|design engineer)'
 when b ~ '(electrical|electronics|ece|eee)' then '(electrical|electronics|embedded|hardware|circuit|vlsi|semiconductor|robotics|iot|firmware)'
 when b ~ '(civil|architecture)' then '(civil|construction|structural|architecture|autocad|urban|building)'
 when b ~ '(commerce|finance|account)' then '(finance|financial|account|audit|tax|investment|banking|commerce)'
 when b ~ '(business|management|marketing|mba)' then '(business|marketing|sales|management|operations|human resources|recruit|product|strategy)'
 when b ~ '(design|fine arts)' then '(design|creative|graphic|illustrat|animation|ux|ui|figma)'
 when b ~ '(law|legal)' then '(legal|law|compliance|counsel|paralegal|regulatory)'
 when b ~ '(medical|nursing|pharmacy|health)' then '(medical|clinical|health|pharma|nursing|hospital)'
 when b ~ '(biology|biotech|life science)' then '(biology|biotech|laboratory|bioinformatics|genetic|microbio|life science)'
 else null end;
 if pattern is null then return true; end if;
 return t ~ pattern or exists(select 1 from unnest(coalesce(p_profile_skills,'{}')) s where length(trim(s))>=3 and position(lower(trim(s)) in t)>0);
end $$;
revoke all on function public.profile_domain_matches(text,text,text[],text,text[]) from public,anon;
grant execute on function public.profile_domain_matches(text,text,text[],text,text[]) to authenticated,service_role;
select opportunityos_private.backfill_profile_catalog(p.user_id)
from public.profiles p join auth.users a on a.id=p.user_id
where a.created_at>=now()-interval '7 days' and 'hackathon'=any(p.interest_types);
commit;
