import { spawn } from 'node:child_process';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9451;
const LIVE = 'https://learning-kai.github.io/kaoyan-essay/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const proc = spawn(EDGE, ['--headless=new','--disable-gpu','--no-first-run','--disable-extensions','--hide-scrollbars','--mute-audio',
  '--remote-debugging-port='+PORT, `--user-data-dir=${process.env.TEMP}\\edge-live-${Date.now()}`, '--window-size=1400,1000','about:blank'], { stdio: 'ignore' });
const list = async () => { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { return []; } };
for (let i=0;i<80;i++){ if((await list()).length) break; await sleep(250); }

let ws, pending = new Map(), id = 0; const errs = [];
const send = (m,p={}) => new Promise((res,rej)=>{const i=++id;const t=setTimeout(()=>{pending.delete(i);rej(new Error('timeout '+m));},20000);pending.set(i,x=>{clearTimeout(t);res(x);});ws.send(JSON.stringify({id:i,method:m,params:p}));});
const attach = url => new Promise(res=>{ws=new WebSocket(url);ws.addEventListener('open',()=>res());ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}
  if(m.method==='Runtime.exceptionThrown')errs.push('EXC '+(m.params.exceptionDetails.exception?.description||'').slice(0,200));
  if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errs.push('ERR '+m.params.args.map(a=>a.value??a.description).join(' '));});});
const ev = async e => { const r = await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true}); if (r.result?.exceptionDetails) return 'ERR '+(r.result.exceptionDetails.exception?.description||'').slice(0,220); return r.result?.result?.value; };
const click = s => ev(`(()=>{const el=document.querySelector(${JSON.stringify(s)});if(!el)throw new Error('missing '+${JSON.stringify(s)});el.click();return 1;})()`);
const cnt = s => ev(`document.querySelectorAll(${JSON.stringify(s)}).length`);
const txt = s => ev(`(document.querySelector(${JSON.stringify(s)})||{}).textContent||''`).then(String);

let pass=0, fail=0;
const bad=[];
const check=(n,ok,extra)=>{ if(ok){pass++;console.log('  ok   '+n);} else {fail++;bad.push(n+' -> '+JSON.stringify(extra).slice(0,180));console.log('  FAIL '+bad[bad.length-1]);} };

const t0 = (await list()).find(t=>t.type==='page');
await attach(t0.webSocketDebuggerUrl); await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate',{url:LIVE});
await sleep(2500);
const pg = (await list()).filter(t=>t.type==='page' && t.url.includes('kaoyan-essay')).pop();
if (pg) { try{ws.close();}catch{} await attach(pg.webSocketDebuggerUrl); await send('Runtime.enable'); await send('Page.enable'); }
await sleep(1200);
await ev("localStorage.clear()"); await send('Page.reload'); await sleep(2200);

console.log('\n== 线上站点 ==');
check('URL 是 live', String(await ev('location.href')).includes('learning-kai.github.io/kaoyan-essay'), await ev('location.href'));
check('title', (await ev('document.title')).includes('落日书桌'), await ev('document.title'));
check('css 生效（有背景色变量）', (await ev("getComputedStyle(document.body).fontFamily")).includes('Songti'), await ev("getComputedStyle(document.body).fontFamily"));
check('默认落在模板页', (await ev("document.querySelector('#view-template').className")).includes('active'));
check('模板两块', (await cnt('.tpl-block')) === 2, await cnt('.tpl-block'));
check('大作文 10 句', (await cnt('.tpl-block:not(.bank) .tpl-item')) === 10, await cnt('.tpl-block:not(.bank) .tpl-item'));
check('大作文 33 槽位', (await cnt('.tpl-block:not(.bank) .tpl-en .slot')) === 33, await cnt('.tpl-block:not(.bank) .tpl-en .slot'));
check('句库 6 类型', (await cnt('.tpl-types .chip')) === 6, await cnt('.tpl-types .chip'));
check('句库 35 句', (await cnt('.tpl-all .tpl-item')) === 35, await cnt('.tpl-all .tpl-item'));
check('建议信默认 7 句', (await cnt('.tpl-picked .tpl-item')) === 7, await cnt('.tpl-picked .tpl-item'));
await click('[data-type="invitation"]'); await sleep(400);
check('切邀请信 8 句', (await cnt('.tpl-picked .tpl-item')) === 8, await cnt('.tpl-picked .tpl-item'));
await click('#btnBankRecite'); await sleep(900);
check('可以进背诵页', (await ev("document.querySelector('.view.active').id")) === 'view-recite', await ev("document.querySelector('.view.active').id"));
check('邀请信模板 10 句', (await cnt('#paper .sent')) === 10, await cnt('#paper .sent'));
for (const m of ['hide','first','blur','block','blank','double']) {
  await click(`[data-mode="${m}"]`); await sleep(250);
  check('模式 '+m, (await ev("document.querySelector('#paper').className")).includes('mode-'+m), await ev("document.querySelector('#paper').className"));
}
await click('[data-view="review"]'); await sleep(400);
check('复习页有统计', (await txt('#reviewStats')).includes('今日待复习'), await txt('#reviewStats'));
await click('[data-view="dict"]'); await sleep(400);
check('听写可选 10 项', (await cnt('#dictChoose [data-id]')) === 10, await cnt('#dictChoose [data-id]'));
await click('[data-view="library"]'); await sleep(400);
check('选文 3 张卡', (await cnt('#essayGrid .card')) === 3, await cnt('#essayGrid .card'));
check('localStorage 可写', (await ev("(()=>{try{localStorage.setItem('t','1');return localStorage.getItem('t')}catch(e){return 'ERR'}})()")) === '1');
check('无 JS 错误', errs.length === 0, errs.slice(0,4));

await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true}); await sleep(500);
await click('[data-view="template"]'); await sleep(500);
check('手机端无横向溢出', await ev("document.documentElement.scrollWidth <= window.innerWidth + 2"), await ev("[document.documentElement.scrollWidth, innerWidth]"));

console.log(`\n线上通过 ${pass} · 失败 ${fail}`);
if (fail) console.log(bad.join('\n'));
try { proc.kill(); } catch {}
process.exit(fail ? 1 : 0);
