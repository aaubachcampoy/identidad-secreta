import { store, mode } from './store.js?v=5';
import { COLORS, PANEL, POOL, PICTOS } from './data.js?v=5';

const $app = document.getElementById('app');
const S = mode === 'local' ? sessionStorage : localStorage;
const pid = S.getItem('is_pid') || (() => { const v = Math.random().toString(36).slice(2, 10); S.setItem('is_pid', v); return v; })();
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const handSize = n => n <= 4 ? 10 : n <= 6 ? 8 : 6;
const VALID = [...new Set(PICTOS)].filter(n => window.lucide?.icons?.[n]);
const deal = n => Array.from({ length: n }, () => shuffle(VALID).slice(0, 4));
const T90 = 90000;

function icon(name, cls = '') {
  let n = window.lucide?.icons?.[name]; if (!n) return '';
  if (n[0] === 'svg') n = n[2];
  const inner = n.map(([t, a]) => `<${t} ${Object.entries(a).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('');
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="${name}">${inner}</svg>`;
}
const players = room => Object.entries(room?.players || {}).map(([id, p]) => ({ id, ...p })).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
const colorOf = p => COLORS[p?.color] || { n: '', c: '#6E6E6E', l: '#B5B5B5' };
const plateBg = c => `linear-gradient(180deg,${c.l} 0%,${c.c} 75%)`;
const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const logo = size => `<div class="logo" style="font-size:${size}px"><span>IDENTIDAD</span><span>SECRETA</span></div>`;
const arr = v => Array.isArray(v) ? v : v ? Object.values(v) : [];

function plate(c, clues, tap, mini = false) {
  const list = arr(clues).map((x, k) => ({ ...x, k }));
  const pic = x => tap ? `<button class="pic" data-a="${tap}" data-k="${x.k}">${icon(x.c[x.f])}</button>` : `<div class="pic">${icon(x.c[x.f])}</div>`;
  const zone = (z, t) => `<div class="zone"><div class="zone-h"><span class="led ${z}"></span>${t}</div><div class="picks">${list.filter(x => x.z === z).map(pic).join('')}</div></div>`;
  return `<div class="plate${mini ? ' mini' : ''}" style="background:${plateBg(c)}">${zone('g', 'SÍ ES')}${zone('r', 'NO ES')}</div>`;
}

function paint(html) {
  const act = document.activeElement, id = act?.id;
  const vals = {}; $app.querySelectorAll('[data-keep]').forEach(e => { if (e.id) vals[e.id] = e.value; });
  const sel = id && act.selectionStart != null ? [act.selectionStart, act.selectionEnd] : null;
  const sc = window.scrollY;
  $app.innerHTML = html;
  for (const k in vals) { const e = document.getElementById(k); if (e && e.dataset.keep !== undefined) e.value = vals[k]; }
  if (id) { const e = document.getElementById(id); if (e) { e.focus({ preventScroll: true }); if (sel) try { e.setSelectionRange(...sel); } catch {} } }
  window.scrollTo(0, sc);
}

const actions = {};
$app.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (!b || b.disabled || b.tagName === 'FORM') return; e.preventDefault(); actions[b.dataset.a]?.(b.dataset); });
$app.addEventListener('submit', e => { e.preventDefault(); actions[e.target.dataset.a]?.(); });
$app.addEventListener('input', e => { if (e.target.id === 'custom') localStorage.setItem('is_custom', e.target.value); });
window.addEventListener('hashchange', () => location.reload());

const hash = location.hash.slice(1);
if (hash.startsWith('tv')) startTV(hash.split('/')[1]); else startPhone(hash.startsWith('join/') ? hash.split('/')[1] : '');

