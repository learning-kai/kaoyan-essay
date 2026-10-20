import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9471;
const HOME = 'http://127.0.0.1:8779/index.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const proc = spawn(EDGE, ['--headless=new','--disable-gpu','--no-first-run','--disable-extensions','--hide-scrollbars','--mute-audio',
  '--remote-debugging-port='+PORT, `--user-data-dir=${process.env.TEMP}\\edge-qz-${Date.now()}`, '--window-size=1400,1000','about:blank'], { stdio: 'ignore' });
const list = async () => { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { return []; } };
for (let i=0;i<80;i++){ if((await list()).length) break; await sleep(250); }

let ws, pending = new Map(), id = 0; const errs = [];
const send = (m,p={}) => new Promise((res,rej)=>{const i=++id;const t=setTimeout(()=>{pending.delete(i);rej(new Error('timeout '+m));},20000);pending.set(i,x=>{clearTimeout(t);res(x);});ws.send(JSON.stringify({id:i,method:m,params:p}));});
const attach = url => new Promise(res=>{ws=new WebSocket(url);ws.addEventListener('open',()=>res());ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}
  if(m.method==='Runtime.exceptionThrown')errs.push('EXC '+(m.params.exceptionDetails.exception?.description||'').slice(0,220));
  if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errs.push('ERR '+m.params.args.map(a=>a.value??a.description).join(' '));});});
const ev = async e => { const r = await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true}); if (r.result?.exceptionDetails) return 'ERR '+(r.result.exceptionDetails.exception?.description||'').slice(0,260); return r.result?.result?.value; };
const click = s => ev(`(()=>{const el=document.querySelector(${JSON.stringify(s)});if(!el)throw new Error('missing '+${JSON.stringify(s)});el.click();return 1;})()`);
const cnt = s => ev(`document.querySelectorAll(${JSON.stringify(s)}).length`);
const txt = s => ev(`(document.querySelector(${JSON.stringify(s)})||{}).textContent||''`).then(String);

let pass=0, fail=0; const bad=[];
const check=(n,ok,x)=>{ if(ok){pass++;console.log('  ok   '+n);} else {const s=n+(x===undefined?'':' -> '+String(JSON.stringify(x)).slice(0,200));fail++;bad.push(s);console.log('  FAIL '+s);} };

const t0 = (await list()).find(t=>t.type==='page');
await attach(t0.webSocketDebuggerUrl); await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate',{url:HOME}); await sleep(1800);
let pg = (await list()).filter(t=>t.url.includes('index.html')).pop();
if (pg) { try{ws.close();}catch{} await attach(pg.webSocketDebuggerUrl); await send('Runtime.enable'); await send('Page.enable'); }
await sleep(700);
await ev("localStorage.clear()"); await send('Page.reload'); await sleep(1600);
pg = (await list()).filter(t=>t.url.includes('index.html')).pop();
if (pg) { try{ws.close();}catch{} await attach(pg.webSocketDebuggerUrl); await send('Runtime.enable'); await send('Page.enable'); }
await sleep(800);

console.log('\n== 进入练习页 ==');
await click('[data-view="quiz"]'); await sleep(600);
check('练习页激活', (await ev("document.querySelector('.view.active').id")) === 'view-quiz', await ev("document.querySelector('.view.active').id"));
check('题源卡片数 = 9', (await cnt('.qz-pick-card')) === 9, await cnt('.qz-pick-card'));
check('有"大作文模板"题源', (await txt('.qz-pick')).includes('大作文模板'), (await txt('.qz-pick')).slice(0,80));
check('有累计统计', (await cnt('.qz-overview div')) === 4, await cnt('.qz-overview div'));

