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
 assert.ok(w.nodes.find(n=>n.id==='decide').parameters.jsCode.includes('createDecisionContract'));
 assert.equal(w.nodes.find(n=>n.id==='switch').type,'n8n-nodes-base.switch');
 assert.deepEqual(w.nodes.find(n=>n.id==='switch').parameters.rules.values.map(r=>r.outputKey),['ACT','ASK','IGNORE']);
 assert.ok(!w.nodes.some(n=>/sendEmail|googleCalendar|httpRequest/.test(n.type)));
});

test('discovery opportunity evaluates grounded quotes from description, title, skills, and provenance without INVALID_MATCH',()=>{
 const unlocked = createDecisionContract({hash: s=>createHash('sha256').update(s).digest('hex'), enableMissingDeadlinePolicy: true});
 const discoveryInput = {
  profile: {
   degree: 'B.Tech',
   branch: 'Computer Science',
   academic_year: 3,
   graduation_year: 2028,
   cgpa: 8.5,
   skills: [{name: 'python', level: 'intermediate'}, {name: 'react', level: 'intermediate'}],
   career_goals: 'Software Engineer specializing in backend APIs',
   interest_types: ['internship'],
   preferred_locations: ['Bengaluru'],
   autonomy_mode: 'balanced'
  },
  opportunity: {
   title: 'Software Engineering Intern (Backend)',
   organization: 'Razorpay',
   type: 'internship',
   deadline: null,
   location: 'Bengaluru',
   description: 'We are seeking a Software Engineering Intern (Backend). You will work with Python and modern web frameworks to develop scalable microservices.',
   skills: ['python', 'react'],
   ambiguity_flags: [],
   extraction_confidence: 0.95,
   extracted_json: {
    content_hash: 'discoveryhash123',
    fields: {
     commitment: 'Full-time',
     skills: ['python', 'react'],
     requirements: [
      {
       kind: 'branch',
       value: 'Computer Science',
       mandatory: true,
       evidence: 'Open to Computer Science students'
      }
     ]
    },
    field_provenance: [
     {field: 'title', kind: 'structured_field', json_pointer: '/title', value: 'Software Engineering Intern (Backend)'},
     {field: 'location', kind: 'structured_field', json_pointer: '/location', value: 'Bengaluru'}
    ]
   }
  },
  requirements: []
 };

 const validDiscoveryMatch = {
  skill_fit: 0.9,
  career_alignment: 0.85,
  interest_fit: 1.0,
  confidence: 0.9,
  evidence: [
   {
    component: 'skill_fit',
    opportunity_quote: 'work with Python and modern web frameworks',
    profile_quote: 'python'
   },
   {
    component: 'career_alignment',
    opportunity_quote: 'Software Engineering Intern (Backend)',
    profile_quote: 'Software Engineer specializing in backend APIs'
   }
  ]
 };

 // Validate match does not throw INVALID_MATCH
 const validated = unlocked.validateMatch(validDiscoveryMatch, discoveryInput);
 assert.equal(validated.skill_fit, 0.9);

 // Decide produces ASK under balanced mode due to no-deadline confidence threshold
 const balancedDecision = unlocked.decide(discoveryInput, validDiscoveryMatch, pack.now);
 assert.equal(balancedDecision.decision, 'ASK');
 assert.equal(balancedDecision.eligibility_status, 'ELIGIBLE');
 assert.ok(balancedDecision.reason_codes.includes('LOW_CONFIDENCE'));
 assert.ok(balancedDecision.match_score >= 70);

 // Under autopilot mode (confidence threshold 0.65), it produces ACT with ELIGIBLE_NO_DEADLINE_TRACK
 const autopilotInput = structuredClone(discoveryInput);
 autopilotInput.profile.autonomy_mode = 'autopilot';
 const autopilotDecision = unlocked.decide(autopilotInput, validDiscoveryMatch, pack.now);
 assert.equal(autopilotDecision.decision, 'ACT');
 assert.equal(autopilotDecision.eligibility_status, 'ELIGIBLE');
 assert.deepEqual(autopilotDecision.reason_codes, ['ELIGIBLE_NO_DEADLINE_TRACK']);

 // Fabricated opportunity quote still throws INVALID_MATCH
 const fabricatedMatch = structuredClone(validDiscoveryMatch);
 fabricatedMatch.evidence[0].opportunity_quote = 'Requires 10 years Kubernetes and Go';
 assert.throws(() => unlocked.validateMatch(fabricatedMatch, discoveryInput), /INVALID_MATCH/);

 // Fabricated profile quote still throws INVALID_MATCH
 const fabricatedProfileMatch = structuredClone(validDiscoveryMatch);
 fabricatedProfileMatch.evidence[0].profile_quote = 'Rust Expert';
 assert.throws(() => unlocked.validateMatch(fabricatedProfileMatch, discoveryInput), /INVALID_MATCH/);
});

