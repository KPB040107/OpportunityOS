// Embedded in the n8n source-preparation Code node. Requests use a pinned DNS
// address with the original hostname for TLS verification; every redirect is checked.
export function createSourceTools({URL,isIP,lookup,http,https,Buffer,zlib}) {
  function isPublicAddress(address) {
    if(isIP(address)===4) {
      const [a,b,c]=address.split('.').map(Number);
      return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||b===2||b===88&&c===99))||(a===198&&(b===18||b===19||b===51&&c===100))||(a===203&&b===0&&c===113));
    }
    if(isIP(address)===6) {
      // Permit only ordinary global unicast; reject mapped, link-local, ULA,
      // documentation, transition, multicast and unspecified addresses.
      const s=address.toLowerCase(); const parts=s.split(':');const first=parseInt(parts[0],16),second=parseInt(parts[1]||'0',16);
      return first>=0x2000&&first<=0x3fff&&!(first===0x2001&&second<0x200)&&!(first===0x2001&&second===0xdb8)&&first!==0x2002;
    }
    return false;
  }
  function parseUrl(value) {
    const u=new URL(value);const host=u.hostname.toLowerCase();
    if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.href.length>2048||(u.port&&!['80','443'].includes(u.port))||isIP(host)||host.startsWith('[')||!host.includes('.')||/\.(local|localhost|internal|invalid|test)$/.test(host)) throw new Error('UNSAFE_URL');
    u.hash='';return u;
  }
  function decode(value) {
    const names={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
    return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_,key)=>{if(key[0]==='#'){const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):' ';}return names[key.toLowerCase()]||' ';});
  }
  function htmlText(html,baseUrl) {
    let source=html.replace(/<!--[\s\S]*?-->/g,' ').replace(/<(script|style|noscript|svg|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ');
    // Preserve public link targets as source evidence rather than asking AI to guess.
    source=source.replace(/<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi,(_,q,href,label)=>{let target='';try{target=parseUrl(new URL(decode(href),baseUrl).href).href;}catch{}return label+(target?' '+target:'');});
    return decode(source.replace(/<\/(?:p|div|li|h[1-6]|tr|section|article)>|<br\s*\/?>/gi,'\n').replace(/<[^>]*>/g,' '));
  }
  function robotsAllowed(body,path) {
    const groups=[];let group={agents:[],rules:[]};let sawRule=false;
    for(const line of body.split(/\r?\n/)) {
      const match=line.replace(/#.*/,'').trim().match(/^(user-agent|allow|disallow)\s*:\s*(.*)$/i);if(!match)continue;
      const key=match[1].toLowerCase(),value=match[2].trim();
      if(key==='user-agent'){if(sawRule){groups.push(group);group={agents:[],rules:[]};sawRule=false;}group.agents.push(value.toLowerCase());}
      else if(group.agents.length){sawRule=true;if(value)group.rules.push({allow:key==='allow',path:value});}
    }
    groups.push(group);
    const specific=groups.filter(g=>g.agents.some(a=>a!=='*'&&'opportunityos'.startsWith(a)));
    const selected=specific.length?specific:groups.filter(g=>g.agents.includes('*'));
    const rules=selected.flatMap(g=>g.rules).filter(r=>{
      const escaped=r.path.replace(/[.+?^{}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*');
      try{return new RegExp('^'+escaped).test(path);}catch{return !r.allow;}
    }).sort((a,b)=>b.path.length-a.path.length||Number(b.allow)-Number(a.allow));
    return !rules.length||rules[0].allow;
  }
  async function fetchPage(value,options={}) {
    const started=Date.now(),timeoutMs=options.timeoutMs||10000,maxBytes=options.maxBytes||350000;
    let url=parseUrl(value);
    if(!options.robotsRequest) {
      const robots=await fetchPage(new URL('/robots.txt',url).href,{robotsRequest:true,timeoutMs,maxBytes:100000});
      if(!robotsAllowed(robots.text,url.pathname+url.search)) throw new Error('SOURCE_ROBOTS_BLOCKED');
    }
    for(let redirect=0;redirect<=3;redirect++) {
      const remaining=timeoutMs-(Date.now()-started);if(remaining<=0) throw new Error('SOURCE_TIMEOUT');
      let dnsTimer;
      const records=await Promise.race([lookup(url.hostname,{all:true,verbatim:true}),new Promise((_,reject)=>{dnsTimer=setTimeout(()=>reject(new Error('SOURCE_TIMEOUT')),remaining);})]).finally(()=>clearTimeout(dnsTimer));
      if(!records.length||records.some(r=>!isPublicAddress(r.address))) throw new Error('UNSAFE_ADDRESS');
      const pinned=records.find(r=>r.family===4)||records[0];
      const response=await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{request.destroy(new Error('SOURCE_TIMEOUT'));},Math.max(1,timeoutMs-(Date.now()-started)));
        const request=(url.protocol==='https:'?https:http).request(url,{method:'GET',agent:false,autoSelectFamily:false,family:pinned.family,headers:{'User-Agent':'OpportunityOS/0.2 (public opportunity reader)','Accept':'text/html,text/plain','Accept-Encoding':'identity'},lookup:(_host,_opts,callback)=>callback(null,pinned.address,pinned.family)},res=>{
          const chunks=[];let size=0;
          res.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){res.destroy(new Error('SOURCE_TOO_LARGE'));request.destroy(new Error('SOURCE_TOO_LARGE'));}else chunks.push(chunk);});
          res.on('error',reject);res.on('end',()=>{
            try {
              let bytes=Buffer.concat(chunks);const encoding=(res.headers['content-encoding']||'identity').trim().toLowerCase();
              if(encoding!=='identity') {
                const decompress={gzip:zlib?.gunzipSync,br:zlib?.brotliDecompressSync,deflate:zlib?.inflateSync}[encoding];
                if(!decompress)throw new Error('SOURCE_UNSUPPORTED');
                bytes=decompress(bytes,{maxOutputLength:maxBytes});
              }
              resolve({status:res.statusCode,headers:res.headers,body:bytes.toString('utf8')});
            }catch(error){reject(new Error(error.code==='ERR_BUFFER_TOO_LARGE'?'SOURCE_TOO_LARGE':'SOURCE_UNSUPPORTED'));}
          });
        });
        request.on('error',reject);request.on('close',()=>clearTimeout(timer));request.end();
      });
      if([301,302,303,307,308].includes(response.status)) {
        if(!response.headers.location||redirect===3) throw new Error('SOURCE_REDIRECT_LIMIT');
        const next=parseUrl(new URL(response.headers.location,url).href);
        if(url.protocol==='https:'&&next.protocol==='http:') throw new Error('UNSAFE_REDIRECT');
        if(!options.robotsRequest) {
          const robots=await fetchPage(new URL('/robots.txt',next).href,{robotsRequest:true,timeoutMs:Math.max(1,timeoutMs-(Date.now()-started)),maxBytes:100000});
          if(!robotsAllowed(robots.text,next.pathname+next.search)) throw new Error('SOURCE_ROBOTS_BLOCKED');
        }
        url=next;continue;
      }
      if(options.robotsRequest&&[404,410].includes(response.status)) return {text:''};
      if(response.status<200||response.status>=300) throw new Error('SOURCE_HTTP_ERROR');
      const type=(response.headers['content-type']||'').split(';')[0].trim().toLowerCase();
      if(!['text/html','text/plain','application/xhtml+xml'].includes(type)) throw new Error('SOURCE_UNSUPPORTED');
      if(options.robotsRequest) return {text:response.body};
      const text=type==='text/plain'?response.body:htmlText(response.body,url.href);
      if(text.trim().length<50) throw new Error('SOURCE_NO_READABLE_TEXT');
      if(text.length>20000) throw new Error('SOURCE_TEXT_TOO_LARGE');
      return {text,final_url:url.href,fetched_at:new Date().toISOString()};
    }
    throw new Error('SOURCE_REDIRECT_LIMIT');
  }
  return {isPublicAddress,parseUrl,htmlText,robotsAllowed,fetchPage};
}
