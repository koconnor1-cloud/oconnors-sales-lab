import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const source=fs.readFileSync('assets/launch-readiness.js','utf8');
const access=fs.readFileSync('assets/access360-showdown.js','utf8');
const nodes=new Map();
const classes=new Set();
const el=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',value:'test',classList:{toggle:(k,v)=>v?classes.add(k):classes.delete(k)},appendChild(){},insertAdjacentHTML(){},remove(){}});return nodes.get(id)};
const ctx=vm.createContext({console,Date,setTimeout,clearInterval,APP:{role:'student',user:{id:'student'},profile:{},activeCompetitionRound:null},el,document:{body:{classList:{toggle:(k,v)=>v?classes.add(k):classes.delete(k)}}},SCENARIOS:{discovery:{name:'Discovery'}},BUYERS:{marcus_reed:{name:'Marcus'}},formatDuration:()=>'',escapeHtml:x=>String(x),showPage:()=>{},toast:()=>{}});
for(const prefix of ['const ROUND2_ID=','function isRound2Session','function round2Active','function qualitativeOnly','function cleanCoach','async function showSavedReport','async function endSession']){
 vm.runInContext(source.split('\n').find(l=>l.startsWith(prefix)),ctx);
}
const id=vm.runInContext('ROUND2_ID',ctx);
const fakeRound={id,round_number:2,status:'open',planned_close_at:'2099-01-01'};
const report={competition_round_id:id,scenario:'discovery',character_id:'marcus_reed',overall_score:88,ai_feedback:'You scored 88/100. Ask a deeper implication question.',transcript:[]};
ctx.SB={from:()=>({select(){return this},eq(){return this},single:async()=>({data:report})})};
await vm.runInContext("showSavedReport('test')",ctx);
assert.equal(el('report-score').textContent,'—');assert(classes.has('round2-report'));assert(!el('report-feedback').textContent.includes('88'));assert(el('report-feedback').textContent.includes('implication'));
ctx.APP.role='teacher';await vm.runInContext("showSavedReport('test')",ctx);assert.equal(el('report-score').textContent,88);assert(!classes.has('round2-report'));ctx.APP.role='student';
const timeState=access.slice(access.indexOf('    function timeState'),access.indexOf('    function scoringLabel'));
vm.runInContext(timeState,ctx);
const control=access.slice(access.indexOf('    studentShowdownControl=function'),access.indexOf('    showdownControls=function'));
vm.runInContext(control,ctx);ctx.round=fakeRound;ctx.entries=[{round_id:id,student_id:'student'}];
assert(vm.runInContext('studentShowdownControl(round,entries,[])',ctx).includes('Redo Round 2'));
ctx.round={...fakeRound,planned_close_at:'2000-01-01'};assert(!vm.runInContext('studentShowdownControl(round,entries,[])',ctx).includes('Redo Round 2'));
ctx.round={...fakeRound,id:'round1'};ctx.entries=[{round_id:'round1',student_id:'student'}];assert(!vm.runInContext('studentShowdownControl(round,entries,[])',ctx).includes('Redo'));
// Save ordering and failed upload preserve the prior official entry.
for(const uploaded of [false,true]){
 const calls=[];
 Object.assign(ctx,{stopAudio(){},stopAssignmentRecording:async()=>({blob:'video'}),saveSessionCompatible:async()=>({id:'new'}),uploadAssignmentVideo:async()=>{calls.push('upload');return uploaded},showSavedReport:async()=>{},CONTEXTS:{test:'product'},SB:{rpc:async()=>{calls.push('promote');return{}},from:()=>({update(){return this},eq:async()=>({})})}});
 Object.assign(ctx.APP,{startedAt:Date.now()-1000,timer:null,cameraStream:null,activeCompetitionRound:fakeRound,recordedVoice:true,scores:{},fillers:{},history:[],profile:{},selectedScenario:'discovery',selectedBuyer:'marcus_reed'});
 await vm.runInContext('endSession()',ctx);
 assert.deepEqual(calls,uploaded?['upload','promote']:['upload']);
}
assert(access.includes('Do not read prepared sentences'));assert(access.includes('Natural eye contact'));assert(access.includes('Let the buyer finish'));
console.log('Round 2 checks passed: hidden student score, instructor score retained, qualitative feedback, retry/deadline controls, upload-before-promotion, failed-upload preservation, delivery instructions.');
