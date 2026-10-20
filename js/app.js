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
    ['blank', '填空拼写', 'I'],
    ['blur', '模糊显影', 'II']
  ];
  const MODE_KEYS = MODES.map(m => m[0]);
  /* 已下线的旧模式名，读旧设置时兜底到现存模式 */
  const OLD_MODES = {
    double: 'blur',   // 双层蓝图 → 模糊显影
    hide: 'blur',     // 只显中文 → 模糊显影
    first: 'blank',   // 首字母 → 填空（每个词都要打出来）
    type: 'blank'     // 整篇默写 → 逐句填空
  };
  function normMode(m) {
    if (MODE_KEYS.includes(m)) return m;
    return OLD_MODES[m] || 'blank';
  }
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
    mode: 'blank',
    quizMode: 'random'
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

  /* 把一句拆成「空白 / 标点 / 单词」三类，单词带上首尾标点，
   * 这样全挖空时标点留在原处，只有词本身变成横线。 */
  function tokenize(text) {
    return String(text).split(/(\s+)/).map(p => {
      if (!p || /^\s+$/.test(p)) return { t: p, space: true };
      // [槽位] 是考场才填的，原样显示，不挖空
      if (/[[\]]/.test(p)) return { t: p, literal: true };
      const m = p.match(/^([^A-Za-z]*)([A-Za-z][A-Za-z'’-]*)(.*)$/);
      if (!m) return { t: p, literal: true };
      return { t: p, lead: m[1], core: m[2], tail: m[3], word: true };
    });
  }

  /* 判词只看字母：大小写、标点、连字符、撇号都不计较 */
  const normWord = s => String(s).toLowerCase().replace(/[^a-z]/g, '');

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
    if (next === 'quiz') renderQuiz();
    if (next === 'template') renderTemplate();
    if (next === 'recite') renderRecite();
    if (next === 'review') renderReview();
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
  let curMode = 'blank';
  let showCn = true;
  let curReview = false;

  function openEssay(id, fromReview) {
    const e = getEssay(id);
    if (!e) { toast('找不到这篇文章'); return; }
    cur = e;
    curMode = normMode(S.settings.mode);
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

    if (curMode === 'blank') {
      const tip = document.createElement('div');
      tip.className = 'blank-tip';
      tip.innerHTML = '整句每个词都挖空了，在横线上打出来：打对就变绿并自动跳到下一个空，打错会标红，<kbd>Enter</kbd> 重判、<kbd>Tab</kbd> 换空。';
      host.appendChild(tip);
    }

    sents.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'sent ' + curMode;
      if (s.paraStart) row.classList.add('para-start');
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

  /* 填空：整句每个词都挖空，只留标点和 [槽位] */
  function sentInner(text, mode) {
    if (mode === 'blank') {
      return tokenize(text).map(w => {
        if (!w.word) return esc(w.t);
        const n = Math.max(2, Math.min(18, w.core.length));
        return `${esc(w.lead)}<input class="blank-input" data-ans="${esc(w.core)}" size="${n}"
                 autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
                 aria-label="填空">${esc(w.tail)}`;
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

    if (curMode === 'blank') {
      // 输入框自己处理，点空白处只朗读这句
      if (ev.target.closest('.blank-input')) return;
      speak(sentence.text);
      return;
    }
    if (curMode === 'blur') {
      row.classList.toggle('focus');
      if (row.classList.contains('focus')) markSentence(i, true);
    }
  }

  function setMode(m) {
    curMode = normMode(m);
    renderRecite();
  }

  /* 填空拼写：打对就变绿锁住并自动跳到下一个空 */
  function checkBlank(inp, quiet) {
    const want = normWord(inp.dataset.ans);
    const got = normWord(inp.value);
    if (!got) { inp.classList.remove('ok', 'bad'); return false; }
    if (got === want) {
      inp.classList.remove('bad');
      inp.classList.add('ok');
      inp.readOnly = true;
      inp.tabIndex = -1;
      if (!quiet) { beep(880, .07); beep(1180, .09); }
      const row = inp.closest('.sent');
      if (row) {
        const all = Array.from(row.querySelectorAll('.blank-input'));
        if (all.length && all.every(x => x.classList.contains('ok'))) markSentence(+row.dataset.i, true);
      }
      return true;
    }
    inp.classList.remove('ok');
    inp.classList.add('bad');
    if (!quiet) beep(240, .14, 'square', .035);
    return false;
  }

  /* 下一个还没填对的空，跨句继续 */
  function nextBlank(from) {
    const all = Array.from(document.querySelectorAll('#paper .blank-input'));
    const idx = all.indexOf(from);
    return all.slice(idx + 1).find(x => !x.classList.contains('ok'))
      || all.find(x => !x.classList.contains('ok'))
      || null;
  }

  function onPaperKeydown(e) {
    const inp = e.target.closest && e.target.closest('.blank-input');
    if (!inp) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (checkBlank(inp)) {
        const nx = nextBlank(inp);
        if (nx) nx.focus();
      } else {
        speak(inp.dataset.ans);
      }
    }
  }

  function onPaperInput(e) {
    const inp = e.target.closest && e.target.closest('.blank-input');
    if (!inp || inp.readOnly) return;
    if (inp.classList.contains('bad')) inp.classList.remove('bad');
    // 打对了立刻变绿并跳走，不用按回车
    if (normWord(inp.value) && normWord(inp.value) === normWord(inp.dataset.ans)) {
      checkBlank(inp);
      const nx = nextBlank(inp);
      if (nx) nx.focus();
    }
  }

  function onPaperFocusOut(e) {
    const inp = e.target.closest && e.target.closest('.blank-input');
    if (inp && !inp.readOnly && inp.value.trim()) checkBlank(inp, true);
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


  /* ==================== 闯关练习 ==================== */

  /* 音效：几行 WebAudio，不用下载素材 */
  let AC = null;
  function beep(freq, dur, type, vol) {
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      if (AC.state === 'suspended') AC.resume();
      const o = AC.createOscillator();
      const g = AC.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      o.connect(g); g.connect(AC.destination);
      const t = AC.currentTime;
      g.gain.setValueAtTime(vol || 0.05, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur);
    } catch (e) { /* 静音环境就算了 */ }
  }
  const sfxRight = () => { beep(660, .09); setTimeout(() => beep(990, .13), 85); };
  const sfxWrong = () => { beep(240, .18, 'square', .04); };
  const sfxWin = () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, .16), i * 105));

  const shuffle = arr => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  S.quiz = S.quiz || { total: 0, correct: 0, best: 0, bestCombo: 0 };
  S.quiz.seq = S.quiz.seq || {};   // 顺序模式：每个题源练到第几句

  /* 出题方式：random 随机抽 10 句 / order 按句库顺序往下走 */
  const quizMode = () => (S.settings.quizMode === 'order' ? 'order' : 'random');
  const QUIZ_ROUND = 10;

  /* 题源：模板按段、句库按类型、句型素材 */
  function quizSources() {
    const out = [];
    const lin = templates().find(t => t.kind !== 'bank');
    if (lin) {
      out.push({
        id: 'big',
        name: '大作文模板',
        items: lin.sections.reduce((a, s) => a.concat(s.sentences), [])
      });
    }
    const bank = templates().find(t => t.kind === 'bank');
    if (bank) {
      (bank.types || []).forEach(ty => {
        const items = pickForType(bank, ty.id).reduce((a, p) => a.concat(p.items), []);
        out.push({ id: 'small-' + ty.id, name: '小作文·' + ty.name, items });
      });
      out.push({ id: 'small-all', name: '小作文·全部', items: bank.groups.reduce((a, g) => a.concat(g.sentences), []) });
    }
    const sent = (window.ESSAYS || [])
      .filter(e => e.cat === 'sent')
      .reduce((a, e) => a.concat(splitSentences(e.en).map((s, i) => ({ en: s.text, cn: (e.cn || [])[i] || '' }))), []);
    if (sent.length) out.push({ id: 'sent', name: '句型素材', items: sent });
    return out.filter(s => s.items.length);
  }

  /* 全部句子，用来给选择题造干扰项 */
  function allQuizSentences() {
    const set = [];
    quizSources().forEach(s => s.items.forEach(it => set.push(it.en)));
    return Array.from(new Set(set));
  }

  const tileSplit = s => String(s).trim().split(/\s+/).filter(Boolean);
  /* 一个题源里真正能出题的句子（太短的排除），随机和顺序共用同一份 */
  const quizPool = src => src.items.filter(it => it && it.en && tileSplit(it.en).length >= 3);

  let quiz = null;
  let quizSource = null;
  let quizRoundMode = 'random';

  function startQuiz(sourceId, mode) {
    const srcs = quizSources();
    if (!srcs.length) { toast('还没有可以练的句子'); return; }
    const src = srcs.find(s => s.id === sourceId) || srcs[0];
    quizSource = src.id;
    quizRoundMode = mode === 'order' ? 'order' : quizMode();

    const pool = quizPool(src);
    if (!pool.length) { toast('这个题源太短了'); return; }

    let picked, from = 0, to = 0;
    if (quizRoundMode === 'order') {
      // 从上次停下的地方接着走，走到末尾再回到开头
      let start = (S.quiz.seq[src.id] || 0) % pool.length;
      to = Math.min(start + QUIZ_ROUND, pool.length);
      from = start + 1;
      picked = pool.slice(start, to);
      S.quiz.seq[src.id] = to % pool.length;
      save();
    } else {
      picked = shuffle(pool).slice(0, Math.min(QUIZ_ROUND, pool.length));
    }

    const others = allQuizSentences();
    quiz = {
      title: src.name,
      mode: quizRoundMode,
      readyRange: quizRoundMode === 'order' ? `${from}–${to} / ${pool.length}` : '',
      items: picked.map((it, i) => {
        const types = ['build', 'build', 'listen', 'build', 'choice'];
        return {
          type: types[i % types.length],
          en: it.en,
          cn: it.cn || '',
          result: null,
          extra: {}   // 运行时生成：词块、选项
        };
      }),
      i: 0,
      combo: 0,
      maxCombo: 0,
      correct: 0,
      wrong: 0,
      startedAt: Date.now(),
      pool: others,
      finished: false
    };
    renderQuiz();
  }

  function buildPrompt(it) {
    const tokens = tileSplit(it.en);
    if (it.type === 'choice') {
      const decoys = shuffle(quiz.pool.filter(s => s !== it.en && Math.abs(tileSplit(s).length - tokens.length) <= 6)).slice(0, 3);
      const opts = shuffle([it.en].concat(decoys));
      return { tokens, tokens2: null, opts, decoyCount: decoys.length };
    }
    // 干扰词块：从别的句子里抓两个词
    const pool = quiz.pool.filter(s => s !== it.en);
    const extra = [];
    for (let k = 0; k < 2 && pool.length; k++) {
      const w = tileSplit(pool[Math.floor(Math.random() * pool.length)]).filter(t => /^[A-Za-z]{3,}$/.test(t));
      if (w.length) extra.push(w[Math.floor(Math.random() * w.length)]);
    }
    const bank = shuffle(tokens.concat(extra)).map((t, i) => ({ id: 't' + i, text: t }));
    return { tokens, bank, extra };
  }

  function renderQuiz() {
    const host = $('#quizBody');
    if (!quiz) { renderQuizPicker(host); return; }

    // 已作答的题不再重复渲染（切页回来时直接跳到下一题）
    while (quiz.items[quiz.i] && quiz.items[quiz.i].solved) quiz.i++;
    if (quiz.i >= quiz.items.length) {
      if (!quiz.finished) finishQuiz();
      renderQuizDone(host);
      return;
    }

    const it = quiz.items[quiz.i];
    const q = (it.extra && (it.extra.bank || it.extra.opts)) ? it.extra : buildPrompt(it);
    it.extra = q;
    if (!Array.isArray(it.picked)) it.picked = [];
    it.solved = false;

    const total = quiz.items.length || 1;
    const done = quiz.items.filter(x => x.solved).length;
    const pct = (done / total) * 100;
    const isChoice = it.type === 'choice';

    host.innerHTML = `
      <div class="qz-shell">
        <div class="qz-top">
          <button class="qz-quit" id="qzQuit" title="退出">✕</button>
          <div class="qz-bar"><div class="qz-bar-fill" style="width:${pct}%"></div></div>
          <div class="qz-combo ${quiz.combo >= 3 ? 'hot' : ''}">${quiz.combo >= 2 ? '🔥 ' + quiz.combo : ''}</div>
        </div>

        <div class="qz-card">
          <div class="qz-type">
            <span>${it.type === 'listen' ? '听音频，拼出句子' : it.type === 'choice' ? '选出正确的那句' : '把下面这句中文翻成英文'}</span>
            <span class="qz-mode-tag ${quiz.mode === 'order' ? 'order' : ''}">${quiz.mode === 'order' ? '顺序 ' + esc(quiz.readyRange) : '随机'}</span>
          </div>

          ${it.misses ? `<div class="qz-retry">
            <span class="qz-retry-txt">✗ 这次没拼对，已经清空，再拼一次就行</span>
            <button class="ghost-btn qz-reveal" id="qzReveal">${it.revealed ? '收起答案' : '看答案'}</button>
          </div>` : ''}

          ${it.revealed ? `<div class="qz-revealed" id="qzRevealed">
            <p class="qz-revealed-en">${esc(it.en)}</p>
            ${it.type === 'listen' && it.cn ? `<p class="qz-revealed-cn">${esc(it.cn)}</p>` : ''}
            <div class="qz-revealed-foot">
              <span class="qz-revealed-hint">照着答案把词块再拼一遍，然后点「检查」；不想拼就跳过。</span>
              <button class="ghost-btn qz-skip" id="qzSkip">跳过这题</button>
            </div>
          </div>` : ''}

          ${it.type === 'listen'
            ? `<button class="qz-play" id="qzPlay">🔊 点这里听</button>`
            : `<p class="qz-cn">${esc(it.cn || '（这句没有中文提示）')}</p>`}

          ${isChoice
            ? `<div class="qz-opts">${q.opts.map((o, i) => `<button class="qz-opt" data-opt="${i}">${esc(o)}</button>`).join('')}</div>`
            : `
              <div class="qz-answer ${it.type === 'listen' ? 'ghosted' : ''}" id="qzAnswer"></div>
              <div class="qz-bank" id="qzBank">
                ${q.bank.map(t => `<button class="qz-tile" data-tile="${t.id}">${esc(t.text)}</button>`).join('')}
              </div>`}
        </div>

        <div class="qz-foot">
          ${isChoice
            ? '<span class="qz-foot-hint">点一个选项</span>'
            : `<button class="ghost-btn" id="qzUndo" title="撤掉最后一个">退一步</button>
               <button class="primary-btn big" id="qzCheck" disabled>检查</button>`}
        </div>

        <div class="qz-feedback" id="qzFeedback" hidden></div>
      </div>`;

    if (it.type === 'listen') setTimeout(() => speak(it.en), 300);

    const bank = $('#qzBank', host);
    const ans = $('#qzAnswer', host);

    const redraw = () => {
      if (!bank || !ans) return;
      ans.innerHTML = it.picked.length
        ? it.picked.map(id => {
            const t = q.bank.find(x => x.id === id);
            return `<button class="qz-tile in" data-unpick="${id}">${esc(t.text)}</button>`;
          }).join('')
        : '<span class="qz-ph">点下面的词块，按顺序拼</span>';
      $$('.qz-tile', bank).forEach(b => { b.disabled = it.picked.includes(b.dataset.tile); });
      const ck = $('#qzCheck');
      if (ck) ck.disabled = it.picked.length === 0;
    };

    if (bank) {
      redraw();
      bank.addEventListener('click', e => {
        const b = e.target.closest('[data-tile]');
        if (!b || it.solved) return;
        it.picked.push(b.dataset.tile);
        redraw();
      });
      ans.addEventListener('click', e => {
        const b = e.target.closest('[data-unpick]');
        if (!b || it.solved) return;
        it.picked = it.picked.filter(id => id !== b.dataset.unpick);
        redraw();
      });
      const undo = $('#qzUndo');
      if (undo) undo.onclick = () => { if (!it.solved && it.picked.length) { it.picked.pop(); redraw(); } };
    }

    if (isChoice) {
      $$('.qz-opt', host).forEach(b => b.onclick = () => {
        if (it.solved) return;
        const ok = q.opts[+b.dataset.opt] === it.en;
        $$('.qz-opt', host).forEach(x => { x.classList.add('locked'); if (x === b) x.classList.add(ok ? 'right' : 'wrong'); });
        settle(ok, it);
      });
    }

    const play = $('#qzPlay');
    if (play) play.onclick = () => speak(it.en);
    const reveal = $('#qzReveal');
    if (reveal) reveal.onclick = () => {
      it.revealed = !it.revealed;
      renderQuiz();   // 重渲染但保留已点词块，答案收起/展开不影响继续拼
    };
    const skip = $('#qzSkip');
    if (skip) skip.onclick = () => {
      it.solved = true;
      it.result = false;
      quiz.i++;
      if (quiz.i >= quiz.items.length) { quiz.finished = true; finishQuiz(); }
      renderQuiz();
    };
    $('#qzQuit').onclick = () => { if (confirm('退出这轮练习？进度不保留')) { quiz = null; renderQuiz(); } };
    const ckBtn = $('#qzCheck');
    if (ckBtn) ckBtn.onclick = () => {
      if (it.solved) return;
      const said = it.picked.map(id => q.bank.find(x => x.id === id).text).join(' ');
      settle(normEn(said) === normEn(it.en), it);
    };
  }

  /* 答对的结算反馈 */
  function renderFeedback(it) {
    const fb = $('#qzFeedback');
    if (!fb) return;
    fb.hidden = false;
    fb.className = 'qz-feedback ok show';
    fb.innerHTML = `
      <div class="qz-fb-head">
        <span class="qz-fb-title">✓ 对了</span>
        ${quiz.combo >= 3 ? `<span class="qz-fb-combo">🔥 连对 ${quiz.combo}</span>` : ''}
        <button class="ghost-btn" id="qzSpeak">🔊</button>
      </div>
      <button class="primary-btn big" id="qzNext">继续</button>`;
    $('#qzSpeak').onclick = () => speak(it.en);
    $('#qzNext').onclick = () => {
      quiz.i++;
      if (quiz.i >= quiz.items.length) { quiz.finished = true; finishQuiz(); }
      renderQuiz();
    };
  }

  function settle(ok, it) {
    // 每题只在第一次检查时计入统计；之后重拼不再影响正确率
    if (!it.counted) {
      it.counted = true;
      S.quiz.total++;
      if (ok) { S.quiz.correct++; quiz.correct++; }
      else quiz.wrong++;
    }

    if (ok) {
      it.solved = true;
      it.result = true;
      quiz.combo++;
      quiz.maxCombo = Math.max(quiz.maxCombo, quiz.combo);
      S.quiz.bestCombo = Math.max(S.quiz.bestCombo || 0, quiz.maxCombo);
      sfxRight();
      saveSoft();
      logStudy();
      renderFeedback(it);
      return;
    }

    // 答错：把已经点上的词块清空，原地重来，可以再检查一次
    quiz.combo = 0;
    sfxWrong();
    it.misses = (it.misses || 0) + 1;
    it.picked = [];
    saveSoft();
    renderQuiz();
  }

  function finishQuiz() {
    const q = quiz;
    const acc = Math.round((q.correct / Math.max(1, q.correct + q.wrong)) * 100);
    S.quiz.best = Math.max(S.quiz.best || 0, acc);
    save();
    if (acc >= 80) { celebrate(); sfxWin(); }
  }

  function renderQuizDone(host) {
    const q = quiz;
    const acc = Math.round((q.correct / Math.max(1, q.correct + q.wrong)) * 100);
    const secs = Math.round((Date.now() - q.startedAt) / 1000);
    const mastered = acc === 100;
    host.innerHTML = `
      <div class="qz-done">
        <div class="qz-done-ring ${mastered ? 'perfect' : ''}">${acc}<span>%</span></div>
        <h3>${mastered ? '全部答对，这一套稳了' : acc >= 80 ? '不错，再刷一轮就熟了' : '还得多过几遍'}</h3>
        <p class="qz-done-sub">${esc(q.title)} · ${q.items.length} 题 · 用时 ${secs} 秒 · 最高连对 ${q.maxCombo}</p>
        <div class="qz-done-stats">
          <div><b>${S.quiz.correct}</b><span>累计答对</span></div>
          <div><b>${S.quiz.total}</b><span>累计答题</span></div>
          <div><b>${S.quiz.bestCombo || 0}</b><span>最长连对</span></div>
        </div>
        <div class="qz-done-actions">
          <button class="primary-btn big" id="qzAgain">再来一轮</button>
          <button class="ghost-btn" id="qzBack">换个题源</button>
        </div>
      </div>`;
    $('#qzAgain').onclick = () => startQuiz(quizSource, quizRoundMode);
    $('#qzBack').onclick = () => { quiz = null; renderQuiz(); };
  }

  function renderQuizPicker(host) {
    const srcs = quizSources();
    const acc = S.quiz.total ? Math.round(S.quiz.correct / S.quiz.total * 100) : 0;
    const mode = quizMode();
    host.innerHTML = `
      <div class="qz-modebar">
        <span class="qz-modebar-label">出题方式</span>
        <div class="seg" id="qzMode">
          <button data-qmode="random" class="${mode === 'random' ? 'active' : ''}">随机</button>
          <button data-qmode="order" class="${mode === 'order' ? 'active' : ''}">顺序</button>
        </div>
        <span class="qz-modebar-hint">${mode === 'order'
          ? '按句库顺序往下走，每轮 10 句，练到哪记到哪。'
          : '每轮从整个题源里随机抽 10 句。'}</span>
        ${mode === 'order' ? '<button class="ghost-btn qz-reset" id="qzResetOrder">从头开始</button>' : ''}
      </div>
      <div class="qz-pick">
        ${srcs.map(s => {
          const n = quizPool(s).length;
          const at = n ? (S.quiz.seq[s.id] || 0) % n : 0;
          const sub = mode === 'order' ? `${n} 句 · 下次从第 ${at + 1} 句起` : `${n} 句`;
          return `<button class="qz-pick-card" data-src="${s.id}">
            <span class="qz-pick-name">${esc(s.name)}</span>
            <span class="qz-pick-n">${sub}</span>
            <span class="qz-pick-go">${mode === 'order' ? '接着往下练 →' : '开始 →'}</span>
          </button>`;
        }).join('')}
      </div>
      <div class="qz-overview">
        <div><b>${S.quiz.total}</b><span>累计答题</span></div>
        <div><b>${acc}%</b><span>正确率</span></div>
        <div><b>${S.quiz.bestCombo || 0}</b><span>最长连对</span></div>
        <div><b>${S.quiz.best || 0}%</b><span>最好成绩</span></div>
      </div>
      <p class="hint small">每轮 10 题：点词块拼句、听音频拼句、四选一。检查不对会清空重拼，可以一直改到对为止。</p>`;

    $$('[data-qmode]', host).forEach(b => b.onclick = () => {
      S.settings.quizMode = b.dataset.qmode;
      save();
      renderQuiz();
    });
    const reset = $('#qzResetOrder', host);
    if (reset) reset.onclick = () => { S.quiz.seq = {}; save(); renderQuiz(); toast('顺序进度已清零，从第一句重新开始'); };
    $$('.qz-pick-card', host).forEach(b => b.onclick = () => startQuiz(b.dataset.src));
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
    $('#setMode').value = normMode(S.settings.mode);
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
    $('#paper').addEventListener('keydown', onPaperKeydown);
    $('#paper').addEventListener('input', onPaperInput);
    $('#paper').addEventListener('focusout', onPaperFocusOut);
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
      S.settings.mode = normMode(e.target.value); save();
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

    /* 快捷键：1-2 切模式（填空输入框里也能切） */
    document.addEventListener('keydown', e => {
      if (view !== 'recite' || !cur) return;
      const ae = document.activeElement;
      const tag = ae ? ae.tagName : '';
      if (tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (tag === 'INPUT' && !ae.classList.contains('blank-input')) return;
      const map = { 1: 'blank', 2: 'blur' };
      if (map[e.key]) { e.preventDefault(); setMode(map[e.key]); return; }
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
