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

    const scripts=await page.locator('script[src]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('src')));
    if(!scripts.includes('assets/launch-evidence.js'))throw new Error(`${name}: evidence-scoring extension did not load`);
    if(!scripts.includes('assets/launch-controls.js'))throw new Error(`${name}: workflow-control extension did not load`);
    const controlFns=await page.evaluate(()=>({
      returnGradeForReview:typeof window.returnGradeForReview,
      setShowdownResultsReleased:typeof window.setShowdownResultsReleased,
      renderReleasedShowdownStandings:typeof window.renderReleasedShowdownStandings
    }));
    for(const [fn,type] of Object.entries(controlFns))if(type!=='function')throw new Error(`${name}: ${fn} is not available`);
    if(errors.length)throw new Error(`${name}: browser errors: ${errors.join(' | ')}`);
    fs.mkdirSync('smoke-artifacts',{recursive:true});
    await page.screenshot({path:`smoke-artifacts/${name}.png`,fullPage:true});
    await page.close();
  }
  await browser.close();
  console.log('Desktop and iPad smoke tests passed; auth hero stays locked across Student/Instructor tabs.');
} finally {server.kill('SIGTERM')}
