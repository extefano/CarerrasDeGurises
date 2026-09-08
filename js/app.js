'use strict';
/* Carrera de Gurises — vanilla, sin dependencias. IDs del contrato usados tal cual. */
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
  const COLOR_PRESETS = ['#FF5252', '#448AFF', '#FFC107', '#4CAF50', '#E91E63', '#00BCD4', '#9C27B0', '#FF9800', '#8BC34A', '#795548'];
  const STORE_KEY = 'carrera-gurises-v1', MIN_PLAYERS = 1, MAX_PLAYERS = 10;
  // Estado (contrato)
  const State = { players: [], current: 0, winMode: 'puntos', pointsGoal: 10,
    pools: {}, usedIds: new Set(), currentQ: null, currentCat: null };
  let ALL_QUESTIONS = [], toastTimer = null;
  // Cache DOM (no renombrar IDs)
  const $ = (id) => document.getElementById(id);
  const el = { viewSetup: $('view-setup'), setupForm: $('setup-form'), playerCount: $('player-count'),
    playersConfig: $('players-config'), pointsGoal: $('points-goal'), viewGame: $('view-game'),
    turnIndicator: $('turn-indicator'), btnScore: $('btn-score'), roulette: $('roulette'),
    btnSpin: $('btn-spin'), questionCard: $('question-card'), qCategory: $('q-category'),
    qText: $('q-text'), qOptions: $('q-options'), qOpen: $('q-open'), btnReveal: $('btn-reveal'),
    qAnswer: $('q-answer'), btnHit: $('btn-hit'), btnMiss: $('btn-miss'), btnNext: $('btn-next'),
    viewVictory: $('view-victory'), winnerName: $('winner-name'), winnerStats: $('winner-stats'),
    btnRestart: $('btn-restart'), btnNewPlayers: $('btn-new-players'), scoreboard: $('scoreboard'),
    scoreList: $('score-list'), btnCloseScore: $('btn-close-score'), toast: $('toast') };
  const cells = () => Array.from(document.querySelectorAll('.roulette-cell[data-categoria]'));
  // Helpers
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s ?? '').trim().toLowerCase();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const currentPlayer = () => State.players[State.current];
  function toast(msg) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2600);
  }
  // Helpers show/hide: manejan clase + atributo hidden (el HTML usa hidden)
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
  // Fisher-Yates
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  // Persistencia
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ players: State.players, current: State.current,
        winMode: State.winMode, pointsGoal: State.pointsGoal, usedIds: [...State.usedIds] }));
    } catch { /* sin storage: el juego sigue */ }
  }
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (!d || !Array.isArray(d.players) || !d.players.length) return false;
      State.players = d.players.filter((p) => p && typeof p.name === 'string').map((p) => ({
        name: String(p.name).slice(0, 20) || 'Jugador', color: p.color || '#448AFF',
        points: Number(p.points) || 0, medals: Array.isArray(p.medals) ? p.medals.filter((m) => CATEGORIES[m]) : [] }));
      if (!State.players.length) return false;
      State.current = Math.min(Math.max(0, Number(d.current) || 0), State.players.length - 1);
      State.winMode = d.winMode === 'medallas' ? 'medallas' : 'puntos';
      State.pointsGoal = Math.min(99, Math.max(1, Number(d.pointsGoal) || 10));
      State.usedIds = new Set(Array.isArray(d.usedIds) ? d.usedIds : []);
      return true;
    } catch { return false; }
  }
  function clear() { try { localStorage.removeItem(STORE_KEY); } catch { /* noop */ } }
  // Preguntas: normaliza formatos (categoria/pregunta/opciones/respuesta_correcta o aliases)
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
      const res = await fetch('./data/preguntas.json');
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
  // Pop del pool; si vacía rebaraja excluyendo usadas; si todo usado, permite repetir.
  function drawQuestion(cat) {
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
  // Setup: stepper + inputs
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
      players.push({ name: ((ni?.value || '').trim() || 'Jugador ' + (i + 1)).slice(0, 20),
        color: ci?.value || COLOR_PRESETS[i % COLOR_PRESETS.length], points: 0, medals: [] });
    }
    State.players = players;
    State.current = 0;
    State.winMode = document.querySelector('input[name="win-mode"]:checked')?.value === 'medallas' ? 'medallas' : 'puntos';
    State.pointsGoal = Math.min(99, Math.max(1, Number(el.pointsGoal?.value) || 10));
    State.usedIds = new Set();
    State.currentQ = null; State.currentCat = null;
    buildPools();
  }
  // Turno + scoreboard modal
  function updateTurn() {
    const p = currentPlayer();
    if (el.turnIndicator && p) {
      el.turnIndicator.innerHTML = 'Turno: <span class="turn-dot" style="background:' + esc(p.color) + '"></span> <strong>' +
        esc(p.name) + '</strong> · ' + p.points + ' pts · ' + p.medals.length + '/9 ' +
        (State.winMode === 'puntos' ? '(meta ' + State.pointsGoal + ')' : '(medallas)');
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
        '<span class="score-pts">' + p.points + ' pts</span><span class="score-medals">' + esc(medals) + '</span>';
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
  // Ruleta: anima celdas .spinning ~1.4s acelerando, elige categoría y pregunta
  async function spin() {
    if (!ALL_QUESTIONS.length) { toast('No hay preguntas cargadas.'); return; }
    const list = cells();
    if (!list.length) { toast('Falta la ruleta en el HTML (.roulette-cell).'); return; }
    if (el.btnSpin) el.btnSpin.disabled = true;
    hide(el.questionCard);
    hide(el.btnNext);
    list.forEach((c) => c.classList.remove('selected', 'spinning'));
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
    const cat = CATEGORY_NAMES[Math.floor(Math.random() * CATEGORY_NAMES.length)];
    State.currentCat = cat;
    (list.find((c) => c.dataset.categoria === cat) || list[pos % list.length]).classList.add('selected');
    const q = drawQuestion(cat);
    if (!q) { toast('Sin preguntas para ' + cat); if (el.btnSpin) el.btnSpin.disabled = false; return; }
    State.currentQ = q;
    save();
    renderQuestion(q, cat);
  }
  // Pregunta: badge color/icono; opciones barajadas o modo abierta
  function renderQuestion(q, cat) {
    const meta = CATEGORIES[cat] || { color: '#999', icon: '❓' };
    if (el.qCategory) { el.qCategory.textContent = meta.icon + ' ' + cat; el.qCategory.style.background = meta.color; }
    if (el.qText) el.qText.textContent = q.pregunta;
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
    requestAnimationFrame(() => {
      el.questionCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.qText?.setAttribute('tabindex', '-1');
      el.qText?.focus({ preventScroll: true });
    });
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
    const ok = norm(btn.textContent) === norm(q.respuesta);
    Array.from(el.qOptions?.querySelectorAll('.opt-btn') || []).forEach((b) => {
      b.disabled = true;
      if (norm(b.textContent) === norm(q.respuesta)) b.classList.add('correct');
    });
    if (ok) { btn.classList.add('correct'); toast('¡Correcto! +1 punto 🏆'); addPoint(); }
    else { btn.classList.add('wrong'); toast('Incorrecto. Era: ' + q.respuesta); }
    show(el.btnNext);
    el.btnNext?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function revealOpen() {
    show(el.qAnswer);
    hide(el.btnReveal);
    show(el.btnHit);
    show(el.btnMiss);
  }
  // Puntos / victoria
  function addPoint() {
    const p = currentPlayer();
    if (!p || !State.currentCat) return;
    p.points += 1;
    if (!p.medals.includes(State.currentCat)) p.medals.push(State.currentCat);
    save(); updateTurn(); checkVictory(p);
  }
  function checkVictory(p) {
    const wins = State.winMode === 'medallas' ? p.medals.length >= CATEGORY_NAMES.length : p.points >= State.pointsGoal;
    if (wins) showVictory(p);
    return wins;
  }
  function showVictory(p) {
    if (el.winnerName) el.winnerName.textContent = '🏆 ' + p.name + ' 🏆';
    if (el.winnerStats) el.winnerStats.textContent = p.points + ' puntos · ' + p.medals.length + '/9 medallas ' +
      p.medals.map((m) => CATEGORIES[m]?.icon || '').join(' ');
    showView('victory');
    launchConfetti();
    save(); // se mantiene hasta restart / new-players
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
  // Turnos / reinicios
  function resetRoundUI() {
    State.currentQ = null; State.currentCat = null;
    hide(el.questionCard);
    hide(el.btnNext);
    cells().forEach((c) => c.classList.remove('selected', 'spinning'));
    if (el.btnSpin) el.btnSpin.disabled = false;
  }
  function nextTurn() {
    if (!State.players.length) return;
    State.current = (State.current + 1) % State.players.length;
    resetRoundUI(); updateTurn(); save();
  }
  function restart() {
    State.players.forEach((p) => { p.points = 0; p.medals = []; });
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
    el.btnNext?.addEventListener('click', nextTurn);
    el.btnScore?.addEventListener('click', openScore);
    el.btnCloseScore?.addEventListener('click', closeScore);
    el.scoreboard?.addEventListener('click', (e) => { if (e.target === el.scoreboard) closeScore(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeScore(); });
    el.btnReveal?.addEventListener('click', revealOpen);
    el.btnHit?.addEventListener('click', () => {
      toast('¡Correcto! +1 punto 🏆'); addPoint();
      hide(el.btnHit); hide(el.btnMiss); show(el.btnNext);
      el.btnNext?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    el.btnMiss?.addEventListener('click', () => {
      toast('Registrado como fallo. Siguiente turno.');
      hide(el.btnHit); hide(el.btnMiss); show(el.btnNext);
      el.btnNext?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    el.btnRestart?.addEventListener('click', restart);
    el.btnNewPlayers?.addEventListener('click', newPlayers);
  }
  // Init: restaura save si válido (game) sino setup; luego carga preguntas y arma pools
  async function init() {
    bindEvents();
    renderPlayerInputs(getCount());
    if (load()) { showView('game'); updateTurn(); toast('Partida restaurada. ¡A seguir! ▶️'); }
    else showView('setup');
    await loadQuestions();
    buildPools();
  }
  init();
});
