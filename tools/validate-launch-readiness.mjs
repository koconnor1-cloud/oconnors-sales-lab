import fs from 'node:fs';

const template=fs.readFileSync('launch-readiness.html','utf8');
const production=fs.readFileSync('index.html','utf8');
const js=fs.readFileSync('assets/launch-readiness.js','utf8');
const evidence=fs.readFileSync('assets/launch-evidence.js','utf8');
const course=JSON.parse(fs.readFileSync('course-alignment/fall-2026-sales-lab.json','utf8'));
const errors=[];

for(const [label,html] of [['template',template],['production index',production]]){
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  const dup=[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))];
  if(dup.length)errors.push(`${label} duplicate HTML ids: ${dup.join(', ')}`);
  for(const name of course.retired_cases||[]){
    if(html.includes(name))errors.push(`Retired case still appears in ${label}: ${name}`);
  }
  for(const phrase of [
    'Free practice is not durably recorded',
    'Formal assigned performances are recorded only with explicit consent',
    'Camera is preview-only'
  ]) if(!html.includes(phrase))errors.push(`${label} missing required launch/privacy copy: ${phrase}`);
}

for(const name of course.retired_cases||[]){
  if(js.includes(name)||evidence.includes(name))errors.push('Retired case still appears in launch scripts: '+name);
}

const requiredScenarios=['elevator','cold','discovery','presentation','objection','commitment','integrated','interview'];
for(const key of requiredScenarios){
  if(!new RegExp(`\\b${key}:\\{`).test(js))errors.push('Missing scenario definition: '+key);
}

const forbidden=[
  "toast('Assignment sent to class!')",
  'Jamie Santos','Alex Kim','Morgan Lee','Taylor Brown','Sam Park',
  'Video + voice recording every session'
];
for(const phrase of forbidden){
  if(template.includes(phrase)||production.includes(phrase)||js.includes(phrase)||evidence.includes(phrase))errors.push('Prototype/demo content remains: '+phrase);
}

if(!js.includes("SB.rpc('create_sales_lab_assignment'"))errors.push('Teacher assignment UI is not wired to the real assignment RPC.');
if(!js.includes('APP.activeAssignment')||!js.includes('startAssignmentRecording'))errors.push('Assignment recording gate is missing.');
if(js.includes('pendingRecordings'))errors.push('Launch candidate should not queue free-practice response recordings.');
if(!js.includes("scenario:'")&&!(js.includes('scenario:APP.selectedScenario')))errors.push('Session save does not include the selected scenario.');
if(!production.includes('<script src="assets/launch-readiness.js"></script>'))errors.push('Production index does not load core launch logic.');
if(!production.includes('<script src="assets/launch-evidence.js"></script>'))errors.push('Production index does not load full-conversation evidence scoring.');

const showdown=course.showdown||[];
if(showdown.length!==5)errors.push('Course alignment source must define five Showdown stages.');
for(const stage of showdown){if(!requiredScenarios.includes(stage.scenario))errors.push('Unknown Showdown scenario: '+stage.scenario)}

if(errors.length){console.error('\nLAUNCH READINESS VALIDATION FAILED\n- '+errors.join('\n- '));process.exit(1)}
const prodIds=[...production.matchAll(/\bid="([^"]+)"/g)].length;
console.log(`Launch checks passed: production ${prodIds} unique ids, ${requiredScenarios.length} scenarios, ${showdown.length} Showdown stages.`);
