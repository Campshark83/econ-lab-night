import { createNet } from './net.js';
import { GAMES, GAME_ORDER, rngFrom } from './games.js';
import { esc } from './charts.js';

const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const ONLINE_MS = 12000;
const MAX_PLAYERS = 40;
const BRIEF = {
  beauty: 'Pick 0–100. Closest to ⅔ of the average wins.',
  public: '10 tokens each. The pot is doubled and shared by all.',
  ultimatum: 'Offer a split of $10 to one player, set your minimum for another.',
  auction: 'Bid on a jar of coins using a noisy private estimate.',
  farol: 'Go out or stay home. The bar is only fun if it isn’t packed.',
};

const S = {
  net: null, code: null, pid: null, room: null, unsub: null,
  stageKey: null, hb: null, tick: null, connected: true, notice: '',
};

// ---------- session ----------
const sess = {
  load() { try { return JSON.parse(sessionStorage.getItem('eln-session')); } catch { return null; } },
  save(code, pid) { try { sessionStorage.setItem('eln-session', JSON.stringify({ code, pid })); } catch {} },
  clear() { try { sessionStorage.removeItem('eln-session'); } catch {} },
};
const savedName = () => { try { return localStorage.getItem('eln-name') || ''; } catch { return ''; } };
const saveName = n => { try { localStorage.setItem('eln-name', n); } catch {} };
const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const now = () => S.net.serverNow();
const roomPath = (p = '') => `rooms/${S.code}${p ? '/' + p : ''}`;

// ---------- helpers on room ----------
const players = r => Object.entries(r?.players || {}).map(([id, p]) => ({ id, ...p })).sort((a, b) => a.joinedAt - b.joinedAt);
const isOnline = (r, id) => { const t = r?.presence?.[id]; return !!t && now() - t < ONLINE_MS; };
const nameOf = (r, id) => r?.players?.[id]?.name || 'Someone who left';
const isHost = () => S.room && S.room.hostId === S.pid;
const amPlayer = () => !!S.room?.players?.[S.pid];
function leaderId(r) {
  const order = [r.hostId, ...players(r).map(p => p.id)];
  return order.find(id => isOnline(r, id)) || r.hostId;
}
const amLeader = () => S.room && leaderId(S.room) === S.pid;
const curRound = r => (r && r.roundIdx >= 0 ? r.rounds?.['r' + r.roundIdx] : null);
const joinUrl = code => {
  const u = new URL(location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('room', code);
  if (S.net?.kind === 'mock') u.searchParams.set('mock', '1');
  return u.toString();
};

// ---------- boot ----------
async function boot() {
  try {
    S.net = await createNet();
  } catch (e) {
    app.innerHTML = `<main class="wrap"><div class="panel"><h2>Can’t reach the game server</h2><p>Check your connection and reload the page.</p></div></main>`;
    return;
  }
  S.net.onConnection(c => { S.connected = c; renderConn(); });
  const s = sess.load();
  if (s?.code && s?.pid) {
    const room = await S.net.get(`rooms/${s.code}`);
    if (room && (room.hostId === s.pid || room.players?.[s.pid])) { enterRoom(s.code, s.pid); return; }
    sess.clear();
  }
  renderHome();
}

// ---------- home ----------
function renderHome(msg = '') {
  stopRoom();
  const pre = (new URLSearchParams(location.search).get('room') || '').toUpperCase().slice(0, 4);
  app.innerHTML = `
  <main class="wrap home">
    <header class="hero">
      <p class="kicker">A party game for 2–40 people</p>
      <h1>Econ Lab Night</h1>
      <p class="lede">Five quick games that are secretly famous economics experiments. Play from any phone, then see how your group compares to game theory and to real lab results.</p>
    </header>
    ${msg ? `<p class="flash" role="alert">${esc(msg)}</p>` : ''}
    <section class="panel join" aria-labelledby="join-h">
      <h2 id="join-h">Join a game</h2>
      <form id="join-form" autocomplete="off">
        <label class="field"><span>Room code</span>
          <input id="j-code" class="code-input" maxlength="4" inputmode="text" autocapitalize="characters" spellcheck="false" placeholder="ABCD" value="${esc(pre)}" required></label>
        <label class="field"><span>Your name</span>
          <input id="j-name" maxlength="16" placeholder="First name or nickname" value="${esc(savedName())}" required></label>
        <button class="btn primary big" type="submit">Join game</button>
      </form>
    </section>
    <section class="panel host" aria-labelledby="host-h">
      <h2 id="host-h">Host a game</h2>
      <p>Get a room code to share. Everyone joins from their own phone or laptop. No accounts, no downloads.</p>
      <button id="go-host" class="btn big">Host a game</button>
    </section>
    <section class="about">
      <h2>How a night goes</h2>
      <ol class="steps">
        <li><strong>Host</strong> opens a room and shares the code or QR.</li>
        <li><strong>Everyone decides</strong> privately on their phone, against a timer.</li>
        <li><strong>The reveal</strong> charts every choice next to what theory predicts and what real experiments found.</li>
      </ol>
      <h2>The five experiments</h2>
      <ul class="games-list">
        ${GAME_ORDER.map(k => `<li><strong>${esc(GAMES[k].title)}</strong><span>${esc(GAMES[k].short)}. ${esc(BRIEF[k])}</span></li>`).join('')}
      </ul>
      <h2>Running it in a class or club</h2>
      <p>Choose “Present on a shared screen” when you host. Your screen becomes the projector view with a big code and QR, students play on their phones, and you can copy a results summary at the end for discussion.</p>
    </section>
    <footer class="foot">Built for the Handshake × OpenAI multiplayer game challenge. Your answers are kept only for this room.</footer>
  </main>`;
  $('#j-code').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); });
  $('#join-form').addEventListener('submit', e => { e.preventDefault(); joinRoom($('#j-code').value, $('#j-name').value); });
  $('#go-host').addEventListener('click', renderSetup);
  if (pre.length === 4) $('#j-name').focus();
}

