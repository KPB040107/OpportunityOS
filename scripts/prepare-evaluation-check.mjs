// Manual-only fixture diagnostic, never exported as a product workflow.
import {readFileSync,writeFileSync} from 'node:fs';
const demo=JSON.parse(readFileSync('.local/slice3-demo.json','utf8'));
const proof=JSON.parse(readFileSync('.local/slice3-demo-proof.json','utf8'));
const route=process.argv[2];if(!['ACT','ASK','IGNORE'].includes(route))throw new Error('Choose ACT, ASK or IGNORE.');
const target=proof.matches.find(m=>m.decision===route);
if(!target||![demo.user,target.id].every(v=>/^[0-9a-f-]{36}$/.test(v)))throw new Error('Verified fixture is missing.');
const w=JSON.parse(readFileSync('.local/03-evaluate.runtime.json','utf8'));
w.id='opportunityosSlice3SwitchCheck';w.name='OpportunityOS TEST Slice 3 Switch - fictional fixtures only';
w.nodes=w.nodes.filter(n=>!['trigger','schedule'].includes(n.id));
delete w.connections['Evaluate saved opportunities'];delete w.connections['Check evaluations and deadline changes'];
const claim=w.nodes.find(n=>n.id==='claim');
claim.parameters.query=`with queued as materialized (select public.enqueue_evaluation(user_id,id) from public.opportunities where user_id='${demo.user}'::uuid and id='${target.id}'::uuid) select public.claim_evaluation('${target.id}'::uuid) as result from queued;`;
claim.parameters.options={};
writeFileSync('.local/slice3-switch-check.json',JSON.stringify(w));
console.log(`Prepared manual-only ${route} branch verification using the same product nodes.`);
