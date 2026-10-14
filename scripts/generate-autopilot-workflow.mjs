import {workflowBuilder} from './workflow-builder.mjs';
const b=workflowBuilder('opportunityosSlice5Autopilot','OpportunityOS 06 Autopilot');
b.add('daily','Scan daily at nine IST with bounded recovery','scheduleTrigger',1.2,0,0,{rule:{interval:[{field:'cronExpression',expression:'0 * * * *'}]}});
b.add('trigger','Run a controlled daily scan','executeWorkflowTrigger',1.1,0,160,{inputSource:'passthrough'});
b.add('manual','Rehearse the daily scan','manualTrigger',1,0,-160,{});
b.pg('scan','Queue owned reminders and record each user heartbeat',250,0,'select public.worker_check_and_run_autopilot(false) as result;');
// One row per user. The action worker performs effects and records actual delivery.
b.code('summary','Return honest queued counts',500,0,'return $input.all().map(i=>({json:{...i.json.result,delivery:"Queued actions are not completed deliveries"}}));');
for(const n of ['Scan daily at nine IST with bounded recovery','Run a controlled daily scan','Rehearse the daily scan'])b.link(n,'Queue owned reminders and record each user heartbeat');
b.link('Queue owned reminders and record each user heartbeat','Return honest queued counts');
b.add('note','Autopilot delivery boundary','stickyNote',1,220,-340,{content:'## Daily at 09:00 Asia/Kolkata with Bounded Recovery\nProcess every user; queue deadline reminders and due follow-ups with stable keys. If the service is started after 09:00 IST or missed, the bounded recovery executes the missed scan safely once today. The Act worker leases each job, sends from the agent mailbox, and records actual results. Follow-ups remain pending until the side effect succeeds. Quota/profile/day changes remain fenced. A heartbeat confirms the scan, not email delivery.',width:900,height:180});
b.save('06-autopilot.json');