test('hackathon ignores academic requirements and passes without them if deadline is verified',()=>{
  const h=clone();
  h.opportunity.type='hackathon';
  h.opportunity.deadline='2026-10-25';
  h.requirements=[];
  const eligNoReqs=contract.eligibility(h,pack.now);
  assert.equal(eligNoReqs.status,'ELIGIBLE');

  h.profile.branch='Civil Engineering';
  h.profile.cgpa=5.0;
  h.profile.graduation_year=2030;
  h.requirements=[
    {kind:'branch',value:'Computer Science',mandatory:true,normalized_value:{allowed:['computer science']},evidence_snippet:'Open to CS branch only.'},
    {kind:'cgpa',value:'8.0',mandatory:true,normalized_value:{minimum:8.0,scale:10},evidence_snippet:'Minimum CGPA 8.0.'},
    {kind:'graduation_year',value:'2028',mandatory:true,normalized_value:{allowed:[2028]},evidence_snippet:'Graduating in 2028.'}
  ];
  const eligAcademic=contract.eligibility(h,pack.now);
  assert.equal(eligAcademic.status,'ELIGIBLE');
  assert.ok(eligAcademic.checks.some(c=>c.kind==='branch'&&c.status==='PASS'));
});

test('internship and job type-specific eligibility rules for other_requirement and NO_REQUIREMENTS_STATED',()=>{
  const openIntern=clone();
  openIntern.requirements=[];
  openIntern.opportunity.requirements_status='NO_REQUIREMENTS_STATED';
  const openElig=contract.eligibility(openIntern,pack.now);
  assert.equal(openElig.status,'ELIGIBLE');
  assert.ok(openElig.checks.some(c=>c.kind==='requirements'&&c.status==='PASS'));

  const infoIntern=clone();
  infoIntern.requirements.push({
    kind:'other',
    value:'Strong communication and teamwork',
    mandatory:true,
    requirement_class:'other_requirement',
    evidence_snippet:'Strong communication and teamwork'
  });
  const infoElig=contract.eligibility(infoIntern,pack.now);
  assert.equal(infoElig.status,'ELIGIBLE');
});

test('required skills pass or track gaps without marking entire eligibility UNKNOWN unless hard constraint',()=>{
  const s=clone();
  s.requirements=[
    {
      kind:'skill',
      value:'Python',
      mandatory:true,
      normalized_value:{name:'python'},
      requirement_class:'required_skill',
      evidence_snippet:'Python is required.'
    },
    {
      kind:'skill',
      value:'Rust',
      mandatory:true,
      normalized_value:{name:'rust'},
      requirement_class:'required_skill',
      evidence_snippet:'Rust is required.'
    }
  ];
  const elig=contract.eligibility(s,pack.now);
  assert.equal(elig.status,'ELIGIBLE');
  assert.ok(elig.checks.some(c=>c.kind==='skill'&&c.reason.includes('profile lists the required Python')));
  assert.ok(elig.checks.some(c=>c.kind==='skill'&&c.reason.includes('Skill Rust is missing from profile')));

  const hard=clone();
  hard.requirements=[
    {
      kind:'skill',
      value:'Rust',
      mandatory:true,
      normalized_value:{name:'rust'},
      requirement_class:'mandatory_eligibility',
      evidence_snippet:'Rust is strictly required for this position.'
    }
  ];
  const hardElig=contract.eligibility(hard,pack.now);
  assert.equal(hardElig.status,'UNKNOWN');
});

test('match scoring separates required and preferred skill coverage in component_scores',()=>{
  const inp=clone();
  inp.profile.skills=[{name:'python',level:'intermediate'},{name:'sql',level:'intermediate'}];
  inp.requirements=[
    {kind:'skill',value:'Python',mandatory:true,normalized_value:{name:'python'},requirement_class:'required_skill'},
    {kind:'skill',value:'React',mandatory:true,normalized_value:{name:'react'},requirement_class:'required_skill'},
    {kind:'skill',value:'Docker',mandatory:false,normalized_value:{name:'docker'},requirement_class:'preferred_skill'}
  ];
  inp.opportunity.skills=['python','react','docker'];

  const m={...base.match,skill_fit:0.8};
  const decision=contract.decide(inp,m,pack.now);

  assert.ok(decision.component_scores.required_skill_coverage);
  assert.ok(decision.component_scores.preferred_skill_coverage);
  assert.equal(decision.component_scores.required_skill_coverage.value,0.5);
  assert.deepEqual(decision.component_scores.required_skill_coverage.matched,['python']);
  assert.deepEqual(decision.component_scores.required_skill_coverage.missing,['react']);
  assert.equal(decision.component_scores.preferred_skill_coverage.value,0);
  assert.deepEqual(decision.component_scores.preferred_skill_coverage.missing,['docker']);
  assert.equal(Object.values(decision.component_scores).reduce((s,c)=>s+c.weight,0),100);
});

