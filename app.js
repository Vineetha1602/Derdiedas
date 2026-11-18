'use strict';
/* ===== Data ===== */
const CATS = {
  food:['🍽️','Food & drink'], home:['🏠','Home'], body:['💪','Body'], people:['👪','People & family'],
  travel:['🧳','Travel'], city:['🏙️','City'], nature:['🌳','Nature & weather'], time:['⏰','Time'],
  clothes:['👕','Clothes'], work:['💼','Work & school'], animals:['🐾','Animals'], health:['💊','Health'],
  freetime:['🎉','Free time'], shopping:['🛍️','Shopping'], everyday:['✨','Everyday']
};
const W = WORDS.map(r => ({ id:r[0]+' '+r[1], art:r[0], de:r[1], pl:r[2], en:r[3], emoji:r[4], cat:r[5], lvl:r[6], trick:r[7], sDe:r[8], sEn:r[9] }));
const BY_ID = Object.fromEntries(W.map(w => [w.id, w]));
const LEVELS = [...new Set(W.map(w => w.lvl))].sort();

/* Ending rules – checked longest first. "strong" = (almost) no exceptions. */
const RULES = [
  {end:'schaft',art:'die',strong:true},{end:'ismus',art:'der',strong:true},
  {end:'chen',art:'das',strong:true},{end:'lein',art:'das',strong:true},{end:'heit',art:'die',strong:true},{end:'keit',art:'die',strong:true},
  {end:'ment',art:'das'},{end:'ling',art:'der'},
  {end:'ung',art:'die',strong:true},{end:'ion',art:'die'},{end:'tät',art:'die',strong:true},
  {end:'ik',art:'die'},{end:'ei',art:'die',min:5},{end:'ie',art:'die'},{end:'um',art:'das',not:'aum'},
  {end:'e',art:'die',not:'ee',weak:true}
];
function ruleFor(w){
  const s = w.de.toLowerCase();
  for (const r of RULES){
    if (s.endsWith(r.end) && s.length >= (r.min || r.end.length + 2) && !(r.not && s.endsWith(r.not))) return {...r, ok:r.art === w.art};
  }
  return null;
}
function ruleHTML(w){
  const r = ruleFor(w); if (!r) return '';
  const rule = `-${r.end} → <span class="a-${r.art}">${r.art}</span>`;
  if (r.ok) return `<div class="rule ok">✅ Rule: ${rule}${r.weak ? ' (most of the time)' : ''}</div>`;
  let extra = '';
  if (r.end === 'e' && w.art === 'der') extra = ' Male people & animals ending in -e are der (der Junge, der Löwe).';
  return `<div class="rule exc">⚠️ Exception! Usually ${rule}, but this one is <span class="a-${w.art}">${w.art}</span>.${extra}</div>`;
}

