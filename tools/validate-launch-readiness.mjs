import fs from 'node:fs';

const html=fs.readFileSync('launch-readiness.html','utf8');
const js=fs.readFileSync('assets/launch-readiness.js','utf8');
const course=JSON.parse(fs.readFileSync('course-alignment/fall-2026-sales-lab.json','utf8'));
const errors=[];

const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
const dup=[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))];
if(dup.length)errors.push('Duplicate HTML ids: '+dup.join(', '));

for(const name of course.retired_cases||[]){
  if(html.includes(name)||js.includes(name))errors.push('Retired case still appears in launch candidate: '+name);
}

const requiredScenarios=['elevator','cold','discovery','presentation','objection','commitment','integrated','interview'];
for(const key of requiredScenarios){
  if(!new RegExp(`\\b${key}:\\{`).test(js))errors.push('Missing scenario definition: '+key);
}

const requiredPhrases=[
  'Free practice is not durably recorded',
  'Formal assigned performances are recorded only with explicit consent',
  'Camera is preview-only'
];
for(const phrase of requiredPhrases){
  if(!html.includes(phrase))errors.push('Missing required launch/privacy copy: '+phrase);
}

const forbidden=[
  "toast('Assignment sent to class!')",
  'Jamie Santos','Alex Kim','Morgan Lee','Taylor Brown','Sam Park',
  'Video + voice recording every session'
];
for(const phrase of forbidden){
  if(html.includes(phrase)||js.includes(phrase))errors.push('Prototype/demo content remains: '+phrase);
}

if(!js.includes("SB.rpc('create_sales_lab_assignment'"))errors.push('Teacher assignment UI is not wired to the real assignment RPC.');
if(!js.includes('APP.activeAssignment')||!js.includes('startAssignmentRecording'))errors.push('Assignment recording gate is missing.');
if(js.includes('pendingRecordings'))errors.push('Launch candidate should not queue free-practice response recordings.');
if(!js.includes("scenario:'")&&!(js.includes('scenario:APP.selectedScenario')))errors.push('Session save does not include the selected scenario.');

const showdown=course.showdown||[];
if(showdown.length!==5)errors.push('Course alignment source must define five Showdown stages.');
for(const stage of showdown){if(!requiredScenarios.includes(stage.scenario))errors.push('Unknown Showdown scenario: '+stage.scenario)}

if(errors.length){console.error('\nLAUNCH READINESS VALIDATION FAILED\n- '+errors.join('\n- '));process.exit(1)}
console.log(`Launch candidate checks passed: ${ids.length} unique ids, ${requiredScenarios.length} scenarios, ${showdown.length} Showdown stages.`);