function renderSetup() {
  app.innerHTML = `
  <main class="wrap">
    <button class="link back" id="back">Back</button>
    <section class="panel">
      <h2>Host a game</h2>
      <form id="host-form">
        <fieldset class="mode">
          <legend>How are you hosting?</legend>
          <label class="radio-card"><input type="radio" name="mode" value="play" checked><span><strong>Play along</strong><small>You host from your phone and play too.</small></span></label>
          <label class="radio-card"><input type="radio" name="mode" value="present"><span><strong>Present on a shared screen</strong><small>For a TV or projector. You run the game but don’t play.</small></span></label>
        </fieldset>
        <label class="field" id="name-field"><span>Your name</span>
          <input id="h-name" maxlength="16" placeholder="First name or nickname" value="${esc(savedName())}"></label>
        <button class="btn primary big" type="submit">Create room</button>
      </form>
    </section>
  </main>`;
  $('#back').onclick = () => renderHome();
  const syncMode = () => { $('#name-field').hidden = $('input[name=mode]:checked').value === 'present'; };
  app.querySelectorAll('input[name=mode]').forEach(i => i.addEventListener('change', syncMode));
  $('#host-form').addEventListener('submit', e => {
    e.preventDefault();
    const present = $('input[name=mode]:checked').value === 'present';
    const name = $('#h-name').value.trim();
    if (!present && !name) { toast('Add your name so other players know who you are.'); $('#h-name').focus(); return; }
    createRoom(present, name);
  });
}

