import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {createUnderstandContract} from './understand-contract.mjs';
const pack=JSON.parse(readFileSync(new URL('../testdata/slice3-fixtures.json',import.meta.url),'utf8'));
const understand=createUnderstandContract({URL,hash:v=>createHash('sha256').update(v).digest('hex')});
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
// Seed source/extraction test doubles only. The real evaluation workflow computes
// decisions for one common fictional profile; fixture expectations are never copied.
export function generateDemoPackSql(targetUserId,targetEmail){
 const userId=targetUserId||randomUUID(),email=targetEmail||`demo-pack-${userId}@example.invalid`;
 if(email!==`demo-pack-${userId}@example.invalid`)throw new Error('Demo seeds require a dedicated fictional account; human profiles cannot be overwritten.');
 const p=pack.fixtures[0].input.profile;const fixtures=[];
 for(const [index,f] of pack.fixtures.entries()){
  if(!f.input){const raw='DEMO DATA — extraction test double. '+f.raw;fixtures.push({name:f.name,raw,result:understand.validate({is_opportunity:false,items:[]},raw)});continue;}
  const o=f.input.opportunity,title=o.title?`DEMO ${index+1}: ${o.title.replace(/^DEMO\s*/,'')}`:null,requirements=f.input.requirements.map(r=>({kind:r.kind,value:r.kind==='cgpa'&&r.normalized_value?.minimum!==undefined?String(r.normalized_value.minimum):r.value,mandatory:r.mandatory,evidence:r.evidence_snippet}));
  const fields={title,organization:o.organization||null,deadline:o.deadline||null,location:o.location||null,type:o.type,application_url:o.application_url||null,description:o.description||null};
  const evidence=Object.entries(fields).filter(([k,v])=>v&&k!=='deadline').map(([field,value])=>({field,quote:field==='type'?'Opportunity type: '+value:value}));
  if(fields.deadline)evidence.push({field:'deadline',quote:'Apply by '+fields.deadline});
  if(o.skills?.length)evidence.push({field:'skills',quote:o.skills.join(', ')});
  const raw=['DEMO DATA — fictional source and extraction test double; matching will run live.',f.name,...evidence.map(e=>e.quote),...requirements.map(r=>r.evidence+' Required value: '+r.value),f.raw||''].join('\n');
  const result=understand.validate({is_opportunity:true,items:[{...fields,requirements,skills:o.skills||[],confidence:o.extraction_confidence??.9,ambiguity_flags:o.ambiguity_flags||[],evidence}]},raw);
  fixtures.push({name:f.name,raw,result});
 }
 let sql=`begin;\ndo $$ begin if exists(select 1 from auth.users where id=${quote(userId)}::uuid or email=${quote(email)}) then raise exception 'Demo account must be new';end if;end;$$;\ninsert into auth.users(id,email) values(${quote(userId)}::uuid,${quote(email)});\ninsert into public.profiles(user_id,degree,branch,academic_year,graduation_year,cgpa,career_goals,interest_types,preferred_locations,autonomy_mode,notifications_enabled) values(${quote(userId)}::uuid,'B.Tech','Computer Science',3,2028,8.2,${quote(p.career_goals)},array['internship','hackathon'],array['remote'],'balanced',false);\n`;
 for(const skill of p.skills)sql+=`insert into public.skills(name,canonical_name) values(${quote(skill.name)},${quote(skill.name)}) on conflict(canonical_name) do nothing;insert into public.profile_skills(user_id,skill_id,level) select ${quote(userId)}::uuid,id,${quote(skill.level)} from public.skills where canonical_name=${quote(skill.name)};\n`;
 for(const f of fixtures)sql+=`do $$ declare raw_id uuid;c jsonb;begin select raw_item_id into raw_id from public.ingest_raw_item(${quote(userId)}::uuid,gen_random_uuid(),'text',${quote(f.raw)});c:=public.claim_understand_item(raw_id);perform public.register_understand_content(raw_id,(c->>'claim_token')::uuid,${quote(understand.contentHash(f.raw))},${quote(f.raw)},null,null);perform public.finish_understand_item(raw_id,(c->>'claim_token')::uuid,${quote(JSON.stringify(f.result))}::jsonb);end;$$;\n`;
 sql+=`commit;select jsonb_build_object('user_id',${quote(userId)},'sources_seeded',15,'decisions_seeded',0,'external_effects_seeded',0,'note','Fictional extraction test doubles; live evaluation uses the common demo profile and may differ from per-case unit expectations') as demo_summary;\n`;
 return {sql,userId,email,fixtures};
}
if(process.argv[1]?.endsWith('seed-demo-pack.mjs')){const r=generateDemoPackSql();writeFileSync(new URL('../.local/demo-pack-seed.sql',import.meta.url),r.sql);writeFileSync(new URL('../.local/demo-pack-account.json',import.meta.url),JSON.stringify({userId:r.userId,email:r.email}));console.log('Prepared 15 labelled, validated fictional sources with provenance; no decisions, actions or healthy heartbeat fabricated. Applying the SQL queues live matching and uses AI quota.');}
