/* Teacher dashboard class analytics.
   Summarizes what the class is practicing (minutes by scenario) separately from
   how the class is performing (average skill evidence). This avoids double-counting
   one session's duration across multiple skill ratings. */

const CLASS_ANALYTICS_SCENARIOS=['elevator','cold','discovery','presentation','objection','commitment','integrated','interview'];
const SALES_LAB_CHALLENGE={
  minutesGoal:300,
  stretchMinutes:500,
  sessionsGoal:18,
  attemptsPerCore:3,
  partyPercent:.80,
  coreScenarios:['elevator','cold','discovery','presentation','objection','commitment'],
  excludedEmails:['oconnorkenny@hotmail.com']
};
const CLASS_ANALYTICS_SKILLS=[
  {key:'rapport',label:'Rapport'},
  {key:'clarity',label:'Clarity'},
  {key:'confidence',label:'Confidence'},
  {key:'close_score',label:'Commitment'},
  {key:'discovery',label:'Discovery'},
  {key:'value_prop',label:'Value'},
  {key:'objections',label:'Objections'},
  {key:'listening',label:'Listening'}
];

function analyticsMinutes(seconds){
  const minutes=(Number(seconds)||0)/60;
  if(minutes===0)return'0 min';
  if(minutes<10)return minutes.toFixed(1).replace(/\.0$/,'')+' min';
  return Math.round(minutes)+' min';
}

function analyticsAverage(values){
  const clean=values.map(Number).filter(Number.isFinite);
  return clean.length?clean.reduce((a,b)=>a+b,0)/clean.length:null;
}

function analyticsSkillData(sessions){
  return CLASS_ANALYTICS_SKILLS.map(skill=>{
    const values=(sessions||[]).map(s=>s[skill.key]).filter(v=>v!==null&&v!==undefined&&v!=='').map(Number).filter(Number.isFinite);
    return {...skill,average:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,count:values.length};
  });
}

function ensureTeacherAnalyticsHosts(){
  const page=el('teacher-home');
  if(!page)return null;
  let block=el('teacher-class-analytics');
  if(block)return block;
  const wrap=page.querySelector('.wrap');
  const tableCard=wrap?.querySelector('.card.table-scroll');
  if(!wrap||!tableCard)return null;
  block=document.createElement('div');
  block.id='teacher-class-analytics';
  block.innerHTML=`
    <div class="section-label" style="margin-top:24px">Sales Lab 300 Challenge</div>
    <div class="muted" style="font-size:11px;line-height:1.55;margin:-3px 0 10px">Live progress toward 300 minutes, 18 completed sessions, and three attempts in each of the six core scenarios. The Kenny Rogers test account is excluded.</div>
    <div id="teacher-challenge-summary"><div class="card empty">Loading challenge progress…</div></div>
    <div class="card table-scroll" id="teacher-challenge-table" style="margin-top:14px"><div class="empty">Loading student challenge standings…</div></div>
    <div class="section-label" style="margin-top:24px">Class practice mix</div>
    <div class="muted" style="font-size:11px;line-height:1.55;margin:-3px 0 10px">Total saved practice time by Sales Lab scenario. Time is counted once, in the scenario the student actually practiced.</div>
    <div class="grid grid-4" id="teacher-practice-minutes"><div class="card empty" style="grid-column:1/-1">Loading practice minutes…</div></div>
    <div class="section-label" style="margin-top:26px">Class skill profile</div>
    <div class="muted" style="font-size:11px;line-height:1.55;margin:-3px 0 10px">Aggregated 1–10 skill evidence across scored sessions. Use this to identify class strengths and coaching priorities.</div>
    <div id="teacher-skill-summary"></div>
    <div class="card" id="teacher-skill-profile"><div class="empty">Loading class skill profile…</div></div>`;
  wrap.insertBefore(block,tableCard);
  return block;
}


