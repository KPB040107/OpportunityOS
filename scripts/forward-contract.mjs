export function createForwardContract({hash}){
 const gather=v=>typeof v==='string'?v:Array.isArray(v)?v.map(gather).join(' '):v&&typeof v==='object'?[v.address,v.text,v.value].map(gather).join(' '):'';
 function parse(email){
  const recipients=gather([
    email.to,
    email.headers?.to,
    email.headers?.['delivered-to'],
    email.headers?.['x-forwarded-to'],
    email.headers?.['x-original-to'],
    email.headers?.['envelope-to'],
    email.headers?.['x-delivered-to'],
    email.headers?.['resent-to'],
    email.metadata?.to,
    email.metadata?.['delivered-to']
  ]).toLowerCase();
  const aliases=[...new Set([...recipients.matchAll(/opportunityos0001\+([a-f0-9]{32})@gmail\.com/g)].map(m=>m[1]))];
  if(aliases.length!==1)return null;
  let raw=String(email.textPlain||email.text||'');
  if(!raw.trim()&&(email.textHtml||email.html)){
    const html=String(email.textHtml||email.html||'');
    raw=html
      .replace(/<style[\s\S]*?<\/style>/gi,'')
      .replace(/<script[\s\S]*?<\/script>/gi,'')
      .replace(/<[^>]+>/g,' ')
      .replace(/&nbsp;/gi,' ')
      .replace(/&amp;/gi,'&')
      .replace(/&lt;/gi,'<')
      .replace(/&gt;/gi,'>')
      .replace(/&quot;/gi,'"')
      .replace(/&#39;/gi,"'")
      .replace(/[ \t]+/g,' ')
      .replace(/\n{3,}/g,'\n\n')
      .trim();
  }
  if(!raw.trim()||raw.length>20000)return null;
  const subject=String(email.subject||email.metadata?.subject||'').slice(0,300);
  if(!/internship|scholarship|hackathon|fellowship|applications?|apply|deadline|opportunit|program|vacanc|hiring|\bjob\b/i.test(subject+' '+raw))return null;
  const text=subject+'\n'+raw;if(text.length>20000)return null;
  const key=hash(aliases[0]+'\n'+String(email.messageId||email.metadata?.['message-id']||'')+'\n'+text).slice(0,32);
  const request_id=key.slice(0,8)+'-'+key.slice(8,12)+'-5'+key.slice(13,16)+'-a'+key.slice(17,20)+'-'+key.slice(20);
  const from_address=gather([email.from,email.headers?.from,email.metadata?.from]);
  const message_id=String(email.messageId||email.headers?.['message-id']||email.metadata?.['message-id']||'');
  return {alias:aliases[0],request_id,text,from_address,subject,message_id};
 }
 return {parse};
}
