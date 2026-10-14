// This factory is embedded verbatim in n8n and exercised by the fixture tests.
export function createDecisionContract({hash, enableMissingDeadlinePolicy = false}) {
  const version=enableMissingDeadlinePolicy?'decision-v2':'decision-v1',matchVersion='match-v1';
  const weights={skill_fit:40,career_alignment:20,interest_fit:15,location_fit:10,profile_fit:10,urgency:5};
  const thresholds={cautious:[80,.85],balanced:[70,.75],autopilot:[60,.65]};
  const canon=v=>String(v??'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
  const aliases={py:'python',js:'javascript','react.js':'react',reactjs:'react','node.js':'nodejs',node:'nodejs',bangalore:'bengaluru',bombay:'mumbai','c++':'cpp','c#':'csharp',cse:'computer science',cs:'computer science','computer science and engineering':'computer science',it:'information technology','b.tech':'btech','bachelor of technology':'btech','b.e.':'be','bachelor of engineering':'be','m.tech':'mtech'};
  const norm=v=>aliases[canon(v)]||canon(v);
  const round=v=>Math.round(v*10000)/10000;
  const date=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
  const days=(deadline,today)=>deadline?Math.round((Date.parse(deadline+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000):null;
  const securityFlags=new Set(['source_contains_instructions']);
  function eligibility(input,now=new Date().toISOString()) {
    const p=input.profile||{},o=input.opportunity,requirements=input.requirements||o.requirements||[],checks=[];
    const add=(kind,status,reason,evidence=null)=>checks.push({kind,status,reason,evidence});
    const d=days(o.deadline,date(now));
    if(d===null){
      if(enableMissingDeadlinePolicy && ['internship','job'].includes(o.type)){
        add('deadline','NOT_STATED','The application deadline is not stated.',null);
      } else {
        add('deadline','UNKNOWN',o.type==='hackathon'?'The hackathon submission deadline is not stated.':'The application deadline is not stated.',null);
      }
    }
    else if(d<0)add('deadline','FAIL','The application deadline has passed.',o.deadline);
    else if(d===0)add('deadline','UNKNOWN','The deadline is today; its closing time is not verified.',o.deadline);
    else add('deadline','PASS',`The deadline is in ${d} day${d===1?'':'s'}.`,o.deadline);
    if(!requirements.length)add('requirements','UNKNOWN','No explicit requirements were extracted; eligibility needs clarification.');
    const flags=(o.ambiguity_flags||[]).filter(f=>!securityFlags.has(f));
    const conflict=flags.some(f=>/contradict|conflict|source_variation/.test(f));
    if(conflict)add('source','UNKNOWN','The sources contain conflicting details. Clarification is required.');
    for(const r of requirements.filter(r=>r.mandatory)) {
      const proof=r.evidence_snippet||r.evidence||'';let n=r.normalized_value;
      // Only recognize explicit, literal, named lists; broad academic descriptions remain unknown.
      if(['branch','degree'].includes(r.kind)&&!n){
        const known=r.kind==='branch'?['computer science','information technology','electrical engineering','electronics and communication','mechanical engineering','civil engineering','chemical engineering']:['btech','be','bsc','mtech','mca','bca','mba','bcom'];
        const whole=norm(r.value),allowed=known.includes(whole)?[whole]:r.value.split(/\s+(?:or|and)\s+|[,;/|]/i).map(norm).filter(Boolean);
        if(allowed.length&&allowed.every(v=>known.includes(v)))n={allowed};
      }
      if(r.kind==='graduation_year'&&n?.allowed){
        const years=[...new Set((proof.match(/\b20\d{2}\b/g)||[]).map(Number))];
        if(years.length>1){const explicit=proof.match(/\b20\d{2}(?:\s*(?:,|\/|or|and)\s*20\d{2})+\b/i);n=explicit&&/graduat|batch/i.test(proof)?{allowed:explicit[0].match(/20\d{2}/g).map(Number)}:null;}
      }
      if(r.kind==='academic_year'&&n?.allowed){
        const years=[...new Set((proof.match(/\b[1-8](?:st|nd|rd|th)?\b/g)||[]).map(v=>parseInt(v)))];
        if(years.length>1){const explicit=proof.match(/\b[1-8](?:st|nd|rd|th)?(?:\s*(?:,|\/|or|and)\s*[1-8](?:st|nd|rd|th)?)+\b/i);n=explicit&&/\byears?\b/i.test(proof)?{allowed:explicit[0].match(/[1-8]/g).map(Number)}:null;}
      }
      if(['academic_year','graduation_year'].includes(r.kind)&&/\b(at least|minimum|min\.?|after|before|onwards?|up to|or later|or earlier)\b/i.test(proof))n=null;
      let status='UNKNOWN',reason=`The mandatory ${r.kind.replaceAll('_',' ')} requirement (${r.value}) cannot be verified from the current profile.`;
      // Compound and experience qualifiers must never be satisfied by skill presence alone.
      const qualified=/\b(experience|years? of|months? of|at least (?:a|one|two)|except|excluding|not eligible|either|and\/or|related disciplines?|equivalent|or higher)\b/i.test(proof);
      if(!conflict && r.kind==='cgpa' && n?.scale===10 && Number.isFinite(n.minimum) && p.cgpa!==null && p.cgpa!==undefined && !qualified && !/\b(or|unless|category)\b/i.test(proof)) {
        status=Number(p.cgpa)>=n.minimum?'PASS':'FAIL';reason=status==='PASS'?`Your CGPA meets the minimum of ${n.minimum}/10.`:`Your CGPA is below the minimum of ${n.minimum}/10.`;
      } else if(!conflict && ['academic_year','graduation_year'].includes(r.kind) && Array.isArray(n?.allowed) && n.allowed.length && n.allowed.every(Number.isInteger) && p[r.kind]!=null && !qualified) {
        status=n.allowed.includes(Number(p[r.kind]))?'PASS':'FAIL';reason=`Your ${r.kind.replaceAll('_',' ')} ${status==='PASS'?'is':'is not'} in the stated allowed years.`;
      } else if(!conflict && ['branch','degree'].includes(r.kind) && Array.isArray(n?.allowed) && n.allowed.length && p[r.kind] && !qualified) {
        status=n.allowed.map(norm).includes(norm(p[r.kind]))?'PASS':'FAIL';reason=`Your ${r.kind} ${status==='PASS'?'matches':'does not match'} the stated allowed list.`;
      } else if(!conflict && r.kind==='skill' && n?.name && !qualified && !/\b(?:advanced|expert|proficient|proficiency|fluent|fluency|certified|certification|[0-9]+\s*\+?\s*(?:years?|months?))\b/i.test(proof)) {
        // An absent skill is UNKNOWN: a profile is not a declaration of everything someone cannot do.
        if((p.skills||[]).some(s=>norm(s.name)===norm(n.name))){status='PASS';reason=`Your profile lists the required ${r.value} skill.`;}
      }
      // Preferred locations are deliberately not treated as actual residence/availability.
      add(r.kind,status,reason,proof);
    }
    const expired=d!==null&&d<0;
    return {status:checks.some(c=>c.status==='FAIL')?'INELIGIBLE':checks.some(c=>c.status==='UNKNOWN')?'UNKNOWN':'ELIGIBLE',expired,days_to_deadline:d,checks};
  }
  function semanticInput(input) {
    const p=input.profile||{},o=input.opportunity;
    const profile={degree:p.degree||null,branch:p.branch||null,academic_year:p.academic_year??null,graduation_year:p.graduation_year??null,cgpa:p.cgpa??null,skills:(p.skills||[]).map(s=>({name:norm(s.name),level:s.level})).sort((a,b)=>a.name.localeCompare(b.name)),career_goals:p.career_goals||null,interest_types:[...(p.interest_types||[])].sort(),preferred_locations:(p.preferred_locations||[]).map(norm).sort()};
    const opportunity={title:o.title,organization:o.organization,type:o.type,description:o.description,skills:[...(o.skills||[])].map(norm).sort(),location:o.location,requirements:(input.requirements||[]).map(r=>({kind:r.kind,value:r.value,mandatory:r.mandatory,quote:r.evidence_snippet||r.evidence})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),evidence:o.extracted_json?.evidence||o.evidence||[]};
    return {profile,opportunity};
  }
  function matchKey(input){return hash(JSON.stringify({version:matchVersion,model:'models/gemini-3.5-flash-lite',input:semanticInput(input)}));}
  function validateMatch(raw,input) {
    const fail=()=>{throw new Error('INVALID_MATCH');};
    const fields=['skill_fit','career_alignment','interest_fit','confidence','evidence'];
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!fields.includes(k))||fields.some(k=>!(k in raw))||fields.slice(0,4).some(k=>typeof raw[k]!=='number'||!Number.isFinite(raw[k])||raw[k]<0||raw[k]>1)||!Array.isArray(raw.evidence)||raw.evidence.length>12)fail();
    const data=semanticInput(input),quotes=[...(data.opportunity.evidence||[]).map(e=>e.quote),...data.opportunity.requirements.map(r=>r.quote)].filter(Boolean);
    for(const e of raw.evidence){
      if(!e||Object.keys(e).some(k=>!['component','opportunity_quote','profile_quote'].includes(k))||!['skill_fit','career_alignment','interest_fit'].includes(e.component)||typeof e.opportunity_quote!=='string'||!e.opportunity_quote.trim()||e.opportunity_quote.length>2000||typeof e.profile_quote!=='string'||!e.profile_quote.trim()||e.profile_quote.length>2000)fail();
      if(!quotes.some(q=>canon(q).includes(canon(e.opportunity_quote))))fail();
      const profileFacts=e.component==='skill_fit'?data.profile.skills.map(s=>s.name):e.component==='career_alignment'?[data.profile.career_goals]:data.profile.interest_types;
      if(!profileFacts.filter(Boolean).some(q=>canon(q).includes(canon(e.profile_quote))))fail();
    }
    for(const k of ['skill_fit','career_alignment'])if(raw[k]>0&&!raw.evidence.some(e=>e.component===k))fail();
    if(!data.profile.skills.length&&raw.skill_fit!==0)fail();
    if(!data.profile.career_goals&&raw.career_alignment!==0)fail();
    return raw;
  }
  function policy(elig,score,confidence,mode='balanced') {
    if(!thresholds[mode])throw new Error('INVALID_MODE');
    if(!['ELIGIBLE','INELIGIBLE','UNKNOWN'].includes(elig.status)||typeof elig.expired!=='boolean')throw new Error('INVALID_ELIGIBILITY');
    if(elig.expired)return {decision:'IGNORE',reason_codes:['EXPIRED']};
    if(elig.status==='INELIGIBLE')return {decision:'IGNORE',reason_codes:['INELIGIBLE']};
    if(elig.status==='UNKNOWN')return {decision:'ASK',reason_codes:['UNKNOWN_ELIGIBILITY']};
    if(!Number.isFinite(score)||!Number.isFinite(confidence)||score<0||score>100||confidence<0||confidence>1)throw new Error('INVALID_SCORE');
    if(score<40)return {decision:'IGNORE',reason_codes:['LOW_MATCH']};
    const [s,c]=thresholds[mode],reasons=[];
    if(score<s)reasons.push('BELOW_MODE_SCORE');if(confidence<c)reasons.push('LOW_CONFIDENCE');
    if(reasons.length)return {decision:'ASK',reason_codes:reasons};
    const hasNotStatedDeadline=elig.checks?.some(ch=>ch.kind==='deadline'&&ch.status==='NOT_STATED')??false;
    const mainReason=hasNotStatedDeadline?'ELIGIBLE_NO_DEADLINE_TRACK':'ELIGIBLE_STRONG_MATCH';
    return {decision:'ACT',reason_codes:[mainReason]};
  }
  function decide(input,rawMatch,now=new Date().toISOString()) {
    const o=input.opportunity,p=input.profile||{},elig=eligibility(input,now),mode=p.autonomy_mode||'balanced';
    if(elig.expired||elig.status==='INELIGIBLE') {
      const result=policy(elig,0,0,mode);return {policy_version:version,match_version:matchVersion,eligibility_status:elig.status,eligibility_checks:elig.checks,expired:elig.expired,days_to_deadline:elig.days_to_deadline,component_scores:null,match_score:null,confidence:null,confidence_inputs:null,semantic_evidence:[],...result,explanation:elig.checks.filter(c=>c.status==='FAIL').map(c=>c.reason).join(' '),mode};
    }
    const match=validateMatch(rawMatch,input);
    const location=o.location?norm(o.location):null,preferences=(p.preferred_locations||[]).map(norm);
    // Only a literal normalized location/remote indication earns a soft preference match.
    const loc=location&&preferences.length?(preferences.some(l=>l===location||location.split(/[,();]/).map(norm).includes(l)||(l==='remote'&&/\bremote\b/.test(location)))?1:0):null;
    const yearBranch=(input.requirements||[]).filter(r=>['academic_year','graduation_year','branch','degree'].includes(r.kind));
    const profChecks=eligibility({...input,requirements:yearBranch.map(r=>({...r,mandatory:true}))},now).checks.filter(c=>['academic_year','graduation_year','branch','degree'].includes(c.kind));
    const academicFit=profChecks.some(c=>c.status!=='UNKNOWN')?profChecks.filter(c=>c.status==='PASS').length/yearBranch.length:null;
    const values={skill_fit:(p.skills||[]).length&&(o.skills||[]).length?match.skill_fit:null,career_alignment:p.career_goals?match.career_alignment:null,interest_fit:(p.interest_types||[]).length&&o.type!=='unknown'?(p.interest_types.includes(o.type)?1:0):null,location_fit:loc,profile_fit:academicFit,urgency:elig.days_to_deadline===null?null:elig.days_to_deadline<=7?1:elig.days_to_deadline<=14?.75:elig.days_to_deadline<=30?.5:.25};
    const component_scores=Object.fromEntries(Object.entries(weights).map(([k,w])=>[k,{value:values[k],weight:w,points:round((values[k]??0)*w)}]));
    const match_score=round(Object.values(component_scores).reduce((s,v)=>s+v.points,0));
    const completeness=[!!o.title,!!o.organization,!!o.deadline,(input.requirements||[]).length>0].filter(Boolean).length/4;
    const expected=['title','organization','deadline','location','type','skills'].filter(k=>k==='skills'?o.skills?.length:o[k]&&o[k]!=='unknown');
    const evidence=o.extracted_json?.evidence||o.evidence||[];
    const verified=expected.length?expected.filter(k=>evidence.some(e=>e.field===k&&e.quote)).length/expected.length:0;
    const flags=(o.ambiguity_flags||[]).filter(f=>!securityFlags.has(f));
    const clarity=Math.max(0,1-flags.length*.2),model=Math.min(Number(o.extraction_confidence??o.confidence??0),match.confidence);
    const confidence_inputs={completeness,verified_evidence:verified,clarity,model_confidence:model,weights:{completeness:.3,verified_evidence:.3,clarity:.25,model_confidence:.15}};
    // Complete fields cannot cancel the model's explicit uncertainty.
    const confidence=round(Math.min(model,.3*completeness+.3*verified+.25*clarity+.15*model));
    const result=policy(elig,match_score,confidence,mode);
    const reasons={UNKNOWN_ELIGIBILITY:'Some required facts need clarification.',LOW_MATCH:'The match score is below 40.',BELOW_MODE_SCORE:`The score is below the ${mode} threshold.`,LOW_CONFIDENCE:`Confidence is below the ${mode} threshold.`,ELIGIBLE_STRONG_MATCH:`Eligible and above both ${mode} thresholds.`,ELIGIBLE_NO_DEADLINE_TRACK:`Eligible with no stated deadline; queued for tracking and notification.`};
    const explanation=[reasons[result.reason_codes[0]],...elig.checks.filter(c=>c.status!=='PASS').map(c=>c.reason),`Match score ${match_score}/100; confidence ${Math.round(confidence*100)}%.`].join(' ');
    return {policy_version:version,match_version:matchVersion,eligibility_status:elig.status,eligibility_checks:elig.checks,expired:false,days_to_deadline:elig.days_to_deadline,component_scores,match_score,confidence,confidence_inputs,semantic_evidence:match.evidence,...result,explanation,mode};
  }
  return {version,matchVersion,weights,thresholds,eligibility,semanticInput,matchKey,validateMatch,policy,decide,date};
}
