/* Argonaut Access360 Showdown competition layer — Fall 2026.
   Progressive four-round dashboard, private student journey, guest-judge review,
   scheduled competition windows, and championship/development tracks. */

(function bootAccess360(){
  let tries=0;
  function ready(){
    if(typeof APP!=='undefined'&&typeof SB!=='undefined'&&typeof loadShowdown==='function'&&typeof showdownControls==='function'){
      install();
      return;
    }
    if(++tries<120)setTimeout(ready,50);
  }

  function install(){
    if(window.ACCESS360_SHOWDOWN_INSTALLED)return;
    window.ACCESS360_SHOWDOWN_INSTALLED=true;

    const ROUND_FIELD={1:'Round 2 qualifiers',2:'Top 8',3:'Final Four',4:'Champion'};

    function round2Instructions(){
      return `<div class="card round2-delivery-instructions"><div class="section-label">Round 2 — SPIN Discovery &amp; Needs Assessment</div><h3>Have a conversation. Do not read a script.</h3><ul style="line-height:1.7"><li><strong>No reading:</strong> Do not read prepared sentences from your screen, phone, paper, or a teleprompter. Brief keyword notes are fine; do not read them aloud.</li><li><strong>Natural eye contact:</strong> Look toward the camera while speaking, keep your face visible, and avoid looking down at notes throughout the conversation. Brief, natural glances are fine.</li><li><strong>Listen and adapt:</strong> Ask one question at a time. Let the buyer finish, respond to what they actually say, and use follow-up questions instead of reciting a question list.</li><li><strong>Use SPIN:</strong> Explore Situation, Problem, Implication, and Need-payoff. Diagnose needs before pitching, summarize what you learned, and agree on a next step.</li><li><strong>Professional delivery:</strong> Use a conversational pace and tone, clear audio, a quiet setting, and lighting that makes your face easy to see.</li><li><strong>Review and retry:</strong> No numeric score is shown. Review your recording and qualitative feedback. If you feel you could improve your performance, you may redo Round 2 before the deadline. A redo is optional. Your latest successfully submitted recording will count. Stay on the page until the upload and submission finish.</li></ul></div>`;
    }
    const round2CoreBrief=updateBriefPreview;
    updateBriefPreview=function(){
      round2CoreBrief();
      document.getElementById('round2-preflight')?.remove();
      if(APP.activeCompetitionRound?.id===ROUND2_ID){
        const box=document.createElement('div');box.id='round2-preflight';box.innerHTML=round2Instructions();
        document.querySelector('#practice-page .wrap').prepend(box);
      }
    };
    const round2CoreReport=showSavedReport;
    showSavedReport=async function(id){
      await round2CoreReport(id);
      document.getElementById('round2-recording-review')?.remove();
      if(!APP.reportIsRound2)return;
      const box=document.createElement('div');box.id='round2-recording-review';box.className='card';
      box.innerHTML='<h3>Review your recording</h3><p>Loading your private video…</p>';
      document.querySelector('#report-page .wrap-sm').appendChild(box);
      const {data:v}=await SB.from('session_videos').select('storage_path').eq('session_id',id).maybeSingle();
      if(v?.storage_path){
        const {data,error}=await SB.storage.from('assignment-videos').createSignedUrl(v.storage_path,3600);
        box.innerHTML=!error&&data?.signedUrl?`<h3>Review your recording</h3><video controls playsinline style="width:100%;max-height:450px" src="${escapeHtml(data.signedUrl)}"></video>`:'<p>Your video could not be loaded. Refresh and try again.</p>';
      }else box.innerHTML='<p>No saved recording is linked to this attempt. Return to Showdown to check your official submission and retry before the deadline.</p>';
      box.insertAdjacentHTML('beforeend','<button class="btn btn-primary" onclick="showPage(\'showdown-page\')">Return to Showdown</button>');
    };

    const ROUND_SHORT={1:'Cold Call',2:'Discovery',3:'Value + Objections',4:'Executive Call'};

    function fmtDate(v,includeTime=true){
      if(!v)return 'TBD';
      const d=new Date(v);
      return new Intl.DateTimeFormat('en-US',{
        timeZone:'America/Chicago',
        weekday:'short',month:'short',day:'numeric',
        ...(includeTime?{hour:'numeric',minute:'2-digit'}:{})
      }).format(d)+(includeTime?' CT':'');
    }

    function roundWindow(r){
      return `${fmtDate(r.planned_open_at)} → ${fmtDate(r.planned_close_at)}`;
    }

    function timeState(r){
      const now=Date.now(),open=r.planned_open_at?new Date(r.planned_open_at).getTime():null,close=r.planned_close_at?new Date(r.planned_close_at).getTime():null;
      if(open&&now<open)return 'scheduled';
      if(close&&now>close)return 'deadline_passed';
      return r.status==='open'?'open':r.status;
    }

    function scoringLabel(r){
      return r.championship_scoring_mode==='human'?'Guest judges · Championship Field / AI · Development Track':'AI qualifier · all competitors';
    }

    function ensureJudgePage(){
      if(el('judge-home'))return;
      const section=document.createElement('section');
      section.className='page';
      section.id='judge-home';
      section.innerHTML=`<div class="wrap"><div class="hero"><h1>Guest Judge <span>Review Portal</span></h1><p>Argonaut Access360 · Argo Sales Showdown</p></div><div class="notice notice-info"><strong>Independent review:</strong> Judge the recording and rubric in front of you. AI scores, prior-round scores, and other judges' scores are intentionally hidden.</div><div id="judge-live"><div class="card empty">Loading assigned reviews…</div></div></div>`;
      const toast=el('toast');
      toast?.parentNode?.insertBefore(section,toast);
    }
    ensureJudgePage();

    const coreRenderNav=renderNav;
    renderNav=function(active){
      if(APP.role!=='judge')return coreRenderNav(active);
      const host=el('nav-tabs');
      host.innerHTML='';
      if(!APP.user)return;
      const b=document.createElement('button');
      b.className='nav-tab'+(active==='judge-home'?' active':'');
      b.textContent='Judge Reviews';
      b.onclick=()=>showPage('judge-home');
      host.appendChild(b);
      const out=document.createElement('button');
      out.className='nav-tab';
      out.textContent='Log out';
      out.onclick=logout;
      host.appendChild(out);
    };

    const coreShowPage=showPage;
    showPage=function(id){
      coreShowPage(id);
      if(id==='judge-home')loadJudgeDashboard();
    };

    const coreLoadProfile=loadProfile;
    loadProfile=async function(){
      await coreLoadProfile();
      if(APP.role==='judge')showPage('judge-home');
    };

    studentShowdownControl=function(r,entries,rounds){
      const state=timeState(r);
      const mine=entries.find(e=>e.round_id===r.id&&e.student_id===APP.user.id);
      if(mine){
        if(r.id===ROUND2_ID&&state==='open')return `<div class="assignment-tags"><span class="tag tag-green">Official recording submitted</span></div><button class="btn btn-outline btn-sm" style="margin-top:8px" onclick="startShowdown('${r.id}')">Redo Round 2</button><div class="muted" style="font-size:11px;margin-top:8px">Your latest successfully submitted recording counts. Complete any retry before the deadline.</div>`;
        const track=mine.championship_eligible?'Championship Field':'Development Track';
        return `<div class="assignment-tags" style="margin-top:8px"><span class="tag tag-green">Official entry submitted</span><span class="tag tag-gray">${track}</span></div>`;
      }
      if(state==='scheduled')return `<span class="tag tag-gray" style="margin-top:8px">Opens ${escapeHtml(fmtDate(r.planned_open_at))}</span>`;
      if(state==='deadline_passed')return '<span class="tag tag-gray" style="margin-top:8px">Submission window closed</span>';
      if(r.status!=='open')return '';
      return `<button class="btn btn-gold btn-sm" style="margin-top:8px" onclick="startShowdown('${r.id}')">Record official attempt</button>`;
    };

    showdownControls=function(r){
      const state=timeState(r);
      if(r.status==='locked'){
        const early=state==='scheduled';
        return `<div class="assignment-tags" style="margin-top:8px"><span class="tag tag-gray">${early?'Scheduled':'Locked'}</span><button class="btn btn-outline btn-sm" ${early?'disabled':''} onclick="openRound('${r.id}')">${early?'Opens '+escapeHtml(fmtDate(r.planned_open_at,false)):'Open round'}</button></div>`;
      }
      if(r.status==='open'){
        if(state!=='deadline_passed')return `<div class="assignment-tags" style="margin-top:8px"><span class="tag tag-green">Student window open</span><span class="tag tag-gray">Closes ${escapeHtml(fmtDate(r.planned_close_at))}</span></div>`;
        return `<button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="finalizeRound('${r.id}')">Finalize championship field</button>`;
      }
      if(r.status==='closed'&&!r.results_released)return `<div class="footer-actions" style="margin-top:8px"><span class="tag tag-green">Ranked</span><button class="btn btn-gold btn-sm" onclick="setShowdownResultsReleased('${r.id}',true)">Release ${ROUND_FIELD[r.round_number]}</button></div>`;
      if(r.status==='closed'&&r.results_released)return `<div class="footer-actions" style="margin-top:8px"><span class="tag tag-green">Results released</span><button class="btn btn-outline btn-sm" onclick="setShowdownResultsReleased('${r.id}',false)">Hide results</button></div>`;
      return `<span class="tag tag-gray" style="margin-top:8px">${escapeHtml(r.status||'Unknown')}</span>`;
    };

    window.loadShowdown=loadShowdown=async function(){
      const host=el('showdown-live');
      if(!host||!APP.user)return;
      try{await SB.rpc('sync_showdown_schedule')}catch{}
      const code=APP.profile?.class_code||'SALESFALL26';
      const {data:cs,error}=await SB.from('competitions').select('*').eq('class_code',code).eq('title','Argo Sales Showdown').limit(1);
      if(error){host.innerHTML='<div class="notice notice-gold">The Showdown dashboard could not be loaded.</div>';return}
      const comp=cs?.[0];
      if(!comp){host.innerHTML='<div class="card empty">The Argo Sales Showdown has not been configured.</div>';return}

      const {data:rounds}=await SB.from('competition_rounds').select('*').eq('competition_id',comp.id).order('round_number');
      const ids=(rounds||[]).map(r=>r.id);
      const {data:entries}=ids.length?await SB.from('competition_entries').select('*').in('round_id',ids):{data:[]};
      const own=(entries||[]).filter(e=>e.student_id===APP.user.id);
      let participantCount=27;
      if(APP.role==='teacher'){
        const pc=await SB.from('competition_participants').select('id',{count:'exact',head:true}).eq('competition_id',comp.id).eq('active',true);
        participantCount=pc.count||27;
      }

      const progression=`<div class="card" style="margin-bottom:16px"><div class="section-label">Championship progression</div><div style="display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-top:8px"><strong>${participantCount} ALL STUDENTS</strong><span>→</span><strong>${(rounds||[]).find(r=>r.round_number===1)?.advance_count||18}</strong><span>→</span><strong>8</strong><span>→</span><strong>4</strong><span>→</span><strong>CHAMPION</strong></div><div class="muted" style="margin-top:8px;font-size:11px">Everyone completes all four rounds. Advancement changes championship eligibility, not participation.</div></div>`;

      const cards=(rounds||[]).map(r=>{
        const roundEntries=(entries||[]).filter(e=>e.round_id===r.id);
        const complete=APP.role==='teacher'?roundEntries.length:(own.some(e=>e.round_id===r.id)?1:0);
        const championship=APP.role==='teacher'?roundEntries.filter(e=>e.championship_eligible).length:null;
        const meta=APP.role==='teacher'
          ? `<div class="muted" style="font-size:10px;margin-top:6px">${complete}/${participantCount} submitted${r.round_number>1?' · '+championship+' Championship Field':''}</div>`
          :'';
        return `<div class="round ${r.status==='open'?'current':r.status==='locked'?'locked':''}"><div class="num">ROUND ${r.round_number}</div><strong>${escapeHtml(r.name)}</strong><div class="muted" style="font-size:10px;margin-top:5px">${escapeHtml(roundWindow(r))}</div><div class="muted" style="font-size:10px">${escapeHtml(scoringLabel(r))} · ${escapeHtml(ROUND_FIELD[r.round_number])}</div>${meta}${APP.role==='teacher'?showdownControls(r):studentShowdownControl(r,entries||[],rounds||[])}</div>`;
      }).join('');

      host.innerHTML=`${round2Instructions()}<div class="notice notice-green"><strong>Argonaut Access360:</strong> Students represent UWF Athletics Premium Sales and work the Reed Coastal Partners account from first contact through executive commitment.</div>${progression}<div class="showdown-grid">${cards}</div>`;

      if(APP.role==='student'){
        await renderPrivateJourney(host,rounds||[],own);
        await renderChampionshipBoard(host,rounds||[]);
      }else if(APP.role==='teacher'){
        await renderInstructorMonitor(host,comp,rounds||[],entries||[],participantCount);
        await renderChampionshipBoard(host,rounds||[]);
        await renderJudgeAdmin(host,comp,rounds||[]);
      }
    };

    async function renderPrivateJourney(host,rounds,own){
      const rows=rounds.map(r=>{
        const e=own.find(x=>x.round_id===r.id);
        if(!e)return `<tr><td>Round ${r.round_number}</td><td>${escapeHtml(ROUND_SHORT[r.round_number])}</td><td>—</td><td>Not submitted</td></tr>`;
        let score='—',status=e.championship_eligible?'Championship Field':'Development Track';
        if(r.id===ROUND2_ID)score='Feedback only';
        else if(r.championship_scoring_mode==='human'&&e.championship_eligible&&e.score_source!=='judge_panel')score='Awaiting judges';
        else score=e.score??'—';
        if(e.advanced)status=r.round_number===4?'Champion':ROUND_FIELD[r.round_number];
        return `<tr><td>Round ${r.round_number}</td><td>${escapeHtml(ROUND_SHORT[r.round_number])}</td><td><strong>${escapeHtml(score)}</strong></td><td>${escapeHtml(status)}</td></tr>`;
      }).join('');
      host.insertAdjacentHTML('beforeend',`<div class="section-label" style="margin-top:24px">Your Showdown journey</div><div class="card table-scroll"><table class="teacher-table"><thead><tr><th>Round</th><th>Skill</th><th>Your score</th><th>Track</th></tr></thead><tbody>${rows}</tbody></table></div>`);
    }

    async function renderChampionshipBoard(host,rounds){
      const released=rounds.filter(r=>r.results_released);
      if(!released.length)return;
      const panels=[];
      for(const r of released){
        const {data,error}=await SB.rpc('get_released_showdown_standings',{p_round_id:r.id});
        if(error)continue;
        const advanced=(data||[]).filter(x=>x.advanced);
        if(!advanced.length)continue;
        const title=r.round_number===4?'2026 Argo Sales Showdown Champion':ROUND_FIELD[r.round_number]+' Championship Field';
        panels.push(`<div class="card"><div class="section-label">Round ${r.round_number} results</div><h3>${escapeHtml(title)}</h3><div class="assignment-tags" style="margin-top:10px">${advanced.map(x=>`<span class="tag tag-green">${escapeHtml(x.full_name||'Competitor')}</span>`).join('')}</div></div>`);
      }
      if(panels.length)host.insertAdjacentHTML('beforeend','<div class="section-label" style="margin-top:24px">Championship dashboard</div>'+panels.join(''));
    }

    async function renderInstructorMonitor(host,comp,rounds,entries,participantCount){
      const profileIds=[...new Set(entries.map(e=>e.student_id))];
      const {data:people}=profileIds.length?await SB.from('profiles').select('id,full_name').in('id',profileIds):{data:[]};
      const names=Object.fromEntries((people||[]).map(p=>[p.id,p.full_name]));
      const openOrRecent=[...rounds].reverse().find(r=>entries.some(e=>e.round_id===r.id))||rounds.find(r=>r.status==='open')||rounds[0];
      if(!openOrRecent)return;
      const roundEntries=entries.filter(e=>e.round_id===openOrRecent.id).sort((a,b)=>(b.score??-1)-(a.score??-1));
      const rows=roundEntries.map(e=>`<tr><td>${escapeHtml(names[e.student_id]||'Student')}</td><td>${e.championship_eligible?'Championship':'Development'}</td><td>${e.score??'—'}</td><td>${escapeHtml(e.score_source||'—')}</td><td>${e.rank??'—'}</td><td>${e.advanced?'<span class="tag tag-green">Advances</span>':'—'}</td></tr>`).join('');
      host.insertAdjacentHTML('beforeend',`<div class="section-label" style="margin-top:24px">Instructor competition monitor</div><div class="card"><div class="muted" style="font-size:11px;margin-bottom:10px">Private instructor view · Round ${openOrRecent.round_number} · ${roundEntries.length}/${participantCount} official submissions</div><div class="table-scroll"><table class="teacher-table"><thead><tr><th>Student</th><th>Track</th><th>Score</th><th>Source</th><th>Rank</th><th>Status</th></tr></thead><tbody>${rows||'<tr><td colspan="6" class="empty">No official submissions yet.</td></tr>'}</tbody></table></div></div>`);
    }

    async function renderJudgeAdmin(host,comp,rounds){
      const [{data:judges},{data:invites},{data:reviews}]=await Promise.all([
        SB.from('competition_judges').select('*').eq('competition_id',comp.id).order('joined_at'),
        SB.from('competition_judge_invites').select('*').eq('competition_id',comp.id).order('created_at',{ascending:false}),
        SB.from('competition_judge_reviews').select('id,round_id,judge_id,entry_id').in('round_id',rounds.map(r=>r.id))
      ]);
      const judgeIds=[...new Set((judges||[]).map(j=>j.judge_id))];
      const {data:people}=judgeIds.length?await SB.from('profiles').select('id,full_name,email').in('id',judgeIds):{data:[]};
      const names=Object.fromEntries((people||[]).map(p=>[p.id,p]));
      const active=(judges||[]).filter(j=>j.active);
      const judgeRows=(judges||[]).map(j=>{
        const p=names[j.judge_id]||{};
        return `<tr><td>${escapeHtml(p.full_name||'Judge')}</td><td>${escapeHtml(p.email||'')}</td><td>${j.active?'<span class="tag tag-green">Active</span>':'<span class="tag tag-gray">Inactive</span>'}</td><td><button class="btn btn-outline btn-sm" onclick="setJudgeActive('${j.judge_id}',${!j.active})">${j.active?'Deactivate':'Reactivate'}</button></td></tr>`;
      }).join('');
      const pending=(invites||[]).filter(i=>i.active&&!i.redeemed_by);
      const humanRounds=rounds.filter(r=>r.championship_scoring_mode==='human');
      const progress=humanRounds.map(r=>{
        const rr=(reviews||[]).filter(x=>x.round_id===r.id).length;
        return `<span class="tag tag-gray">R${r.round_number}: ${rr} reviews</span>`;
      }).join('');
      host.insertAdjacentHTML('beforeend',`<div class="section-label" style="margin-top:24px">Guest judge panel</div><div class="card"><div class="form-row"><div class="form-field"><label>Judge name</label><input id="access360-judge-name" placeholder="Guest judge"></div><div class="form-field"><label>Judge email</label><input id="access360-judge-email" type="email" placeholder="judge@example.com"></div></div><div class="footer-actions"><button class="btn btn-gold" onclick="createJudgeInvite('${comp.id}')">Create secure judge invite</button></div><div id="access360-invite-output"></div><div class="assignment-tags" style="margin:14px 0">${progress||'<span class="tag tag-gray">No judge-scored rounds active yet</span>'}</div><div class="muted" style="font-size:11px;margin-bottom:10px">Active judges: ${active.length}. The same active panel reviews every Championship Field competitor in a judged round.</div><div class="table-scroll"><table class="teacher-table"><thead><tr><th>Judge</th><th>Email</th><th>Status</th><th></th></tr></thead><tbody>${judgeRows||'<tr><td colspan="4" class="empty">No guest judges connected yet.</td></tr>'}</tbody></table></div>${pending.length?'<div class="muted" style="font-size:10px;margin-top:10px">'+pending.length+' invitation(s) awaiting signup.</div>':''}</div>`);
    }

    window.createJudgeInvite=async function(compId){
      const email=el('access360-judge-email')?.value.trim().toLowerCase(),name=el('access360-judge-name')?.value.trim();
      if(!email)return toast('Enter the judge email.');
      const {data,error}=await SB.rpc('create_showdown_judge_invite',{p_competition_id:compId,p_email:email,p_display_name:name||null});
      if(error)return toast(error.message);
      const token=Array.isArray(data)?data[0]:data;
      const link=location.origin+location.pathname+'?judge='+encodeURIComponent(token);
      const box=el('access360-invite-output');
      if(box)box.innerHTML=`<div class="notice notice-green" style="margin-top:12px"><strong>Judge invitation ready.</strong><br><input id="access360-invite-link" value="${escapeHtml(link)}" readonly style="width:100%;margin:8px 0"><button class="btn btn-outline btn-sm" onclick="navigator.clipboard.writeText(document.getElementById('access360-invite-link').value);toast('Invite link copied.')">Copy link</button></div>`;
      toast('Secure judge invite created.');
      loadShowdown();
    };

    window.setJudgeActive=async function(judgeId,active){
      const {error}=await SB.rpc('set_showdown_judge_active',{p_judge_id:judgeId,p_active:active});
      if(error)return toast(error.message);
      toast(active?'Judge reactivated.':'Judge deactivated.');
      loadShowdown();
    };

    window.loadJudgeDashboard=async function(){
      ensureJudgePage();
      const host=el('judge-live');
      if(!host||APP.role!=='judge')return;
      const {data,error}=await SB.rpc('get_showdown_judge_queue');
      if(error){host.innerHTML='<div class="notice notice-gold">'+escapeHtml(error.message)+'</div>';return}
      const rows=data||[];
      if(!rows.length){host.innerHTML='<div class="card empty">No Championship Field performances are ready for your review yet.</div>';return}
      const cards=rows.map(x=>{
        const rubric=Array.isArray(x.rubric)?x.rubric:[];
        const existing=x.my_scores||{};
        const rubricHtml=rubric.map(item=>`<div class="form-row" style="align-items:end"><div class="form-field"><label>${escapeHtml(item.label)} · max ${item.max}</label><input id="judge-${x.entry_id}-${item.id}" type="number" min="0" max="${item.max}" value="${existing[item.id]??''}"></div></div>`).join('');
        return `<div class="card" id="judge-card-${x.entry_id}"><div class="section-label">Round ${x.round_number} · Independent review</div><h3>${escapeHtml(x.student_name||'Competitor')}</h3><div class="muted" style="font-size:11px;margin-bottom:10px">${escapeHtml(x.round_name||'')}</div><div id="judge-video-${x.entry_id}" style="margin-bottom:14px">${x.video_path?`<button class="btn btn-primary btn-sm" onclick="loadJudgeVideo('${x.entry_id}','${encodeURIComponent(x.video_path)}')">Load private recording</button>`:'<div class="notice notice-gold">Recording is not available yet. Check again after the student upload completes.</div>'}</div><div class="grid grid-2">${rubricHtml}</div><div class="form-field"><label>Strength</label><textarea id="judge-strength-${x.entry_id}" rows="2">${escapeHtml(x.my_strength||'')}</textarea></div><div class="form-field"><label>Priority improvement</label><textarea id="judge-improvement-${x.entry_id}" rows="2">${escapeHtml(x.my_improvement||'')}</textarea></div><div class="footer-actions"><button class="btn btn-gold" onclick="submitJudgeReview('${x.entry_id}')">${x.my_submitted_at?'Update submitted review':'Submit review'}</button>${x.my_total!=null?`<span class="tag tag-green">Your submitted total: ${x.my_total}</span>`:''}</div></div>`;
      }).join('');
      host.innerHTML=cards;
      window.ACCESS360_JUDGE_QUEUE=Object.fromEntries(rows.map(x=>[x.entry_id,x]));
    };

    window.loadJudgeVideo=async function(entryId,encodedPath){
      const path=decodeURIComponent(encodedPath);
      const host=el('judge-video-'+entryId);
      if(!host)return;
      host.innerHTML='<div class="muted">Loading secure recording…</div>';
      const {data,error}=await SB.storage.from('assignment-videos').createSignedUrl(path,3600);
      if(error||!data?.signedUrl){host.innerHTML='<div class="notice notice-gold">The recording could not be opened. '+escapeHtml(error?.message||'')+'</div>';return}
      host.innerHTML=`<video controls playsinline style="width:100%;max-height:520px;border-radius:12px;background:#000" src="${escapeHtml(data.signedUrl)}"></video>`;
    };

    window.submitJudgeReview=async function(entryId){
      const row=window.ACCESS360_JUDGE_QUEUE?.[entryId];
      if(!row)return toast('Review data is unavailable. Refresh and try again.');
      const rubric=Array.isArray(row.rubric)?row.rubric:[];
      const scores={};
      for(const item of rubric){
        const raw=el('judge-'+entryId+'-'+item.id)?.value;
        if(raw===''||raw==null)return toast('Complete every rubric score before submitting.');
        const score=Number(raw);
        if(!Number.isInteger(score)||score<0||score>Number(item.max))return toast('Check the score for '+item.label+'.');
        scores[item.id]=score;
      }
      const strength=el('judge-strength-'+entryId)?.value.trim()||null;
      const improvement=el('judge-improvement-'+entryId)?.value.trim()||null;
      const {error}=await SB.rpc('submit_showdown_judge_review',{p_entry_id:entryId,p_scores:scores,p_strength:strength,p_improvement:improvement});
      if(error)return toast(error.message);
      toast('Independent judge review submitted.');
      loadJudgeDashboard();
    };

    async function initJudgeInviteFlow(){
      const token=new URLSearchParams(location.search).get('judge');
      if(!token)return;
      const {data,error}=await SB.rpc('get_showdown_judge_invite',{p_token:token});
      const invite=data?.[0];
      if(error||!invite){
        showPage('auth-page');
        authNotice('This judge invitation is invalid, expired, or has already been used.','error');
        return;
      }
      if(APP.user&&APP.role==='judge'){showPage('judge-home');return}
      showPage('auth-page');
      const panel=document.querySelector('#auth-page .auth-panel');
      if(!panel)return;
      panel.innerHTML=`<h2>Guest Judge Access</h2><p class="muted" style="font-size:12px;line-height:1.6">You have been invited to independently review Argo Sales Showdown performances. Your view will not show AI scores or other judges' scores.</p><div id="judge-signup-notice" class="notice notice-info">Create your private reviewer account using the invited email address.</div><div class="form-field"><label>Name</label><input id="judge-signup-name" value="${escapeHtml(invite.display_name||'')}"></div><div class="form-field"><label>Email</label><input id="judge-signup-email" type="email" value="${escapeHtml(invite.email||'')}" readonly></div><div class="form-field"><label>Password</label><input id="judge-signup-password" type="password" minlength="8" placeholder="At least 8 characters"></div><button class="btn btn-gold" style="width:100%" onclick="createJudgeAccount('${escapeHtml(token)}')">Create judge account</button>`;
    }

    window.createJudgeAccount=async function(token){
      const name=el('judge-signup-name')?.value.trim(),email=el('judge-signup-email')?.value.trim().toLowerCase(),password=el('judge-signup-password')?.value||'';
      const note=el('judge-signup-notice');
      if(!name||!email||password.length<8){if(note){note.className='notice notice-red';note.textContent='Enter your name and a password with at least 8 characters.'}return}
      const {data,error}=await SB.auth.signUp({email,password,options:{data:{full_name:name,judge_invite_token:token}}});
      if(error){if(note){note.className='notice notice-red';note.textContent=error.message}return}
      if(data?.session){
        APP.user=data.session.user;
        await loadProfile();
      }else if(note){
        note.className='notice notice-green';
        note.textContent='Judge account created. Check your email to confirm the account, then sign in.';
      }
    };

    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(initJudgeInviteFlow,0));
    else setTimeout(initJudgeInviteFlow,0);

    if(APP.role==='judge')showPage('judge-home');
  }

  ready();
})();