'use strict';
/* Carrera de Gurises — UI completa, 100% estática, sin build. Rutas relativas para GitHub Pages. */
document.addEventListener('DOMContentLoaded', () => {
  const CATEGORIES = {
    'Geografía': { color: '#2B8BEA', icon: '🌍' },
    'Historia': { color: '#F7CA18', icon: '🏛️' },
    'Artes y Letras': { color: '#E03F8C', icon: '🎨' },
    'Ciencias y Naturaleza': { color: '#2ECC71', icon: '🔬' },
    'Deportes': { color: '#F39C12', icon: '⚽' },
    'Espectáculos': { color: '#00BCD4', icon: '🎬' },
    'Manga': { color: '#E74C3C', icon: '📖' },
    'Anime': { color: '#9B59B6', icon: '⛩️' },
    'Videojuegos': { color: '#1ABC9C', icon: '🎮' }
  };
  const CATEGORY_NAMES = Object.keys(CATEGORIES);
  const MANTEQUITA = 'Mantequita';
  const MANTE_META = { color: '#FFD54F', icon: '🧈' };
  const COSTS = { fifty: 2, removeOne: 1, call: 2, piquete: 3 };
  const AVATARS = ['😀', '😎', '🤓', '🥳', '😺', '🦊', '🐼', '🤖'];
  const COLORS = ['#2B8BEA', '#2ECC71', '#F7CA18', '#E03F8C', '#F39C12', '#00BCD4', '#9B59B6', '#1ABC9C'];
  const STORE_KEY = 'carrera-gurises-v2', LEGACY_KEY = 'carrera-gurises-v1';
  const LETTERS = ['A', 'B', 'C', 'D'];

  const State = {
    players: [], current: 0, winMode: 'clasico', pointsGoal: 10, timeLimit: 0,
    pools: {}, usedIds: new Set(), currentQ: null, currentCat: null,
    answered: false, awaitingPick: false, piqueteVictim: null,
    count: 2, wheelAngle: 0, spinning: false
  };
  let ALL = [], toastT = null, timerId = null, timeLeft = 0, timerTotal = 0, paused = false, callId = null;

  const $ = (id) => document.getElementById(id);
  const el = {
    setup: $('screen-setup'), wheel: $('screen-wheel'), question: $('screen-question'),
    form: $('setup-form'), countGroup: $('player-count-group'), playersConfig: $('players-config'),
    timeLimit: $('time-limit'),
    turnAvatar: $('turn-avatar'), turnName: $('turn-name'), turnMeta: $('turn-meta'),
    disc: $('wheel-disc'), btnSpin: $('btn-spin'),
    manteNote: $('mantequita-note'), picker: $('mantequita-picker'),
    qAvatar: $('q-avatar'), qPlayer: $('q-player'), qCat: $('q-category'),
    qTimer: $('q-timer'), qTimerLabel: $('q-timer-label'), qTimerBar: $('q-timer-bar'),
    qText: $('q-text'), powerups: $('powerups'),
    pwFifty: $('pw-fifty'), pwRemove: $('pw-remove'), pwCall: $('pw-call'), pwPiquete: $('pw-piquete'),
    coinsHint: $('coins-hint'), qOptions: $('q-options'), qOpen: $('q-open'),
    btnReveal: $('btn-reveal'), qAnswer: $('q-answer'), btnHit: $('btn-hit'), btnMiss: $('btn-miss'),
    btnNext: $('btn-next'), btnScore: $('btn-score'),
    board: $('modal-scoreboard'), scoreList: $('score-list'),
    victory: $('modal-victory'), winnerName: $('winner-name'), winnerStats: $('winner-stats'),
    confettiBox: $('confetti-box'), btnRestart: $('btn-restart'), btnNew: $('btn-new-players'),
    call: $('modal-call'), callCount: $('call-countdown'),
    piquete: $('modal-piquete'), piqueteList: $('piquete-list'), toast: $('toast'),
    btnEnd: $('btn-end'), btnEndBoard: $('btn-end-board')
  };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s ?? '').trim().toLowerCase();
  const shuffle = (a) => { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[x[i], x[j]] = [x[j], x[i]]; } return x; };
  const me = () => State.players[State.current];
  const responder = () => (State.piqueteVictim != null && State.players[State.piqueteVictim]) ? State.players[State.piqueteVictim] : me();
  const show = (n) => n?.classList.remove('hidden');
  const hide = (n) => n?.classList.add('hidden');
  function toast(m) { if (!el.toast) return; el.toast.textContent = m; el.toast.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.toast.classList.remove('show'), 2600); }
  function showScreen(name) {
    const map = { setup: el.setup, wheel: el.wheel, question: el.question };
    for (const [k, n] of Object.entries(map)) { if (n) n.classList.toggle('hidden', k !== name); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  const openDlg = (d) => { if (d && typeof d.showModal === 'function' && !d.open) d.showModal(); };
  const closeDlg = (d) => { try { if (d?.open) d.close(); } catch { /* noop */ } };

  /* ---------- persistencia ---------- */
  function mkPlayer(name, avatar, color) {
    return { name, avatar, color, points: 0, medals: [], coins: 0, streak: 0, best: 0, powerups: { fifty: true, removeOne: true, call: true, piquete: true }, stats: {} };
  }
  function normPlayer(p, i) {
    const b = mkPlayer(String(p?.name ?? 'Jugador ' + (i + 1)).slice(0, 20), p?.avatar || AVATARS[i % AVATARS.length], p?.color || COLORS[i % COLORS.length]);
    b.points = Number(p?.points) || 0;
    b.medals = Array.isArray(p?.medals) ? p.medals.filter((m) => CATEGORIES[m]) : [];
    b.coins = Math.max(0, Number(p?.coins) || 0);
    b.streak = Math.max(0, Number(p?.streak) || 0);
    b.best = Math.max(0, Number(p?.best ?? p?.bestStreak) || 0);
    if (p?.powerups) for (const k of Object.keys(COSTS)) b.powerups[k] = p.powerups[k] !== false;
    b.stats = (p?.stats && typeof p.stats === 'object') ? p.stats : {};
    return b;
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        players: State.players, current: State.current, winMode: State.winMode,
        pointsGoal: State.pointsGoal, timeLimit: State.timeLimit, usedIds: [...State.usedIds]
      }));
    } catch { /* noop */ }
  }
  function applyData(d) {
    if (!d || !Array.isArray(d.players) || !d.players.length) return false;
    State.players = d.players.slice(0, 10).map((p, i) => normPlayer(typeof p === 'string' ? { name: p } : p, i));
    if (!State.players.length) return false;
    State.current = Math.min(Math.max(0, Number(d.current) || 0), State.players.length - 1);
    const wm = d.winMode === 'puntos' ? 'puntos' : (d.winMode === 'medallas' ? 'clasico' : (d.winMode || 'clasico'));
    State.winMode = (wm === 'puntos') ? 'puntos' : 'clasico';
    State.pointsGoal = 10;
    State.timeLimit = [0, 15, 30, 60].includes(Number(d.timeLimit)) ? Number(d.timeLimit) : 0;
    State.usedIds = new Set(Array.isArray(d.usedIds) ? d.usedIds : []);
    State.count = State.players.length;
    return true;
  }
  function load() {
    try {
      const r2 = localStorage.getItem(STORE_KEY);
      if (r2 && applyData(JSON.parse(r2))) return true;
      const r1 = localStorage.getItem(LEGACY_KEY);
      if (r1 && applyData(JSON.parse(r1))) { save(); return true; }
    } catch { /* noop */ }
    return false;
  }
  function clearSave() { try { localStorage.removeItem(STORE_KEY); localStorage.removeItem(LEGACY_KEY); } catch { /* noop */ } }

  /* ---------- preguntas ---------- */
  function normalize(raw) {
    const list = Array.isArray(raw) ? raw : raw?.preguntas;
    if (!Array.isArray(list)) return [];
    return list.map((q, i) => ({
      _id: q.id ?? i,
      categoria: String(q.categoria ?? q.category ?? ''),
      pregunta: String(q.pregunta ?? q.text ?? q.question ?? q.q ?? ''),
      tipo: String(q.tipo ?? q.type ?? (q.opciones || q.options ? 'opciones' : 'abierta')).toLowerCase().includes('abiert') ? 'abierta' : 'opciones',
      opciones: Array.isArray(q.opciones ?? q.options) ? (q.opciones ?? q.options).map(String) : [],
      respuesta: String(q.respuesta_correcta ?? q.respuesta ?? q.answer ?? q.correcta ?? '')
    })).filter((q) => CATEGORIES[q.categoria] && q.pregunta && q.respuesta);
  }
  async function loadQuestions() {
    try {
      const res = await fetch('./data/preguntas.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      ALL = normalize(await res.json());
      if (!ALL.length) throw new Error('vacío');
    } catch { ALL = []; toast('No se pudieron cargar las preguntas. Revisá data/preguntas.json'); }
  }
  function buildPools() {
    State.pools = {};
    for (const c of CATEGORY_NAMES) {
      const ix = [];
      ALL.forEach((q, i) => { if (q.categoria === c && !State.usedIds.has(q._id)) ix.push(i); });
      State.pools[c] = shuffle(ix);
    }
  }
  function draw(cat) {
    if (!CATEGORIES[cat]) return null;
    if (!State.pools[cat]?.length) {
      const fresh = [];
      ALL.forEach((q, i) => { if (q.categoria === cat && !State.usedIds.has(q._id)) fresh.push(i); });
      if (!fresh.length) ALL.forEach((q, i) => { if (q.categoria === cat) { fresh.push(i); State.usedIds.delete(q._id); } });
      State.pools[cat] = shuffle(fresh);
    }
    const i = State.pools[cat].pop();
    if (i === undefined) return null;
    State.usedIds.add(ALL[i]._id);
    return ALL[i];
  }

  /* ---------- setup ---------- */
  function renderCount() {
    el.countGroup?.querySelectorAll('.btn-count').forEach((b) => b.classList.toggle('is-active', Number(b.dataset.count) === State.count));
  }
  function renderPlayerCards() {
    if (!el.playersConfig) return;
    const prev = [...el.playersConfig.querySelectorAll('.player-card')].map((c) => ({
      name: c.querySelector('[data-pname]')?.value ?? '', avatar: c.querySelector('[data-pavatar]')?.dataset.avatar ?? '', color: c.querySelector('[data-pcolor]')?.value ?? ''
    }));
    el.playersConfig.innerHTML = '';
    for (let i = 0; i < State.count; i++) {
      const card = document.createElement('div');
      card.className = 'player-card';
      const avatar = prev[i]?.avatar || AVATARS[i % AVATARS.length];
      const color = prev[i]?.color || COLORS[i % COLORS.length];
      card.innerHTML =
        '<button type="button" class="avatar-pick" data-pavatar data-avatar="' + esc(avatar) + '" aria-label="Cambiar avatar">' + esc(avatar) + '</button>' +
        '<input type="text" data-pname maxlength="20" placeholder="Jugador ' + (i + 1) + '" value="' + esc(prev[i]?.name || '') + '" aria-label="Nombre jugador ' + (i + 1) + '" />' +
        '<input type="color" class="color-pick" data-pcolor value="' + esc(color) + '" aria-label="Color jugador ' + (i + 1) + '" />';
      card.querySelector('[data-pavatar]').addEventListener('click', (e) => {
        const b = e.currentTarget;
        const ix = (AVATARS.indexOf(b.dataset.avatar) + 1) % AVATARS.length;
        b.dataset.avatar = AVATARS[ix]; b.textContent = AVATARS[ix];
      });
      el.playersConfig.appendChild(card);
    }
  }
  function initFromForm() {
    const cards = [...el.playersConfig.querySelectorAll('.player-card')];
    State.players = cards.map((c, i) => mkPlayer(
      (c.querySelector('[data-pname]')?.value || '').trim().slice(0, 20) || 'Jugador ' + (i + 1),
      c.querySelector('[data-pavatar]')?.dataset.avatar || AVATARS[i % AVATARS.length],
      c.querySelector('[data-pcolor]')?.value || COLORS[i % COLORS.length]
    ));
    State.current = 0;
    State.winMode = document.querySelector('input[name="win-mode"]:checked')?.value === 'puntos' ? 'puntos' : 'clasico';
    State.pointsGoal = 10;
    State.timeLimit = [0, 15, 30, 60].includes(Number(el.timeLimit?.value)) ? Number(el.timeLimit.value) : 0;
    State.usedIds = new Set();
    State.currentQ = null; State.currentCat = null;
    State.answered = false; State.awaitingPick = false; State.piqueteVictim = null;
    buildPools();
  }

  /* ---------- ruleta SVG ---------- */
  function polar(cx, cy, r, deg) { const a = (deg - 90) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
  function arcPath(cx, cy, r, a0, a1) {
    const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1);
    return 'M' + cx + ' ' + cy + ' L' + x0.toFixed(1) + ' ' + y0.toFixed(1) + ' A' + r + ' ' + r + ' 0 0 1 ' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' Z';
  }
  function buildWheel() {
    if (!el.disc) return;
    const step = 360 / CATEGORY_NAMES.length;
    el.disc.innerHTML = '';
    CATEGORY_NAMES.forEach((cat, i) => {
      const a0 = i * step, a1 = a0 + step, mid = a0 + step / 2;
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', arcPath(160, 160, 150, a0, a1));
      p.setAttribute('fill', CATEGORIES[cat].color);
      p.setAttribute('stroke', '#0f172a'); p.setAttribute('stroke-width', '3');
      el.disc.appendChild(p);
      const [tx, ty] = polar(160, 160, 100, mid);
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', tx); t.setAttribute('y', ty); t.setAttribute('text-anchor', 'middle');
      t.setAttribute('dominant-baseline', 'middle'); t.setAttribute('font-size', '26');
      t.setAttribute('transform', 'rotate(' + mid + ' ' + tx + ' ' + ty + ')');
      t.textContent = CATEGORIES[cat].icon;
      el.disc.appendChild(t);
    });
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ring.setAttribute('cx', 160); ring.setAttribute('cy', 160); ring.setAttribute('r', 150);
    ring.setAttribute('fill', 'none'); ring.setAttribute('stroke', '#0f172a'); ring.setAttribute('stroke-width', '6');
    el.disc.appendChild(ring);
  }
  function renderPicker() {
    if (!el.picker) return;
    el.picker.innerHTML = '';
    CATEGORY_NAMES.forEach((cat) => {
      const b = document.createElement('button');
      b.type = 'button'; b.style.borderLeftColor = CATEGORIES[cat].color;
      b.innerHTML = '<span>' + CATEGORIES[cat].icon + '</span><br />' + esc(cat);
      b.addEventListener('click', () => pickCategory(cat));
      el.picker.appendChild(b);
    });
  }
  function spin() {
    if (State.spinning) return;
    if (!ALL.length) { toast('Aún no cargan las preguntas.'); return; }
    State.spinning = true;
    if (el.btnSpin) el.btnSpin.disabled = true;
    hide(el.manteNote); hide(el.picker);
    State.awaitingPick = false; State.piqueteVictim = null; State.answered = false;
    const isMante = Math.random() < 0.1;
    const cat = isMante ? MANTEQUITA : CATEGORY_NAMES[Math.floor(Math.random() * CATEGORY_NAMES.length)];
    let targetIx = Math.max(0, CATEGORY_NAMES.indexOf(cat));
    const step = 360 / CATEGORY_NAMES.length;
    const segCenter = targetIx * step + step / 2;
    const turns = 360 * 5;
    const jitter = (Math.random() - 0.5) * (step * 0.6);
    const delta = turns + (360 - segCenter) - (State.wheelAngle % 360) + jitter;
    State.wheelAngle += delta;
    if (el.disc) el.disc.style.transform = 'rotate(' + State.wheelAngle + 'deg)';
    updateTurn();
    setTimeout(() => {
      State.spinning = false;
      if (el.btnSpin) el.btnSpin.disabled = false;
      if (cat === MANTEQUITA) {
        State.awaitingPick = true; State.currentQ = null; State.currentCat = null;
        show(el.manteNote); show(el.picker);
        toast('🧈 ¡Mantequita! Elegí categoría.');
        return;
      }
      State.currentCat = cat;
      const q = draw(cat);
      if (!q) { toast('Sin preguntas para ' + cat); return; }
      State.currentQ = q; save();
      renderQuestion(q, cat);
    }, 3350);
  }
  function pickCategory(cat) {
    if (!State.awaitingPick || !CATEGORIES[cat]) return;
    State.awaitingPick = false;
    hide(el.manteNote); hide(el.picker);
    State.currentCat = cat; State.piqueteVictim = null;
    const q = draw(cat);
    if (!q) { toast('Sin preguntas para ' + cat); return; }
    State.currentQ = q; save();
    renderQuestion(q, cat);
  }

  /* ---------- turno / scoreboard ---------- */
  function updateTurn() {
    const p = me();
    if (p && el.turnName) {
      el.turnAvatar.textContent = p.avatar;
      el.turnName.textContent = p.name;
      if (el.turnMeta) el.turnMeta.textContent = p.points + ' pts · 🪙 ' + p.coins + ' · 🔥' + p.streak + (State.winMode === 'puntos' ? ' (meta 10)' : ' (' + p.medals.length + '/9 🏅)');
    }
    renderBoard();
  }
  function quesitosHTML(p) {
    return CATEGORY_NAMES.map((c) => {
      const got = p.medals.includes(c);
      return '<span class="quesito' + (got ? ' earned' : '') + '" style="' + (got ? 'background:' + CATEGORIES[c].color : '') + '" title="' + esc(c) + '">' + (got ? CATEGORIES[c].icon : '·') + '</span>';
    }).join('');
  }
  function renderBoard() {
    if (!el.scoreList) return;
    el.scoreList.innerHTML = '';
    State.players.forEach((p, i) => {
      const li = document.createElement('li');
      li.className = 'score-row-toon' + (i === State.current ? ' current' : '');
      li.innerHTML = '<span class="avatar-toon">' + esc(p.avatar) + '</span>' +
        '<span><strong>' + esc(p.name) + '</strong> · ' + p.points + ' pts · 🪙 ' + p.coins + ' · 🔥' + p.streak +
        '<span class="quesitos">' + quesitosHTML(p) + '</span></span>';
      el.scoreList.appendChild(li);
    });
  }

  /* ---------- timer ---------- */
  function renderTimer() {
    if (!el.qTimer) return;
    if (!State.timeLimit || !State.currentQ || State.answered) { hide(el.qTimer); return; }
    show(el.qTimer);
    el.qTimer.classList.toggle('danger', timeLeft <= 10);
    if (el.qTimerLabel) el.qTimerLabel.textContent = '⏱️ ' + timeLeft + 's';
    if (el.qTimerBar) el.qTimerBar.style.width = (timerTotal ? Math.max(0, timeLeft / timerTotal * 100) : 0) + '%';
  }
  function clearTimer() { if (timerId) clearInterval(timerId); timerId = null; paused = false; }
  function startTimer() {
    clearTimer(); State.answered = false;
    if (!State.timeLimit || !State.currentQ) { hide(el.qTimer); return; }
    timeLeft = State.timeLimit; timerTotal = State.timeLimit; renderTimer();
    timerId = setInterval(() => {
      if (paused) return;
      timeLeft -= 1;
      if (timeLeft <= 0) { timeLeft = 0; renderTimer(); onTimeout(); return; }
      renderTimer();
    }, 1000);
  }
  function onTimeout() {
    if (State.answered) return;
    State.answered = true; clearTimer(); renderTimer();
    el.qOptions?.querySelectorAll('.opt-btn').forEach((b) => { b.disabled = true; });
    const r = responder();
    if (r && State.currentCat) miss(r, State.currentCat);
    toast('⏱️ ¡Tiempo! Cuenta como fallo.');
    renderPowers(); show(el.btnNext);
  }

  /* ---------- puntos / monedas ---------- */
  function stat(p, cat, ok) {
    if (!p || !CATEGORIES[cat]) return;
    p.stats[cat] = p.stats[cat] || { ok: 0, total: 0 };
    p.stats[cat].total += 1; if (ok) p.stats[cat].ok += 1;
  }
  function hit() {
    const r = responder();
    if (!r || !State.currentCat) return '';
    r.points += 1;
    if (!r.medals.includes(State.currentCat)) r.medals.push(State.currentCat);
    r.streak += 1; r.best = Math.max(r.best, r.streak);
    let msg = '';
    if (r.streak >= 2) { r.coins += 1; msg = ' +1 🪙 (racha x' + r.streak + ' 🔥)'; }
    stat(r, State.currentCat, true);
    save(); updateTurn(); renderPowers(); checkWin(r);
    return msg;
  }
  function miss(p, cat) { if (!p) return; p.streak = 0; stat(p, cat, false); save(); updateTurn(); renderPowers(); }
  function checkWin(p) {
    const win = State.winMode === 'puntos' ? p.points >= State.pointsGoal : p.medals.length >= CATEGORY_NAMES.length;
    if (win) {
      clearTimer();
      if (el.winnerName) el.winnerName.textContent = '🏆 ' + p.name + ' 🏆';
      if (el.winnerStats) el.winnerStats.textContent = p.points + ' pts · ' + p.medals.length + '/9 🏅 · 🪙 ' + p.coins + ' · racha x' + p.best;
      launchConfetti();
      openDlg(el.victory);
      save();
    }
    return win;
  }
  function launchConfetti() {
    if (!el.confettiBox) return;
    el.confettiBox.innerHTML = '';
    for (let i = 0; i < 90; i++) {
      const s = document.createElement('span');
      s.className = 'confetti-piece';
      s.style.left = (Math.random() * 100) + '%';
      s.style.background = CATEGORIES[CATEGORY_NAMES[i % CATEGORY_NAMES.length]].color;
      s.style.animationDuration = (2 + Math.random() * 2) + 's';
      el.confettiBox.appendChild(s);
      setTimeout(() => s.remove(), 4500);
    }
  }

  /* ---------- pregunta ---------- */
  function renderQuestion(q, cat) {
    const meta = CATEGORIES[cat] || MANTE_META;
    const r = responder();
    if (el.qAvatar) el.qAvatar.textContent = r?.avatar || '😀';
    if (el.qPlayer) el.qPlayer.textContent = (State.piqueteVictim != null ? '🔪 Responde ' + r?.name + ': ' : 'Turno de ' + r?.name);
    if (el.qCat) { el.qCat.textContent = meta.icon + ' ' + cat; el.qCat.style.background = meta.color; }
    if (el.qText) el.qText.textContent = q.pregunta;
    State.answered = false;
    showScreen('question');
    hide(el.btnNext);
    if (q.tipo === 'opciones') { show(el.qOptions); hide(el.qOpen); renderOpts(q); }
    else {
      hide(el.qOptions); if (el.qOptions) el.qOptions.innerHTML = '';
      show(el.qOpen); if (el.qAnswer) { el.qAnswer.textContent = q.respuesta; hide(el.qAnswer); }
      show(el.btnReveal); hide(el.btnHit); hide(el.btnMiss);
    }
    updateTurn(); renderPowers(); startTimer();
  }
  function renderOpts(q) {
    el.qOptions.innerHTML = '';
    let opts = shuffle((q.opciones.length ? q.opciones.slice(0, 4) : [q.respuesta]));
    if (!opts.some((o) => norm(o) === norm(q.respuesta))) opts[opts.length - 1] = q.respuesta;
    opts.slice(0, 4).forEach((t, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'opt-btn';
      b.innerHTML = '<span class="opt-letter">' + LETTERS[i] + '</span><span>' + esc(t) + '</span>';
      b.addEventListener('click', () => answerOpt(b, q), { once: true });
      el.qOptions.appendChild(b);
    });
  }
  function answerOpt(btn, q) {
    if (State.answered) return;
    State.answered = true; clearTimer(); renderTimer();
    const ok = norm(btn.querySelector('span:last-child')?.textContent || btn.textContent) === norm(q.respuesta);
    el.qOptions.querySelectorAll('.opt-btn').forEach((b) => {
      b.disabled = true;
      const txt = b.querySelector('span:last-child')?.textContent || b.textContent;
      if (norm(txt) === norm(q.respuesta)) b.classList.add('correct');
    });
    const r = responder();
    if (ok) { btn.classList.add('correct'); toast('¡Correcto! +1 punto 🏆' + hit()); }
    else { btn.classList.add('wrong'); if (r) miss(r, State.currentCat); toast('Incorrecto. Era: ' + q.respuesta); }
    renderPowers(); show(el.btnNext);
  }

  /* ---------- powerups ---------- */
  function label(k, emoji, name) {
    const r = responder(); if (!r) return emoji + ' ' + name;
    return r.powerups[k] ? emoji + ' ' + name + ' · GRATIS' : emoji + ' ' + name + ' · ' + COSTS[k] + '🪙';
  }
  function renderPowers() {
    const q = State.currentQ, r = responder();
    const hasQ = !!(q && State.currentCat && !State.awaitingPick);
    const done = State.answered || !hasQ;
    const open = q?.tipo === 'abierta';
    if (el.coinsHint && r) el.coinsHint.textContent = '🪙 ' + r.coins + ' de ' + r.name + ' · 🔥 x' + r.streak + ' (1º=0🪙, +1🪙 por seguido)';
    const set = (btn, key, emoji, name, extra) => {
      if (!btn || !r) return;
      btn.textContent = label(key, emoji, name);
      btn.disabled = done || !!extra || (!r.powerups[key] && r.coins < COSTS[key]);
    };
    set(el.pwFifty, 'fifty', '➗', '50/50', open);
    set(el.pwRemove, 'removeOne', '➖', 'Sacar 1', open);
    set(el.pwCall, 'call', '📞', 'Familiar', false);
    set(el.pwPiquete, 'piquete', '🔪', 'Piquete', State.piqueteVictim != null || State.players.length < 2);
  }
  function consume(p, key) {
    if (!p) return null;
    if (p.powerups[key]) { p.powerups[key] = false; save(); updateTurn(); renderPowers(); return 'free'; }
    if (p.coins >= COSTS[key]) { p.coins -= COSTS[key]; save(); updateTurn(); renderPowers(); return 'paid'; }
    return null;
  }
  function dropWrong(n) {
    const q = State.currentQ;
    if (!q || q.tipo !== 'opciones') { toast('Solo en opción múltiple.'); return 0; }
    const cands = [...el.qOptions.querySelectorAll('.opt-btn')].filter((b) => {
      const t = b.querySelector('span:last-child')?.textContent || b.textContent;
      return !b.classList.contains('eliminated') && !b.disabled && norm(t) !== norm(q.respuesta);
    });
    if (!cands.length) { toast('Nada para quitar.'); return 0; }
    shuffle(cands).slice(0, n).forEach((b) => { b.classList.add('eliminated'); b.disabled = true; });
    return 1;
  }
  function useFifty() {
    if (State.answered || !State.currentQ) return;
    const m = consume(responder(), 'fifty');
    if (!m) return toast('Faltan 🪙 (' + COSTS.fifty + ').');
    if (dropWrong(2)) toast(m === 'free' ? '➗ ¡50/50 gratis!' : '➗ ¡50/50 por ' + COSTS.fifty + '🪙!');
    renderPowers();
  }
  function useRemove() {
    if (State.answered || !State.currentQ) return;
    const m = consume(responder(), 'removeOne');
    if (!m) return toast('Faltan 🪙 (' + COSTS.removeOne + ').');
    if (dropWrong(1)) toast(m === 'free' ? '➖ ¡Gratis!' : '➖ ¡Por ' + COSTS.removeOne + '🪙!');
    renderPowers();
  }
  function useCall() {
    if (State.answered || !State.currentQ) return;
    const m = consume(responder(), 'call');
    if (!m) return toast('Faltan 🪙 (' + COSTS.call + ').');
    paused = true;
    if (el.callCount) el.callCount.textContent = '60';
    openDlg(el.call);
    let left = 60;
    if (callId) clearInterval(callId);
    callId = setInterval(() => { left -= 1; if (el.callCount) el.callCount.textContent = String(Math.max(0, left)); if (left <= 0) { clearInterval(callId); callId = null; } }, 1000);
    toast(m === 'free' ? '📞 ¡Gratis! Timer en pausa.' : '📞 ¡Por ' + COSTS.call + '🪙! Timer en pausa.');
    renderPowers();
  }
  function weakest(ix) {
    const p = State.players[ix]; if (!p) return CATEGORY_NAMES[0];
    let worst = null, rate = 2;
    for (const c of CATEGORY_NAMES) {
      const s = p.stats?.[c];
      if (s?.total > 0 && (s.ok / s.total) < rate) { rate = s.ok / s.total; worst = c; }
    }
    if (worst) return worst;
    const nm = CATEGORY_NAMES.filter((c) => !p.medals.includes(c));
    return (nm.length ? nm : CATEGORY_NAMES)[Math.floor(Math.random() * (nm.length || CATEGORY_NAMES.length))];
  }
  function openPiquete() {
    if (State.answered || !State.currentQ || State.players.length < 2) return;
    el.piqueteList.innerHTML = '';
    const atk = me();
    State.players.forEach((p, i) => {
      if (i === State.current) return;
      const w = weakest(i);
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn-white w-full';
      b.textContent = '🔪 ' + p.name + ' → ' + (CATEGORIES[w]?.icon || '') + ' ' + w + (atk && !atk.powerups.piquete ? ' · ' + COSTS.piquete + '🪙' : ' · GRATIS');
      b.addEventListener('click', () => doPiquete(i));
      li.appendChild(b); el.piqueteList.appendChild(li);
    });
    openDlg(el.piquete);
  }
  function doPiquete(ix) {
    const atk = me(), vic = State.players[ix];
    if (!atk || !vic) return;
    const m = consume(atk, 'piquete');
    if (!m) return toast('Faltan 🪙 (' + COSTS.piquete + ').');
    closeDlg(el.piquete);
    const w = weakest(ix);
    State.piqueteVictim = ix; State.currentCat = w; State.answered = false;
    const q = draw(w);
    if (!q) { State.piqueteVictim = null; return toast('Sin preguntas para ' + w); }
    State.currentQ = q; save();
    renderQuestion(q, w);
    toast(m === 'free' ? '🔪 ¡Piquete gratis a ' + vic.name + '!' : '🔪 ¡Piquete a ' + vic.name + ' por ' + COSTS.piquete + '🪙!');
  }

  /* ---------- flujo ---------- */
  function nextTurn() {
    if (!State.players.length) return;
    clearTimer();
    State.current = (State.current + 1) % State.players.length;
    State.currentQ = null; State.currentCat = null;
    State.answered = false; State.awaitingPick = false; State.piqueteVictim = null;
    hide(el.manteNote); hide(el.picker);
    updateTurn(); save(); showScreen('wheel');
  }
  function restart() {
    State.players.forEach((p) => Object.assign(p, { points: 0, medals: [], coins: 0, streak: 0, best: 0, stats: {}, powerups: { fifty: true, removeOne: true, call: true, piquete: true } }));
    State.current = 0; State.usedIds = new Set();
    State.piqueteVictim = null; State.answered = false;
    buildPools(); updateTurn(); save(); closeDlg(el.victory); showScreen('wheel');
    toast('¡Suerte! 🎲');
  }
  function newPlayers() { clearSave(); closeDlg(el.victory); State.players = []; State.current = 0; State.count = 2; renderCount(); renderPlayerCards(); showScreen('setup'); }

  /* ---------- terminar partida ---------- */
  function leader() {
    if (!State.players.length) return null;
    const rank = State.players.map((p, i) => ({ p, i }));
    rank.sort((a, b) => {
      if (State.winMode === 'puntos') {
        return (b.p.points - a.p.points) || (b.p.medals.length - a.p.medals.length) || (b.p.coins - a.p.coins);
      }
      return (b.p.medals.length - a.p.medals.length) || (b.p.points - a.p.points) || (b.p.coins - a.p.coins);
    });
    return rank[0];
  }
  function endGame() {
    if (!State.players.length) { toast('No hay partida en curso.'); return; }
    if (State.spinning) { toast('Esperá a que termine el giro 🎡'); return; }
    const top = leader();
    if (!top) return;
    if (!window.confirm('¿Terminar la partida ahora y coronar a ' + top.p.name + '?')) return;
    clearTimer();
    State.spinning = false;
    State.answered = true;
    State.awaitingPick = false;
    hide(el.manteNote); hide(el.picker);
    closeDlg(el.board); closeDlg(el.call); closeDlg(el.piquete);
    if (el.winnerName) el.winnerName.textContent = '🏁 ' + top.p.name + ' 🏁';
    if (el.winnerStats) el.winnerStats.textContent = top.p.points + ' pts · ' + top.p.medals.length + '/9 🏅 · 🪙 ' + top.p.coins + ' · racha x' + top.p.best + ' (partida terminada antes del final)';
    launchConfetti();
    openDlg(el.victory);
    save();
    toast('🏁 Partida terminada. ¡Ganó ' + top.p.name + '!');
  }

  function bind() {
    el.countGroup?.querySelectorAll('.btn-count').forEach((b) => b.addEventListener('click', () => {
      State.count = Math.min(10, Math.max(1, Number(b.dataset.count) || 2));
      renderCount(); renderPlayerCards();
    }));
    el.form?.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!ALL.length) return toast('Aún no cargan las preguntas.');
      initFromForm(); updateTurn(); save(); showScreen('wheel');
      toast('¡Que empiece la carrera! 🎉');
    });
    el.btnSpin?.addEventListener('click', spin);
    el.btnNext?.addEventListener('click', nextTurn);
    el.btnScore?.addEventListener('click', () => { renderBoard(); openDlg(el.board); });
    el.btnReveal?.addEventListener('click', () => { show(el.qAnswer); hide(el.btnReveal); show(el.btnHit); show(el.btnMiss); });
    el.btnHit?.addEventListener('click', () => {
      if (State.answered) return;
      State.answered = true; clearTimer(); renderTimer();
      toast('¡Correcto! +1 punto 🏆' + hit());
      hide(el.btnHit); hide(el.btnMiss); show(el.btnNext); renderPowers();
    });
    el.btnMiss?.addEventListener('click', () => {
      if (State.answered) return;
      State.answered = true; clearTimer(); renderTimer();
      const r = responder(); if (r) miss(r, State.currentCat);
      toast('Fallo registrado.');
      hide(el.btnHit); hide(el.btnMiss); show(el.btnNext); renderPowers();
    });
    el.pwFifty?.addEventListener('click', useFifty);
    el.pwRemove?.addEventListener('click', useRemove);
    el.pwCall?.addEventListener('click', useCall);
    el.pwPiquete?.addEventListener('click', openPiquete);
    el.call?.addEventListener('close', () => { if (callId) { clearInterval(callId); callId = null; } paused = false; renderTimer(); });
    el.btnRestart?.addEventListener('click', restart);
    el.btnNew?.addEventListener('click', newPlayers);
    el.btnEnd?.addEventListener('click', endGame);
    el.btnEndBoard?.addEventListener('click', endGame);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDlg(el.board); });
  }

  async function init() {
    bind(); buildWheel(); renderPicker(); renderCount(); renderPlayerCards();
    const restored = load();
    if (restored) {
      if (el.timeLimit) el.timeLimit.value = String(State.timeLimit ?? 0);
      renderCount(); renderPlayerCards(); updateTurn(); showScreen('wheel');
      toast('Partida restaurada ▶️');
    } else showScreen('setup');
    await loadQuestions();
    buildPools();
  }
  init();
});