test('hackathon eligibility passes with stated deadline, participation rules, and no academic blocking',()=>{
  const h=clone();
  h.opportunity.type='hackathon';
  h.opportunity.deadline='2026-10-27';
  h.opportunity.location='Online';
  h.profile.country='India';
  h.profile.branch='Mechanical Engineering';
  h.profile.cgpa=6.0;
  h.requirements=[
    {kind:'participation',value:'Above legal age of majority in country of residence',mandatory:true,evidence_snippet:'Above legal age of majority in country of residence.'},
    {kind:'participation',value:'Specific countries/territories excluded',mandatory:true,evidence_snippet:'Specific countries/territories excluded: Cuba, Iran, North Korea, Syria, Crimea.'},
    {kind:'location',value:'Participation location: Online',mandatory:true,evidence_snippet:'Participation location: Online.'},
    {kind:'cgpa',value:'8.5',mandatory:true,evidence_snippet:'Minimum CGPA 8.5.'},
    {kind:'branch',value:'Computer Science',mandatory:true,evidence_snippet:'Only CS branch eligible.'}
  ];

  // With now='2026-10-12' (from pack.now), deadline 2026-10-27 is 15 days away
  const elig=contract.eligibility(h,pack.now);
  assert.equal(elig.status,'ELIGIBLE');

  const deadlineCheck=elig.checks.find(c=>c.kind==='deadline');
  assert.ok(deadlineCheck);
  assert.equal(deadlineCheck.status,'PASS');
  assert.match(deadlineCheck.reason,/The deadline is in \d+ days\./);

  const ageCheck=elig.checks.find(c=>c.kind==='participation'&&c.reason.includes('age of majority'));
  assert.ok(ageCheck);
  assert.equal(ageCheck.status,'PASS');

  const countryCheck=elig.checks.find(c=>c.kind==='participation'&&c.reason.includes('eligible country'));
  assert.ok(countryCheck);
  assert.equal(countryCheck.status,'PASS');

  const locationCheck=elig.checks.find(c=>c.kind==='location');
  assert.ok(locationCheck);
  assert.equal(locationCheck.status,'PASS');

  // Academic requirements are not evaluated for hackathons
  const cgpaCheck=elig.checks.find(c=>c.kind==='cgpa');
  assert.ok(cgpaCheck);
  assert.equal(cgpaCheck.status,'PASS');
  assert.match(cgpaCheck.reason,/not evaluated for hackathons/);

  // Full decide with strong match produces ELIGIBLE and calculated match_score
  const result=contract.decide(h,base.match,pack.now);
  assert.equal(result.eligibility_status,'ELIGIBLE');
  assert.ok(typeof result.match_score==='number'&&result.match_score>=70);
  assert.ok(result.explanation.includes(`Match score ${result.match_score}/100`));
});

test('UNKNOWN eligibility does not produce contradictory explanation or definitive match score',()=>{
  // Hackathon with missing deadline
  const h=clone();
  h.opportunity.type='hackathon';
  h.opportunity.deadline=null;
  h.requirements=[];

  const elig=contract.eligibility(h,pack.now);
  assert.equal(elig.status,'UNKNOWN');

  const res=contract.decide(h,base.match,pack.now);
  assert.equal(res.eligibility_status,'UNKNOWN');
  assert.equal(res.decision,'ASK');
  assert.equal(res.match_score,null);
  assert.equal(res.component_scores,null);

  // Explanation must NOT have contradictory statements
  assert.ok(!res.explanation.includes('Match score'));
  assert.ok(!res.explanation.includes('Some required facts need clarification.'));
  assert.ok(res.explanation.includes('The hackathon submission deadline is not stated.'));
  assert.ok(res.explanation.includes('Scoring deferred until required facts are clarified; confidence'));

  // Internship with unverified mandatory requirement
  const intern=clone();
  intern.requirements=[
    {kind:'branch',value:'Any relevant branch',mandatory:true,evidence_snippet:'Any relevant branch.'}
  ];
  const internRes=contract.decide(intern,base.match,pack.now);
  assert.equal(internRes.eligibility_status,'UNKNOWN');
  assert.equal(internRes.match_score,null);
  assert.ok(!internRes.explanation.includes('Match score'));
  assert.ok(!internRes.explanation.includes('Some required facts need clarification.'));
  assert.ok(internRes.explanation.includes('cannot be verified from the current profile'));
  assert.ok(internRes.explanation.includes('Scoring deferred until required facts are clarified'));
});



