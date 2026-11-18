'use strict';
/* ===== Data ===== */
const CATS = {
  food:['🍽️','Food & drink'], home:['🏠','Home'], body:['🫀','Body'], people:['👪','People & family'],
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
let META = Object.assign({streak:0, last:null, art:{der:[0,0],die:[0,0],das:[0,0]}, autoSpeak:true, answered:0}, store.get('dd_meta', {}));
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
let listQ = '', listCat = 'all', listArt = 'all', listFav = false;
function renderWords(){
  $view.innerHTML = `
    <input type="search" id="q" placeholder="Search German or English…" value="${esc(listQ)}" style="width:100%;margin-bottom:10px" autocomplete="off">
    <div class="chips" id="artChips">
      ${['all','der','die','das'].map(a => `<button class="chip ${listArt===a?'on':''} ${a!=='all'?'a-'+a:''}" data-art="${a}" style="font-weight:700">${a==='all'?'All':a}</button>`).join('')}
      <button class="chip ${listFav?'on':''}" data-fav>★ Favourites</button>
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
  $view.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { listCat = b.dataset.cat; renderWords(); });
  drawList();
}
function norm(s){ return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/ß/g,'ss'); }
function drawList(){
  const q = norm(listQ.trim());
  const ws = W.filter(w => (listCat==='all'||w.cat===listCat) && (listArt==='all'||w.art===listArt) && (!listFav||FAV.has(w.id))
    && (!q || norm(w.de).includes(q) || norm(w.en).includes(q) || norm(w.pl).includes(q)));
  document.getElementById('count').textContent = `${ws.length} word${ws.length===1?'':'s'}`;
  document.getElementById('list').innerHTML = ws.map(w => {
    const p = P[w.id]; const st = !p ? '' : p.b >= MASTERED ? '🟢' : '🟡';
    return `<button class="item bl-${w.art}" data-open="${esc(w.id)}">
      <span class="em">${w.emoji}</span>
      <span class="grow"><div class="w">${full(w)}</div><div class="e">${esc(w.en)}</div></span>
      <span class="small">${FAV.has(w.id)?'★':''} ${st}</span></button>`;
  }).join('') || `<p class="muted">No words found.</p>`;
}

/* ===== Detail sheet ===== */
function openSheet(id){
  const w = BY_ID[id]; if (!w) return;
  const p = P[w.id];
  const status = !p ? 'Not practised yet' : p.b >= MASTERED ? `Mastered 🟢 (${p.c}✓ ${p.w}✗)` : `Learning 🟡 (${p.c}✓ ${p.w}✗)`;
  document.getElementById('sheetBody').innerHTML = `
    <div class="sheet-head">
      <div class="q-emoji">${w.emoji}</div>
      <div class="q-word">${full(w)} <button class="speak" data-say="${esc(w.art+' '+w.de)}">🔊</button></div>
      <div class="q-en">${esc(w.en)}</div>
    </div>
    <dl class="kv">
      <dt>Plural</dt><dd>${plural(w)}</dd>
      <dt>Topic</dt><dd>${CATS[w.cat][0]} ${CATS[w.cat][1]}</dd>
      <dt>Level</dt><dd>${w.lvl}</dd>
      <dt>Progress</dt><dd>${status}</dd>
    </dl>
    ${detailsHTML(w)}
    <div class="row" style="margin-top:16px">
      <button class="btn full" id="favBtn">${FAV.has(w.id) ? '★ Remove favourite' : '☆ Add to favourites'}</button>
      <button class="btn" data-close>Close</button>
    </div>`;
  document.getElementById('favBtn').onclick = () => { FAV.has(w.id) ? FAV.delete(w.id) : FAV.add(w.id); save(); openSheet(id); if (tab==='words') drawList(); };
  document.getElementById('sheet').classList.remove('hidden');
}
function closeSheet(){ document.getElementById('sheet').classList.add('hidden'); }

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
      <div class="stat"><b>${mastered}</b><span class="small muted">mastered</span></div>
      <div class="stat"><b>${learning}</b><span class="small muted">learning</span></div>
      <div class="stat"><b>${total - mastered - learning}</b><span class="small muted">new</span></div>
      <div class="stat"><b>🔥 ${currentStreak()}</b><span class="small muted">day streak</span></div>
      <div class="stat"><b>${accAll}%</b><span class="small muted">accuracy</span></div>
      <div class="stat"><b>${META.answered}</b><span class="small muted">answers</span></div>
    </div>
    <div class="card" style="margin-top:12px">
      <h3 style="margin-top:0">Accuracy by article</h3>
      ${['der','die','das'].map(a => `<div class="catrow"><b class="a-${a}">${a}</b><div class="bar"><i style="width:${acc(a)||0}%;background:var(--${a})"></i></div><span class="muted">${acc(a)===null?'–':acc(a)+'%'}</span></div>`).join('')}
      ${weakest && all[0]+all[1] >= 15 ? `<p class="small muted">Your weakest article is <b class="a-${weakest}">${weakest}</b>. Try filtering the word list by it.</p>` : ''}
    </div>
    <div class="card"><h3 style="margin-top:0">Mastered by topic</h3>${catRows}
      <p class="small muted">A word counts as mastered after you get it right several times over several days.</p></div>
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

/* ===== Navigation ===== */
const VIEWS = {quiz:renderQuiz, cards:renderCards, words:renderWords, tricks:renderTricks, stats:renderStats};
let tab = 'quiz';
function go(t){
  tab = t;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  VIEWS[t](); window.scrollTo(0,0);
}
document.querySelector('.tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) go(b.dataset.tab); };
document.addEventListener('click', e => {
  const say = e.target.closest('[data-say]'); if (say){ e.stopPropagation(); speak(say.dataset.say); return; }
  const open = e.target.closest('[data-open]'); if (open){ openSheet(open.dataset.open); return; }
  if (e.target.closest('[data-close]')) closeSheet();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeSheet();
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