// ---------- create / join ----------
async function createRoom(present, name) {
  const btn = $('#host-form button[type=submit]');
  btn.disabled = true; btn.textContent = 'Creating room…';
  try {
    let code;
    for (let i = 0; i < 12; i++) {
      code = Array.from({ length: 4 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
      const existing = await S.net.get(`rooms/${code}/createdAt`);
      if (!existing || Date.now() - existing > 1000 * 60 * 60 * 24) break; // reuse day-old codes
    }
    const pid = newId();
    const t = now();
    const room = {
      createdAt: t, hostId: pid, presenter: present, gen: 1,
      phase: 'lobby', roundIdx: -1,
      settings: { rounds: [...GAME_ORDER], seconds: 45, showNames: true },
      presence: { [pid]: t },
    };
    if (!present) { room.players = { [pid]: { name: name.slice(0, 16), joinedAt: t } }; saveName(name); }
    await S.net.set(`rooms/${code}`, room);
    enterRoom(code, pid);
  } catch (e) {
    console.error(e);
    btn.disabled = false; btn.textContent = 'Create room';
    toast('Couldn’t create the room. Check your connection and try again.');
  }
}

async function joinRoom(codeRaw, nameRaw) {
  const code = (codeRaw || '').toUpperCase().trim();
  const name = (nameRaw || '').trim().slice(0, 16);
  if (code.length !== 4) return toast('Room codes are 4 letters.');
  if (!name) return toast('Add your name so other players know who you are.');
  const btn = $('#join-form button');
  btn.disabled = true; btn.textContent = 'Joining…';
  try {
    const room = await S.net.get(`rooms/${code}`);
    if (!room) { btn.disabled = false; btn.textContent = 'Join game'; return toast(`No game with code ${code}. Double-check it with your host.`); }
    const ps = players(room);
    if (ps.length >= MAX_PLAYERS) { btn.disabled = false; btn.textContent = 'Join game'; return toast('This room is full.'); }
    let final = name;
    const taken = new Set(ps.map(p => p.name.toLowerCase()));
    for (let i = 2; taken.has(final.toLowerCase()); i++) final = `${name.slice(0, 13)} ${i}`;
    const pid = newId();
    const t = now();
    await S.net.update(`rooms/${code}`, { [`players/${pid}`]: { name: final, joinedAt: t }, [`presence/${pid}`]: t });
    saveName(name);
    enterRoom(code, pid);
  } catch (e) {
    console.error(e);
    btn.disabled = false; btn.textContent = 'Join game';
    toast('Couldn’t join. Check your connection and try again.');
  }
}

function enterRoom(code, pid) {
  S.code = code; S.pid = pid; S.stageKey = null;
  sess.save(code, pid);
  const u = new URL(location.href);
  u.searchParams.set('room', code);
  history.replaceState(null, '', u);
  const beat = () => S.net.update(roomPath('presence'), { [pid]: now() }).catch(() => {});
  beat();
  S.hb = setInterval(beat, 4000);
  S.net.onDisconnectUpdate(roomPath('presence'), { [pid]: 0 });
  S.unsub = S.net.subscribe(roomPath(), room => onRoom(room));
  S.tick = setInterval(onTick, 400);
}

function stopRoom() {
  S.unsub && S.unsub(); S.unsub = null;
  clearInterval(S.hb); clearInterval(S.tick);
  S.room = null; S.code = null; S.pid = null; S.stageKey = null;
}

function leaveRoom(msg = '') {
  const { code, pid } = S;
  if (code && pid && S.room && S.room.hostId !== pid) {
    S.net.remove(`rooms/${code}/players/${pid}`).catch(() => {});
  }
  if (code && pid) S.net.update(`rooms/${code}/presence`, { [pid]: 0 }).catch(() => {});
  sess.clear();
  const u = new URL(location.href); u.searchParams.delete('room'); history.replaceState(null, '', u);
  renderHome(msg);
}

// ---------- room updates ----------
function onRoom(room) {
  if (!S.code) return;
  if (!room) { sess.clear(); return renderHome('That room has closed.'); }
  if (room.hostId !== S.pid && !room.players?.[S.pid]) { sess.clear(); return renderHome('You were removed from the room.'); }
  S.room = room;
  render();
  leaderDuties();
}

function onTick() {
  if (!S.room) return;
  renderTimer();
  renderLive();
  leaderDuties();
}

// The acting leader (host, or the earliest player if the host drops) moves the game forward.
let busy = false;
async function leaderDuties() {
  const r = S.room;
  if (!r || !amLeader() || busy || r.phase !== 'play') return;
  const round = curRound(r);
  if (!round || round.result) return;
  const subs = round.subs || {};
  const need = Object.keys(round.participants || {}).filter(id => r.players?.[id] && isOnline(r, id));
  const allIn = need.length > 0 && need.every(id => subs[id] !== undefined);
  const timeUp = now() > round.deadline + 800;
  if (allIn || timeUp) { busy = true; try { await resolveRound(r.roundIdx); } finally { busy = false; } }
}

async function resolveRound(idx) {
  await S.net.transaction(roomPath(), room => {
    if (!room) return undefined;
    const round = room.rounds?.['r' + idx];
    if (!round || round.result || room.roundIdx !== idx || room.phase !== 'play') return undefined;
    const g = GAMES[round.key];
    const subs = {};
    for (const [id, v] of Object.entries(round.subs || {})) if (room.players?.[id]) subs[id] = v;
    let result;
    if (Object.keys(subs).length < 2) {
      result = { skipped: true };
    } else {
      const res = g.resolve(round.params, subs, room.players);
      result = { pts: res.pts, out: res.out, stats: res.stats, subs };
      room.scores = room.scores || {};
      for (const [id, p] of Object.entries(res.pts)) room.scores[id] = (room.scores[id] || 0) + p;
    }
    round.result = result;
    room.phase = 'reveal';
    return room;
  });
}

async function startRound(idx) {
  const r = S.room;
  const key = r.settings.rounds[idx];
  const ids = players(r).filter(p => isOnline(r, p.id)).map(p => p.id);
  if (ids.length < 2) return toast('You need at least 2 players online to start a round.');
  const seed = Math.floor(Math.random() * 2 ** 31);
  const params = GAMES[key].makeParams(ids, rngFrom(seed));
  const t = now();
  const round = { key, seed, params, participants: Object.fromEntries(ids.map(id => [id, true])), startedAt: t, deadline: t + r.settings.seconds * 1000 };
  await S.net.update(roomPath(), { phase: 'play', roundIdx: idx, [`rounds/r${idx}`]: round });
}

async function rematch() {
  await S.net.update(roomPath(), { phase: 'lobby', roundIdx: -1, rounds: null, scores: null, gen: (S.room.gen || 1) + 1 });
}

// ---------- rendering ----------
function render() {
  const r = S.room;
  const round = curRound(r);
  const sub = round?.subs?.[S.pid];
  const key = [r.phase, r.gen, r.roundIdx, r.phase === 'play' ? (sub !== undefined ? 'in' : 'out') : '', amLeader(), isHost()].join('|');
  if (key !== S.stageKey) {
    S.stageKey = key;
    const view = { lobby: viewLobby, play: viewPlay, reveal: viewReveal, final: viewFinal }[r.phase] || viewLobby;
    app.innerHTML = `<div class="room ${r.presenter && isHost() ? 'presenter' : ''}">${topbar()}<main class="wrap">${view()}</main><div id="conn" class="conn" hidden>Reconnecting…</div></div>`;
    bindStage();
    renderConn();
  }
  renderLive();
  renderTimer();
}

function topbar() {
  const r = S.room;
  const me = r.players?.[S.pid];
  return `<header class="topbar">
    <span class="brand">Econ Lab Night</span>
    <span class="room-code" title="Room code">Room <strong>${S.code}</strong></span>
    <span class="who">${me ? esc(me.name) : 'Presenter'}</span>
    <button class="link" id="leave">${isHost() ? 'Exit' : 'Leave'}</button>
  </header>`;
}

function qrSvg(text) {
  try {
    const q = window.qrcode(0, 'M'); q.addData(text); q.make();
    return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  } catch { return ''; }
}

function viewLobby() {
  const r = S.room;
  const url = joinUrl(S.code);
  const host = isHost();
  const ctl = amLeader();
  const pres = r.presenter && host;
  return `
  <section class="lobby ${pres ? 'big' : ''}">
    <div class="invite panel">
      <p class="invite-lead">Scan the code or open the link to join</p>
      <p class="code-big" aria-label="Room code ${S.code.split('').join(' ')}">${S.code}</p>
      <div class="qr" aria-hidden="true">${qrSvg(url)}</div>
      <div class="share-row">
        <input class="share-url" readonly value="${esc(url)}" aria-label="Join link">
        <button class="btn small" id="copy-link">Copy link</button>
      </div>
    </div>
    <div class="panel">
      <h2>Players <span class="count" data-live="count"></span></h2>
      <ul class="chips" data-live="players"></ul>
      ${!host && !ctl ? `<p class="waiting">You’re in. The host will start the game.</p>` : ''}
    </div>
    ${ctl ? settingsPanel() : ''}
  </section>`;
}

function settingsPanel() {
  const st = S.room.settings;
  const takeover = !isHost() ? `<p class="flash">The host disconnected, so you’re running the game now.</p>` : '';
  return `<div class="panel settings">
    ${takeover}
    <h2>Game settings</h2>
    <fieldset><legend>Rounds</legend>
      ${GAME_ORDER.map(k => `<label class="check"><input type="checkbox" name="round" value="${k}" ${st.rounds.includes(k) ? 'checked' : ''}><span><strong>${esc(GAMES[k].title)}</strong> <small>${esc(GAMES[k].short)}</small></span></label>`).join('')}
    </fieldset>
    <div class="row">
      <label class="field inline"><span>Time per round</span>
        <select id="secs">${[30, 45, 60, 90].map(s => `<option value="${s}" ${st.seconds === s ? 'selected' : ''}>${s} seconds</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" id="names" ${st.showNames ? 'checked' : ''}><span>Show names on reveals</span></label>
    </div>
    <button class="btn primary big" id="start" data-live="start">Start game</button>
  </div>`;
}

function roundHeader(r, round) {
  const total = r.settings.rounds.length;
  const g = GAMES[round.key];
  return `<div class="round-head"><span class="round-n">Round ${r.roundIdx + 1} of ${total}</span><h2>${esc(g.title)}</h2><span class="round-sub">${esc(g.short)}</span></div>`;
}

function viewPlay() {
  const r = S.room;
  const round = curRound(r);
  const g = GAMES[round.key];
  const inRound = !!round.participants?.[S.pid];
  const sub = round.subs?.[S.pid];
  const ctx = ctxFor(r);
  let body;
  if (!amPlayer()) {
    body = `<div class="panel present-rules"><p class="brief">${esc(BRIEF[round.key])}</p><p class="muted">Decide on your phones. Answers stay hidden until the reveal.</p></div>`;
  } else if (!inRound) {
    body = `<div class="panel"><p>You joined mid-round. You’ll play from the next round.</p></div>`;
  } else if (sub !== undefined) {
    body = `<div class="panel locked"><p class="locked-title">Locked in</p><p>${esc(g.describe(sub))}.</p><button class="link" id="change">Change my answer</button></div>`;
  } else {
    body = `<div class="panel rules">${g.rules(round.params, ctx)}</div>
      <form class="panel answer" id="answer">${g.input(round.params, ctx)}<p class="err" id="err" role="alert"></p><button class="btn primary big" type="submit">Lock in</button></form>`;
  }
  return `${roundHeader(r, round)}
    <div class="timer" role="timer"><div class="timer-bar" id="timer-bar"></div><span id="timer-txt"></span></div>
    ${body}
    <div class="panel progress"><h3>Answers in <span data-live="in-count"></span></h3><ul class="chips" data-live="in-chips"></ul>
    ${amLeader() ? `<button class="btn small" id="reveal-now" data-live="reveal-now">Reveal now</button>` : ''}</div>`;
}

function ctxFor(r) {
  return { me: S.pid, name: id => (id === S.pid ? 'You' : r.settings.showNames ? nameOf(r, id) : 'A player') };
}

function leaderboard(r, round, limit = 99) {
  const ps = players(r).map(p => ({ ...p, score: r.scores?.[p.id] || 0, delta: round?.result?.pts?.[p.id] })).sort((a, b) => b.score - a.score);
  return `<ol class="board">${ps.slice(0, limit).map((p, i) => `<li class="${p.id === S.pid ? 'me' : ''}"><span class="rank">${i + 1}</span><span class="nm">${esc(p.name)}</span>${p.delta !== undefined ? `<span class="delta">+${p.delta}</span>` : ''}<span class="sc">${p.score}</span></li>`).join('')}</ol>`;
}

function viewReveal() {
  const r = S.room;
  const round = curRound(r);
  const g = GAMES[round.key];
  const res = round.result;
  const last = r.roundIdx >= r.settings.rounds.length - 1;
  const next = amLeader() ? `<button class="btn primary big" id="next">${last ? 'See final results' : 'Next round'}</button>` : `<p class="waiting">Waiting for the host to continue.</p>`;
  if (res.skipped) {
    return `${roundHeader(r, round)}<div class="panel"><p>Fewer than two answers came in, so this round didn’t count.</p></div>${next}`;
  }
  const v = g.reveal(round.params, res.subs, res, ctxFor(r));
  const mine = res.out?.[S.pid];
  return `${roundHeader(r, round)}
    ${mine ? `<div class="panel you-result"><p>${esc(mine)}</p><p class="pts">+${res.pts[S.pid]} points</p></div>` : ''}
    <figure class="panel chart-wrap">${v.chart}${v.chartNote ? `<figcaption>${esc(v.chartNote)}</figcaption>` : ''}</figure>
    <div class="takeaways">
      <div class="tk theory"><h3>Theory says</h3><p>${v.theory}</p></div>
      <div class="tk group"><h3>Your group</h3><p>${v.group}</p></div>
      <div class="tk lab"><h3>In real experiments</h3><p>${v.lab}</p></div>
    </div>
    <div class="panel"><h3>Scores</h3>${leaderboard(r, round, r.presenter && isHost() ? 8 : 99)}</div>
    ${next}`;
}

function classSummary(r) {
  const lines = [`Econ Lab Night, room ${S.code}, ${players(r).length} players`];
  r.settings.rounds.forEach((k, i) => {
    const res = r.rounds?.['r' + i]?.result;
    if (res && !res.skipped) lines.push('• ' + GAMES[k].summary(res));
  });
  return lines.join('\n');
}

function viewFinal() {
  const r = S.room;
  const ps = players(r).map(p => ({ ...p, score: r.scores?.[p.id] || 0 })).sort((a, b) => b.score - a.score);
  const podium = ps.slice(0, 3);
  const summary = classSummary(r).split('\n').slice(1);
  return `<div class="round-head"><span class="round-n">Final results</span><h2>${podium[0] ? `${esc(podium[0].name)} wins` : 'Game over'}</h2></div>
    <ol class="podium">${podium.map((p, i) => `<li class="p${i + 1} ${p.id === S.pid ? 'me' : ''}"><span class="place">${['1st', '2nd', '3rd'][i]}</span><span class="nm">${esc(p.name)}</span><span class="sc">${p.score}</span></li>`).join('')}</ol>
    <div class="panel"><h3>What your group revealed</h3><ul class="summary">${summary.map(l => `<li>${esc(l.replace(/^• /, ''))}</li>`).join('')}</ul>
      <button class="btn small" id="copy-summary">Copy summary</button></div>
    <div class="panel"><h3>Full scoreboard</h3>${leaderboard(r, null)}</div>
    ${amLeader() ? `<button class="btn primary big" id="rematch">Play again with this group</button>` : `<p class="waiting">The host can start a rematch from here.</p>`}`;
}

// live regions: re-rendered on every update without touching inputs
function renderLive() {
  const r = S.room;
  if (!r) return;
  const ps = players(r);
  const set = (k, html) => app.querySelectorAll(`[data-live="${k}"]`).forEach(el => { if (el.innerHTML !== html) el.innerHTML = html; });
  if (r.phase === 'lobby') {
    const online = ps.filter(p => isOnline(r, p.id));
    set('count', `(${online.length})`);
    set('players', ps.length ? ps.map(p => `<li class="chip ${isOnline(r, p.id) ? '' : 'off'} ${p.id === S.pid ? 'me' : ''}">${esc(p.name)}${p.id === r.hostId ? ' <small>host</small>' : ''}${isHost() && p.id !== S.pid ? ` <button class="x" data-kick="${p.id}" aria-label="Remove ${esc(p.name)}">×</button>` : ''}</li>`).join('') : '<li class="empty">Nobody yet. Share the code.</li>');
    const startBtn = $('#start');
    if (startBtn) {
      const enough = online.length >= 2;
      startBtn.disabled = !enough;
      startBtn.textContent = enough ? `Start game with ${online.length} players` : 'Waiting for at least 2 players';
    }
  }
  if (r.phase === 'play') {
    const round = curRound(r);
    const part = Object.keys(round.participants || {}).filter(id => r.players?.[id]);
    const subs = round.subs || {};
    const done = part.filter(id => subs[id] !== undefined).length;
    set('in-count', `${done} of ${part.length}`);
    set('in-chips', part.map(id => `<li class="chip ${subs[id] !== undefined ? 'done' : ''} ${isOnline(r, id) ? '' : 'off'} ${id === S.pid ? 'me' : ''}">${esc(nameOf(r, id))}</li>`).join(''));
    const rn = $('#reveal-now');
    if (rn) rn.hidden = done < 2;
  }
}

function renderTimer() {
  const r = S.room;
  const bar = $('#timer-bar'), txt = $('#timer-txt');
  if (!bar || r?.phase !== 'play') return;
  const round = curRound(r);
  const total = round.deadline - round.startedAt;
  const left = Math.max(0, round.deadline - now());
  bar.style.transform = `scaleX(${left / total})`;
  bar.classList.toggle('low', left < 10000);
  const s = Math.ceil(left / 1000);
  txt.textContent = s > 0 ? `${s}s` : 'Time’s up';
}

function renderConn() {
  const el = $('#conn');
  if (el) el.hidden = S.connected;
}

// ---------- events ----------
function bindStage() {
  const r = S.room;
  $('#leave')?.addEventListener('click', () => {
    if (confirm(isHost() ? 'Exit this room? Players can keep going without you.' : 'Leave this room?')) leaveRoom();
  });
  $('#copy-link')?.addEventListener('click', () => copy(joinUrl(S.code), 'Link copied'));
  app.querySelector('[data-live="players"]')?.addEventListener('click', e => {
    const id = e.target.closest('[data-kick]')?.dataset.kick;
    if (id && confirm(`Remove ${nameOf(S.room, id)} from the room?`)) S.net.remove(roomPath(`players/${id}`));
  });
  // settings
  const saveSettings = () => {
    const rounds = GAME_ORDER.filter(k => app.querySelector(`input[name=round][value=${k}]`)?.checked);
    if (!rounds.length) { toast('Pick at least one round.'); return false; }
    S.net.update(roomPath('settings'), { rounds, seconds: Number($('#secs').value), showNames: $('#names').checked });
    return true;
  };
  app.querySelectorAll('.settings input, .settings select').forEach(el => el.addEventListener('change', saveSettings));
  $('#start')?.addEventListener('click', async () => { if (saveSettings()) { await new Promise(res => setTimeout(res, 150)); startRound(0); } });
  // answer
  const form = $('#answer');
  if (form) {
    form.querySelectorAll('input[type=range]').forEach(inp => {
      const out = inp.closest('.slider').querySelector('.slider-out');
      const show = () => { inp.dataset.touched = '1'; out.textContent = `${out.dataset.prefix}${inp.value}${out.dataset.suffix}`; inp.closest('.slider').classList.add('touched'); };
      inp.addEventListener('input', show);
      inp.addEventListener('pointerdown', () => setTimeout(show, 0));
      inp.addEventListener('keydown', () => setTimeout(show, 0));
    });
    form.querySelectorAll('.choice-btn').forEach(b => b.addEventListener('click', () => {
      form.querySelectorAll('.choice-btn').forEach(x => x.setAttribute('aria-checked', String(x === b)));
    }));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const round = curRound(S.room);
      if (now() > round.deadline + 500) return toast('Time’s up for this round.');
      const g = GAMES[round.key];
      const v = g.read(form);
      if (v.error) { $('#err').textContent = v.error; return; }
      form.querySelector('button[type=submit]').disabled = true;
      await S.net.set(roomPath(`rounds/r${S.room.roundIdx}/subs/${S.pid}`), v.value);
    });
  }
  $('#change')?.addEventListener('click', () => {
    const round = curRound(S.room);
    if (now() > round.deadline) return toast('Time’s up for this round.');
    S.net.remove(roomPath(`rounds/r${S.room.roundIdx}/subs/${S.pid}`));
  });
  $('#reveal-now')?.addEventListener('click', () => resolveRound(S.room.roundIdx));
  $('#next')?.addEventListener('click', () => {
    const last = r.roundIdx >= r.settings.rounds.length - 1;
    if (last) S.net.update(roomPath(), { phase: 'final' }); else startRound(r.roundIdx + 1);
  });
  $('#rematch')?.addEventListener('click', rematch);
  $('#copy-summary')?.addEventListener('click', () => copy(classSummary(S.room), 'Summary copied'));
}

async function copy(text, ok) {
  try { await navigator.clipboard.writeText(text); toast(ok); }
  catch { prompt('Copy this:', text); }
}

let toastT;
function toast(msg) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 3200);
}

boot();
