import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9461;
const LIVE = 'https://learning-kai.github.io/kaoyan-essay/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const proc = spawn(EDGE, ['--headless=new','--disable-gpu','--no-first-run','--disable-extensions','--hide-scrollbars','--mute-audio',
  '--remote-debugging-port='+PORT, `--user-data-dir=${process.env.TEMP}\\edge-shot-${Date.now()}`, '--window-size=1400,1000','about:blank'], { stdio: 'ignore' });
const list = async () => { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { return []; } };
for (let i=0;i<80;i++){ if((await list()).length) break; await sleep(250); }
let ws, pending = new Map(), id = 0;
const send = (m,p={}) => new Promise((res,rej)=>{const i=++id;const t=setTimeout(()=>{pending.delete(i);rej(new Error('timeout '+m));},20000);pending.set(i,x=>{clearTimeout(t);res(x);});ws.send(JSON.stringify({id:i,method:m,params:p}));});
const attach = url => new Promise(res=>{ws=new WebSocket(url);ws.addEventListener('open',()=>res());ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}});});
const ev = async e => (await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true})).result?.result?.value;

const t0 = (await list()).find(t=>t.type==='page');
await attach(t0.webSocketDebuggerUrl); await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate',{url:LIVE}); await sleep(2600);
const pg = (await list()).filter(t=>t.type==='page' && t.url.includes('kaoyan-essay')).pop();
if (pg) { try{ws.close();}catch{} await attach(pg.webSocketDebuggerUrl); await send('Runtime.enable'); await send('Page.enable'); }
await sleep(1500);
console.log('url     :', await ev('location.href'));
console.log('title   :', await ev('document.title'));
console.log('sections:', await ev("document.querySelectorAll('.tpl-block').length"));
console.log('句数    :', await ev("document.querySelectorAll('.tpl-block:not(.bank) .tpl-item').length"));
console.log('倒计时  :', await ev("document.querySelector('#tplCd')?.textContent"));
const shot = await send('Page.captureScreenshot',{format:'png'});
if (shot.result?.data) writeFileSync('.shot/live-now.png', Buffer.from(shot.result.data,'base64'));
console.log('shot saved');
proc.kill(); process.exit(0);
