import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

// Preserve the exact production entry page as the CI launch artifact.
fs.copyFileSync('index.html','launch-ready.html');
const server=spawn('python3',['-m','http.server','4173','--bind','127.0.0.1'],{stdio:'ignore'});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{
  await wait(1000);
  const browser=await chromium.launch({headless:true});
  for(const [name,viewport] of Object.entries({desktop:{width:1440,height:1000},ipad:{width:820,height:1180}})){
    const page=await browser.newPage({viewport});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:4173/index.html',{waitUntil:'networkidle',timeout:30000});
    await page.waitForSelector('#auth-page.active',{timeout:10000});
    const title=await page.textContent('h1');
    if(!title?.includes('Practice the conversation'))throw new Error(`${name}: auth hero did not render`);
    const privacy=await page.textContent('.auth-brand');
    if(!privacy?.includes('Free practice is not durably recorded'))throw new Error(`${name}: free-practice privacy copy missing`);
    if(!privacy?.includes('explicit consent'))throw new Error(`${name}: formal recording consent copy missing`);

    // The left hero must not move when the taller Student signup form is shown.
    const heroCards=page.locator('#auth-page .auth-brand>div:last-child');
    const heroIntro=page.locator('#auth-page .auth-brand>p');
    const studentBox=await heroCards.boundingBox();
    const introBox=await heroIntro.boundingBox();
    if(!studentBox||!introBox)throw new Error(`${name}: auth hero geometry unavailable`);
    const expectedGap=name==='desktop'?55:70;
    const studentGap=studentBox.y-(introBox.y+introBox.height);
    if(studentGap>expectedGap)throw new Error(`${name}: student hero has excessive intro gap (${Math.round(studentGap)}px)`);
    await page.locator('[data-auth-role="teacher"]').click();
    const teacherBox=await heroCards.boundingBox();
    if(!teacherBox||Math.abs(teacherBox.y-studentBox.y)>2)throw new Error(`${name}: hero shifts between Student and Instructor tabs`);
    await page.locator('[data-auth-role="student"]').click();
    const studentAgain=await heroCards.boundingBox();
    if(!studentAgain||Math.abs(studentAgain.y-studentBox.y)>2)throw new Error(`${name}: hero does not return to its locked position`);

    await page.waitForFunction(()=>typeof window.openInstructorSession==='function'&&typeof window.backToStudentSessions==='function'&&typeof window.renderTeacherClassAnalytics==='function'&&typeof window.analyticsSkillData==='function',{timeout:10000});
    const scripts=await page.locator('script[src]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('src')));
    const hasScript=base=>scripts.some(src=>src===base||src?.startsWith(base+'?'));
    if(!hasScript('assets/launch-evidence.js'))throw new Error(`${name}: evidence-scoring extension did not load`);
    if(!hasScript('assets/launch-controls.js'))throw new Error(`${name}: workflow-control extension did not load`);
    if(!hasScript('assets/instructor-session-review.js'))throw new Error(`${name}: instructor-session-review extension did not load`);
    if(!hasScript('assets/teacher-class-analytics.js'))throw new Error(`${name}: teacher-class-analytics extension did not load`);
    if(!hasScript('assets/student-handsfree.js'))throw new Error(`${name}: student hands-free extension did not load`);
    const controls=await page.evaluate(()=>({
      returnGradeForReview:typeof window.returnGradeForReview,
      setShowdownResultsReleased:typeof window.setShowdownResultsReleased,
      renderReleasedShowdownStandings:typeof window.renderReleasedShowdownStandings,
      resetPassword:typeof window.resetPassword,
      showPasswordRecovery:typeof window.showPasswordRecovery,
      updateRecoveredPassword:typeof window.updateRecoveredPassword,
      teacherViewStudent:typeof window.teacherViewStudent,
      openInstructorSession:typeof window.openInstructorSession,
      backToStudentSessions:typeof window.backToStudentSessions,
      renderTeacherClassAnalytics:typeof window.renderTeacherClassAnalytics,
      analyticsSkillData:typeof window.analyticsSkillData,
      toggleHandsFree:typeof window.toggleHandsFree,
      enableHandsFree:typeof window.enableHandsFree,
      disableHandsFree:typeof window.disableHandsFree,
      recoveryUrl:window.SALES_LAB_RECOVERY_URL
    }));
    for(const fn of ['returnGradeForReview','setShowdownResultsReleased','renderReleasedShowdownStandings','resetPassword','showPasswordRecovery','updateRecoveredPassword','teacherViewStudent','openInstructorSession','backToStudentSessions','renderTeacherClassAnalytics','analyticsSkillData','toggleHandsFree','enableHandsFree','disableHandsFree']){
      if(controls[fn]!=='function')throw new Error(`${name}: ${fn} is not available`);
    }
    if(controls.recoveryUrl!=='https://koconnor1-cloud.github.io/oconnors-sales-lab/')throw new Error(`${name}: password reset is not pinned to the live Sales Lab URL`);

    // Analytics calculations must tolerate missing values and preserve all eight skills.
    const analytics=await page.evaluate(()=>{
      const mock=[
        {scenario:'cold',duration_seconds:600,rapport:8,clarity:7,confidence:7,close_score:6,discovery:5,value_prop:4,objections:6,listening:8},
        {scenario:'cold',duration_seconds:300,rapport:6,clarity:null,confidence:5,close_score:6,discovery:4,value_prop:3,objections:5,listening:7},
        {scenario:'discovery',duration_seconds:420,rapport:7,clarity:8,confidence:7,close_score:5,discovery:9,value_prop:6,objections:6,listening:9}
      ];
      const skills=window.analyticsSkillData(mock);
      return {skills,minutesCold:window.analyticsMinutes(900),minutesZero:window.analyticsMinutes(0)};
    });
    if(analytics.skills.length!==8)throw new Error(`${name}: class analytics did not return eight skill metrics`);
    const rapport=analytics.skills.find(s=>s.key==='rapport');
    const clarity=analytics.skills.find(s=>s.key==='clarity');
    if(Math.abs(rapport.average-7)>0.001||rapport.count!==3)throw new Error(`${name}: rapport aggregation is incorrect`);
    if(Math.abs(clarity.average-7.5)>0.001||clarity.count!==2)throw new Error(`${name}: missing skill values are not handled correctly`);
    if(analytics.minutesCold!=='15 min'||analytics.minutesZero!=='0 min')throw new Error(`${name}: practice-minute formatting is incorrect`);
    const hf=await page.evaluate(()=>({button:document.querySelector('#handsfree-toggle')?.textContent||'',hasManualMic:typeof window.toggleMic==='function'}));
    if(!hf.button.includes('Hands-free'))throw new Error(`${name}: Hands-free control is missing`);
    if(!hf.hasManualMic)throw new Error(`${name}: push-to-talk fallback is missing`);


    fs.mkdirSync('smoke-artifacts',{recursive:true});
    await page.screenshot({path:`smoke-artifacts/${name}.png`,fullPage:true});

    // Recovery UI must be a real new-password form and must not disturb the left hero.
    await page.evaluate(()=>window.showPasswordRecovery());
    await page.waitForSelector('#recovery-password');
    if(await page.locator('#recovery-password-confirm').count()!==1)throw new Error(`${name}: password confirmation field missing`);
    if(await page.locator('#recovery-submit').count()!==1)throw new Error(`${name}: password update button missing`);
    const recoveryHeroBox=await heroCards.boundingBox();
    if(!recoveryHeroBox||Math.abs(recoveryHeroBox.y-studentBox.y)>2)throw new Error(`${name}: recovery mode moved the locked hero`);
    if(errors.length)throw new Error(`${name}: browser errors: ${errors.join(' | ')}`);
    await page.close();
  }

  // A valid recovery URL must intercept ordinary profile/dashboard routing before it wins the race.
  const recovery=await browser.newPage({viewport:{width:1440,height:1000}});
  const recoveryErrors=[];
  recovery.on('pageerror',e=>recoveryErrors.push(e.message));
  await recovery.goto('http://127.0.0.1:4173/index.html#type=recovery',{waitUntil:'networkidle',timeout:30000});
  await recovery.waitForFunction(()=>window.SALES_LAB_RECOVERY_BOOT===true&&typeof window.showPasswordRecovery==='function',null,{timeout:10000});
  await recovery.evaluate(async()=>{APP.user={id:'smoke-recovery-user',email:'instructor@example.edu'};await loadProfile()});
  await recovery.waitForSelector('#recovery-password',{timeout:10000});
  if(await recovery.locator('#teacher-home.active').count())throw new Error('valid recovery flow routed into instructor dashboard before password reset');
  const recoveryHeading=await recovery.textContent('#auth-page .auth-panel h2');
  if(!recoveryHeading?.includes('Choose a new password'))throw new Error('valid recovery flow did not show the new-password screen');
  if(recoveryErrors.length)throw new Error(`recovery-startup browser errors: ${recoveryErrors.join(' | ')}`);
  await recovery.close();

  // Expired one-time links should return to the live auth page with useful instructions.
  const expired=await browser.newPage({viewport:{width:1440,height:1000}});
  const expiredErrors=[];
  expired.on('pageerror',e=>expiredErrors.push(e.message));
  await expired.goto('http://127.0.0.1:4173/index.html?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',{waitUntil:'networkidle',timeout:30000});
  await expired.waitForFunction(()=>document.querySelector('#auth-notice')?.textContent.includes('invalid or has expired'),null,{timeout:10000});
  const expiredText=await expired.textContent('#auth-notice');
  if(!expiredText?.includes('Forgot password'))throw new Error('expired recovery link does not explain how to request a fresh link');
  if(expiredErrors.length)throw new Error(`expired-link browser errors: ${expiredErrors.join(' | ')}`);
  await expired.close();

  await browser.close();
  console.log('Desktop/iPad layout, recovery, instructor review, and class analytics smoke tests passed.');
} finally {server.kill('SIGTERM')}