function challengeWeekKey(value){
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return null;
  const day=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));
  day.setUTCDate(day.getUTCDate()+4-(day.getUTCDay()||7));
  const yearStart=new Date(Date.UTC(day.getUTCFullYear(),0,1));
  return day.getUTCFullYear()+'-W'+String(Math.ceil((((day-yearStart)/86400000)+1)/7)).padStart(2,'0');
}

function challengeStudentRow(student,sessions){
  const rows=(sessions||[]).filter(s=>s.student_id===student.id);
  const seconds=rows.reduce((sum,s)=>sum+(Number(s.duration_seconds)||0),0);
  const minutes=seconds/60;
  const scenarioCounts=Object.fromEntries(SALES_LAB_CHALLENGE.coreScenarios.map(key=>[key,rows.filter(s=>s.scenario===key).length]));
  const coreComplete=SALES_LAB_CHALLENGE.coreScenarios.filter(key=>scenarioCounts[key]>=SALES_LAB_CHALLENGE.attemptsPerCore).length;
  const activeWeeks=new Set(rows.map(s=>challengeWeekKey(s.created_at)).filter(Boolean)).size;
  const requirements={
    minutes:minutes>=SALES_LAB_CHALLENGE.minutesGoal,
    sessions:rows.length>=SALES_LAB_CHALLENGE.sessionsGoal,
    scenarios:coreComplete===SALES_LAB_CHALLENGE.coreScenarios.length
  };
  return{
    ...student,
    rows,
    minutes,
    seconds,
    sessionCount:rows.length,
    scenarioCounts,
    coreComplete,
    activeWeeks,
    requirements,
    qualified:requirements.minutes&&requirements.sessions&&requirements.scenarios,
    stretch:minutes>=SALES_LAB_CHALLENGE.stretchMinutes
  };
}

function challengeProgressBar(value,max,color='var(--navy)'){
  const pct=Math.max(0,Math.min(100,max?value/max*100:0));
  return'<div style="height:8px;background:#e8edf3;border-radius:99px;overflow:hidden;margin-top:7px"><div style="height:100%;width:'+pct+'%;background:'+color+';border-radius:99px"></div></div>';
}

