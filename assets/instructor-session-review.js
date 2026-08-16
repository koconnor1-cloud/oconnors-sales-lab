/* Instructor session review experience.
   Gives faculty a read-only drill-down into saved student sessions while preserving
   the existing RLS boundaries and free-practice recording policy. */

const INSTRUCTOR_REVIEW={studentId:null,studentName:null,studentEmail:null,sessions:[]};

function reviewStatusLabel(s){
  if(s.assignment_id)return s.grading_status==='approved'?'Formal · graded':s.grading_status==='awaiting_instructor'?'Formal · awaiting review':s.grading_status==='returned'?'Formal · returned':'Formal assignment';
  if(s.competition_round_id)return'Official Showdown';
  return'Free practice';
}

function reviewStatusTag(s){
  const text=reviewStatusLabel(s);
  const cls=s.assignment_id||s.competition_round_id?'tag-gold':'tag-gray';
  return`<span class="tag ${cls}">${escapeHtml(text)}</span>`;
}

function normalizeTranscript(value){
  if(Array.isArray(value))return value;
  if(typeof value==='string')try{const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed:[]}catch{return[]}
  return[];
}

function reviewScoreCards(s){
  const rows=[['Rapport',s.rapport],['Clarity',s.clarity],['Confidence',s.confidence],['Commitment',s.close_score],['Discovery',s.discovery],['Value',s.value_prop],['Objections',s.objections],['Listening',s.listening]];
  return`<div class="grid grid-4" style="margin-top:14px">${rows.map(([name,value])=>`<div class="stat"><span>${name}</span><strong style="font-size:18px">${value==null?'—':value+'/10'}</strong></div>`).join('')}</div>`;
}

function reviewTranscriptHtml(transcript){
  if(!transcript.length)return'<div class="empty">No conversation transcript was saved for this attempt.</div>';
  return transcript.map((turn,index)=>{
    const seller=turn.role==='student';
    const label=seller?'Seller':'Buyer';
    const time=Number.isFinite(Number(turn.timestamp))?formatDuration(Number(turn.timestamp)):'';
    return`<div class="card" style="padding:13px 15px;margin-bottom:9px;border-left:4px solid ${seller?'#d6a514':'#31577f'}"><div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:5px"><strong>${label}</strong><span class="muted" style="font-size:10px">${time||('Turn '+(index+1))}</span></div><div style="font-size:13px;line-height:1.65">${escapeHtml(turn.text||'')}</div></div>`;
  }).join('');
}

function renderStudentSessionList(){
  const host=el('student-detail-list');
  if(!host)return;
  const sessions=INSTRUCTOR_REVIEW.sessions||[];
  host.innerHTML=sessions.length?sessions.map(s=>{
    const scenario=SCENARIOS[s.scenario]?.name||s.scenario||'Saved session';
    const score=s.final_grade??s.overall_score;
    const turns=normalizeTranscript(s.transcript).filter(t=>t.role==='student').length;
    return`<div class="card assignment"><div class="assignment-icon">${assignmentIcon(s.scenario)}</div><div class="assignment-body"><div class="assignment-title">${escapeHtml(scenario)}</div><div class="assignment-sub">${new Date(s.created_at).toLocaleString()} · ${formatDuration(s.duration_seconds||0)} · ${turns} seller turn${turns===1?'':'s'}</div><div class="assignment-tags">${reviewStatusTag(s)}<span class="tag ${score==null?'tag-gray':'tag-green'}">${score==null?'No score':score+'/100'}</span>${s.assignment_id?'<span class="tag tag-gray">Recording eligible</span>':'<span class="tag tag-gray">No durable recording</span>'}</div></div><button class="btn btn-primary" onclick="openInstructorSession('${s.id}')">Open session</button></div>`;
  }).join(''):'<div class="card empty">No saved sessions for this student.</div>';
}

teacherViewStudent=async function(id){
  const [{data:p,error:profileError},{data:sessions,error:sessionError}]=await Promise.all([
    SB.from('profiles').select('full_name,email').eq('id',id).single(),
    SB.from('sessions').select('*').eq('student_id',id).order('created_at',{ascending:false})
  ]);
  if(profileError||sessionError)return toast('Student session history could not be loaded.');
  INSTRUCTOR_REVIEW.studentId=id;
  INSTRUCTOR_REVIEW.studentName=p?.full_name||p?.email||'Student';
  INSTRUCTOR_REVIEW.studentEmail=p?.email||'';
  INSTRUCTOR_REVIEW.sessions=sessions||[];
  el('student-detail-name').textContent=INSTRUCTOR_REVIEW.studentName;
  renderStudentSessionList();
  showPage('student-detail');
};

window.backToStudentSessions=function(){
  el('student-detail-name').textContent=INSTRUCTOR_REVIEW.studentName||'Student';
  renderStudentSessionList();
};

async function signedReviewMedia(bucket,path){
  if(!path)return null;
  const {data,error}=await SB.storage.from(bucket).createSignedUrl(path,900);
  if(error)return null;
  return data?.signedUrl||null;
}

