// 起一个独立的、禁扩展的 headless Edge，跑 QA 再关掉
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9373;
const HOME = 'http://127.0.0.1:8779/index.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--mute-audio', '--disable-extensions',
  '--remote-debugging-port=' + PORT,
  `--user-data-dir=${process.env.TEMP}\\edge-qa-${Date.now()}`,
  '--window-size=1400,1100', 'about:blank'
], { stdio: 'ignore' });

const list = async () => { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { return []; } };
for (let i = 0; i < 80; i++) { if ((await list()).length) break; await sleep(250); }

let ws, pending = new Map(), id = 0;
const RPC = 15000;
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id;
  const timer = setTimeout(() => { pending.delete(i); rej(new Error('RPC timeout: ' + method)); }, RPC);
  pending.set(i, m => { clearTimeout(timer); res(m); });
  ws.send(JSON.stringify({ id: i, method, params }));
});
const errors = [];
function attachWS(url) {
  return new Promise((res, rej) => {
    ws = new WebSocket(url);
    ws.addEventListener('open', () => res());
    ws.addEventListener('error', e => rej(new Error('ws error')));
    ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
      if (m.method === 'Runtime.exceptionThrown') errors.push('EXC: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    });
  });
}
async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error('EVAL ' + expr.slice(0, 70) + ' :: ' + (r.result.exceptionDetails.exception?.description || '').slice(0, 160));
  return r.result?.result?.value;
}
const shot = async name => {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(`.shot/${name}.png`, Buffer.from(r.result.data, 'base64'));
};
const txt = sel => evaluate(`(document.querySelector(${JSON.stringify(sel)})||{}).textContent||''`).then(String);
const cls = sel => evaluate(`(document.querySelector(${JSON.stringify(sel)})||{}).className||''`).then(String);
const count = sel => evaluate(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
const click = sel => evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(sel)});if(!el)throw new Error('missing '+${JSON.stringify(sel)});el.click();return true;})()`);

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; failures.push(name + (extra !== undefined ? ' -> ' + JSON.stringify(extra).slice(0, 220) : '')); console.log('  FAIL ' + failures[failures.length - 1]); }
}

async function attachSite() {
  for (let a = 0; a < 10; a++) {
    const pages = (await list()).filter(t => t.type === 'page' && t.url.includes('index.html'));
    if (pages.length) {
      try { ws.close(); } catch {}
      await attachWS(pages[pages.length - 1].webSocketDebuggerUrl);
      await send('Runtime.enable'); await send('Page.enable');
      try {
        if (await evaluate("document.readyState !== 'loading' && !!document.querySelector('#essayGrid')")) return;
      } catch {}
    }
    await sleep(600);
  }
  throw new Error('无法附着到页面');
}

try {
  const t0 = (await list()).find(t => t.type === 'page');
  await attachWS(t0.webSocketDebuggerUrl);
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: HOME });
  await sleep(1200);
  await attachSite();
  await evaluate("localStorage.clear()");
  await send('Page.reload');
  await sleep(1000);
  await attachSite();

  console.log('\n== 首页默认落在模板页 ==');
  check('默认视图是模板', (await cls('#view-template')).includes('active'), await cls('#view-template'));
  check('顶部有倒计时', /距考试\s*\d+\s*天|考试已过/.test(await txt('#tplCd')), await txt('#tplCd'));
  check('标签顺序：模板在前', (await txt('.tab')).trim().endsWith('模板'), await txt('.tab'));

  console.log('\n== 选文页 ==');
  await click('[data-view=library]'); await sleep(400);
  check('卡片 3 张（只剩句型素材）', (await count('#essayGrid .card')) === 3, await count('#essayGrid .card'));
  check('倒计时是数字', /^\d+$/.test(await txt('#cdDays')), await txt('#cdDays'));
  check('文案含 3 组句型', (await txt('#libSummary')).includes('3 组句型素材'), await txt('#libSummary'));
  check('文案提到 2 套模板', (await txt('#libSummary')).includes('2 套自己的模板'), await txt('#libSummary'));
  check('没有英语二残留', !(await txt('#libSummary')).includes('范文'), await txt('#libSummary'));
  check('筛选 2 个（空的分类不显示）', (await count('#filters .chip')) === 2, await count('#filters .chip'));
  await shot('01-library');

  console.log('\n== 筛选 ==');
  await click('[data-filter=sent]'); await sleep(250);
  check('句型 3 篇', (await count('#essayGrid .card')) === 3);
  await click('[data-filter=all]'); await sleep(250);

  console.log('\n== 背诵页 ==');
  await click('.card[data-id=x-2]'); await sleep(600);
  check('切到背诵视图', (await cls('#view-recite')).includes('active'));
  check('5 句', (await count('#paper .sent')) === 5, await count('#paper .sent'));
  check('默认蓝图模式', (await cls('#paper')).includes('mode-double'));
  check('逐句中文在', (await txt('#paper .sent .cn')).length > 4);
  check('5 个朗读按钮', (await count('#paper .speak-btn')) === 5, await count('#paper .speak-btn'));
  check('6 个模式按钮', (await count('#modes .mode')) === 6, await count('#modes .mode'));
  await shot('02-recite-double');

  console.log('\n== 六种进阶模式 ==');
  for (const m of ['hide', 'first', 'blur', 'blank', 'type']) {
    await click(`[data-mode=${m}]`); await sleep(320);
    check('模式 ' + m, (await cls('#paper')).includes('mode-' + m), await cls('#paper'));
    if (m === 'hide') { await click('#paper .sent'); await sleep(220); check('点句显英文', (await cls('#paper .sent')).includes('show-en')); }
    if (m === 'first') { check('首字母标记', (await count('.word[data-head]')) > 20, await count('.word[data-head]')); await shot('03-first'); }
    if (m === 'blur') { await click('#paper .sent .en'); await sleep(260); check('模糊显影', (await cls('#paper .sent')).includes('focus')); }
    if (m === 'block') { await click('#paper .sent .en'); await sleep(260); check('逐块显影', (await cls('#paper .sent')).includes('revealed')); await shot('04-block'); }
    if (m === 'blank') {
      check('填空输入框 > 3', (await count('.blank-input')) > 3, await count('.blank-input'));
      const ans = await evaluate("document.querySelector('.blank-input').dataset.ans");
      await evaluate("(()=>{const i=document.querySelector('.blank-input');i.value=" + JSON.stringify(ans) + ";i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));return 1;})()");
      await sleep(300);
      check('打字答对标绿', (await cls('.blank-input')).includes('ok'), await cls('.blank-input'));
      await shot('05-blank');
    }
    if (m === 'type') {
      check('默写框在', await evaluate("!!document.querySelector('#typeArea')"));
      await evaluate("(()=>{const a=document.querySelector('#typeArea');a.value='To begin with';document.querySelector('#typeCheck').click();})()");
      await sleep(450);
      check('有正确率', /正确率\s*\d+%/.test(await txt('#typeResult')), await txt('#typeResult'));
      await shot('06-type');
    }
  }

  console.log('\n== 工具条 ==');
  await click('[data-mode=double]'); await sleep(250);
  await click('#btnCn'); await sleep(220);
  check('中文可隐藏', (await count('#paper .sent .cn')) === 0);
  await click('#btnCn'); await sleep(200);
  check('中文可恢复', (await count('#paper .sent .cn')) > 0);
  await click('#btnFont'); await sleep(200);
  check('字号切换', (await evaluate("document.querySelector('#paper').style.getPropertyValue('--paper-fs')")).length > 0);
  await click('#btnHint'); await sleep(220);
  check('toast 出现', (await cls('#toast')).includes('show'));

  console.log('\n== 计入复习 ==');
  const before = await txt('#rTitle');
  await click('#btnNext'); await sleep(900);
  let p = null;
  for (let i = 0; i < 8 && !(p && p.stage > 0); i++) {
    p = await evaluate("(JSON.parse(localStorage.getItem('sunset-desk-v1')||'{}').progress||{})['x-2']");
    if (!(p && p.stage > 0)) await sleep(350);
  }
  check('stage = 1', p && p.stage === 1, p);
  const tomorrow = await evaluate("(()=>{const d=new Date();d.setDate(d.getDate()+1);const q=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+q(d.getMonth()+1)+'-'+q(d.getDate());})()");
  check('due = 明天', p && p.due === tomorrow, [p && p.due, tomorrow]);
  check('自动下一篇', (await txt('#rTitle')) !== before, [before, await txt('#rTitle')]);

  console.log('\n== 模板页 · 大作文 ==');
  await click('[data-view=template]'); await sleep(500);
  check('两块模板', (await count('.tpl-block')) === 2, await count('.tpl-block'));
  check('大作文 3 段', (await count('.tpl-block:not(.bank) .tpl-section')) === 3, await count('.tpl-block:not(.bank) .tpl-section'));
  check('大作文 10 句', (await count('.tpl-block:not(.bank) .tpl-item')) === 10, await count('.tpl-block:not(.bank) .tpl-item'));
  check('大作文槽位 33 个', (await count('.tpl-block:not(.bank) .tpl-en .slot')) === 33, await count('.tpl-block:not(.bank) .tpl-en .slot'));
  check('第一段是图片描述句', (await txt('.tpl-block:not(.bank) .tpl-item .tpl-en')).startsWith('The picture presents'), await txt('.tpl-block:not(.bank) .tpl-item .tpl-en'));
  await shot('06-template');

  console.log('\n== 模板页 · 小作文句库 ==');
  check('6 种信件类型', (await count('.tpl-types .chip')) === 6, await count('.tpl-types .chip'));
  check('默认选中建议信', (await txt('.tpl-types .chip.active')) === '建议信', await txt('.tpl-types .chip.active'));
  check('建议信拼出 7 句', (await count('.tpl-picked .tpl-item')) === 7, await count('.tpl-picked .tpl-item'));
  check('句库共 35 句', (await count('.tpl-all .tpl-item')) === 35, await count('.tpl-all .tpl-item'));
  await click('[data-type=invitation]'); await sleep(400);
  check('切到邀请信 8 句', (await count('.tpl-picked .tpl-item')) === 8, await count('.tpl-picked .tpl-item'));
  check('邀请信开头是正式书信句', (await txt('.tpl-picked .tpl-en')).includes('great pleasure'), await txt('.tpl-picked .tpl-en'));
  await click('[data-type=notice]'); await sleep(400);
  check('通知固定格式是 NOTICE', (await txt('.tpl-format')).includes('NOTICE'), await txt('.tpl-format'));
  check('通知 7 句', (await count('.tpl-picked .tpl-item')) === 7, await count('.tpl-picked .tpl-item'));
  await click('[data-type=thanks]'); await sleep(400);
  check('感谢信 6 句（少一句总起）', (await count('.tpl-picked .tpl-item')) === 6, await count('.tpl-picked .tpl-item'));

  console.log('\n== 模板开关 / 朗读 / 槽位 ==');
  await click('#btnTplCn'); await sleep(250);
  check('模板可关中文', (await count('.tpl-cn')) === 0);
  await click('#btnTplCn'); await sleep(200);
  check('中文恢复', (await count('.tpl-cn')) > 0);
  await click('#btnTplHint'); await sleep(250);
  check('模板可关槽位提示', (await count('.hint-chip')) === 0);
  await click('#btnTplHint'); await sleep(200);
  await click('.tpl-en .slot'); await sleep(300);
  check('点槽位给提示', (await txt('#toast')).includes('填：'), await txt('#toast'));

  console.log('\n== 背模板 ==');
  await click('#btnBankRecite'); await sleep(750);
  check('小作文模板可背（感谢信 6 句 + 称呼 + 落款）', (await count('#paper .sent')) === 8, await count('#paper .sent'));
  check('标题是感谢信模板', (await txt('#rTitle')) === '小作文模板 · 感谢信', await txt('#rTitle'));
  check('带称呼行', (await txt('#paper .sent .en')).includes('Dear'), await txt('#paper .sent .en'));
  await click('[data-view=template]'); await sleep(400);
  await click('#btnTplRecite'); await sleep(700);
  check('大作文模板可背', (await count('#paper .sent')) === 10, await count('#paper .sent'));
  check('大作文标题', (await txt('#rTitle')) === 'My Big-Essay Template', await txt('#rTitle'));

  console.log('\n== 复习页 ==');
  await click('[data-view=review]'); await sleep(400);
  check('有统计条', (await txt('#reviewStats')).includes('今日待复习'));
  check('未到期有内容', (await count('#reviewUpcoming .u-chip')) >= 1);
  await shot('07-review');
  await evaluate("(()=>{const s=JSON.parse(localStorage.getItem('sunset-desk-v1'));s.progress['x-3']={stage:1,due:'2020-01-01',reps:1,last:'2019-12-31',sentences:[],essayBest:0};localStorage.setItem('sunset-desk-v1',JSON.stringify(s));})()");
  await send('Page.reload'); await sleep(1000); await attachSite();
  await click('[data-view=review]'); await sleep(320);
  check('到期项进列表', (await count('#reviewList .rv-row')) >= 1, await count('#reviewList .rv-row'));
  await click('#reviewList .rv-row'); await sleep(550);
  check('复习态按钮', (await txt('#btnNext')).includes('完成复习'), await txt('#btnNext'));

  console.log('\n== 听写 ==');
  await click('[data-view=dict]'); await sleep(350);
  check('可听写 = 10（3 句型 + 1 大作文模板 + 6 小作文）', (await count('#dictChoose [data-id]')) === 10, await count('#dictChoose [data-id]'));
  await click('#dictChoose [data-id=x-1]'); await sleep(650);
  check('听写面板', await evaluate("!!document.querySelector('.dict-input')"));
  check('中文提示', (await txt('.dict-cn')).length > 3);
  check('进度 1 / 5', (await txt('.dict-score')).includes('1 / 5'), await txt('.dict-score'));
  await evaluate("(()=>{const i=document.querySelector('#dictInput');i.value='Dear Lily:';i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));})()");
  await sleep(500);
  check('有反馈', (await txt('#dictFeedback')).length > 0, await txt('#dictFeedback'));
  await shot('08-dict');

  console.log('\n== 统计 / 设置 ==');
  await click('#btnStats'); await sleep(400);
  check('统计弹窗', await evaluate("!document.querySelector('#modalStats').hidden"));
  check('热力图 28 格', (await count('#statsBody .heat span')) === 28, await count('#statsBody .heat span'));
  check('分类条按实际分类显示', (await count('#statsBody .bar-row')) >= 1, await count('#statsBody .bar-row'));
  check('统计里有模板进度', (await txt('#statsBody')).includes('我的模板'), await txt('#statsBody').then(t => t.replace(/\s+/g, ' ').slice(0, 90)));
  await shot('09-stats');
  await click('[data-close=modalStats]'); await sleep(200);
  await click('#btnSettings'); await sleep(320);
  check('设置弹窗', await evaluate("!document.querySelector('#modalSettings').hidden"));
  check('默认模式 6 项', (await count('#setMode option')) === 6, await count('#setMode option'));
  await click('#setSize [data-size=l]'); await sleep(220);
  check('字号写入', (await evaluate("JSON.parse(localStorage.getItem('sunset-desk-v1')).settings.size")) === 'l');
  await shot('10-settings');
  await click('[data-close=modalSettings]'); await sleep(200);

  console.log('\n== 自定义范文 ==');
  await click('[data-view=library]'); await sleep(320);
  await evaluate("(()=>{const t=document.querySelector('#customInput');t.value='The Value of Reading\\n\\nReading is to the mind what exercise is to the body. It enriches our knowledge and broadens our horizons. Therefore, we should form the habit of reading every day.';document.querySelector('#btnAddCustom').click();})()");
  await sleep(450);
  check('自定义入列表', (await count('.card[data-id^=c-]')) === 1, await count('.card[data-id^=c-]'));
  await click('.card[data-id^=c-]'); await sleep(550);
  check('自定义 3 句', (await count('#paper .sent')) === 3, await count('#paper .sent'));
  check('标题解析', (await txt('#rTitle')) === 'The Value of Reading', await txt('#rTitle'));

  console.log('\n== 快捷键 ==');
  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'3',bubbles:true}))");
  await sleep(320);
  check('按 3 切首字母', (await cls('#paper')).includes('mode-first'), await cls('#paper'));

  console.log('\n== 移动端 ==');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(450);
  await shot('11-mobile-recite');
  check('移动端背诵无横向溢出', await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 2"), await evaluate("[document.documentElement.scrollWidth, window.innerWidth]"));
  await click('[data-view=template]'); await sleep(420);
  await shot('12-mobile-template');
  check('移动端模板无溢出', await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 2"), await evaluate("[document.documentElement.scrollWidth, window.innerWidth]"));
  check('移动端大作文槽位仍在', (await count('.tpl-block:not(.bank) .tpl-en .slot')) === 33, await count('.tpl-block:not(.bank) .tpl-en .slot'));
  check('移动端句库类型可点', (await count('.tpl-types .chip')) === 6, await count('.tpl-types .chip'));
  await click('[data-view=library]'); await sleep(420);
  await shot('13-mobile-library');
  check('移动端选文页无溢出', await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 2"));
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(350);
  await shot('14-desktop-library');

  console.log('\n== 控制台 ==');
  check('无 JS 错误', errors.length === 0, errors.slice(0, 5));
} catch (e) {
  fail++;
  console.log('\n测试中断: ' + e.message);
} finally {
  try { proc.kill(); } catch {}
}

console.log(`\n通过 ${pass} · 失败 ${fail}`);
if (fail) console.log('失败项:\n' + failures.join('\n'));
process.exit(fail ? 1 : 0);






