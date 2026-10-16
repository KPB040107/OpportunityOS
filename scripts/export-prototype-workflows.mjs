// Export only reviewed product workflows; local snapshots may contain credentials.
import {readFileSync,writeFileSync} from 'node:fs';
const current=JSON.parse(readFileSync('.local/prototype-live-export.json','utf8'));
const targets = [
  ['workflows/01-ingest.json','opportunityosSlice1Ingest'],
  ['workflows/02-understand.json','opportunityosSlice2Understand'],
  ['workflows/03-evaluate.json','opportunityosSlice3Evaluate'],
  ['workflows/04-act.json','opportunityosSlice4Act'],
  ['workflows/05-ask-and-approve.json','opportunityosSlice4Ask'],
  ['workflows/06-autopilot.json','opportunityosSlice5Autopilot'],
  ['workflows/07-error-handler.json','opportunityosSlice5ErrorHandler'],
];
if (Array.isArray(current) && current.some(w => w.id === 'opportunityosSlice2Discovery')) {
  targets.push(['workflows/08-discovery.json', 'opportunityosSlice2Discovery']);
}
for(const [target,id] of targets) {
  const exported=current;
  const workflow=Array.isArray(exported)?exported.find(w=>w.id===id):exported;
  if(workflow?.id!==id||!workflow.active||workflow.activeVersionId!==workflow.versionId)throw new Error('Export must be the current published product workflow.');
  const template=JSON.parse(readFileSync(target,'utf8'));
  const nodes=structuredClone(workflow.nodes);
  for(const node of nodes) {
    delete node.credentials;
    const reference=template.nodes.find(n=>n.id===node.id);
    if(node.parameters.calendar)node.parameters.calendar=structuredClone(reference.parameters.calendar);
    if(node.id==='get-event')node.parameters.url=reference.parameters.url;
    if(node.id==='ingest-auth') {
      node.parameters.url='https://YOUR-PROJECT.supabase.co/auth/v1/user';
      node.parameters.headerParameters.parameters.find(h=>h.name==='apikey').value='YOUR-PUBLIC-PUBLISHABLE-KEY';
    }
  }
  // Verify exports match the reproducible generators before replacing them.
  if(JSON.stringify(nodes)!==JSON.stringify(template.nodes)||JSON.stringify(workflow.connections)!==JSON.stringify(template.connections)||JSON.stringify(workflow.settings)!==JSON.stringify(template.settings))throw new Error(`Live workflow differs from its reviewed generator: ${id}`);
  writeFileSync(target,JSON.stringify({id:workflow.id,name:workflow.name,active:false,settings:workflow.settings,nodes,connections:workflow.connections,pinData:{},tags:[]},null,2)+'\n');
  console.log(`Saved portable published export: ${target}`);
}
