/* Fall 2026 workflow completion layer.
   Loaded after the core practice/evidence scripts. Keeps launch-critical engine stable
   while completing instructor review and Showdown result-release controls. */

async function returnGradeForReview(id){
  const field=el('feedback-'+id);
  const feedback=field?.value.trim()||'';
  if(!feedback)return toast('Add a short note explaining why this attempt is being held or returned.');
  const {error}=await SB.rpc('return_session_for_review',{p_session_id:id,p_instructor_feedback:feedback});
  if(error)return toast('Attempt could not be returned: '+error.message);
  toast('Attempt held for instructor follow-up.');
  await loadGradeReview();
}

loadGradeReview=async function(){
  const host=el('review-list');
  host.innerHTML='<div class="card empty">Loading review queue…</div>';
  const q=await SB.from('sessions').select('*').eq('grading_status','awaiting_instructor').order('created_at',{ascending:false});
  if(q.error){host.innerHTML='<div class="notice notice-gold">The instructor review queue could not be loaded: '+escapeHtml(q.error.message)+'</div>';return}
  const rows=q.data||[];
  const ids=[...new Set(rows.map(r=>r.student_id))];
  const {data:people}=ids.length?await SB.from('profiles').select('id,full_name').in('id',ids):{data:[]};
  const names=Object.fromEntries((people||[]).map(p=>[p.id,p.full_name]));
  host.innerHTML=rows.length?rows.map(s=>`<div class="card review-card"><div><div class="section-label">Recommendation</div><div style="font:800 32px 'DM Mono',monospace">${s.recommended_score??s.overall_score??'—'}</div><div class="muted" style="font-size:10px">Confidence ${Math.round(Number(s.scoring_confidence||0)*100)}%</div></div><div><strong>${escapeHtml(names[s.student_id]||'Student')}</strong><div class="assignment-sub">${escapeHtml(SCENARIOS[s.scenario]?.name||s.scenario)} · ${new Date(s.created_at).toLocaleString()}</div>${renderEvidence(s.scoring_evidence)}</div><div><div class="form-field"><label>Final grade</label><input id="grade-${s.id}" type="number" min="0" max="100" value="${s.recommended_score??s.overall_score??''}"></div><div class="form-field"><label>Instructor feedback</label><textarea id="feedback-${s.id}" rows="4" placeholder="Optional for approval; required to return/hold"></textarea></div><div class="footer-actions"><button class="btn btn-primary" onclick="approveGrade('${s.id}')">Approve & release</button><button class="btn btn-outline" onclick="returnGradeForReview('${s.id}')">Return / hold</button></div></div></div>`).join(''):'<div class="card empty">No graded assignments are awaiting approval.</div>';
};

showdownControls=function(r){
  if(r.status==='locked')return`<button class="btn btn-outline btn-sm" style="margin-top:8px" onclick="openRound('${r.id}')">Open</button>`;
  if(r.status==='open')return`<button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="finalizeRound('${r.id}')">Close & rank</button>`;
  if(r.status==='closed'&&!r.results_released)return`<div class="footer-actions" style="margin-top:8px"><span class="tag tag-green">Ranked</span><button class="btn btn-gold btn-sm" onclick="setShowdownResultsReleased('${r.id}',true)">Release results</button></div>`;
  if(r.status==='closed'&&r.results_released)return`<div class="footer-actions" style="margin-top:8px"><span class="tag tag-green">Results released</span><button class="btn btn-outline btn-sm" onclick="setShowdownResultsReleased('${r.id}',false)">Hide results</button></div>`;
  return`<span class="tag tag-gray" style="margin-top:8px">${escapeHtml(r.status||'Unknown')}</span>`;
};

async function setShowdownResultsReleased(roundId,released){
  if(released&&!confirm('Release this round’s ranked results to the class?'))return;
  const {error}=await SB.rpc('set_showdown_results_released',{p_round_id:roundId,p_released:released});
  if(error)return toast('Results could not be '+(released?'released':'hidden')+': '+error.message);
  toast(released?'Results released to the class.':'Results hidden from students.');
  await loadShowdown();
}