function renderSalesLabChallenge(students,sessions){
  const summary=el('teacher-challenge-summary'),table=el('teacher-challenge-table');
  if(!summary||!table)return;
  const rows=(students||[]).map(student=>challengeStudentRow(student,sessions));
  const classMinutes=rows.reduce((sum,row)=>sum+row.minutes,0);
  const classTarget=rows.length*SALES_LAB_CHALLENGE.minutesGoal;
  const qualified=rows.filter(row=>row.qualified).length;
  const minutesReached=rows.filter(row=>row.requirements.minutes).length;
  const stretch=rows.filter(row=>row.stretch).length;
  const partyNeeded=rows.length?Math.ceil(rows.length*SALES_LAB_CHALLENGE.partyPercent):0;
  const partyPct=partyNeeded?Math.min(100,qualified/partyNeeded*100):0;
  const celebration=partyNeeded>0&&qualified>=partyNeeded;
  summary.innerHTML=`
    <div class="stats" style="margin-bottom:14px">
      <div class="stat"><span>Class practice</span><strong>${Math.floor(classMinutes)}m</strong><div class="muted" style="font-size:10px;margin-top:4px">of ${classTarget.toLocaleString()}m · ${classTarget?Math.round(classMinutes/classTarget*100):0}%</div>${challengeProgressBar(classMinutes,classTarget,'var(--gold)')}</div>
      <div class="stat"><span>Reached 300 minutes</span><strong>${minutesReached}/${rows.length}</strong><div class="muted" style="font-size:10px;margin-top:4px">Minutes requirement only</div></div>
      <div class="stat"><span>Completed all requirements</span><strong>${qualified}/${rows.length}</strong><div class="muted" style="font-size:10px;margin-top:4px">Party threshold: ${partyNeeded} students</div>${challengeProgressBar(qualified,partyNeeded,celebration?'var(--green)':'var(--gold)')}</div>
      <div class="stat"><span>500-Minute Club</span><strong>${stretch}</strong><div class="muted" style="font-size:10px;margin-top:4px">Individual stretch recognition</div></div>
    </div>
    <div class="notice ${celebration?'notice-green':'notice-gold'}" style="margin-bottom:0"><strong>${celebration?'Celebration unlocked!':'Class reward progress: '+Math.round(partyPct)+'%'}</strong> ${celebration?'At least 80% of the class has completed all three requirements.':qualified+' of '+partyNeeded+' students have qualified. '+Math.max(0,partyNeeded-qualified)+' more needed to unlock the class celebration.'}</div>`;
  if(!rows.length){
    table.innerHTML='<div class="empty">No eligible students are enrolled yet.</div>';
    return;
  }
  const sorted=[...rows].sort((a,b)=>Number(b.qualified)-Number(a.qualified)||b.minutes-a.minutes||b.sessionCount-a.sessionCount||String(a.full_name||a.email).localeCompare(String(b.full_name||b.email)));
  table.innerHTML=`<table class="teacher-table"><thead><tr><th>Student</th><th>Minutes</th><th>Sessions</th><th>Core scenarios at 3+</th><th>Active weeks</th><th>Status</th></tr></thead><tbody>${sorted.map(row=>{
    const status=row.qualified?'<span class="tag tag-green">Qualified</span>':row.stretch?'<span class="tag tag-gold">500 Club · requirements pending</span>':'<span class="tag tag-gray">In progress</span>';
    return `<tr><td><strong>${escapeHtml(row.full_name||row.email)}</strong></td><td>${Math.floor(row.minutes)} / 300${challengeProgressBar(row.minutes,SALES_LAB_CHALLENGE.minutesGoal,row.requirements.minutes?'var(--green)':'var(--gold)')}</td><td>${row.sessionCount} / 18</td><td>${row.coreComplete} / 6</td><td>${row.activeWeeks}</td><td>${status}</td></tr>`;
  }).join('')}</tbody></table><div class="muted" style="font-size:10px;line-height:1.55;padding:11px 14px">Active weeks tracks whether practice is distributed over time; it is informational and is not an additional qualification requirement.</div>`;
}

function renderClassPracticeMinutes(sessions){
  const host=el('teacher-practice-minutes');
  if(!host)return;
  host.innerHTML=CLASS_ANALYTICS_SCENARIOS.map(key=>{
    const rows=(sessions||[]).filter(s=>s.scenario===key);
    const seconds=rows.reduce((sum,s)=>sum+(Number(s.duration_seconds)||0),0);
    const sc=SCENARIOS[key]||{icon:'•',name:key};
    return`<div class="card" style="margin-bottom:0"><div style="display:flex;align-items:center;gap:9px;margin-bottom:9px"><span style="font-size:22px">${sc.icon}</span><strong style="font-size:12px">${escapeHtml(sc.name)}</strong></div><div style="font:800 24px 'DM Mono',monospace">${analyticsMinutes(seconds)}</div><div class="muted" style="font-size:10px;margin-top:4px">${rows.length} saved session${rows.length===1?'':'s'}</div></div>`;
  }).join('');
}

