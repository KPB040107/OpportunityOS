import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {prepareDiscoveryBatch,summarizeDiscoveryBatch} from './discovery-batch.mjs';
const source={run_id:'run',lease_token:'lease',config:{company:'test'},cursor_state:{offset:10}};
test('cursor wraps on shortened and exhausted feed, empty feed finishes',()=>{
 const batch=prepareDiscoveryBatch(source,{statusCode:200,body:[{id:1}]},x=>x,'array');
 assert.equal(batch[0].json.item.id,1);assert.equal(batch[0].json.next_cursor.offset,0);
 const empty=prepareDiscoveryBatch(source,{body:[]},x=>x,'array');
 assert.equal(summarizeDiscoveryBatch([],empty).status,'ok');assert.equal(summarizeDiscoveryBatch([],empty).found,0);
});
test('HTTP, format, rejected saves do not become successful scans',()=>{
 for(const response of [{statusCode:429,body:[]},{error:'timeout'},{body:{message:'unavailable'}}]){
  assert.equal(summarizeDiscoveryBatch([],prepareDiscoveryBatch(source,response,x=>x,'array')).status,'error');
 }
 assert.equal(summarizeDiscoveryBatch([{json:{result:{saved:false,error:'lease'}}}],[{json:{...source,item:{}}}]).status,'error');
});
test('rescan counts new, updated and unchanged independently',()=>{
 const result=summarizeDiscoveryBatch([{json:{result:{saved:true,was_created:true}}},{json:{result:{saved:true,was_updated:true}}},{json:{result:{saved:true}}}],[{json:{...source,item:{},next_cursor:{offset:0}}}]);
 assert.equal(result.added,1);assert.equal(result.updated,1);
});
test('exported n8n converters execute without missing helper dependencies',()=>{
 const w=JSON.parse(readFileSync(new URL('../workflows/08-discovery.json',import.meta.url)));
 const samples={
  lever:[{id:'1',text:'Software Internship',descriptionPlain:'Required: Python',categories:{commitment:'Intern'}}],
  greenhouse:{jobs:[{id:1,title:'Software Internship',content:'Python',absolute_url:'https://example.com/job',location:{name:'Remote'}}]},
  ashby:{jobs:[{id:'1',title:'Software Internship',descriptionPlain:'Python',jobUrl:'https://example.com/job',applyUrl:'https://example.com/apply',location:'Remote'}]},
  devpost:{hackathons:[{id:1,title:'Test Hackathon',url:'https://devpost.com/test',submission_period_dates:'Oct 16 - 30, 2026'}]},
  jsearch_nested:{data:{jobs:[{job_id:'1',job_title:'Software Internship',employer_name:'Test',job_description:'Python',job_apply_link:'https://example.com/job'}]}},
  jsearch_flat:{data:[{job_id:'2',job_title:'Frontend Internship',employer_name:'Test Flat',job_description:'React',job_apply_link:'https://example.com/job2'}]}
 };
 for(const [name,body] of Object.entries(samples)) {
  const adapter = name.startsWith('jsearch') ? 'jsearch' : name;
  const node=w.nodes.find(n=>n.id===`normalize-${adapter}`);
  const run=new Function('$input','$','require',node.parameters.jsCode);
  const result=run({first:()=>({json:{statusCode:200,body}})},()=>({first:()=>({json:source})}),createRequire(import.meta.url));
  assert.ok(result[0].json.item,`${adapter}: ${JSON.stringify(result)}`);
  assert.ok(Array.isArray(result[0].json.item.evidence),`${adapter} must have evidence array`);
  assert.ok(result[0].json.item.evidence.length > 0,`${adapter} evidence must not be empty`);
 }
});
