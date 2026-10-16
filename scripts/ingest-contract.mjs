// This exact function is embedded in the n8n Code node by the workflow generator.
export function validateIntakeWebhook(body, authorization) {
  const reject = (status,error) => ({valid:false,http_status:status,error});
  if (typeof authorization !== 'string' || !/^Bearer [A-Za-z0-9._-]{20,4096}$/.test(authorization)) return reject(401,'Authentication required');
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['request_id','source_type','content','nonce','payload_hash','metadata'].includes(key))) return reject(400,'Invalid submission fields');
  if (typeof body.request_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.request_id)) return reject(400,'Invalid request identifier');
  if (!['text','url','capture'].includes(body.source_type) || typeof body.content !== 'string' || !body.content.trim() || body.content.trim().length > 20000) return reject(400,'Invalid opportunity content');
  let content=body.content.trim();
  if(body.source_type==='url') {
    try {
      if(content.length>2048) throw new Error('Long URL');
      const url=new URL(content); const host=url.hostname.toLowerCase();
      if(!['http:','https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80','443'].includes(url.port)) || !host.includes('.') || host.endsWith('.local') || host.endsWith('.localhost') || host.endsWith('.internal') || host.startsWith('[') || /^\d+\.\d+\.\d+\.\d+$/.test(host)) throw new Error('Invalid URL');
      url.hash=''; content=url.toString();
    } catch { return reject(400,'Enter a public website link'); }
  }
  return {valid:true,request_id:body.request_id,source_type:body.source_type,content,authorization};
}
