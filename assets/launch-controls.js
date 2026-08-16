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
