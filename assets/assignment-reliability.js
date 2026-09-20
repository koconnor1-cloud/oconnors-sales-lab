/* Assignment reliability + scoring alignment patch — September 17, 2026.
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
      const {error}=await SB.rpc('flag_assignment_recording_issue',{p_session_id:sessionId,p_issue:issue||'recording_upload_failed'});
      if(error)console.warn('Could not flag assignment recording issue',error);
    }catch(err){
      console.warn('Could not flag assignment recording issue',err);
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
      if(APP.activeAssignment&&(type==='chat'||type==='transcribe'))APP.assignmentTechnicalFailure=true;
      throw err;
    }
  };

  saveSessionCompatible=async function(base){
    if(APP.activeCompetitionRound)base.competition_round_id=APP.activeCompetitionRound.id;

    if(APP.activeAssignment&&APP.assignmentTechnicalFailure){
      throw new Error('The AI service was interrupted during this formal assignment. This attempt was not counted. Please try again.');
    }

    if(APP.activeAssignment&&Number(base.turn_count||0)<1){
      throw new Error('No student response was captured. This formal attempt was not counted. Please try again.');
    }

    const liveScore=clampScore(base.overall_score);
    let evaluation;
    try{
      toast(APP.activeAssignment
        ? 'Scoring the complete conversation with the assignment rubric…'
        : 'Scoring the complete practice conversation with the same rubric used for assignments…');
      evaluation=await evaluateCompleteConversation(base);
    }catch(err){
      console.error('Full-conversation rubric scoring unavailable',err);
      if(APP.activeAssignment){
        throw new Error('Final rubric scoring was interrupted. This formal attempt was not counted. Please try again.');
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
    if(APP.activeAssignment){
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

    throw new Error(msg||'The session could not be submitted.');
  };

  /* A completed assignment session is the authoritative save. Recording upload is
     a secondary artifact. Never delete a valid score/transcript just because the
     large video transfer fails after the database insert. */
  if(typeof uploadAssignmentVideo==='function'){
    uploadAssignmentVideo=async function(sessionId,v){
      if(!v?.blob)return true;
      if(v.blob.size>150*1024*1024){
        APP.assignmentUploadWarning='Your score and transcript were saved, but the recording was too large to upload. The issue was flagged for your instructor.';
        await flagRecordingIssue(sessionId,'recording_too_large');
        return false;
      }

      const ext=v.mimeType.includes('mp4')?'mp4':'webm';
      const path=`${APP.user.id}/${sessionId}/assignment-video.${ext}`;
      const up=await SB.storage.from('assignment-videos').upload(path,v.blob,{contentType:v.mimeType});
      if(up.error){
        APP.assignmentUploadWarning='Your score and transcript were saved, but the recording upload failed. The issue was flagged for your instructor; you do not need to repeat the attempt unless asked.';
        await flagRecordingIssue(sessionId,'recording_upload_failed');
        console.warn('Assignment recording upload failed',up.error);
        return false;
      }

      let row=await SB.from('session_videos').insert({session_id:sessionId,assignment_id:APP.activeAssignment,student_id:APP.user.id,storage_path:path,mime_type:v.mimeType,size_bytes:v.blob.size,duration_seconds:v.durationSeconds,consented_at:v.consentedAt});
      if(row.error){
        await new Promise(resolve=>setTimeout(resolve,500));
        row=await SB.from('session_videos').insert({session_id:sessionId,assignment_id:APP.activeAssignment,student_id:APP.user.id,storage_path:path,mime_type:v.mimeType,size_bytes:v.blob.size,duration_seconds:v.durationSeconds,consented_at:v.consentedAt});
      }
      if(row.error){
        APP.assignmentUploadWarning='Your score and transcript were saved, but the recording could not be linked to the attempt. The issue was flagged for your instructor.';
        await flagRecordingIssue(sessionId,'recording_metadata_failed');
        try{await SB.storage.from('assignment-videos').remove([path])}catch(err){console.warn('Could not clean up unlinked recording',err)}
        console.warn('Assignment recording metadata failed',row.error);
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
      if(status)status.textContent='Score saved — recording upload issue flagged for instructor';
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
})();