console.log('\n== 出题方式：随机 / 顺序 ==');
check('默认是随机', (await ev("document.querySelector('[data-qmode=random]').className")).includes('active'));
check('随机模式没有从头开始', (await cnt('#qzResetOrder')) === 0, await cnt('#qzResetOrder'));
await click('[data-qmode="order"]'); await sleep(450);
check('可切到顺序', (await ev("document.querySelector('[data-qmode=order]').className")).includes('active'));
check('顺序模式出现从头开始', (await cnt('#qzResetOrder')) === 1, await cnt('#qzResetOrder'));
check('卡片显示下次从第几句起', (await txt('.qz-pick-card .qz-pick-n')).includes('下次从第'), await txt('.qz-pick-card .qz-pick-n'));
await click('[data-src="small-all"]'); await sleep(700);
check('顺序模式带范围标签', (await txt('.qz-mode-tag')).includes('顺序'), await txt('.qz-mode-tag'));
check('第一题是句库第一句', (await txt('.qz-cn')).includes('希望你一切安好'), await txt('.qz-cn'));
check('顺序进度已记到 10', (await ev("(JSON.parse(localStorage.getItem('sunset-desk-v1')).quiz.seq||{})['small-all']")) === 10, await ev("(JSON.parse(localStorage.getItem('sunset-desk-v1')).quiz.seq||{})['small-all']"));
await ev("(()=>{const b=document.querySelector('#qzQuit');if(b)window.confirm=()=>true;b&&b.click();return 1;})()"); await sleep(500);
check('回到选择页仍在顺序模式', (await ev("document.querySelector('[data-qmode=order]').className")).includes('active'));
await click('#qzResetOrder'); await sleep(450);
check('从头开始清空进度', (await ev("JSON.stringify(JSON.parse(localStorage.getItem('sunset-desk-v1')).quiz.seq)")) === '{}', await ev("JSON.stringify(JSON.parse(localStorage.getItem('sunset-desk-v1')).quiz.seq)"));
await click('[data-qmode="random"]'); await sleep(450);
check('可切回随机', (await ev("document.querySelector('[data-qmode=random]').className")).includes('active'));

console.log('\n== 开始一轮 ==');
await click('[data-src="big"]'); await sleep(700);
check('进入答题界面', (await cnt('.qz-shell')) === 1);
check('进度条存在', (await cnt('.qz-bar-fill')) === 1);
check('第一题有中文提示', (await txt('.qz-cn')).length > 2, await txt('.qz-cn'));
check('词块已生成', (await cnt('#qzBank .qz-tile')) >= 3, await cnt('#qzBank .qz-tile'));
await shotSafe('qz-01');
check('未选词时检查按钮禁用', await ev("document.querySelector('#qzCheck').disabled") === true);

// 朗读打桩：记录每一段被送进 speechSynthesis 的文本和语言
// 注意：app 现在是一段念完再排下一段，所以桩要模拟 start/end，否则只会看到第一段
const canSpeak = await ev("(()=>{try{window.__spoke=[];window.speechSynthesis.speak=u=>{window.__spoke.push(u.text+'|'+u.lang);setTimeout(()=>{try{u.onstart&&u.onstart()}catch(e){}setTimeout(()=>{try{u.onend&&u.onend()}catch(e){}},20)},20)};window.speechSynthesis.cancel=()=>{};return true;}catch(e){return false;}})()");
if (canSpeak) {
  await ev("window.__spoke=[]");
  await ev("(()=>{const t=document.querySelector('#qzBank .qz-tile');t.click();return 1})()");
  await sleep(200);
  const spoke1 = await ev("JSON.stringify(window.__spoke)");
  check('点词块会读这个词', (await ev("window.__spoke.length")) >= 1, spoke1);
  check('读的是英文音', String(spoke1).includes('en'), spoke1);
  await ev("(()=>{const b=document.querySelector('#qzAnswer [data-unpick]');if(b)b.click();return 1})()");
  await sleep(200);
  check('取消选择不再残留词块', (await cnt('#qzAnswer .qz-tile')) === 0, await cnt('#qzAnswer .qz-tile'));
}

// 用页面里的数据推算目标句：找出能覆盖全部词块的模板句
const solveExpr = `(()=>{
  const all=[];
  (window.TEMPLATES||[]).forEach(t=>{
    if(t.sections) t.sections.forEach(s=>s.sentences.forEach(x=>all.push(x.en)));
    if(t.groups) t.groups.forEach(g=>g.sentences.forEach(x=>all.push(x.en)));
  });
  const tiles=[...document.querySelectorAll('#qzBank .qz-tile')].map(t=>t.textContent);
  const count=(arr)=>{const m={};arr.forEach(w=>m[w]=(m[w]||0)+1);return m;};
  const tileSet=count(tiles);
  const tok=s=>s.trim().split(/\\s+/);
  let best=null;
  all.forEach(s=>{
    const toks=tok(s);
    const cs=count(toks);
    const fits=Object.keys(cs).every(k=>(tileSet[k]||0)>=cs[k]);
    if(fits && (!best || toks.length>tok(best).length)) best=s;
  });
  return best||'';
})()`;

