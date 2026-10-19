// 数据检查：与 app.js 相同的切句规则
import { readFileSync } from 'node:fs';

const src = readFileSync('data/essays.js', 'utf8');
const mod = {};
new Function('window', src)(mod);
const ESSAYS = mod.ESSAYS;

const DOT = '\u0001';
const ABBR = /\b(Mr|Mrs|Ms|Dr|Prof|St|vs|etc|e\.g|i\.e|a\.m|p\.m|No|Fig|Ch)\./g;
const split = text => {
  const out = [];
  String(text).replace(/\r/g, '').replace(ABBR, '$1' + DOT).replace(/(\d)\.(\d)/g, '$1' + DOT + '$2')
    .trim().split(/\n\s*\n+/).forEach(par => {
      par = par.trim();
      if (!par) return;
      par.split(/(?<=[.!?])\s+(?=[A-Z"'“(\[])/).map(t => t.trim()).filter(Boolean)
        .forEach(t => out.push(t.split(DOT).join('.')));
    });
  return out;
};

let problems = 0;
for (const e of ESSAYS) {
  const sents = split(e.en);
  const cn = e.cn || [];
  const bad = [];
  sents.forEach((s, i) => {
    const isClosing = /^(Yours (sincerely|faithfully)|The Students' Union|NOTICE$)/.test(s) || /^Dear .*:$/.test(s);
    if (!/[.!?"\u201d]$/.test(s) && !isClosing) bad.push(`noEnd:${i + 1}:${s.slice(-40)}`);
    if (!e.cn) return;
    const han = (cn[i] || '').replace(/[^\u4e00-\u9fa5]/g, '').length;
    const western = (s.match(/\b(the|and|of|to|in|is|are|we|a|be|you|could|will|if)\b/g) || []).length;
    if (!han && western > 2) bad.push(`noCn:${i + 1} ${s.slice(0, 40)}`);
    else if (western > 6 && han < western * 0.6) bad.push(`shortCn:${i + 1} en=${western} cnLen=${han} | ${(cn[i] || '').slice(0, 28)}`);
  });
  problems += bad.length;
  console.log(`${e.id.padEnd(6)} sents=${String(sents.length).padStart(2)} cn=${String(cn.length).padStart(2)} ${bad.length ? '!! ' + bad.join(' ; ') : 'ok'}`);
}
console.log('total problems:', problems, '| essays:', ESSAYS.length, '| words:', ESSAYS.reduce((a, e) => a + e.en.split(/\s+/).length, 0));
