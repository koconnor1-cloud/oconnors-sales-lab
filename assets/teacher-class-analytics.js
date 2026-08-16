/* Teacher dashboard class analytics.
   Summarizes what the class is practicing (minutes by scenario) separately from
   how the class is performing (average skill evidence). This avoids double-counting
   one session's duration across multiple skill ratings. */

const CLASS_ANALYTICS_SCENARIOS=['elevator','cold','discovery','presentation','objection','commitment','integrated','interview'];
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
  const {data:students,error:studentError}=await SB.from('profiles').select('id').eq('role','student').eq('class_code',code);
  if(studentError)return;
  const ids=(students||[]).map(s=>s.id);
  const fields='student_id,scenario,duration_seconds,rapport,clarity,confidence,close_score,discovery,value_prop,objections,listening';
  const {data:sessions,error}=ids.length?await SB.from('sessions').select(fields).in('student_id',ids):{data:[],error:null};
  if(error)return;
  renderClassPracticeMinutes(sessions||[]);
  renderClassSkillProfile(sessions||[]);
};

const analyticsCoreLoadTeacherHome=loadTeacherHome;
loadTeacherHome=async function(){
  await analyticsCoreLoadTeacherHome();
  await window.renderTeacherClassAnalytics();
};

if(APP.role==='teacher'&&el('teacher-home')?.classList.contains('active'))window.renderTeacherClassAnalytics();