window.openInstructorSession=async function(sessionId){
  const host=el('student-detail-list');
  if(!host)return;
  host.innerHTML='<div class="card empty">Loading complete session…</div>';
  const {data:s,error}=await SB.from('sessions').select('*').eq('id',sessionId).single();
  if(error||!s){host.innerHTML='<div class="notice notice-red">This session could not be opened.</div>';return}
  if(INSTRUCTOR_REVIEW.studentId&&s.student_id!==INSTRUCTOR_REVIEW.studentId){host.innerHTML='<div class="notice notice-red">This session does not belong to the selected student.</div>';return}

  const [{data:videos},{data:audioRows}]=await Promise.all([
    SB.from('session_videos').select('storage_path,mime_type,duration_seconds,consented_at').eq('session_id',sessionId),
    SB.from('session_recordings').select('storage_path,mime_type,turn_index').eq('session_id',sessionId).order('turn_index')
  ]);
  const video=videos?.[0]||null;
  const videoUrl=video?await signedReviewMedia('assignment-videos',video.storage_path):null;
  const audio=[];
  for(const row of (audioRows||[])){
    const url=await signedReviewMedia('session-recordings',row.storage_path);
    if(url)audio.push({...row,url});
  }

  const transcript=normalizeTranscript(s.transcript);
  const scenario=SCENARIOS[s.scenario]?.name||s.scenario||'Saved session';
  const buyer=BUYERS[s.character_id]?.name||s.character_id||'AI buyer';
  const score=s.final_grade??s.overall_score;
  const sellerTurns=transcript.filter(t=>t.role==='student').length;
  const formal=Boolean(s.assignment_id);
  const evidence=s.scoring_evidence?renderEvidence(s.scoring_evidence):'';
  const recordingBlock=videoUrl?`<div class="card"><div class="section-label">Formal assignment recording</div><video controls playsinline style="width:100%;max-height:520px;border-radius:12px;background:#000" src="${videoUrl}"></video><div class="muted" style="font-size:10px;margin-top:8px">Private instructor access · ${video?.consented_at?'student consent recorded '+new Date(video.consented_at).toLocaleString():'formal assignment recording'}</div></div>`:audio.length?`<div class="card"><div class="section-label">Formal session audio</div>${audio.map((r,i)=>`<div style="margin:10px 0"><div class="muted" style="font-size:10px;margin-bottom:4px">Audio clip ${i+1}</div><audio controls style="width:100%" src="${r.url}"></audio></div>`).join('')}</div>`:`<div class="notice ${formal?'notice-gold':'notice-info'}"><strong>${formal?'No recording is attached to this formal attempt.':'Free practice is intentionally not durably recorded.'}</strong> ${formal?'The transcript and coaching record remain available below.':'You can review the saved transcript and coaching evidence, but there is no audio/video file to play.'}</div>`;

  el('student-detail-name').textContent=scenario;
  host.innerHTML=`
    <div class="footer-actions" style="margin-bottom:16px"><button class="btn btn-outline" onclick="backToStudentSessions()">← Back to ${escapeHtml(INSTRUCTOR_REVIEW.studentName||'student')} sessions</button></div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;gap:18px;align-items:flex-start;flex-wrap:wrap"><div><div class="section-label">Session review</div><h3 style="margin:3px 0 5px">${escapeHtml(scenario)}</h3><div class="muted" style="font-size:12px">${escapeHtml(buyer)} · ${escapeHtml(s.product||'Practice context')} · ${escapeHtml(s.difficulty||'')}</div></div><div style="text-align:right"><div style="font:800 34px 'DM Mono',monospace">${score==null?'—':score}</div><div class="muted" style="font-size:10px">${s.final_grade!=null?'Final grade':'Session score'}</div></div></div>
      <div class="assignment-tags" style="margin-top:12px">${reviewStatusTag(s)}<span class="tag tag-gray">${formatDuration(s.duration_seconds||0)}</span><span class="tag tag-gray">${sellerTurns} seller turn${sellerTurns===1?'':'s'}</span><span class="tag tag-gray">${new Date(s.created_at).toLocaleString()}</span></div>
      ${reviewScoreCards(s)}
    </div>
    ${recordingBlock}
    ${s.ai_feedback?`<div class="card"><div class="section-label">AI coaching feedback</div><div style="font-size:13px;line-height:1.7">${escapeHtml(s.ai_feedback)}</div></div>`:''}
    ${s.instructor_feedback?`<div class="card"><div class="section-label">Instructor feedback</div><div style="font-size:13px;line-height:1.7">${escapeHtml(s.instructor_feedback)}</div></div>`:''}
    ${evidence?`<div class="card"><div class="section-label">Rubric evidence</div>${evidence}</div>`:''}
    <div class="section-label" style="margin-top:22px">Complete transcript</div>
    ${reviewTranscriptHtml(transcript)}
  `;
};

// Load class-level practice and skill analytics for the instructor dashboard.
const teacherClassAnalyticsScript=document.createElement('script');
teacherClassAnalyticsScript.src='assets/teacher-class-analytics.js?v=20260816-analytics2';
teacherClassAnalyticsScript.async=false;
teacherClassAnalyticsScript.onload=()=>window.renderTeacherClassAnalytics?.();
document.body.appendChild(teacherClassAnalyticsScript);
