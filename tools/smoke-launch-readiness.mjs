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
    const scripts=await page.locator('script[src]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('src')));
    if(!scripts.includes('assets/launch-evidence.js'))throw new Error(`${name}: evidence-scoring extension did not load`);
    if(errors.length)throw new Error(`${name}: browser errors: ${errors.join(' | ')}`);
    fs.mkdirSync('smoke-artifacts',{recursive:true});
    await page.screenshot({path:`smoke-artifacts/${name}.png`,fullPage:true});
    await page.close();
  }
  await browser.close();
  console.log('Desktop and iPad production-index smoke tests passed with evidence scoring loaded.');
} finally {server.kill('SIGTERM')}