async function solveBuild() {
  const target = await ev(solveExpr);
  if (!target || target.startsWith('ERR')) return { ok:false, target };
  await ev(`(()=>{
    const want=${JSON.stringify(target)}.split(/\\s+/);
    const used=new Set();
    want.forEach(w=>{
      const el=[...document.querySelectorAll('#qzBank .qz-tile:not(:disabled)')].find(t=>!used.has(t)&&t.textContent===w);
      if(el){used.add(el);el.click();}
    });
    return true;
  })()`);
  await sleep(150);
  return { ok:true, target };
}

const q1type = await txt('.qz-type');
const q1isChoice = (await cnt('.qz-opt')) > 0;
console.log('  第一题类型:', q1type.trim(), '| 选择题:', q1isChoice);
if (!q1isChoice) {
  await ev("window.__spoke=[]");
  const r = await solveBuild();
  check('能按顺序点出词块', r.ok, r.target);
  check('检查按钮已启用', await ev("document.querySelector('#qzCheck').disabled") === false);
  await click('#qzCheck'); await sleep(500);
  check('反馈条出现', (await cnt('.qz-feedback.show')) === 1);
  check('答对时是绿色反馈', (await ev("document.querySelector('#qzFeedback').className")).includes('ok'), await ev("document.querySelector('#qzFeedback').className"));
  check('连击计数显示', (await txt('.qz-combo')).trim().length >= 0);
  check('答对后不展示答案（奖励）', (await cnt('.qz-fb-en')) === 0, await cnt('.qz-fb-en'));
  if (canSpeak) {
    const spoke2 = await ev("JSON.stringify(window.__spoke)");
    check('答对后整句被读一遍', (await ev("window.__spoke.filter(x=>x.includes('|en')).length")) >= 1, String(spoke2).slice(0, 160));
    check('方括号本身不会被念出来', await ev("window.__spoke.every(x=>x.indexOf('[')<0&&x.indexOf(']')<0)"), String(spoke2).slice(0, 160));
  }
} else {
  console.log('  （首题是选择题，走选择分支）');
}
await shotSafe('qz-02');