/* ===== Storage (safe) ===== */
const store = {
  get(k, d){ try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
};
let P = store.get('dd_progress', {});            // id -> {b:box, due, c:correct, w:wrong}
let FAV = new Set(store.get('dd_fav', []));
let META = Object.assign({streak:0, last:null, art:{der:[0,0],die:[0,0],das:[0,0]}, autoSpeak:true, answered:0, best:{}}, store.get('dd_meta', {}));
if (!META.best) META.best = {};
let FILT = Object.assign({cat:'all', lvl:'all'}, store.get('dd_filter', {}));
const save = () => { store.set('dd_progress', P); store.set('dd_meta', META); store.set('dd_fav', [...FAV]); store.set('dd_filter', FILT); };

/* ===== Spaced repetition (Leitner boxes) ===== */
const MIN = 60e3, DAY = 864e5;
const INTERVAL = [0, 10*MIN, DAY, 3*DAY, 7*DAY, 16*DAY, 35*DAY];
const MASTERED = 4;
function grade(w, ok){
  const p = P[w.id] || {b:0, due:0, c:0, w:0};
  if (ok){ p.b = p.b === 0 ? 2 : Math.min(p.b + 1, 6); p.c++; }
  else { p.b = 1; p.w++; }
  p.due = Date.now() + INTERVAL[p.b];
  P[w.id] = p;
  META.art[w.art][ok ? 0 : 1]++;
  META.answered++;
  touchStreak(); save(); renderStreak();
}
function dayKey(t){ const d = new Date(t); return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(); }
function touchStreak(){
  const t = dayKey(Date.now()); if (META.last === t) return;
  META.streak = (META.last === dayKey(Date.now() - DAY)) ? META.streak + 1 : 1;
  META.last = t;
}
function currentStreak(){
  return (META.last === dayKey(Date.now()) || META.last === dayKey(Date.now() - DAY)) ? META.streak : 0;
}
function renderStreak(){ document.getElementById('streak').textContent = '🔥 ' + currentStreak(); }

function pool(){ return W.filter(w => (FILT.cat === 'all' || w.cat === FILT.cat) && (FILT.lvl === 'all' || w.lvl === FILT.lvl)); }
function counts(ws){
  const now = Date.now(); let due = 0, fresh = 0;
  for (const w of ws){ const p = P[w.id]; if (!p) fresh++; else if (p.due <= now) due++; }
  return {due, fresh};
}
function pickNext(excludeId){
  const now = Date.now(), ws = pool().filter(w => w.id !== excludeId);
  if (!ws.length) return pool()[0];
  const due = ws.filter(w => P[w.id] && P[w.id].due <= now).sort((a,b) => P[a.id].due - P[b.id].due);
  if (due.length) return due[0];
  const fresh = ws.filter(w => !P[w.id]);
  if (fresh.length){
    const lowest = fresh.reduce((m,w) => w.lvl < m ? w.lvl : m, 'Z');
    const easy = fresh.filter(w => w.lvl === lowest);
    return easy[Math.floor(Math.random() * easy.length)];
  }
  // everything scheduled in the future: practise the ones closest to due
  const soon = ws.slice().sort((a,b) => P[a.id].due - P[b.id].due).slice(0, 15);
  return soon[Math.floor(Math.random() * soon.length)];
}

/* ===== Speech (works offline if a German voice is installed) ===== */
let deVoice = null;
function loadVoices(){
  if (!('speechSynthesis' in window)) return;
  const vs = speechSynthesis.getVoices();
  deVoice = vs.find(v => v.lang === 'de-DE' && v.localService) || vs.find(v => v.lang === 'de-DE') || vs.find(v => (v.lang||'').toLowerCase().startsWith('de')) || null;
}
if ('speechSynthesis' in window){ loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
function speak(text){
  if (!('speechSynthesis' in window)) return toast('Audio is not supported in this browser');
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE'; if (deVoice) u.voice = deVoice; u.rate = 0.9;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}

/* ===== Helpers ===== */
const $view = document.getElementById('view');
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const full = w => `<span class="a-${w.art}">${w.art}</span> ${esc(w.de)}`;
const plural = w => w.pl === '—' ? '<span class="muted">no plural</span>' : `<span class="a-die">die</span> ${esc(w.pl)}`;
function toast(msg){ const t = document.getElementById('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), 2200); }
function catOptions(sel){ return `<option value="all">All topics</option>` + Object.entries(CATS).map(([k,[e,n]]) => `<option value="${k}" ${sel===k?'selected':''}>${e} ${n}</option>`).join(''); }
function lvlOptions(sel){ return `<option value="all">All levels</option>` + LEVELS.map(l => `<option ${sel===l?'selected':''}>${l}</option>`).join(''); }
function filtersHTML(){ return `<div class="filters"><select id="fCat">${catOptions(FILT.cat)}</select><select id="fLvl">${lvlOptions(FILT.lvl)}</select></div>`; }
function bindFilters(rerender){
  document.getElementById('fCat').onchange = e => { FILT.cat = e.target.value; save(); rerender(); };
  document.getElementById('fLvl').onchange = e => { FILT.lvl = e.target.value; save(); rerender(); };
}
function detailsHTML(w){
  return `${ruleHTML(w)}
    <div class="trick">💡 ${esc(w.trick)}</div>
    <div class="sentence"><span class="de">${esc(w.sDe)}</span><button class="speak" data-say="${esc(w.sDe)}">🔊</button><br><span class="muted">${esc(w.sEn)}</span></div>`;
}

/* ===== Quiz ===== */
let quizWord = null, quizSession = {right:0, total:0, run:0};
function renderQuiz(){
  if (!quizWord || !pool().some(w => w.id === quizWord.id)) quizWord = pickNext();
  const w = quizWord, c = counts(pool());
  $view.innerHTML = `${filtersHTML()}
    <div class="row muted small" style="justify-content:space-between;margin:0 2px 8px">
      <span>📌 ${c.due} due · 🆕 ${c.fresh} new</span><span>Session: ${quizSession.right}/${quizSession.total}${quizSession.run>2?' · ⚡'+quizSession.run+' in a row':''}</span>
    </div>
    <div class="card q-card">
      <div class="q-emoji">${w.emoji}</div>
      <div class="q-word"><span class="blank">___</span>${esc(w.de)}</div>
      <div class="q-en">${esc(w.en)}</div>
      <div class="art-btns">${['der','die','das'].map(a => `<button class="art-btn ${a}" data-ans="${a}">${a}</button>`).join('')}</div>
      <div id="fb"></div>
    </div>`;
  bindFilters(() => { quizWord = null; renderQuiz(); });
  $view.querySelectorAll('[data-ans]').forEach(b => b.onclick = () => answerQuiz(b.dataset.ans));
}
function answerQuiz(a){
  const w = quizWord, ok = a === w.art;
  grade(w, ok);
  quizSession.total++; if (ok){ quizSession.right++; quizSession.run++; } else { quizSession.run = 0; if (navigator.vibrate) try{ navigator.vibrate(120); }catch(e){} }
  $view.querySelectorAll('[data-ans]').forEach(b => {
    b.disabled = true;
    if (b.dataset.ans === w.art) b.classList.add('right');
    if (b.dataset.ans === a) b.classList.add('picked');
  });
  const blank = $view.querySelector('.blank'); blank.outerHTML = `<span class="a-${w.art}">${w.art}</span> `;
  document.getElementById('fb').innerHTML = `<div class="feedback">
      <div class="verdict">${ok ? '✅ Richtig!' : '❌ Not quite — it\'s ' + full(w)}</div>
      <div class="small">Plural: ${plural(w)} <button class="speak" data-say="${esc(w.art+' '+w.de)}">🔊</button></div>
      ${detailsHTML(w)}
    </div>
    <button class="big-next" id="next">Next →</button>`;
  document.getElementById('next').onclick = () => { quizWord = pickNext(w.id); renderQuiz(); window.scrollTo(0,0); };
  if (META.autoSpeak) speak(w.art + ' ' + w.de);
}

/* ===== Flashcards ===== */
let cardWord = null, cardFlipped = false;
function renderCards(){
  if (!cardWord || !pool().some(w => w.id === cardWord.id)) cardWord = pickNext();
  const w = cardWord, c = counts(pool());
  $view.innerHTML = `${filtersHTML()}
    <div class="muted small" style="margin:0 2px 8px">📌 ${c.due} due · 🆕 ${c.fresh} new · Say the German word <b>with its article</b>, then tap.</div>
    <div class="card flip ${cardFlipped ? 'bl-'+w.art : ''}" id="flip">
      ${cardFlipped ? `
        <div class="q-emoji">${w.emoji}</div>
        <div class="q-word">${full(w)} <button class="speak" data-say="${esc(w.art+' '+w.de)}">🔊</button></div>
        <div class="q-en">${esc(w.en)}</div>
        <div class="small" style="margin-top:6px">Plural: ${plural(w)}</div>
        <div style="text-align:left;width:100%">${detailsHTML(w)}</div>`
      : `<div class="q-emoji">${w.emoji}</div><div class="q-word" style="font-size:28px">${esc(w.en)}</div><div class="hint">Tap to reveal</div>`}
    </div>
    ${cardFlipped ? `<div class="grade-btns"><button data-g="0">😕 Didn't know</button><button data-g="1">😊 Knew it</button></div>` : ''}`;
  bindFilters(() => { cardWord = null; cardFlipped = false; renderCards(); });
  document.getElementById('flip').onclick = e => { if (e.target.closest('[data-say]')) return; if (!cardFlipped){ cardFlipped = true; renderCards(); if (META.autoSpeak) speak(w.art+' '+w.de); } };
  $view.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { grade(w, b.dataset.g === '1'); cardWord = pickNext(w.id); cardFlipped = false; renderCards(); });
}

/* ===== Word list ===== */
let listQ = '', listCat = 'all', listArt = 'all', listFav = false, listHideKnown = false;
function renderWords(){
  $view.innerHTML = `
    <input type="search" id="q" placeholder="Search German or English…" value="${esc(listQ)}" style="width:100%;margin-bottom:10px" autocomplete="off">
    <div class="chips" id="artChips">
      ${['all','der','die','das'].map(a => `<button class="chip ${listArt===a?'on':''} ${a!=='all'?'a-'+a:''}" data-art="${a}" style="font-weight:700">${a==='all'?'All':a}</button>`).join('')}
      <button class="chip ${listFav?'on':''}" data-fav>★ Favourites</button>
      <button class="chip ${listHideKnown?'on':''}" data-hideknown>🙈 Hide known</button>
    </div>
    <div class="chips" id="catChips">
      <button class="chip ${listCat==='all'?'on':''}" data-cat="all">All topics</button>
      ${Object.entries(CATS).map(([k,[e,n]]) => `<button class="chip ${listCat===k?'on':''}" data-cat="${k}">${e} ${n}</button>`).join('')}
    </div>
    <div class="count" id="count"></div>
    <div class="list" id="list"></div>`;
  const q = document.getElementById('q');
  q.oninput = () => { listQ = q.value; drawList(); };
  $view.querySelectorAll('[data-art]').forEach(b => b.onclick = () => { listArt = b.dataset.art; renderWords(); });
  $view.querySelector('[data-fav]').onclick = () => { listFav = !listFav; renderWords(); };
  $view.querySelector('[data-hideknown]').onclick = () => { listHideKnown = !listHideKnown; renderWords(); };
  $view.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { listCat = b.dataset.cat; renderWords(); });
  drawList();
}
function norm(s){ return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/ß/g,'ss'); }
function drawList(){
  const q = norm(listQ.trim());
  const ws = W.filter(w => (listCat==='all'||w.cat===listCat) && (listArt==='all'||w.art===listArt) && (!listFav||FAV.has(w.id))
    && (!q || norm(w.de).includes(q) || norm(w.en).includes(q) || norm(w.pl).includes(q))
    && (!listHideKnown || !(P[w.id] && P[w.id].b >= MASTERED)));
  sheetList = ws.map(w => w.id);
  const nKnown = ws.filter(w => P[w.id] && P[w.id].b >= MASTERED).length, nLearn = ws.filter(w => P[w.id] && P[w.id].b < MASTERED).length;
  document.getElementById('count').textContent = `${ws.length} word${ws.length===1?'':'s'} · 🟢 ${nKnown} known · 🟡 ${nLearn} learning · ⚪ ${ws.length-nKnown-nLearn} new`;
  document.getElementById('list').innerHTML = ws.map(w => {
    const p = P[w.id]; const st = !p ? '⚪' : p.b >= MASTERED ? '🟢' : '🟡';
    return `<button class="item bl-${w.art}" data-open="${esc(w.id)}">
      <span class="em">${w.emoji}</span>
      <span class="grow"><div class="w">${full(w)}</div><div class="e">${esc(w.en)}</div></span>
      <span class="small">${FAV.has(w.id)?'★':''} ${st}</span></button>`;
  }).join('') || `<p class="muted">No words found.</p>`;
}

/* ===== Detail sheet ===== */
let sheetList = [], sheetId = null;
function when(t){
  const d = t - Date.now();
  if (d <= 0) return 'now';
  if (d < 3600e3) return `in ${Math.max(1, Math.round(d/60e3))} min`;
  if (d < DAY) return `in ${Math.round(d/3600e3)} h`;
  const n = Math.round(d/DAY); return `in ${n} day${n===1?'':'s'}`;
}
function statusHTML(p){
  if (!p) return `<div class="status">⚪ <span><b>New</b> — not practised yet</span></div>`;
  const score = p.c + p.w ? ` · ${p.c}✓ ${p.w}✗` : '';
  if (p.b >= MASTERED) return `<div class="status known">🟢 <span><b>Known</b>${score}<br><span class="small">Quick check in the quiz ${when(p.due)}</span></span></div>`;
  return `<div class="status learning">🟡 <span><b>Learning</b>${score}<br><span class="small">Comes up in the quiz ${when(p.due)}</span></span></div>`;
}
function markWord(id, mode){
  const old = P[id] || {c:0, w:0};
  if (mode === 'known'){ P[id] = {b:MASTERED, due:Date.now() + INTERVAL[MASTERED], c:old.c, w:old.w}; toast('🟢 Marked as known'); touchStreak(); renderStreak(); }
  else if (mode === 'learn'){ P[id] = {b:1, due:Date.now(), c:old.c, w:old.w}; toast('🟡 Added to your quiz'); }
  else if (mode === 'reset'){ delete P[id]; toast('Reset to new'); }
  save(); openSheet(id); if (tab === 'words') drawList();
}
function openSheet(id){
  const w = BY_ID[id]; if (!w) return;
  sheetId = id;
  const p = P[w.id], known = p && p.b >= MASTERED;
  const idx = sheetList.indexOf(id);
  document.getElementById('sheetBody').innerHTML = `
    <button class="sheet-x" data-close aria-label="Close">✕</button>
    <div class="sheet-head">
      <div class="q-emoji">${w.emoji}</div>
      <div class="q-word">${full(w)} <button class="speak" data-say="${esc(w.art+' '+w.de)}">🔊</button></div>
      <div class="q-en">${esc(w.en)}</div>
    </div>
    <dl class="kv">
      <dt>Plural</dt><dd>${plural(w)}</dd>
      <dt>Topic</dt><dd>${CATS[w.cat][0]} ${CATS[w.cat][1]}</dd>
      <dt>Level</dt><dd>${w.lvl}</dd>
    </dl>
    ${detailsHTML(w)}
    ${statusHTML(p)}
    <div class="actions">
      ${known ? `<button class="btn" data-mark="learn">🔁 Practise again</button>`
              : `<button class="btn primary" data-mark="known">✅ I know this</button>`}
      ${!p ? `<button class="btn" data-mark="learn">📌 Add to quiz</button>`
           : `<button class="btn" data-mark="reset">↺ Reset to new</button>`}
      <button class="btn" id="favBtn" style="grid-column:1 / -1">${FAV.has(w.id) ? '★ Remove favourite' : '☆ Add to favourites'}</button>
    </div>
    ${idx >= 0 ? `<div class="navrow">
      <button class="btn" data-step="-1" ${idx<=0?'disabled':''}>← Prev</button>
      <span class="small muted">${idx+1} / ${sheetList.length}</span>
      <button class="btn" data-step="1" ${idx>=sheetList.length-1?'disabled':''}>Next →</button>
    </div>` : ''}`;
  document.getElementById('favBtn').onclick = () => { FAV.has(w.id) ? FAV.delete(w.id) : FAV.add(w.id); save(); openSheet(id); if (tab==='words') drawList(); };
  document.querySelectorAll('[data-mark]').forEach(b => b.onclick = () => markWord(id, b.dataset.mark));
  document.querySelectorAll('[data-step]').forEach(b => b.onclick = () => stepSheet(+b.dataset.step));
  const sh = document.getElementById('sheet');
  if (sh.classList.contains('hidden')) sh.classList.remove('hidden');
  document.getElementById('sheetBody').scrollTop = 0;
}
function stepSheet(d){
  const i = sheetList.indexOf(sheetId) + d;
  if (i >= 0 && i < sheetList.length) openSheet(sheetList[i]);
}
function closeSheet(){ document.getElementById('sheet').classList.add('hidden'); sheetId = null; }

/* ===== Tricks ===== */
function renderTricks(){
  const ex = (a, w) => `<span class="a-${a}">${a}</span> ${w}`;
  $view.innerHTML = `
  <div class="card">
    <h2>1. The colour code</h2>
    <p>Never learn a noun without its article. This app always shows <b class="a-der">der = blue</b>, <b class="a-die">die = red</b>, <b class="a-das">das = green</b>. Your memory links the colour to the word.</p>
  </div>
  <div class="card">
    <h2>2. The three characters</h2>
    <div class="mascots">
      <div class="bg-der"><span>🦁</span><span class="a-der" style="font-size:18px">der</span>the lion</div>
      <div class="bg-die"><span>👑</span><span class="a-die" style="font-size:18px">die</span>the queen</div>
      <div class="bg-das"><span>👶</span><span class="a-das" style="font-size:18px">das</span>the baby</div>
    </div>
    <p>Imagine the word <b>doing something with its character</b>. The sillier the picture, the better you remember it: a lion crunching <i>der Apfel</i>, a queen peeling <i>die Banane</i>, a baby splashing in <i>das Wasser</i>.</p>
  </div>
  <div class="card">
    <h2>3. Ending rules</h2>
    <table class="rules">
      <tr><th>Ending</th><th>Article</th><th>Examples</th></tr>
      <tr><td>-ung, -heit, -keit, -schaft</td><td class="a-die"><b>die</b> (always)</td><td>die Zeitung, die Freiheit</td></tr>
      <tr><td>-ion, -tät, -ik, -ei, -ie</td><td class="a-die"><b>die</b></td><td>die Information, die Musik, die Bäckerei</td></tr>
      <tr><td>-e</td><td class="a-die"><b>die</b> (~90%)</td><td>die Tasse, die Straße</td></tr>
      <tr><td>-in (female person)</td><td class="a-die"><b>die</b></td><td>die Lehrerin, die Freundin</td></tr>
      <tr><td>-chen, -lein</td><td class="a-das"><b>das</b> (always)</td><td>das Brötchen, das Mädchen</td></tr>
      <tr><td>-ment, -um</td><td class="a-das"><b>das</b></td><td>das Medikament, das Museum</td></tr>
      <tr><td>verb used as noun</td><td class="a-das"><b>das</b></td><td>das Essen, das Leben</td></tr>
      <tr><td>-ling, -ismus</td><td class="a-der"><b>der</b></td><td>der Frühling</td></tr>
    </table>
  </div>
  <div class="card">
    <h2>4. Meaning groups</h2>
    <p>${ex('der','')}: male people & animals, days, months, seasons, weather, most drinks, most cars, compass points.<br>
    <i>der Montag, der Mai, der Sommer, der Regen, der Kaffee</i></p>
    <p>${ex('die','')}: female people & animals, most flowers & trees, numbers as nouns.<br>
    <i>die Mutter, die Kuh, die Rose, die Eins</i></p>
    <p>${ex('das','')}: babies/young, metals, colours as nouns, hotels/cafés/cinemas, most English loanwords.<br>
    <i>das Kind, das Gold, das Blau, das Kino, das Handy</i></p>
  </div>
  <div class="card">
    <h2>5. Compound words: the last word decides</h2>
    <p><span class="a-das">das</span> Haus + <span class="a-die">die</span> Tür → <b class="a-die">die</b> Haustür<br>
    <span class="a-die">die</span> Hand + <span class="a-der">der</span> Schuh → <b class="a-der">der</b> Handschuh<br>
    <span class="a-der">der</span> Mittag + <span class="a-das">das</span> Essen → <b class="a-das">das</b> Mittagessen</p>
    <p class="muted small">So once you know a short word, you know hundreds of long ones.</p>
  </div>
  <div class="card">
    <h2>6. The plural is always <span class="a-die">die</span></h2>
    <p>der Apfel → <span class="a-die">die</span> Äpfel · das Kind → <span class="a-die">die</span> Kinder. One less thing to memorise!</p>
  </div>
  <div class="card">
    <h2>7. Famous exceptions</h2>
    <p><span class="a-das">das</span> Mädchen (girl, because -chen) · <span class="a-der">der</span> Junge · <span class="a-der">der</span> Name · <span class="a-der">der</span> Käse · <span class="a-das">das</span> Auge · <span class="a-das">das</span> Ende · <span class="a-die">die</span> Nacht · <span class="a-das">das</span> Jahr · <span class="a-der">der</span> See (lake) vs <span class="a-die">die</span> See (sea)</p>
    <p class="muted small">Exceptions are marked with ⚠️ in the quiz.</p>
  </div>`;
}

/* ===== Stats ===== */
let resetArmed = false;
function renderStats(){
  const total = W.length;
  let mastered = 0, learning = 0;
  for (const w of W){ const p = P[w.id]; if (p){ p.b >= MASTERED ? mastered++ : learning++; } }
  const acc = a => { const [r,x] = META.art[a]; return r+x ? Math.round(100*r/(r+x)) : null; };
  const all = ['der','die','das'].reduce((s,a) => [s[0]+META.art[a][0], s[1]+META.art[a][1]], [0,0]);
  const accAll = all[0]+all[1] ? Math.round(100*all[0]/(all[0]+all[1])) : 0;
  const weakest = ['der','die','das'].filter(a => acc(a) !== null).sort((a,b) => acc(a)-acc(b))[0];
  const catRows = Object.entries(CATS).map(([k,[e,n]]) => {
    const ws = W.filter(w => w.cat === k), m = ws.filter(w => P[w.id] && P[w.id].b >= MASTERED).length;
    return `<div class="catrow"><span>${e} ${n}</span><div class="bar"><i style="width:${Math.round(100*m/ws.length)}%"></i></div><span class="muted">${m}/${ws.length}</span></div>`;
  }).join('');
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  $view.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><b>${mastered}</b><span class="small muted">🟢 known</span></div>
      <div class="stat"><b>${learning}</b><span class="small muted">🟡 learning</span></div>
      <div class="stat"><b>${total - mastered - learning}</b><span class="small muted">⚪ new</span></div>
      <div class="stat"><b>🔥 ${currentStreak()}</b><span class="small muted">day streak</span></div>
      <div class="stat"><b>${accAll}%</b><span class="small muted">accuracy</span></div>
      <div class="stat"><b>${META.answered}</b><span class="small muted">answers</span></div>
    </div>
    <div class="card" style="margin-top:12px">
      <h3 style="margin-top:0">Accuracy by article</h3>
      ${['der','die','das'].map(a => `<div class="catrow"><b class="a-${a}">${a}</b><div class="bar"><i style="width:${acc(a)||0}%;background:var(--${a})"></i></div><span class="muted">${acc(a)===null?'–':acc(a)+'%'}</span></div>`).join('')}
      ${weakest && all[0]+all[1] >= 15 ? `<p class="small muted">Your weakest article is <b class="a-${weakest}">${weakest}</b>. Try filtering the word list by it.</p>` : ''}
    </div>
    <div class="card"><h3 style="margin-top:0">Known words by topic</h3>${catRows}
      <p class="small muted">🟢 A word becomes <b>known</b> after 3 correct answers spread over a few days (the quiz brings it back after 1 day, then 3 days), or straight away when you tap <b>✅ I know this</b> on the word. Known words come back for a quick check after a week, then less and less often. A wrong answer moves a word back to 🟡 learning.</p></div>
    <div class="card">
      <h3 style="margin-top:0">Settings</h3>
      <label class="toggle"><span>🔊 Speak the word after answering</span><input type="checkbox" id="autoSpeak" ${META.autoSpeak?'checked':''}></label>
      <p class="small muted">${deVoice ? `German voice: ${esc(deVoice.name)}` : 'No German voice found. On Android: Settings → Text-to-speech → install German. On iPhone: Settings → Accessibility → Spoken Content → Voices → German.'}</p>
      ${isStandalone ? '<p class="small">✅ Installed as an app.</p>' : `<p class="small"><b>Install for offline use:</b> Android/Chrome: menu ⋮ → <i>Add to Home screen</i> / <i>Install app</i>. iPhone/Safari: Share ⬆️ → <i>Add to Home Screen</i>.</p>`}
      <button class="btn full" id="installBtn" style="display:${deferredInstall?'block':'none'};margin-bottom:8px">📲 Install app</button>
      <button class="btn full danger" id="reset">${resetArmed ? 'Tap again to erase all progress' : 'Reset progress'}</button>
    </div>
    <p class="small muted" style="text-align:center">${total} words · works offline</p>`;
  document.getElementById('autoSpeak').onchange = e => { META.autoSpeak = e.target.checked; save(); };
  document.getElementById('reset').onclick = () => {
    if (!resetArmed){ resetArmed = true; renderStats(); setTimeout(() => { resetArmed = false; if (tab==='stats') renderStats(); }, 4000); return; }
    P = {}; META.art = {der:[0,0],die:[0,0],das:[0,0]}; META.answered = 0; META.streak = 0; META.last = null; resetArmed = false; save(); renderStreak(); renderStats(); toast('Progress reset');
  };
  const ib = document.getElementById('installBtn');
  ib.onclick = async () => { if (!deferredInstall) return; deferredInstall.prompt(); try { await deferredInstall.userChoice; } catch(e){} deferredInstall = null; renderStats(); };
}


/* ===== Games ===== */
let curGame = null, gameTimer = null, gameRAF = null, gameTO = [];
function later(fn, ms){ const t = setTimeout(fn, ms); gameTO.push(t); return t; }
function stopGame(){
  clearInterval(gameTimer); gameTimer = null;
  if (gameRAF) cancelAnimationFrame(gameRAF); gameRAF = null;
  gameTO.forEach(clearTimeout); gameTO = []; curGame = null;
}
function gamePool(min){ const ws = pool(); return ws.length >= (min || 8) ? ws : W; }
function gameWord(avoid, min){
  const ws = gamePool(min), set = new Set(avoid || []);
  let c = ws.filter(w => !set.has(w.id)); if (!c.length) c = ws;
  return c[Math.floor(Math.random() * c.length)];
}
function remember(arr, id, n){ arr.push(id); while (arr.length > (n || 10)) arr.shift(); }
const fmtTime = ms => { const s = Math.max(0, Math.round(ms/1000)); return Math.floor(s/60) + ':' + String(s%60).padStart(2,'0'); };
const hearts = n => '❤️'.repeat(Math.max(0,n)) + '🤍'.repeat(Math.max(0, 3-n));
function buzz(){ if (navigator.vibrate) try { navigator.vibrate(120); } catch(e){} }
function confetti(){
  const box = document.createElement('div'); box.className = 'confetti';
  const bits = ['🎉','⭐','🟦','🟥','🟩','✨'];
  for (let i = 0; i < 40; i++){
    const s = document.createElement('span'); s.textContent = bits[i % bits.length];
    s.style.left = Math.random()*100 + 'vw'; s.style.animationDelay = Math.random()*0.7 + 's'; s.style.fontSize = (14 + Math.random()*18) + 'px';
    box.appendChild(s);
  }
  document.body.appendChild(box); setTimeout(() => box.remove(), 3500);
}

const GAMES = {
  drive:{emoji:'🏎️', name:'Article Drive', desc:'A target article flashes up — steer through words with that article, dodge the rest. It switches without warning and gets faster every 15 seconds. 60 seconds!', best:v => 'Best score ' + v},
  ladder:{emoji:'🧗', name:'Article Ladder', desc:'Climb 10 rungs to the trophy. Right answer = up one, wrong = slip down. 3 right in a row = 🚀 double jump!', best:v => 'Best time ' + fmtTime(v)},
  crush:{emoji:'🍬', name:'Article Crush', desc:'Tap 3 words that share the same article to pop them. Combos score more, every pop adds time. 3 lives, 60 seconds.', best:v => 'Best score ' + v},
  rush:{emoji:'⚡', name:'Article Rush', desc:'Words fall from the sky — hit der, die or das before they land. It gets faster and faster!', best:v => 'Best score ' + v}
};
function renderGames(){
  curGame = null;
  $view.innerHTML = `${filtersHTML()}
    <p class="small muted" style="margin:0 2px 10px">Games use the topic & level you pick above. Drive, Ladder and Rush answers also count towards your progress.</p>
    ${Object.entries(GAMES).map(([k,g]) => `
      <div class="card game-card">
        <div class="g-emoji">${g.emoji}</div>
        <div class="grow">
          <div class="g-name">${g.name}</div>
          <div class="small muted">${g.desc}</div>
          <div class="small" style="margin-top:4px">🏅 ${META.best[k] != null ? g.best(META.best[k]) : 'Not played yet'}</div>
        </div>
        <button class="btn primary-dark" data-play="${k}">Play</button>
      </div>`).join('')}`;
  bindFilters(renderGames);
}
function startGame(k){ stopGame(); curGame = k; ({drive:startDrive, ladder:startLadder, crush:startCrush, rush:startRush})[k](); window.scrollTo(0,0); }

function saveBest(game, value, lowerIsBetter){
  const old = META.best[game];
  const rec = old == null || (lowerIsBetter ? value < old : value > old);
  if (rec){ META.best[game] = value; save(); }
  return {rec, best: META.best[game], old};
}
function showResult(game, o){
  stopGame();
  if (o.rec) confetti();
  const uniq = [...new Map((o.mistakes||[]).map(w => [w.id, w])).values()];
  $view.innerHTML = `
    <div class="card" style="text-align:center">
      <div style="font-size:60px">${o.emoji}</div>
      <h2>${o.title}</h2>
      <div class="big-score">${o.big}</div>
      <p class="muted">${o.sub}</p>
      ${o.rec ? '<p><b>🏅 New personal best!</b></p>' : `<p class="small muted">Your best: ${GAMES[game].best(o.best)}</p>`}
      <button class="big-next" data-play="${game}">🔁 Play again</button>
      <button class="btn full" data-quit style="margin-top:8px">← All games</button>
    </div>
    ${uniq.length ? `<div class="card"><h3 style="margin-top:0">Words to review</h3>
      <div class="list">${uniq.map(w => `<button class="item bl-${w.art}" data-open="${esc(w.id)}"><span class="em">${w.emoji}</span><span class="grow"><div class="w">${full(w)}</div><div class="e">${esc(w.en)}</div></span></button>`).join('')}</div></div>` : ''}`;
}


/* --- 🏎️ Drive --- */
const DRIVE_TIME = 60e3;
const CAR_SVG = `<svg viewBox="0 0 44 76" width="44" height="76" aria-hidden="true">
  <rect x="1" y="11" width="8" height="16" rx="3" fill="#111"/><rect x="35" y="11" width="8" height="16" rx="3" fill="#111"/>
  <rect x="1" y="50" width="8" height="16" rx="3" fill="#111"/><rect x="35" y="50" width="8" height="16" rx="3" fill="#111"/>
  <rect x="5" y="2" width="34" height="72" rx="12" fill="#f59e0b"/><rect x="9" y="6" width="26" height="64" rx="9" fill="#fbbf24"/>
  <rect x="10" y="17" width="24" height="14" rx="4" fill="#bae6fd"/><rect x="10" y="52" width="24" height="10" rx="3" fill="#bae6fd"/>
  <rect x="9" y="3" width="7" height="4" rx="2" fill="#fffbe6"/><rect x="28" y="3" width="7" height="4" rx="2" fill="#fffbe6"/></svg>`;
let dv = null;
const ARTS = ['der','die','das'];
function randArt(not){ const a = ARTS.filter(x => x !== not); return a[Math.floor(Math.random() * a.length)]; }
function startDrive(){
  dv = {lane:1, objs:[], score:0, combo:0, caught:0, wrongHits:0, left:DRIVE_TIME, el:0, prev:0, nextSpawn:700,
        target:randArt(), nextSwitch:9000, recent:[], mistakes:[], dash:0, level:1};
  $view.innerHTML = `
    <div class="game-top"><button class="btn" data-quit>←</button><span>⏱ <b id="dvTime">1:00</b></span><span>⭐ <b id="dvScore">0</b></span><span id="dvCombo" class="small"></span></div>
    <div class="drive-sign" id="dvSign"></div>
    <div class="road" id="road">
      <div class="lane-line" style="left:33.33%"></div><div class="lane-line" style="left:66.66%"></div>
      <div id="dvObjs"></div>
      <div class="car" id="car">${CAR_SVG}</div>
      <div class="drive-pop" id="dvPop"></div>
      <div class="drive-banner" id="dvBanner"></div>
    </div>
    <div class="drive-ctrl"><button class="btn" id="stL" aria-label="Left">◀</button><button class="btn" id="stR" aria-label="Right">▶</button></div>`;
  setSign(true); placeCar();
  const road = document.getElementById('road');
  road.addEventListener('pointerdown', e => { const r = road.getBoundingClientRect(); steer(e.clientX - r.left < r.width/2 ? -1 : 1); });
  document.getElementById('stL').addEventListener('pointerdown', e => { e.preventDefault(); steer(-1); });
  document.getElementById('stR').addEventListener('pointerdown', e => { e.preventDefault(); steer(1); });
  banner('Ready… GO! 🏁');
  dv.prev = performance.now(); gameRAF = requestAnimationFrame(driveLoop);
}
function setSign(first){
  const el = document.getElementById('dvSign'); if (!el) return;
  el.innerHTML = `<span>Drive through</span><span class="tgt ${dv.target}">${dv.target.toUpperCase()}</span><span>words</span>`;
  if (!first){ el.classList.remove('switch'); void el.offsetWidth; el.classList.add('switch'); banner(`SWITCH → ${dv.target.toUpperCase()}`); }
}
function banner(txt){ const b = document.getElementById('dvBanner'); if (!b) return; b.textContent = txt; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
function popText(txt, good){
  const p = document.getElementById('dvPop'); if (!p) return;
  p.textContent = txt; p.className = 'drive-pop ' + (good ? 'good' : 'bad'); p.style.left = ((dv.lane + 0.5) * 100 / 3) + '%';
  void p.offsetWidth; p.classList.add('show');
}
function placeCar(){ const c = document.getElementById('car'); if (c) c.style.left = ((dv.lane + 0.5) * 100 / 3) + '%'; }
function steer(d){ if (!dv || curGame !== 'drive') return; dv.lane = Math.max(0, Math.min(2, dv.lane + d)); placeCar(); }
function driveWord(art){
  let c = gamePool(20).filter(w => w.art === art && !dv.recent.includes(w.id));
  if (!c.length) c = W.filter(w => w.art === art && !dv.recent.includes(w.id));
  const w = c[Math.floor(Math.random() * c.length)]; remember(dv.recent, w.id, 25); return w;
}
function spawnRow(W_){
  const two = (dv.level >= 3 && Math.random() < 0.55) || (dv.level === 2 && Math.random() < 0.3);
  const lanes = [0,1,2].sort(() => Math.random() - 0.5).slice(0, two ? 2 : 1);
  const arts = two ? [dv.target, randArt(dv.target)] : [Math.random() < 0.55 ? dv.target : randArt(dv.target)];
  const box = document.getElementById('dvObjs');
  lanes.forEach((lane, i) => {
    const w = driveWord(arts[i]);
    const el = document.createElement('div');
    el.className = 'sign-obj';
    el.style.left = `calc(${lane * 100/3}% + 6px)`; el.style.width = `calc(${100/3}% - 12px)`;
    el.innerHTML = `<span class="se">${w.emoji}</span><span class="sw">${esc(w.de)}</span>`;
    box.appendChild(el);
    dv.objs.push({w, lane, y:-70, el, h:el.offsetHeight || 56, done:false});
  });
}
function driveHit(o){
  o.done = true;
  const w = o.w, ok = w.art === dv.target;
  o.el.classList.add('g-' + w.art, ok ? 'got' : 'crash');
  o.el.querySelector('.sw').innerHTML = `<small>${w.art}</small> ${esc(w.de)}`;
  grade(w, ok);
  if (ok){
    dv.combo++; dv.caught++;
    const pts = 10 + 5 * Math.min(dv.combo - 1, 6);
    dv.score += pts; popText('+' + pts, true);
  } else {
    dv.combo = 0; dv.wrongHits++; dv.left -= 3000; dv.mistakes.push(w); buzz();
    popText(`✗ ${w.art} ${w.de}  −3s`, false);
    const car = document.getElementById('car'); car.classList.remove('crash'); void car.offsetWidth; car.classList.add('crash');
  }
}
function driveLoop(t){
  if (curGame !== 'drive') return;
  const dt = Math.min(t - dv.prev, 50); dv.prev = t; dv.el += dt; dv.left -= dt;
  const road = document.getElementById('road'); if (!road) return;
  const H = road.clientHeight;
  const prog = Math.min(1, dv.el / DRIVE_TIME);
  const speed = H * (0.30 + 0.65 * prog) / 1000;            // px per ms: ~3.3s → ~1.05s to cross the road
  const lvl = Math.min(4, 1 + Math.floor(dv.el / 15000));
  if (lvl > dv.level){ dv.level = lvl; banner(`Level ${lvl} 🔥`); }
  dv.nextSwitch -= dt;
  if (dv.nextSwitch <= 0){
    dv.target = randArt(dv.target);
    dv.nextSwitch = Math.max(4000, 9000 - 1700 * (dv.level - 1)) + Math.random() * 2000;
    dv.objs.forEach(o => { if (!o.done && o.y > H * 0.5){ o.done = true; o.el.classList.add('fade'); } });
    setSign(false);
  }
  dv.nextSpawn -= dt;
  if (dv.nextSpawn <= 0){ spawnRow(); dv.nextSpawn = Math.max(480, 1250 - 230 * (dv.level - 1)) * (0.85 + Math.random() * 0.3); }
  const carBottom = H - 12, carTop = carBottom - 76;
  for (const o of dv.objs){
    o.y += speed * dt;
    o.el.style.transform = `translateY(${o.y}px)`;
    if (!o.done && o.lane === dv.lane && o.y + o.h >= carTop + 12 && o.y <= carBottom - 12) driveHit(o);
    if (!o.done && o.y > carBottom){ o.done = true; if (o.w.art === dv.target) dv.combo = 0; }
  }
  dv.objs = dv.objs.filter(o => { if (o.y > H + 10){ o.el.remove(); return false; } return true; });
  dv.dash = (dv.dash + speed * dt) % 64;
  road.style.setProperty('--dash', dv.dash + 'px');
  document.getElementById('dvTime').textContent = fmtTime(dv.left);
  document.getElementById('dvScore').textContent = dv.score;
  document.getElementById('dvCombo').textContent = dv.combo >= 2 ? '🔥 x' + dv.combo : 'Lvl ' + dv.level;
  if (dv.left <= 0){
    const r = saveBest('drive', dv.score, false);
    showResult('drive', {emoji:'🏁', title:"Time's up!", big:dv.score + ' pts', sub:`${dv.caught} caught · ${dv.wrongHits} wrong · reached level ${dv.level}`, rec:r.rec && dv.score > 0, best:r.best, mistakes:dv.mistakes});
    return;
  }
  gameRAF = requestAnimationFrame(driveLoop);
}

/* --- 🧗 Ladder --- */
const LAD_TOP = 10;
let lad = null;
function startLadder(){
  lad = {pos:0, wrong:0, run:0, start:Date.now(), recent:[], w:null, busy:false, mistakes:[], msg:''};
  lad.w = gameWord(lad.recent); remember(lad.recent, lad.w.id);
  drawLadder();
  gameTimer = setInterval(() => { const el = document.getElementById('ladTime'); if (el) el.textContent = fmtTime(Date.now() - lad.start); }, 250);
}
function drawLadder(reveal){
  const w = lad.w;
  const rungs = Array.from({length:LAD_TOP+1}, (_,k) => LAD_TOP - k).map(i => `
    <div class="rung ${i < lad.pos ? 'done' : ''} ${i === lad.pos ? 'here' : ''}">
      ${i === LAD_TOP ? '<span class="trophy">🏆</span>' : ''}${i === lad.pos ? '<span class="climber">🧗</span>' : ''}<span class="rn">${i}</span>
    </div>`).join('');
  $view.innerHTML = `
    <div class="game-top"><button class="btn" data-quit>←</button><span>⏱ <b id="ladTime">${fmtTime(Date.now()-lad.start)}</b></span><span>❌ ${lad.wrong}</span><span>${lad.run >= 2 ? '🔥 ' + lad.run : ''}</span></div>
    <div class="lad-wrap">
      <div class="ladder">${rungs}</div>
      <div class="card lad-q ${reveal ? 'bl-' + w.art : ''}">
        <div class="q-emoji" style="font-size:56px">${w.emoji}</div>
        <div class="q-word" style="font-size:26px">${reveal ? `<span class="a-${w.art}">${w.art}</span> ` : ''}${esc(w.de)}</div>
        <div class="q-en">${esc(w.en)}</div>
        <div class="art-col">${['der','die','das'].map(a => `<button class="art-btn ${a}" data-gans="${a}" ${lad.busy ? 'disabled' : ''}>${a}</button>`).join('')}</div>
        <div class="gmsg">${lad.msg}</div>
      </div>
    </div>`;
}
function answerLadder(a){
  if (lad.busy) return;
  const w = lad.w, ok = a === w.art;
  grade(w, ok);
  lad.busy = true;
  if (ok){
    lad.run++;
    const jump = lad.run % 3 === 0 ? 2 : 1;
    lad.pos = Math.min(LAD_TOP, lad.pos + jump);
    lad.msg = jump === 2 ? '🚀 Double jump!' : '✅ Richtig!';
  } else {
    lad.run = 0; lad.wrong++; lad.mistakes.push(w); buzz();
    lad.pos = Math.max(0, lad.pos - 1);
    lad.msg = `❌ It's ${full(w)}`;
  }
  drawLadder(true);
  if (META.autoSpeak && !ok) speak(w.art + ' ' + w.de);
  later(() => {
    if (lad.pos >= LAD_TOP){
      const t = Date.now() - lad.start, r = saveBest('ladder', t, true);
      showResult('ladder', {emoji:'🏆', title:'You reached the top!', big:fmtTime(t), sub:`${lad.wrong} mistake${lad.wrong===1?'':'s'}`, rec:r.rec, best:r.best, mistakes:lad.mistakes});
      return;
    }
    lad.w = gameWord(lad.recent); remember(lad.recent, lad.w.id);
    lad.busy = false; lad.msg = ''; drawLadder();
  }, ok ? 550 : 1600);
}

/* --- 🍬 Crush --- */
const CRUSH_N = 16, CRUSH_TIME = 60e3;
let cr = null;
function startCrush(){
  cr = {tiles:[], sel:[], fx:{}, drop:{}, score:0, combo:0, lives:3, left:CRUSH_TIME, last:Date.now(), busy:false, mistakes:[], pops:0, msg:'Find 3 words with the <b>same article</b>'};
  for (let i = 0; i < CRUSH_N; i++) cr.tiles.push(gameWord(cr.tiles.map(t => t.id), 20));
  drawCrush();
  gameTimer = setInterval(() => {
    const now = Date.now(); cr.left -= Math.min(now - cr.last, 500); cr.last = now;
    const el = document.getElementById('crTime'); if (el) el.textContent = fmtTime(cr.left);
    if (cr.left <= 0) endCrush('⏰ Time\'s up!');
  }, 200);
}
function drawCrush(){
  $view.innerHTML = `
    <div class="game-top"><button class="btn" data-quit>←</button><span>${hearts(cr.lives)}</span><span>⏱ <b id="crTime">${fmtTime(cr.left)}</b></span><span>⭐ <b>${cr.score}</b></span></div>
    <div class="gmsg" style="text-align:center;min-height:24px;margin-bottom:8px">${cr.msg}${cr.combo >= 2 ? ` · <b>Combo x${cr.combo}</b>` : ''}</div>
    <div class="crush-grid" lang="de">${cr.tiles.map((w,i) => {
      const fx = cr.fx[i], sel = cr.sel.includes(i);
      return `<button class="tile ${sel ? 'sel' : ''} ${fx ? fx + ' bg-' + w.art : ''} ${cr.drop[i] ? 'drop' : ''}" data-tile="${i}">
        <span class="te">${w.emoji}</span><span>${fx ? `<span class="tart a-${w.art}">${w.art}</span><br>` : ''}${esc(w.de)}</span></button>`;
    }).join('')}</div>`;
  cr.drop = {};
}
function tapTile(i){
  if (!cr || cr.busy || curGame !== 'crush') return;
  const k = cr.sel.indexOf(i);
  if (k >= 0) cr.sel.splice(k, 1); else cr.sel.push(i);
  if (cr.sel.length < 3){ drawCrush(); return; }
  const picked = cr.sel.map(j => cr.tiles[j]);
  const ok = picked.every(w => w.art === picked[0].art);
  cr.busy = true;
  if (ok){
    cr.combo++; cr.pops++;
    const pts = 30 + (cr.combo - 1) * 15;
    cr.score += pts; cr.left += 3000;
    cr.msg = `✅ ${picked[0].art.toUpperCase()}! +${pts} · +3s`;
    cr.sel.forEach(j => cr.fx[j] = 'ok');
    drawCrush();
    touchStreak(); renderStreak();
    later(() => {
      const keep = cr.tiles.filter((_,j) => !cr.sel.includes(j)).map(t => t.id);
      cr.sel.forEach(j => { cr.tiles[j] = gameWord(keep.concat(cr.tiles.map(t => t.id)), 20); keep.push(cr.tiles[j].id); cr.drop[j] = true; });
      cr.sel = []; cr.fx = {}; cr.busy = false; drawCrush();
    }, 650);
  } else {
    cr.combo = 0; cr.lives--; buzz();
    picked.forEach(w => cr.mistakes.push(w));
    cr.msg = '❌ Not the same article — look:';
    cr.sel.forEach(j => cr.fx[j] = 'bad');
    drawCrush();
    later(() => {
      cr.sel = []; cr.fx = {}; cr.busy = false; cr.msg = 'Find 3 words with the <b>same article</b>';
      if (cr.lives <= 0) endCrush('💔 Out of lives'); else drawCrush();
    }, 1800);
  }
}
function endCrush(why){
  if (curGame !== 'crush') return;
  const r = saveBest('crush', cr.score, false);
  showResult('crush', {emoji:'🍬', title:why, big:cr.score + ' pts', sub:`${cr.pops} triple${cr.pops===1?'':'s'} popped`, rec:r.rec && cr.score > 0, best:r.best, mistakes:cr.mistakes});
}

/* --- ⚡ Rush --- */
let ru = null;
function startRush(){
  ru = {score:0, lives:3, dur:6000, w:null, el:0, prev:0, recent:[], busy:true, mistakes:[]};
  $view.innerHTML = `
    <div class="game-top"><button class="btn" data-quit>←</button><span id="ruLives">${hearts(3)}</span><span>⭐ <b id="ruScore">0</b></span><span id="ruSpeed" class="small muted"></span></div>
    <div class="arena" id="arena"><div class="faller" id="faller"></div><div class="floor"></div></div>
    <div class="art-btns">${['der','die','das'].map(a => `<button class="art-btn ${a}" data-gans="${a}">${a}</button>`).join('')}</div>
    <div class="gmsg" id="ruMsg" style="text-align:center;min-height:24px"></div>`;
  later(nextRush, 400);
}
function nextRush(){
  if (curGame !== 'rush') return;
  ru.w = gameWord(ru.recent); remember(ru.recent, ru.w.id, 15);
  const f = document.getElementById('faller');
  f.className = 'faller'; f.innerHTML = `<div style="font-size:34px">${ru.w.emoji}</div><div class="fw">${esc(ru.w.de)}</div><div class="small muted">${esc(ru.w.en)}</div>`;
  document.getElementById('ruSpeed').textContent = (6000 / ru.dur).toFixed(1) + '× speed';
  ru.el = 0; ru.prev = performance.now(); ru.busy = false;
  const loop = t => {
    if (curGame !== 'rush') return;
    ru.el += Math.min(t - ru.prev, 50); ru.prev = t;
    const arena = document.getElementById('arena'); if (!arena) return;
    const max = arena.clientHeight - f.offsetHeight - 6, p = Math.min(1, ru.el / ru.dur);
    f.style.transform = `translate(-50%, ${p * max}px)`;
    if (p >= 1){ missRush(null); return; }
    gameRAF = requestAnimationFrame(loop);
  };
  gameRAF = requestAnimationFrame(loop);
}
function answerRush(a){ if (!ru || ru.busy) return; missRush(a); }
function missRush(a){
  ru.busy = true; if (gameRAF) cancelAnimationFrame(gameRAF);
  const w = ru.w, ok = a === w.art, f = document.getElementById('faller'), msg = document.getElementById('ruMsg');
  grade(w, ok);
  f.classList.add('bg-' + w.art, ok ? 'hit' : 'miss');
  f.querySelector('.fw').innerHTML = full(w);
  if (ok){
    ru.score++; ru.dur = Math.max(1700, ru.dur * 0.94);
    document.getElementById('ruScore').textContent = ru.score;
    msg.innerHTML = ru.score % 10 === 0 ? `🔥 ${ru.score} in the bag!` : '✅';
    later(nextRush, 280);
  } else {
    ru.lives--; ru.mistakes.push(w); buzz();
    document.getElementById('ruLives').textContent = hearts(ru.lives);
    msg.innerHTML = (a ? '❌ ' : '⏰ Too slow! ') + `It's ${full(w)}`;
    if (META.autoSpeak) speak(w.art + ' ' + w.de);
    later(() => {
      if (ru.lives > 0){ msg.innerHTML = ''; nextRush(); return; }
      const r = saveBest('rush', ru.score, false);
      showResult('rush', {emoji:'⚡', title:'Game over', big:ru.score + ' words', sub:`Top speed ${(6000/ru.dur).toFixed(1)}×`, rec:r.rec && ru.score > 0, best:r.best, mistakes:ru.mistakes});
    }, 1600);
  }
}

/* ===== Navigation ===== */
const VIEWS = {quiz:renderQuiz, games:renderGames, cards:renderCards, words:renderWords, tricks:renderTricks, stats:renderStats};
let tab = 'quiz';
function go(t){
  stopGame();
  tab = t;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  VIEWS[t](); window.scrollTo(0,0);
}
document.querySelector('.tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) go(b.dataset.tab); };
document.addEventListener('click', e => {
  const say = e.target.closest('[data-say]'); if (say){ e.stopPropagation(); speak(say.dataset.say); return; }
  const open = e.target.closest('[data-open]'); if (open){ openSheet(open.dataset.open); return; }
  if (e.target.closest('[data-close]')) { closeSheet(); return; }
  const play = e.target.closest('[data-play]'); if (play){ startGame(play.dataset.play); return; }
  const quit = e.target.closest('[data-quit]'); if (quit){ stopGame(); renderGames(); window.scrollTo(0,0); return; }
  const ga = e.target.closest('[data-gans]'); if (ga && !ga.disabled){ if (curGame === 'ladder') answerLadder(ga.dataset.gans); else if (curGame === 'rush') answerRush(ga.dataset.gans); return; }
  const tile = e.target.closest('[data-tile]'); if (tile){ tapTile(+tile.dataset.tile); return; }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeSheet();
  if (sheetId && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) stepSheet(e.key === 'ArrowRight' ? 1 : -1);
  if (curGame === 'drive'){
    if (e.key === 'ArrowLeft' || e.key === 'a'){ e.preventDefault(); steer(-1); }
    if (e.key === 'ArrowRight' || e.key === 'd'){ e.preventDefault(); steer(1); }
  }
  if (tab === 'games' && curGame && document.getElementById('sheet').classList.contains('hidden')){
    const map = {'1':'der','2':'die','3':'das'}; const b = map[e.key] && $view.querySelector(`[data-gans="${map[e.key]}"]:not([disabled])`);
    if (b) b.click();
  }
  if (tab === 'quiz' && document.getElementById('sheet').classList.contains('hidden')){
    const map = {'1':'der','2':'die','3':'das'}; const b = map[e.key] && $view.querySelector(`[data-ans="${map[e.key]}"]:not([disabled])`);
    if (b) b.click(); else if (e.key === 'Enter'){ const n = document.getElementById('next'); if (n) n.click(); }
  }
});

/* ===== Install + offline ===== */
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; if (tab === 'stats') renderStats(); });
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')){
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}

renderStreak();
go('quiz');
