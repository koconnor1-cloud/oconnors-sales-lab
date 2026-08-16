/* Full-conversation evidence scoring for formal assignments and Showdown entries.
   Loaded after launch-readiness.js so it can strengthen saveSessionCompatible()
   without making Week 1 free practice dependent on the advanced grading schema. */

// Password-recovery startup gate. This file loads synchronously after the core engine
// but before DOMContentLoaded, so it can prevent a valid recovery session from being
// routed into the ordinary student/instructor dashboard before the recovery UI loads.
window.SALES_LAB_RECOVERY_BOOT=/(?:[?&#])type=recovery(?:&|$)/i.test(location.search+location.hash);
if(window.SALES_LAB_RECOVERY_BOOT){
  const ordinaryLoadProfile=loadProfile;
  const handoffRecovery=async function(){
    showPage('auth-page');
    setAuthRole('teacher');
    for(let i=0;i<100;i++){
      if(typeof window.showPasswordRecovery==='function'){
        window.showPasswordRecovery();
        return true;
      }
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    authNotice('Password recovery is active, but the reset form could not be loaded. Refresh this page and use the newest reset email.','error');
    return false;
  };
  loadProfile=async function(){
    await handoffRecovery();
  };
  SB.auth.onAuthStateChange((event,session)=>{
    if(event==='PASSWORD_RECOVERY'&&session){
      APP.user=session.user;
      handoffRecovery();
    }
  });
  window.SALES_LAB_ORDINARY_LOAD_PROFILE=ordinaryLoadProfile;
}

const EVIDENCE_RUBRICS={
  elevator:[['hook',15,'Open with a relevant and memorable hook'],['identity',15,'Establish a clear professional identity'],['value',25,'Explain audience-relevant value'],['evidence',15,'Support claims with credible evidence'],['clarity',15,'Be concise, natural, and easy to follow'],['ask',15,'End with an appropriate invitation or next step']],
  cold:[['opening',15,'Earn attention and respect the prospect’s time'],['relevance',15,'Give a buyer-relevant reason for the call'],['questions',20,'Ask purposeful questions rather than pitch immediately'],['listening',15,'Respond accurately to what the buyer says'],['resistance',15,'Handle initial resistance professionally'],['communication',10,'Remain concise and buyer-centered'],['next_step',10,'Request a specific appropriate next step']],
  discovery:[['agenda',10,'Set a clear buyer-centered agenda'],['situation',10,'Establish only the context needed'],['problem',15,'Uncover meaningful problems or opportunities'],['implication',15,'Explore business consequences and significance'],['need_payoff',15,'Clarify desired outcomes or value'],['listening',15,'Follow up and adapt to buyer answers'],['decision',10,'Explore stakeholders, process, timing, or criteria'],['summary',10,'Confirm understanding and agree on a next step']],
  presentation:[['confirm',15,'Confirm buyer priorities before presenting'],['relevance',25,'Link capabilities directly to stated needs'],['evidence',15,'Use accurate proof or demonstration'],['impact',15,'Explain buyer-specific business impact'],['engagement',15,'Check understanding and invite participation'],['concerns',5,'Respond credibly to questions or concerns'],['next_step',10,'Confirm fit and an appropriate next step']],
  objection:[['acknowledge',15,'Acknowledge the concern without defensiveness'],['clarify',20,'Clarify the true objection before responding'],['response',25,'Give a relevant buyer-specific response'],['evidence',10,'Use support without invention or exaggeration'],['confirm',15,'Check whether the concern was resolved'],['advance',15,'Advance the conversation appropriately']],
  commitment:[['summary',15,'Summarize agreed needs and value'],['remaining_issue',15,'Clarify unresolved concerns or conditions'],['trade',20,'Protect value and trade rather than simply give'],['ask',25,'Make a clear authority-appropriate commitment request'],['specificity',15,'Define owner, action, and timing'],['ethics',10,'Avoid manipulation, invented urgency, or unsupported concessions']],
  integrated:[['opening',10,'Open professionally and establish an agenda'],['discovery',20,'Diagnose meaningful needs before recommending'],['listening',15,'Adapt to buyer cues and new information'],['value',20,'Connect the recommendation to confirmed needs'],['concerns',15,'Resolve resistance credibly and ethically'],['commitment',15,'Earn an appropriate specific next step'],['professionalism',5,'Maintain clarity and professional judgment throughout']],
  interview:[['professionalism',15,'Present professionally and build appropriate rapport'],['relevance',15,'Answer the question actually asked'],['examples',20,'Use specific credible examples and results'],['clarity',15,'Organize concise understandable responses'],['composure',10,'Respond confidently under pressure'],['responsiveness',10,'Listen and adapt to interviewer cues'],['readiness',15,'Demonstrate preparation, self-awareness, and fit']]
};

function evidenceJson(text){const raw=String(text||'').replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');const a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<a)throw new Error('Evidence scorer returned no structured result.');return JSON.parse(raw.slice(a,b+1))}

async function evaluateCompleteConversation(base){
  const rubric=EVIDENCE_RUBRICS[APP.selectedScenario]||EVIDENCE_RUBRICS.integrated;
  const transcript=(APP.transcript||[]).map((x,i)=>`${i+1}. ${x.role==='student'?'SELLER':'BUYER'}: ${x.text}`).join('\n');
  if(!transcript.trim())return{recommended_score:base.overall_score??0,confidence:0,criteria:[],strengths:[],priority_improvement:'No transcript was available.',flags:['missing_transcript']};
  const buyer=BUYERS[APP.selectedBuyer],scenario=SCENARIOS[APP.selectedScenario],context=CONTEXTS[document.getElementById('context-select').value];
  const prompt=`You are a conservative faculty grading assistant for a university professional-selling course. Evaluate the COMPLETE performance, not isolated turns or keyword use. Award points only when the function is demonstrated. Cite a short exact transcript excerpt for each criterion when evidence exists. Use insufficient_evidence when it cannot be judged. Penalize invented facts, unsupported guarantees, premature pitching, repetitive or leading questions, seller domination, manipulative pressure, and asking for authority the buyer does not have.\n\nSCENARIO: ${scenario.name}\nOBJECTIVE: ${scenario.mission}\nBUYER: ${buyer.name}; ${buyer.role}; ${buyer.system}\nCONTEXT: ${context}\nRUBRIC: ${JSON.stringify(rubric.map(r=>({id:r[0],max:r[1],standard:r[2]})))}\nTRANSCRIPT:\n${transcript}\n\nReturn JSON only: {"confidence":0.00,"criteria":[{"id":"","score":0,"max":0,"evidence":"exact excerpt or insufficient_evidence","reason":"brief judgment","coaching":"one next action"}],"strengths":["",""],"priority_improvement":"","flags":[]}. Criterion scores must sum to 100 maximum. Confidence below .75 or insufficient evidence must create an appropriate flag.`;
  const data=await callAI('chat',{messages:[{role:'system',content:'Return valid JSON only. Apply the rubric conservatively and cite transcript evidence.'},{role:'user',content:prompt}],max_tokens:2200});
  const result=evidenceJson(data.choices?.[0]?.message?.content),criteria=Array.isArray(result.criteria)?result.criteria:[];
  result.recommended_score=Math.max(0,Math.min(100,criteria.reduce((n,c)=>n+(Number(c.score)||0),0)));
  result.confidence=Math.max(0,Math.min(1,Number(result.confidence)||0));
  result.flags=Array.isArray(result.flags)?result.flags:[];
  if(result.confidence<.75&&!result.flags.includes('low_confidence'))result.flags.push('low_confidence');
  if(criteria.some(c=>!c.evidence||c.evidence==='insufficient_evidence')&&!result.flags.includes('insufficient_evidence'))result.flags.push('insufficient_evidence');
  return result;
}

const basicSaveSessionCompatible=saveSessionCompatible;
saveSessionCompatible=async function(base){
  if(!APP.activeAssignment&&!APP.activeCompetitionRound)return basicSaveSessionCompatible(base);
  if(APP.activeCompetitionRound)base.competition_round_id=APP.activeCompetitionRound.id;
  let evaluation;
  try{toast('Reviewing the complete conversation against the course rubric…');evaluation=await evaluateCompleteConversation(base)}catch(err){console.error('Evidence scoring unavailable',err);evaluation={recommended_score:base.overall_score??0,confidence:0,criteria:[],strengths:[],priority_improvement:'Instructor review required because evidence scoring was unavailable.',flags:['scoring_unavailable']}}
  base.overall_score=evaluation.recommended_score;
  const enhanced={...base,scoring_version:'evidence-v1',recommended_score:evaluation.recommended_score,scoring_confidence:evaluation.confidence,scoring_evidence:evaluation,review_flags:evaluation.flags,grading_status:APP.activeAssignment?'awaiting_instructor':'competition_evidence'};
  let q=await SB.from('sessions').insert(enhanced).select('id').single();
  if(!q.error)return q.data;
  if(APP.activeAssignment)throw new Error(q.error.message||'The formal assignment could not be submitted.');
  q=await SB.from('sessions').insert(base).select('id').single();
  if(q.error)throw q.error;
  return q.data;
};

renderAssignments=function(assignments,host,sessions=[],compact=false){
  if(!host)return;
  if(!assignments.length){host.innerHTML='<div class="card empty">No published assignments yet.</div>';return}
  host.innerHTML=assignments.map(a=>{
    const attempts=sessions.filter(s=>s.assignment_id===a.id);
    const allowed=Math.max(1,Number(a.attempts_allowed)||1);
    const remaining=Math.max(0,allowed-attempts.length);
    const best=attempts.map(x=>Number(x.final_grade??x.overall_score)).filter(Number.isFinite);
    const closed=remaining===0;
    return`<div class="card assignment"><div class="assignment-icon">${assignmentIcon(a.scenario)}</div><div class="assignment-body"><div class="assignment-title">${escapeHtml(a.title||SCENARIOS[a.scenario]?.name||a.scenario)}</div><div class="assignment-sub">${escapeHtml(BUYERS[a.character_id]?.name||a.character_id||'Assigned buyer')} · ${escapeHtml(a.difficulty||'Beginner')} ·${formatDue(a.due_date)}</div><div class="assignment-tags"><span class="tag tag-gray">${attempts.length}/${allowed} formal attempt${allowed===1?'':'s'} used</span>${best.length?`<span class="tag tag-green">Best ${Math.max(...best)}</span>`:''}${closed?'<span class="tag tag-gray">Submission complete</span>':''}</div>${a.instructions&&!compact?`<div class="assignment-sub">${escapeHtml(a.instructions)}</div>`:''}</div><button class="btn ${closed?'btn-outline':'btn-primary'}" ${closed?'disabled':''} onclick="startAssignment('${a.id}','${a.scenario}','${a.character_id||'marcus'}','${escapeHtml(a.product||'B2B professional service')}')">${closed?'Completed':attempts.length?'Use next attempt':'Begin'}</button></div>`
  }).join('')
};

startAssignment=async function(id,scenario,buyer,product){
  const [{data:a,error:assignmentError},{data:sessions,error:sessionError}]=await Promise.all([
    SB.from('assignments').select('*').eq('id',id).eq('active',true).single(),
    SB.from('sessions').select('id').eq('student_id',APP.user.id).eq('assignment_id',id)
  ]);
  if(assignmentError||!a)return toast('This assignment is not currently available. Refresh the page and try again.');
  if(sessionError)return toast('Could not verify your attempt history. Please try again.');
  const allowed=Math.max(1,Number(a.attempts_allowed)||1);
  if((sessions||[]).length>=allowed)return toast('You have already used all formal attempts for this assignment.');
  APP.activeAssignment=id;APP.activeCompetitionRound=null;APP.selectedScenario=scenario;APP.selectedBuyer=buyer;
  const key=Object.keys(CONTEXTS).find(k=>CONTEXTS[k]===product);if(key)el('context-select').value=key;
  renderScenarioCards();updateBriefPreview();showPage('practice-page');
};

async function restoreIncompleteAssignmentAttempt(sessionId,path){
  if(path){
    try{await SB.storage.from('assignment-videos').remove([path])}catch(e){console.warn('Partial assignment-video cleanup failed',e)}
  }
  const {error}=await SB.rpc('discard_incomplete_assignment_session',{p_session_id:sessionId});
  if(error)throw new Error('Recording upload failed and the attempt could not be automatically restored. Contact your instructor before retrying.');
  throw new Error('Recording upload failed, but your formal attempt was restored. Check your connection and try again.');
}

uploadAssignmentVideo=async function(sessionId,v){
  if(v.blob.size>150*1024*1024){
    await restoreIncompleteAssignmentAttempt(sessionId,null);
    return;
  }
  const ext=v.mimeType.includes('mp4')?'mp4':'webm';
  const path=`${APP.user.id}/${sessionId}/assignment-video.${ext}`;
  const up=await SB.storage.from('assignment-videos').upload(path,v.blob,{contentType:v.mimeType});
  if(up.error){await restoreIncompleteAssignmentAttempt(sessionId,null);return}
  const row=await SB.from('session_videos').insert({session_id:sessionId,assignment_id:APP.activeAssignment,student_id:APP.user.id,storage_path:path,mime_type:v.mimeType,size_bytes:v.blob.size,duration_seconds:v.durationSeconds,consented_at:v.consentedAt});
  if(row.error){await restoreIncompleteAssignmentAttempt(sessionId,path);return}
};

// Load the optional instructor/Showdown completion layer after the core engine is ready.
const workflowControlsScript=document.createElement('script');
workflowControlsScript.src='assets/launch-controls.js?v=20260816-analytics2';
workflowControlsScript.async=false;
document.body.appendChild(workflowControlsScript);
