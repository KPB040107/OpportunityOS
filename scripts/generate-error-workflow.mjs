import {workflowBuilder} from './workflow-builder.mjs';
import {createAutopilotContract} from './autopilot-contract.mjs';
const b=workflowBuilder('opportunityosSlice5ErrorHandler','OpportunityOS 07 Error Handler');
b.add('trigger','Catch an uncaught workflow error','errorTrigger',1,0,0,{});
b.code('sanitize','Remove secrets with the shared sanitizer',250,0,`const c=(${createAutopilotContract.toString()})();return $input.all().map(i=>{const r=i.json,e=r.execution?.error||r.trigger?.error||{};return {json:{execution_id:r.execution?.id||'',workflow:r.workflow?.name||'Unknown workflow',node:r.execution?.lastNodeExecuted||e.node?.name||(r.trigger?'Trigger':'Unknown node'),message:c.sanitizeErrorMessage(e.message||e.cause?.message||'Workflow failed')}};});`);
b.pg('log','Log owned failure and queue its notification',500,0,'select public.worker_record_error($1::text,$2::text,$3::text,$4::text) as result;','={{ [$json.execution_id,$json.workflow,$json.node,$json.message] }}');
b.link('Catch an uncaught workflow error','Remove secrets with the shared sanitizer');b.link('Remove secrets with the shared sanitizer','Log owned failure and queue its notification');
b.add('note','Error ownership boundary','stickyNote',1,200,-230,{content:'## Error → shared redaction → private execution ownership → owned activity\nUnattributed system errors stay inaccessible to users. Matching/action errors are mapped to their owner, logged and queued for notification through the Act worker. No raw credentials or execution inputs are copied. This workflow never recursively invokes itself.',width:1000,height:170});
b.save('07-error-handler.json');
