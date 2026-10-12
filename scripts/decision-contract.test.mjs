import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createDecisionContract} from './decision-contract.mjs';
import {createUnderstandContract} from './understand-contract.mjs';
const contract=createDecisionContract({hash:s=>createHash('sha256').update(s).digest('hex')});
const pack=JSON.parse(readFileSync(new URL('../testdata/slice3-fixtures.json',import.meta.url),'utf8'));
for(const f of pack.fixtures)test(f.name,()=>{
 if(!f.input){const understand=createUnderstandContract({hash:s=>createHash('sha256').update(s).digest('hex'),URL});const result=understand.validate({is_opportunity:false,items:[]},f.raw);assert.equal(result.is_opportunity,false);assert.deepEqual(result.items,[]);return;}
 const result=contract.decide(f.input,f.match,pack.now);
 assert.equal(result.decision,f.expected);
 if(f.eligibility)assert.equal(result.eligibility_status,f.eligibility);
 if(f.expected==='ACT'){assert.equal(result.eligibility_status,'ELIGIBLE');assert.ok(result.match_score>=70);assert.ok(result.confidence>=.75);}
});
const base=pack.fixtures[0],clone=()=>structuredClone(base.input);
test('all autonomy thresholds are inclusive and exact',()=>{
 for(const [mode,[s,c]] of Object.entries(contract.thresholds)){
  const e={status:'ELIGIBLE',expired:false};
  assert.equal(contract.policy(e,s,c,mode).decision,'ACT');
  assert.equal(contract.policy(e,s-.0001,c,mode).decision,'ASK');
  assert.equal(contract.policy(e,s,c-.0001,mode).decision,'ASK');
  assert.equal(contract.policy(e,39.999,1,mode).decision,'IGNORE');
  assert.equal(contract.policy(e,40,1,mode).decision,'ASK');
  assert.equal(contract.policy({status:'UNKNOWN',expired:false},0,0,mode).decision,'ASK');
  assert.equal(contract.policy({status:'INELIGIBLE',expired:false},100,1,mode).decision,'IGNORE');
  assert.equal(contract.policy({status:'UNKNOWN',expired:true},100,1,mode).decision,'IGNORE');
 }
});
test('injection warning does not alter score confidence decision or match cache key',()=>{
 const a=clone(),b=clone();b.opportunity.ambiguity_flags=['source_contains_instructions'];
 assert.deepEqual(contract.decide(a,base.match,pack.now),contract.decide(b,base.match,pack.now));
 assert.equal(contract.matchKey(a),contract.matchKey(b));
});
test('mode and irrelevant identity edits reuse AI; real profile changes do not',()=>{
 const a=clone(),b=clone();b.profile.autonomy_mode='cautious';b.profile.display_name='New name';b.profile.user_id='forged';b.opportunity.id='other';
 assert.equal(contract.matchKey(a),contract.matchKey(b));
 b.profile.cgpa=7;assert.notEqual(contract.matchKey(a),contract.matchKey(b));
 b.profile.cgpa=a.profile.cgpa;b.profile.skills.push({name:'Rust',level:'beginner'});assert.notEqual(contract.matchKey(a),contract.matchKey(b));
 assert.ok(!JSON.stringify(contract.semanticInput(b)).includes('forged'));
});
test('forged missing extra fields and invalid numbers cannot trigger policy',()=>{
 for(const bad of [{...base.match,decision:'ACT'},{...base.match,skill_fit:NaN},{...base.match,confidence:1.1},{...base.match,evidence:[]},{...base.match,evidence:[{component:'career_alignment',opportunity_quote:'Invented announcement',profile_quote:'software'}]}])assert.throws(()=>contract.validateMatch(bad,base.input),/INVALID_MATCH/);
 const bad=structuredClone(base.match);bad.evidence[0].profile_quote='Unlisted skill';assert.throws(()=>contract.validateMatch(bad,base.input),/INVALID_MATCH/);
});
test('preferred city cannot establish mandatory residence',()=>{
 const a=clone();a.profile.preferred_locations=['Pune'];a.requirements.push({kind:'location',value:'Pune',mandatory:true,normalized_value:{name:'pune'},evidence_snippet:'Must reside in Pune.'});
 assert.equal(contract.eligibility(a,pack.now).status,'UNKNOWN');
});
test('an empty requirements list cannot establish eligibility',()=>{
 const a=clone();a.requirements=[];assert.equal(contract.eligibility(a,pack.now).status,'UNKNOWN');assert.equal(contract.decide(a,base.match,pack.now).decision,'ASK');
});
test('compound experience and unparsed requirements remain unknown',()=>{
 const a=clone();a.requirements.push({kind:'skill',value:'Python',mandatory:true,normalized_value:{name:'python'},evidence_snippet:'Minimum 5+ years programming experience including at least a year of Python.'});
 assert.equal(contract.eligibility(a,pack.now).status,'UNKNOWN');
});
test('explicit branch and degree lists pass or fail; broad descriptions stay unknown',()=>{
 const a=clone();a.requirements.push({kind:'branch',value:'Computer Science or Information Technology',mandatory:true,normalized_value:null,evidence_snippet:'Only Computer Science or Information Technology branches are eligible.'});
 assert.equal(contract.eligibility(a,pack.now).status,'ELIGIBLE');
 a.profile.branch='Mechanical Engineering';assert.equal(contract.eligibility(a,pack.now).status,'INELIGIBLE');
 a.requirements.at(-1).value='Any relevant branch';assert.equal(contract.eligibility(a,pack.now).status,'UNKNOWN');
 a.requirements.at(-1).kind='degree';a.requirements.at(-1).value='B.Tech';a.requirements.at(-1).evidence_snippet='Only B.Tech students are eligible.';assert.equal(contract.eligibility(a,pack.now).status,'ELIGIBLE');
});
test('allowed graduation lists are alternatives; unclear year ranges stay unknown',()=>{
 const a=clone();a.profile.graduation_year=2029;a.requirements[1].evidence_snippet='Only students graduating in 2028 or 2029 are eligible.';
 assert.equal(contract.eligibility(a,pack.now).status,'ELIGIBLE');
 a.requirements[1].evidence_snippet='Only students graduating in 2028–2030 are eligible.';assert.equal(contract.eligibility(a,pack.now).status,'UNKNOWN');
});
test('explicit academic year lists are alternatives and ranges remain unknown',()=>{
 const a=clone();a.requirements.push({kind:'academic_year',value:'2',mandatory:true,normalized_value:{allowed:[2]},evidence_snippet:'Only 2nd or 3rd year students are eligible.'});assert.equal(contract.eligibility(a,pack.now).status,'ELIGIBLE');
 a.requirements.at(-1).evidence_snippet='Only 2nd–4th year students are eligible.';assert.equal(contract.eligibility(a,pack.now).status,'UNKNOWN');
});
test('minimum years and equivalent degrees cannot become false exclusions',()=>{
 const a=clone();a.requirements.push({kind:'academic_year',value:'2',mandatory:true,normalized_value:{allowed:[2]},evidence_snippet:'Must be in at least academic year 2.'});assert.equal(contract.eligibility(a,pack.now).status,'UNKNOWN');
 a.requirements[a.requirements.length-1]={kind:'degree',value:'B.Tech',mandatory:true,normalized_value:null,evidence_snippet:'B.Tech or equivalent degree is required.'};a.profile.degree='B.E.';assert.equal(contract.eligibility(a,pack.now).status,'UNKNOWN');
});
test('invalid policy inputs cannot authorize actions',()=>{
 assert.throws(()=>contract.policy({status:'forged',expired:false},100,1),/INVALID_ELIGIBILITY/);
 assert.throws(()=>contract.policy({status:'ELIGIBLE',expired:false},101,1),/INVALID_SCORE/);
 assert.throws(()=>contract.policy({status:'ELIGIBLE',expired:false},100,1.1),/INVALID_SCORE/);
});
test('complete source facts cannot outweigh explicit model uncertainty in any mode',()=>{
 for(const [mode,confidence] of [['cautious',.84],['balanced',.74],['autopilot',.64]]){
  const a=clone();a.profile.autonomy_mode=mode;const r=contract.decide(a,{...base.match,confidence},pack.now);
  assert.equal(r.confidence,confidence);assert.equal(r.decision,'ASK');assert.ok(r.reason_codes.includes('LOW_CONFIDENCE'));
 }
 const r=contract.decide(base.input,{...base.match,confidence:0},pack.now);assert.equal(r.confidence,0);assert.equal(r.decision,'ASK');
});
test('midnight boundaries use Asia/Kolkata; date-only same-day cutoff is unknown',()=>{
 const a=clone();a.opportunity.deadline='2026-10-13';
 assert.equal(contract.eligibility(a,'2026-10-12T18:29:59Z').status,'ELIGIBLE');
 assert.equal(contract.eligibility(a,'2026-10-12T18:30:00Z').status,'UNKNOWN');
 assert.equal(contract.eligibility(a,'2026-10-13T18:30:00Z').expired,true);
});
test('missing soft facts stay null and weights are never redistributed',()=>{
 const a=clone();a.profile.career_goals='';a.profile.preferred_locations=[];
 const m={...base.match,career_alignment:0,evidence:base.match.evidence.filter(e=>e.component!=='career_alignment')};
 const r=contract.decide(a,m,pack.now);
 assert.equal(r.component_scores.career_alignment.value,null);assert.equal(r.component_scores.location_fit.value,null);
 assert.equal(r.component_scores.career_alignment.points,0);assert.equal(r.component_scores.skill_fit.weight,40);
 assert.equal(Object.values(r.component_scores).reduce((s,c)=>s+c.weight,0),100);
});
test('AI interest opinion cannot override the deterministic interest component',()=>{
 const r=contract.decide(base.input,{...base.match,interest_fit:0},pack.now);assert.equal(r.component_scores.interest_fit.value,1);
});
test('contradictory sources cannot ACT in any mode',()=>{
 for(const mode of Object.keys(contract.thresholds)){const a=clone();a.profile.autonomy_mode=mode;a.opportunity.ambiguity_flags=['source_variation'];assert.equal(contract.decide(a,base.match,pack.now).decision,'ASK');}
});
test('exact shared contract is embedded in the generated workflow',()=>{
 const w=JSON.parse(readFileSync(new URL('../workflows/03-evaluate.json',import.meta.url),'utf8'));
 assert.ok(w.nodes.find(n=>n.id==='decide').parameters.jsCode.includes(createDecisionContract.toString()));
 assert.equal(w.nodes.find(n=>n.id==='switch').type,'n8n-nodes-base.switch');
 assert.deepEqual(w.nodes.find(n=>n.id==='switch').parameters.rules.values.map(r=>r.outputKey),['ACT','ASK','IGNORE']);
 assert.ok(!w.nodes.some(n=>/sendEmail|googleCalendar|httpRequest/.test(n.type)));
});