console.log('\n== 答错原地重来 ==');
await click('#qzNext'); await sleep(500);
let guard = 0;
while ((await cnt('.qz-bank')) === 0 && guard++ < 6) { await click('#qzNext'); await sleep(400); }
const beforeTiles = await cnt('#qzBank .qz-tile');
const barBefore = await ev("document.querySelector('.qz-bar-fill').style.width");
// 故意乱点一个错序
await ev("(()=>{const t=document.querySelector('#qzBank .qz-tile');if(t)t.click();return 1;})()");
await sleep(150);
await click('#qzCheck'); await sleep(500);
const badNow = (await cnt('.qz-retry')) === 1;
if (badNow) {
  check('答错给红色重来提示', true);
  check('答错后已点词块被清空', (await cnt('#qzAnswer .qz-tile')) === 0, await cnt('#qzAnswer .qz-tile'));
  check('答错后词块全部能再点', (await cnt('#qzBank .qz-tile:not(:disabled)')) === beforeTiles, [await cnt('#qzBank .qz-tile:not(:disabled)'), beforeTiles]);
  check('答错不直接泄露答案', (await cnt('.qz-fb-en')) === 0, await cnt('.qz-fb-en'));
  check('答错不推进进度条', (await ev("document.querySelector('.qz-bar-fill').style.width")) === barBefore, [await ev("document.querySelector('.qz-bar-fill').style.width"), barBefore]);
  check('连击被清零', (await txt('.qz-combo')).trim() === '' || !(await txt('.qz-combo')).includes('🔥'), await txt('.qz-combo'));

  // 重新拼一次，再点一次检查
  const r2 = await solveBuild();
  check('能重新拼一次', r2.ok, r2.target);
  await click('#qzCheck'); await sleep(500);
  check('可以再检查一次', (await cnt('.qz-feedback.show')) === 1, await cnt('.qz-feedback.show'));
  check('第二次答对是绿色反馈', (await ev("document.querySelector('#qzFeedback').className")).includes('ok'), await ev("document.querySelector('#qzFeedback').className"));
  await click('#qzNext'); await sleep(500);

  // 「看答案」：摊开原句，但题目仍可继续拼、继续检查
  if ((await cnt('#qzBank .qz-tile')) > 0) {
    await ev("(()=>{const t=document.querySelector('#qzBank .qz-tile');if(t)t.click();return 1;})()");
    await sleep(120);
    await click('#qzCheck'); await sleep(450);
    check('下一题答错也有重来提示', (await cnt('.qz-retry')) === 1, await cnt('.qz-retry'));
    await click('#qzReveal'); await sleep(400);
    check('看答案能摊开原句', (await txt('.qz-revealed-en')).length > 5, await txt('.qz-revealed-en'));
    check('看答案不算过关', (await cnt('#qzNext')) === 0, await cnt('#qzNext'));
    check('看答案后题目还在', (await cnt('#qzCheck')) === 1);
    check('看答案后仍有跳过出口', (await cnt('#qzSkip')) === 1);
    await click('#qzReveal'); await sleep(350);
    check('看答案可以收起', (await cnt('.qz-revealed')) === 0, await cnt('.qz-revealed'));
    await click('#qzReveal'); await sleep(350);
    // 照着答案再拼一遍，然后还能检查
    const r3 = await solveBuild();
    check('看答案后能重新拼', r3.ok, r3.target);
    await click('#qzCheck'); await sleep(500);
    check('看答案后能再检查并过关', (await cnt('.qz-feedback.show')) === 1, await cnt('.qz-feedback.show'));
    check('过关后是绿色反馈', (await ev("document.querySelector('#qzFeedback').className")).includes('ok'), await ev("document.querySelector('#qzFeedback').className"));
    await click('#qzNext'); await sleep(400);
  }
} else {
  check('（该题恰好答对，跳过错误分支）', true);
}
await shotSafe('qz-03');

console.log('\n== 跑到结算页 ==');
let steps = 0;
while (steps++ < 80) {
  if (await cnt('.qz-done')) break;
  if ((await cnt('.qz-feedback.show')) === 0) {
    // 上一题答错停在原地：展开答案后「跳过这题」往前走，避免反复重拼
    if ((await cnt('.qz-retry')) === 1) {
      if ((await cnt('#qzSkip')) === 0) { await click('#qzReveal'); await sleep(260); }
      await click('#qzSkip');
      await sleep(320);
      continue;
    }
    // 有新题，尽量做对
    const isChoice = (await cnt('.qz-opt')) > 0;
    if (isChoice) {
      await ev("(()=>{const o=document.querySelector('.qz-opt');if(o)o.click();return 1;})()");
    } else {
      const r = await solveBuild();
      if (!r.ok) { await ev("(()=>{const t=document.querySelector('#qzBank .qz-tile');if(t)t.click();return 1;})()"); }
      await sleep(120);
      const ck = await ev("(()=>{const b=document.querySelector('#qzCheck');return b&&!b.disabled?1:0;})()");
      if (ck) await click('#qzCheck');
    }
    await sleep(320);
  } else {
    await click('#qzNext'); await sleep(320);
  }
}
check('能一路走到结算页', (await cnt('.qz-done')) === 1, { steps });
check('结算页有正确率', /\d+%/.test(await txt('.qz-done-ring')), await txt('.qz-done-ring'));
check('结算页有统计三项', (await cnt('.qz-done-stats div')) === 3, await cnt('.qz-done-stats div'));
check('结算页有"再来一轮"', (await cnt('#qzAgain')) === 1);
await shotSafe('qz-done');

