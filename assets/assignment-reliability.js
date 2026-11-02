/* Assignment reliability + scoring alignment patch — October 25, 2026.
   Protects formal attempts from duplicate saves and AI-service failures,
   preserves completed graded sessions if recording upload fails, and makes
   practice and formal assignments use the same full-conversation rubric for
   the final student-visible score. Live turn-by-turn coaching remains formative. */

(function installAssignmentReliability(){
  if(typeof APP==='undefined'||typeof SB==='undefined'||typeof saveSessionCompatible!=='function')return;

  function newSubmissionId(){
    if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
    return 'sl-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2);
  }

  async function flagRecordingIssue(sessionId,issue){
    try{
      const {error}=await SB.rpc('flag_official_video_issue',{p_session_id:sessionId,p_issue:issue||'video_upload_failed'});
      if(error)console.warn('Could not flag official video issue',error);
    }catch(err){
      console.warn('Could not flag official video issue',err);
    }
  }

  function clampScore(v){
    const n=Number(v);
    return Number.isFinite(n)?Math.max(0,Math.min(100,Math.round(n))):null;
  }

  function finalFeedback(evaluation){
    const strengths=Array.isArray(evaluation?.strengths)?evaluation.strengths.filter(Boolean):[];
    const improvement=String(evaluation?.priority_improvement||'').trim();
    const parts=[];
    if(strengths.length)parts.push('Strengths: '+strengths.slice(0,2).join('; '));
    if(improvement)parts.push('Priority improvement: '+improvement);
    return parts.join(' ');
  }

  APP.assignmentTechnicalFailure=false;
  APP.assignmentUploadWarning=null;
  APP.clientSubmissionId=APP.clientSubmissionId||newSubmissionId();
  APP.sessionSaveInFlight=false;
  APP.lockedAssignmentConfig=APP.lockedAssignmentConfig||null;
  APP.lockedCompetitionConfig=APP.lockedCompetitionConfig||null;

  function syncAssignmentLockUI(){
    const locked=!!APP.activeAssignment||!!APP.activeCompetitionRound;
    document.querySelectorAll('.scenario-card,.buyer-card').forEach(button=>{button.disabled=locked;});
    const contextSelect=el('context-select');
    if(contextSelect)contextSelect.disabled=locked;
  }

  const reliabilityCoreRenderScenarioCards=renderScenarioCards;
  renderScenarioCards=function(...args){
    const result=reliabilityCoreRenderScenarioCards(...args);
    syncAssignmentLockUI();
    return result;
  };

  const reliabilityCoreStartAssignment=startAssignment;
  startAssignment=async function(id,scenario,buyer,product){
    const result=await reliabilityCoreStartAssignment(id,scenario,buyer,product);
    if(APP.activeAssignment===id){
      APP.lockedAssignmentConfig={id,scenario,buyer,product};
      APP.selectedScenario=scenario;
      APP.selectedBuyer=buyer;
      const contextKey=Object.keys(CONTEXTS).find(k=>CONTEXTS[k]===product);
      if(contextKey&&el('context-select'))el('context-select').value=contextKey;
      renderScenarioCards();
      updateBriefPreview();
      syncAssignmentLockUI();
      toast('Formal assignment loaded. Scenario, buyer, and context are locked for this attempt.');
    }
    return result;
  };

  const reliabilityCoreStartShowdown=startShowdown;
  startShowdown=async function(id){
    const result=await reliabilityCoreStartShowdown(id);
    if(APP.activeCompetitionRound?.id===id){
      const r=APP.activeCompetitionRound;
      APP.lockedCompetitionConfig={id:r.id,scenario:r.scenario,buyer:r.character_id||'patricia',product:r.product};
      APP.selectedScenario=r.scenario;
      APP.selectedBuyer=r.character_id||'patricia';
      renderScenarioCards();
      updateBriefPreview();
      syncAssignmentLockUI();
      toast('Official Showdown attempt loaded. Scenario, buyer, and context are locked.');
    }
    return result;
  };

  const reliabilityCoreChooseScenario=chooseScenario;
  chooseScenario=function(k){
    if(APP.activeAssignment&&APP.lockedAssignmentConfig&&k!==APP.lockedAssignmentConfig.scenario){
      toast('This formal assignment is locked to '+(SCENARIOS[APP.lockedAssignmentConfig.scenario]?.name||APP.lockedAssignmentConfig.scenario)+'. Use free practice for another scenario.');
      return;
    }
    if(APP.activeCompetitionRound&&APP.lockedCompetitionConfig&&k!==APP.lockedCompetitionConfig.scenario){
      toast('This Showdown round is locked to '+(SCENARIOS[APP.lockedCompetitionConfig.scenario]?.name||APP.lockedCompetitionConfig.scenario)+'.');
      return;
    }
    return reliabilityCoreChooseScenario(k);
  };

  const reliabilityCoreChooseBuyer=chooseBuyer;
  chooseBuyer=function(k){
    if(APP.activeAssignment&&APP.lockedAssignmentConfig&&k!==APP.lockedAssignmentConfig.buyer){
      toast('The buyer is fixed for this formal assignment.');
      return;
    }
    if(APP.activeCompetitionRound&&APP.lockedCompetitionConfig&&k!==APP.lockedCompetitionConfig.buyer){
      toast('The buyer is fixed for this Showdown round.');
      return;
    }
    return reliabilityCoreChooseBuyer(k);
  };

  const reliabilityCoreStartFreePractice=startFreePractice;
  startFreePractice=function(...args){
    APP.lockedAssignmentConfig=null;
    APP.lockedCompetitionConfig=null;
    const result=reliabilityCoreStartFreePractice(...args);
    syncAssignmentLockUI();
    return result;
  };

  const reliabilityCoreResetSession=resetSession;
  resetSession=function(...args){
    const result=reliabilityCoreResetSession(...args);
    APP.assignmentTechnicalFailure=false;
    APP.assignmentUploadWarning=null;
    APP.clientSubmissionId=newSubmissionId();
    APP.sessionSaveInFlight=false;
    return result;
  };

  const reliabilityCoreCallAI=callAI;
  callAI=async function(type,payload){
    try{
      return await reliabilityCoreCallAI(type,payload);
    }catch(err){
      if((APP.activeAssignment||APP.activeCompetitionRound)&&(type==='chat'||type==='transcribe'))APP.assignmentTechnicalFailure=true;
      throw err;
    }
  };

  saveSessionCompatible=async function(base){
    if(APP.activeCompetitionRound)base.competition_round_id=APP.activeCompetitionRound.id;

    let assignmentMismatchSavedAsPractice=false;
    let competitionMismatchSavedAsPractice=false;
    if(APP.activeAssignment){
      const assignmentCheck=await SB.from('assignments')
        .select('id,title,scenario,character_id,product,active,published')
        .eq('id',APP.activeAssignment)
        .maybeSingle();
      if(assignmentCheck.error||!assignmentCheck.data){
        throw new Error('The formal assignment could not be verified. This attempt was not counted. Please refresh and try again.');
      }
      const expected=assignmentCheck.data;
      if(!expected.active||!expected.published){
        throw new Error('This formal assignment is no longer open. This attempt was not counted.');
      }
      if(base.scenario!==expected.scenario){
        assignmentMismatchSavedAsPractice=true;
        base.assignment_id=null;
        base.client_submission_id=null;
        APP.activeAssignment=null;
        APP.lockedAssignmentConfig=null;
        syncAssignmentLockUI();
        APP.assignmentUploadWarning='Your score was saved as practice because the selected scenario did not match the formal assignment. No formal attempt was used.';
      }
    }

    if(APP.activeCompetitionRound){
      const roundCheck=await SB.from('competition_rounds')
        .select('id,competition_id,scenario,character_id,product,status,opens_at,planned_open_at,planned_close_at')
        .eq('id',APP.activeCompetitionRound.id)
        .maybeSingle();
      if(roundCheck.error||!roundCheck.data){
        throw new Error('The Showdown round could not be verified. This attempt was not counted. Please refresh and try again.');
      }
      const expectedRound=roundCheck.data;
      const compCheck=await SB.from('competitions')
        .select('id,status')
        .eq('id',expectedRound.competition_id)
        .maybeSingle();
      if(compCheck.error||!compCheck.data||compCheck.data.status!=='active'||expectedRound.status!=='open'||!expectedRound.opens_at){
        throw new Error('This Showdown round is not currently open. This attempt was not counted.');
      }
      const now=Date.now();
      if(expectedRound.planned_open_at&&now<new Date(expectedRound.planned_open_at).getTime()){
        throw new Error('This Showdown round has not opened yet. This attempt was not counted.');
      }
      if(expectedRound.planned_close_at&&now>new Date(expectedRound.planned_close_at).getTime()){
        throw new Error('The submission window for this Showdown round has closed. This attempt was not counted.');
      }
      if(base.scenario!==expectedRound.scenario||base.character_id!==(expectedRound.character_id||base.character_id)||base.product!==expectedRound.product){
        competitionMismatchSavedAsPractice=true;
        base.competition_round_id=null;
        base.client_submission_id=null;
        APP.activeCompetitionRound=null;
        APP.lockedCompetitionConfig=null;
        syncAssignmentLockUI();
        APP.assignmentUploadWarning='Your score was saved as practice because the session configuration did not match the official Showdown round. No official Showdown entry was used.';
      }
    }

    if((APP.activeAssignment||APP.activeCompetitionRound)&&APP.assignmentTechnicalFailure){
      throw new Error('The AI service was interrupted during this formal assignment. This attempt was not counted. Please try again.');
    }

    if((APP.activeAssignment||APP.activeCompetitionRound)&&Number(base.turn_count||0)<1){
      throw new Error('No student response was captured. This official attempt was not counted. Please try again.');
    }

    const liveScore=clampScore(base.overall_score);
    let evaluation;
    try{
      toast(APP.activeCompetitionRound
        ? 'Scoring the complete Showdown performance with the round rubric…'
        : APP.activeAssignment
          ? 'Scoring the complete conversation with the assignment rubric…'
          : 'Scoring the complete practice conversation with the same rubric used for assignments…');
      evaluation=await evaluateCompleteConversation(base);
    }catch(err){
      console.error('Full-conversation rubric scoring unavailable',err);
      if(APP.activeAssignment||APP.activeCompetitionRound){
        throw new Error('Final rubric scoring was interrupted. This official attempt was not counted. Please try again.');
      }
      evaluation={
        recommended_score:liveScore??0,
        confidence:0,
        criteria:[],
        strengths:[],
        priority_improvement:'Full-conversation scoring was temporarily unavailable; this practice score used the live coaching fallback.',
        flags:['scoring_unavailable']
      };
    }

    const rubricScore=clampScore(evaluation?.recommended_score);
    const authoritativeScore=rubricScore??liveScore??0;
    const reviewFlags=Array.isArray(evaluation?.flags)?[...evaluation.flags]:[];
    if(assignmentMismatchSavedAsPractice&&!reviewFlags.includes('assignment_configuration_mismatch_saved_as_practice')){
      reviewFlags.push('assignment_configuration_mismatch_saved_as_practice');
    }
    if(competitionMismatchSavedAsPractice&&!reviewFlags.includes('showdown_configuration_mismatch_saved_as_practice')){
      reviewFlags.push('showdown_configuration_mismatch_saved_as_practice');
    }
    if(liveScore!==null&&rubricScore!==null&&Math.abs(liveScore-rubricScore)>=15&&!reviewFlags.includes('live_rubric_score_variance')){
      reviewFlags.push('live_rubric_score_variance');
    }

    const scoringEvidence={
      ...(evaluation||{}),
      live_coaching_score:liveScore,
      final_rubric_score:authoritativeScore,
      student_visible_score:authoritativeScore,
      scoring_policy:'full_conversation_rubric_v2'
    };

    base.overall_score=authoritativeScore;
    if(APP.activeAssignment||APP.activeCompetitionRound){
      APP.clientSubmissionId=APP.clientSubmissionId||newSubmissionId();
      base.client_submission_id=APP.clientSubmissionId;
    }

    const enhanced={
      ...base,
      ai_feedback:finalFeedback(evaluation)||base.ai_feedback||null,
      scoring_version:'full-conversation-rubric-v2',
      recommended_score:authoritativeScore,
      scoring_confidence:Number(evaluation?.confidence)||0,
      scoring_evidence:scoringEvidence,
      review_flags:reviewFlags,
      grading_status:APP.activeAssignment?'awaiting_instructor':APP.activeCompetitionRound?'competition_evidence':'practice_feedback'
    };

    let q=await SB.from('sessions').insert(enhanced).select('id').single();
    if(!q.error)return q.data;

    const msg=String(q.error.message||'');
    if(APP.activeAssignment&&base.client_submission_id&&/duplicate key|sessions_formal_submission_idempotency_idx/i.test(msg)){
      const existing=await SB.from('sessions').select('id').eq('student_id',APP.user.id).eq('assignment_id',APP.activeAssignment).eq('client_submission_id',base.client_submission_id).maybeSingle();
      if(!existing.error&&existing.data?.id)return existing.data;
    }
    if(APP.activeCompetitionRound&&base.client_submission_id&&/duplicate key|sessions_showdown_submission_idempotency_idx/i.test(msg)){
      const existing=await SB.from('sessions').select('id').eq('student_id',APP.user.id).eq('competition_round_id',APP.activeCompetitionRound.id).eq('client_submission_id',base.client_submission_id).maybeSingle();
      if(!existing.error&&existing.data?.id)return existing.data;
    }

    throw new Error(msg||'The session could not be submitted.');
  };

  /* A completed assignment session is the authoritative save. Recording upload is
     a secondary artifact. Never delete a valid score/transcript just because the
     large video transfer fails after the database insert. */
  if(typeof uploadAssignmentVideo==='function'){
    uploadAssignmentVideo=async function(sessionId,v){
      if(!v?.blob)return true;
      const showdown=!!APP.activeCompetitionRound;
      const label=showdown?'Showdown':'assignment';

      if(v.blob.size>150*1024*1024){
        APP.assignmentUploadWarning='Your score and transcript were saved, but the '+label+' recording was too large to upload. The issue was flagged for your instructor.';
        await flagRecordingIssue(sessionId,'video_too_large');
        return false;
      }

      const ext=v.mimeType.includes('mp4')?'mp4':'webm';
      const path=`${APP.user.id}/${sessionId}/official-video.${ext}`;
      const up=await SB.storage.from('assignment-videos').upload(path,v.blob,{contentType:v.mimeType});
      if(up.error){
        APP.assignmentUploadWarning='Your score and transcript were saved, but the '+label+' recording upload failed. The issue was flagged for your instructor; you do not need to repeat the attempt unless asked.';
        await flagRecordingIssue(sessionId,'video_upload_failed');
        console.warn('Official recording upload failed',up.error);
        return false;
      }

      const metadata={
        session_id:sessionId,
        assignment_id:APP.activeAssignment||null,
        competition_round_id:APP.activeCompetitionRound?.id||null,
        student_id:APP.user.id,
        storage_path:path,
        mime_type:v.mimeType,
        size_bytes:v.blob.size,
        duration_seconds:v.durationSeconds,
        consented_at:v.consentedAt
      };

      let row=await SB.from('session_videos').insert(metadata);
      if(row.error){
        await new Promise(resolve=>setTimeout(resolve,500));
        row=await SB.from('session_videos').insert(metadata);
      }
      if(row.error){
        APP.assignmentUploadWarning='Your score and transcript were saved, but the recording could not be linked to the official attempt. The issue was flagged for your instructor.';
        await flagRecordingIssue(sessionId,'video_metadata_failed');
        try{await SB.storage.from('assignment-videos').remove([path])}catch(err){console.warn('Could not clean up unlinked recording',err)}
        console.warn('Official recording metadata failed',row.error);
        return false;
      }
      return true;
    };
  }

  const reliabilityCoreShowSavedReport=showSavedReport;
  showSavedReport=async function(id){
    await reliabilityCoreShowSavedReport(id);
    const status=el('report-status');
    if(status&&!APP.assignmentUploadWarning){
      status.textContent=APP.activeAssignment?'Final score uses the complete assignment rubric':'Final score uses the same complete rubric as graded assignments';
    }
    if(APP.assignmentUploadWarning){
      const warning=APP.assignmentUploadWarning;
      if(status)status.textContent='Score saved — attention item noted for instructor';
      toast(warning);
      APP.assignmentUploadWarning=null;
    }
  };

  const reliabilityCoreEndSession=endSession;
  endSession=async function(...args){
    if(APP.sessionSaveInFlight)return;
    APP.sessionSaveInFlight=true;
    const button=document.querySelector('#arena-page .btn-danger');
    const oldText=button?.textContent;
    if(button){button.disabled=true;button.textContent='Saving & scoring…'}
    try{
      return await reliabilityCoreEndSession(...args);
    }finally{
      APP.sessionSaveInFlight=false;
      if(!APP.activeAssignment)APP.lockedAssignmentConfig=null;
      if(!APP.activeCompetitionRound)APP.lockedCompetitionConfig=null;
      syncAssignmentLockUI();
      if(button){button.disabled=false;button.textContent=oldText||'End & save'}
    }
  };

  loadStudentHome=async function(){
    if(!APP.user)return;
    el('student-name').textContent=(APP.profile?.full_name||'Student').split(' ')[0];
    const [sr,ar]=await Promise.all([
      SB.from('sessions').select('overall_score,duration_seconds,created_at,assignment_id,grading_status,review_flags').eq('student_id',APP.user.id).order('created_at',{ascending:false}),
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
  if(scoreLabel)scoreLabel.textContent='Live coaching score';

  const access360Script=document.createElement('script');
  access360Script.src='assets/access360-showdown.js?v=20261101-access360-1';
  access360Script.async=false;
  document.body.appendChild(access360Script);
})();
