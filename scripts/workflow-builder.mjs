import {readFileSync,writeFileSync} from 'node:fs';
export function workflowBuilder(id,name){
 const runtime=process.argv.includes('--runtime');
 const config=runtime?parseRuntimeConfig(readFileSync(new URL('../web/.env.local',import.meta.url),'utf8')):{};
 const nodes=[],connections={};
 const credentials=(type,idKey,nameKey)=>{if(!runtime)return undefined;if(!config[idKey]||!config[nameKey])throw new Error('Missing credential reference: '+idKey);return {[type]:{id:config[idKey],name:config[nameKey]}};};
 const db=credentials('postgres','N8N_POSTGRES_CREDENTIAL_ID','N8N_POSTGRES_CREDENTIAL_NAME');
 function add(id,name,type,version,x,y,parameters,extra={}){nodes.push({id,name,type:type.includes('.')?type:'n8n-nodes-base.'+type,typeVersion:version,position:[x,y],parameters,...extra});}
 function link(from,to,index=0){connections[from]??={main:[]};connections[from].main[index]??=[];connections[from].main[index].push({node:to,type:'main',index:0});}
 function pg(id,name,x,y,query,values){add(id,name,'postgres',2.6,x,y,{operation:'executeQuery',query,options:values?{queryReplacement:values}:{}},db?{credentials:db}:{});}
 function code(id,name,x,y,jsCode){add(id,name,'code',2,x,y,{jsCode});}
 function branch(id,name,x,y,expression){add(id,name,'if',2.2,x,y,{conditions:{options:{caseSensitive:true,typeValidation:'strict',version:2},conditions:[{id,leftValue:expression,rightValue:true,operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}});}
 function child(id,name,x,y,workflowId){add(id,name,'executeWorkflow',1.3,x,y,{source:'database',workflowId:{__rl:true,value:workflowId,mode:'id'},mode:'each',options:{waitForSubWorkflow:false}});}
 function save(file,settings={}){const w={id,name,active:false,settings:{executionOrder:'v1',executionTimeout:480,saveDataSuccessExecution:'none',saveDataErrorExecution:'none',saveManualExecutions:false,timezone:'Asia/Kolkata',...(id!=='opportunityosSlice5ErrorHandler'?{errorWorkflow:'opportunityosSlice5ErrorHandler'}:{}),...settings},nodes,connections,pinData:{},tags:[]};writeFileSync(new URL(runtime?'../.local/'+file.replace('.json','.runtime.json'):'../workflows/'+file,import.meta.url),JSON.stringify(w,null,2)+'\n');return w;}
 return {runtime,config,nodes,connections,credentials,add,link,pg,code,branch,child,save};
}
export function parseRuntimeConfig(text){return Object.fromEntries(text.split(/\r?\n/).filter(l=>/^[A-Z_][A-Z0-9_]*=/.test(l)).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1).trim().replace(/^=/,'')]));}