/* ============ PANTALLA COMÚN (anfitrión) ============ */
async function startTV(code) {
  document.body.dataset.theme = 'dark';
  if (!code) {
    const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    do { code = Array.from({ length: 4 }, () => L[Math.random() * L.length | 0]).join(''); } while (await store.get('rooms/' + code));
    await store.set('rooms/' + code, { phase: 'lobby', round: 0, createdAt: Date.now(), settings: { charMode: 'mix', timer: false } });
    history.replaceState(null, '', '#tv/' + code);
  }
  const R = 'rooms/' + code;
  let room = null; const done = new Set();

  store.on(R, v => { room = v; if (!room) return paint(`<div class="tv"><div class="center"><div class="h-d">ESA SALA NO EXISTE</div><a href="#tv" class="sub">Crear una sala nueva</a></div></div>`); host(); render(); });
  setInterval(() => {
    if (!room?.deadline || (room.phase !== 'clues' && room.phase !== 'vote')) return;
    const el = document.getElementById('clock'); if (el) el.textContent = fmt(room.deadline - Date.now());
    if (Date.now() > room.deadline) autoFill();
  }, 500);

  function host() {
    const ps = players(room), u = {};
    const used = new Set(ps.filter(p => p.color != null).map(p => p.color));
    ps.forEach(p => { if (p.color == null) { let c = 0; while (used.has(c)) c++; if (c < 8) { used.add(c); u[`players/${p.id}/color`] = c; } } });
    if (Object.keys(u).length) store.update(R, u);
    if (!ps.length) return;
    const key = room.round + ':' + room.phase;
    if (room.phase === 'clues' && ps.every(p => p.ready) && !done.has(key)) { done.add(key); store.update(R, { phase: 'vote', deadline: room.settings?.timer ? Date.now() + T90 : null }); }
    if (room.phase === 'vote' && ps.every(p => p.voted) && !done.has(key)) { done.add(key); score(); }
  }

  function newRound(r, first, ov = {}) {
    const ps = players(room), pool = ov.pool || room.pool || POOL, prev = first ? [] : arr(room.board);
    let deck = arr(ov.deck || room.deck).slice();
    if (deck.length < 8) deck = deck.concat(shuffle(pool.filter(x => !prev.includes(x) && !deck.includes(x))));
    const board = deck.slice(0, 8); deck = deck.slice(8);
    const keys = shuffle([1, 2, 3, 4, 5, 6, 7, 8]), hs = handSize(ps.length);
    const u = { phase: 'clues', round: r, board, deck, pool, reveal: null, deadline: room.settings?.timer ? Date.now() + T90 : null };
    ps.forEach((p, k) => {
      Object.assign(u, { [`players/${p.id}/ready`]: false, [`players/${p.id}/voted`]: false, [`players/${p.id}/clues`]: null, [`players/${p.id}/votes`]: null, [`players/${p.id}/last`]: null, [`private/${p.id}/secret`]: keys[k] });
      if (first) { u[`private/${p.id}/hand`] = deal(hs); u[`players/${p.id}/score`] = 0; }
    });
    store.update(R, u);
  }

  function score() {
    const ps = players(room), pr = room.private || {}, pts = {}, by = {}, hits = {};
    ps.forEach(p => { pts[p.id] = 0; by[p.id] = []; hits[p.id] = []; });
    ps.forEach(p => ps.forEach(o => {
      if (o.id !== p.id && (o.votes || {})[p.id] === pr[p.id]?.secret) { pts[p.id]++; pts[o.id]++; by[p.id].push(o.id); hits[o.id].push(p.id); }
    }));
    const u = { phase: 'reveal', deadline: null, reveal: {} };
    ps.forEach(p => { u.reveal[p.id] = pr[p.id]?.secret || 0; u[`players/${p.id}/score`] = (p.score || 0) + pts[p.id]; u[`players/${p.id}/last`] = { pts: pts[p.id], by: by[p.id], hits: hits[p.id] }; });
    store.update(R, u);
  }

  function autoFill() {
    const key = 'auto:' + room.round + ':' + room.phase; if (done.has(key)) return; done.add(key);
    const ps = players(room), pr = room.private || {}, u = {};
    if (room.phase === 'clues') ps.filter(p => !p.ready).forEach(p => {
      const hand = arr(pr[p.id]?.hand).slice(), clues = [];
      if (hand.length) { const x = Math.random() * hand.length | 0; clues.push({ c: hand[x], f: Math.random() * 4 | 0, z: Math.random() < .65 ? 'g' : 'r' }); hand.splice(x, 1); }
      u[`private/${p.id}/hand`] = hand; u[`players/${p.id}/clues`] = clues; u[`players/${p.id}/ready`] = true;
    });
    if (room.phase === 'vote') ps.filter(p => !p.voted).forEach(p => {
      const v = { ...(p.votes || {}) }; const free = shuffle([1, 2, 3, 4, 5, 6, 7, 8].filter(n => n !== pr[p.id]?.secret && !Object.values(v).includes(n))); ps.forEach(o => { if (o.id !== p.id && v[o.id] == null) v[o.id] = free.pop(); });
      u[`players/${p.id}/votes`] = v; u[`players/${p.id}/voted`] = true;
    });
    if (Object.keys(u).length) store.update(R, u);
  }

  Object.assign(actions, {
    charMode: d => store.update(R + '/settings', { charMode: d.v }),
    timer: () => store.update(R + '/settings', { timer: !room.settings?.timer }),
    kick: d => store.set(`${R}/players/${d.id}`, null),
    start: () => {
      if (players(room).length < 3) return;
      const cm = room.settings?.charMode || 'mix';
      const custom = [...new Set((localStorage.getItem('is_custom') || '').split('\n').map(s => s.trim()).filter(Boolean))];
      const pool = cm === 'pre' ? POOL.slice() : cm === 'own' && custom.length >= 8 ? custom : [...new Set([...custom, ...POOL])];
      newRound(1, true, { pool, deck: shuffle(pool) });
    },
    skip: () => autoFill(),
    next: () => room.round >= 4 ? store.update(R, { phase: 'final' }) : newRound(room.round + 1, false),
    again: () => {
      const u = { phase: 'lobby', round: 0, board: null, deck: null, pool: null, reveal: null, deadline: null, private: null };
      players(room).forEach(p => ['ready', 'voted', 'clues', 'votes', 'last', 'score'].forEach(k => u[`players/${p.id}/${k}`] = null));
      done.clear(); store.update(R, u);
    }
  });

  function render() {
    const ps = players(room), ph = room.phase;
    if (ph === 'lobby') return paint(lobby(ps));
    if (ph === 'final') return paint(finalView(ps));
    const phaseText = { clues: 'Cada jugador prepara sus pistas en su móvil', vote: 'Votad desde el móvil el personaje de cada rival', reveal: 'Resultados de la ronda' }[ph] || '';
    const live = ph === 'clues' || ph === 'vote';
    const bar = `<div class="tv-bar"><div class="h">RONDA ${room.round}/4</div><div class="s">${phaseText}</div><div style="flex:1"></div>
      ${room.deadline && live ? `<div id="clock" class="clock">${fmt(room.deadline - Date.now())}</div>` : ''}
      ${live ? `<button class="btn-s" data-a="skip">Completar a quien falte</button>` : ''}<div class="s">Sala ${code}</div></div>`;
    const board = `<div class="board" style="height:${ph === 'clues' ? '56vh' : '27vh'}">${arr(room.board).map((n, j) => `
      <div class="p8"><div class="strip" style="background:linear-gradient(180deg,${PANEL[j].l} 0%,${PANEL[j].c} 72%)"><i style="top:22%"></i><i style="top:44%"></i><i style="top:66%"></i><div class="num">${j + 1}</div></div><div class="cname">${esc(n)}</div></div>`).join('')}</div>`;
    let main = '';
    if (ph === 'clues') main = `<div class="status">${ps.map(p => `<div class="st"><span class="dot" style="width:28px;height:28px;background:${colorOf(p).c}"></span><div><b>${esc(p.name)}</b><small style="color:${p.ready ? '#8BE04E' : '#AAA'}">${p.ready ? 'Pistas listas' : 'Pensando…'}</small></div></div>`).join('')}</div>`;
    if (ph === 'vote') main = `<div class="plates">${ps.map(p => `<div class="plate" style="background:${plateBg(colorOf(p))}"><div class="plate-h"><span class="tag">${esc(p.name)}</span><span class="tag sm" style="color:${p.voted ? '#8BE04E' : '#AAA'}">${p.voted ? 'VOTADO' : 'VOTANDO'}</span></div>${plate(colorOf(p), p.clues).replace(/^<div class="plate"[^>]*>|<\/div>$/g, '')}</div>`).join('')}</div>`;
    if (ph === 'reveal') {
      const rk = ps.slice().sort((a, b) => (b.score || 0) - (a.score || 0)), max = Math.max(1, ...ps.map(p => p.score || 0));
      main = `<div class="reveal"><div class="rows">${ps.map(p => { const s = room.reveal?.[p.id] || 0, by = arr(p.last?.by); return `
        <div class="rrow"><span class="bar" style="background:${colorOf(p).c}"></span><span class="nm">${esc(p.name)}</span><span class="num">${s}</span><span class="ch">${esc(arr(room.board)[s - 1])}</span>
        <span style="display:flex;gap:3px">${by.map(id => `<span class="dot" style="width:14px;height:14px;background:${colorOf(room.players[id]).c};border:1px solid rgba(255,255,255,.4)"></span>`).join('')}</span><span class="pts">+${by.length}</span></div>`; }).join('')}</div>
        <div class="scores"><div class="h-d" style="font-size:1.3em">PUNTUACIÓN</div>${rk.map(p => `<div class="srow"><span class="nm">${esc(p.name)}</span><div class="track"><div style="width:${Math.round((p.score || 0) / max * 100)}%;background:${colorOf(p).c}"></div></div><b>${p.score || 0}</b></div>`).join('')}
        <div style="flex:1"></div><button class="btn" data-a="next">${room.round >= 4 ? 'VER GANADOR' : 'SIGUIENTE RONDA'}</button></div></div>`;
    }
    paint(`<div class="tv">${bar}${board}<div class="tv-main">${main}</div></div>`);
  }

  function lobby(ps) {
    const url = location.origin + location.pathname + '#join/' + code;
    const cm = room.settings?.charMode || 'mix', timer = !!room.settings?.timer;
    const help = { pre: `Se usa la lista predefinida de ${POOL.length} personajes.`, mix: `Lista predefinida de ${POOL.length} más los vuestros, uno por línea.`, own: 'Solo los vuestros, uno por línea. Mínimo 8; si no llegan, se mezclan con los predefinidos.' }[cm];
    return `<div class="tv"><div class="lobby">
      <div class="lob-l">${logo(64)}
        <div style="display:flex;flex-direction:column;gap:12px"><div class="sub" style="color:#BBB">Entra desde tu móvil con este código o escanea el QR</div>
          <div class="join-row"><div class="code">${code.split('').map(c => `<span>${c}</span>`).join('')}</div>
          <img class="qr" alt="QR para entrar" src="https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=0&data=${encodeURIComponent(url)}"></div>
          <div class="url">${esc(url)}</div>
          ${mode === 'local' ? `<div class="note">Modo local: Firebase no está configurado. Solo funciona entre pestañas de este navegador. Abre otras pestañas con la dirección de arriba para probar.</div>` : ''}
        </div></div>
      <div class="lob-r">
        <h3>JUGADORES ${ps.length}/8</h3>
        <div class="chips">${ps.length ? ps.map(p => `<div class="chip"><span class="dot" style="width:22px;height:22px;background:${colorOf(p).c}"></span>${esc(p.name)}<button data-a="kick" data-id="${p.id}" title="Quitar">${icon('X')}</button></div>`).join('') : '<span class="sub">Esperando a que entre alguien…</span>'}</div>
        <h3>PERSONAJES</h3>
        <div class="seg">${[['pre', 'Predefinidos'], ['mix', 'Mezcla'], ['own', 'Solo nuestros']].map(([k, l]) => `<button class="btn-s${cm === k ? ' on' : ''}" data-a="charMode" data-v="${k}">${l}</button>`).join('')}</div>
        <div class="sub" style="color:#BBB">${help}</div>
        ${cm !== 'pre' ? `<textarea id="custom" data-keep placeholder="La abuela Carmen&#10;El profe de mates&#10;Rosalía">${esc(localStorage.getItem('is_custom') || '')}</textarea>` : '<div style="flex:1"></div>'}
        <button class="btn-s${timer ? ' on' : ''}" data-a="timer">${timer ? 'Temporizador: 90 s por fase' : 'Sin temporizador'}</button>
        <button class="btn" data-a="start" ${ps.length < 3 ? 'disabled' : ''}>${ps.length < 3 ? 'MÍNIMO 3 JUGADORES' : 'EMPEZAR PARTIDA'}</button>
      </div></div></div>`;
  }

  function finalView(ps) {
    const pr = room.private || {}, cards = p => arr(pr[p.id]?.hand).length;
    const rk = ps.slice().sort((a, b) => (b.score || 0) - (a.score || 0) || cards(b) - cards(a));
    const top = rk[0], tie = rk[1] && (rk[1].score || 0) === (top.score || 0) && cards(rk[1]) === cards(top);
    return `<div class="tv"><div class="final">
      <div style="display:flex;flex-direction:column;justify-content:center;gap:12px"><div class="sub" style="color:#BBB">Fin de la partida. Gana</div>
        <div class="win" style="color:${tie ? '#fff' : colorOf(top).c}">${tie ? 'EMPATE' : esc(top?.name).toUpperCase()}</div>
        <div style="font-weight:600;font-size:1.2em">${top?.score || 0} puntos</div>
        <div class="sub">${tie ? 'Empate a puntos y a cartas restantes: comparten la victoria.' : 'En caso de empate gana quien conserve más cartas.'}</div></div>
      <div style="display:flex;flex-direction:column;gap:8px;justify-content:center">${rk.map((p, k) => `<div class="rank"><span class="pos">${k + 1}º</span><span class="dot" style="width:16px;height:16px;background:${colorOf(p).c}"></span><b style="flex:1">${esc(p.name)}</b><span class="sub">${cards(p)} cartas</span><b style="width:2em;text-align:right;font-size:1.3em">${p.score || 0}</b></div>`).join('')}
        <button class="btn" data-a="again" style="margin-top:12px">NUEVA PARTIDA</button></div>
    </div></div>`;
  }
}

