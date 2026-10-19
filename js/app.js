/* 落日书桌 · 考研英语作文背诵工坊
 * 纯静态，无依赖。所有进度存在 localStorage。
 */
(function () {
  'use strict';

  /* ==================== 小工具 ==================== */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const STORE = 'sunset-desk-v1';
  const DAY = 86400000;
  const INTERVALS = [0, 1, 2, 4, 7, 15, 30];   // 艾宾浩斯复习间隔（天）

  const CATS = {
    big1: '英语一 · 大作文',
    small1: '英语一 · 小作文',
    big2: '英语二 · 大作文',
    small2: '英语二 · 小作文',
    sent: '句型素材'
  };
  const CAT_SHORT = { big1: '英语一大', small1: '英语一小', big2: '英语二大', small2: '英语二小', sent: '句型' };
  const MODES = [
    ['double', '蓝图', 'I'],
    ['hide', '只显中文', 'II'],
    ['first', '首字母', 'III'],
    ['blur', '模糊显影', 'IV'],
    ['block', '逐块背诵', 'V'],
    ['blank', '填空默写', 'VI'],
    ['type', '整篇默写', 'VII']
  ];
  const SIZES = { s: 'calc(var(--fs) * .86)', m: 'var(--fs)', l: 'calc(var(--fs) * 1.22)' };

  const pad = n => String(n).padStart(2, '0');
  const todayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const parseDate = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2400);
  }

  function celebrate() {
    const box = $('#confetti');
    const colors = ['#e2582b', '#c99a3c', '#2f6f62', '#221b14', '#b8401b'];
    for (let i = 0; i < 26; i++) {
      const el = document.createElement('i');
      el.style.left = Math.random() * 100 + 'vw';
      el.style.background = colors[i % colors.length];
      el.style.animationDuration = (1.6 + Math.random() * 1.4) + 's';
      el.style.animationDelay = (Math.random() * 0.25) + 's';
      box.appendChild(el);
      setTimeout(() => el.remove(), 3600);
    }
  }

  /* ==================== 状态 ==================== */
  const defaultSettings = () => ({
    examDate: '2026-12-19',
    rate: 0.9,
    accent: 'en-US',
    size: 'm',
    mode: 'double'
  });

  let S;
  try {
    S = JSON.parse(localStorage.getItem(STORE) || 'null') || {};
  } catch (e) { S = {}; }
  S.settings = Object.assign(defaultSettings(), S.settings || {});
  S.progress = S.progress || {};
  S.log = S.log || {};
  S.favs = S.favs || [];
  S.custom = S.custom || [];
  S.last = S.last || null;

  let saveTimer = null;
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(S)); }
    catch (e) {
      toast('本地存储已满，进度可能无法保存');
      if (navigator.clipboard) navigator.clipboard.writeText(JSON.stringify(S)).catch(() => {});
    }
  }
  function saveSoft() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 350); }

  function logStudy() {
    const k = todayStr();
    S.log[k] = (S.log[k] || 0) + 1;
    saveSoft();
  }

  const templates = () => window.TEMPLATES || [];

  /* 从「句库型」模板里，按信件类型挑出一套句子 */
  function pickForType(tpl, typeId) {
    const out = [];
    (tpl.groups || []).forEach(g => {
      const hits = g.sentences.filter(s => (s.types || []).includes(typeId));
      if (!hits.length) return;
      if (g.multi) out.push({ group: g, items: hits });
      else out.push({ group: g, items: [hits[0]] });
    });
    return out;
  }

  /* 把挑出来的句子拼成一篇可以背的小作文 */
  function buildBankEssay(tpl, typeId) {
    const ty = (tpl.types || []).find(t => t.id === typeId) || { id: typeId, name: typeId };
    const notice = typeId === 'notice';
    const picks = pickForType(tpl, typeId);

    const paras = [[], [], []];
    const cns = [];
    picks.forEach(p => {
      p.items.forEach(s => {
        const i = clamp((p.group.para || 1) - 1, 0, 2);
        paras[i].push(s.en);
        cns.push(s.cn);
      });
    });

    const head = notice ? 'NOTICE' : 'Dear [称呼],';
    const tail = notice ? "The Students' Union" : 'Yours sincerely,\nLi Ming';
    const en = [head]
      .concat(paras.filter(p => p.length).map(p => p.join(' ')))
      .concat([tail])
      .join('\n\n');

    return {
      id: 'tpl-small-' + typeId,
      cat: 'small1',
      isTemplate: true,
      tag: '模板 · ' + ty.name,
      topic: ty.name,
      title: '小作文模板 · ' + ty.name,
      prompt: '小作文「' + ty.name + '」模板：' + picks.reduce((a, p) => a + p.items.length, 0) + ' 句，称呼和落款是固定格式。',
      en,
      cn: [notice ? '通知' : '尊敬的[称呼]：'].concat(cns, [''])
    };
  }

  let _tplEssays = null;
  function templateEssays() {
    if (_tplEssays) return _tplEssays;
    const out = [];
    templates().forEach(t => {
      if (t.kind === 'bank') (t.types || []).forEach(ty => out.push(buildBankEssay(t, ty.id)));
      else if (t.essay) out.push(Object.assign({ isTemplate: true }, t.essay));
    });
    _tplEssays = out;
    return out;
  }

  function allEssays() {
    return (window.ESSAYS || []).concat(templateEssays(), S.custom.map(c => Object.assign({ custom: true }, c)));
  }
  const getEssay = id => allEssays().find(e => e.id === id) || null;

  /* ==================== 文本处理 ==================== */
  const DOT = '\u0001';
  const ABBR = /\b(Mr|Mrs|Ms|Dr|Prof|St|vs|etc|e\.g|i\.e|a\.m|p\.m|No|Fig|Ch)\./g;

  function splitSentences(text) {
    const out = [];
    String(text).replace(/\r/g, '')
      .replace(ABBR, '$1' + DOT)
      .replace(/(\d)\.(\d)/g, '$1' + DOT + '$2')
      .trim()
      .split(/\n\s*\n+/)
      .forEach(par => {
        par = par.trim();
        if (!par) return;
        // 句末标点 + 空白 + 大写字母/引号 处断句；省略号不算句末
        par.split(/(?<!\.\.\.)(?<=[.!?])\s+(?=[A-Z"'“(\[])/)
          .map(t => t.trim())
          .filter(Boolean)
          .forEach((t, i) => out.push({ text: t.split(DOT).join('.'), paraStart: i === 0 }));
      });
    return out;
  }

  function normEn(s) {
    return String(s).toLowerCase()
      .replace(/[’‘]/g, "'").replace(/[“”]/g, '"')
      .replace(/[\u2014\u2013]/g, '-')
      .replace(/[^a-z0-9' ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  const wordsOf = s => normEn(s).split(' ').filter(Boolean);
  const wordCount = s => wordsOf(s).length;

  const stripPunct = s => String(s)
    .replace(/^[\s"'“”‘’(\[]+/, '')
    .replace(/[\s,.!?;:"'“”‘’)\]]+$/, '');

  const HEAD = new Set(['A', 'I', 'a', 'i']);
  function groupWords(text) {
    return text.split(/(\s+)/).map(p => {
      if (!p || /^\s+$/.test(p)) return { t: p, space: true };
      const m = p.match(/^([^A-Za-z]*)([A-Za-z])/);
      if (!m) return { t: p, punct: true, head: p };
      return { t: p, head: HEAD.has(m[2]) ? p : m[2] };
    });
  }

  // 答案 vs 原文：按顺序找漏掉的词
  function findMissing(answer, target) {
    const a = wordsOf(answer), t = wordsOf(target);
    let i = 0, j = 0;
    const miss = [];
    while (j < t.length) {
      if (a[i] === t[j]) { i++; j++; }
      else { miss.push(t[j]); j++; }
    }
    return miss;
  }

  /* ==================== 语音 ==================== */
  const synth = window.speechSynthesis;
  let voices = [];
  function loadVoices() { try { voices = synth ? synth.getVoices() : []; } catch (e) { voices = []; } }
  if (synth) { loadVoices(); synth.onvoiceschanged = loadVoices; }

  function pickVoice() {
    const lang = S.settings.accent === 'en-GB' ? 'en-GB' : 'en-US';
    const same = voices.filter(v => v.lang && v.lang.replace('_', '-').startsWith(lang));
    const best = same.find(v => /Natural|Enhanced|Premium|Samantha|Daniel|Google|Microsoft/.test(v.name));
    return best || same[0] || voices.find(v => v.lang && v.lang.startsWith('en')) || null;
  }

  function speak(text, opts = {}) {
    if (!synth) { toast('当前浏览器不支持朗读'); return; }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(String(text).replace(/\s+/g, ' ').trim());
    u.lang = S.settings.accent;
    u.rate = opts.rate || S.settings.rate;
    const v = pickVoice();
    if (v) u.voice = v;
    if (opts.onend) u.onend = opts.onend;
    synth.speak(u);
  }
  const stopSpeak = () => { if (synth) synth.cancel(); };

  function speakSequence(texts, onDone) {
    if (!synth) { toast('当前浏览器不支持朗读'); return; }
    synth.cancel();
    const v = pickVoice();
    texts.forEach((t, i) => {
      const u = new SpeechSynthesisUtterance(String(t).replace(/\s+/g, ' ').trim());
      u.lang = S.settings.accent;
      u.rate = S.settings.rate;
      if (v) u.voice = v;
      if (i === texts.length - 1 && onDone) u.onend = onDone;
      synth.speak(u);
    });
  }

  /* 语音识别（Chrome / Edge） */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  function scoreSpeech(target, transcript) {
    const t = new Set(wordsOf(target));
    const heard = new Set(wordsOf(transcript));
    if (!t.size) return 0;
    let hit = 0;
    t.forEach(w => { if (heard.has(w)) hit++; });
    return Math.round(hit / t.size * 100);
  }
  function listen(onResult, onEnd) {
    if (!SR) { toast('这个浏览器不支持语音识别，请用电脑上的 Chrome 或 Edge'); return; }
    stopSpeak();
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    let got = false;
    rec.onresult = e => { got = true; onResult(e.results[0][0].transcript); };
    rec.onerror = e => {
      got = true;
      if (/not-allowed|service-not-allowed/.test(e.error)) toast('没有麦克风权限');
      else if (e.error === 'no-speech') toast('没听到声音，再试一次');
      else toast('识别失败：' + e.error);
    };
    rec.onend = () => { if (!got) onResult(null); if (onEnd) onEnd(); };
    rec.start();
  }

  /* ==================== 进度 ==================== */
  function getProg(id) {
    if (!S.progress[id]) {
      S.progress[id] = { stage: 0, due: todayStr(), reps: 0, last: null, sentences: [], essayBest: 0 };
    }
    const p = S.progress[id];
    if (!Array.isArray(p.sentences)) p.sentences = [];
    return p;
  }
  const dueToday = id => !!S.progress[id] && S.progress[id].due <= todayStr();
  const isMastered = p => !!p && p.stage >= INTERVALS.length;

  function scheduleNext(id) {
    const p = getProg(id);
    p.stage = clamp(p.stage + 1, 0, INTERVALS.length);
    p.due = todayStr(addDays(new Date(), INTERVALS[Math.min(p.stage, INTERVALS.length - 1)]));
    p.reps = (p.reps || 0) + 1;
    p.last = todayStr();
    logStudy();
    saveSoft();
  }
  function stageLabel(p) {
    if (!p) return '未开始';
    if (isMastered(p)) return '已掌握';
    return `第 ${Math.max(1, p.stage)} / ${INTERVALS.length} 轮`;
  }
  function dueLabel(id) {
    const p = S.progress[id];
    if (!p || !p.last) return '未背';
    const diff = Math.round((parseDate(p.due) - parseDate(todayStr())) / DAY);
    if (diff < 0) return `逾期 ${-diff} 天`;
    if (diff === 0) return '今天复习';
    if (diff === 1) return '明天复习';
    return `${diff} 天后复习`;
  }

  /* ==================== 视图 ==================== */
  let view = 'library';
  function show(next) {
    view = next;
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + next));
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === next));
    if (next === 'library') renderLibrary();
    if (next === 'template') renderTemplate();
    if (next === 'recite') renderRecite();
    if (next === 'review') renderReview();
    if (next === 'dict') renderDict();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ==================== 选文 ==================== */
  let filter = 'all';

  function renderCountdown() {
    const exam = parseDate(S.settings.examDate || '2026-12-19');
    const diff = Math.round((exam - parseDate(todayStr())) / DAY);
    $('#cdDays').textContent = diff >= 0 ? diff : 0;
    $('#examDate').value = S.settings.examDate;
  }

  function renderLibrary() {
    renderCountdown();
    const list = allEssays().filter(e => !e.isTemplate);
    const essays = list.filter(e => e.cat !== 'sent');
    const sentN = list.length - essays.length;
    const dueN = allEssays().filter(e => dueToday(e.id)).length;
    const learnedN = essays.filter(e => S.progress[e.id] && S.progress[e.id].stage > 0).length;
    const tplN = templates().length;

    const bits = [];
    if (essays.length) bits.push(`<b>${essays.length}</b> 篇范文（已背 <b>${learnedN}</b> 篇）`);
    if (sentN) bits.push(`<b>${sentN}</b> 组句型素材`);
    if (tplN) bits.push(`<b>${tplN}</b> 套自己的模板`);
    bits.push(dueN ? `今天有 <b>${dueN}</b> 项要复习` : '今天没有待复习的内容');
    $('#libSummary').innerHTML = bits.join(' · ') + '。';

    const counts = { all: list.length };
    list.forEach(e => { counts[e.cat] = (counts[e.cat] || 0) + 1; });
    if (filter !== 'all' && !counts[filter]) filter = 'all';
    $('#filters').innerHTML = [['all', '全部']]
      .concat(Object.keys(CATS).filter(k => counts[k]).map(k => [k, CATS[k]]))
      .map(([k, label]) => `<button class="chip ${filter === k ? 'active' : ''}" data-filter="${k}">${label}<span class="n">${counts[k] || 0}</span></button>`)
      .join('');

    const items = list.filter(e => filter === 'all' || e.cat === filter);
    $('#essayGrid').innerHTML = items.map((e, i) => {
      const p = S.progress[e.id];
      const mastered = isMastered(p);
      const dot = mastered ? 'ok' : dueToday(e.id) ? 'due' : '';
      const wm = (e.title || 'Aa').replace(/[^A-Za-z]/g, '').slice(0, 2) || 'Aa';
      return `<div class="card" role="button" tabindex="0" data-id="${e.id}" data-watermark="${esc(wm)}" style="animation-delay:${Math.min(i * 25, 350)}ms">
        <div class="card-tag">${CATS[e.cat] || ''}${e.tag ? ' · ' + esc(e.tag) : ''}</div>
        <div class="card-en">${esc(e.title)}</div>
        <div class="card-cn">${esc(e.prompt || '')}</div>
        <div class="card-meta">
          <span class="dot ${dot}"></span>
          <span class="meta-txt">${dueLabel(e.id)} · ${wordCount(e.en)} 词${p && p.stage ? ' · ' + stageLabel(p) : ''}</span>
        </div>
        ${e.custom ? `<button class="card-del" title="删除这篇" data-del="${e.id}">×</button>` : ''}
      </div>`;
    }).join('') || '<div class="empty-state">这个分类还是空的</div>';

    $('#btnContinue').disabled = !S.last || !getEssay(S.last);
  }

  /* ==================== 模板 ==================== */
  let tplCn = true;
  let tplHint = true;

  const slotHTML = s => esc(s).replace(/\[([^\]]+)\]/g, (m, inner) => `<em class="slot">${esc(inner)}</em>`);

  function itemHTML(s, idx) {
    return `
      <li class="tpl-item" data-en="${esc(s.en)}">
        <div class="tpl-line">
          <span class="tpl-idx">${idx}</span>
          <p class="tpl-en">${slotHTML(s.en)}${s.tag ? `<span class="tpl-tag">${esc(s.tag)}</span>` : ''}</p>
          <button class="tpl-say" type="button" title="朗读这句">${SPK}</button>
        </div>
        ${tplCn ? `<p class="tpl-cn">${esc(s.cn)}</p>` : ''}
        ${tplHint && s.hints ? `<p class="tpl-hints">${Object.keys(s.hints)
          .map(k => `<span class="hint-chip"><b>${esc(k)}</b>${esc(s.hints[k])}</span>`).join('')}</p>` : ''}
      </li>`;
  }

  /* 线性模板（大作文）：三段十句 */
  function renderLinear(t) {
    const total = t.sections.reduce((a, s) => a + s.sentences.length, 0);
    const words = t.sections.reduce((a, s) => a + s.sentences.reduce((b, x) => b + wordCount(x.en), 0), 0);
    const p = S.progress[t.essay && t.essay.id];
    return `
      <div class="tpl-head">
        <div>
          <h3>${esc(t.title)}</h3>
          <p class="tpl-note">${esc(t.note || '')}</p>
        </div>
        <div class="tpl-meta"><b>${total}</b> 句 · <b>${words}</b> 词${p && p.stage ? ' · ' + stageLabel(p) : ''}</div>
      </div>
      ${t.sections.map((sec, si) => `
        <section class="tpl-section">
          <div class="tpl-sec-head">
            <span class="tpl-no">${pad(si + 1)}</span>
            <h4>${esc(sec.name)}</h4>
          </div>
          ${sec.guide ? `<p class="tpl-guide">${esc(sec.guide)}</p>` : ''}
          <ol class="tpl-list">${sec.sentences.map((s, i) => itemHTML(s, si + 1 + '.' + (i + 1))).join('')}</ol>
        </section>`).join('')}`;
  }

  /* 句库模板（小作文）：选类型 → 拼出一套完整小作文 + 可展开看全部句子 */
  let tplType = null;
  function renderBank(t) {
    const types = t.types || [];
    if (!types.length) return '';
    if (!tplType || !types.some(x => x.id === tplType)) tplType = types[0].id;
    const cur = types.find(x => x.id === tplType);
    const picks = pickForType(t, tplType);
    const flat = [];
    picks.forEach(p => p.items.forEach(s => flat.push(s)));
    const words = flat.reduce((a, s) => a + wordCount(s.en), 0);
    const essay = templateEssays().find(e => e.id === 'tpl-small-' + tplType);
    const p = essay && S.progress[essay.id];

    const paras = [[], [], []];
    picks.forEach(pk => pk.items.forEach(s => {
      const i = clamp((pk.group.para || 1) - 1, 0, 2);
      paras[i].push({ s, g: pk.group });
    }));

    return `
      <div class="tpl-head">
        <div>
          <h3>${esc(t.title)}</h3>
          <p class="tpl-note">${esc(t.note || '')}</p>
        </div>
        <div class="tpl-meta"><b>${t.groups.reduce((a, g) => a + g.sentences.length, 0)}</b> 句句库 · ${types.length} 种类型</div>
      </div>
      <div class="tpl-types" role="group" aria-label="信件类型">
        ${types.map(x => `<button class="chip ${x.id === tplType ? 'active' : ''}" data-type="${x.id}">${esc(x.name)}</button>`).join('')}
      </div>
      <div class="tpl-picked">
        <div class="tpl-picked-head">
          <span>「${esc(cur.name)}」自动拼出一套：<b>${flat.length}</b> 句 · <b>${words}</b> 词${p && p.stage ? ' · ' + stageLabel(p) : ''}</span>
          <button class="primary-btn" id="btnBankRecite" data-essay="tpl-small-${tplType}">背这一套 →</button>
        </div>
        <div class="tpl-format">固定格式：<code>${tplType === 'notice' ? 'NOTICE' : 'Dear [称呼],'}</code> …… <code>${tplType === 'notice' ? "The Students' Union" : 'Yours sincerely, Li Ming'}</code></div>
        ${paras.map((arr, pi) => {
          if (!arr.length) return '';
          const gname = pi === 0 ? '第一段' : pi === 1 ? '第二段' : '第三段';
          return `<section class="tpl-section">
            <div class="tpl-sec-head"><span class="tpl-no">${pad(pi + 1)}</span><h4>${gname} · 共 ${arr.length} 句</h4></div>
            <ol class="tpl-list">${arr.map((x, i) => itemHTML(x.s, (pi + 1) + '.' + (i + 1))).join('')}</ol>
          </section>`;
        }).join('')}
      </div>
      <details class="tpl-all">
        <summary>展开全部 ${t.groups.reduce((a, g) => a + g.sentences.length, 0)} 句句库（按段落位置分组）</summary>
        ${t.groups.map((g, gi) => `
          <section class="tpl-section">
            <div class="tpl-sec-head"><span class="tpl-no">${pad(gi + 1)}</span><h4>${esc(g.name)}</h4></div>
            ${g.guide ? `<p class="tpl-guide">${esc(g.guide)}</p>` : ''}
            <ol class="tpl-list">${g.sentences.map((s, i) => itemHTML(s, gi + 1 + '.' + (i + 1))).join('')}</ol>
          </section>`).join('')}
      </details>`;
  }

  function renderTemplate() {
    const host = $('#tplBody');
    const tpls = templates();
    const cd = $('#tplCd');
    if (cd) {
      const exam = parseDate(S.settings.examDate || '2026-12-19');
      const diff = Math.round((exam - parseDate(todayStr())) / DAY);
      cd.textContent = diff > 0 ? `距考试 ${diff} 天` : '考试已过';
    }
    if (!tpls.length) {
      host.innerHTML = '<div class="empty-state">还没有模板。把自己的模板写进 data/essays.js 的 window.TEMPLATES 里。</div>';
      return;
    }
    $('#btnTplCn').classList.toggle('on', tplCn);
    $('#btnTplHint').classList.toggle('on', tplHint);
    host.innerHTML = tpls.map(t => `<div class="tpl-block ${t.kind === 'bank' ? 'bank' : ''}">${t.kind === 'bank' ? renderBank(t) : renderLinear(t)}</div>`).join('');
  }

  /* ==================== 背诵 ==================== */
  let cur = null;
  let curMode = 'double';
  let showCn = true;
  let curReview = false;

  function openEssay(id, fromReview) {
    const e = getEssay(id);
    if (!e) { toast('找不到这篇文章'); return; }
    cur = e;
    curMode = S.settings.mode || 'double';
    curReview = !!fromReview;
    S.last = id;
    saveSoft();
    show('recite');
  }

  function renderRecite() {
    if (!cur && S.last) cur = getEssay(S.last);
    if (!cur) {
      $('#reciteEmpty').hidden = false;
      $('#reciteBody').hidden = true;
      return;
    }
    $('#reciteEmpty').hidden = true;
    $('#reciteBody').hidden = false;

    const sents = splitSentences(cur.en);
    $('#rCat').textContent = CAT_SHORT[cur.cat] || '';
    $('#rTitle').textContent = cur.title;
    $('#rPrompt').textContent = `${cur.prompt ? cur.prompt + ' · ' : ''}${wordCount(cur.en)} 词 · ${sents.length} 句`;
    $('#btnNext').textContent = curReview ? '完成复习 ✓' : '背下一篇 →';
    $('#btnCn').classList.toggle('on', showCn);

    $('#modes').innerHTML = MODES.map(([k, label, num]) =>
      `<button class="mode ${curMode === k ? 'active' : ''}" data-mode="${k}"><i>${num}</i>${label}</button>`).join('');

    buildPaper();
    updateProgress();
  }

  function updateProgress() {
    const total = splitSentences(cur.en).length;
    const p = getProg(cur.id);
    const done = p.sentences.filter(Boolean).length;
    $('#rProgress').innerHTML = `<b>${done}</b> / ${total} 句`;
    $('#progressFill').style.width = total ? (done / total * 100) + '%' : '0%';
  }

  const SPK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>';

  function buildPaper() {
    const host = $('#paper');
    host.innerHTML = '';
    host.className = 'paper mode-' + curMode + (showCn ? '' : ' no-cn');
    host.style.setProperty('--paper-fs', SIZES[S.settings.size] || SIZES.m);

    const sents = splitSentences(cur.en);
    const p = getProg(cur.id);
    const cns = cur.cn || [];

    if (curMode === 'type') { buildType(host, p); return; }

    sents.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'sent ' + curMode;
      if (s.paraStart) row.classList.add('para-start');
      if (curMode === 'block' && p.sentences[i]) row.classList.add('revealed');
      row.dataset.i = i;

      if (showCn && cns[i]) {
        const cn = document.createElement('span');
        cn.className = 'cn';
        cn.textContent = cns[i];
        row.appendChild(cn);
      }

      const en = document.createElement('span');
      en.className = 'en';
      en.innerHTML = sentInner(s.text, curMode);
      row.appendChild(en);

      const btn = document.createElement('button');
      btn.className = 'speak-btn';
      btn.type = 'button';
      btn.title = '朗读这句';
      btn.innerHTML = SPK;
      btn.addEventListener('click', ev => { ev.stopPropagation(); speak(s.text); });
      row.appendChild(btn);

      host.appendChild(row);
    });
  }

  function sentInner(text, mode) {
    if (mode === 'first') {
      return groupWords(text).map(w => {
        if (w.space) return esc(w.t);
        if (w.punct) return `<span class="word punct">${esc(w.t)}</span>`;
        return `<span class="word" data-head="${esc(w.head)}">${esc(w.t)}</span>`;
      }).join('');
    }
    if (mode === 'blank') {
      let idx = 0, picked = 0;
      return groupWords(text).map(w => {
        if (w.space) return esc(w.t);
        if (w.punct) { idx++; return esc(w.t); }
        const bare = stripPunct(w.t).toLowerCase();
        const worth = /^[a-z]{5,}$/.test(bare) && picked < 2 && idx % 3 !== 0;
        idx++;
        if (worth) {
          picked++;
          return `<span class="blank-block"><span class="word" data-ans="${esc(bare)}">${esc(w.t)}</span></span>`;
        }
        return esc(w.t);
      }).join('');
    }
    return esc(text);
  }

  function markSentence(i, on) {
    const p = getProg(cur.id);
    if (!!p.sentences[i] === !!on) return;
    p.sentences[i] = !!on;
    saveSoft();
    updateProgress();
  }

  // 纸面点击（只绑定一次）
  function onPaperClick(ev) {
    if (!cur) return;
    const row = ev.target.closest('.sent');
    if (!row) return;
    const i = +row.dataset.i;
    const sentence = splitSentences(cur.en)[i];
    if (!sentence) return;

    if (curMode === 'first') {
      const w = ev.target.closest('.word');
      if (w) { w.classList.add('peek'); speak(stripPunct(w.textContent)); }
      return;
    }
    if (curMode === 'blank') {
      const blk = ev.target.closest('.blank-block');
      if (blk && !blk.classList.contains('solved')) {
        blk.classList.add('solved');
        speak(stripPunct(blk.textContent));
      }
      return;
    }
    if (curMode === 'blur') {
      row.classList.toggle('focus');
      if (row.classList.contains('focus')) markSentence(i, true);
      return;
    }
    if (curMode === 'block') {
      if (!row.classList.contains('revealed')) {
        row.classList.add('revealed');
        markSentence(i, true);
        speak(sentence.text);
      } else {
        speak(sentence.text);
      }
      return;
    }
    if (curMode === 'hide') {
      row.classList.toggle('show-en');
      if (row.classList.contains('show-en')) { markSentence(i, true); speak(sentence.text); }
      return;
    }
    if (curMode === 'double') {
      speak(sentence.text);
    }
  }

  function setMode(m) {
    curMode = m;
    renderRecite();
  }

  /* ---- 整篇默写 ---- */
  function buildType(host, p) {
    const wrap = document.createElement('div');
    wrap.className = 'type-wrap';
    wrap.innerHTML = `
      <div class="type-bar">
        <button class="primary-btn" id="typeStart">开始默写</button>
        <button class="ghost-btn" id="typeCheck">检查</button>
        <button class="ghost-btn" id="typeClear">清空</button>
        <span class="type-hint">默写完点「检查」：空格和标点不比较，错误会逐词标出。</span>
      </div>
      <textarea id="typeArea" spellcheck="false" autocapitalize="off" autocorrect="off" placeholder="在这里默写整篇作文……"></textarea>
      <div class="type-result" id="typeResult"></div>`;
    host.appendChild(wrap);

    const area = $('#typeArea', wrap);
    const result = $('#typeResult', wrap);

    $('#typeStart', wrap).onclick = () => { area.focus(); speakSequence(splitSentences(cur.en).map(s => s.text)); };
    $('#typeClear', wrap).onclick = () => { area.value = ''; result.innerHTML = ''; area.focus(); };
    $('#typeCheck', wrap).onclick = () => {
      const ans = wordsOf(area.value);
      const tgt = wordsOf(cur.en);
      if (!ans.length) { toast('还没写内容呢'); return; }
      let hit = 0;
      for (let i = 0; i < Math.min(ans.length, tgt.length); i++) if (ans[i] === tgt[i]) hit++;
      const pct = Math.round(hit / Math.max(ans.length, tgt.length) * 100);
      p.essayBest = Math.max(p.essayBest || 0, pct);
      save();

      const diff = [];
      const n = Math.max(ans.length, tgt.length);
      for (let i = 0; i < n; i++) {
        if (ans[i] === tgt[i] && ans[i]) continue;
        if (ans[i] && tgt[i]) diff.push(`<del>${esc(ans[i])}</del> <ins>${esc(tgt[i])}</ins>`);
        else if (tgt[i]) diff.push(`<ins>${esc(tgt[i])}</ins>`);
        else if (ans[i]) diff.push(`<del>${esc(ans[i])}</del>`);
      }
      result.innerHTML = `
        <div class="type-score">正确率 <b>${pct}%</b> · 写了 ${ans.length} 词 / 原文 ${tgt.length} 词</div>
        ${diff.length ? `<p class="type-diff">${diff.slice(0, 120).join(' ')}</p>` : '<p class="type-diff ok">一个词都没错，厉害。</p>'}`;

      if (pct >= 90) { celebrate(); toast(`默写 ${pct}%，非常接近原文`); markSentenceAll(); }
      else toast(`默写 ${pct}%，红色是错的，绿色是漏掉的`);
    };
  }
  function markSentenceAll() {
    const p = getProg(cur.id);
    p.sentences = splitSentences(cur.en).map(() => true);
    save();
    updateProgress();
  }

  /* ==================== 复习 ==================== */
  function renderReview() {
    const list = allEssays();
    const due = [], upcoming = [];
    list.forEach(e => {
      const p = S.progress[e.id];
      if (!p || !p.last) return;
      if (dueToday(e.id)) due.push(e); else upcoming.push(e);
    });
    upcoming.sort((a, b) => (S.progress[a.id].due < S.progress[b.id].due ? -1 : 1));

    const started = list.filter(e => S.progress[e.id] && S.progress[e.id].stage > 0);
    const mastered = list.filter(e => isMastered(S.progress[e.id]));
    const todayN = S.log[todayStr()] || 0;

    $('#reviewStats').innerHTML = `
      <div class="stat hot"><b>${due.length}</b><span>今日待复习</span></div>
      <div class="stat"><b>${started.length}</b><span>已开始</span></div>
      <div class="stat"><b>${mastered.length}</b><span>已掌握</span></div>
      <div class="stat"><b>${todayN}</b><span>今日次数</span></div>`;

    $('#reviewList').innerHTML = due.length ? due.map((e, i) => {
      const p = S.progress[e.id];
      return `<div class="rv-row" data-id="${e.id}" role="button" tabindex="0">
        <span class="rv-idx">${pad(i + 1)}</span>
        <div><div class="rv-title">${esc(e.title)}</div>
        <div class="rv-sub">${CATS[e.cat]} · ${stageLabel(p)} · 上次 ${p.last || '—'}</div></div>
        <span class="rv-badge due">${p.due < todayStr() ? '已逾期' : '今天'}</span>
        <span class="rv-go">→</span>
      </div>`;
    }).join('') : '<div class="empty-state">今天没有到期的文章。可以去背一篇新的，或者干脆休息。</div>';

    $('#reviewUpcoming').innerHTML = upcoming.length
      ? upcoming.slice(0, 40).map(e => `<span class="u-chip">${esc(e.title)} <b>${S.progress[e.id].due}</b></span>`).join('')
      : '<span class="u-chip">还没有安排</span>';
  }

  /* ==================== 听写 ==================== */
  let dict = null;

  function renderDict() {
    const host = $('#dictBody');
    if (!dict) {
      host.innerHTML = `
        <p class="hint" style="margin-bottom:12px">选一篇，逐句听写。Enter 检查，Tab 再听一遍。</p>
        <div class="dict-choose" id="dictChoose">
          ${allEssays().map(e => `<button class="chip" data-id="${e.id}">${esc(e.title)}</button>`).join('')}
        </div>`;
      return;
    }
    if (dict.finished) { renderDictResult(host); return; }

    const s = dict.items[dict.i];
    const dots = dict.items.map(it => `<span class="${it.result ? 'on' : ''}"></span>`).join('');
    host.innerHTML = `
      <div class="dict-panel">
        <div class="dict-score">
          <span>${esc(dict.title)}</span>
          <span>${dict.i + 1} / ${dict.items.length}</span>
        </div>
        <div class="word-dots">${dots}</div>
        ${s.cn ? `<p class="dict-cn">${esc(s.cn)}</p>` : ''}
        <textarea class="dict-input" id="dictInput" rows="2" spellcheck="false" placeholder="听到什么就打什么，Enter 检查"></textarea>
        <div class="dict-actions">
          <button class="primary-btn" id="dictPlay">再听一遍</button>
          <button class="ghost-btn" id="dictHint">提示首词</button>
          ${SR ? '<button class="ghost-btn" id="dictMic">跟读打分</button>' : ''}
          <button class="ghost-btn" id="dictSkip">跳过</button>
        </div>
        <div class="dict-feedback" id="dictFeedback"></div>
      </div>`;

    const input = $('#dictInput');
    input.focus();
    const play = () => speak(s.text);
    $('#dictPlay').onclick = play;
    $('#dictHint').onclick = () => {
      const first = s.text.split(/\s+/)[0];
      speak(first);
      toast('首词：' + stripPunct(first));
    };
    $('#dictSkip').onclick = () => finishDictItem(true);
    if (SR) {
      $('#dictMic').onclick = () => {
        toast('开始跟读，说完自动打分');
        listen(text => {
          if (!text) return;
          const score = scoreSpeech(s.text, text);
          $('#dictFeedback').innerHTML = `<p class="fb-line">跟读得分 <b>${score}</b> / 100</p><p class="fb-line muted">识别到：${esc(text)}</p>`;
        });
      };
    }
    input.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); finishDictItem(false); }
      if (ev.key === 'Tab') { ev.preventDefault(); play(); }
    });
    setTimeout(play, 220);
  }

  function finishDictItem(skip) {
    const item = dict.items[dict.i];
    const val = $('#dictInput') ? $('#dictInput').value : '';
    const miss = skip ? wordsOf(item.text) : findMissing(val, item.text);
    const total = wordsOf(item.text).length || 1;
    const pct = skip ? 0 : Math.round((total - miss.length) / total * 100);
    const ok = !skip && miss.length === 0;
    item.result = ok ? 100 : Math.max(pct, 1);

    const fb = $('#dictFeedback');
    fb.innerHTML = ok
      ? '<p class="fb-line ok">✓ 完全正确</p>'
      : `<p class="fb-line">漏掉或写错：<span class="bad">${miss.slice(0, 12).map(esc).join(' ') || '—'}</span></p>
         <p class="fb-line muted">原文：${esc(item.text)}</p>`;

    if (!ok && synth) setTimeout(() => speak(item.text), 260);
    saveSoft();
    setTimeout(() => {
      dict.i++;
      if (dict.i >= dict.items.length) dict.finished = true;
      renderDict();
    }, ok ? 600 : 2400);
  }

  function renderDictResult(host) {
    const avg = Math.round(dict.items.reduce((a, x) => a + Math.max(0, x.result || 0), 0) / dict.items.length);
    const perfect = dict.items.filter(x => x.result >= 100).length;
    host.innerHTML = `<div class="dict-panel dict-result">
      <h3>${avg}%</h3>
      <p>共 ${dict.items.length} 句，完全正确 ${perfect} 句</p>
      <div class="dict-actions" style="justify-content:center">
        <button class="primary-btn" id="dictAgain">再来一次</button>
        <button class="ghost-btn" id="dictBack">换一篇</button>
      </div>
    </div>`;
    $('#dictAgain').onclick = () => startDict(dict.essayId);
    $('#dictBack').onclick = () => { dict = null; renderDict(); };
    if (avg >= 80) celebrate();
  }

  function startDict(id) {
    const e = getEssay(id);
    if (!e) return;
    const sents = splitSentences(e.en);
    dict = {
      essayId: id,
      title: (CAT_SHORT[e.cat] || '') + ' · ' + e.title,
      items: sents.map((s, i) => ({ text: s.text, cn: (e.cn || [])[i] || '', result: 0 })),
      i: 0,
      finished: false
    };
    logStudy();
    renderDict();
  }

  /* ==================== 统计 ==================== */
  function renderStats() {
    const list = allEssays();
    const essays = list.filter(e => e.cat !== 'sent' && !e.isTemplate);
    const tpls = list.filter(e => e.isTemplate);
    const started = essays.filter(e => S.progress[e.id] && S.progress[e.id].stage > 0);
    const mastered = essays.filter(e => isMastered(S.progress[e.id]));
    const tplStarted = tpls.filter(e => S.progress[e.id] && S.progress[e.id].stage > 0);

    const byCat = {};
    Object.keys(CATS).forEach(k => { byCat[k] = { total: 0, done: 0 }; });
    essays.forEach(e => {
      if (!byCat[e.cat]) return;
      byCat[e.cat].total++;
      if (S.progress[e.id] && S.progress[e.id].stage > 0) byCat[e.cat].done++;
    });

    const heat = [];
    for (let i = 27; i >= 0; i--) {
      const d = todayStr(addDays(new Date(), -i));
      heat.push({ d, n: S.log[d] || 0 });
    }
    const maxN = Math.max(1, ...heat.map(h => h.n));

    let streak = 0;
    for (let i = 0; i < 400; i++) {
      const d = todayStr(addDays(new Date(), -i));
      if (S.log[d]) streak++;
      else if (i > 0) break;
    }

    const bar = (label, done, total) => `
      <div class="bar-row">
        <span>${label}</span><span class="bar-num">${done}/${total}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${total ? done / total * 100 : 0}%"></div></div>
      </div>`;

    $('#statsBody').innerHTML = `
      <div class="review-stats" style="margin:0">
        <div class="stat hot"><b>${started.length}<small>/${essays.length}</small></b><span>已背范文</span></div>
        <div class="stat"><b>${tplStarted.length}<small>/${tpls.length}</small></b><span>已背模板</span></div>
        <div class="stat"><b>${Object.keys(S.log).length}</b><span>学习天数</span></div>
        <div class="stat"><b>${streak}</b><span>连续天数</span></div>
      </div>
      ${Object.keys(CATS).filter(k => byCat[k].total).map(k => bar(CATS[k], byCat[k].done, byCat[k].total)).join('')}
      ${tpls.length ? bar('我的模板', tplStarted.length, tpls.length) : ''}
      <div>
        <div class="heat-label">最近 28 天</div>
        <div class="heat">${heat.map(h => `<span class="${h.n ? 'l' + Math.min(3, Math.ceil(h.n / maxN * 3)) : ''}" title="${h.d} · ${h.n} 次"></span>`).join('')}</div>
      </div>
      <p class="stats-note">进度存在这台电脑的浏览器里。换设备前记得在「设置 → 导出进度」备份。</p>`;
  }

  /* ==================== 设置 ==================== */
  function syncSettings() {
    $('#setExamDate').value = S.settings.examDate;
    $('#setSpeed').value = S.settings.rate;
    $('#speedVal').textContent = Number(S.settings.rate).toFixed(2).replace(/0$/, '') + '×';
    $$('#setAccent button').forEach(b => b.classList.toggle('active', b.dataset.accent === S.settings.accent));
    $$('#setSize button').forEach(b => b.classList.toggle('active', b.dataset.size === S.settings.size));
    $('#setMode').value = S.settings.mode;
  }
  function openModal(id) {
    $('#' + id).hidden = false;
    if (id === 'modalStats') renderStats();
    if (id === 'modalSettings') syncSettings();
  }

  /* ==================== 事件 ==================== */
  function bind() {
    $$('.tab').forEach(t => t.onclick = () => show(t.dataset.view));
    document.addEventListener('click', ev => {
      const go = ev.target.closest('[data-goto]');
      if (go) show(go.dataset.goto);
      const cl = ev.target.closest('[data-close]');
      if (cl) $('#' + cl.dataset.close).hidden = true;
    });
    $$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.hidden = true; }));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') $$('.modal').forEach(m => { m.hidden = true; });
    });

    $('#btnStats').onclick = () => openModal('modalStats');
    $('#btnSettings').onclick = () => openModal('modalSettings');

    /* 选文 */
    $('#filters').addEventListener('click', e => {
      const b = e.target.closest('[data-filter]');
      if (b) { filter = b.dataset.filter; renderLibrary(); }
    });
    $('#essayGrid').addEventListener('click', e => {
      const del = e.target.closest('[data-del]');
      if (del) {
        e.stopPropagation();
        const id = del.dataset.del;
        if (confirm('删除这篇自定义范文？')) {
          S.custom = S.custom.filter(c => c.id !== id);
          delete S.progress[id];
          if (S.last === id) S.last = null;
          save();
          renderLibrary();
          toast('已删除');
        }
        return;
      }
      const card = e.target.closest('.card');
      if (card) openEssay(card.dataset.id);
    });
    $('#essayGrid').addEventListener('keydown', e => {
      const card = e.target.closest('.card');
      if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openEssay(card.dataset.id); }
    });
    $('#btnContinue').onclick = () => S.last && openEssay(S.last);
    $('#examDate').addEventListener('change', e => {
      if (!e.target.value) return;
      S.settings.examDate = e.target.value; save(); renderCountdown();
    });

    /* 模板 */
    $('#btnTplCn').onclick = () => { tplCn = !tplCn; renderTemplate(); };
    $('#btnTplHint').onclick = () => { tplHint = !tplHint; renderTemplate(); };
    $('#btnTplRecite').onclick = () => {
      const t = templates().find(x => x.kind !== 'bank' && x.essay);
      if (!t) { toast('还没有大作文模板'); return; }
      openEssay(t.essay.id);
    };
    $('#tplBody').addEventListener('click', e => {
      const typeBtn = e.target.closest('[data-type]');
      if (typeBtn) { tplType = typeBtn.dataset.type; renderTemplate(); return; }

      const recite = e.target.closest('#btnBankRecite');
      if (recite) { openEssay(recite.dataset.essay); return; }

      const say = e.target.closest('.tpl-say');
      if (say) { speak(say.closest('.tpl-item').dataset.en); return; }

      const slot = e.target.closest('.slot');
      if (slot) {
        const key = slot.textContent;
        let hint = '';
        templates().forEach(t => {
          if (t.kind === 'bank') t.groups.forEach(g => g.sentences.forEach(s => { if (s.hints && s.hints[key]) hint = s.hints[key]; }));
          else (t.sections || []).forEach(sec => sec.sentences.forEach(s => { if (s.hints && s.hints[key]) hint = s.hints[key]; }));
        });
        toast(hint ? `[${key}] 填：${hint}` : `[${key}]`);
      }
    });

    /* 自定义范文 */
    $('#btnAddCustom').onclick = () => {
      const raw = $('#customInput').value.trim();
      if (raw.length < 20) { toast('内容太短，至少写一句完整的英文'); return; }
      const lines = raw.split(/\n+/).map(l => l.trim()).filter(Boolean);
      let title = '我的范文 ' + (S.custom.length + 1);
      let body = raw;
      if (lines.length > 1 && lines[0].length < 90 && /[A-Za-z\u4e00-\u9fa5]/.test(lines[0]) && !/[.!?]$/.test(lines[0])) {
        title = lines[0];
        body = lines.slice(1).join('\n\n');
      }
      S.custom.push({ id: 'c-' + Date.now(), cat: $('#customCat').value, title, prompt: '自定义范文', en: body, tag: '自定义' });
      save();
      $('#customInput').value = '';
      renderLibrary();
      toast('已添加，可以开始背了');
    };

    /* 背诵 */
    $('#paper').addEventListener('click', onPaperClick);
    $('#modes').addEventListener('click', e => {
      const b = e.target.closest('[data-mode]');
      if (b) setMode(b.dataset.mode);
    });
    $('#btnCn').onclick = () => {
      showCn = !showCn;
      $('#btnCn').classList.toggle('on', showCn);
      buildPaper();
    };
    $('#btnFont').onclick = () => {
      const order = ['s', 'm', 'l'];
      S.settings.size = order[(order.indexOf(S.settings.size) + 1) % 3];
      save();
      $('#paper').style.setProperty('--paper-fs', SIZES[S.settings.size]);
      toast('字号：' + { s: '小', m: '中', l: '大' }[S.settings.size]);
    };
    $('#btnHint').onclick = () => {
      if (!cur) return;
      const sents = splitSentences(cur.en);
      const p = getProg(cur.id);
      toast(`共 ${sents.length} 句，已确认 ${p.sentences.filter(Boolean).length} 句。点句子可以朗读或显影。`);
    };
    $('#btnRestart').onclick = () => {
      if (!cur) return;
      if (!confirm('清空这一篇的逐句进度？（不影响复习计划）')) return;
      getProg(cur.id).sentences = [];
      save();
      buildPaper();
      updateProgress();
      toast('已重来');
    };
    $('#btnNext').onclick = () => {
      if (!cur) return;
      const wasReview = curReview;
      scheduleNext(cur.id);
      celebrate();

      if (wasReview) {
        curReview = false;
        toast('复习完成，下次按计划再来');
        show('review');
        return;
      }
      toast('已计入复习计划');
      const list = allEssays();
      const idx = list.findIndex(e => e.id === cur.id);
      let next = null;
      for (let k = 1; k < list.length; k++) {
        const cand = list[(idx + k) % list.length];
        if (cand.id === cur.id) break;
        if (cand.cat === cur.cat) { next = cand; break; }
      }
      if (!next) { show('library'); return; }
      openEssay(next.id);
    };

    /* 复习 */
    $('#reviewList').addEventListener('click', e => {
      const row = e.target.closest('.rv-row');
      if (row) openEssay(row.dataset.id, true);
    });
    $('#reviewList').addEventListener('keydown', e => {
      const row = e.target.closest('.rv-row');
      if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openEssay(row.dataset.id, true); }
    });

    /* 听写 */
    $('#dictBody').addEventListener('click', e => {
      const b = e.target.closest('#dictChoose [data-id]');
      if (b) startDict(b.dataset.id);
    });

    /* 设置 */
    $('#setExamDate').addEventListener('change', e => {
      if (!e.target.value) return;
      S.settings.examDate = e.target.value; save(); renderCountdown();
    });
    $('#setSpeed').addEventListener('input', e => {
      S.settings.rate = +e.target.value;
      $('#speedVal').textContent = Number(S.settings.rate).toFixed(2).replace(/0$/, '') + '×';
      save();
    });
    $('#setSpeed').addEventListener('change', () => speak('This is how I read a sentence.'));
    $$('#setAccent button').forEach(b => b.onclick = () => {
      S.settings.accent = b.dataset.accent; save(); syncSettings();
      stopSpeak(); setTimeout(() => speak('Hello, this is how I sound.'), 120);
    });
    $$('#setSize button').forEach(b => b.onclick = () => {
      S.settings.size = b.dataset.size; save(); syncSettings();
      if (cur) $('#paper').style.setProperty('--paper-fs', SIZES[S.settings.size]);
    });
    $('#setMode').addEventListener('change', e => {
      S.settings.mode = e.target.value; save();
      if (cur) setMode(S.settings.mode);
    });
    $('#btnExport').onclick = () => {
      const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'sunset-desk-' + todayStr() + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    };
    $('#btnImport').onclick = () => $('#importFile').click();
    $('#importFile').addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const data = JSON.parse(r.result);
          if (!data || typeof data !== 'object') throw new Error('bad');
          Object.assign(S, data);
          S.settings = Object.assign(defaultSettings(), S.settings || {});
          S.progress = S.progress || {};
          S.log = S.log || {};
          S.custom = S.custom || [];
          save();
          syncSettings();
          renderCountdown();
          renderLibrary();
          toast('导入成功');
        } catch (err) { toast('文件格式不对'); }
      };
      r.readAsText(f);
      e.target.value = '';
    });

    /* 快捷键：1-7 切模式 */
    document.addEventListener('keydown', e => {
      if (view !== 'recite' || !cur) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
      const map = { 1: 'double', 2: 'hide', 3: 'first', 4: 'blur', 5: 'block', 6: 'blank', 7: 'type' };
      if (map[e.key]) { e.preventDefault(); setMode(map[e.key]); }
      if (e.key === ' ') { e.preventDefault(); stopSpeak(); }
    });
  }

  /* ==================== 启动 ==================== */
  function init() {
    bind();
    if (synth) setTimeout(loadVoices, 300);
    if (!S.last || !getEssay(S.last)) {
      const first = allEssays()[0];
      S.last = first ? first.id : null;
    }
    show(templates().length ? 'template' : 'library');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