async function renderReleasedShowdownStandings(){
  const host=el('showdown-live');
  if(!host||!APP.user)return;
  host.querySelector('#released-showdown-standings')?.remove();
  const code=APP.profile?.class_code||'SALESFALL26';
  const {data:competitions,error}=await SB.from('competitions').select('id').eq('class_code',code).eq('title','Argo Sales Showdown').limit(1);
  if(error||!competitions?.[0])return;
  const {data:rounds}=await SB.from('competition_rounds').select('id,round_number,name,results_released').eq('competition_id',competitions[0].id).eq('results_released',true).order('round_number',{ascending:false});
  if(!rounds?.length)return;
  const panels=[];
  for(const r of rounds){
    const {data,error:standingError}=await SB.rpc('get_released_showdown_standings',{p_round_id:r.id});
    if(standingError)continue;
    const rows=data||[];
    panels.push(`<div class="card"><div class="section-label">Released standings · Stage ${r.round_number}</div><h3 style="margin-bottom:12px">${escapeHtml(r.name)}</h3>${rows.length?`<div class="table-scroll"><table class="teacher-table"><thead><tr><th>Rank</th><th>Seller</th><th>Score</th><th>Status</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${x.rank??'—'}</td><td>${escapeHtml(x.full_name||'Student')}</td><td>${x.score??'—'}</td><td>${x.advanced?'<span class="tag tag-green">Advanced</span>':'<span class="tag tag-gray">Complete</span>'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No ranked entries.</div>'}</div>`);
  }
  if(!panels.length)return;
  const block=document.createElement('div');
  block.id='released-showdown-standings';
  block.innerHTML='<div class="section-label" style="margin-top:22px">Released results</div>'+panels.join('');
  host.appendChild(block);
}

const coreLoadShowdown=loadShowdown;
loadShowdown=async function(){
  await coreLoadShowdown();
  await renderReleasedShowdownStandings();
};

/* Password recovery completion layer.
   Always routes recovery mail back to the live GitHub Pages application, even when
   the app is opened from a localhost preview. A recovery session receives a focused
   new-password form; normal sign-in and course behavior remain unchanged. */
window.SALES_LAB_RECOVERY_URL='https://koconnor1-cloud.github.io/oconnors-sales-lab/';

window.resetPassword=async function(){
  const email=el('login-email')?.value.trim().toLowerCase()||'';
  if(!email)return authNotice('Enter your email first.');
  authNotice('Sending a secure password-reset link…','info');
  const {error}=await SB.auth.resetPasswordForEmail(email,{redirectTo:window.SALES_LAB_RECOVERY_URL});
  authNotice(error?error.message:'Check your email for a fresh password-reset link. Use the newest email only.',error?'error':'success');
};

function recoveryNotice(message,type='info'){
  const box=el('recovery-notice');
  if(!box)return;
  box.className='notice '+(type==='success'?'notice-green':type==='error'?'notice-red':'notice-info');
  box.textContent=message;
  box.classList.remove('hidden');
}

window.showPasswordRecovery=function(){
  showPage('auth-page');
  el('nav-tabs').innerHTML='';
  el('nav-user').classList.add('hidden');
  const panel=document.querySelector('#auth-page .auth-panel');
  if(!panel)return;
  panel.dataset.mode='password-recovery';
  panel.innerHTML=`
    <h2>Choose a new password</h2>
    <div class="muted" style="font-size:12px;line-height:1.55;margin-bottom:16px">You opened a secure Sales Lab password-recovery link. Enter the new password you want to use for this account.</div>
    <div id="recovery-notice" class="notice notice-info">Use at least 8 characters. Your old password is not required.</div>
    <div class="card">
      <div class="form-field"><label>New password</label><input id="recovery-password" type="password" autocomplete="new-password" minlength="8"></div>
      <div class="form-field"><label>Confirm new password</label><input id="recovery-password-confirm" type="password" autocomplete="new-password" minlength="8"></div>
      <button class="btn btn-gold" id="recovery-submit" style="width:100%" onclick="updateRecoveredPassword()">Update password</button>
    </div>`;
};

window.updateRecoveredPassword=async function(){
  const password=el('recovery-password')?.value||'';
  const confirmPassword=el('recovery-password-confirm')?.value||'';
  if(password.length<8)return recoveryNotice('Use a password with at least 8 characters.','error');
  if(password!==confirmPassword)return recoveryNotice('The two password entries do not match.','error');
  const button=el('recovery-submit');
  if(button){button.disabled=true;button.textContent='Updating…'}
  const {error}=await SB.auth.updateUser({password});
  if(error){
    if(button){button.disabled=false;button.textContent='Update password'}
    return recoveryNotice('The password could not be updated: '+error.message,'error');
  }
  recoveryNotice('Password updated successfully. Returning you to sign in…','success');
  await SB.auth.signOut();
  setTimeout(()=>location.replace(window.SALES_LAB_RECOVERY_URL+'?password-reset=success'),500);
};

function authFlowParams(){
  const query=new URLSearchParams(location.search);
  const hash=new URLSearchParams((location.hash||'').replace(/^#/,''));
  return {
    recovery:query.get('type')==='recovery'||hash.get('type')==='recovery',
    errorCode:query.get('error_code')||hash.get('error_code')||'',
    errorDescription:query.get('error_description')||hash.get('error_description')||'',
    resetSuccess:query.get('password-reset')==='success'
  };
}

async function initializePasswordRecovery(){
  const p=authFlowParams();
  SB.auth.onAuthStateChange((event,session)=>{
    if(event==='PASSWORD_RECOVERY'&&session)window.showPasswordRecovery();
  });

  if(p.errorCode){
    showPage('auth-page');
    setAuthRole('teacher');
    const expired=p.errorCode==='otp_expired'||/expired|invalid/i.test(p.errorDescription);
    authNotice(expired?'That password-reset link is invalid or has expired. Enter your UWF email and click Forgot password to send a fresh link.':('Password recovery could not be completed: '+(p.errorDescription||p.errorCode)),'error');
    history.replaceState({},'',location.pathname);
    return;
  }

  if(p.resetSuccess){
    showPage('auth-page');
    setAuthRole('teacher');
    authNotice('Your password has been updated. Sign in with your new password.','success');
    history.replaceState({},'',location.pathname);
    return;
  }

  if(p.recovery){
    const {data}=await SB.auth.getSession();
    if(data?.session)window.showPasswordRecovery();
  }
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(initializePasswordRecovery,0));
else setTimeout(initializePasswordRecovery,0);

// Load the optional instructor session drill-down after the core instructor controls.
const instructorSessionReviewScript=document.createElement('script');
instructorSessionReviewScript.src='assets/instructor-session-review.js?v=20260816-analytics2';
instructorSessionReviewScript.async=false;
document.body.appendChild(instructorSessionReviewScript);
