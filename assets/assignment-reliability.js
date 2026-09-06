/* Assignment reliability patch — September 6, 2026.
   Protects formal attempts from duplicate saves and AI-service failures,
   uses the existing client_submission_id idempotency constraint, and keeps
   the student dashboard's formal-attempt display consistent with Assignments. */

(function installAssignmentReliability(){
  if(typeof APP==='undefined'||typeof SB==='undefined'||typeof saveSessionCompatible!=='function')return;

  function newSubmissionId(){
    if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
    return 'sl-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2);
  }

  APP.assignmentTechnicalFailure=false;
  APP.clientSubmissionId=APP.clientSubmissionId||newSubmissionId();
  APP.sessionSaveInFlight=false;

  const reliabilityCoreResetSession=resetSession;
  resetSession=function(...args){
    const result=reliabilityCoreResetSession(...args);
    APP.assignmentTechnicalFailure=false;
    APP.clientSubmissionId=newSubmissionId();
    APP.sessionSaveInFlight=false;
    return result;
  };

  const reliabilityCoreCallAI=callAI;
  callAI=async function(type,payload){
    try{
      return await reliabilityCoreCallAI(type,payload);
    }catch(err){
      if(APP.activeAssignment&&(type==='chat'||type==='transcribe'))APP.assignmentTechnicalFailure=true;
      throw err;
    }
  };

  const reliabilityPracticeSave=(typeof basicSaveSessionCompatible==='function')?basicSaveSessionCompatible:null;
  saveSessionCompatible=async function(base){
    if(!APP.activeAssignment&&!APP.activeCompetitionRound){
      if(reliabilityPracticeSave)return reliabilityPracticeSave(base);
      const q=await SB.from('sessions').insert(base).select('id').single();
      if(q.error)throw q.error;
      return q.data;
    }

    if(APP.activeCompetitionRound)base.competition_round_id=APP.activeCompetitionRound.id;

    if(APP.activeAssignment&&APP.assignmentTechnicalFailure){
      throw new Error('The AI service was interrupted during this formal assignment. This attempt was not counted. Please try again.');
    }

    let evaluation;
    try{
      toast('Reviewing the complete conversation against the course rubric…');
      evaluation=await evaluateCompleteConversation(base);
    }catch(err){
      console.error('Evidence scoring unavailable',err);
      if(APP.activeAssignment){
        throw new Error('The AI grading service was unavailable. This formal attempt was not counted. Please try again.');
      }
      evaluation={recommended_score:base.overall_score??0,confidence:0,criteria:[],strengths:[],priority_improvement:'Instructor review required because evidence scoring was unavailable.',flags:['scoring_unavailable']};
    }

    base.overall_score=evaluation.recommended_score;
    if(APP.activeAssignment){
      APP.clientSubmissionId=APP.clientSubmissionId||newSubmissionId();
      base.client_submission_id=APP.clientSubmissionId;
    }

    const enhanced={...base,scoring_version:'evidence-v1',recommended_score:evaluation.recommended_score,scoring_confidence:evaluation.confidence,scoring_evidence:evaluation,review_flags:evaluation.flags,grading_status:APP.activeAssignment?'awaiting_instructor':'competition_evidence'};
    let q=await SB.from('sessions').insert(enhanced).select('id').single();
    if(!q.error)return q.data;

    const msg=String(q.error.message||'');
    if(APP.activeAssignment&&base.client_submission_id&&/duplicate key|sessions_formal_submission_idempotency_idx/i.test(msg)){
      const existing=await SB.from('sessions').select('id').eq('student_id',APP.user.id).eq('assignment_id',APP.activeAssignment).eq('client_submission_id',base.client_submission_id).maybeSingle();
      if(!existing.error&&existing.data?.id)return existing.data;
    }

    if(APP.activeAssignment)throw new Error(msg||'The formal assignment could not be submitted.');
    q=await SB.from('sessions').insert(base).select('id').single();
    if(q.error)throw q.error;
    return q.data;
  };

  const reliabilityCoreEndSession=endSession;
  endSession=async function(...args){
    if(APP.sessionSaveInFlight)return;
    APP.sessionSaveInFlight=true;
    const button=document.querySelector('#arena-page .btn-danger');
    const oldText=button?.textContent;
    if(button){button.disabled=true;button.textContent='Saving…'}
    try{
      return await reliabilityCoreEndSession(...args);
    }finally{
      APP.sessionSaveInFlight=false;
      if(button){button.disabled=false;button.textContent=oldText||'End & save'}
    }
  };

  loadStudentHome=async function(){
    if(!APP.user)return;
    el('student-name').textContent=(APP.profile?.full_name||'Student').split(' ')[0];
    const [sr,ar]=await Promise.all([
      SB.from('sessions').select('overall_score,duration_seconds,created_at,assignment_id').eq('student_id',APP.user.id).order('created_at',{ascending:false}),
      SB.from('assignments').select('*').eq('active',true).order('due_date',{ascending:true}).limit(2)
    ]);
    const sessions=sr.data||[],scores=sessions.map(s=>Number(s.overall_score)).filter(Number.isFinite);
    el('home-best').textContent=scores.length?Math.max(...scores):'—';
    el('home-attempts').textContent=sessions.length;
    el('home-time').textContent=formatMinutes(sessions.reduce((n,s)=>n+(s.duration_seconds||0),0));
    renderAssignments(ar.data||[],el('home-assignments'),sessions,true);
    const next=el('next-step');
    if((ar.data||[]).length)next.innerHTML='<strong>Your next required step:</strong> '+escapeHtml(ar.data[0].title||SCENARIOS[ar.data[0].scenario]?.name||'Sales Lab assignment')+'.';
    else next.innerHTML='<strong>Week 1 focus:</strong> Complete an ungraded Elevator Pitch baseline, review the feedback, and identify one improvement goal.';
  };

  const scoreLabel=document.querySelector('#arena-page .score-big span');
  if(scoreLabel)scoreLabel.textContent='Live coaching score (provisional)';
})();