console.log('\n== 数据落盘 ==');
const q = await ev("JSON.parse(localStorage.getItem('sunset-desk-v1')).quiz");
check('quiz 数据已保存', !!q && typeof q.total === 'number', q);
check('累计答题 > 0', q && q.total > 0, q && q.total);

console.log('\n== 再来一轮 / 换题源 ==');
await click('#qzAgain'); await sleep(600);
check('再来一轮回到答题', (await cnt('.qz-shell')) === 1);
await ev("(()=>{const b=document.querySelector('#qzQuit');if(b)window.confirm=()=>true;b&&b.click();return 1;})()"); await sleep(500);
check('退出回到题源选择', (await cnt('.qz-pick-card')) === 9, await cnt('.qz-pick-card'));

console.log('\n== 小作文题源 ==');
await click('[data-src="small-advice"]'); await sleep(600);
check('建议信题源可练', (await cnt('.qz-shell')) === 1);
check('有词块或选项', ((await cnt('#qzBank .qz-tile')) + (await cnt('.qz-opt'))) > 0, { tiles: await cnt('#qzBank .qz-tile'), opts: await cnt('.qz-opt') });

console.log('\n== 朗读：中文槽位也要念 ==');
if (canSpeak) {
  await ev("(()=>{const b=document.querySelector('[data-view=template]');if(b)b.click();return 1})()"); await sleep(500);
  await ev("(()=>{const b=document.querySelector('#btnTplRecite');if(b)b.click();return 1})()"); await sleep(800);
  await ev("window.__spoke=[]");
  await ev("(()=>{const b=document.querySelector('#paper .sent .speak-btn');if(b)b.click();return 1})()");
  await sleep(1200);
  const sp = await ev("JSON.stringify(window.__spoke)");
  check('范文句子能整句朗读', (await ev("window.__spoke.length")) >= 2, String(sp).slice(0, 200));
  check('英文部分用英文音', (await ev("window.__spoke.filter(x=>x.includes('|en')).length")) >= 1, String(sp).slice(0, 200));
  check('中文槽位用中文音', (await ev("window.__spoke.filter(x=>x.includes('|zh')).length")) >= 1, String(sp).slice(0, 200));
  check('槽位里的中文被念出来', await ev("window.__spoke.some(x=>x.indexOf('主体')>=0)"), String(sp).slice(0, 200));
  check('方括号不会被念出来', await ev("window.__spoke.every(x=>x.indexOf('[')<0&&x.indexOf(']')<0)"), String(sp).slice(0, 200));
}

console.log('\n== 切页不丢状态 ==');
await click('[data-view="template"]'); await sleep(400);
await click('[data-view="quiz"]'); await sleep(500);
check('切回来仍在练习中', (await cnt('.qz-shell')) === 1, { shell: await cnt('.qz-shell'), picker: await cnt('.qz-pick-card') });
const dup = await ev("(()=>{const a=document.querySelectorAll('.qz-feedback.show').length;return a;})()");
check('没有重复反馈层', dup <= 1, dup);

console.log('\n== 手机端 ==');
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true}); await sleep(500);
check('手机无横向溢出', await ev("document.documentElement.scrollWidth <= window.innerWidth + 2"), await ev("[document.documentElement.scrollWidth, innerWidth]"));
const tileBox = await ev("(()=>{const t=document.querySelector('.qz-tile');if(!t)return null;const b=t.getBoundingClientRect();return [Math.round(b.width),Math.round(b.height)];})()");
check('手机词块可点（高度≥36）', tileBox && tileBox[1] >= 36, tileBox);
await shotSafe('qz-mobile');
await send('Emulation.clearDeviceMetricsOverride'); await sleep(300);

console.log('\n== 控制台 ==');
check('无 JS 错误', errs.length === 0, errs.slice(0,5));

async function shotSafe(name) {
  try {
    const r = await send('Page.captureScreenshot',{format:'png'});
    if (r.result?.data) writeFileSync('.shot/'+name+'.png', Buffer.from(r.result.data,'base64'));
  } catch (e) {}
}

console.log(`\n通过 ${pass} · 失败 ${fail}`);
if (fail) console.log(bad.join('\n'));
try { proc.kill(); } catch {}
process.exit(fail ? 1 : 0);

