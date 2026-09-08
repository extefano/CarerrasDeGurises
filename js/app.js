'use strict';
/* Carrera de Gurises — vanilla, sin dependencias. */
document.addEventListener('DOMContentLoaded', () => {
  // Constantes
  const CATEGORIES = {
    'Geografía': { color: '#2196F3', icon: '🌍' }, 'Historia': { color: '#FFC107', icon: '🏛️' },
    'Artes y Letras': { color: '#E91E63', icon: '🎨' }, 'Ciencias y Naturaleza': { color: '#4CAF50', icon: '🔬' },
    'Deportes': { color: '#FF9800', icon: '⚽' }, 'Espectáculos': { color: '#00BCD4', icon: '🎬' },
    'Manga': { color: '#EF5350', icon: '📖' }, 'Anime': { color: '#9C27B0', icon: '⛩️' },
    'Videojuegos': { color: '#8BC34A', icon: '🎮' }
  };
  const CATEGORY_NAMES = Object.keys(CATEGORIES);
  const MANTEQUITA = 'Mantequita';
  const MANTEQUITA_META = { color: '#FFD54F', icon: '🧈' };
  const ROULETTE_OPTIONS = [...CATEGORY_NAMES, MANTEQUITA];
  const COSTS = { fifty: 2, removeOne: 1, call: 2, piquete: 3 };
  const COLOR_PRESETS = ['#FF5252', '#448AFF', '#FFC107', '#4CAF50', '#E91E63', '#00BCD4', '#9C27B0', '#FF9800', '#8BC34A', '#795548'];
  const STORE_KEY = 'carrera-gurises-v2', LEGACY_KEY = 'carrera-gurises-v1', MIN_PLAYERS = 1, MAX_PLAYERS = 10;
  // Estado
  const State = { players: [], current: 0, winMode: 'puntos', pointsGoal: 10, timeLimit: 0,
    pools: {}, usedIds: new Set(), currentQ: null, currentCat: null,
    answered: false, awaitingPick: false, piqueteVictim: null };
  let ALL_QUESTIONS = [], toastTimer = null;
  let timerId = null, timeLeft = 0, timerTotal = 0, timerPaused = false;
  let callTimerId = null;
  // Cache DOM
  const $ = (id) => document.getElementById(id);
  const el = { viewSetup: $('view-setup'), setupForm: $('setup-form'), playerCount: $('player-count'),
    playersConfig: $('players-config'), pointsGoal: $('points-goal'), timeLimit: $('time-limit'),
    viewGame: $('view-game'), turnIndicator: $('turn-indicator'), btnScore: $('btn-score'),
    roulette: $('roulette'), btnSpin: $('btn-spin'), mantequitaNote: $('mantequita-note'),
    questionCard: $('question-card'), qCategory: $('q-category'), qTimer: $('q-timer'),
    qTimerLabel: $('q-timer-label'), qTimerBar: $('q-timer-bar'),
    qText: $('q-text'), qOptions: $('q-options'), qOpen: $('q-open'), btnReveal: $('btn-reveal'),
    qAnswer: $('q-answer'), btnHit: $('btn-hit'), btnMiss: $('btn-miss'), btnNext: $('btn-next'),
    pwFifty: $('pw-fifty'), pwRemove: $('pw-remove'), pwCall: $('pw-call'), pwPiquete: $('pw-piquete'),
    coinsHint: $('coins-hint'),
    viewVictory: $('view-victory'), winnerName: $('winner-name'), winnerStats: $('winner-stats'),
    btnRestart: $('btn-restart'), btnNewPlayers: $('btn-new-players'), scoreboard: $('scoreboard'),
    scoreList: $('score-list'), btnCloseScore: $('btn-close-score'), toast: $('toast'),
    modalCall: $('modal-call'), callCountdown: $('call-countdown'),
    modalPiquete: $('modal-piquete'), piqueteList: $('piquete-list') };
  const cells = () => Array.from(document.querySelectorAll('.roulette-cell[data-categoria]'));
  // Helpers
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s ?? '').trim().toLowerCase();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const currentPlayer = () => State.players[State.current];
  const responder = () => (State.piqueteVictim != null && State.players[State.piqueteVictim]) ? State.players[State.piqueteVictim] : currentPlayer();
  function toast(msg) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2600);
  }
  const show = (n) => { if (n) { n.classList.remove('hidden'); n.removeAttribute('hidden'); } };
  const hide = (n) => { if (n) { n.classList.add('hidden'); n.setAttribute('hidden', ''); } };
  function showView(name) {
    for (const v of ['setup', 'game', 'victory']) {
      const node = $('view-' + v);
      if (!node) continue;
      const on = v === name;
      node.classList.toggle('hidden', !on);
      node.classList.toggle('active', on);
      if (on) node.removeAttribute('hidden');
      else node.setAttribute('hidden', '');
    }
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function newPlayer(name, color) {
    return { name, color, points: 0, medals: [], coins: 0, streak: 0, bestStreak: 0,
      powerups: { fifty: true, removeOne: true, call: true, piquete: true }, stats: {} };
  }
  function normalizePlayer(p, i) {
    const base = newPlayer(String(p?.name ?? 'Jugador ' + (i + 1)).slice(0, 20) || 'Jugador', p?.color || COLOR_PRESETS[i % COLOR_PRESETS.length]);
    base.points = Number(p?.points) || 0;
    base.medals = Array.isArray(p?.medals) ? p.medals.filter((m) => CATEGORIES[m]) : [];
    base.coins = Math.max(0, Number(p?.coins) || 0);
    base.streak = Math.max(0, Number(p?.streak) || 0);
    base.bestStreak = Math.max(0, Number(p?.bestStreak) || 0);
    if (p?.powerups && typeof p.powerups === 'object') {
      for (const k of Object.keys(COSTS)) base.powerups[k] = p.powerups[k] !== false;
    }
    base.stats = (p?.stats && typeof p.stats === 'object') ? p.stats : {};
    return base;
  }
  // Persistencia v2 con migración v1
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ players: State.players, current: State.current,
        winMode: State.winMode, pointsGoal: State.pointsGoal, timeLimit: State.timeLimit, usedIds: [...State.usedIds] }));
    } catch { /* sin storage: el juego sigue */ }
  }
  function applyData(d) {
    if (!d || !Array.isArray(d.players) || !d.players.length) return false;
    State.players = d.players.filter((p) => p && typeof (p.name ?? p) !== 'undefined').map((p, i) => normalizePlayer(typeof p === 'string' ? { name: p } : p, i));
    if (!State.players.length) return false;
    State.current = Math.min(Math.max(0, Number(d.current) || 0), State.players.length - 1);
    State.winMode = d.winMode === 'medallas' ? 'medallas' : 'puntos';
    State.pointsGoal = Math.min(99, Math.max(1, Number(d.pointsGoal) || 10));
    State.timeLimit = [0, 15, 30, 60].includes(Number(d.timeLimit)) ? Number(d.timeLimit) : 0;
    State.usedIds = new Set(Array.isArray(d.usedIds) ? d.usedIds : []);
    return true;
  }
  function load() {
    try {
      const raw2 = localStorage.getItem(STORE_KEY);
      if (raw2 && applyData(JSON.parse(raw2))) return true;
      const raw1 = localStorage.getItem(LEGACY_KEY);
      if (raw1) {
        const d = JSON.parse(raw1);
        if (d && applyData(d)) { save(); return true; }
      }
      return false;
    } catch { return false; }
  }
  function clear() { try { localStorage.removeItem(STORE_KEY); localStorage.removeItem(LEGACY_KEY); } catch { /* noop */ } }
  // Preguntas
  function normalizeQuestions(raw) {
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
      const res = await fetch('./data/preguntas.json?v=900');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      ALL_QUESTIONS = normalizeQuestions(await res.json());
      if (!ALL_QUESTIONS.length) throw new Error('vacío');
    } catch {
      ALL_QUESTIONS = [];
      toast('No se pudieron cargar las preguntas. Revisá data/preguntas.json');
    }
  }
  function buildPools() {
    State.pools = {};
    for (const cat of CATEGORY_NAMES) {
      const idxs = [];
      ALL_QUESTIONS.forEach((q, idx) => { if (q.categoria === cat && !State.usedIds.has(q._id)) idxs.push(idx); });
      State.pools[cat] = shuffle(idxs);
    }
  }
  function drawQuestion(cat) {
    if (!CATEGORIES[cat]) return null;
    if (!State.pools[cat]?.length) {
      const fresh = [];
      ALL_QUESTIONS.forEach((q, idx) => { if (q.categoria === cat && !State.usedIds.has(q._id)) fresh.push(idx); });
      if (!fresh.length) ALL_QUESTIONS.forEach((q, idx) => {
        if (q.categoria === cat) { fresh.push(idx); State.usedIds.delete(q._id); } });
      State.pools[cat] = shuffle(fresh);
    }
    const idx = State.pools[cat].pop();
    if (idx === undefined) return null;
    State.usedIds.add(ALL_QUESTIONS[idx]._id);
    return ALL_QUESTIONS[idx];
  }
  // Setup
  function getCount() {
    const n = Number(el.playerCount?.textContent || el.playerCount?.value || 2);
    return Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, n || 2));
  }
  function setCount(n) {
    n = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, n));
    if (el.playerCount) {
      if ('value' in el.playerCount && el.playerCount.tagName === 'INPUT') el.playerCount.value = String(n);
      else el.playerCount.textContent = String(n);
    }
    return n;
  }
  function renderPlayerInputs(n) {
    if (!el.playersConfig) return;
    const prev = Array.from(el.playersConfig.querySelectorAll('.player-row')).map((row) => ({
      name: row.querySelector('input[type="text"]')?.value ?? '', color: row.querySelector('input[type="color"]')?.value ?? '' }));
    el.playersConfig.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const row = document.createElement('div');
      row.className = 'player-row';
      const color = prev[i]?.color || COLOR_PRESETS[i % COLOR_PRESETS.length];
      row.innerHTML = '<input type="text" data-player-name="' + i + '" maxlength="20" placeholder="Jugador ' + (i + 1) +
        '" value="' + esc(prev[i]?.name || '') + '"><input type="color" data-player-color="' + i + '" value="' + esc(color) + '">';
      el.playersConfig.appendChild(row);
    }
  }
  function initPlayersFromForm() {
    const n = getCount(), players = [];
    for (let i = 0; i < n; i++) {
      const ni = el.playersConfig?.querySelector('[data-player-name="' + i + '"]');
      const ci = el.playersConfig?.querySelector('[data-player-color="' + i + '"]');
      players.push(newPlayer(((ni?.value || '').trim() || 'Jugador ' + (i + 1)).slice(0, 20),
        ci?.value || COLOR_PRESETS[i % COLOR_PRESETS.length]));
    }
    State.players = players;
    State.current = 0;
    State.winMode = document.querySelector('input[name="win-mode"]:checked')?.value === 'medallas' ? 'medallas' : 'puntos';
    State.pointsGoal = Math.min(99, Math.max(1, Number(el.pointsGoal?.value) || 10));
    State.timeLimit = [0, 15, 30, 60].includes(Number(el.timeLimit?.value)) ? Number(el.timeLimit.value) : 0;
    State.usedIds = new Set();
    State.currentQ = null; State.currentCat = null;
    State.answered = false; State.awaitingPick = false; State.piqueteVictim = null;
    buildPools();
  }
  function syncSetupTimeLimit() {
    if (el.timeLimit) el.timeLimit.value = String(State.timeLimit ?? 0);
  }
  // Turno + scoreboard
  function updateTurn() {
    const p = currentPlayer();
    if (el.turnIndicator && p) {
      const coins = Number(p.coins) || 0, streak = Number(p.streak) || 0;
      let extra = '';
      if (State.piqueteVictim != null && State.players[State.piqueteVictim]) {
        extra = ' · 🔪 responde <strong>' + esc(State.players[State.piqueteVictim].name) + '</strong>';
      }
      el.turnIndicator.innerHTML = 'Turno: <span class="turn-dot" style="background:' + esc(p.color) + '"></span> <strong>' +
        esc(p.name) + '</strong> · ' + p.points + ' pts · ' + p.medals.length + '/' + CATEGORY_NAMES.length +
        ' · 🪙 ' + coins + ' · 🔥' + streak + extra +
        ' <span style="opacity:.8">(' + (State.winMode === 'puntos' ? 'meta ' + State.pointsGoal : 'medallas') + ')</span>';
    }
    renderScoreboard();
  }
  function renderScoreboard() {
    if (!el.scoreList) return;
    el.scoreList.innerHTML = '';
    State.players.forEach((p, i) => {
      const li = document.createElement('li');
      li.className = 'score-row' + (i === State.current ? ' current' : '');
      const medals = p.medals.map((m) => CATEGORIES[m]?.icon || '🏅').join(' ') || '—';
      li.innerHTML = '<span class="score-dot" style="background:' + esc(p.color) + '"></span>' +
        '<span class="score-name">' + esc(p.name) + (i === State.current ? ' 👈' : '') + '</span>' +
        '<span class="score-pts">' + p.points + ' pts · 🪙 ' + (Number(p.coins) || 0) + ' · 🔥' + (Number(p.streak) || 0) + '</span>' +
        '<span class="score-medals">' + esc(medals) + '</span>';
      el.scoreList.appendChild(li);
    });
  }
  function openScore() {
    renderScoreboard();
    if (el.scoreboard && typeof el.scoreboard.showModal === 'function' && el.scoreboard.tagName === 'DIALOG') {
      if (!el.scoreboard.open) el.scoreboard.showModal();
    } else {
      el.scoreboard?.classList.remove('hidden');
      el.scoreboard?.classList.add('open');
    }
  }
  function closeScore() {
    if (el.scoreboard && typeof el.scoreboard.close === 'function' && el.scoreboard.tagName === 'DIALOG' && el.scoreboard.open) {
      el.scoreboard.close();
    }
    el.scoreboard?.classList.add('hidden');
    el.scoreboard?.classList.remove('open');
  }
  // Timer
  function renderTimer() {
    if (!el.qTimer) return;
    if (!State.timeLimit || !State.currentQ || State.answered) { hide(el.qTimer); return; }
    show(el.qTimer);
    el.qTimer.classList.toggle('danger', timeLeft <= 10);
    if (el.qTimerLabel) el.qTimerLabel.textContent = '⏱️ ' + timeLeft + 's';
    if (el.qTimerBar) el.qTimerBar.style.width = (timerTotal ? Math.max(0, (timeLeft / timerTotal) * 100) : 0) + '%';
  }
  function clearTimer() {
    if (timerId) { clearInterval(timerId); timerId = null; }
    timerPaused = false;
  }
  function startTimer() {
    clearTimer();
    State.answered = false;
    if (!State.timeLimit || !State.currentQ) { hide(el.qTimer); return; }
    timeLeft = State.timeLimit; timerTotal = State.timeLimit;
    renderTimer();
    timerId = setInterval(() => {
      if (timerPaused) return;
      timeLeft -= 1;
      if (timeLeft <= 0) { timeLeft = 0; renderTimer(); onTimeout(); return; }
      renderTimer();
    }, 1000);
  }
  function pauseTimer() { timerPaused = true; }
  function resumeTimer() {
    if (!State.timeLimit || State.answered || !State.currentQ) return;
    timerPaused = false;
    renderTimer();
  }
  function onTimeout() {
    if (State.answered) return;
    State.answered = true;
    clearTimer();
    renderTimer();
    Array.from(el.qOptions?.querySelectorAll('.opt-btn') || []).forEach((b) => { b.disabled = true; });
    const r = responder();
    if (r && State.currentCat) registerMiss(r, State.currentCat);
    else { save(); updateTurn(); }
    toast('⏱️ ¡Se acabó el tiempo! Cuenta como fallo.');
    renderPowerups();
    show(el.btnNext);
    el.btnNext?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  // Stats / puntos / monedas
  function recordStat(p, cat, ok) {
    if (!p || !CATEGORIES[cat]) return;
    p.stats = p.stats || {};
    p.stats[cat] = p.stats[cat] || { ok: 0, total: 0 };
    p.stats[cat].total += 1;
    if (ok) p.stats[cat].ok += 1;
  }
  function addPoint() {
    const r = responder();
    if (!r || !State.currentCat) return;
    r.points += 1;
    if (!r.medals.includes(State.currentCat)) r.medals.push(State.currentCat);
    r.streak = (Number(r.streak) || 0) + 1;
    r.bestStreak = Math.max(Number(r.bestStreak) || 0, r.streak);
    let coinMsg = '';
    if (r.streak >= 2) { r.coins = (Number(r.coins) || 0) + 1; coinMsg = ' +1 🪙 (racha x' + r.streak + ' 🔥)'; }
    recordStat(r, State.currentCat, true);
    save(); updateTurn(); renderPowerups();
    checkVictory(r);
    return coinMsg;
  }
  function registerMiss(p, cat) {
    if (!p) return;
    p.streak = 0;
    if (cat) recordStat(p, cat, false);
    save(); updateTurn(); renderPowerups();
  }
  function checkVictory(p) {
    const wins = State.winMode === 'medallas' ? p.medals.length >= CATEGORY_NAMES.length : p.points >= State.pointsGoal;
    if (wins) showVictory(p);
    return wins;
  }
  function showVictory(p) {
    if (el.winnerName) el.winnerName.textContent = '🏆 ' + p.name + ' 🏆';
    if (el.winnerStats) el.winnerStats.textContent = p.points + ' puntos · ' + p.medals.length + '/' + CATEGORY_NAMES.length + ' medallas ' +
      p.medals.map((m) => CATEGORIES[m]?.icon || '').join(' ') + ' · 🪙 ' + (Number(p.coins) || 0) + ' · mejor racha x' + (Number(p.bestStreak) || 0);
    clearTimer();
    showView('victory');
    launchConfetti();
    save();
  }
  function launchConfetti() {
    const host = el.viewVictory || document.body;
    for (let i = 0; i < 80; i++) {
      const s = document.createElement('span');
      s.className = 'confetti-piece';
      s.style.cssText = 'position:absolute;top:-10px;left:' + (Math.random() * 100) + '%;background:' +
        (CATEGORIES[CATEGORY_NAMES[i % CATEGORY_NAMES.length]]?.color || '#fff') +
        ';width:8px;height:14px;display:inline-block;animation:confetti-fall ' +
        (2 + Math.random() * 2) + 's ease-in forwards;transform:rotate(' + (Math.random() * 360) + 'deg);';
      host.appendChild(s);
      setTimeout(() => s.remove(), 4500);
    }
  }
  // Ruleta + Mantequita
  async function spin() {
    if (!ALL_QUESTIONS.length) { toast('No hay preguntas cargadas.'); return; }
    const list = cells();
    if (!list.length) { toast('Falta la ruleta en el HTML (.roulette-cell).'); return; }
    if (el.btnSpin) el.btnSpin.disabled = true;
    clearTimer();
    hide(el.questionCard);
    hide(el.btnNext);
    hide(el.mantequitaNote);
    State.awaitingPick = false;
    State.piqueteVictim = null;
    State.answered = false;
    list.forEach((c) => c.classList.remove('selected', 'spinning', 'pickable'));
    let pos = Math.floor(Math.random() * list.length), delay = 80;
    const t0 = performance.now();
    while (performance.now() - t0 < 1400) {
      list.forEach((c) => c.classList.remove('spinning'));
      list[pos % list.length].classList.add('spinning');
      pos++;
      await sleep(delay);
      delay *= 1.12;
    }
    list.forEach((c) => c.classList.remove('spinning'));
    const cat = ROULETTE_OPTIONS[Math.floor(Math.random() * ROULETTE_OPTIONS.length)];
    const hitCell = list.find((c) => c.dataset.categoria === cat) || list[pos % list.length];
    hitCell.classList.add('selected');
    if (cat === MANTEQUITA) {
      State.awaitingPick = true;
      State.currentCat = null; State.currentQ = null;
      show(el.mantequitaNote);
      list.filter((c) => CATEGORIES[c.dataset.categoria]).forEach((c) => c.classList.add('pickable'));
      toast('🧈 ¡Mantequita! Tocá una categoría para elegir.');
      if (el.btnSpin) el.btnSpin.disabled = false;
      updateTurn();
      return;
    }
    State.currentCat = cat;
    const q = drawQuestion(cat);
    if (!q) { toast('Sin preguntas para ' + cat); if (el.btnSpin) el.btnSpin.disabled = false; return; }
    State.currentQ = q;
    save();
    renderQuestion(q, cat);
  }
  function pickCategory(cat) {
    if (!State.awaitingPick) return;
    if (!CATEGORIES[cat]) return;
    State.awaitingPick = false;
    hide(el.mantequitaNote);
    cells().forEach((c) => c.classList.remove('pickable'));
    cells().forEach((c) => c.classList.toggle('selected', c.dataset.categoria === cat));
    State.currentCat = cat;
    State.piqueteVictim = null;
    const q = drawQuestion(cat);
    if (!q) { toast('Sin preguntas para ' + cat); if (el.btnSpin) el.btnSpin.disabled = false; return; }
    State.currentQ = q;
    save();
    renderQuestion(q, cat);
  }
  // Pregunta
  function renderQuestion(q, cat) {
    const meta = CATEGORIES[cat] || MANTEQUITA_META;
    if (el.qCategory) { el.qCategory.textContent = meta.icon + ' ' + cat; el.qCategory.style.background = meta.color; }
    if (el.qText) {
      const prefix = (State.piqueteVictim != null && State.players[State.piqueteVictim]) ? '🔪 Responde ' + State.players[State.piqueteVictim].name + ': ' : '';
      el.qText.textContent = prefix + q.pregunta;
    }
    State.answered = false;
    show(el.questionCard);
    hide(el.btnNext);
    if (q.tipo === 'opciones') {
      show(el.qOptions);
      hide(el.qOpen);
      renderOptions(q);
    } else {
      hide(el.qOptions);
      if (el.qOptions) el.qOptions.innerHTML = '';
      show(el.qOpen);
      if (el.qAnswer) { el.qAnswer.textContent = q.respuesta; hide(el.qAnswer); }
      show(el.btnReveal);
      hide(el.btnHit);
      hide(el.btnMiss);
    }
    updateTurn();
    renderPowerups();
    startTimer();
    setTimeout(() => {
      if (!el.questionCard) return;
      const top = el.questionCard.getBoundingClientRect().top + window.scrollY - 76;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }, 60);
  }
  function renderOptions(q) {
    if (!el.qOptions) return;
    el.qOptions.innerHTML = '';
    const opts = shuffle(q.opciones.length ? q.opciones.slice(0, 4) : [q.respuesta]);
    if (!opts.some((o) => norm(o) === norm(q.respuesta))) opts[opts.length - 1] = q.respuesta;
    opts.forEach((text) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'opt-btn'; b.textContent = text;
      b.addEventListener('click', () => handleOptionClick(b, q), { once: true });
      el.qOptions.appendChild(b);
    });
  }
  function handleOptionClick(btn, q) {
    if (State.answered) return;
    State.answered = true;
    clearTimer();
    renderTimer();
    const ok = norm(btn.textContent) === norm(q.respuesta);
    Array.from(el.qOptions?.querySelectorAll('.opt-btn') || []).forEach((b) => {
      b.disabled = true;
      if (norm(b.textContent) === norm(q.respuesta)) b.classList.add('correct');
    });
    const r = responder();
    if (ok) {
      btn.classList.add('correct');
      const coinMsg = addPoint();
      toast('¡Correcto! +1 punto 🏆' + (coinMsg || ''));
    } else {
      btn.classList.add('wrong');
      if (r && State.currentCat) registerMiss(r, State.currentCat);
      toast('Incorrecto. Era: ' + q.respuesta);
    }
    renderPowerups();
    show(el.btnNext);
    el.btnNext?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function revealOpen() {
    show(el.qAnswer);
    hide(el.btnReveal);
    show(el.btnHit);
    show(el.btnMiss);
  }
  // Powerups
  function powerupLabel(key, emoji, name) {
    const r = responder();
    if (!r) return emoji + ' ' + name;
    if (r.powerups[key]) return emoji + ' ' + name + ' · GRATIS';
    return emoji + ' ' + name + ' · ' + COSTS[key] + '🪙';
  }
  function renderPowerups() {
    const q = State.currentQ, r = responder();
    const hasQ = !!(q && State.currentCat && !State.awaitingPick);
    const isOpen = q?.tipo === 'abierta';
    const done = State.answered || !hasQ;
    if (el.coinsHint && r) {
      el.coinsHint.textContent = '🪙 ' + (Number(r.coins) || 0) + ' de ' + r.name + ' · 🔥 racha x' + (Number(r.streak) || 0) + ' (1º=0🪙, cada seguido +1🪙)';
    }
    const setBtn = (btn, key, emoji, name, extraDisabled) => {
      if (!btn || !r) return;
      btn.innerHTML = esc(powerupLabel(key, emoji, name));
      let dis = done || !!extraDisabled;
      if (!dis && !r.powerups[key] && (Number(r.coins) || 0) < COSTS[key]) dis = true;
      btn.disabled = dis;
    };
    setBtn(el.pwFifty, 'fifty', '➗', '50/50', isOpen);
    setBtn(el.pwRemove, 'removeOne', '➖', 'Sacar 1', isOpen);
    setBtn(el.pwCall, 'call', '📞', 'Familiar', false);
    const piqueteExtra = State.piqueteVictim != null || (State.players.length < 2);
    setBtn(el.pwPiquete, 'piquete', '🔪', 'Piquete', piqueteExtra);
  }
  function tryConsume(p, key) {
    if (!p) return null;
    if (p.powerups[key]) { p.powerups[key] = false; save(); updateTurn(); renderPowerups(); return 'free'; }
    if ((Number(p.coins) || 0) >= COSTS[key]) { p.coins -= COSTS[key]; save(); updateTurn(); renderPowerups(); return 'paid'; }
    return null;
  }
  function eliminateWrong(n) {
    const q = State.currentQ;
    if (!q || q.tipo !== 'opciones') { toast('Solo sirve en opción múltiple.'); return 0; }
    const correct = norm(q.respuesta);
    const candidates = Array.from(el.qOptions?.querySelectorAll('.opt-btn') || [])
      .filter((b) => !b.classList.contains('eliminated') && !b.disabled && norm(b.textContent) !== correct);
    if (!candidates.length) { toast('Ya no hay opciones para quitar.'); return 0; }
    const victims = shuffle(candidates).slice(0, n);
    victims.forEach((b) => { b.classList.add('eliminated'); b.disabled = true; });
    return victims.length;
  }
  function useFifty() {
    if (State.answered || !State.currentQ) return;
    const r = responder();
    const mode = tryConsume(r, 'fifty');
    if (!mode) { toast('Te faltan 🪙 (50/50 cuesta ' + COSTS.fifty + ').'); return; }
    const k = eliminateWrong(2);
    if (!k) return;
    toast(mode === 'free' ? '➗ ¡50/50 gratis!' : '➗ ¡50/50 por ' + COSTS.fifty + '🪙!');
    renderPowerups();
  }
  function useRemoveOne() {
    if (State.answered || !State.currentQ) return;
    const r = responder();
    const mode = tryConsume(r, 'removeOne');
    if (!mode) { toast('Te faltan 🪙 (cuesta ' + COSTS.removeOne + ').'); return; }
    const k = eliminateWrong(1);
    if (!k) return;
    toast(mode === 'free' ? '➖ ¡Opción eliminada gratis!' : '➖ ¡Opción eliminada por ' + COSTS.removeOne + '🪙!');
    renderPowerups();
  }
  function useCall() {
    if (State.answered || !State.currentQ) return;
    const r = responder();
    const mode = tryConsume(r, 'call');
    if (!mode) { toast('Te faltan 🪙 (cuesta ' + COSTS.call + ').'); return; }
    pauseTimer();
    if (el.callCountdown) el.callCountdown.textContent = '60';
    if (el.modalCall && typeof el.modalCall.showModal === 'function') {
      if (!el.modalCall.open) el.modalCall.showModal();
    }
    let left = 60;
    if (callTimerId) clearInterval(callTimerId);
    callTimerId = setInterval(() => {
      left -= 1;
      if (el.callCountdown) el.callCountdown.textContent = String(Math.max(0, left));
      if (left <= 0 && callTimerId) { clearInterval(callTimerId); callTimerId = null; }
    }, 1000);
    toast(mode === 'free' ? '📞 ¡Llamada gratis! Timer en pausa.' : '📞 ¡Llamada por ' + COSTS.call + '🪙! Timer en pausa.');
    renderPowerups();
  }
  function closeCall() {
    if (callTimerId) { clearInterval(callTimerId); callTimerId = null; }
    if (el.modalCall?.open) { try { el.modalCall.close(); } catch { /* noop */ } }
    resumeTimer();
  }
  function weakestCat(idx) {
    const p = State.players[idx];
    if (!p) return CATEGORY_NAMES[0];
    let worst = null, worstRate = 2;
    for (const cat of CATEGORY_NAMES) {
      const s = p.stats?.[cat];
      if (s && s.total > 0) {
        const rate = s.ok / s.total;
        if (rate < worstRate) { worstRate = rate; worst = cat; }
      }
    }
    if (worst) return worst;
    const noMedal = CATEGORY_NAMES.filter((c) => !p.medals.includes(c));
    if (noMedal.length) return noMedal[Math.floor(Math.random() * noMedal.length)];
    return CATEGORY_NAMES[Math.floor(Math.random() * CATEGORY_NAMES.length)];
  }
  function openPiquete() {
    if (State.answered || !State.currentQ || State.players.length < 2) return;
    if (!el.modalPiquete || !el.piqueteList) return;
    el.piqueteList.innerHTML = '';
    State.players.forEach((p, i) => {
      if (i === State.current) return;
      const weak = weakestCat(i);
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn btn-secondary';
      const attacker = currentPlayer();
      const tag = attacker && !attacker.powerups.piquete ? ' · ' + COSTS.piquete + '🪙' : ' · GRATIS';
      b.textContent = '🔪 ' + p.name + ' → ' + (CATEGORIES[weak]?.icon || '') + ' ' + weak + tag;
      b.addEventListener('click', () => doPiquete(i));
      li.appendChild(b);
      el.piqueteList.appendChild(li);
    });
    if (typeof el.modalPiquete.showModal === 'function' && !el.modalPiquete.open) el.modalPiquete.showModal();
  }
  function doPiquete(victimIdx) {
    const attacker = currentPlayer();
    const victim = State.players[victimIdx];
    if (!attacker || !victim) return;
    const mode = tryConsume(attacker, 'piquete');
    if (!mode) { toast('Te faltan 🪙 (Piquete cuesta ' + COSTS.piquete + ').'); return; }
    try { el.modalPiquete?.close(); } catch { /* noop */ }
    const weak = weakestCat(victimIdx);
    State.piqueteVictim = victimIdx;
    State.currentCat = weak;
    State.answered = false;
    const q = drawQuestion(weak);
    if (!q) { toast('Sin preguntas para ' + weak); State.piqueteVictim = null; return; }
    State.currentQ = q;
    save();
    renderQuestion(q, weak);
    toast(mode === 'free' ? '🔪 ¡Piquete gratis a ' + victim.name + '!' : '🔪 ¡Piquete a ' + victim.name + ' por ' + COSTS.piquete + '🪙!');
  }
  // Turnos / reinicios
  function resetRoundUI() {
    State.currentQ = null; State.currentCat = null;
    State.answered = false; State.awaitingPick = false; State.piqueteVictim = null;
    clearTimer();
    hide(el.questionCard);
    hide(el.btnNext);
    hide(el.mantequitaNote);
    hide(el.qTimer);
    cells().forEach((c) => c.classList.remove('selected', 'spinning', 'pickable'));
    if (el.btnSpin) el.btnSpin.disabled = false;
  }
  function nextTurn() {
    if (!State.players.length) return;
    clearTimer();
    State.current = (State.current + 1) % State.players.length;
    resetRoundUI(); updateTurn(); save();
  }
  function restart() {
    State.players.forEach((p) => { p.points = 0; p.medals = []; p.coins = 0; p.streak = 0; p.bestStreak = 0;
      p.powerups = { fifty: true, removeOne: true, call: true, piquete: true }; p.stats = {}; });
    State.current = 0; State.usedIds = new Set();
    buildPools(); resetRoundUI();
    showView('game'); updateTurn(); save();
    toast('Partida reiniciada. ¡Suerte! 🎲');
  }
  function newPlayers() {
    clear();
    State.players = []; State.current = 0; State.usedIds = new Set(); State.pools = {};
    resetRoundUI(); renderPlayerInputs(getCount()); showView('setup');
  }
  // Eventos
  function bindEvents() {
    document.querySelectorAll('[data-action]').forEach((b) => b.addEventListener('click', () => {
      renderPlayerInputs(setCount(getCount() + (b.dataset.action === 'inc' ? 1 : -1)));
    }));
    el.setupForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!ALL_QUESTIONS.length) { toast('Aún no cargan las preguntas, intentá de nuevo.'); return; }
      initPlayersFromForm();
      showView('game'); updateTurn(); save();
      toast('¡Que empiece la carrera! 🎉');
    });
    el.btnSpin?.addEventListener('click', spin);
    el.roulette?.addEventListener('click', (e) => {
      const cell = e.target.closest?.('.roulette-cell');
      if (!cell || !State.awaitingPick) return;
      pickCategory(cell.dataset.categoria);
    });
    el.btnNext?.addEventListener('click', nextTurn);
    el.btnScore?.addEventListener('click', openScore);
    el.btnCloseScore?.addEventListener('click', closeScore);
    el.scoreboard?.addEventListener('click', (e) => { if (e.target === el.scoreboard) closeScore(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeScore(); } });
    el.btnReveal?.addEventListener('click', revealOpen);
    el.btnHit?.addEventListener('click', () => {
      if (State.answered) return;
      State.answered = true;
      clearTimer(); renderTimer();
      const coinMsg = addPoint();
      toast('¡Correcto! +1 punto 🏆' + (coinMsg || ''));
      hide(el.btnHit); hide(el.btnMiss); show(el.btnNext);
      renderPowerups();
      el.btnNext?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    el.btnMiss?.addEventListener('click', () => {
      if (State.answered) return;
      State.answered = true;
      clearTimer(); renderTimer();
      const r = responder();
      if (r && State.currentCat) registerMiss(r, State.currentCat);
      toast('Registrado como fallo. Siguiente turno.');
      hide(el.btnHit); hide(el.btnMiss); show(el.btnNext);
      renderPowerups();
      el.btnNext?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    el.pwFifty?.addEventListener('click', useFifty);
    el.pwRemove?.addEventListener('click', useRemoveOne);
    el.pwCall?.addEventListener('click', useCall);
    el.pwPiquete?.addEventListener('click', openPiquete);
    el.modalCall?.addEventListener('close', () => {
      if (callTimerId) { clearInterval(callTimerId); callTimerId = null; }
      resumeTimer();
    });
    el.btnRestart?.addEventListener('click', restart);
    el.btnNewPlayers?.addEventListener('click', newPlayers);
  }
  // Init
  async function init() {
    bindEvents();
    renderPlayerInputs(getCount());
    if (load()) { showView('game'); updateTurn(); syncSetupTimeLimit(); toast('Partida restaurada. ¡A seguir! ▶️'); }
    else showView('setup');
    await loadQuestions();
    buildPools();
  }
  init();
});
