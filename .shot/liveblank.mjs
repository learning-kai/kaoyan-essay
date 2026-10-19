import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9497;
const LIVE = 'https://learning-kai.github.io/kaoyan-essay/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const proc = spawn(EDGE, ['--headless=new','--disable-gpu','--no-first-run','--disable-extensions','--hide-scrollbars','--mute-audio',
  '--remote-debugging-port='+PORT, `--user-data-dir=${process.env.TEMP}\\edge-lv-${Date.now()}`, '--window-size=1400,1000','about:blank'], { stdio: 'ignore' });
const list = async () => { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { return []; } };
for (let i=0;i<80;i++){ if((await list()).length) break; await sleep(250); }
let ws, pending = new Map(), id = 0; const errs=[];
const send = (m,p={}) => new Promise((res,rej)=>{const i=++id;const t=setTimeout(()=>{pending.delete(i);rej(new Error('timeout '+m));},20000);pending.set(i,x=>{clearTimeout(t);res(x);});ws.send(JSON.stringify({id:i,method:m,params:p}));});
const attach = url => new Promise(res=>{ws=new WebSocket(url);ws.addEventListener('open',()=>res());ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}
 if(m.method==='Runtime.exceptionThrown')errs.push('EXC'+(m.params.exceptionDetails.exception?.description||'').slice(0,150));});});
const ev = async e => { const r = await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true}); if (r.result?.exceptionDetails) return 'ERR '+(r.result.exceptionDetails.exception?.description||'').slice(0,200); return r.result?.result?.value; };
const click = s => ev(`(()=>{const el=document.querySelector(${JSON.stringify(s)});if(!el)throw new Error('missing');el.click();return 1;})()`);
const cnt = s => ev(`document.querySelectorAll(${JSON.stringify(s)}).length`);
let pass=0,fail=0;
const check=(n,ok,x)=>{ if(ok){pass++;console.log('  ok   '+n);} else {fail++;console.log('  FAIL '+n+' -> '+String(JSON.stringify(x)).slice(0,150));} };

const t0 = (await list()).find(t=>t.type==='page');
await attach(t0.webSocketDebuggerUrl); await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate',{url:LIVE}); await sleep(2600);
const pg=(await list()).filter(t=>t.type==='page'&&t.url.includes('kaoyan-essay')).pop();
if(pg){try{ws.close();}catch{}await attach(pg.webSocketDebuggerUrl);await send('Runtime.enable');await send('Page.enable');}
await sleep(1200);
await ev("localStorage.clear()"); await send('Page.reload'); await sleep(2200);

await click('#btnTplRecite'); await sleep(900);
check('线上 6 种模式', (await cnt('#modes .mode')) === 6, await cnt('#modes .mode'));
const ms = await ev("[...document.querySelectorAll('#modes .mode')].map(b=>b.dataset.mode).join(',')");
check('线上无 block', !ms.includes('block'), ms);
await click('[data-mode="blank"]'); await sleep(700);
check('线上填空有输入框', (await cnt('.blank-input')) > 3, await cnt('.blank-input'));
const ans = await ev("document.querySelector('.blank-input').dataset.ans");
await ev(`(()=>{const i=document.querySelector('.blank-input');i.value=${JSON.stringify(ans)};i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));return 1;})()`);
await sleep(400);
check('线上打字判分变绿', (await ev("document.querySelector('.blank-input').className")).includes('ok'), await ev("document.querySelector('.blank-input').className"));
const shot = await send('Page.captureScreenshot',{format:'png'});
if (shot.result?.data) writeFileSync('.shot/live-blank.png', Buffer.from(shot.result.data,'base64'));
check('线上无 JS 错误', errs.length===0, errs.slice(0,3));
console.log(`\n线上通过 ${pass} · 失败 ${fail}`);
try{proc.kill();}catch{}
process.exit(fail?1:0);
