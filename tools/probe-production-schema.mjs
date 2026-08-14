import fs from 'node:fs';
const url='https://yqnzdzikvtoknchpkkvl.supabase.co';
const key='sb_publishable_p-MNCebD4iaG1Bknz7ep6g_27LuiFGc';
const headers={apikey:key,Authorization:'Bearer '+key,Accept:'application/openapi+json'};
fs.mkdirSync('production-probe',{recursive:true});

const report={checked_at:new Date().toISOString(),auth_health:null,postgrest_status:null,postgrest_error:null,tables:{},rpcs:{}};
let failed=false;
try{
  const health=await fetch(url+'/auth/v1/health',{headers:{apikey:key}});
  report.auth_health=health.status;
  const schemaRes=await fetch(url+'/rest/v1/',{headers});
  report.postgrest_status=schemaRes.status;
  const raw=await schemaRes.text();
  if(!schemaRes.ok){report.postgrest_error=raw.slice(0,2000);failed=true}
  else{
    let schema;try{schema=JSON.parse(raw)}catch(e){report.postgrest_error='OpenAPI response was not JSON: '+raw.slice(0,1000);failed=true;schema={}}
    const defs=schema.definitions||schema.components?.schemas||{},paths=schema.paths||{};
    const props=name=>Object.keys(defs[name]?.properties||{}),hasRpc=name=>Object.keys(paths).some(p=>p===`/rpc/${name}`||p.endsWith(`/rpc/${name}`));
    for(const t of ['profiles','assignments','sessions','session_recordings','session_videos','competitions','competition_rounds','competition_entries'])report.tables[t]={present:!!defs[t],columns:props(t)};
    for(const f of ['create_sales_lab_assignment','set_sales_lab_assignment_published','retire_sales_lab_assignment','create_argo_sales_showdown','open_showdown_round','finalize_showdown_round','approve_session_grade','return_session_for_review'])report.rpcs[f]=hasRpc(f);
    const core=['profiles','assignments','sessions'];for(const t of core)if(!report.tables[t]?.present){report[`missing_${t}`]=true;failed=true}
    for(const c of ['title','attempts_allowed','published'])if(!report.tables.assignments?.columns?.includes(c)){(report.missing_assignment_columns??=[]).push(c);failed=true}
    if(!report.tables.sessions?.columns?.includes('assignment_id')){report.missing_sessions_assignment_id=true;failed=true}
  }
}catch(e){report.transport_error=String(e?.stack||e);failed=true}
fs.writeFileSync('production-probe/schema-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(failed)process.exit(1);
