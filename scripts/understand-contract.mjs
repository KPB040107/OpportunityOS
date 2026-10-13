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
    const sourceFlat=clean(source).replace(/\s+/g,' '),original=canon(sourceFlat); const items=[];
    // Email announcements commonly declare mandatory status once in a heading.
    // Keep that heading and its contiguous list as literal source evidence;
    // never infer mandatory status across a blank line or another heading.
    function mandatoryEvidence(quote) {
      if(/\b(preferred|optional|nice[- ]to[- ]have|not (?:required|mandatory))\b/i.test(quote))return null;
      const isHeading=line=>/^(?:mandatory (?:eligibility )?requirements|eligibility (?:requirements|criteria)|required (?:skills|qualifications)(?:[ \t]*\([^\n]*\))?)[ \t]*:?$/i.test(line.trim());
      const literal=original.includes(canon(quote));
      if(literal&&/\b(minimum|min\.?|must|required|mandatory|only|eligible|at least|eligibility)\b/i.test(quote)) return quote;
      let heading=null,bullet=quote;
      if(!literal) {
        // Repair only a real section heading joined to a real later bullet.
        // Both fragments must exist in this same section; fill every intervening
        // source line rather than accepting the model's non-contiguous quote.
        const split=quote.indexOf('\n');
        if(split<0||!isHeading(quote.slice(0,split)))return null;
        heading=quote.slice(0,split);bullet=quote.slice(split+1).trim();
        if(!/^[-*•][ \t]+/.test(bullet)||!original.includes(canon(bullet)))return null;
      }
      const lines=clean(source).split('\n');
      for(let i=0;i<lines.length;i++) {
        if(!isHeading(lines[i])||(heading&&canon(lines[i])!==canon(heading)))continue;
        let section=lines[i];
        for(let j=i+1;j<lines.length&&lines[j].trim();j++) {
          if(/^(?:preferred|optional|nice[- ]to[- ]have|about|responsibilities|learning outcomes|location|duration|how to apply|required|mandatory|eligibility)\b/i.test(lines[j].trim()))break;
          section+='\n'+lines[j];
          if(section.length>2000)break;
          if(canon(section).includes(canon(bullet)))return section;
        }
      }
      return null;
    }
    for(const raw of output.items) {
      const fields=['title','organization','deadline','location','type','application_url','description','requirements','skills','confidence','ambiguity_flags','evidence'];
      if(!raw||typeof raw!=='object'||fields.some(k=>!(k in raw))||Object.keys(raw).some(k=>!fields.includes(k))) fail();
      if(!['internship','hackathon','scholarship','program','job','unknown'].includes(raw.type)||typeof raw.confidence!=='number'||!Number.isFinite(raw.confidence)||raw.confidence<0||raw.confidence>1) fail();
      for(const key of ['title','organization','deadline','location','application_url','description']) if(raw[key]!==null&&(typeof raw[key]!=='string'||!raw[key].trim()||raw[key].length>(key==='description'?2000:2048))) fail();
      if(!Array.isArray(raw.evidence)||raw.evidence.length>40||!Array.isArray(raw.requirements)||raw.requirements.length>30||!Array.isArray(raw.skills)||raw.skills.length>30||!Array.isArray(raw.ambiguity_flags)||raw.ambiguity_flags.length>20) fail();
      // New AI output pairs each skill with its quote. Legacy validated input
      // remains supported; the saved/UI contract still uses string skill names.
      const skillNames=raw.skills.map(skill=>{
        if(typeof skill==='string'){if(!skill.trim()||skill.length>80)fail();return skill;}
        if(!skill||typeof skill!=='object'||Array.isArray(skill)||Object.keys(skill).some(k=>!['name','quote'].includes(k))||typeof skill.name!=='string'||!skill.name.trim()||skill.name.length>80||typeof skill.quote!=='string'||!skill.quote.trim()||skill.quote.length>2000||!original.includes(canon(skill.quote))||!canon(skill.quote).includes(canon(skill.name)))fail();
        return skill.name;
      });
      if(raw.ambiguity_flags.some(v=>typeof v!=='string'||!v.trim()||v.length>200)) fail();
      const quotes={};
      for(const e of raw.evidence) {
        if(!e||Object.keys(e).some(k=>!['field','quote'].includes(k))||!['title','organization','deadline','location','type','application_url','description','skills'].includes(e.field)||typeof e.quote!=='string'||!e.quote.trim()||e.quote.length>2000||!original.includes(canon(e.quote))) fail();
        (quotes[e.field]??=[]).push(e.quote);
      }
      const pairedEvidence=raw.skills.filter(skill=>typeof skill!=='string').map(skill=>({field:'skills',quote:skill.quote}));
      for(const e of pairedEvidence)(quotes.skills??=[]).push(e.quote);
      for(const field of ['title','organization','location','description','application_url']) {
        if(raw[field]!==null&&!(quotes[field]||[]).some(q=>canon(q).includes(canon(raw[field])))) fail();
      }
      const derivedEvidence=[];
      if(raw.type!=='unknown'&&!(quotes.type||[]).some(q=>new RegExp({internship:'intern',hackathon:'hackathon',scholarship:'scholarship',program:'program|programme|fellowship',job:'job|position|hiring|vacancy'}[raw.type],'i').test(q))) {
        // An explicit Job Title heading and its adjacent title are source proof.
        const escapedTitle=raw.title?.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        const jobHeading=raw.type==='job'&&escapedTitle?sourceFlat.match(new RegExp('\\bJob\\s+Title\\s*[:–-]?\\s*'+escapedTitle+'(?=\\s|[.,;:]|$)','i')):null;
        if(!jobHeading)fail();derivedEvidence.push({field:'type',quote:jobHeading[0]});
      }
      if(raw.deadline!==null) {
        if(!(quotes.deadline||[]).some(q=>dateFromQuote(raw.deadline,q)))fail();
        // A real date alone cannot prove a deadline: publication/event dates
        // must not become application cutoffs. Require an explicit source label.
        const deadlineDates=sourceFlat.matchAll(/\b(?:deadline|last\s+date(?:\s+(?:to\s+apply|for\s+(?:applications?|registration)))?|closing\s+date|applications?\s+closes?|(?:apply|register)\s+by|due\s+date)\s*[:–-]?\s*(?:(?:is|on|by)\s+)?(?:\d{4}-\d{2}-\d{2}|\d{1,2}(?:st|nd|rd|th)?[\s,/-]+[a-z]+[\s,/-]+\d{4}|[a-z]+[\s,/-]+\d{1,2}(?:st|nd|rd|th)?[\s,/-]+\d{4})\b/gi);
        const proof=[...deadlineDates].find(m=>dateFromQuote(raw.deadline,m[0]));
        if(!proof)fail();derivedEvidence.push({field:'deadline',quote:proof[0]});
      }
      if(raw.application_url!==null) { try{publicLink(raw.application_url);}catch{fail();} }
      const requirements=raw.requirements.map(r=>{
        if(!r||Object.keys(r).some(k=>!['kind','value','mandatory','evidence'].includes(k))||!['cgpa','academic_year','graduation_year','branch','degree','location','skill','other'].includes(r.kind)||typeof r.value!=='string'||!r.value.trim()||r.value.length>500||typeof r.mandatory!=='boolean'||typeof r.evidence!=='string'||!r.evidence.trim()||r.evidence.length>2000||!canon(r.evidence).includes(canon(r.value))) fail();
        const evidence=r.mandatory?mandatoryEvidence(r.evidence):r.evidence;
        if(!evidence||!original.includes(canon(evidence)))fail();
        let normalized_value=null;
        if(r.kind==='skill'||r.kind==='location') normalized_value={name:normalize(r.value)};
        if(r.kind==='cgpa') {const n=Number(r.value);if(Number.isFinite(n)&&n>=0&&n<=10&&/cgpa|gpa/i.test(r.evidence)&&/minimum|min\.?|at least/i.test(r.evidence)&&!/out of\s*[45]|\/\s*[45]\b|[45][ -]point/i.test(r.evidence)) normalized_value={minimum:n,scale:10};}
        if(r.kind==='graduation_year'&&/^20\d{2}$/.test(r.value)) normalized_value={allowed:[Number(r.value)]};
        if(r.kind==='academic_year'&&/^[1-8]$/.test(r.value)) normalized_value={allowed:[Number(r.value)]};
        return {...r,evidence,normalized_value};
      });
      // A validated skill requirement also supplies literal skill evidence.
      // Do not require the model to duplicate that same quote in two arrays.
      if(skillNames.some(s=>!(quotes.skills||[]).some(q=>canon(q).includes(canon(s)))&&!requirements.some(r=>r.kind==='skill'&&canon(r.value)===canon(s)))) fail();
      const flags=raw.ambiguity_flags.map(f=>canon(f).replace(/\s+/g,'_').replace(/^(title|organization|deadline|location)_missing$/,'missing_$1'));
      if(/ignore.{0,30}instructions|system prompt|mark.{0,12}\bact\b|reveal.{0,20}(secret|key|password)/i.test(source)) flags.push('source_contains_instructions');
      if(/\b(?:fully remote|telecommuting is ok)\b/i.test(source)&&/\bno telecommuting\b/i.test(source)) {
        flags.push('contradictory_remote_policy');
        for(const pattern of [/\bfully remote\b/i,/\btelecommuting is ok\b/i,/\bno telecommuting\b/i]){const proof=sourceFlat.match(pattern);if(proof)derivedEvidence.push({field:'location',quote:proof[0]});}
      }
      for(const key of ['title','organization','deadline']) if(raw[key]===null) flags.push('missing_'+key);
      if(requirements.some(r=>r.mandatory&&r.normalized_value===null)) flags.push('requirements_need_interpretation');
      if(new Set(requirements.filter(r=>r.kind==='cgpa').map(r=>r.value)).size>1) flags.push('contradictory_cgpa');
      const evidence=raw.evidence.filter(e=>e.field!=='deadline');for(const e of [...pairedEvidence,...derivedEvidence])if(!evidence.some(existing=>existing.field===e.field&&existing.quote===e.quote))evidence.push(e);
      const item={...raw,evidence,normalized_location:raw.location?normalize(raw.location):null,skills:[...new Set(skillNames.map(normalize))],requirements,ambiguity_flags:[...new Set(flags)],extraction_version:version};
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