/* ============ MÓVIL ============ */
function startPhone(prefill) {
  document.body.dataset.theme = localStorage.getItem('is_theme') || 'dark';
  let code = S.getItem('is_code') || '', room = null, unsub = null, err = '', loaded = false;
  const ui = { key: '', sel: null, face: null, hide: false, draft: null, votes: {}, board: false };
  const R = () => 'rooms/' + code;
  const me = () => room?.players?.[pid];

  function sub(c) {
    unsub?.(); code = c; S.setItem('is_code', c); loaded = false;
    unsub = store.on('rooms/' + c, v => { room = v; loaded = true; sync(); render(); });
  }
  function sync() {
    if (!room) return;
    const k = room.round + ':' + room.phase;
    if (ui.key !== k) {
      ui.key = k; ui.sel = null; ui.face = null;
      if (room.phase === 'clues') ui.draft = { hand: arr(room.private?.[pid]?.hand).slice(), clues: [] };
      if (room.phase === 'vote') ui.votes = {};
    }
  }
  const leave = () => { unsub?.(); unsub = null; S.removeItem('is_code'); code = ''; room = null; render(); };

  Object.assign(actions, {
    join: async () => {
      const c = (document.getElementById('code')?.value || '').trim().toUpperCase();
      const name = (document.getElementById('name')?.value || '').trim().slice(0, 12);
      if (!c || !name) { err = 'Escribe el código de sala y tu nombre.'; return render(); }
      const r = await store.get('rooms/' + c);
      if (!r) { err = 'Esa sala no existe.'; return render(); }
      const ex = r.players?.[pid];
      if (!ex && r.phase !== 'lobby') { err = 'La partida ya ha empezado.'; return render(); }
      if (!ex && Object.keys(r.players || {}).length >= 8) { err = 'La sala está completa.'; return render(); }
      localStorage.setItem('is_name', name); err = '';
      await store.update(`rooms/${c}/players/${pid}`, { name, joinedAt: ex?.joinedAt || Date.now() });
      sub(c);
    },
    leave: async () => { if (room?.phase === 'lobby') await store.set(`${R()}/players/${pid}`, null); leave(); },
    theme: () => { const t = document.body.dataset.theme === 'dark' ? 'light' : 'dark'; document.body.dataset.theme = t; localStorage.setItem('is_theme', t); render(); },
    hide: () => { ui.hide = !ui.hide; render(); },
    board: () => { ui.board = !ui.board; render(); },
    pick: d => { const k = +d.k; ui.sel = ui.sel === k ? null : k; ui.face = null; render(); },
    face: d => { ui.face = +d.f; render(); },
    zone: d => {
      const D = ui.draft; if (ui.sel == null || ui.face == null || D.clues.length >= 3) return;
      const [c] = D.hand.splice(ui.sel, 1); D.clues.push({ c, f: ui.face, z: d.z }); ui.sel = null; ui.face = null; render();
    },
    unplace: d => { const D = ui.draft; const [x] = D.clues.splice(+d.k, 1); D.hand.push(x.c); render(); },
    confirm: () => {
      const D = ui.draft; if (!D || (!D.clues.length && D.hand.length)) return;
      store.update(R(), { [`private/${pid}/hand`]: D.hand, [`players/${pid}/clues`]: D.clues, [`players/${pid}/ready`]: true });
    },
    vote: d => { const n = +d.n; if (ui.votes[d.o] === n) delete ui.votes[d.o]; else ui.votes[d.o] = n; render(); },
    send: () => {
      const opps = players(room).filter(p => p.id !== pid); if (!opps.every(o => ui.votes[o.id])) return;
      store.update(`${R()}/players/${pid}`, { votes: ui.votes, voted: true });
    }
  });

  function render() {
    if (code && !loaded) return paint(`<div class="phone"><div class="center sub">Conectando…</div></div>`);
    if (code && loaded && !room) { S.removeItem('is_code'); code = ''; err = 'La sala ya no existe.'; }
    const m = me();
    if (!code || !m) return paint(joinView());
    const ph = room.phase, c = colorOf(m), sec = room.private?.[pid]?.secret, board = arr(room.board);
    const top = `<div class="ph-top" style="background:${c.c}"><span class="tag">${esc(m.name)}</span><div style="flex:1"></div>
      <span class="tag sm">${['clues', 'vote', 'reveal'].includes(ph) ? `RONDA ${room.round}/4` : ph === 'final' ? 'FINAL' : 'SALA ' + code}</span>
      <button class="icon-btn" data-a="theme" title="Cambiar tema">${icon(document.body.dataset.theme === 'dark' ? 'Sun' : 'Moon')}</button>
      ${board.length && ['clues', 'vote', 'reveal'].includes(ph) ? `<button class="icon-btn" data-a="board" title="Ver personajes">${icon('LayoutGrid')}</button>` : ''}
      ${ph === 'lobby' ? `<button class="icon-btn" data-a="leave" title="Salir">${icon('LogOut')}</button>` : ''}</div>`;
    const secret = sec ? `<button class="secret" data-a="hide" style="border-color:${PANEL[sec - 1].c}"><span class="num">${ui.hide ? '?' : sec}</span><span><small>TU PERSONAJE · TOCA PARA ${ui.hide ? 'VER' : 'OCULTAR'}</small><b>${ui.hide ? 'Oculto' : esc(board[sec - 1])}</b></span></button>` : '';
    let body = '';

    if (ph === 'lobby') body = `<div class="center"><span class="dot" style="width:76px;height:76px;background:${c.c};border:4px solid #000"></span><div class="h-d">DENTRO</div><div class="sub">Sala ${code}. Mira la pantalla común: la partida empieza cuando el anfitrión lo diga.</div></div>`;

    else if (ph === 'clues' && !m.ready) {
      const D = ui.draft || { hand: [], clues: [] }, full = D.clues.length >= 3, selC = ui.sel != null ? D.hand[ui.sel] : null;
      const faceBtn = f => `<button class="face${ui.face === f ? ' sel' : ''}" data-a="face" data-f="${f}">${icon(selC[f])}</button>`;
      body = `${secret}${plate(c, D.clues, 'unplace')}
        <div class="sub" style="font-size:13px">${full ? 'Ya tienes 3 pistas. Toca una colocada para devolverla a la mano.' : `Toca una carta, elige uno de sus cuatro pictogramas y colócalo en «Sí es» o «No es». Entre 1 y 3 pistas. Las cartas usadas no se reponen (${D.hand.length} en mano).`}</div>
        ${selC && !full ? `<div class="box"><div class="lbl">ELIGE QUÉ PICTOGRAMA MOSTRAR</div><div class="faces"><div><div class="lbl">DELANTE</div><div class="row">${faceBtn(0)}${faceBtn(1)}</div></div><div><div class="lbl">DETRÁS</div><div class="row">${faceBtn(2)}${faceBtn(3)}</div></div></div>
          ${ui.face != null ? `<div class="row2"><button class="zbtn g" data-a="zone" data-z="g">A «SÍ ES»</button><button class="zbtn r" data-a="zone" data-z="r">A «NO ES»</button></div>` : ''}</div>` : ''}
        <div class="hand">${D.hand.map((x, k) => `<button class="hcard${ui.sel === k ? ' sel' : ''}" data-a="pick" data-k="${k}">${icon(x[0])}<hr>${icon(x[1], 'flip')}</button>`).join('')}</div>
        <button class="btn" data-a="confirm" ${D.clues.length || !D.hand.length ? '' : 'disabled'}>CONFIRMAR PISTAS</button>`;
    }

    else if (ph === 'vote' && !m.voted) {
      const opps = players(room).filter(p => p.id !== pid);
      const taken = (o, n) => n === sec || Object.entries(ui.votes).some(([k, v]) => k !== o && v === n);
      body = `${secret}<div class="sub" style="font-size:13px">Elige el número del personaje de cada rival según sus pistas. Cada número solo se usa una vez y el tuyo no está disponible.</div>
        ${opps.map(o => `<div class="box"><div class="opp-h"><span class="dot" style="width:14px;height:14px;background:${colorOf(o).c}"></span>${esc(o.name)}</div>${plate(colorOf(o), o.clues, null, true)}
          <div class="nums">${PANEL.map((p, j) => `<button class="nbtn${ui.votes[o.id] === j + 1 ? ' sel' : ''}" style="background:${p.c}" data-a="vote" data-o="${o.id}" data-n="${j + 1}" ${taken(o.id, j + 1) ? 'disabled' : ''}>${j + 1}</button>`).join('')}</div></div>`).join('')}
        <button class="btn" data-a="send" ${opps.every(o => ui.votes[o.id]) ? '' : 'disabled'}>ENVIAR VOTOS</button>`;
    }

    else if (ph === 'clues' || ph === 'vote') body = `${secret}<div class="center"><div class="h-d">${ph === 'clues' ? 'PISTAS ENVIADAS' : 'VOTOS ENVIADOS'}</div><div class="sub">Esperando al resto de jugadores.</div></div>`;

    else if (ph === 'reveal') {
      const L = m.last || {}, names = a => arr(a).length ? arr(a).map(id => esc(room.players[id]?.name)).join(', ') : 'nadie', s = room.reveal?.[pid];
      body = `<div class="box" style="align-items:center;padding:18px"><div class="lbl">ESTA RONDA</div><div class="big" style="font-size:64px;color:var(--red)">+${L.pts || 0}</div><div style="font-weight:600">Total: ${m.score || 0} puntos</div></div>
        <div class="sub" style="color:var(--fg)">Tu personaje era <b>${esc(board[s - 1])}</b>.</div>
        <div class="sub" style="color:var(--fg)"><b>Te han adivinado:</b> ${names(L.by)}</div>
        <div class="sub" style="color:var(--fg)"><b>Has acertado:</b> ${names(L.hits)}</div>
        <div class="sub">Te quedan ${arr(room.private?.[pid]?.hand).length} cartas.</div>`;
    }

    else if (ph === 'final') {
      const pr = room.private || {}, cards = p => arr(pr[p.id]?.hand).length;
      const rk = players(room).sort((a, b) => (b.score || 0) - (a.score || 0) || cards(b) - cards(a));
      body = `<div class="center"><div class="lbl">POSICIÓN FINAL</div><div class="big">${rk.findIndex(p => p.id === pid) + 1}º</div><div style="font-weight:600">${m.score || 0} puntos</div></div>`;
    }

    const sheet = ui.board && board.length && ['clues', 'vote', 'reveal'].includes(ph) ? `<div class="sheet-bg" data-a="board"></div><div class="sheet"><div class="sheet-h"><span class="lbl">PERSONAJES · RONDA ${room.round}</span><button class="icon-btn" data-a="board" title="Cerrar">${icon('X')}</button></div>
      <div class="mboard">${board.map((n, j) => `<div class="mcol${j + 1 === sec && !ui.hide ? ' me' : ''}"><div class="mstrip" style="background:linear-gradient(180deg,${PANEL[j].l} 0%,${PANEL[j].c} 72%)"><i style="top:22%"></i><i style="top:44%"></i><i style="top:66%"></i><span class="mnum">${j + 1}</span></div><div class="mname">${esc(n)}</div></div>`).join('')}</div></div>` : '';
    paint(`<div class="phone">${top}<div class="ph-body">${body}</div>${sheet}</div>`);
  }

  function joinView() {
    return `<div class="phone"><div class="ph-top" style="justify-content:flex-end"><button class="icon-btn" data-a="theme" title="Cambiar tema">${icon(document.body.dataset.theme === 'dark' ? 'Sun' : 'Moon')}</button></div>
      <form class="ph-body" data-a="join" style="justify-content:center">
        <div style="text-align:center;margin-bottom:16px">${logo(34)}</div>
        <label class="field"><span class="lbl">CÓDIGO DE SALA</span><input id="code" data-keep class="code-in" maxlength="4" autocomplete="off" autocapitalize="characters" placeholder="ABCD" value="${esc(prefill || '')}"></label>
        <label class="field"><span class="lbl">TU NOMBRE</span><input id="name" data-keep maxlength="12" autocomplete="nickname" value="${esc(localStorage.getItem('is_name') || '')}"></label>
        ${err ? `<div class="err">${esc(err)}</div>` : ''}
        <button class="btn" type="submit">ENTRAR</button>
        <a class="link" href="#tv">Usar este dispositivo como pantalla común</a>
      </form></div>`;
  }

  if (code) sub(code); else render();
}
