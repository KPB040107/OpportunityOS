// Shared by the n8n Code node and deterministic fixture tests.
export function createUnderstandContract({hash, URL}) {
  const version='extract-v1';
  const canon=value=>value.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
  const clean=value=>value.normalize('NFKC').replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
  const aliases={'js':'javascript','javascript':'javascript','react.js':'react','reactjs':'react','react':'react','node.js':'nodejs','node':'nodejs','nodejs':'nodejs','py':'python','python':'python','c++':'cpp','cpp':'cpp','c#':'csharp','csharp':'csharp','postgresql':'postgresql','postgres':'postgresql','bangalore':'bengaluru','bengaluru':'bengaluru','bombay':'mumbai','mumbai':'mumbai'};
  const normalize=value=>aliases[canon(value)]||canon(value);
  function publicLink(value) {
    const u=new URL(value); const host=u.hostname.toLowerCase();
    if(!['http:','https:'].includes(u.protocol)||u.username||u.password||(u.port&&!['80','443'].includes(u.port))||!host.includes('.')||host.startsWith('[')||/^\d+(?:\.\d+){3}$/.test(host)||/\.(?:localhost|local|internal|test|invalid)$/.test(host)) throw new Error('UNSAFE_URL');
    u.hash=''; return u.toString();
  }
  function dateFromQuote(value,quote) {
    const date=new Date(value+'T00:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value) return false;
    const [y,m,d]=value.split('-').map(Number); const q=canon(quote);
    if(q.includes(value)) return true;
    const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    // Never infer a year or resolve ambiguous numeric dates.
    return new RegExp(`\\b${d}(?:st|nd|rd|th)?[\\s,/-]+${months[m-1]}[a-z]*[\\s,/-]+${y}\\b`).test(q)||new RegExp(`\\b${months[m-1]}[a-z]*[\\s,/-]+${d}(?:st|nd|rd|th)?[\\s,/-]+${y}\\b`).test(q);
  }
  function validate(output,source) {
    const fail=()=>{throw new Error('INVALID_EXTRACTION');};
    if(!output||typeof output!=='object'||Array.isArray(output)||Object.keys(output).some(k=>!['is_opportunity','items'].includes(k))||typeof output.is_opportunity!=='boolean'||!Array.isArray(output.items)||output.items.length>5||output.is_opportunity!==(output.items.length>0)) fail();
    const original=canon(clean(source)); const items=[];
    for(const raw of output.items) {
      const fields=['title','organization','deadline','location','type','application_url','description','requirements','skills','confidence','ambiguity_flags','evidence'];
      if(!raw||typeof raw!=='object'||fields.some(k=>!(k in raw))||Object.keys(raw).some(k=>!fields.includes(k))) fail();
      if(!['internship','hackathon','scholarship','program','job','unknown'].includes(raw.type)||typeof raw.confidence!=='number'||!Number.isFinite(raw.confidence)||raw.confidence<0||raw.confidence>1) fail();
      for(const key of ['title','organization','deadline','location','application_url','description']) if(raw[key]!==null&&(typeof raw[key]!=='string'||!raw[key].trim()||raw[key].length>(key==='description'?2000:2048))) fail();
      if(!Array.isArray(raw.evidence)||raw.evidence.length>40||!Array.isArray(raw.requirements)||raw.requirements.length>30||!Array.isArray(raw.skills)||raw.skills.length>30||!Array.isArray(raw.ambiguity_flags)||raw.ambiguity_flags.length>20) fail();
      if(raw.skills.some(v=>typeof v!=='string'||!v.trim()||v.length>80)||raw.ambiguity_flags.some(v=>typeof v!=='string'||!v.trim()||v.length>200)) fail();
      const quotes={};
      for(const e of raw.evidence) {
        if(!e||Object.keys(e).some(k=>!['field','quote'].includes(k))||!['title','organization','deadline','location','type','application_url','description','skills'].includes(e.field)||typeof e.quote!=='string'||!e.quote.trim()||e.quote.length>2000||!original.includes(canon(e.quote))) fail();
        (quotes[e.field]??=[]).push(e.quote);
      }
      for(const field of ['title','organization','location','description','application_url']) {
        if(raw[field]!==null&&!(quotes[field]||[]).some(q=>canon(q).includes(canon(raw[field])))) fail();
      }
      if(raw.type!=='unknown'&&!(quotes.type||[]).some(q=>new RegExp({internship:'intern',hackathon:'hackathon',scholarship:'scholarship',program:'program|programme|fellowship',job:'job|position|hiring|vacancy'}[raw.type],'i').test(q))) fail();
      if(raw.deadline!==null&&!(quotes.deadline||[]).some(q=>dateFromQuote(raw.deadline,q))) fail();
      if(raw.application_url!==null) { try{publicLink(raw.application_url);}catch{fail();} }
      const requirements=raw.requirements.map(r=>{
        if(!r||Object.keys(r).some(k=>!['kind','value','mandatory','evidence'].includes(k))||!['cgpa','academic_year','graduation_year','branch','degree','location','skill','other'].includes(r.kind)||typeof r.value!=='string'||!r.value.trim()||r.value.length>500||typeof r.mandatory!=='boolean'||typeof r.evidence!=='string'||!r.evidence.trim()||r.evidence.length>2000||!original.includes(canon(r.evidence))||!canon(r.evidence).includes(canon(r.value))) fail();
        if(r.mandatory&&!/\b(minimum|min\.?|must|required|mandatory|only|eligible|at least|eligibility)\b/i.test(r.evidence)) fail();
        let normalized_value=null;
        if(r.kind==='skill'||r.kind==='location') normalized_value={name:normalize(r.value)};
        if(r.kind==='cgpa') {const n=Number(r.value);if(Number.isFinite(n)&&n>=0&&n<=10&&/cgpa|gpa/i.test(r.evidence)&&/minimum|min\.?|at least/i.test(r.evidence)&&!/out of\s*[45]|\/\s*[45]\b|[45][ -]point/i.test(r.evidence)) normalized_value={minimum:n,scale:10};}
        if(r.kind==='graduation_year'&&/^20\d{2}$/.test(r.value)) normalized_value={allowed:[Number(r.value)]};
        if(r.kind==='academic_year'&&/^[1-8]$/.test(r.value)) normalized_value={allowed:[Number(r.value)]};
        return {...r,normalized_value};
      });
      // A validated skill requirement also supplies literal skill evidence.
      // Do not require the model to duplicate that same quote in two arrays.
      if(raw.skills.some(s=>!(quotes.skills||[]).some(q=>canon(q).includes(canon(s)))&&!requirements.some(r=>r.kind==='skill'&&canon(r.value)===canon(s)))) fail();
      const flags=raw.ambiguity_flags.map(f=>canon(f).replace(/\s+/g,'_').replace(/^(title|organization|deadline|location)_missing$/,'missing_$1'));
      if(/ignore.{0,30}instructions|system prompt|mark.{0,12}\bact\b|reveal.{0,20}(secret|key|password)/i.test(source)) flags.push('source_contains_instructions');
      for(const key of ['title','organization','deadline']) if(raw[key]===null) flags.push('missing_'+key);
      if(requirements.some(r=>r.mandatory&&r.normalized_value===null)) flags.push('requirements_need_interpretation');
      if(new Set(requirements.filter(r=>r.kind==='cgpa').map(r=>r.value)).size>1) flags.push('contradictory_cgpa');
      const item={...raw,normalized_location:raw.location?normalize(raw.location):null,skills:[...new Set(raw.skills.map(normalize))],requirements,ambiguity_flags:[...new Set(flags)],extraction_version:version};
      // Incomplete identity cannot be merged across different content safely.
      const url=raw.application_url?new URL(raw.application_url):null;
      const identity=[canon(raw.title||''),canon(raw.organization||''),url?url.hostname.toLowerCase()+url.pathname.replace(/\/$/,''):'',raw.deadline||''];
      item.fingerprint=hash(JSON.stringify(identity)+(raw.title&&raw.organization&&raw.deadline&&raw.application_url?'':':'+hash(clean(source))));
      items.push(item);
    }
    return {is_opportunity:output.is_opportunity,items,extraction_version:version};
  }
  return {version,clean,normalize,publicLink,validate,contentHash:source=>hash(clean(source).replace(/\s+/g,' '))};
}