function renderClassSkillProfile(sessions){
  const summary=el('teacher-skill-summary'),host=el('teacher-skill-profile');
  if(!summary||!host)return;
  const skills=analyticsSkillData(sessions);
  const available=skills.filter(s=>s.average!==null);
  const scoredSessions=(sessions||[]).filter(s=>CLASS_ANALYTICS_SKILLS.some(skill=>Number.isFinite(Number(s[skill.key])))).length;
  if(!available.length){
    summary.innerHTML='';
    host.innerHTML='<div class="empty">No scored skill evidence yet. The profile will populate as students complete practice sessions.</div>';
    return;
  }
  const overall=analyticsAverage(available.map(s=>s.average));
  const high=Math.max(...available.map(s=>s.average));
  const low=Math.min(...available.map(s=>s.average));
  const strongest=available.filter(s=>Math.abs(s.average-high)<0.001).map(s=>s.label).join(' + ');
  const weakest=available.filter(s=>Math.abs(s.average-low)<0.001).map(s=>s.label).join(' + ');
  const spread=high-low;
  summary.innerHTML=`<div class="stats" style="margin-bottom:14px"><div class="stat"><span>Class skill index</span><strong>${overall.toFixed(1)}/10</strong></div><div class="stat"><span>Strongest</span><strong style="font-family:'DM Sans';font-size:15px;line-height:1.25">${escapeHtml(strongest)}</strong><div class="muted" style="font-size:10px;margin-top:4px">${high.toFixed(1)}/10</div></div><div class="stat"><span>Needs focus</span><strong style="font-family:'DM Sans';font-size:15px;line-height:1.25">${escapeHtml(weakest)}</strong><div class="muted" style="font-size:10px;margin-top:4px">${low.toFixed(1)}/10</div></div><div class="stat"><span>Skill spread</span><strong>${spread.toFixed(1)}</strong><div class="muted" style="font-size:10px;margin-top:4px">${scoredSessions} scored session${scoredSessions===1?'':'s'}</div></div></div>`;
  const sorted=[...skills].sort((a,b)=>{
    if(a.average===null&&b.average===null)return 0;
    if(a.average===null)return 1;
    if(b.average===null)return-1;
    return b.average-a.average;
  });
  host.innerHTML=`<div style="display:grid;gap:13px">${sorted.map((s,index)=>{
    const pct=s.average===null?0:Math.max(0,Math.min(100,s.average*10));
    const badge=s.average===null?'<span class="tag tag-gray">No data</span>':Math.abs(s.average-high)<0.001?'<span class="tag tag-green">Strength</span>':Math.abs(s.average-low)<0.001?'<span class="tag tag-gold">Focus</span>':'';
    return`<div><div style="display:grid;grid-template-columns:minmax(110px,1.2fr) minmax(130px,4fr) 72px 82px;gap:10px;align-items:center"><div><strong style="font-size:12px">${escapeHtml(s.label)}</strong> ${badge}</div><div style="height:9px;background:#e8edf3;border-radius:99px;overflow:hidden"><div style="height:100%;width:${pct}%;background:var(--navy);border-radius:99px"></div></div><div style="font:800 14px 'DM Mono',monospace;text-align:right">${s.average===null?'—':s.average.toFixed(1)+'/10'}</div><div class="muted" style="font-size:10px;text-align:right">n=${s.count}</div></div></div>`;
  }).join('')}</div><div class="muted" style="font-size:10px;line-height:1.55;margin-top:16px">The class skill index is the mean of the available eight skill averages, not a course grade. “n” shows how many saved sessions contained evidence for each skill.</div>`;
}

window.renderTeacherClassAnalytics=async function(){
  if(APP.role!=='teacher')return;
  ensureTeacherAnalyticsHosts();
  const code=APP.profile?.class_code||'SALESFALL26';
  const {data:allStudents,error:studentError}=await SB.from('profiles').select('id,full_name,email').eq('role','student').eq('class_code',code).order('full_name');
  const students=(allStudents||[]).filter(student=>!SALES_LAB_CHALLENGE.excludedEmails.includes(String(student.email||'').toLowerCase()));
  if(studentError)return;
  const ids=(students||[]).map(s=>s.id);
  const fields='student_id,scenario,duration_seconds,created_at,rapport,clarity,confidence,close_score,discovery,value_prop,objections,listening';
  const {data:sessions,error}=ids.length?await SB.from('sessions').select(fields).in('student_id',ids):{data:[],error:null};
  if(error)return;
  renderSalesLabChallenge(students,sessions||[]);
  renderClassPracticeMinutes(sessions||[]);
  renderClassSkillProfile(sessions||[]);
};

const analyticsCoreLoadTeacherHome=loadTeacherHome;
loadTeacherHome=async function(){
  await analyticsCoreLoadTeacherHome();
  await window.renderTeacherClassAnalytics();
};

if(APP.role==='teacher'&&el('teacher-home')?.classList.contains('active'))window.renderTeacherClassAnalytics();
