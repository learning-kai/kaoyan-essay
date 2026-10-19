import { spawn } from 'node:child_process';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9441;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const proc = spawn(EDGE, ['--headless=new','--disable-gpu','--no-first-run','--disable-extensions','--hide-scrollbars','--mute-audio',
  '--remote-debugging-port='+PORT, `--user-data-dir=${process.env.TEMP}\\edge-font-${Date.now()}`, '--window-size=1400,1000','about:blank'], { stdio: 'ignore' });
const list = async () => { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { return []; } };
for (let i=0;i<80;i++){ if((await list()).length) break; await sleep(250); }
let ws, pending = new Map(), id = 0;
const send = (m,p={}) => new Promise((res,rej)=>{const i=++id;const t=setTimeout(()=>{pending.delete(i);rej(new Error('timeout '+m));},15000);pending.set(i,x=>{clearTimeout(t);res(x);});ws.send(JSON.stringify({id:i,method:m,params:p}));});
const attach = url => new Promise(res=>{ws=new WebSocket(url);ws.addEventListener('open',()=>res());ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}});});
const ev = async e => { const r = await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true}); if (r.result?.exceptionDetails) return 'ERR '+(r.result.exceptionDetails.exception?.description||'').slice(0,200); return r.result?.result?.value; };

const t0 = (await list()).find(t=>t.type==='page');
await attach(t0.webSocketDebuggerUrl); await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate',{url:'http://127.0.0.1:8779/index.html'}); await sleep(2500);
const pg = (await list()).filter(t=>t.url.includes('index.html')).pop();
try{ws.close();}catch{} await attach(pg.webSocketDebuggerUrl); await send('Runtime.enable'); await send('Page.enable');
await sleep(1200);

console.log('font link media:', await ev("(()=>{const l=[...document.querySelectorAll('link[rel=stylesheet]')].find(x=>x.href.includes('fonts.googleapis'));return l? l.media : 'none';})()"));
console.log('Fraunces 可用:', await ev("document.fonts.check('16px Fraunces')"));
console.log('IBM Plex Mono 可用:', await ev("document.fonts.check('16px \"IBM Plex Mono\"')"));
console.log('loaded fonts:', await ev("[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family).slice(0,8).join(', ')"));
console.log('标题实际字体:', await ev("getComputedStyle(document.querySelector('.lib-intro h2, .page-head h2')).fontFamily.slice(0,50)"));
console.log('favicon:', await ev("!!document.querySelector('link[rel=icon]')"));
console.log('title:', await ev("document.title"));
proc.kill(); process.exit(0);
