// Export only reviewed product workflows; local snapshots may contain credentials.
import {readFileSync,writeFileSync} from 'node:fs';
for(const [source,target,id] of [
  ['.local/ingest-export.json','workflows/01-ingest.json','opportunityosSlice1Ingest'],
  ['.local/understand-export.json','workflows/02-understand.json','opportunityosSlice2Understand'],
  ['.local/evaluate-export.json','workflows/03-evaluate.json','opportunityosSlice3Evaluate'],
]) {
  const exported=JSON.parse(readFileSync(source,'utf8'));
  const workflow=Array.isArray(exported)?exported.find(w=>w.id===id):exported;
  if(workflow?.id!==id||!workflow.active||workflow.activeVersionId!==workflow.versionId)throw new Error('Export must be the current published product workflow.');
  const template=JSON.parse(readFileSync(target,'utf8'));
  const nodes=structuredClone(workflow.nodes);
  for(const node of nodes) {
    delete node.credentials;
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
